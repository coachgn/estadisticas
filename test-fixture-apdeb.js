/* =====================================================================
   test-fixture-apdeb.js · el conector de apdeb.com.ar (punto 71).

     node test-fixture-apdeb.js

   LAS FIXTURES SON MARKUP REAL, recortado de las páginas de apdeb el
   2026-09-25 y conservado byte a byte (`test-fixtures/apdeb/*.html`). Se
   eligieron las filas que cubren cada caso —programado, «a reprogramar»,
   suspendido, jugado, sin marcador, de otra temporada, y las tres formas de
   la columna de categorías— sin tocar el HTML.

   El sitio es de tablas sin clases, así que el parser NO cuenta columnas:
   busca la celda que dice `vs` y lee alrededor. El test lo ejercita con las
   tres formas de página que publican.
   ===================================================================== */
'use strict';

const fs = require('fs');
const F = require('./server/lib/fixture-fuentes.js');
const API = require('./server/api/fixture.js');
const CORE = require('./js/sgadd-core.js');

let ok = 0, mal = 0;
function check(n, cond, det) {
  if (cond) { ok++; console.log('  ✓ ' + n); }
  else { mal++; console.log('  ✗ ' + n + (det !== undefined ? '  → ' + JSON.stringify(det) : '')); }
}
function seccion(t) { console.log('\n' + t); }

const H = {};
['sub23-programacion', 'sub23-resultados', 'sub23-fixtures', 'menores-programacion'].forEach((f) => {
  H[f] = fs.readFileSync('test-fixtures/apdeb/' + f + '.html', 'utf8');
});
const DOC = JSON.parse(fs.readFileSync('torneos/apb-2026-formativas.json', 'utf8'));
const HOY = '2026-09-25';

/* =====================================================================
   1 · La programación de Sub-23
   ===================================================================== */
seccion('1 · apdeb · programación');
{
  const r = F.parsearApdeb(H['sub23-programacion'], { hoy: HOY, zona: 'u23' });
  check('lee los partidos', r.partidos.length >= 4, r.partidos.length);
  check('sin avisos sobre markup conocido', r.avisos.length === 0, r.avisos);
  check('todos con los dos equipos', r.partidos.every(p => p.local && p.visitante));
  check('ninguno se enfrenta a sí mismo', r.partidos.every(p => p.local !== p.visitante));
  check('ninguno tiene marcador: son por jugarse', r.partidos.every(p => p.ptsLocal === null));

  const prog = r.partidos.filter(p => p.estado === 'PROGRAMADO');
  check('los programados traen fecha y hora',
    prog.length > 0 && prog.every(p => /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) && /^\d{2}:\d{2}$/.test(p.hora || '')),
    prog.map(p => p.fecha + ' ' + p.hora));

  /* «A Reprogramar» y «SUSPENDIDO» son estados que basket-club no tiene y
     apdeb sí. El partido entra SIN FECHA, porque no la tiene: es
     información —ese cruce está pendiente— y descartarlo dejaría el fixture
     incompleto. */
  const sinFecha = r.partidos.filter(p => !p.fecha);
  check('los que no tienen fecha entran igual', sinFecha.length > 0);
  check('y NO quedan como programados', sinFecha.every(p => p.estado !== 'PROGRAMADO'),
    sinFecha.map(p => p.estado + ':' + p.estadoTexto));
  check('«A Reprogramar» conserva su texto',
    r.partidos.some(p => /reprogramar/i.test(p.estadoTexto || '')), r.partidos.map(p => p.estadoTexto));
  check('«SUSPENDIDO» se reconoce como tal',
    r.partidos.some(p => p.estado === 'SUSPENDIDO'), r.partidos.map(p => p.estado));
  /* LOS SIN FECHA VAN AL FINAL: no se pueden ordenar por algo que no
     tienen, y arriba taparían lo que sí está programado. Se exige que HAYA
     de los dos tipos, o el test no prueba el orden. */
  const conF = r.partidos.filter(p => p.fecha).length;
  const sinF = r.partidos.filter(p => !p.fecha).length;
  check('la fixture tiene partidos con y sin fecha', conF > 0 && sinF > 0, { conF: conF, sinF: sinF });
  const iPrimerSinFecha = r.partidos.findIndex(p => !p.fecha);
  check('y todos los sin fecha quedan después de los que la tienen',
    iPrimerSinFecha === conF && r.partidos.slice(iPrimerSinFecha).every(p => !p.fecha),
    r.partidos.map(p => p.fecha || 'SIN'));
/* El guard de `ordenar` que manda los sin fecha al final es EXPLÍCITO a
     propósito y no está cubierto por este test: hoy el parser emite
     `fecha: null`, y `String(null)` da «null», que por alfabeto ya cae
     después de cualquier «2026-…». O sea que quitarlo no cambiaría nada
     HOY. Se deja porque la propiedad no debería depender de que la letra
     «n» sea mayor que un dígito. */
  check('apdeb no publica transmisión: el campo va vacío, no inventado',
    r.partidos.every(p => Array.isArray(p.transmision) && !p.transmision.length));
}

/* =====================================================================
   2 · Los resultados de Sub-23
   ===================================================================== */
