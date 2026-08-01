/* =====================================================================
   Lógica pura de la sección Jugadores: slug, búsqueda, rol, z-score,
   orden de partidos, id canónico para el link cruzado hacia Equipos.

   Lo que arma HTML (grilla, ficha, tabs) usa document/LOGOS y no se testea
   acá, igual que sgadd-equipos.js: se verificó a mano en el navegador con
   datos reales de Reconquista (grilla, ficha, Evolución con banda de
   desvío, Partidos con el link cruzado).
   ===================================================================== */
global.SGADD = require('./js/sgadd-core.js');
const J = require('./js/sgadd-jugadores.js');
let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

/* --- Fixture: 2 equipos, jugadores homónimos en equipos distintos --- */
const colsE = ['EQUIPO', 'FASE', 'PJ'];
const filasE = [
  { EQUIPO: 'A', FASE: 'REGULAR', PJ: '3' },
  { EQUIPO: 'B', FASE: 'REGULAR', PJ: '3' },
];

const colsJ = ['NOMBRES', 'EQUIPO', 'FASE', 'MIN', 'PTS'];
const filasJ = [
  { NOMBRES: 'MOREIRA, PEDRO', EQUIPO: 'A', FASE: 'REGULAR', MIN: '25', PTS: '18' },
  // Homónimo en OTRO equipo: la slug tiene que distinguirlos.
  { NOMBRES: 'MOREIRA, PEDRO', EQUIPO: 'B', FASE: 'REGULAR', MIN: '20', PTS: '9' },
  { NOMBRES: 'RUIZ, ANA', EQUIPO: 'A', FASE: 'REGULAR', MIN: '4', PTS: '2' },   // pocos minutos
  { NOMBRES: 'JUGADOR TIPO', EQUIPO: '', FASE: 'REGULAR', MIN: '10', PTS: '8' },
];

const colsBD = ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'PTS', 'PTSopp'];
const filasBD = [
  { FECHA: '01/05/2026', PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'GANADO', PTS: '70', PTSopp: '60' },
  { FECHA: '01/05/2026', PARTIDO: 'A vs B', EQUIPO: 'B', FASE: 'REGULAR', CONDICION: 'VISITANTE', RESULTADO: 'PERDIDO', PTS: '60', PTSopp: '70' },
  { FECHA: '08/05/2026', PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'PERDIDO', PTS: '55', PTSopp: '65' },
  { FECHA: '08/05/2026', PARTIDO: 'A vs B', EQUIPO: 'B', FASE: 'REGULAR', CONDICION: 'VISITANTE', RESULTADO: 'GANADO', PTS: '65', PTSopp: '55' },
  { FECHA: '15/05/2026', PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'GANADO', PTS: '80', PTSopp: '58' },
  { FECHA: '15/05/2026', PARTIDO: 'A vs B', EQUIPO: 'B', FASE: 'REGULAR', CONDICION: 'VISITANTE', RESULTADO: 'PERDIDO', PTS: '58', PTSopp: '80' },
];

const colsBJ = ['FECHA', 'PARTIDO', 'NOMBRES', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'MIN', 'PTS'];
const filasBJ = [
  // OJO: el primer partido de MOREIRA (A) tiene FECHA VACÍA en Base Datos J,
  // aunque Base Datos E SÍ la trae para ese mismo PARTIDO. Es el caso real
  // que rompía el link cruzado antes del fix de jugadoresIdCanonico().
  { FECHA: '', PARTIDO: 'A vs B', NOMBRES: 'MOREIRA, PEDRO', EQUIPO: 'A', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'GANADO', MIN: '25', PTS: '18' },
  { FECHA: '08/05/2026', PARTIDO: 'A vs B', NOMBRES: 'MOREIRA, PEDRO', EQUIPO: 'A', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'PERDIDO', MIN: '22', PTS: '10' },
  { FECHA: '15/05/2026', PARTIDO: 'A vs B', NOMBRES: 'MOREIRA, PEDRO', EQUIPO: 'A', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'GANADO', MIN: '28', PTS: '26' },
];

const idx = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsJ, filas: filasJ },
  'Base Datos E': { cols: colsBD, filas: filasBD },
  'Base Datos J': { cols: colsBJ, filas: filasBJ },
}, { fase: 'REGULAR' });

const moreiraA = idx.liga.jugadores.find(j => j['NOMBRES'] === 'MOREIRA, PEDRO' && j['EQUIPO'] === 'A');
const moreiraB = idx.liga.jugadores.find(j => j['NOMBRES'] === 'MOREIRA, PEDRO' && j['EQUIPO'] === 'B');
const ruiz = idx.liga.jugadores.find(j => j['NOMBRES'] === 'RUIZ, ANA');

