/* =====================================================================
   test-contenido.js · generar-contenido.js

   Lo que se fija: el Top 3 de la fecha sale del criterio que la placa
   declara (volumen, después eficiencia), la ventana se infiere de los
   días con partidos, los nombres SOLO salen en APdeB y una salida
   anónima no deja pasar un solo nombre del libro.

   Corre sobre el snapshot de la demo —un libro real, ya anonimizado—:
   sus «JUGADOR 67» y «EQUIPO 7» hacen acá de nombres reales.
   ===================================================================== */
'use strict';

const fs = require('fs');
const NL = '\n';

let ok = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); }
};
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));
const lanza = (f) => { try { f(); return null; } catch (e) { return e.message; } };

const SGADD = require('./js/sgadd-core.js');
const DEMO = require('./js/sgadd-demo.js');
const GC = require('./generar-contenido.js');

const hojas = DEMO.rehidratar(require('./demo/datos-demo.json'));
/* La demo ya llama «JUGADOR 45» a su gente, que es justo el rótulo que
   pone la anonimización: se renombran para que una fuga se pueda ver.
   Las filas TIPO (sin número) no se tocan: son la mediana. */
Object.keys(hojas).forEach((h) => hojas[h].filas.forEach((fila) => Object.keys(fila).forEach((k) => {
  if (typeof fila[k] !== 'string') return;
  fila[k] = fila[k].replace(/JUGADOR (\d+)/g, 'PEREZ$1, JUAN').replace(/EQUIPO (\d+)/g, 'CLUB$1 ATLETICO');
})));
const idx = SGADD.construirIndice(hojas, { fase: 'REGULAR', torneo: SGADD.TORNEO_TOTAL });

/* -------------------------------------------------------------------- */
titulo('Jornadas y ventana');
{
  const js = GC.jornadas(idx);
  check('hay jornadas', js.length > 0, js.length);
  check('van en orden y no se pisan', js.every((j, i) => j.desde <= j.hasta && (!i || js[i - 1].hasta < j.desde)));
  check('dos jornadas seguidas están a más del hueco',
    js.every((j, i) => !i || (Date.parse(j.desde) - Date.parse(js[i - 1].hasta)) / 864e5 > GC.HUECO_JORNADA));
  const total = new Set();
  idx.liga.jugadorPartidos.forEach((fs2) => fs2.forEach((f) => { if (f.__fecha) total.add(f.__id); }));
  check('entre todas cubren todos los partidos con fecha',
    js.reduce((s, j) => s + j.partidos, 0) === total.size, js.reduce((s, j) => s + j.partidos, 0) + ' vs ' + total.size);

  const v = GC.ventana(idx, {});
  check('sin pedir nada, termina en el último día con partidos', v && v.hasta === js[js.length - 1].hasta);
  check('y nunca abarca más de una semana',
    (Date.parse(v.hasta) - Date.parse(v.desde)) / 864e5 + 1 <= GC.LARGO_MAXIMO, v.desde + ' a ' + v.hasta);

  const j0 = js[0];
  const r = GC.ventana(idx, { desde: j0.desde, hasta: j0.hasta });
  check('un rango pedido se respeta', r.desde === j0.desde && r.hasta === j0.hasta && r.tipo === 'rango');
  check('y su número de fecha queda marcado como inferido', r.n === 1 && r.inferida === true);
  check('`--fecha-n` pisa la inferencia', GC.ventana(idx, { desde: j0.desde, hasta: j0.hasta, fechaN: 7 }).n === 7 &&
    GC.ventana(idx, { desde: j0.desde, hasta: j0.hasta, fechaN: 7 }).inferida === false);
  check('un rango al revés se rechaza', /posterior/.test(lanza(() => GC.ventana(idx, { desde: '2026-02-02', hasta: '2026-01-01' })) || ''));
}

