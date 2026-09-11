/* =====================================================================
   test-pj.js · el PJ de la sección Equipos es el de la tabla

   Reportado el 2026-09-11: un equipo con 7 PJ en la tabla de posiciones
   mostraba 6 en su tarjeta de Equipos. La tabla suma los partidos sin
   estadísticas (punto 44) y la tarjeta leía el `pj` del índice, que solo
   cuenta los partidos con box score.

   Lo que se fija: todo lo que se MUESTRA como partidos jugados sale de la
   misma fusión que la tabla, y el `pj` del índice —la muestra de los
   promedios— sigue intacto.
   ===================================================================== */
'use strict';

const fs = require('fs');
const vm = require('vm');
const NL = '\n';

let ok = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); }
};
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));

/* El núcleo REAL: es el que normaliza «ATENAS 'B'» y «C.C TOLOSANO» a la
   clave del índice, igual que en el navegador. Sin él el test inventaría
   filas que la app no arma. */
const CORE = require('./js/sgadd-core.js');
global.SGADD = CORE;
const CLASIF = require('./js/sgadd-clasificacion.js');
const clonar = (o) => JSON.parse(JSON.stringify(o));

/* Un índice con la forma del núcleo: `pj` es el de la muestra (el que
   escribe `construirIndice`), `record` y `split` salen de los partidos. */
function equipo(clave, pg, pp, pf, pc) {
  return {
    clave: clave, nombre: clave, pj: pg + pp,
    record: { ganados: pg, perdidos: pp, pj: pg + pp },
    totales: { propio: { PTS: pf }, rival: { PTS: pc } },
    split: {
      LOCAL: { ganados: pg, perdidos: 0, pj: pg, ptsFavor: pf, ptsContra: pc },
      VISITANTE: { ganados: 0, perdidos: pp, pj: pp, ptsFavor: 0, ptsContra: 0 },
    },
  };
}
const LISTA = [
  equipo('UNIVERSITARIO', 2, 4, 400, 450),
  equipo('ATENAS B', 3, 3, 420, 410),
  equipo('SUD AMERICA LP', 2, 4, 390, 430),
  equipo('C C TOLOSANO', 4, 2, 440, 400),
];
const idx = { lista: () => clonar(LISTA) };
/* Los dos partidos reales de la IDA sin box score (2026-07-09). */
const MANUALES = [
  { id: 'm1', fecha: '2026-07-09', local: 'UNIVERSITARIO', puntosLocal: 62, visitante: "ATENAS 'B'", puntosVisitante: 66 },
  { id: 'm2', fecha: '2026-07-09', local: 'SUD AMERICA LP', puntosLocal: 61, visitante: 'C.C TOLOSANO', puntosVisitante: 69 },
];

