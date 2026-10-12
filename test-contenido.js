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