/* -------------------------------------------------------------------- */
titulo('El Top 3 · volumen primero, eficiencia después');
{
  const cat = GC.CATEGORIAS.find((c) => c.id === 't3');
  const f = (n, min, t3c, ppt3) => ({ NOMBRES: n, EQUIPO: 'EQUIPO 1', MIN: min, PTS: t3c * 3, T3C: t3c, PPT3: ppt3,
    __equipo: 'EQUIPO 1', __partido: 'A vs B', __fecha: new Date(2026, 0, 5) });
  const r = GC.top3([f('A', 30, 4, 1.5), f('B', 30, 8, 1.1), f('C', 30, 4, 2.0), f('D', 30, 3, 3.0), f('E', 5, 9, 3.0)], cat);
  check('gana el de más convertidos aunque rinda menos', r.puestos[0].jugador === 'B');
  check('con los mismos convertidos, el de más puntos por tiro', r.puestos[1].jugador === 'C' && r.puestos[2].jugador === 'A');
  check('el que no llega al piso de minutos no entra', !r.puestos.some((p) => p.jugador === 'E'));
  check('trae las cuatro columnas de la placa', JSON.stringify(Object.keys(r.puestos[0].stats)) === JSON.stringify(cat.cols));

  const e = GC.top3([f('A', 30, 5, 1.5), f('B', 30, 4, 1.2), f('C', 28, 3, 1.0), f('D', 35, 3, 1.0)], cat);
  check('un empate por el 3.º puesto se avisa', e.avisos.length === 1 && /empatan/.test(e.avisos[0]));
  check('y entra el de menos minutos', e.puestos[2].jugador === 'C');

  const p = GC.top3([f('A', 30, 5, 1.5), f('B', 30, 4, 1.2), f('C', 30, 0, 0)], cat);
  check('con menos de tres no se arma un ranking a medias', p.puestos.length === 0 && p.avisos.length === 1);

  check('los porcentajes salen de 0 a 100', GC.mostrar('RO%', 0.1304) === 13.04 && GC.mostrar('PPT3', 2.1818) === 2.18);
  check('un dato ausente no se vuelve cero', GC.mostrar('RO%', '') === null && GC.mostrar('PPT3', undefined) === null);
  check('«APELLIDO , NOMBRE» se limpia',
    GC.top3([f('GARCIA , JUAN', 30, 5, 1), f('B', 30, 4, 1), f('C', 30, 3, 1)], cat).puestos[0].jugador === 'GARCIA, JUAN');
}