(async () => {

titulo('1 · UNA SOLA FUENTE · las filas de la tabla, por equipo');
{
  const tabla = CLASIF.tabla(idx, { manuales: MANUALES });
  const mapa = CLASIF.filasPorEquipo(idx, MANUALES);
  check('cada equipo tiene el MISMO PJ que en la tabla',
    tabla.every(r => mapa.get(r.clave) && mapa.get(r.clave).pj === r.pj),
    tabla.map(r => r.clave + ':' + r.pj + '/' + (mapa.get(r.clave) || {}).pj).join(' '));
  check('y el mismo récord', tabla.every(r => mapa.get(r.clave).pg === r.pg && mapa.get(r.clave).pp === r.pp));
  check('Universitario: 6 con estadísticas + 1 sin ellas = 7', mapa.get('UNIVERSITARIO').pj === 7);
  check('el equipo del partido manual escrito distinto (ATENAS \'B\') cae en su fila',
    mapa.get('ATENAS B').pj === 7 && mapa.get('ATENAS B').manuales === 1);
  const sin = CLASIF.filasPorEquipo(idx, []);
  check('sin partidos manuales el PJ es el de los partidos con estadísticas',
    LISTA.every(e => sin.get(e.clave).pj === e.record.pj));
}

titulo('2 · LA TARJETA · el PJ de la tabla al lado, sin tocar la muestra');
{
  const mapa = CLASIF.filasPorEquipo(idx, MANUALES);
  const lista = idx.lista();
  const conPj = CLASIF.conPjDeTabla(lista, mapa);
  const u = conPj.filter(e => e.clave === 'UNIVERSITARIO')[0];
  check('la tarjeta recibe el PJ de la tabla', u.pjTabla === 7);
  check('y cuántos partidos no tienen estadísticas', u.manuales === 1);
  check('el `pj` del índice —la muestra de los promedios— sigue en 6', u.pj === 6);
  check('no se muta la lista original', lista.filter(e => e.clave === 'UNIVERSITARIO')[0].pjTabla === undefined);
  const tolo = conPj.filter(e => e.clave === 'C C TOLOSANO')[0];
  check('C.C TOLOSANO también: 7 en la tabla, 7 en la tarjeta', tolo.pjTabla === 7);

  global.SGADD = Object.assign({}, CORE, { esEquipoPropio: () => false });
  const UI = require('./js/sgadd-ui.js');
  const html = UI.teamPicker(conPj, { onClick: 'x' });
  /* Una tarjeta por `<button`: el nombre va en el onclick y el PJ al final. */
  const tarjeta = (h, clave) => h.split('<button').filter(t => t.indexOf("('" + clave + "')") !== -1)[0] || '';
  const tarjetaU = tarjeta(html, 'UNIVERSITARIO');
  check('la tarjeta PINTA el PJ de la tabla', /PJ 7/.test(tarjetaU) && !/PJ 6/.test(tarjetaU), tarjetaU.replace(/\s+/g, ' ').slice(0, 300));
  check('con el aviso de los partidos sin estadísticas', /badge-manual[\s\S]*⚠ 1/.test(tarjetaU));
  const sinPj = UI.teamPicker(lista, { onClick: 'x' });
  check('sin `pjTabla` la tarjeta cae al PJ del índice (Diagnóstico, que audita el libro)',
    /PJ 6/.test(tarjeta(sinPj, 'UNIVERSITARIO')));
  global.SGADD = CORE;
}

titulo('3 · LOCAL Y VISITANTE · como las columnas PG L / PP L de la tabla');
{
  const mapa = CLASIF.filasPorEquipo(idx, MANUALES);
  const eU = LISTA[0];
  const c = CLASIF.condicionConManuales(eU.split, mapa.get('UNIVERSITARIO'));
  check('el partido manual de local suma un PJ de local', c.LOCAL.pj === eU.split.LOCAL.pj + 1);
  check('y un perdido (62-66)', c.LOCAL.perdidos === 1 && c.LOCAL.ganados === 2);
  check('con sus puntos, que son totales', c.LOCAL.ptsFavor === 462 && c.LOCAL.ptsContra === 516);
  check('y marcado como sin estadísticas', c.LOCAL.manuales === 1 && c.VISITANTE.manuales === 0);
  check('el de visitante queda como estaba', c.VISITANTE.pj === eU.split.VISITANTE.pj);
  const tabla = CLASIF.tabla(idx, { manuales: MANUALES }).filter(r => r.clave === 'UNIVERSITARIO')[0];
  check('coincide con las columnas de la tabla', tabla.local.pg === c.LOCAL.ganados && tabla.local.pp === c.LOCAL.perdidos
    && tabla.visitante.pg === c.VISITANTE.ganados && tabla.visitante.pp === c.VISITANTE.perdidos);
  check('local + visitante = el PJ de la tabla', c.LOCAL.pj + c.VISITANTE.pj === tabla.pj);
  const vacio = CLASIF.condicionConManuales(eU.split, null);
  check('sin fila de tabla, el split queda como estaba', vacio.LOCAL.pj === eU.split.LOCAL.pj && vacio.LOCAL.manuales === 0);
}

titulo('4 · LOS HELPERS DE PANTALLA · leen los manuales del tramo abierto');
{
  const src = fs.readFileSync('./js/sgadd-clasificacion.js', 'utf8');
  const ctx = {
    console, Map,
    SGADD_CONFIG: { clubActivo: () => 'universitario', deCategoria: (m) => m['universitario-primera'] || null },
    SGADD_CLIENTES: { estado: { clubes: [{ id: 'universitario',
      partidosManuales: { 'universitario-primera': { 'IDA|REGULAR': MANUALES } } }] } },
    SGADD_APP: { estado: { torneo: '*TOTAL*', fase: 'REGULAR' } },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const lista = ctx.clasifConPjDeTabla(idx, idx.lista());
  check('en el TOTAL, la lista del picker trae el PJ con los manuales',
    lista.filter(e => e.clave === 'UNIVERSITARIO')[0].pjTabla === 7);
  check('y la ficha lee la misma fila', ctx.clasifFilaDe(idx, 'UNIVERSITARIO').pj === 7);
  ctx.SGADD_APP.estado.torneo = 'VUELTA';
  check('en la VUELTA no cuentan los partidos de la IDA',
    ctx.clasifFilaDe(idx, 'UNIVERSITARIO').pj === 6);
  ctx.SGADD_CLIENTES.estado.clubes = null;
  check('sin catálogo, degrada al PJ de los partidos con estadísticas',
    ctx.clasifFilaDe(idx, 'UNIVERSITARIO').pj === 6);
}

titulo('5 · QUIÉN LO USA · la sección Equipos, Jugadores y los rankings');
{
  const eq = fs.readFileSync('./js/sgadd-equipos.js', 'utf8');
  const grilla = eq.slice(eq.indexOf('function equiposGrilla'), eq.indexOf('function equiposFicha'));
  check('las tarjetas de Equipos reciben el PJ de la tabla', /clasifConPjDeTabla\(idx, lista\)/.test(grilla));
  const header = eq.slice(eq.indexOf('function equiposHeader'), eq.indexOf('function equiposHeader') + 3000);
  check('el encabezado de la ficha usa el récord y el PJ de la tabla',
    /clasifFilaDe\(idx, e\.clave\)/.test(header) && /\$\{rec\.pj\} PJ/.test(header));
  check('y muestra el banner de los partidos sin estadísticas', /clasifBannerManual\(fila\)/.test(header));
  const cond = eq.slice(eq.indexOf('function equiposTabCondicion'), eq.indexOf('function equiposTabCondicion') + 4000);
  check('local y visitante, con los manuales', /condicionConManuales\(e\.split/.test(cond)
    && /cab\('De local', cond\.LOCAL\)/.test(cond));
  const ju = fs.readFileSync('./js/sgadd-jugadores.js', 'utf8');
  check('el picker de Jugadores, que es la misma tarjeta, también',
    /clasifConPjDeTabla\(idx, lista\)/.test(ju.slice(ju.indexOf('function jugadoresPickerEquipos'))));
  const rk = fs.readFileSync('./js/sgadd-rankings.js', 'utf8');
  check('la columna PJ de los rankings muestra el de la tabla', /clasifFilasVigentes\(idx\)/.test(rk) && /pjDe\(f\.equipo\)\.pj/.test(rk));
  check('y dice que los promedios salen de los partidos con estadísticas', /data-glosa="Partidos jugados, igual que en la tabla/.test(rk));
  check('el filtro de los rankings sigue usando la muestra del índice', /\(e\.pj \|\| 0\) >= PJ_MINIMO/.test(rk));
  const core = fs.readFileSync('./js/sgadd-core.js', 'utf8');
  check('el núcleo no suma manuales al `pj` del índice', !/pjTabla|partidosManuales/.test(core));
}

console.log(NL + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