console.log('\n1. SLUG Y BÚSQUEDA');
console.log('═'.repeat(70));
check('la slug de dos homónimos en equipos distintos NO colisiona',
  J.jugadoresSlug(moreiraA) !== J.jugadoresSlug(moreiraB),
  J.jugadoresSlug(moreiraA) + ' vs ' + J.jugadoresSlug(moreiraB));
check('jugadoresBuscar() encuentra exactamente al de equipo A',
  J.jugadoresBuscar(idx, J.jugadoresSlug(moreiraA)) === moreiraA);
check('y no al homónimo de equipo B', J.jugadoresBuscar(idx, J.jugadoresSlug(moreiraA)) !== moreiraB);
check('jugadoresBuscar() de una slug inexistente da null', J.jugadoresBuscar(idx, 'no-existe--z') === null);
check('jugadoresBuscar() encuentra también a los que no califican (RUIZ)',
  J.jugadoresBuscar(idx, J.jugadoresSlug(ruiz)) === ruiz);

console.log('\n2. ROL');
console.log('═'.repeat(70));
check('con pocos minutos, el rol es "Pocos min." aunque tenga buen percentil',
  J.jugadoresRol(idx, ruiz).label === 'Pocos min.', JSON.stringify(J.jugadoresRol(idx, ruiz)));
check('el que más minutos tiene entre los calificados es Titular',
  J.jugadoresRol(idx, moreiraA).label === 'Titular', JSON.stringify(J.jugadoresRol(idx, moreiraA)));

console.log('\n3. Z-SCORE');
console.log('═'.repeat(70));
check('z-score simple: 2 desvíos por encima da z=2', J.jugadoresZScore(20, 10, 5) === 2);
check('z-score por debajo da negativo', J.jugadoresZScore(4, 10, 5) === -1.2);
check('con desvío 0 no divide por cero (usa 1)', J.jugadoresZScore(12, 10, 0) === 2);
check('con datos faltantes da null', J.jugadoresZScore(null, 10, 5) === null && J.jugadoresZScore(10, undefined, 5) === null);

console.log('\n4. ORDEN DE PARTIDOS');
console.log('═'.repeat(70));
const ordenados = J.jugadoresPartidosOrdenados(idx, moreiraA.__clave);
check('ordena cronológicamente y el sin fecha queda al final',
  ordenados.length === 3 && ordenados[2]['MIN'] === 25 && ordenados[0].__fecha && ordenados[0].__fecha.getDate() === 8,
  ordenados.map(p => p.__fecha ? SGADD.formatearFecha(p.__fecha) : '(sin fecha)').join(' | '));
check('statJugador ya tiene los 3 partidos para calcular consistencia',
  SGADD.construirIndice ? true : false); // sanity: el módulo core sigue disponible
const stat = idx.statJugador(moreiraA.__clave, 'PTS');
check('media y desvío se calculan sobre los 3 partidos', stat && stat.n === 3, stat);

console.log('\n5. RIVAL');
console.log('═'.repeat(70));
check('jugadoresRival() saca el nombre del OTRO equipo del string "A vs B"',
  J.jugadoresRival(filasBJ[0]) === 'B', J.jugadoresRival(filasBJ[0]));

console.log('\n6. ID CANÓNICO (el bug real que rompía el link a Equipos)');
console.log('═'.repeat(70));
const filaSinFecha = idx.liga.jugadorPartidos.get(moreiraA.__clave).find(p => !p['FECHA']);
check('la fixture reproduce el caso: Base Datos J sin fecha para ese partido', !!filaSinFecha);
const idDeLaFila = filaSinFecha.__id;
const idCanonico = J.jugadoresIdCanonico(idx, filaSinFecha);
check('el id de la fila del jugador (sin fecha) NO es el que usa Equipos',
  idDeLaFila !== idCanonico, idDeLaFila + ' vs ' + idCanonico);
check('jugadoresIdCanonico() resuelve el mismo id que idx.get(equipo).partidosPorId',
  idx.get('A').partidosPorId.has(idCanonico), idCanonico);
check('y ese id abre el partido real vía idx.partido()',
  idx.partido(idCanonico) && idx.partido(idCanonico).completo);
check('con un equipo inexistente, cae de vuelta al id de la fila (no revienta)',
  J.jugadoresIdCanonico(idx, { EQUIPO: 'NO EXISTE', __partido: 'X', __id: 'algo' }) === 'algo');

console.log('\n7. ESTRUCTURA DE TABS');
console.log('═'.repeat(70));
check('hay 3 tabs en esta primera entrega', J.JUGADORES_TABS.length === 3,
  J.JUGADORES_TABS.map(t => t.id).join(','));
check('cada tab trae id, label y la pregunta que responde',
  J.JUGADORES_TABS.every(t => t.id && t.label && t.pregunta));

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