/* -------------------------------------------------------------------- */
titulo('El paquete sobre un libro real');
const js = GC.jornadas(idx);
const jor = js.slice().sort((a, b) => b.partidos - a.partidos)[0];
const pq = GC.paquete(idx, { torneo: 'TORNEO DE PRUEBA', zona: 'ZONA X', desde: jor.desde, hasta: jor.hasta });
{
  check('sale', pq.ok === true, (pq.avisos || []).join(' '));
  const placas = pq.stories.placas;
  check('portada + cinco rankings + cierre', placas.length === 7 && placas[0].tipo === 'portada' && placas[6].tipo === 'cierre');
  check('la portada lista las cinco categorías', placas[0].categorias.length === 5);
  const rk = placas.filter((p) => p.tipo === 'ranking');
  check('cada ranking trae tres puestos o su aviso', rk.every((r) => r.puestos.length === 3 || r.avisos.length));
  const enRango = rk.every((r) => r.puestos.every((x) => x.fecha >= jor.desde && x.fecha <= jor.hasta));
  check('todos los puestos son de partidos de la ventana', enRango);
  check('nadie entra con menos del piso de minutos', rk.every((r) => r.puestos.every((x) => x.stats.MIN >= GC.PISO_MINUTOS)));
  check('el orden de cada ranking respeta su criterio', rk.every((r) => {
    const c = GC.CATEGORIAS.find((k) => k.id === r.id);
    return r.puestos.every((x, i) => !i || r.puestos[i - 1].stats[c.orden[0]] >= x.stats[c.orden[0]]);
  }));
  check('el cierre arma el quinteto con los ganadores', placas[6].quintetoIdeal.length === rk.filter((r) => r.puestos.length).length);
  check('el número de fecha inferido se avisa', pq.avisos.some((a) => /se infirió/.test(a)));

  const f = pq.feed;
  check('propone un posteo de feed', !!f.posteo && f.elegida === f.posteo.id);
  check('con cinco slides', f.posteo.slides.length === 5);
  check('es el de mayor contraste', f.alternativas.every((a) => a.contraste <= f.posteo.contraste));
  check('el Top 3 de la noche trae su temporada', f.posteo.slides[2].tabla.length === 3 &&
    f.posteo.slides[2].tabla.every((t) => t.temporada && typeof t.temporada.pj === 'number'));
  check('el fondo de eficiencia va sin nombre', f.posteo.slides[3].menosEficientes.every((m) => /^Caso \d$/.test(m.jugador) && m.equipo === null));
  check('`feed` elige la categoría', GC.paquete(idx, { desde: jor.desde, hasta: jor.hasta, feed: 'ro' }).feed.elegida === 'FEED-RO');
  check('una categoría que no existe se avisa y no rompe',
    GC.paquete(idx, { desde: jor.desde, hasta: jor.hasta, feed: 'zzz' }).avisos.some((a) => /no existe/.test(a)));
  check('una ventana sin partidos no inventa nada', GC.paquete(idx, { desde: '1999-01-01', hasta: '1999-01-02' }).ok === false);
  check('el resumen se arma', /## Stories/.test(GC.resumen(pq)) && /## Feed/.test(GC.resumen(pq)));
}

/* -------------------------------------------------------------------- */
titulo('Los nombres solo salen en APdeB');
{
  const nombres = GC.nombresDelLibro(idx);
  check('el libro tiene nombres que cuidar', nombres.jugadores.length > 100 && nombres.equipos.length > 10);
  check('la salida con nombres NO pasa la verificación', /todavía nombra/.test(lanza(() => GC.verificarAnonimo(pq, nombres)) || ''));

  const an = GC.anonimizar(pq);
  check('la anónima sí', lanza(() => GC.verificarAnonimo(an, nombres)) === null, lanza(() => GC.verificarAnonimo(an, nombres)));
  check('queda marcada', an.anonimo === true);
  const rk = an.stories.placas.filter((p) => p.tipo === 'ranking');
  check('jugadores y equipos pasan a rótulos', rk.every((r) => r.puestos.every((x) => /^Jugador \d+$/.test(x.jugador) && /^Equipo [A-Z]+$/.test(x.equipo))));
  check('no viaja el texto del partido ni la clave del equipo', rk.every((r) => r.puestos.every((x) => !('partido' in x) && !('equipoClave' in x))));
  const original = pq.stories.placas.filter((p) => p.tipo === 'ranking');
  check('los números no se tocan', rk.every((r, i) => JSON.stringify(r.puestos.map((x) => x.stats)) === JSON.stringify(original[i].puestos.map((x) => x.stats))));
  const mapa = {};
  let estable = true;
  original.forEach((r, i) => r.puestos.forEach((x, k) => {
    const a = rk[i].puestos[k].jugador;
    if (mapa[x.jugador + '|' + x.equipoClave] === undefined) mapa[x.jugador + '|' + x.equipoClave] = a;
  }));
  original.forEach((r, i) => r.puestos.forEach((x, k) => { if (x.jugador && mapa[x.jugador + '|' + x.equipoClave] === undefined) estable = false; }));
  check('el mismo jugador lleva el mismo rótulo en todo el paquete', estable &&
    JSON.stringify(an.stories.placas[6].quintetoIdeal.map((q) => q.jugador)) === JSON.stringify(rk.filter((r) => r.puestos.length).map((r) => r.puestos[0].jugador)));
  check('la original no se modificó', original[0].puestos[0].equipoClave !== undefined);

  check('apb sale con nombres', GC.resolverPedido({ liga: 'apb', zona: 'a' }).conNombres === true);
  check('apb se puede anonimizar a pedido', GC.resolverPedido({ liga: 'apb', zona: 'a', anonimo: true }).conNombres === false);
  check('lnb sale anónima', GC.resolverPedido({ liga: 'lnb' }).conNombres === false);
  check('lab sale anónima', GC.resolverPedido({ liga: 'lab', zona: 'norte' }).conNombres === false);
  check('`--con-nombres` en lnb se rechaza', /solo vale para APdeB/.test(lanza(() => GC.resolverPedido({ liga: 'lnb', 'con-nombres': true })) || ''));
  check('`--con-nombres` en lab se rechaza', /solo vale para APdeB/.test(lanza(() => GC.resolverPedido({ liga: 'lab', zona: 'sur', 'con-nombres': true })) || ''));
  check('una liga desconocida se rechaza', /--liga/.test(lanza(() => GC.resolverPedido({ liga: 'nba' })) || ''));
  check('apb sin zona se rechaza', /--zona/.test(lanza(() => GC.resolverPedido({ liga: 'apb' })) || ''));
  check('solo APdeB permite nombres', Object.keys(GC.LIGAS).filter((k) => GC.LIGAS[k].nombres).join() === 'apb');
  const cats = [];
  Object.keys(GC.LIGAS).forEach((l) => Object.keys(GC.LIGAS[l].zonas).forEach((z) => cats.push(GC.LIGAS[l].zonas[z].categoria)));
  check('ninguna zona declarada es de formativas', cats.every((c) => !/u\d{2}|formativ/i.test(c)), cats.join());
}

/* -------------------------------------------------------------------- */
titulo('Nivel 2 · las seis recetas de libro');
const n2 = GC.nivel2(idx, [], { torneo: 'TORNEO DE PRUEBA', nivel: 'LIGA_ARGENTINA' });
const pieza = (id, de) => (de || n2).piezas.find((p) => p.id === id);
{
  check('están las diez piezas de la matriz',
    Object.keys(GC.RECETAS).join() === 'CR-01,CR-02,CR-03,CR-04,CR-05,CR-06,RL-01,RL-02,RL-03,RL-04');
  check('sin pedir ninguna salen las diez', n2.piezas.length === 10);
  check('cada pieza sale con su dato o con su motivo',
    n2.piezas.every((p) => (p.ok === true && typeof p.dato === 'string' && p.guion.length >= 3) || (p.ok === false && p.avisos.length === 1)));
  check('las de play-by-play sin paquetes lo dicen', ['RL-01', 'RL-02', 'RL-03', 'RL-04'].every((id) => pieza(id).ok === false && /play-by-play/.test(pieza(id).avisos[0])));
  check('una pieza que no existe se avisa y no rompe', GC.nivel2(idx, [], { piezas: ['CR-99'] }).piezas[0].ok === false);
  check('`piezas` acota', GC.nivel2(idx, [], { piezas: ['CR-01', 'CR-04'] }).piezas.map((p) => p.id).join() === 'CR-01,CR-04');
  check('sin libro las de libro lo dicen', GC.nivel2(null, [], { piezas: ['CR-01'] }).piezas[0].ok === false);

  const c1 = pieza('CR-01');
  check('CR-01 sale', c1.ok, (c1.avisos || []).join());
  const eqs = idx.lista().length;
  check('CR-01 · cuenta todos los equipos', c1.datos.equipos === eqs);
  check('CR-01 · top 3 y bottom 3', c1.datos.top3.length === 3 && c1.datos.bottom3.length === 3);
  check('CR-01 · el top va 1, 2, 3 por posesión', c1.datos.top3.map((x) => x.puestoPorPosesion).join() === '1,2,3');
  check('CR-01 · por posesión el rating es mayor que por jugada (hay rebotes ofensivos)',
    c1.datos.top3.concat(c1.datos.bottom3).every((x) => x.ortgPorPosesion > x.ortgPorJugada));
  /* El número se recalcula acá, sin la receta: si alguien cambia la
     fórmula, esto lo canta. */
  const propio = idx.lista().map((e) => ({ j: e.totales.propio.PTS / e.totales.propio.PLAYS, p: e.factores['RTNG OFF'] }));
  const rk = (k) => propio.slice().sort((a, b) => b[k] - a[k]);
  const cambian = propio.filter((x) => rk('j').indexOf(x) !== rk('p').indexOf(x)).length;
  check('CR-01 · los que cambian de puesto coinciden con la cuenta a mano', c1.datos.cambian === cambian, c1.datos.cambian + ' vs ' + cambian);

  const c2 = pieza('CR-02');
  check('CR-02 sale', c2.ok, (c2.avisos || []).join());
  check('CR-02 · los casos tienen el triple como vía más cara',
    c2.datos.casos.length > 0 && c2.datos.casos.every((x) => x.puntosPorTriple >= (x.puntosPorDoble || 0)));
  check('CR-02 · ningún caso tira menos de 3 triples por partido', GC.PISO_TRIPLES_CASO === 3 && c2.datos.casos.every((x) => x.triplesIntentados >= 3),
    c2.datos.casos.map((x) => x.triplesIntentados).join());
  check('CR-02 · y van de mayor a menor renta', c2.datos.casos.every((x, i, a) => !i || a[i - 1].puntosPorTriple >= x.puntosPorTriple));
  check('CR-02 · los escondidos no superan a los rentables', c2.datos.bajoLaMedianaDePuntos <= c2.datos.rentables);

  const c3 = pieza('CR-03');
  check('CR-03 sale', c3.ok, (c3.avisos || []).join());
  check('CR-03 · el universo es más grande que los rentables', c3.datos.evaluados > c3.datos.rentables);
  check('CR-03 · el caso rentable tira menos de 58 % de libres', !c3.datos.casoRentable || c3.datos.casoRentable.libres < 58);
  check('CR-03 · la cuenta es dos libres', !c3.datos.casoRentable ||
    Math.abs(c3.datos.casoRentable.puntosPorAccionCortada - 2 * c3.datos.casoRentable.libres / 100) < 0.011);

  const c4 = pieza('CR-04');
  check('CR-04 sale', c4.ok, (c4.avisos || []).join());
  check('CR-04 · tres varas con su percentil', c4.datos.varas.length === 3 && c4.datos.varas.every((v) => v.percentilEnEstaLiga >= 0 && v.percentilEnEstaLiga <= 100));
  check('CR-04 · trae el equivalente por nivel del registro', c4.datos.varas.every((v) => v.equivalentePorNivel && typeof v.equivalentePorNivel.LIGA_ARGENTINA === 'number'));
  check('CR-04 · declara el nivel', c4.datos.nivel === 'LIGA_ARGENTINA');

  const c5 = pieza('CR-05');
  check('CR-05 · sale con caso o dice que no lo hay', c5.ok ? /^\d-\d$/.test(c5.datos.caso.record) : /ciclo|caso/.test(c5.avisos[0]));
  if (c5.ok) {
    check('CR-05 · el caso viene ganando', Number(c5.datos.caso.record[0]) >= 3);
    check('CR-05 · y su eFG% bajó', c5.datos.caso.efgActual < c5.datos.caso.efgAnterior);
    check('CR-05 · con su puesto en la liga', c5.datos.caso.puestoNet >= 1 && c5.datos.caso.puestoNet <= c5.datos.caso.de);
  }

  const c6 = pieza('CR-06');
  check('CR-06 · sale con candidatos o dice que no los hay', c6.ok ? c6.datos.candidatos.length === 3 : /afines|calificados/.test(c6.avisos[0]));
  if (c6.ok) {
    check('CR-06 · los candidatos pasan el piso de afinidad', c6.datos.candidatos.every((x) => x.coincidencia >= 60));
    check('CR-06 · ninguno es del equipo del modelo', c6.datos.candidatos.every((x) => x.equipo !== c6.datos.modelo.equipo));
    check('CR-06 · van de mayor a menor coincidencia', c6.datos.candidatos.every((x, i, a) => !i || a[i - 1].coincidencia >= x.coincidencia));
  }
}

/* -------------------------------------------------------------------- */
titulo('Nivel 2 · las cuatro recetas de play-by-play');
/* Paquetes de mentira, con la forma de `analitica-pbp-web@3`. */
const paq = (n) => ({
  esquema: 'motorstats-ingestion/analitica-pbp-web@3', equipo: 'ATLETICO ' + n,
  jugadores: { ['1' + n]: { n: 'GOMEZ' + n + ', LUIS', d: '4' }, ['2' + n]: { n: 'RUIZ' + n + ', ANA', d: '5' } },
  quintetos: [
    { ids: [], min: 40, pj: 9, mm: 12 + n, net: -1.5, netPos: 4 + n, ok: true },
    { ids: [], min: 30, pj: 8, mm: -6, net: -3, netPos: -2, ok: true },
    { ids: [], min: 5, pj: 2, mm: 30, net: -9, netPos: 9, ok: true },
  ],
  clutch: { equipo: { partidos: 6, ganados: 4, perdidos: 2 },
    jugadores: [{ id: n % 2 ? '1' + n : '2' + n, usos: 20, porc: 30 + n, efg: 50 }, { id: n % 2 ? '2' + n : '1' + n, usos: 9, porc: 12, efg: 40 }] },
  tiros: { detalle: { jugadores: [{ id: '1' + n, i: 300 }, { id: '2' + n, i: 120 }] } },
  cuartos: [{ periodo: '1', dif: 1 }, { periodo: '2', dif: n < 5 ? -3 : 2 }, { periodo: '3', dif: 0.5 }, { periodo: '4', dif: n < 5 ? 1 : -4 }, { periodo: 'OT', dif: -9 }],
  momentum: { partidos: 10, corridas8Contra: 12 + n, topContra: [{ pts: 14 + n, periodo: 2, periodoFin: 3, rival: 'RIVAL SECRETO', fecha: '2026-01-01' }] },
  liga: { total: { i: 5000, c: 2300, pct: 46, ppt: 1.05 },
    familias: { aro: { i: 1500, pct: 60, ppt: 1.2 }, corta: { i: 600, pct: 40, ppt: 0.8 }, mediaFrontal: { i: 300, pct: 38, ppt: 0.76 },
      mediaLateral: { i: 50, pct: 30, ppt: 0.6 }, tripleFrontal: { i: 900, pct: 33, ppt: 0.99 }, tripleLateral: { i: 1100, pct: 35, ppt: 1.05 }, tripleEsquina: { i: 550, pct: 40, ppt: 1.2 } },
    zonas: [{ zona: 'Z1', i: 1500, pct: 60, ppt: 1.2 }, { zona: 'Z7', i: 300, pct: 38, ppt: 0.76 }, { zona: 'FRANJA-INFERIOR', i: 400, pct: 50, ppt: 2 }] },
});
const paqs = [1, 2, 3, 4, 5, 6, 7, 8].map(paq);
const r2 = GC.nivel2(null, paqs, { piezas: ['RL-01', 'RL-02', 'RL-03', 'RL-04'] });
{
  const r1 = pieza('RL-01', r2);
  check('RL-01 sale', r1.ok, (r1.avisos || []).join());
  check('RL-01 · el quinteto de 5 minutos no cuenta', r1.datos.quintetos === 16);
  check('RL-01 · cuenta los que ganan y dan negativo por jugada', r1.datos.ganaYDaNegativo === 8);
  check('RL-01 · el caso es el de mayor salto entre jugada y posesión', r1.datos.caso.netPorPosesion === 12 && r1.datos.caso.enCancha === 20);
  const sinCaso = GC.nivel2(null, paqs.map((p) => Object.assign({}, p, { quintetos: p.quintetos.map((q) => Object.assign({}, q, { net: 5, netPos: 6 })) })), { piezas: ['RL-01'] }).piezas[0];
  check('RL-01 · sin ningún quinteto que cambie de lectura, no inventa un caso', sinCaso.ok === false);

  const c = pieza('RL-02', r2);
  check('RL-02 sale', c.ok, (c.avisos || []).join());
  check('RL-02 · cuenta los equipos donde cambia el jugador', c.datos.equipos === 8 && c.datos.cambiaElJugador === 4);
  check('RL-02 · el caso es de un equipo donde cambia', c.datos.caso.mismoJugador === false);
  check('RL-02 · con pocos cierres ajustados no opina',
    GC.nivel2(null, paqs.map((p) => Object.assign({}, p, { clutch: Object.assign({}, p.clutch, { equipo: { partidos: 2, ganados: 1, perdidos: 1 } }) })), { piezas: ['RL-02'] }).piezas[0].ok === false);

  const z = pieza('RL-03', r2);
  check('RL-03 sale', z.ok, (z.avisos || []).join());
  check('RL-03 · la familia con menos de 100 tiros no entra', z.datos.familias.length === 6 && !z.datos.familias.some((f) => f.zona === 'Media lateral'));
  check('RL-03 · van de la más cara a la más barata', z.datos.familias.every((f, i, a) => !i || a[i - 1].puntosPorTiro >= f.puntosPorTiro));
  check('RL-03 · las franjas fuera de las 14 zonas no entran', z.datos.zonas.length === 2);
  check('RL-03 · el dato cita la muestra', /5000 tiros/.test(z.dato));

  const m = pieza('RL-04', r2);
  check('RL-04 sale', m.ok, (m.avisos || []).join());
  check('RL-04 · el suplementario no es un cuarto', m.datos.peorCuartoPorEquipo.length === 4);
  check('RL-04 · reparte el peor cuarto de cada equipo',
    m.datos.peorCuartoPorEquipo.map((x) => x.equipos).join() === '0,4,0,4');
  check('RL-04 · el mayor parcial en contra es el más grande de la liga', m.datos.mayorParcialEnContra.puntos === 22);
  check('RL-04 · el titular es el parcial extremo', /22-0/.test(m.titulo) && /22-0/.test(m.dato), m.titulo);
  check('RL-04 · dice entre qué cuartos fue', m.datos.mayorParcialEnContra.cuartoDeInicio === 2 && m.datos.mayorParcialEnContra.cuartoDeFin === 3 && /entre el 2/.test(m.dato));
  check('RL-04 · y no arrastra el rival ni la fecha', !('rival' in m.datos.mayorParcialEnContra) && !('fecha' in m.datos.mayorParcialEnContra));

  check('las piezas de play-by-play dicen de qué competencia son', r2.piezas.every((p) => !p.ok || 'competencia' in p.muestra));
  const prestado = GC.nivel2(null, paqs.map((p) => Object.assign({ competencia: 'Liga de Prueba' }, p)), { piezas: ['RL-03'], pbp: { origen: 'otra-liga', prestado: true } });
  check('con play-by-play prestado, la pieza lo avisa con el nombre de la competencia',
    prestado.piezas[0].ok && /Liga de Prueba/.test(prestado.piezas[0].avisos[0]) && prestado.meta.pbp.prestado === true);
  check('con el propio, no avisa nada', !pieza('RL-03', r2).avisos);
  const os = require('os'), pth = require('path');
  const base = fs.mkdtempSync(pth.join(os.tmpdir(), 'gc-'));
  const previo = process.env.MOTORSTATS_INGESTION;
  process.env.MOTORSTATS_INGESTION = base;
  fs.mkdirSync(pth.join(base, 'salida', GC.PBP_DE_RESPALDO[1], 'web'), { recursive: true });
  fs.writeFileSync(pth.join(base, 'salida', GC.PBP_DE_RESPALDO[1], 'web', 'uno.json'), JSON.stringify(paqs[0]));
  const sinPropio = GC.paquetesPara({}, { pbp: null });
  check('una liga sin play-by-play toma el de respaldo que exista', sinPropio.prestado === true && sinPropio.origen === GC.PBP_DE_RESPALDO[1] && sinPropio.paqs.length === 1);
  fs.mkdirSync(pth.join(base, 'salida', 'propia', 'web'), { recursive: true });
  fs.writeFileSync(pth.join(base, 'salida', 'propia', 'web', 'dos.json'), JSON.stringify(paqs[1]));
  const conPropio = GC.paquetesPara({}, { pbp: 'propia' });
  check('una liga con el suyo usa el suyo', conPropio.prestado === false && conPropio.origen === 'propia' && conPropio.paqs[0].equipo === paqs[1].equipo);
  check('`--pbp` explícito no cae al respaldo', GC.paquetesPara({ pbp: pth.join(base, 'no-hay') }, { pbp: null }).paqs.length === 0);
  if (previo === undefined) delete process.env.MOTORSTATS_INGESTION; else process.env.MOTORSTATS_INGESTION = previo;
  fs.rmSync(base, { recursive: true, force: true });
  check('lee paquetes de una carpeta que no existe sin romper', GC.leerPaquetes('./no-existe-esta-carpeta').length === 0);
}

/* -------------------------------------------------------------------- */
titulo('Nivel 2 · sale anónimo');
{
  const libro = GC.nombresDelLibro(idx), pbp = GC.nombresDePaquetes(paqs);
  const todos = { jugadores: libro.jugadores.concat(pbp.jugadores), equipos: libro.equipos.concat(pbp.equipos) };
  check('los paquetes aportan sus nombres a la guarda', pbp.equipos.length === 8 && pbp.jugadores.length === 16);

  check('las piezas de libro, tal como salen, nombran a alguien', /todavía nombra/.test(lanza(() => GC.verificarAnonimo(n2, todos)) || ''));
  const a1 = GC.anonimizar(n2);
  check('anonimizadas, no', lanza(() => GC.verificarAnonimo(a1, todos)) === null, lanza(() => GC.verificarAnonimo(a1, todos)));
  check('las de play-by-play, tal como salen, nombran al equipo', /todavía nombra/.test(lanza(() => GC.verificarAnonimo(r2, todos)) || ''));
  const a2 = GC.anonimizar(r2);
  check('anonimizadas, no', lanza(() => GC.verificarAnonimo(a2, todos)) === null, lanza(() => GC.verificarAnonimo(a2, todos)));
  check('quedan marcadas', a1.anonimo === true && a2.anonimo === true);
  check('los números no se tocan', JSON.stringify(pieza('CR-01', a1).datos.top3.map((x) => x.ortgPorPosesion)) === JSON.stringify(pieza('CR-01').datos.top3.map((x) => x.ortgPorPosesion)));
  check('ningún `dato` lleva un nombre',
    n2.piezas.concat(r2.piezas).filter((p) => p.ok).every((p) => lanza(() => GC.verificarAnonimo({ dato: p.dato }, todos)) === null));
  check('un valor nulo no se convierte en un rótulo', GC.anonimizar({ equipo: null, jugador: null }).equipo === null);
  check('el resumen se arma', /## CR-01/.test(GC.resumenNivel2(a1)) && /sin datos/.test(GC.resumenNivel2(a1)));

  const src = fs.readFileSync('generar-contenido.js', 'utf8');
  const cuerpo = src.slice(src.indexOf('function escribirNivel2'), src.indexOf('if (require.main === module)'));
  check('el Nivel 2 solo sale con nombres si la liga los permite Y se pidió', /p\.liga\.nombres && !!args\['con-nombres'\]/.test(cuerpo));
  check('y si no, se anonimiza', cuerpo.replace(/\s+/g, ' ').indexOf('if (!conNombres) { n2 = anonimizar(n2);') !== -1);
  check('y si no, pasa por la verificación antes de escribir', cuerpo.indexOf('verificarAnonimo(') !== -1 && cuerpo.indexOf('verificarAnonimo(') < cuerpo.indexOf('writeFileSync'));
  check('la carpeta de paquetes sale de la zona o de `--pbp`', GC.carpetaPbp({}, { pbp: null }) === null &&
    /lnb-2026-27/.test(GC.carpetaPbp({}, GC.LIGAS.lnb.zonas.unica)) && /mi-carpeta/.test(GC.carpetaPbp({ pbp: 'mi-carpeta' }, {})));
}

/* -------------------------------------------------------------------- */
titulo('El repo');
{
  const gi = fs.readFileSync('.gitignore', 'utf8');
  check('la carpeta de salida está en .gitignore', /^contenido\/\s*$/m.test(gi));
  const src = fs.readFileSync('generar-contenido.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check('el script no trae un sheetId escrito', !/[A-Za-z0-9_-]{40,}/.test(src));
  check('la escritura pasa por la verificación de anonimato', /anonimizar\(pq\);\s*verificarAnonimo\(/.test(src));
}

console.log(NL + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