seccion('2 · apdeb · resultados');
{
  const r = F.parsearApdeb(H['sub23-resultados'], { hoy: HOY, zona: 'u23' });
  check('lee los partidos', r.partidos.length >= 4, r.partidos.length);
  const jug = r.partidos.filter(p => p.ptsLocal != null);
  check('los jugados traen los DOS marcadores', jug.length > 0
    && jug.every(p => Number.isFinite(p.ptsLocal) && Number.isFinite(p.ptsVisitante)));
  check('y quedan finalizados', jug.every(p => p.estado === 'FINALIZADO'));
  /* CON UNA SOLA CELDA NUMÉRICA NO HAY RESULTADO: el sitio deja el marcador
     vacío en los que no cargó. Se CUENTAN los que quedan sin marcador: con
     un `every` sobre los filtrados, relajar la regla a «una celda alcanza»
     los sacaba del filtro y el test pasaba igual. */
  const sinM = r.partidos.filter(p => p.ptsLocal === null);
  check('los que no tienen marcador quedan sin marcador', sinM.length >= 2,
    { sinMarcador: sinM.length, total: r.partidos.length });
  check('con los dos lados vacíos, no medio cargado',
    sinM.every(p => p.ptsLocal === null && p.ptsVisitante === null));
  check('y no quedan como finalizados', sinM.every(p => p.estado !== 'FINALIZADO'),
    sinM.map(p => p.estado));
  /* EL CASO QUE LO EJERCE: la misma fila con las DOS celdas del marcador y
     con UNA sola. Con la regla relajada, la segunda saldria «jugado 74-null»,
     y un marcador a medias en la pantalla es peor que ninguno. */
  const fila = (a2, b2) => '<table><tr>'
    + '<td><div align="center">26/09/2026</div></td>'
    + '<td><div align="center">' + a2 + '</div></td>'
    + '<td><div align="center">RECONQUISTA</div></td>'
    + '<td><div align="center">vs</div></td>'
    + '<td><div align="center">GONNET</div></td>'
    + '<td><div align="center">' + b2 + '</div></td>'
    + '</tr></table>';
  const dos = F.parsearApdeb(fila('74', '68'), { hoy: HOY }).partidos[0];
  check('con las dos celdas, el partido queda jugado',
    dos && dos.ptsLocal === 74 && dos.ptsVisitante === 68 && dos.estado === 'FINALIZADO',
    dos && [dos.ptsLocal, dos.ptsVisitante, dos.estado]);
  const una = F.parsearApdeb(fila('74', ''), { hoy: HOY }).partidos[0];
  check('con UNA sola, el partido NO queda jugado',
    una && una.ptsLocal === null && una.ptsVisitante === null && una.estado !== 'FINALIZADO',
    una && [una.ptsLocal, una.ptsVisitante, una.estado]);
  const otra = F.parsearApdeb(fila('', '68'), { hoy: HOY }).partidos[0];
  check('y tampoco al reves', otra && otra.ptsLocal === null && otra.ptsVisitante === null,
    otra && [otra.ptsLocal, otra.ptsVisitante]);
}

/* =====================================================================
   3 · Una fila, VARIAS categorías
   ===================================================================== */
seccion('3 · el filtro por categoría');
{
  /* En menores el mismo cruce de clubes juega U15, U17 y U21 el mismo día:
     la celda dice `U15 - U17 - U21`. */
  check('lee las categorías de una celda',
    F.categoriasDe('U15 - U17 - U21').join(',') === '15,17,21');
  check('y las de «U17 y U21»', F.categoriasDe('U17 y U21').join(',') === '17,21');
  check('una celda sin categorías da vacío', F.categoriasDe('RECONQUISTA') .length === 0
    && F.categoriasDe('').length === 0);

  const todas = F.parsearApdeb(H['menores-programacion'], { hoy: HOY, zona: 'u21' });
  const u21 = F.parsearApdeb(H['menores-programacion'], { hoy: HOY, zona: 'u21', categoria: 'U21' });
  check('sin categoría entran todas las filas', todas.partidos.length > u21.partidos.length,
    { todas: todas.partidos.length, u21: u21.partidos.length });
  check('con U21 quedan solo las que la mencionan',
    u21.partidos.every(p => p.categorias && p.categorias.indexOf(21) !== -1),
    u21.partidos.map(p => p.categorias));
  check('el partido se emite UNA vez, no una por categoría', (() => {
    const v = {};
    return u21.partidos.every((p) => {
      const k = p.fecha + '|' + p.local + '|' + p.visitante;
      if (v[k]) return false; v[k] = 1; return true;
    });
  })());
  /* UNA FILA SIN RÓTULO NO SE ATRIBUYE: en una página multi-categoría,
     meterla en U21 sería inventar. Se construye el caso vaciando la celda
     de categorías de una fila REAL, porque en la página todas la traen y
     sin eso el test no ejercía nada. */
  const filaU21 = H['menores-programacion'].match(/<tr[^>]*>[\s\S]*?<\/tr>/g)
    .filter(f => /U\s?-?21/.test(f))[0];
  check('la fixture trae una fila de U21', !!filaU21);
  const sinRotulo = filaU21.replace(/U\s*-?\s*15\s*-?\s*|U\s*-?\s*17\s*(y|-)?\s*|U\s*-?\s*21/g, '');
  const conU21 = F.parsearApdeb('<table>' + filaU21 + '</table>', { hoy: HOY, categoria: 'U21' });
  const sinCat = F.parsearApdeb('<table>' + sinRotulo + '</table>', { hoy: HOY, categoria: 'U21' });
  check('la fila rotulada U21 entra', conU21.partidos.length === 1, conU21.partidos.length);
  check('y la MISMA fila sin rótulo NO entra al filtrar', sinCat.partidos.length === 0,
    sinCat.partidos.map(p => p.local + ' vs ' + p.visitante + ' cats ' + p.categorias));
  /* Sin pedir categoría, esa fila sí entra: la página de Sub-23 no rotula y
     ahí todas las filas son de la única categoría que publica. */
  check('pero sí entra cuando no se pide ninguna categoría',
    F.parsearApdeb('<table>' + sinRotulo + '</table>', { hoy: HOY }).partidos.length === 1);
  check('y una categoría que no está en la página no devuelve nada',
    F.parsearApdeb(H['menores-programacion'], { hoy: HOY, categoria: 'U99' }).partidos.length === 0);
}

/* =====================================================================
   4 · La configuración con varias URLs por zona
   ===================================================================== */
seccion('4 · la config del torneo');
{
  const c = F.configDe(DOC);
  check('el torneo declara el adaptador de apdeb', !!c && c.adaptador === 'apdeb');
  check('y su piso de temporada', c.desde === '2026-01-01');
  /* TRES páginas desde el punto 72: la de fixture trae el cruce que la
     programación todavía no publica (ver la sección 9). */
  check('u23 trae TRES páginas: programación, resultados y fixture',
    c.zonas.u23.urls.length === 3, c.zonas.u23.urls);
  check('u21 trae una, y su categoría', c.zonas.u21.urls.length === 1 && c.zonas.u21.categoria === 'U21');
  check('las urls son de apdeb', Object.keys(c.zonas).every(z =>
    c.zonas[z].urls.every(u => /^https:\/\/www\.apdeb\.com\.ar\//.test(u))));

  /* LA FORMA CORTA SIGUE ANDANDO: basket-club declara un string por zona y
     no se tocó. */
  const apb = F.configDe(JSON.parse(fs.readFileSync('torneos/apb-2026-masculino.json', 'utf8')));
  check('una zona declarada como string sigue valiendo',
    apb.zonas.a.urls.length === 1 && apb.zonas.a.categoria === null);
  check('y ese torneo no declara piso de temporada', apb.desde === null);
  check('una zona sin URLs válidas se ignora',
    F.configDe({ fixture: { adaptador: 'apdeb', zonas: { x: { programacion: 'nada' } } } }) === null);
  check('el registro conoce los dos adaptadores',
    Object.keys(F.ADAPTADORES).sort().join(',') === 'apdeb,basket-club');

  check('el archivo del torneo no trae ningún sheetId',
    !/"sheetId"\s*:|[A-Za-z0-9_-]{40,}/.test(JSON.stringify(DOC)));
  check('las dos zonas declaran sus equipos con alias',
    Object.keys(DOC.zonas).every(z => DOC.zonas[z].equipos.length > 0
      && DOC.zonas[z].equipos.every(e => Array.isArray(e.alias) && e.alias.length)));
  /* MEDIDO: el libro de u23 tiene 12 equipos y el de u21 seis. */
  check('u23 declara 12 equipos y u21 seis',
    DOC.zonas.u23.equipos.length === 12 && DOC.zonas.u21.equipos.length === 6);
  /* La web escribe el mismo club de dos formas entre sus páginas
     («DEPORTIVO» y «Deportivo LP») y las dos tienen que cruzar. */
  const dep = DOC.zonas.u23.equipos.find(e => /DEPORTIVO/.test(e.nombre));
  check('un club con dos nombres en la web trae los dos alias',
    dep && dep.alias.length >= 2, dep && dep.alias);
}

/* =====================================================================
   5 · Las dos páginas de una zona se UNEN
   ===================================================================== */
async function union() {
  seccion('5 · programación + resultados en una sola lista');
  const cfg = F.configDe(DOC);
  const pagina = (url) => (/PROGRAMACION/.test(url)
    ? (/MENORES/.test(url) ? H['menores-programacion'] : H['sub23-programacion'])
    : H['sub23-resultados']);
  const ok200 = async (url) => ({ ok: true, status: 200, text: async () => pagina(url) });

  const r = await API.refrescar(cfg, { fetch: ok200 }, HOY);
  check('las dos zonas responden', Object.keys(r.zonas).sort().join(',') === 'u21,u23', r.fallaron);
  const u23 = r.zonas.u23.partidos;
  check('u23 junta los de las dos páginas',
    u23.some(p => p.ptsLocal != null) && u23.some(p => !p.fecha), u23.length);
  /* UN CRUCE PUEDE ESTAR EN LAS DOS PÁGINAS —programado y ya jugado— y ahí
     gana el que TIENE MARCADOR: es el más nuevo. */
  const dobles = {};
  u23.forEach((p) => { const k = (p.fecha || 's') + '|' + p.local + '|' + p.visitante; dobles[k] = (dobles[k] || 0) + 1; });
  check('y no duplica el cruce que está en las dos', Object.keys(dobles).every(k => dobles[k] === 1),
    Object.keys(dobles).filter(k => dobles[k] > 1));

  /* GANA EL QUE TIENE MARCADOR, y se ejerce con un cruce que aparece en las
     dos páginas: la programación lo trae sin resultado y los resultados con
     él. Sin esta regla el partido quedaba «a jugarse» aunque ya se jugó. */
  const cruce2 = { fecha: '2026-09-26', local: 'RECONQUISTA', visitante: 'GONNET' };
  const enDos = async (url) => ({ ok: true, status: 200, text: async () => (/RESULTADOS/.test(url)
    ? '<table><tr><td><div>26/09/2026</div></td><td><div>88</div></td><td><div>'
      + cruce2.local + '</div></td><td><div>vs</div></td><td><div>' + cruce2.visitante
      + '</div></td><td><div>70</div></td></tr></table>'
    : '<table><tr><td><div>SABADO 26/09/2026</div></td><td><div>21:30</div></td><td><div>'
      + cruce2.local + '</div></td><td><div>vs</div></td><td><div>' + cruce2.visitante
      + '</div></td></tr></table>') });
  const r5 = await API.refrescar({ adaptador: 'apdeb', zonas: { u23: cfg.zonas.u23 } }, { fetch: enDos }, HOY);
  const ese = (r5.zonas.u23 || { partidos: [] }).partidos;
  check('el cruce que está en las dos páginas entra UNA vez', ese.length === 1, ese.length);
  check('y con el marcador de la página de resultados',
    ese[0] && ese[0].ptsLocal === 88 && ese[0].ptsVisitante === 70,
    ese[0] && [ese[0].ptsLocal, ese[0].ptsVisitante]);

  /* SI UNA DE LAS DOS PÁGINAS FALLA, se sigue con la que respondió: es la
     misma regla que entre zonas, un nivel más abajo. */
  const caeResultados = async (url) => {
    if (/RESULTADOS/.test(url)) throw new Error('ECONNREFUSED');
    return { ok: true, status: 200, text: async () => pagina(url) };
  };
  const r2 = await API.refrescar(cfg, { fetch: caeResultados }, HOY);
  check('una página caída no tumba la zona', !!r2.zonas.u23 && r2.zonas.u23.partidos.length > 0);
  check('y se anota el motivo', r2.zonas.u23.avisos.some(a => /ECONNREFUSED/.test(a)), r2.zonas.u23.avisos);
  check('la otra zona sigue entera', !!r2.zonas.u21);

  /* LAS DOS PÁGINAS CAÍDAS sí dejan la zona sin nada, para que el endpoint
     sirva lo guardado. */
  const caeTodo = async () => { throw new Error('ECONNREFUSED'); };
  const r3 = await API.refrescar(cfg, { fetch: caeTodo }, HOY);
  check('con todo caído no se sirve una zona vacía', Object.keys(r3.zonas).length === 0);
  check('y se dice qué zonas fallaron', r3.fallaron.length === 2, r3.fallaron);

  const cambiado = async () => ({ ok: true, status: 200, text: async () => '<html><body>Mantenimiento</body></html>' });
  const r4 = await API.refrescar(cfg, { fetch: cambiado }, HOY);
  check('un HTML cambiado NO se sirve como «cero partidos»', Object.keys(r4.zonas).length === 0);
  check('y se explica que cambió la estructura',
    r4.fallaron.every(x => /estructura/.test(x)), r4.fallaron);
}

/* =====================================================================
   6 · El cruce con el libro
   ===================================================================== */
function cruce() {
  seccion('6 · cruce con el libro');
  const cl = CORE.claveEquipo;
  /* Las claves reales del libro de Sub-23. */
  const libro = DOC.zonas.u23.equipos.map(e => cl(e.nombre));
  const alias = {};
  DOC.zonas.u23.equipos.forEach(e => (e.alias || []).forEach((a) => { alias[a] = e.nombre; }));

  const r = F.parsearApdeb(H['sub23-resultados'], { hoy: HOY, zona: 'u23', desde: '2026-01-01' });
  const x = F.cruzarConLibro(r.partidos, libro, alias, cl);
  check('los partidos de Sub-23 cruzan contra su libro', x.sinCruce.length === 0, x.sinCruce);
  check('y quedan con claves del libro',
    x.partidos.every(p => libro.indexOf(p.localClave) !== -1 && libro.indexOf(p.visitanteClave) !== -1));

  /* U21 sale de la página de MENORES, que publica TODAS las tiras: el libro
     de la categoría cubre una sola, así que hay equipos que no cruzan. NO
     se esconden —son partidos reales del torneo— y quedan marcados. */
  const libroU21 = DOC.zonas.u21.equipos.map(e => cl(e.nombre));
  const aliasU21 = {};
  DOC.zonas.u21.equipos.forEach(e => (e.alias || []).forEach((a) => { aliasU21[a] = e.nombre; }));
  const u21 = F.parsearApdeb(H['menores-programacion'], { hoy: HOY, zona: 'u21', categoria: 'U21' });
  const y = F.cruzarConLibro(u21.partidos, libroU21, aliasU21, cl);
  check('en U21 los de otras tiras no se esconden', y.partidos.length === u21.partidos.length);
  check('y quedan marcados como sin cruce', y.partidos.some(p => p.sinCruce === true));
  check('los del libro sí cruzan', y.partidos.filter(p => !p.sinCruce).every(p =>
    libroU21.indexOf(p.localClave) !== -1 && libroU21.indexOf(p.visitanteClave) !== -1));
}

/* =====================================================================
   7 · El orden descendente dentro del mes
   ===================================================================== */
function orden() {
  seccion('7 · el mes se apila del más reciente al más antiguo');
  const PANEL = require('./js/sgadd-fixture.js');
  const ps = [
    { fecha: '2026-09-01', hora: '21:00', local: 'A', visitante: 'B' },
    { fecha: '2026-09-22', hora: '19:00', local: 'C', visitante: 'D' },
    { fecha: '2026-09-15', hora: '19:00', local: 'E', visitante: 'F' },
    { fecha: '2026-09-22', hora: '21:30', local: 'G', visitante: 'H' },
  ];
  const m = PANEL.deMes(ps, '2026-09');
  check('del más reciente al más antiguo',
    m.map(p => p.fecha).join(',') === '2026-09-22,2026-09-22,2026-09-15,2026-09-01', m.map(p => p.fecha));
  /* DENTRO DEL MISMO DÍA también: el último horario primero. */
  check('y dentro del mismo día, por hora descendente',
    m[0].hora === '21:30' && m[1].hora === '19:00', m.slice(0, 2).map(p => p.hora));

  /* SOLO SE INVIERTE LO QUE SE MUESTRA: `proximo` busca el primero que
     viene y `anterior` el último de los previos. Invertir la lista de base
     daría vuelta a los dos y el «próximo rival» pasaría a ser el de la
     primera fecha del torneo. */
  const conJugado = [
    { fecha: '2026-09-01', jugado: true }, { fecha: '2026-09-22', jugado: true },
    { fecha: '2026-10-05', jugado: false }, { fecha: '2026-10-12', jugado: false },
  ];
  check('el próximo sigue siendo el más cercano hacia adelante',
    PANEL.proximo(conJugado, '2026-09-25').fecha === '2026-10-05');
  check('y el anterior, el último jugado',
    PANEL.anterior(conJugado, '2026-09-25').fecha === '2026-09-22');

  /* La agenda entera: el bloque del mes desciende y el próximo rival no. */
  const a = PANEL.agenda({ torneo: { calendario: { partidos: [
    { fecha: '2026-09-05', local: 'MI EQUIPO', visitante: 'X' },
    { fecha: '2026-09-19', local: 'Y', visitante: 'MI EQUIPO' },
    { fecha: '2026-10-03', local: 'MI EQUIPO', visitante: 'Z' },
  ] } }, idx: null, equipo: 'MI EQUIPO', mes: '2026-09', hoy: '2026-09-25' });
  check('en la agenda, el mes sale descendente',
    a.delMes.map(p => p.fecha).join(',') === '2026-09-19,2026-09-05', a.delMes.map(p => p.fecha));
  check('y el próximo partido sigue siendo el de octubre',
    a.proximo && a.proximo.fecha === '2026-10-03', a.proximo && a.proximo.fecha);
}

/* =====================================================================
   8 · EL MISMO CRUCE CON LA FECHA CORRIDA
   ===================================================================== */
function fechaCorrida() {
  seccion('8 · un partido reprogramado no se duplica');
  const PANEL = require('./js/sgadd-fixture.js');
  /* Medido en la U23 el 2026-09-25: apdeb declara ESTRELLA vs RECONQUISTA
     el domingo 6 y el libro lo tiene el sabado 5, con el mismo 45-80. El
     cruce por fecha exacta lo mostraba DOS VECES. */
  const decl = (f, l, v) => ({ fecha: f, local: l, visitante: v, localClave: l, visitanteClave: v,
    jugado: false, ptsLocal: null, ptsVisitante: null, hora: '20:00' });
  const jug = (f, l, v, a2, b2) => ({ fecha: f, local: l, visitante: v, localClave: l, visitanteClave: v,
    jugado: true, ptsLocal: a2, ptsVisitante: b2 });

  const u = PANEL.unir([decl('2026-09-06', 'ESTRELLA', 'RECONQUISTA')],
    [jug('2026-09-05', 'ESTRELLA', 'RECONQUISTA', 45, 80)]);
  check('el mismo cruce a un dia entra UNA vez', u.length === 1, u.map(p => p.fecha));
  check('con el marcador del libro', u[0].ptsLocal === 45 && u[0].jugado === true);
  /* LA FECHA DEL LIBRO MANDA: es la del partido que se jugo de verdad. */
  check('y con la fecha del libro', u[0].fecha === '2026-09-05', u[0].fecha);
  check('anotando la que se habia declarado', u[0].fechaDeclarada === '2026-09-06');
  check('la hora declarada se conserva: el libro no la tiene', u[0].hora === '20:00');

  /* LA VENTANA ES CHICA A PROPOSITO: en una liga de ida y vuelta los dos
     cruces del mismo par estan a semanas. Con una ventana grande se
     fusionarian, que es el error que no se puede cometer. */
  const iv = PANEL.unir([decl('2026-09-06', 'A', 'B')], [jug('2026-11-20', 'B', 'A', 70, 60)]);
  check('la ida y la vuelta NO se fusionan', iv.length === 2, iv.map(p => p.fecha));
  const lejos = PANEL.unir([decl('2026-09-06', 'A', 'B')], [jug('2026-09-20', 'A', 'B', 70, 60)]);
  check('ni dos partidos del mismo par a dos semanas', lejos.length === 2, lejos.map(p => p.fecha));

  /* CON DOS CANDIDATOS NO SE ELIGE: fusionar el equivocado moveria un
     partido de fecha y dejaria al otro sin resultado. */
  const dos = PANEL.unir([decl('2026-09-05', 'A', 'B'), decl('2026-09-06', 'A', 'B')],
    [jug('2026-09-07', 'A', 'B', 70, 60)]);
  check('con dos candidatos cerca no adivina y los deja a los tres', dos.length === 3,
    dos.map(p => p.fecha + (p.jugado ? ' jugado' : '')));

  /* EL CANDIDATO PUEDE VENIR YA JUGADO DESDE LA FUENTE: apdeb publica sus
     propios resultados, asi que el mismo partido llega con marcador por los
     dos lados y con un dia de diferencia. Era el caso REAL que se veia en
     pantalla y que la primera version del arreglo no cazaba, porque solo
     miraba los candidatos sin jugar. */
  const dosJugados = PANEL.unir([jug('2026-09-06', 'ESTRELLA', 'RECONQUISTA', 45, 80)],
    [jug('2026-09-05', 'ESTRELLA', 'RECONQUISTA', 45, 80)]);
  check('con marcador por los dos lados y el mismo resultado, entra UNA vez',
    dosJugados.length === 1, dosJugados.map(p => p.fecha + ' ' + p.ptsLocal + '-' + p.ptsVisitante));
  /* SI EL MARCADOR DIFIERE NO SE FUSIONA: o son dos partidos distintos, o
     hay una discrepancia entre la web y la planilla, y en ninguno de los dos
     casos corresponde taparla. */
  const distinto = PANEL.unir([jug('2026-09-06', 'ESTRELLA', 'RECONQUISTA', 50, 80)],
    [jug('2026-09-05', 'ESTRELLA', 'RECONQUISTA', 45, 80)]);
  check('con marcadores distintos NO se fusionan: la discrepancia se ve',
    distinto.length === 2, distinto.map(p => p.ptsLocal + '-' + p.ptsVisitante));
  /* Y ANDA CON EL CRUCE ESCRITO AL REVES: una fuente puede poner local al
     que la otra pone visitante. */
  const invertido = PANEL.unir([jug('2026-09-06', 'RECONQUISTA', 'ESTRELLA', 80, 45)],
    [jug('2026-09-05', 'ESTRELLA', 'RECONQUISTA', 45, 80)]);
  check('con el cruce al reves y el mismo resultado, tambien es uno',
    invertido.length === 1, invertido.map(p => p.local + ' ' + p.ptsLocal + '-' + p.ptsVisitante));

  /* EL MATCH EXACTO SIGUE GANANDO sobre la ventana. */
  const ex = PANEL.unir([decl('2026-09-05', 'A', 'B'), decl('2026-09-06', 'A', 'B')],
    [jug('2026-09-05', 'A', 'B', 70, 60)]);
  check('con fecha exacta se usa esa y no una vecina', ex.length === 2
    && ex.filter(p => p.jugado).length === 1 && ex.find(p => p.jugado).fecha === '2026-09-05',
    ex.map(p => p.fecha + (p.jugado ? ' jugado' : '')));
  check('y no se le inventa una fecha declarada', !ex.find(p => p.jugado).fechaDeclarada);
}


/* =====================================================================
   9 · LA PÁGINA «FIXTURE» · el cruce que la programación no publica
   ===================================================================== */
async function fixtureEstructural() {
  seccion('9 · la tercera página: el fixture estructural');
  const PANEL = require('./js/sgadd-fixture.js');

  /* LA PÁGINA «FIXTURE» ES EL FIXTURE ESTRUCTURAL: dice qué cruce va en
     cada jornada y NADA más. Sus filas traen solo LOCAL · vs · VISITANTE,
     sin celda de fecha: la fecha la pone el encabezado que las precede
     (`1º Fecha - 21/3/2026`). */
  const r = F.parsearApdeb(H['sub23-fixtures'], { hoy: HOY, zona: 'u23' });
  check('la página de fixture se parsea', r.partidos.length >= 12, r.partidos.length);
  check('y sus filas heredan la fecha del encabezado de jornada',
    r.partidos.every(p => p.fecha), r.partidos.filter(p => !p.fecha).length);
  const j1 = r.partidos.filter(p => p.fecha === '2026-03-21');
  const j2 = r.partidos.filter(p => p.fecha === '2026-03-28');
  check('la 1ª fecha se lleva sus seis cruces', j1.length === 6, j1.length);
  check('y la 2ª los suyos, con SU fecha y no la anterior', j2.length === 6, j2.length);
  check('el primer cruce de la 1ª fecha es el que publica el sitio',
    j1.some(p => /RECONQUISTA/.test(p.local) && /ATENAS/.test(p.visitante)),
    j1.map(p => p.local + ' vs ' + p.visitante));
  /* NO TIENE HORA NI MARCADOR, y no se los inventa. */
  check('no trae hora', r.partidos.every(p => !p.hora));
  check('ni marcador', r.partidos.every(p => p.ptsLocal === null && p.ptsVisitante === null));
  check('y queda como PROGRAMADO, no como un estado raro',
    r.partidos.every(p => p.estado === 'PROGRAMADO'), [...new Set(r.partidos.map(p => p.estado))]);
  /* SE MARCA DE QUÉ PÁGINA SALIÓ: es lo que la deja perder contra la
     programación del mismo cruce. */
  check('todas se marcan como estructurales', r.partidos.every(p => p.estructural === true));
  /* LA FILA «Fecha Libre» no es un partido: no tiene celda `vs`. */
  check('la jornada libre no entra como partido',
    !r.partidos.some(p => /libre/i.test(p.local + ' ' + p.visitante)),
    r.partidos.filter(p => /libre/i.test(p.local + ' ' + p.visitante)));

  /* LA FORMA DE LA FILA es lo que separa las dos páginas, no una
     adivinanza. En la PROGRAMACIÓN una fila sin fecha dice «A Reprogramar»,
     y heredar la de una jornada le inventaría un día que el sitio
     justamente no publicó. */
  const prog = F.parsearApdeb(H['sub23-programacion'], { hoy: HOY, zona: 'u23' });
  check('la programación NO se marca como estructural',
    prog.partidos.every(p => !p.estructural));
  const reprog = prog.partidos.filter(p => !p.fecha);
  check('y su fila «a reprogramar» sigue sin fecha', reprog.length >= 1, reprog.length);
  /* EL CASO QUE LO EJERCE: la misma fila «a reprogramar» PEGADA DEBAJO de un
     encabezado de jornada. Si la herencia mirara solo «no tiene fecha», se
     comería el «A Reprogramar» y lo fecharía el 21/3. */
  const filaRep = H['sub23-programacion'].match(/<tr[^>]*>[\s\S]*?<\/tr>/g)
    .filter(f => /Reprogramar/i.test(f))[0];
  const cabecera = H['sub23-fixtures'].match(/<tr[^>]*>[\s\S]*?<\/tr>/g)
    .filter(f => /1&ordm; Fecha/.test(f))[0];
  check('la fixture tiene las dos piezas del caso', !!filaRep && !!cabecera);
  const mezcla = F.parsearApdeb('<table>' + cabecera + filaRep + '</table>', { hoy: HOY });
  check('una fila «a reprogramar» debajo de una jornada NO hereda su fecha',
    mezcla.partidos.length === 1 && !mezcla.partidos[0].fecha,
    mezcla.partidos.map(p => p.fecha + ' ' + p.local + ' vs ' + p.visitante));
  check('y sigue diciendo que está a reprogramar',
    !!mezcla.partidos[0] && /reprogramar/i.test(mezcla.partidos[0].estadoTexto || ''),
    mezcla.partidos.map(p => p.estado + ' / ' + p.estadoTexto));

  /* LA CONFIG: u23 declara TRES páginas. */
  const cfg = F.configDe(DOC);
  check('u23 declara las tres páginas', cfg.zonas.u23.urls.length === 3, cfg.zonas.u23.urls);
  check('y una de ellas es la de fixture',
    cfg.zonas.u23.urls.some(u => /FIXTURES/.test(u)), cfg.zonas.u23.urls);

  /* =====================================================================
     EL CRUCE QUE LA PROGRAMACIÓN NO PUBLICA
     ===================================================================== */
  /* apdeb publica en «programación» solo la fecha próxima. El partido que
     viene DESPUÉS del nuestro —el del rival, que es el que la card «Próximo
     Rival» necesita— no está ahí: está en el fixture estructural. Sin esa
     página, «SU PARTIDO SIGUIENTE» salía vacío. */
  const soloProg = '<table>'
    + '<tr><td><div>SABADO 26/09/2026</div></td><td><div>21:30</div></td>'
    + '<td><div>RECONQUISTA</div></td><td><div>vs</div></td><td><div>GONNET</div></td></tr>'
    + '</table>';
  const soloFix = '<table>'
    + '<tr><td colspan="3"><div>26&ordm; Fecha - 3/10/2026</div></td></tr>'
    + '<tr><td><div>GONNET</div></td><td><div>vs</div></td><td><div>ATENAS</div></td></tr>'
    + '</table>';
  const zona = { urls: ['https://www.apdeb.com.ar/SUB23_PROGRAMACION.html',
    'https://www.apdeb.com.ar/SUB23_FIXTURES.html'], categoria: null };
  const dosPaginas = async (url) => ({ ok: true, status: 200,
    text: async () => (/FIXTURES/.test(url) ? soloFix : soloProg) });

  const sinFix = await API.refrescar({ adaptador: 'apdeb', zonas: { u23: { urls: [zona.urls[0]] } } },
    { fetch: dosPaginas }, HOY);
  const conFix = await API.refrescar({ adaptador: 'apdeb', zonas: { u23: zona } },
    { fetch: dosPaginas }, HOY);

  const agendaDe = (fuente) => PANEL.agenda({
    torneo: { fixture: { adaptador: 'apdeb' } }, zona: 'u23', idx: null,
    equipo: 'RECONQUISTA', fuente: fuente, hoy: HOY,
  });
  const sin = agendaDe(sinFix.zonas.u23.partidos);
  const con = agendaDe(conFix.zonas.u23.partidos);

  check('sin la página de fixture, el rival no tiene partido siguiente',
    !!sin.rival && sin.rival.siguiente === null,
    sin.rival && sin.rival.siguiente);
  check('con la página de fixture, SÍ lo tiene',
    !!con.rival && !!con.rival.siguiente, con.rival && con.rival.siguiente);
  check('y es el que publica el fixture, no el nuestro',
    con.rival.siguiente.fecha === '2026-10-03'
      && CORE.claveEquipo(con.rival.siguiente.rival) === 'ATENAS',
    con.rival.siguiente && (con.rival.siguiente.fecha + ' ' + con.rival.siguiente.rival));
  check('el próximo partido propio no cambia por sumar la página',
    sin.proximo && con.proximo && sin.proximo.fecha === con.proximo.fecha
      && con.proximo.fecha === '2026-09-26',
    [sin.proximo && sin.proximo.fecha, con.proximo && con.proximo.fecha]);
  /* Y NO SE MUESTRA COMO JUGADO: el fixture no trae marcador. */
  check('el partido siguiente del rival sale a jugarse',
    con.rival.siguiente.jugado !== true && con.rival.siguiente.ptsPropios == null);

  /* =====================================================================
     EL MISMO CRUCE ESCRITO DISTINTO POR DOS PÁGINAS
     ===================================================================== */
  /* Medido al sumar la tercera página: 32 cruces duplicados en la U23, 4
     del equipo propio. Las páginas abrevian cada club a su manera —
     «Bco Provincia» en resultados y «BANCO PROVINCIA» en el fixture— y
     `claveEquipo` normaliza mayúsculas, no abreviaturas. Lo que los
     homogeniza es el mapeo al nombre del libro, así que la deduplicación
     tiene que ir DESPUÉS del mapeo. */
  const alias = { 'BCO PROVINCIA': 'BANCO PROVINCIA - U23', 'BANCO PROVINCIA': 'BANCO PROVINCIA - U23',
    'HOGAR SOCIAL': 'HOGAR SOCIAL - U23' };
  const dosFormas = [
    { fecha: '2026-03-21', local: 'Bco Provincia', visitante: 'Hogar Social',
      ptsLocal: 71, ptsVisitante: 77, estructural: false },
    { fecha: '2026-03-21', local: 'BANCO PROVINCIA', visitante: 'HOGAR SOCIAL',
      ptsLocal: null, ptsVisitante: null, estructural: true },
  ];
  const unidas = PANEL.normalizarFuente(dosFormas, alias, 'u23');
  check('el mismo cruce escrito de dos formas entra UNA vez', unidas.length === 1,
    unidas.map(p => p.local + ' vs ' + p.visitante));
  check('y gana la versión con marcador, no la estructural',
    unidas.length === 1 && unidas[0].ptsLocal === 71 && unidas[0].jugado === true,
    unidas.map(p => p.ptsLocal + ' jugado=' + p.jugado));
  /* CON LA ESTRUCTURAL PRIMERO gana igual la que trae marcador: si la
     preferencia no estuviera, el orden decidiría y el partido ya jugado
     saldría «a jugarse». */
  const alRevés = PANEL.normalizarFuente([dosFormas[1], dosFormas[0]], alias, 'u23');
  check('aunque la estructural llegue primero, gana la que trae marcador',
    alRevés.length === 1 && alRevés[0].ptsLocal === 71 && alRevés[0].jugado === true,
    alRevés.map(p => p.ptsLocal + ' jugado=' + p.jugado));
  /* LAS DOS REGLAS SE PRUEBAN POR SEPARADO, o una tapa a la otra: en el
     caso de arriba la fila con marcador es además la no estructural, así
     que cualquiera de las dos alcanzaría y revertir una no se notaría. */
  /* Solo cambia el MARCADOR: programación y resultados, ninguna estructural.
     LAS DOS LLEVAN LA MISMA HORA a propósito: con horas distintas el orden
     previo pone primera a una de ellas y gana por posición, así que el test
     no probaría la preferencia sino el `sort`. */
  const soloMarcador = PANEL.normalizarFuente([
    { fecha: '2026-03-21', local: 'BANCO PROVINCIA', visitante: 'HOGAR SOCIAL',
      hora: '21:00', ptsLocal: null, ptsVisitante: null, estructural: false },
    { fecha: '2026-03-21', local: 'Bco Provincia', visitante: 'Hogar Social',
      hora: '21:00', ptsLocal: 71, ptsVisitante: 77, estructural: false },
  ], alias, 'u23');
  check('entre dos de la misma página, gana la que trae marcador',
    soloMarcador.length === 1 && soloMarcador[0].ptsLocal === 71,
    soloMarcador.map(p => p.ptsLocal));
  /* Solo cambia la PÁGINA: ninguna trae marcador, y la estructural pierde
     porque no publica hora ni estado. */
  const soloPagina = PANEL.normalizarFuente([
    { fecha: '2026-03-21', local: 'BANCO PROVINCIA', visitante: 'HOGAR SOCIAL',
      hora: null, estado: 'PROGRAMADO', ptsLocal: null, ptsVisitante: null, estructural: true },
    { fecha: '2026-03-21', local: 'Bco Provincia', visitante: 'Hogar Social',
      hora: '21:00', estado: 'PROGRAMADO', ptsLocal: null, ptsVisitante: null, estructural: false },
  ], alias, 'u23');
  check('y entre dos sin marcador, la estructural pierde: no tiene hora',
    soloPagina.length === 1 && soloPagina[0].hora === '21:00',
    soloPagina.map(p => p.hora + ' estr=' + p.estructural));
  /* EL GUARD SIMÉTRICO —que el sin marcador no pise al jugado— HOY ES
     REDUNDANTE: para llegar ahí haría falta una fila estructural CON
     marcador, y la página de fixture no publica resultados. Se deja porque
     la propiedad no debería depender de eso, y el test lo dice en vez de
     fingir que lo caza (la misma decisión que el orden de los sin fecha). */
  const alRevésDeNuevo = PANEL.normalizarFuente([soloMarcador[0],
    { fecha: '2026-03-21', local: 'BANCO PROVINCIA', visitante: 'HOGAR SOCIAL',
      hora: '21:00', ptsLocal: null, ptsVisitante: null, estructural: false }], alias, 'u23');
  check('el marcador tampoco se pierde si la fila vacía llega después',
    alRevésDeNuevo.length === 1 && alRevésDeNuevo[0].ptsLocal === 71,
    alRevésDeNuevo.map(p => p.ptsLocal));

  /* SIN EL ALIAS no se puede saber que son el mismo club, y entonces NO se
     fusionan: inventar la equivalencia sería peor que mostrar dos filas. */
  check('sin alias que los una, quedan los dos',
    PANEL.normalizarFuente(dosFormas, {}, 'u23').length === 2);
  /* ENTRE DOS ESTRUCTURALES O DOS CON MARCADOR gana la primera: hay que
     quedarse con una, y la que llegó antes es la del orden del sitio. */
  check('dos veces la misma fila estructural también colapsan',
    PANEL.dedupFuente(PANEL.normalizarFuente([dosFormas[1], dosFormas[1]], alias, 'u23')).length === 1);
  /* Y DOS CRUCES DISTINTOS DEL MISMO DÍA no se tocan. */
  const distintos = PANEL.normalizarFuente([
    { fecha: '2026-03-21', local: 'Bco Provincia', visitante: 'Hogar Social', estructural: false },
    { fecha: '2026-03-21', local: 'RECONQUISTA', visitante: 'ATENAS', estructural: true },
  ], alias, 'u23');
  check('dos cruces distintos del mismo día siguen siendo dos', distintos.length === 2);
  /* LA IDA Y LA VUELTA NO SE FUSIONAN: misma pareja, otra fecha. */
  const idaVuelta = PANEL.normalizarFuente([
    { fecha: '2026-03-21', local: 'Bco Provincia', visitante: 'Hogar Social', estructural: false },
    { fecha: '2026-06-27', local: 'HOGAR SOCIAL', visitante: 'BANCO PROVINCIA', estructural: true },
  ], alias, 'u23');
  check('la ida y la vuelta del mismo par no se fusionan', idaVuelta.length === 2,
    idaVuelta.map(p => p.fecha));
}

/* =====================================================================
   10 · LA LEYENDA NO NOMBRA AL PROVEEDOR
   ===================================================================== */
function leyenda() {
  seccion('10 · la leyenda dice CUÁNDO, no de dónde');
  const PANEL = require('./js/sgadd-fixture.js');
  /* De qué sitio salió el horario es un detalle de implementación: al DT no
     le dice nada. Lo que necesita saber es cuándo se leyó. El nombre sigue
     viajando en `vivoEstado.fuente`, para el diagnóstico. */
  const PROVEEDORES = /apdeb|basket-?club|gesdeportiva/i;

  const vivo = PANEL.avisoFuente({ envivo: true },
    { fuente: 'apdeb', actualizado: '2026-09-25T21:27:00-03:00', stale: false });
  check('en vivo, la leyenda dice a qué hora se leyó', /le[íi]dos a las 21:27/.test(vivo), vivo);
  check('y NO nombra al proveedor', !PROVEEDORES.test(vivo), vivo);

  const stale = PANEL.avisoFuente({ envivo: true },
    { fuente: 'basket-club', actualizado: '2026-09-25T19:50:00-03:00', stale: true, aviso: 'timeout' });
  check('con la copia vieja, dice la última actualización',
    /última actualización/.test(stale) && /19:50/.test(stale), stale);
  check('y avisa que los horarios pueden haber cambiado',
    /pueden haber cambiado/.test(stale), stale);
  check('tampoco nombra al proveedor', !PROVEEDORES.test(stale), stale);

  /* SIN FUENTE EN VIVO no se promete nada. */
  check('sin fuente en vivo, no hay leyenda', PANEL.avisoFuente({ envivo: false }, null) === '');
  /* SIN HORA no se inventa una. */
  const sinHora = PANEL.avisoFuente({ envivo: true }, { fuente: 'apdeb', actualizado: null, stale: false });
  check('sin hora de lectura, la leyenda no la inventa',
    !/le[íi]dos a las/.test(sinHora) && !PROVEEDORES.test(sinHora), sinHora);
  check('y una fecha ilegible tampoco produce una hora',
    PANEL.horaDe('no es una fecha') === '' && PANEL.horaDe(null) === '');

  /* EN NINGUNA PARTE DE LA SECCIÓN: ni en la leyenda ni en el chip ni en el
     resto del módulo se le muestra al DT el nombre del sitio. */
  const fuente = fs.readFileSync('js/sgadd-fixture.js', 'utf8');
  const textos = fuente.match(/'[^'\n]*(apdeb|basket-club)[^'\n]*'/gi) || [];
  const visibles = textos.filter(t => !/https?:|adaptador|ADAPTADORES/.test(t));
  check('el módulo no trae un literal visible con el nombre del sitio',
    visibles.length === 0, visibles);
}

/* =====================================================================
   11 · `?refrescar=1` es de ADMIN
   ===================================================================== */
async function forzar() {
  seccion('11 · forzar el refresco es de admin');
  /* `verificarToken` devuelve `{ok, sesion, rol}`. La primera versión leía
     `v.payload.email`, que no existe: `esAdmin` daba SIEMPRE false, así que
     `?refrescar=1` no forzaba nada y el endpoint contestaba 200 con el
     caché viejo — bien, pero viejo, y sin ningún síntoma. */
  const fuente = fs.readFileSync('server/api/fixture.js', 'utf8');
  check('el rol sale del resultado de verificarToken',
    /esAdmin\s*=\s*v\.rol\s*===\s*AUTH\.ROLES\.ADMIN/.test(fuente),
    (fuente.match(/const esAdmin[^;]*/) || [])[0]);
  /* SE MIRA EL CÓDIGO, NO LOS COMENTARIOS: el de acá al lado nombra a
     `v.payload.email` justamente para explicar el bug. */
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  check('y no de un payload que no existe', !/payload/.test(sinComentarios),
    (sinComentarios.match(/.{0,40}payload.{0,40}/) || [])[0]);
}

(async () => {
  await union();
  fechaCorrida();
  cruce();
  orden();
  await fixtureEstructural();
  leyenda();
  await forzar();
  console.log('\n' + (mal ? '✗ HAY FALLAS · ' : '✓ TODO OK · ') + ok + ' pasaron, ' + mal + ' fallaron');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e.stack); process.exit(1); });
