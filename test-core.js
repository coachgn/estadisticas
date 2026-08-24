/* =====================================================================
   Núcleo: parsers, ESQUEMA, METRICAS, CATALOGO, INDICE, VALIDADOR.
   Fixtures chicas y autocontenidas, sin depender de test-fixtures/.
   ===================================================================== */
global.SGADD = require('./js/sgadd-core.js');
const S = SGADD;
let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const cerca = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < (tol || 1e-6);

console.log('\n1. PARSERS: num() y fecha()');
console.log('═'.repeat(70));
check('num() vacío es null', S.num('') === null);
check('num() null es null', S.num(null) === null);
check('num() de un número JS lo deja igual', S.num(42) === 42);
check('num() de NaN/Infinity es null', S.num(NaN) === null && S.num(Infinity) === null);
check('num() texto no numérico es null', S.num('abc') === null);
check('num() coma decimal simple', cerca(S.num('3,5'), 3.5));
check('num() formato es-AR con miles', cerca(S.num('1.234,56'), 1234.56));
check('num() porcentaje con coma', cerca(S.num('41,68%'), 0.4168));
check('num() porcentaje con punto', cerca(S.num('41.68%'), 0.4168));
check('num() con espacios sueltos', cerca(S.num(' 12,5 '), 12.5));

const d1 = S.fecha('Date(2026,4,5)');
check('fecha() GViz: mes 0-indexado (Date(2026,4,5) es mayo)', d1 && d1.getMonth() === 4 && d1.getDate() === 5 && d1.getFullYear() === 2026,
  d1 && d1.toISOString());
const d2 = S.fecha('2026-05-05');
check('fecha() ISO da el mismo resultado que el Date() de GViz', d1.getTime() === d2.getTime());
const d3 = S.fecha('01/05/2026');
check('fecha() dd/mm/aaaa: día primero (Liga Argentina)', d3 && d3.getDate() === 1 && d3.getMonth() === 4 && d3.getFullYear() === 2026,
  d3 && d3.toISOString());
check('fecha() sin año no es confiable: null', S.fecha('5/5') === null);
check('fecha() vacía es null', S.fecha('') === null && S.fecha(null) === null);
check('formatearFecha() da dd/mm', S.formatearFecha(new Date(2026, 4, 5)) === '05/05');
check('formatearFecha() de fecha inválida da —', S.formatearFecha(null) === '—');

console.log('\n2. NOMBRES: sufijos, claves y id de partido');
console.log('═'.repeat(70));
check('limpiarNombre() saca el sufijo de categoría', S.limpiarNombre("RECONQUISTA 'A' - MM") === "RECONQUISTA 'A'",
  S.limpiarNombre("RECONQUISTA 'A' - MM"));
check('claveEquipo() normaliza acentos, mayúsculas y sufijo', S.claveEquipo("ATENAS 'A' - U21M") === 'ATENAS A',
  S.claveEquipo("ATENAS 'A' - U21M"));
check('claveEquipo() sin sufijo no rompe', S.claveEquipo('Náutico Ensenada') === 'NAUTICO ENSENADA',
  S.claveEquipo('Náutico Ensenada'));
check('claveEquipo() de Liga Argentina conserva la provincia entre paréntesis como texto',
  S.claveEquipo('HINDU (C)') === 'HINDU C' && S.claveEquipo('COLON (SF)') === 'COLON SF',
  S.claveEquipo('HINDU (C)') + ' / ' + S.claveEquipo('COLON (SF)'));
check('claveEquipo() distingue mismo nombre con distinta provincia',
  S.claveEquipo('ESTUDIANTES (T)') !== S.claveEquipo('ESTUDIANTES DE LA PLATA'));
check('clavePersona() prolija la coma "APELLIDO , NOMBRE"',
  S.clavePersona('moreira , pedro') === 'MOREIRA, PEDRO', S.clavePersona('moreira , pedro'));

const idA = S.idPartido('RECONQUISTA vs ATENAS', 'Date(2026,4,5)');
check('idPartido() es FECHA ISO + slug', idA === '2026-05-05_reconquista-vs-atenas', idA);
const idB = S.idPartido('RECONQUISTA vs ATENAS', 'Date(2026,5,12)');
check('idPartido() distingue ida y vuelta con el mismo nombre (distinta fecha)', idA !== idB, idA + ' vs ' + idB);
check('idPartido() sin fecha usa el prefijo "sf"', S.idPartido('A vs B', '').indexOf('sf_') === 0);

check('mediana() par promedia los dos del medio', S.mediana([1, 2, 3, 4]) === 2.5);
check('mediana() impar toma el del medio', S.mediana([3, 1, 2]) === 2);
check('mediana() vacía es null', S.mediana([]) === null);
check('promedio() simple', S.promedio([1, 2, 3]) === 2);
check('promedio() vacío es null', S.promedio([]) === null);

console.log('\n3. ESQUEMA: contrato de columnas');
console.log('═'.repeat(70));
check('RANKINGS J y RANKINGS E quedan excluidas del ESQUEMA', !S.ESQUEMA['RANKINGS J'] && !S.ESQUEMA['RANKINGS E']);
check('y figuran en HOJAS_EXCLUIDAS', S.HOJAS_EXCLUIDAS.indexOf('RANKINGS J') !== -1 && S.HOJAS_EXCLUIDAS.indexOf('RANKINGS E') !== -1);
check('PROMEDIOS E y ACUMULADO E tienen fila TIPO', S.ESQUEMA['PROMEDIOS E'].filaTipo === 'EQUIPO TIPO' && S.ESQUEMA['ACUMULADO E'].filaTipo === 'EQUIPO TIPO');
check('las hojas partido a partido NO tienen fila TIPO', S.ESQUEMA['Base Datos E'].filaTipo === null && S.ESQUEMA['4 FACTORES'].filaTipo === null);
check('PROMEDIOS J exige USG%, PROMEDIOS E no', S.ESQUEMA['PROMEDIOS J'].req.indexOf('USG%') !== -1 && S.ESQUEMA['PROMEDIOS E'].req.indexOf('USG%') === -1);
check('POS y PACE son opcionales en PROMEDIOS E, no obligatorias', S.ESQUEMA['PROMEDIOS E'].opt.indexOf('PACE') !== -1 && S.ESQUEMA['PROMEDIOS E'].req.indexOf('PACE') === -1);
check('la clave de PROMEDIOS E es EQUIPO+FASE', S.ESQUEMA['PROMEDIOS E'].clave.join('+') === 'EQUIPO+FASE');
check('la clave de Base Datos J es PARTIDO+NOMBRES', S.ESQUEMA['Base Datos J'].clave.join('+') === 'PARTIDO+NOMBRES');

console.log('\n4. METRICAS: registro y formato');
console.log('═'.repeat(70));
check('formatear() pct usa coma y un decimal', S.formatear('eFG%', 0.4168) === '41,7%', S.formatear('eFG%', 0.4168));
check('formatear() int redondea', S.formatear('PJ', 12.4) === '12', S.formatear('PJ', 12.4));
check('formatear() num1 un decimal con coma', S.formatear('RTNG OFF', 87.24) === '87,2', S.formatear('RTNG OFF', 87.24));
check('formatear() num2 dos decimales con coma', S.formatear('PPP OF', 0.876) === '0,88', S.formatear('PPP OF', 0.876));
check('formatear() de null/NaN da —', S.formatear('PTS', null) === '—' && S.formatear('PTS', NaN) === '—');
check('RTNG DEF está marcado invertida (menos es mejor)', S.METRICAS['RTNG DEF'].invertida === true);
check('PTS no está invertida', S.METRICAS['PTS'].invertida === false);
check('metrica() de una clave inexistente da null', S.metrica('NO EXISTE') === null);
check('vista("factores-of") agrupa los 4 factores ofensivos',
  S.vista('factores-of').metricas.join(',') === ['eFG%', 'PePP%', 'RTL%', 'RO%'].join(','));
check('"distribucion-plays" está marcada sumaCien', S.VISTAS['distribucion-plays'].sumaCien === true);
check('"eficiencia" no es descriptiva (sí colorea)', S.VISTAS['eficiencia'].descriptiva === false);
check('contexto es un grupo descriptivo (PJ, MIN no colorean)', S.GRUPOS_DESCRIPTIVOS.indexOf('contexto') !== -1);

console.log('\n5. CATALOGO: planillas y ruteo');
console.log('═'.repeat(70));
check('planilla() encuentra por id', S.planilla('primera-clausura-2026') && S.planilla('primera-clausura-2026').categoria === 'PRIMERA');
check('planilla() de un id inexistente da null', S.planilla('no-existe') === null);
check('esEquipoPropio() matchea por patrón, no por igualdad', S.esEquipoPropio("RECONQUISTA 'A' - MM") === true);
check('esEquipoPropio() de un rival da false', S.esEquipoPropio('ATENAS') === false);

const porCategoria = S.agrupar(S.CATALOGO.planillas, 'categoria');
check('agrupar() junta las planillas por dimensión', porCategoria.get('PRIMERA') && porCategoria.get('PRIMERA').length === 1);

const visiblesDefault = S.planillasVisibles({});
check('planillasVisibles() sin scope solo trae las activas',
  visiblesDefault.every(p => p.activo), visiblesDefault.map(p => p.id));
const visiblesTodas = S.planillasVisibles({ incluirInactivas: true });
check('planillasVisibles({incluirInactivas:true}) trae el catálogo entero',
  visiblesTodas.length === S.CATALOGO.planillas.length, visiblesTodas.length + '/' + S.CATALOGO.planillas.length);
const soloAdicional = S.planillasVisibles({ modulos: ['adicional'] });
check('planillasVisibles() filtra por módulo contratado',
  soloAdicional.length === 1 && soloAdicional[0].modulo === 'adicional');

const r1 = S.Ruta.parse('#/negra-u19-clausura-2026/regular/equipos/atenas-a/4factores');
check('Ruta.parse() separa los niveles y mayúsculiza la fase',
  r1.planilla === 'negra-u19-clausura-2026' && r1.fase === 'REGULAR' && r1.seccion === 'equipos' && r1.entidad === 'atenas-a' && r1.tab === '4factores',
  JSON.stringify(r1));
check('Ruta.parse() de un hash vacío no rompe', S.Ruta.parse('').seccion === 'principal');
const construida = S.Ruta.build({ planilla: 'x', fase: 'REGULAR', seccion: 'equipos', entidad: 'atenas a' });
check('Ruta.build() codifica caracteres especiales', construida.indexOf('atenas%20a') !== -1, construida);
check('Ruta.parse(Ruta.build()) da una vuelta completa (roundtrip)',
  S.Ruta.parse(construida).entidad === 'atenas a', JSON.stringify(S.Ruta.parse(construida)));

/* Nivel de jugador (7mo segmento): pensado para un link cruzado puntual
   -por ejemplo desde el box score de un partido en Equipos hacia la ficha
   de ese jugador en Jugadores- donde todos los niveles anteriores ya están
   completos. Ver el comentario de Ruta en sgadd-core.js. */
const rutaConJugador = S.Ruta.build({
  planilla: 'primera-clausura-2026', fase: 'REGULAR', seccion: 'equipos',
  entidad: 'atenas-a', tab: 'partidos', sub: '2026-05-05_atenas-a-vs-reconquista-a',
  jugador: 'moreira pedro--atenas a',
});
const parseadaConJugador = S.Ruta.parse(rutaConJugador);
check('Ruta admite un 7mo nivel para un jugador puntual',
  parseadaConJugador.jugador === 'moreira pedro--atenas a', JSON.stringify(parseadaConJugador));
check('y no pisa ninguno de los niveles anteriores',
  parseadaConJugador.seccion === 'equipos' && parseadaConJugador.entidad === 'atenas-a' &&
  parseadaConJugador.tab === 'partidos' && parseadaConJugador.sub === '2026-05-05_atenas-a-vs-reconquista-a');
check('sin jugador, Ruta.parse() lo deja en null (no rompe lo existente)',
  S.Ruta.parse(construida).jugador === null);

console.log('\n6. PERCENTIL: la fila TIPO cae en 50');
console.log('═'.repeat(70));
const dist10 = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
check('el valor mediano exacto da percentil 50', S.percentil([10, 20, 30], 20, false) === 50);
check('el mejor valor (no invertida) tiende a 100', S.percentil(dist10, 100, false) > 90, S.percentil(dist10, 100, false));
check('el peor valor (no invertida) tiende a 0', S.percentil(dist10, 10, false) < 10, S.percentil(dist10, 10, false));
check('con invertida:true se da vuelta (menos es mejor)', S.percentil(dist10, 10, true) > 90, S.percentil(dist10, 10, true));
check('percentil() sin distribución da null', S.percentil([], 10, false) === null);
check('percentil() de un valor no numérico da null', S.percentil([1, 2, 3], null, false) === null);

console.log('\n7. INDICE: construirIndice()');
console.log('═'.repeat(70));
const colsE = ['EQUIPO', 'FASE', 'PJ', 'PTS', 'PACE'];
const filasE3 = [
  { EQUIPO: 'A', FASE: 'REGULAR', PJ: '10', PTS: '60', PACE: '80' },
  { EQUIPO: 'B', FASE: 'REGULAR', PJ: '10', PTS: '70', PACE: '85' },
  { EQUIPO: 'C', FASE: 'REGULAR', PJ: '10', PTS: '80', PACE: '90' },
  // Fila TIPO de LIGA: EQUIPO trae literalmente el identificador.
  { EQUIPO: 'EQUIPO TIPO', FASE: 'REGULAR', PJ: '10', PTS: '70,00', PACE: '85,00' },
  // Fila TIPO de UN equipo (no de liga): tiene que descartarse en construirIndice.
  { EQUIPO: 'A', FASE: 'REGULAR', PJ: 'EQUIPO TIPO', PTS: '60', PACE: '80' },
];
const idx3 = S.construirIndice({ 'PROMEDIOS E': { cols: colsE, filas: filasE3 } }, { fase: 'REGULAR' });
check('indexa un equipo por fila (sin contar las TIPO)', idx3.lista().length === 3, idx3.lista().map(e => e.nombre).join(','));
check('get() resuelve por el nombre crudo', idx3.get('A') && idx3.get('A').promedios.PTS === 60);
check('la fila TIPO de liga alimenta liga.tipo', idx3.liga.tipo.PTS === 70, idx3.liga.tipo.PTS);
check('leer() da el percentil correcto contra la distribución de 3 equipos',
  idx3.leer('B', 'PTS').percentil === 50, idx3.leer('B', 'PTS').percentil);
check('leer() trae el valor formateado', idx3.leer('C', 'PTS').formateado === '80,0', idx3.leer('C', 'PTS').formateado);
check('leer() de un equipo inexistente da null', idx3.leer('Z', 'PTS') === null);
const rk = idx3.ranking('C', 'PTS');
check('ranking() ubica al mejor en el puesto 1 de 3', rk.puesto === 1 && rk.de === 3, JSON.stringify(rk));

const vistaRitmo = idx3.leerVista('A', 'ritmo');
check('leerVista() arma una tabla completa para la sección', vistaRitmo.filas.length > 0 && vistaRitmo.filas.some(f => f.clave === 'PACE'));

console.log('\n7B. INDICE: jugadoresPorEquipo');
console.log('═'.repeat(70));
const colsJ = ['NOMBRES', 'EQUIPO', 'FASE', 'MIN', 'PTS'];
const filasJ = [
  { NOMBRES: 'PEREZ, JUAN', EQUIPO: 'A', FASE: 'REGULAR', MIN: '20', PTS: '12' },
  { NOMBRES: 'GOMEZ, LUIS', EQUIPO: 'A', FASE: 'REGULAR', MIN: '15', PTS: '8' },
  { NOMBRES: 'DIAZ, ANA', EQUIPO: 'B', FASE: 'REGULAR', MIN: '25', PTS: '14' },
  // Pocos minutos: por debajo del umbral de la liga (no califica).
  { NOMBRES: 'RUIZ, TOM', EQUIPO: 'B', FASE: 'REGULAR', MIN: '3', PTS: '2' },
  // Fila JUGADOR TIPO de liga (EQUIPO vacío): fija el umbral de minutos.
  { NOMBRES: 'JUGADOR TIPO', EQUIPO: '', FASE: 'REGULAR', MIN: '15', PTS: '10' },
];
const idxJ = S.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE3 },
  'PROMEDIOS J': { cols: colsJ, filas: filasJ },
}, { fase: 'REGULAR' });
check('agrupa por equipo, sin las filas TIPO',
  idxJ.liga.jugadoresPorEquipo.get('A').length === 2 && idxJ.liga.jugadoresPorEquipo.get('B').length === 2,
  JSON.stringify({ A: idxJ.liga.jugadoresPorEquipo.get('A').length, B: idxJ.liga.jugadoresPorEquipo.get('B').length }));
check('un equipo sin jugadores cargados no aparece en el mapa', !idxJ.liga.jugadoresPorEquipo.has('C'));
check('la suma de todos los grupos da liga.jugadores completo',
  Array.from(idxJ.liga.jugadoresPorEquipo.values()).reduce((s, a) => s + a.length, 0) === idxJ.liga.jugadores.length);
check('respeta el umbral de minutos calculado de JUGADOR TIPO: RUIZ no califica',
  idxJ.liga.jugadoresPorEquipo.get('B').find(j => j['NOMBRES'] === 'RUIZ, TOM').__califica === false);
check('las entradas del mapa son las MISMAS referencias que liga.jugadores (no copias)',
  idxJ.liga.jugadores.includes(idxJ.liga.jugadoresPorEquipo.get('A')[0]));

console.log('\n8. INDICE: partidos duplicados (ida y vuelta)');
console.log('═'.repeat(70));
const colsBD = ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'PTS', 'PTSopp'];
const filasBD = [
  { FECHA: '01/03/2026', PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'GANADO', PTS: '70', PTSopp: '60' },
  { FECHA: '01/03/2026', PARTIDO: 'A vs B', EQUIPO: 'B', FASE: 'REGULAR', CONDICION: 'VISITANTE', RESULTADO: 'PERDIDO', PTS: '60', PTSopp: '70' },
  // Revancha: se invierte local/visitante, como en la vuelta de una liga.
  { FECHA: '01/06/2026', PARTIDO: 'B vs A', EQUIPO: 'A', FASE: 'REGULAR', CONDICION: 'VISITANTE', RESULTADO: 'PERDIDO', PTS: '55', PTSopp: '65' },
  { FECHA: '01/06/2026', PARTIDO: 'B vs A', EQUIPO: 'B', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'GANADO', PTS: '65', PTSopp: '55' },
];
const idxBD = S.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE3 },
  'Base Datos E': { cols: colsBD, filas: filasBD },
}, { fase: 'REGULAR' });
check('ida y vuelta quedan indexados como dos partidos distintos',
  idxBD.get('A').partidosPorId.size === 2, idxBD.get('A').partidosPorId.size);
check('liga.partidos cuenta partidos DISTINTOS, no filas (2 partidos, 4 filas)', idxBD.liga.partidos === 2, idxBD.liga.partidos);
check('el récord del equipo A queda 1-1', idxBD.get('A').record.ganados === 1 && idxBD.get('A').record.perdidos === 1);

console.log('\n9. VALIDADOR: contrato de esquema');
console.log('═'.repeat(70));
const hojasIncompletas = {
  'PROMEDIOS E': { cols: ['EQUIPO', 'FASE'], filas: [{ EQUIPO: 'A', FASE: 'REGULAR' }] }, // sin PJ ni el resto de COLS_BOX
};
const probsSchema = S.validarEsquema(hojasIncompletas);
check('faltan columnas obligatorias → error', probsSchema.some(p => p.hoja === 'PROMEDIOS E' && p.nivel === 'error' && /PJ/.test(p.mensaje)));
check('faltan columnas opcionales (POS/PACE) → aviso, no error', probsSchema.some(p => p.hoja === 'PROMEDIOS E' && p.nivel === 'aviso' && /opcionales/.test(p.mensaje)));
check('sin la fila EQUIPO TIPO → aviso', probsSchema.some(p => p.hoja === 'PROMEDIOS E' && /EQUIPO TIPO/.test(p.mensaje)));
check('una hoja ausente del todo → error', S.validarEsquema({}).some(p => p.hoja === 'PROMEDIOS E' && /no existe/.test(p.mensaje)));

console.log('\n10. VALIDADOR: coherencia entre hojas gemelas');
console.log('═'.repeat(70));
const cohOk = S.validarCoherencia({
  'PROMEDIOS E': { cols: colsE, filas: [{ EQUIPO: 'A', FASE: 'REGULAR' }, { EQUIPO: 'B', FASE: 'REGULAR' }] },
  'ACUMULADO E': { cols: colsE, filas: [{ EQUIPO: 'A', FASE: 'REGULAR' }, { EQUIPO: 'B', FASE: 'REGULAR' }] },
});
check('mismo número de filas en promedios y acumulado → ok', cohOk.find(r => r.par.indexOf('PROMEDIOS E') === 0).nivel === 'ok');
const cohMal = S.validarCoherencia({
  'PROMEDIOS E': { cols: colsE, filas: [{ EQUIPO: 'A', FASE: 'REGULAR' }, { EQUIPO: 'B', FASE: 'REGULAR' }] },
  'ACUMULADO E': { cols: colsE, filas: [{ EQUIPO: 'A', FASE: 'REGULAR' }] },
});
check('una hoja con una fila de más → error', cohMal.find(r => r.par.indexOf('PROMEDIOS E') === 0).nivel === 'error');

const cohPartidos = S.validarCoherencia({ 'Base Datos E': { cols: colsBD, filas: filasBD.slice(0, 3) } }); // 3 filas: un partido queda huérfano
check('un partido con una sola fila (huérfano) → error', cohPartidos.find(r => /partidos completos/.test(r.par)).nivel === 'error');
const cohPartidosOk = S.validarCoherencia({ 'Base Datos E': { cols: colsBD, filas: filasBD } });
check('todos los partidos con sus dos filas → ok', cohPartidosOk.find(r => /partidos completos/.test(r.par)).nivel === 'ok');

console.log('\n11. VALIDADOR: invariantes exactos (Σ X = Σ Xopp)');
console.log('═'.repeat(70));
const colsAc = ['EQUIPO', 'FASE', 'PTS', 'PTSopp', 'RD', 'RDopp', 'RO', 'ROopp', 'PP', 'PPopp', 'PLAYS', 'PLAYSopp'];
const acOk = [
  { EQUIPO: 'A', FASE: 'REGULAR', PTS: '700', PTSopp: '650', RD: '300', RDopp: '280', RO: '90', ROopp: '85', PP: '140', PPopp: '135', PLAYS: '800', PLAYSopp: '790' },
  { EQUIPO: 'B', FASE: 'REGULAR', PTS: '650', PTSopp: '700', RD: '280', RDopp: '300', RO: '85', ROopp: '90', PP: '135', PPopp: '140', PLAYS: '790', PLAYSopp: '800' },
];
const totOk = S.testTotales({ 'ACUMULADO E': { cols: colsAc, filas: acOk } }, 'REGULAR');
check('Σ PTS = Σ PTSopp cuando la liga cierra → ok', totOk.find(t => t.par === 'Σ PTS = Σ PTSopp').nivel === 'ok');
const acMal = JSON.parse(JSON.stringify(acOk)); acMal[0].PTS = '900'; // desbalanceo manual
const totMal = S.testTotales({ 'ACUMULADO E': { cols: colsAc, filas: acMal } }, 'REGULAR');
check('un partido mal cargado rompe el invariante → error', totMal.find(t => t.par === 'Σ PTS = Σ PTSopp').nivel === 'error');

console.log('\n12. VALIDADOR: cruce partido por partido');
console.log('═'.repeat(70));
const cruceOk = S.testCrucePartidos({ 'Base Datos E': { cols: colsBD, filas: filasBD } }, 'REGULAR');
check('PTS de un lado = PTSopp del otro en cada partido → ok', cruceOk.find(c => c.par === 'PTS ↔ PTSopp').nivel === 'ok');
const filasBDmal = JSON.parse(JSON.stringify(filasBD)); filasBDmal[1].PTSopp = '999';
const cruceMal = S.testCrucePartidos({ 'Base Datos E': { cols: colsBD, filas: filasBDmal } }, 'REGULAR');
check('un cruce que no cierra en un partido puntual → error (más fino que el total)',
  cruceMal.find(c => c.par === 'PTS ↔ PTSopp').nivel === 'error');

console.log('\n13. VALIDADOR: simetría de liga (PROMEDIOS 4F)');
console.log('═'.repeat(70));
const cols4F = ['EQUIPO', 'FASE', 'PTS', 'PTSopp', 'eFG%', 'eFG Opp%', 'PP%', 'PP Opp%', 'RTL%', 'RTL Opp%', 'RO%', 'RO Opp%', 'RTNG OFF', 'RTNG DEF'];
const simOk = [
  { EQUIPO: 'A', FASE: 'REGULAR', PTS: '70', PTSopp: '65', 'eFG%': '0,50', 'eFG Opp%': '0,48', 'PP%': '0,15', 'PP Opp%': '0,14', 'RTL%': '0,20', 'RTL Opp%': '0,19', 'RO%': '0,28', 'RO Opp%': '0,27', 'RTNG OFF': '100', 'RTNG DEF': '95' },
  { EQUIPO: 'B', FASE: 'REGULAR', PTS: '65', PTSopp: '70', 'eFG%': '0,48', 'eFG Opp%': '0,50', 'PP%': '0,14', 'PP Opp%': '0,15', 'RTL%': '0,19', 'RTL Opp%': '0,20', 'RO%': '0,27', 'RO Opp%': '0,28', 'RTNG OFF': '95', 'RTNG DEF': '100' },
];
const simRes = S.testSimetria({ 'PROMEDIOS 4F': { cols: cols4F, filas: simOk } }, 'REGULAR');
check('en una liga que cierra, eFG%/eFG Opp% coinciden en promedio → ok', simRes.find(s => s.par === 'eFG% / eFG Opp%').nivel === 'ok');
check('sin PROMEDIOS 4F, avisa que no puede correr', S.testSimetria({}, 'REGULAR')[0].nivel === 'error');

/* =====================================================================
   CONTRATO CON MOTORSTATS (el productor de las planillas)

   SGADD consume lo que escribe el motor de Apps Script. Estos tests
   amarran el contrato: si el motor agrega columnas o cambia la convención
   de celdas vacías, el panel tiene que seguir funcionando o avisar — nunca
   perder datos en silencio.
   ===================================================================== */
console.log('\nZ. CONTRATO CON EL MOTOR (MotorStats v30/v43/v44/v48)');
console.log('═'.repeat(70));

/* --- Las columnas del motor están declaradas como opcionales --- */
const HOJAS_MOTOR = ['PROMEDIOS E', 'ACUMULADO E', 'Base Datos E', 'PROMEDIOS 4F',
  'ACUMULADO 4F', '4 FACTORES', 'PROMEDIOS J', 'ACUMULADO J', 'Base Datos J'];
check('las 9 hojas declaran las columnas del motor en la clave `motor`',
  HOJAS_MOTOR.every(h => (SGADD.ESQUEMA[h].motor || []).indexOf('TORNEO') !== -1),
  HOJAS_MOTOR.filter(h => (SGADD.ESQUEMA[h].motor || []).indexOf('TORNEO') === -1).join(','));
check('las tres: TORNEO, ID_ARCHIVO y +/-',
  HOJAS_MOTOR.every(h => ['TORNEO', 'ID_ARCHIVO', '+/-']
    .every(c => (SGADD.ESQUEMA[h].motor || []).indexOf(c) !== -1)));
/* La regresión que casi meto: en `opt` el validador avisa cuando faltan, y
   con la planilla real de Reconquista eso daba 9 avisos por columnas que no
   degradan absolutamente nada. */
check('NO están en opt: si faltan no se avisa, porque no degradan ninguna vista',
  HOJAS_MOTOR.every(h => ['TORNEO', 'ID_ARCHIVO', '+/-']
    .every(c => (SGADD.ESQUEMA[h].opt || []).indexOf(c) === -1)));
check('NINGUNA de esas tres es obligatoria: las planillas actuales no las traen',
  HOJAS_MOTOR.every(h => ['TORNEO', 'ID_ARCHIVO', '+/-']
    .every(c => (SGADD.ESQUEMA[h].req || []).indexOf(c) === -1)));

/* --- Una planilla en esquema v52 no puede romper el validador --- */
const colsV52E = ['EQUIPO', 'TORNEO', 'FASE', 'PJ'].concat(
  SGADD.ESQUEMA['PROMEDIOS E'].req.filter(c => ['EQUIPO', 'FASE', 'PJ'].indexOf(c) === -1));
const filaV52 = {}; colsV52E.forEach(c => { filaV52[c] = '1'; });
Object.assign(filaV52, { EQUIPO: 'A', TORNEO: 'APERTURA', FASE: 'REGULAR', PJ: '3' });
/* Se filtra por la hoja bajo prueba: las otras 8 faltan en la fixture y
   reportan "no existe", que es correcto y no es lo que se está midiendo. */
const errV52 = SGADD.validarEsquema({ 'PROMEDIOS E': { cols: colsV52E, filas: [filaV52] } })
  .filter(x => x.nivel === 'error' && x.hoja === 'PROMEDIOS E');
check('una hoja con las columnas nuevas del motor NO produce error de esquema',
  errV52.length === 0, JSON.stringify(errV52.map(e => e.mensaje).slice(0, 2)));

/* --- Guard de TORNEO: el defecto que el motor corrigió en su v49 --- */
const colsT = ['EQUIPO', 'TORNEO', 'FASE', 'PJ', 'PTS'];
const dosT = SGADD.validarTorneo({ 'PROMEDIOS E': { cols: colsT, filas: [
  { EQUIPO: 'A', TORNEO: 'APERTURA', FASE: 'REGULAR', PJ: '5', PTS: '80' },
  { EQUIPO: 'A', TORNEO: 'CLAUSURA', FASE: 'REGULAR', PJ: '4', PTS: '60' },
] } });
/* Antes esto era un ERROR (el índice agrupaba por EQUIPO + FASE y el
   segundo torneo pisaba al primero). Con el índice scopeado por torneo
   dejó de serlo: es un aviso informativo de que se está viendo un recorte. */
check('dos torneos en la misma hoja son AVISO, ya no error: el índice scopea por torneo',
  dosT.length === 1 && dosT[0].nivel === 'aviso', JSON.stringify(dosT));
check('el mensaje nombra los dos torneos y manda al selector',
  /APERTURA/.test(dosT[0].mensaje) && /CLAUSURA/.test(dosT[0].mensaje) &&
  /selector/i.test(dosT[0].mensaje));

const mixto = SGADD.validarTorneo({ 'PROMEDIOS E': { cols: colsT, filas: [
  { EQUIPO: 'A', TORNEO: 'APERTURA', FASE: 'REGULAR', PJ: '5', PTS: '80' },
  { EQUIPO: 'B', TORNEO: '', FASE: 'REGULAR', PJ: '4', PTS: '60' },
] } });
check('convención mixta (parte con TORNEO, parte sin) es AVISO, no error',
  mixto.length === 1 && mixto[0].nivel === 'aviso', JSON.stringify(mixto));

check('un solo torneo no dispara nada: es el caso de todos los clubes hoy',
  SGADD.validarTorneo({ 'PROMEDIOS E': { cols: colsT, filas: [
    { EQUIPO: 'A', TORNEO: 'APERTURA', FASE: 'REGULAR', PJ: '5', PTS: '80' }] } }).length === 0);
check('una planilla pre-v44 (sin la columna) tampoco: no hay nada que revisar',
  SGADD.validarTorneo({ 'PROMEDIOS E': { cols: ['EQUIPO', 'FASE', 'PJ'],
    filas: [{ EQUIPO: 'A', FASE: 'REGULAR', PJ: '5' }] } }).length === 0);
check('la fila EQUIPO TIPO no cuenta como torneo faltante',
  SGADD.validarTorneo({ 'PROMEDIOS E': { cols: colsT, filas: [
    { EQUIPO: 'A', TORNEO: 'APERTURA', FASE: 'REGULAR', PJ: '5', PTS: '80' },
    { EQUIPO: 'EQUIPO TIPO', TORNEO: '', FASE: 'REGULAR', PJ: '5', PTS: '70' },
  ] } }).length === 0);

/* --- Regla de celdas vacías (motor v48 · P3) --- */
check('num("") es null: "no jugó" no es "jugó y sacó cero"', SGADD.num('') === null);
check('num(0) sigue siendo 0: tiró y erró ES un dato', SGADD.num(0) === 0);

const colsJv48 = ['NOMBRES', 'EQUIPO', 'FASE', 'PJ', 'MIN', 'PTS', 'PLAYS', 'USG%', 'eFG%', 'TS%', 'PPP'];
const jv48 = (n, min, efg) => ({ NOMBRES: n, EQUIPO: 'A', FASE: 'REGULAR', PJ: '3', MIN: String(min),
  PTS: '10', PLAYS: '10', 'USG%': '0,2', 'eFG%': efg, 'TS%': efg, PPP: '1' });
const idxV48 = SGADD.construirIndice({
  'PROMEDIOS E': { cols: ['EQUIPO', 'FASE', 'PJ'], filas: [{ EQUIPO: 'A', FASE: 'REGULAR', PJ: '3' }] },
  'PROMEDIOS J': { cols: colsJv48, filas: [
    jv48('BUENO', 30, '0,60'), jv48('MEDIO', 25, '0,50'), jv48('FLOJO', 20, '0,40'),
    jv48('NO JUGO', 22, ''),   // MIN alto pero tasa vacía: el caso de v48
    Object.assign(jv48('JUGADOR TIPO', 15, '0,50'), { EQUIPO: '' }),
  ] },
}, { fase: 'REGULAR' });
check('una tasa vacía no entra a la distribución de la liga',
  (idxV48.liga.distribucionesJ['eFG%'] || []).length === 3,
  JSON.stringify(idxV48.liga.distribucionesJ['eFG%']));
check('y el jugador con tasa vacía no arrastra el percentil de los demás hacia arriba',
  idxV48.leerJugador(idxV48.liga.jugadores.find(j => j['NOMBRES'] === 'FLOJO'), 'eFG%').percentil < 34);
check('el que no jugó queda con la métrica en null, no en 0',
  idxV48.leerJugador(idxV48.liga.jugadores.find(j => j['NOMBRES'] === 'NO JUGO'), 'eFG%').valor === null);

/* --- `+/-` registrado como métrica conocida --- */
check('+/- está en el registro de métricas', !!SGADD.metrica('+/-'));
check('+/- NO es invertida: más es mejor', SGADD.metrica('+/-').invertida === false);
check('+/- NO se agregó a ninguna VISTA del núcleo: las tablas que lo muestran lo arman en la UI',
  Object.keys(SGADD.VISTAS).every(v => SGADD.VISTAS[v].metricas.indexOf('+/-') === -1));

/* Formato `signo`: sin el "+" adelante un +/- se lee como un total. */
check('+/- positivo lleva signo explícito', SGADD.formatear('+/-', 12) === '+12');
check('+/- negativo conserva el menos', SGADD.formatear('+/-', -5) === '-5');
check('+/- en cero va pelado, sin signo', SGADD.formatear('+/-', 0) === '0');
check('+/- promedio va con un decimal y coma', SGADD.formatear('+/-', 3.42) === '+3,4');
check('+/- promedio negativo también', SGADD.formatear('+/-', -3.42) === '-3,4');
check('+/- sin dato es raya, no cero', SGADD.formatear('+/-', null) === '—');

/* El +/- de EQUIPO es el margen del partido, NUNCA la suma de los cinco
   individuales: en cancha hay 5 a la vez y esa suma da ~5x el margen. */
check('masMenosEquipo es el margen real del partido', SGADD.masMenosEquipo(88, 69) === 19);
check('masMenosEquipo da negativo en la derrota', SGADD.masMenosEquipo(69, 88) === -19);
check('masMenosEquipo sin puntos del rival devuelve null, no NaN',
  SGADD.masMenosEquipo(88, null) === null && SGADD.masMenosEquipo(88, undefined) === null);
check('el margen de equipo NO coincide con la suma de los +/- individuales', (() => {
  // 5 en cancha, cada uno con el +/- del partido que ganaron por 19.
  const box = [{ '+/-': 19 }, { '+/-': 19 }, { '+/-': 19 }, { '+/-': 19 }, { '+/-': 19 }];
  const suma = box.reduce((a, j) => a + j['+/-'], 0);
  return suma === 95 && SGADD.masMenosEquipo(88, 69) === 19 && suma !== SGADD.masMenosEquipo(88, 69);
})());


/* =====================================================================
   AA. MULTI-TORNEO · scope del índice y ruteo con la competencia

   Un libro puede traer Apertura y Clausura con la MISMA fase "REGULAR" y
   los mismos equipos. Sin scopear, las filas del segundo torneo pisan a
   las del primero y nadie se entera.

   La clave compuesta NO va en `claveEquipo()` a propósito: esa función es
   el normalizador de NOMBRES y la usan los escudos, `esEquipoPropio`, los
   slugs de la URL y la extracción del rival —que parte el texto "A vs B"
   del campo PARTIDO, donde no hay ni torneo ni fase. Una clave compuesta
   ahí dejaría todos los rivales de la app en blanco.
   ===================================================================== */
console.log('\nAA. MULTI-TORNEO (scope del índice + ruteo)');
console.log('═'.repeat(70));

check('claveEquipo NO devuelve una clave compuesta: sigue siendo el normalizador de nombres',
  SGADD.claveEquipo("ATENAS 'A' - MM") === 'ATENAS A', SGADD.claveEquipo("ATENAS 'A' - MM"));
check('sin eso, la extracción del rival desde el texto "A vs B" seguiría matcheando',
  SGADD.claveEquipo('ATENAS A') === SGADD.claveEquipo("ATENAS 'A' - MM"));

/* --- torneosDisponibles --- */
const colsMT = ['EQUIPO', 'TORNEO', 'FASE', 'PJ', 'PTS'];
const filaMT = (eq, tor, pj, pts) => ({ EQUIPO: eq, TORNEO: tor, FASE: 'REGULAR', PJ: String(pj), PTS: String(pts) });
const libroDosTorneos = {
  'PROMEDIOS E': { cols: colsMT, filas: [
    filaMT('ATENAS A', 'APERTURA', 5, 80),
    filaMT('GIMNASIA', 'APERTURA', 5, 70),
    filaMT('ATENAS A', 'CLAUSURA', 4, 60),
    filaMT('GIMNASIA', 'CLAUSURA', 4, 90),
    { EQUIPO: 'EQUIPO TIPO', TORNEO: '', FASE: 'REGULAR', PJ: '5', PTS: '75' },
  ] },
};
const torneos = SGADD.torneosDisponibles(libroDosTorneos);
check('torneosDisponibles encuentra los dos torneos del libro',
  torneos.length === 2 && torneos[0].id === 'APERTURA' && torneos[1].id === 'CLAUSURA',
  JSON.stringify(torneos));
check('vienen ordenados alfabéticamente, no por orden de aparición',
  torneos.map(t => t.id).join() === 'APERTURA,CLAUSURA');
check('la fila EQUIPO TIPO no se cuenta como un torneo más',
  torneos.every(t => t.id !== ''));
check('una planilla pre-v44 (sin la columna) devuelve un único GENERAL',
  (() => {
    const l = SGADD.torneosDisponibles({ 'PROMEDIOS E': { cols: ['EQUIPO', 'FASE', 'PJ'],
      filas: [{ EQUIPO: 'A', FASE: 'REGULAR', PJ: '5' }] } });
    return l.length === 1 && l[0].id === SGADD.TORNEO_GENERAL && l[0].unico === true;
  })());
check('torneoDeFila cae a GENERAL cuando la fila no trae la columna',
  SGADD.torneoDeFila({ EQUIPO: 'A' }) === SGADD.TORNEO_GENERAL);
check('torneoDeFila mayusculiza: "apertura" y "APERTURA" son el mismo torneo',
  SGADD.torneoDeFila({ TORNEO: 'apertura' }) === 'APERTURA');

/* --- El scope del índice: dos "REGULAR" homónimos no se colapsan --- */
const idxAp = SGADD.construirIndice(libroDosTorneos, { fase: 'REGULAR', torneo: 'APERTURA' });
const idxCl = SGADD.construirIndice(libroDosTorneos, { fase: 'REGULAR', torneo: 'CLAUSURA' });
check('el índice de Apertura toma los PTS de Apertura',
  idxAp.get('ATENAS A') && idxAp.get('ATENAS A').promedios['PTS'] === 80,
  idxAp.get('ATENAS A') && idxAp.get('ATENAS A').promedios['PTS']);
check('el índice de Clausura toma los PTS de Clausura, sin pisar al otro',
  idxCl.get('ATENAS A') && idxCl.get('ATENAS A').promedios['PTS'] === 60,
  idxCl.get('ATENAS A') && idxCl.get('ATENAS A').promedios['PTS']);
check('cada torneo cuenta sus propios equipos, no la suma de los dos',
  idxAp.liga.n === 2 && idxCl.liga.n === 2, idxAp.liga.n + '/' + idxCl.liga.n);
check('el índice recuerda a qué torneo pertenece',
  idxAp.liga.torneo === 'APERTURA' && idxCl.liga.torneo === 'CLAUSURA');
check('sin torneo pedido, el índice es GENERAL y no filtra nada',
  SGADD.construirIndice(libroDosTorneos, { fase: 'REGULAR' }).liga.torneo === SGADD.TORNEO_GENERAL);

/* Retrocompatibilidad: la planilla vieja no tiene TORNEO y tiene que
   indexarse igual, sin que el filtro le vacíe las filas. */
const libroViejo = { 'PROMEDIOS E': { cols: ['EQUIPO', 'FASE', 'PJ', 'PTS'], filas: [
  { EQUIPO: 'ATENAS A', FASE: 'REGULAR', PJ: '5', PTS: '80' },
  { EQUIPO: 'GIMNASIA', FASE: 'REGULAR', PJ: '5', PTS: '70' },
] } };
check('una planilla sin columna TORNEO se indexa igual bajo GENERAL',
  SGADD.construirIndice(libroViejo, { fase: 'REGULAR' }).liga.n === 2);
check('y tampoco se vacía si alguien le pide un torneo que no existe: las filas sin torneo pasan siempre',
  SGADD.construirIndice(libroViejo, { fase: 'REGULAR', torneo: 'APERTURA' }).liga.n === 2);

/* --- Ruteo #/<planilla>/<torneo>/<fase>/<seccion>/... --- */
const rNuevo = SGADD.Ruta.parse('#/primera/APERTURA/REGULAR/equipos/atenas-a/plantel');
check('Ruta.parse lee el torneo del formato nuevo',
  rNuevo.torneo === 'APERTURA' && rNuevo.fase === 'REGULAR' && rNuevo.seccion === 'equipos',
  JSON.stringify(rNuevo));
check('y no se come la entidad ni el tab al correr un nivel',
  rNuevo.entidad === 'atenas-a' && rNuevo.tab === 'plantel');

/* El formato viejo tiene que seguir andando: hay links compartidos y
   favoritos guardados con #/<planilla>/<fase>/<seccion>. La detección usa
   el vocabulario cerrado de SECCIONES, que es finito y conocido. */
const rViejo = SGADD.Ruta.parse('#/primera/REGULAR/equipos/atenas-a/plantel');
check('Ruta.parse sigue leyendo el formato viejo, sin torneo',
  rViejo.torneo === null && rViejo.fase === 'REGULAR' && rViejo.seccion === 'equipos',
  JSON.stringify(rViejo));
check('en el formato viejo la entidad y el tab tampoco se corren',
  rViejo.entidad === 'atenas-a' && rViejo.tab === 'plantel');
check('un hash corto viejo (#/planilla/fase/seccion) se sigue entendiendo',
  (() => { const r = SGADD.Ruta.parse('#/primera/REGULAR/jugadores');
    return r.torneo === null && r.fase === 'REGULAR' && r.seccion === 'jugadores'; })());
check('SECCIONES es el vocabulario que decide el formato y están las 6',
  SGADD.SECCIONES.length === 6 &&
  ['principal', 'equipos', 'jugadores', 'scouting', 'simulador', 'diagnostico']
    .every(s => SGADD.SECCIONES.indexOf(s) !== -1), SGADD.SECCIONES.join(','));

const hashNuevo = SGADD.Ruta.build({ planilla: 'primera', torneo: 'APERTURA', fase: 'REGULAR',
  seccion: 'equipos', entidad: 'atenas-a', tab: 'plantel' });
check('Ruta.build inserta el torneo entre planilla y fase',
  hashNuevo === '#/primera/APERTURA/REGULAR/equipos/atenas-a/plantel', hashNuevo);
check('roundtrip build→parse conserva el torneo',
  SGADD.Ruta.parse(hashNuevo).torneo === 'APERTURA');
/* GENERAL no se escribe: una planilla de un solo torneo no tiene por qué
   arrastrar un /GENERAL/ en cada link que comparte el DT. */
check('Ruta.build OMITE el torneo cuando es GENERAL',
  SGADD.Ruta.build({ planilla: 'primera', torneo: SGADD.TORNEO_GENERAL, fase: 'REGULAR', seccion: 'equipos' })
    === '#/primera/REGULAR/equipos');
check('Ruta.build sin torneo escribe el formato viejo, igual que antes',
  SGADD.Ruta.build({ planilla: 'primera', fase: 'REGULAR', seccion: 'equipos' })
    === '#/primera/REGULAR/equipos');
check('roundtrip del formato viejo: parse(build()) no inventa un torneo',
  SGADD.Ruta.parse(SGADD.Ruta.build({ planilla: 'primera', fase: 'REGULAR', seccion: 'jugadores' })).torneo === null);
check('el torneo también se codifica: un nombre con espacio no parte la ruta',
  SGADD.Ruta.build({ planilla: 'p', torneo: 'COPA DE ORO', fase: 'REGULAR', seccion: 'equipos' })
    .indexOf('COPA%20DE%20ORO') !== -1);
check('y vuelve entero al parsear',
  SGADD.Ruta.parse(SGADD.Ruta.build({ planilla: 'p', torneo: 'COPA DE ORO', fase: 'REGULAR', seccion: 'equipos' })).torneo === 'COPA DE ORO');


/* =====================================================================
   AB. JOIN DE FECHA POR PARTIDO

   `idPartido()` = FECHA + PARTIDO. Si `Base Datos J` trae la FECHA vacía y
   `Base Datos E` no, el mismo partido tiene dos ids y nunca cruzan: el box
   score del detalle de partido queda huérfano. `Base Datos E` es la fuente
   de verdad y las otras dos hojas heredan de ahí.
   ===================================================================== */
console.log('\nAB. JOIN DE FECHA POR PARTIDO (Base Datos E manda)');
console.log('═'.repeat(70));

const colsJoinE = ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'PTS', 'PTSopp'];
const colsJoinJ = ['FECHA', 'PARTIDO', 'NOMBRES', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'MIN', 'PTS'];
const colsJoin4F  = ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'PPP OF'];

/* Un solo cruce por texto de PARTIDO: caso NO ambiguo, se puede heredar. */
const libroJoin = {
  'PROMEDIOS E': { cols: ['EQUIPO', 'FASE', 'PJ'], filas: [
    { EQUIPO: 'A', FASE: 'REGULAR', PJ: '1' }, { EQUIPO: 'B', FASE: 'REGULAR', PJ: '1' } ] },
  'Base Datos E': { cols: colsJoinE, filas: [
    { FECHA: '01/05/2026', PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'GANADO', PTS: '70', PTSopp: '60' },
    { FECHA: '01/05/2026', PARTIDO: 'A vs B', EQUIPO: 'B', FASE: 'REGULAR', CONDICION: 'VISITANTE', RESULTADO: 'PERDIDO', PTS: '60', PTSopp: '70' } ] },
  /* Las dos hojas que vienen SIN fecha, que es el caso real del motor. */
  '4 FACTORES': { cols: colsJoin4F, filas: [
    { FECHA: '', PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', 'PPP OF': '1,05' },
    { FECHA: '', PARTIDO: 'A vs B', EQUIPO: 'B', FASE: 'REGULAR', 'PPP OF': '0,90' } ] },
  'Base Datos J': { cols: colsJoinJ, filas: [
    { FECHA: '', PARTIDO: 'A vs B', NOMBRES: 'UNO, J', EQUIPO: 'A', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'GANADO', MIN: '25', PTS: '18' },
    { FECHA: '', PARTIDO: 'A vs B', NOMBRES: 'DOS, K', EQUIPO: 'B', FASE: 'REGULAR', CONDICION: 'VISITANTE', RESULTADO: 'PERDIDO', MIN: '22', PTS: '12' } ] },
};
const idxJoin = SGADD.construirIndice(libroJoin, { fase: 'REGULAR' });
const idEsperado = SGADD.idPartido('A vs B', '01/05/2026');
const pJoin = idxJoin.partido(idEsperado);

check('el id del partido sale con la fecha de Base Datos E',
  idEsperado === '2026-05-01_a-vs-b', idEsperado);
check('el partido existe y tiene sus dos lados', !!pJoin && pJoin.completo);
/* La regresión que motivó todo esto: conBox venía false en los 72 partidos. */
check('conBox es TRUE: las filas sin fecha de Base Datos J heredaron y cruzaron',
  !!pJoin && pJoin.conBox === true);
check('cada lado trae su propio box score, no el del rival',
  pJoin.lados.every(l => l.box.length === 1) &&
  pJoin.lados.find(l => l.equipo.clave === 'A').box[0]['NOMBRES'] === 'UNO, J');
/* 4 FACTORES ya heredaba la fecha, pero DESPUÉS de calcular el __id, así
   que factoresPorId seguía sin matchear. Ahora la fecha entra al cómputo. */
check('4 FACTORES también cruza: el lado trae sus factores, no null',
  pJoin.lados.every(l => l.factores !== null),
  JSON.stringify(pJoin.lados.map(l => l.equipo.clave + ':' + (l.factores ? 'ok' : 'null'))));
check('la fila del jugador queda con la fecha heredada, no vacía',
  idxJoin.liga.jugadorPartidos.get(SGADD.clavePersona('UNO, J'))[0].__fecha instanceof Date);

/* --- Guard de ambigüedad: ida y vuelta con el mismo texto de PARTIDO --- */
const libroAmbiguo = {
  'PROMEDIOS E': libroJoin['PROMEDIOS E'],
  'Base Datos E': { cols: colsJoinE, filas: libroJoin['Base Datos E'].filas.concat([
    { FECHA: '15/06/2026', PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'PERDIDO', PTS: '55', PTSopp: '65' },
    { FECHA: '15/06/2026', PARTIDO: 'A vs B', EQUIPO: 'B', FASE: 'REGULAR', CONDICION: 'VISITANTE', RESULTADO: 'GANADO', PTS: '65', PTSopp: '55' },
  ]) },
  'Base Datos J': libroJoin['Base Datos J'],
};
const idxAmb = SGADD.construirIndice(libroAmbiguo, { fase: 'REGULAR' });
/* En ida y vuelta el texto "A vs B" no identifica el partido: lo único que
   los separa es la fecha, que es el dato que falta. Heredar sería atribuirle
   al jugador la noche equivocada, que es peor que no cruzar. */
check('con ida y vuelta NO se hereda: la fila sin fecha queda con id sf_',
  idxAmb.liga.jugadorPartidos.get(SGADD.clavePersona('UNO, J'))[0].__id.indexOf('sf_') === 0,
  idxAmb.liga.jugadorPartidos.get(SGADD.clavePersona('UNO, J'))[0].__id);
check('y ninguno de los dos cruces se lleva un box score que no le toca',
  idxAmb.partido('2026-05-01_a-vs-b').conBox === false &&
  idxAmb.partido('2026-06-15_a-vs-b').conBox === false);
check('el Diagnóstico avisa del cruce ambiguo en vez de callarlo',
  idxAmb.avisos.some(a => /ida y vuelta/i.test(a)), JSON.stringify(idxAmb.avisos));
check('sin ambigüedad no se avisa nada de esto',
  !idxJoin.avisos.some(a => /ida y vuelta/i.test(a)), JSON.stringify(idxJoin.avisos));

/* --- Retrocompat: una planilla que YA trae la fecha en las tres hojas --- */
const libroConFecha = {
  'PROMEDIOS E': libroJoin['PROMEDIOS E'],
  'Base Datos E': libroJoin['Base Datos E'],
  'Base Datos J': { cols: colsJoinJ, filas: libroJoin['Base Datos J'].filas.map(f =>
    Object.assign({}, f, { FECHA: '01/05/2026' })) },
};
check('con la fecha ya cargada el resultado es el mismo: el join no la pisa',
  SGADD.construirIndice(libroConFecha, { fase: 'REGULAR' }).partido(idEsperado).conBox === true);

/* =====================================================================
   EL NOMBRE DEL EQUIPO PIERDE EL SUFIJO DE CATEGORÍA, EN TODAS LAS TIRAS

   El índice recortaba solo `- MM` con una regex propia, así que en Primera
   se veía limpio y en U21/U23 la UI mostraba "ATENAS - U23" mientras los
   escudos —que sí usan el normalizador— resolvían "ATENAS". El nombre sale
   ahora de `limpiarNombre()`, que conoce las tres formas.
   ===================================================================== */
console.log('\nSUFIJO DE CATEGORIA EN EL NOMBRE');
console.log('═'.repeat(70));

const colsSuf = ['EQUIPO', 'FASE', 'PJ', 'PTS'];
const filasSuf = [
  { EQUIPO: "ATENAS 'A' - MM", FASE: 'REGULAR', PJ: '5', PTS: '70' },
  { EQUIPO: 'ATENAS - U23', FASE: 'REGULAR', PJ: '5', PTS: '60' },
  { EQUIPO: 'C.C TOLOSANO - U23M', FASE: 'REGULAR', PJ: '5', PTS: '65' },
  { EQUIPO: 'HINDU (C)', FASE: 'REGULAR', PJ: '5', PTS: '68' },
];
const idxSuf = S.construirIndice({ 'PROMEDIOS E': { cols: colsSuf, filas: filasSuf } }, { fase: 'REGULAR' });
const nombresSuf = idxSuf.lista().map(e => e.nombre);
check('el sufijo de Primera se recorta', nombresSuf.indexOf("ATENAS 'A'") !== -1, nombresSuf.join(' | '));
check('y tambien el de U23 y U23M',
  nombresSuf.indexOf('ATENAS') !== -1 && nombresSuf.indexOf('C.C TOLOSANO') !== -1, nombresSuf.join(' | '));
/* Liga Argentina: los parentesis son la PROVINCIA y distinguen equipos. */
check('los parentesis de Liga Argentina no se tocan',
  nombresSuf.indexOf('HINDU (C)') !== -1, nombresSuf.join(' | '));
check('el nombre limpio no colisiona con la clave',
  !!idxSuf.get('ATENAS A') && !!idxSuf.get('ATENAS') &&
  idxSuf.get('ATENAS A').nombre === "ATENAS 'A'" && idxSuf.get('ATENAS').nombre === 'ATENAS');

/* =====================================================================
   LA CARGA DE UNA CATEGORIA NO SE PUEDE COLGAR

   Sintoma real reportado por el club: al cambiar a U21 o U23 la barra
   quedaba en "Cargando..." y no se recuperaba nunca; Primera funcionaba
   porque ya estaba cargada. La causa: `cargarCategoria` cachea la PROMESA
   por sheetId, asi que un `fetch` que no resuelve nunca —conexion a medio
   abrir— dejaba esa categoria muerta hasta recargar la pagina.
   ===================================================================== */
console.log('\nCARGA DE CATEGORIA: TECHO, CACHE Y FRACASO');
console.log('='.repeat(70));

const fetchOriginal = global.fetch;
const respuestaOk = (nombre) => ({
  ok: true,
  text: () => Promise.resolve(")]}'\n" + JSON.stringify({
    status: 'ok',
    table: { cols: [{ label: 'EQUIPO' }, { label: 'FASE' }], rows: [{ c: [{ v: 'A' }, { v: 'REGULAR' }] }] },
  })),
});

(async function pruebasDeCarga() {
  /* 1 · Un fetch que NO resuelve nunca tiene que cortar por techo. */
  let pedidos = 0;
  global.fetch = () => { pedidos++; return new Promise(() => {}); };   // jamas settle
  S.limpiarCache();
  const t0 = Date.now();
  const r1 = await S.cargarCategoria('COLGADA', { hojas: ['PROMEDIOS E'], timeout: 120 });
  const tardo = Date.now() - t0;
  check('un fetch que nunca contesta se corta por techo y no cuelga la app',
    Object.keys(r1.hojas).length === 0 && r1.errores.length === 1 && tardo < 3000, tardo + 'ms');
  check('y el error dice que no hubo respuesta, no "error desconocido"',
    /sin respuesta/.test(r1.errores[0].mensaje), r1.errores[0].mensaje);

  /* 2 · Un fracaso TOTAL no se cachea: el proximo intento vuelve a pedir.
     Sin esto, una caida momentanea dejaba esa categoria muerta hasta
     recargar la pagina, que es exactamente lo que reporto el club. */
  const pedidosAntes = pedidos;
  await S.cargarCategoria('COLGADA', { hojas: ['PROMEDIOS E'], timeout: 120 });
  check('un fracaso total NO queda cacheado: se reintenta de verdad',
    pedidos > pedidosAntes, 'pedidos ' + pedidosAntes + ' -> ' + pedidos);

  /* 3 · Una carga que SI sirvio se cachea, que es para lo que esta el cache. */
  global.fetch = () => { pedidos++; return Promise.resolve(respuestaOk()); };
  S.limpiarCache();
  await S.cargarCategoria('BUENA', { hojas: ['PROMEDIOS E'] });
  const pedidosTrasBuena = pedidos;
  const r3 = await S.cargarCategoria('BUENA', { hojas: ['PROMEDIOS E'] });
  check('una carga que funciono se sirve del cache, sin volver a pedir',
    pedidos === pedidosTrasBuena && !!r3.hojas['PROMEDIOS E'], 'pedidos ' + pedidos);

  /* 4 · Una hoja caida NO tira abajo al resto: la planilla incompleta sigue
     sirviendo y el Diagnostico avisa. */
  S.limpiarCache();
  global.fetch = (url) => (/Base%20Datos%20J|Base Datos J/.test(url)
    ? Promise.reject(new Error('HTTP 500'))
    : Promise.resolve(respuestaOk()));
  const r4 = await S.cargarCategoria('MIXTA', { hojas: ['PROMEDIOS E', 'Base Datos J'] });
  check('una hoja caida se degrada sola y el resto entra igual',
    !!r4.hojas['PROMEDIOS E'] && r4.errores.length === 1, JSON.stringify(Object.keys(r4.hojas)));

  check('el techo por hoja es explicito y no un numero magico suelto',
    typeof S.TIMEOUT_HOJA === 'number' && S.TIMEOUT_HOJA >= 5000, S.TIMEOUT_HOJA);

  global.fetch = fetchOriginal;
  S.limpiarCache();

  console.log('\n' + '='.repeat(70));
  /* =====================================================================
   EL LIBRO DESALINEADO · maestras y derivadas con torneos distintos

   Caso real, libro U23 de Reconquista al 2026-08-24:

     Base Datos E  (maestra)  → IDA 134 filas · VUELTA 30
     PROMEDIOS E   (derivada) → APERTURA 13 filas

   Intersección VACÍA. Cada hoja por separado se ve impecable, y sin
   embargo ningún torneo elegible tiene a la vez promedios y partidos: se
   abría una vista con 12 equipos, 252 jugadores y CERO partidos, sin
   decir por qué. Se arregla en el motor; el panel tiene que denunciarlo.
   ===================================================================== */
console.log('\nTORNEOS · maestras vs derivadas');
console.log('═'.repeat(70));

const hDesal = {
  'PROMEDIOS E':  { cols: ['EQUIPO', 'FASE', 'TORNEO'], filas: [
    { EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'APERTURA' },
    { EQUIPO: 'B', FASE: 'REGULAR', TORNEO: 'APERTURA' }] },
  'PROMEDIOS 4F': { cols: ['EQUIPO', 'FASE', 'TORNEO'], filas: [
    { EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'APERTURA' }] },
  'PROMEDIOS J':  { cols: ['NOMBRES', 'EQUIPO', 'FASE', 'TORNEO'], filas: [
    { NOMBRES: 'X, Y', EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'APERTURA' }] },
  'Base Datos E': { cols: ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'TORNEO'], filas: [
    { FECHA: '01/05/2026', PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'IDA' },
    { FECHA: '08/05/2026', PARTIDO: 'B vs A', EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'VUELTA' }] },
};
const tDesal = SGADD.torneosDisponibles(hDesal);

check('el selector ofrece los tres torneos que existen en el libro',
  tDesal.map(t => t.id).join(',') === 'APERTURA,IDA,VUELTA', tDesal.map(t => t.id).join(','));
/* El orden es alfabético a propósito: el selector es una lista, no un
   ranking, y reordenarlo movería de lugar los torneos de un libro sano. */
check('y en orden alfabético, no por disponibilidad',
  tDesal[0].id === 'APERTURA');

check('cada torneo dice en cuántas hojas clave aparece',
  tDesal.find(t => t.id === 'APERTURA').cobertura === 3 &&
  tDesal.find(t => t.id === 'IDA').cobertura === 1,
  tDesal.map(t => t.id + ':' + t.cobertura).join(' '));
check('y si tiene partidos cargados',
  tDesal.find(t => t.id === 'APERTURA').conPartidos === false &&
  tDesal.find(t => t.id === 'IDA').conPartidos === true);

/* El defecto NO es "el que tenga partidos": se probó contra el libro real
   y eso cambiaba 252 jugadores / 0 partidos por 67 partidos / 0 jugadores.
   Cambiar un agujero por otro no es arreglarlo, y encima elige por el DT
   sin decírselo. Gana el recorte que MÁS muestra. */
check('el libro abre por el torneo de mayor cobertura',
  SGADD.torneoPorDefecto(tDesal) === 'APERTURA', SGADD.torneoPorDefecto(tDesal));
/* En un libro sano todos cubren todo y gana el primero, o sea exactamente
   lo que hacía la app hasta ahora: nadie ve cambiar su categoría. */
const tSano = SGADD.torneosDisponibles({
  'PROMEDIOS E':  { cols: ['EQUIPO', 'FASE', 'TORNEO'], filas: [
    { EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'APERTURA' },
    { EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'CLAUSURA' }] },
  'Base Datos E': { cols: ['PARTIDO', 'EQUIPO', 'FASE', 'TORNEO'], filas: [
    { PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'APERTURA' },
    { PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'CLAUSURA' }] },
});
check('en un libro sano el defecto no cambia: el primero',
  SGADD.torneoPorDefecto(tSano) === 'APERTURA');
check('y una planilla sin la columna sigue cayendo a GENERAL',
  SGADD.torneoPorDefecto(SGADD.torneosDisponibles({
    'PROMEDIOS E': { cols: ['EQUIPO', 'FASE'], filas: [{ EQUIPO: 'A', FASE: 'REGULAR' }] },
  })) === SGADD.TORNEO_GENERAL);

/* --- El validador: es el ÚNICO que puede ver este cruce --- */
const vDesal = SGADD.validarTorneo(hDesal);
const errCruce = vDesal.find(v => v.nivel === 'error' && /no coinciden en/.test(v.mensaje));
check('el Diagnóstico denuncia la intersección vacía', !!errCruce);
/* ERROR y no aviso: no es un recorte incompleto, es un libro que no se
   puede leer entero desde ninguna posición del selector. */
check('y lo hace como ERROR, no como aviso',
  errCruce && errCruce.nivel === 'error');
check('nombra las dos hojas y qué trae cada una',
  errCruce && /IDA, VUELTA/.test(errCruce.mensaje) && /APERTURA/.test(errCruce.mensaje));
/* El DT no puede arreglarlo desde el panel: tiene que saber a quién ir. */
check('y dice que se arregla en el motor, no en el panel',
  errCruce && /MotorStats/.test(errCruce.mensaje));

/* El caso a medias —algunos torneos cruzan y otros no— es aviso: el libro
   se puede leer, pero hay recortes que quedan mudos. */
const vParcial = SGADD.validarTorneo({
  'PROMEDIOS E':  { cols: ['EQUIPO', 'FASE', 'TORNEO'], filas: [
    { EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'APERTURA' },
    { EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'CLAUSURA' }] },
  'Base Datos E': { cols: ['PARTIDO', 'EQUIPO', 'FASE', 'TORNEO'], filas: [
    { PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'APERTURA' }] },
});
const avParcial = vParcial.find(v => /ningún partido cargado/.test(v.mensaje));
check('los torneos con promedios pero sin partidos salen como aviso',
  !!avParcial && avParcial.nivel === 'aviso' && /CLAUSURA/.test(avParcial.mensaje));

/* Un libro sano no puede generar ruido: si el Diagnóstico avisa siempre,
   se deja de leer. */
check('un libro alineado no dispara ninguno de los dos',
  !SGADD.validarTorneo({
    'PROMEDIOS E':  { cols: ['EQUIPO', 'FASE', 'TORNEO'], filas: [
      { EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'VUELTA' }] },
    'Base Datos E': { cols: ['PARTIDO', 'EQUIPO', 'FASE', 'TORNEO'], filas: [
      { PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'VUELTA' }] },
  }).length);
/* Y una planilla pre-v44, sin la columna, tampoco. */
check('ni una planilla sin la columna TORNEO',
  !SGADD.validarTorneo({
    'PROMEDIOS E':  { cols: ['EQUIPO', 'FASE'], filas: [{ EQUIPO: 'A', FASE: 'REGULAR' }] },
    'Base Datos E': { cols: ['PARTIDO', 'EQUIPO', 'FASE'], filas: [{ PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR' }] },
  }).length);

/* El aviso va DONDE EL DT MIRA, no solo en Diagnóstico. */
const appJs = require('fs').readFileSync('./js/sgadd-app.js', 'utf8');
check('la barra avisa cuando el recorte elegido queda mudo',
  /const avisoTorneo =/.test(appJs) && /\$\{avisoTorneo\}/.test(appJs));
check('y distingue si lo que falta son partidos o jugadores',
  /const faltante = [\s\S]{0,300}'partidos'[\s\S]{0,200}'jugadores'/.test(appJs));
check('el defecto del libro sale de torneoPorDefecto, no de torneos[0]',
  /SGADD\.torneoPorDefecto\(torneos\)/.test(appJs) &&
  !/estado\.torneo = torneos\[0\]\.id/.test(appJs));

/* =====================================================================
   EL RECÁLCULO A MEDIAS · la derivada cubre menos equipos que la maestra

   Caso real, libro U21 de Reconquista al 2026-08-24:

     Base Datos E  →  132 filas · 12 equipos · 66 partidos
     PROMEDIOS E   →  3 filas: UN equipo, el primero del abecedario
     PROMEDIOS J   →  21 filas: los jugadores de ESE equipo

   Las maestras completas y las derivadas a mitad de camino, como si el
   motor se hubiera cortado durante el recálculo. La app NO se rompe —12
   equipos, 66 partidos, 18 jugadores— y eso es el problema: parece que
   funciona. Un plantel de 18 para una liga entera se lee como una liga
   chica, no como un error, y todos los percentiles salen de ahí.

   Ningún validador lo veía: el bloque 2 compara PROMEDIOS contra
   ACUMULADO —y ahí coinciden, los dos tienen 3 filas— pero nadie comparaba
   las derivadas contra la MAESTRA, que es la que sabe cuántos equipos hay.
   ===================================================================== */
console.log('\nCOBERTURA · derivadas contra la maestra');
console.log('═'.repeat(70));

const maestra12 = { cols: ['PARTIDO', 'EQUIPO', 'FASE'],
  filas: Array.from({ length: 12 }, (_, i) => ({ PARTIDO: 'x', EQUIPO: 'EQ' + i, FASE: 'REGULAR' })) };
const derivada = (n) => ({ cols: ['EQUIPO', 'FASE'],
  filas: Array.from({ length: n }, (_, i) => ({ EQUIPO: 'EQ' + i, FASE: 'REGULAR' }))
    .concat([{ EQUIPO: 'EQUIPO TIPO', FASE: 'REGULAR' }]) });

const vMedias = SGADD.validarTorneo({
  'Base Datos E': maestra12, 'PROMEDIOS E': derivada(1), 'ACUMULADO E': derivada(1),
});
const errCob = vMedias.find(v => v.hoja === 'PROMEDIOS E');
check('el Diagnóstico caza la derivada incompleta', !!errCob);
/* ERROR y no aviso: los percentiles de toda la sección salen de esa
   muestra, así que no es un detalle cosmético. */
check('y lo hace como ERROR', errCob && errCob.nivel === 'error');
check('dice cuántos hay de cada lado',
  errCob && /12 equipos y PROMEDIOS E solo 1/.test(errCob.mensaje), errCob && errCob.mensaje);
check('y nombra a los que faltan, sin escupir los doce',
  errCob && /EQ1, EQ10/.test(errCob.mensaje) && /más/.test(errCob.mensaje));
check('dice que se reprocesa en el motor, no en el panel',
  errCob && /MotorStats/.test(errCob.mensaje));
check('revisa las tres derivadas de equipo',
  vMedias.filter(v => /solo \d+\./.test(v.mensaje)).length === 2 &&
  !!vMedias.find(v => v.hoja === 'ACUMULADO E'));

/* La fila EQUIPO TIPO no es un equipo: si contara, un libro sano daría
   siempre una diferencia de uno. */
check('la fila TIPO no se cuenta como equipo',
  !SGADD.validarTorneo({ 'Base Datos E': maestra12, 'PROMEDIOS E': derivada(12) })
    .some(v => /solo \d+\./.test(v.mensaje)));
/* Y no puede haber falsos positivos por el normalizador de nombres: la
   maestra escribe "ATENAS 'A' - U21M" y la derivada lo mismo. */
check('los nombres se comparan normalizados',
  !SGADD.validarTorneo({
    'Base Datos E': { cols: ['PARTIDO', 'EQUIPO', 'FASE'],
      filas: [{ PARTIDO: 'x', EQUIPO: "ATENAS 'A' - U21M", FASE: 'REGULAR' }] },
    'PROMEDIOS E': { cols: ['EQUIPO', 'FASE'], filas: [{ EQUIPO: 'ATENAS A', FASE: 'REGULAR' }] },
  }).some(v => /solo \d+\./.test(v.mensaje)));

/* Sin una de las dos hojas no se puede comparar, y no poder no es un
   error: una planilla incompleta ya se degrada sola. */
check('sin la maestra no inventa un error',
  !SGADD.validarTorneo({ 'PROMEDIOS E': derivada(1) }).length);
/* =====================================================================
   LA TASA SIN DENOMINADOR NO ES CERO, ES QUE NO PASÓ

   `Base Datos J` escribe 0 donde debería ir blanco: el motor blanquea
   recién en PROMEDIOS, no en el registro crudo por partido (hueco abierto
   del lado de MotorStats). Medido en Primera · Vuelta 2026 el 2026-08-24:
   247 de 1965 filas con MIN = 0 traían eFG%, TS%, T2%, T3%, T1%, PPP,
   USG% y RTL% en cero duro, y entraban a la media y al desvío.
   ===================================================================== */
console.log('\nTASAS SIN DENOMINADOR');
console.log('═'.repeat(70));

/* Una noche sin minutos: no tiró, no jugó, no hay porcentaje. */
const nocheVacia = SGADD.blanquearTasasSinDenominador({
  MIN: 0, PTS: 0, PLAYS: 0, TCC: 0, TCI: 0, T2C: 0, T2I: 0, T3C: 0, T3I: 0,
  T1C: 0, T1I: 0, RD: 0, AST: 0,
  'eFG%': 0, 'TS%': 0, 'T2%': 0, 'T3%': 0, 'T1%': 0, 'PPP': 0, 'USG%': 0, 'RTL%': 0,
});
check('sin un solo tiro, las tasas quedan en blanco',
  ['eFG%', 'TS%', 'T2%', 'T3%', 'T1%', 'PPP', 'USG%', 'RTL%']
    .every(k => nocheVacia[k] === null),
  JSON.stringify(nocheVacia));
/* Las CUENTAS no se tocan: 0 puntos en una noche sin minutos es un dato
   real. Lo que no es un dato es el porcentaje. */
check('pero las cuentas siguen en cero, que sí es un dato',
  nocheVacia.PTS === 0 && nocheVacia.T3C === 0 && nocheVacia.RD === 0 && nocheVacia.AST === 0);

/* La distinción que importa, y que un filtro por MIN > 0 no ve. */
const tiroYErro = SGADD.blanquearTasasSinDenominador({
  MIN: 12, PLAYS: 7, TCC: 0, TCI: 5, T2C: 0, T2I: 5, T3C: 0, T3I: 0, T1C: 1, T1I: 2,
  'eFG%': 0, 'T2%': 0, 'T3%': 0, 'T1%': 0.5, 'PPP': 0,
});
check('tiró y erró: el 0 se conserva, es un dato',
  tiroYErro['eFG%'] === 0 && tiroYErro['T2%'] === 0 && tiroYErro['PPP'] === 0);
check('y no tiró de tres: ESO sí se blanquea, aunque haya jugado',
  tiroYErro['T3%'] === null);
check('el T1% real no se toca', tiroYErro['T1%'] === 0.5);

/* TS% mezcla tiros de campo con libres: con solo libres lanzados sigue
   estando definido, así que basta que UNA columna del denominador tenga
   volumen. */
const soloLibres = SGADD.blanquearTasasSinDenominador({
  MIN: 5, TCI: 0, T1I: 4, T1C: 3, 'TS%': 0.75, 'eFG%': 0, 'T1%': 0.75,
});
check('TS% sobrevive si tiró libres aunque no tiros de campo',
  soloLibres['TS%'] === 0.75);
check('y eFG%, que solo mira tiros de campo, se blanquea',
  soloLibres['eFG%'] === null);

/* Sin la columna del denominador no se puede saber, y no saber no
   habilita a borrar un dato. */
check('sin la columna del denominador, la tasa se deja como está',
  SGADD.blanquearTasasSinDenominador({ 'T3%': 0.4 })['T3%'] === 0.4);
/* AST-PP queda AFUERA: su denominador son las pérdidas y el motor tiene su
   propia convención para el caso sin pérdidas. */
check('AST-PP no entra: el motor tiene su convención y manda la planilla',
  !('AST-PP' in SGADD.DENOMINADOR_TASA));

/* =====================================================================
   `formatear` GUARDA POR TIPO, NO CON isFinite

   `isFinite('')` es **true** —el string vacío se convierte a 0—, así que
   una celda vacía de una columna numérica pasaba la guarda y reventaba
   con `valor.toFixed is not a function`.

   Lo destapó la migración del 2026-08-24: el libro de Primera pasó a
   traer `+/-` (v30+) con celdas vacías. Antes la columna no existía y el
   valor era `undefined`, que sí caía en la guarda. El tab Partidos de
   cualquier jugador con una noche sin `+/-` lanzaba y no se pintaba.
   ===================================================================== */
console.log('\nformatear · guarda por tipo');
console.log('═'.repeat(70));

check('una celda VACÍA de una columna numérica no tumba la vista',
  SGADD.formatear('+/-', '') === '—' && SGADD.formatear('PTS', '') === '—');
check('ni una que traiga espacios', SGADD.formatear('PTS', '   ') === '—');
check('null y undefined siguen dando ausente',
  SGADD.formatear('+/-', null) === '—' && SGADD.formatear('+/-', undefined) === '—');
/* El cero es un DATO y tiene que verse: no llegar a ninguno de los dos es
   distinto de no haber estado. */
check('pero el cero se sigue mostrando, que es un dato',
  SGADD.formatear('+/-', 0) === '0' && SGADD.formatear('PTS', 0) === '0,0');
check('y los números de siempre no cambiaron',
  SGADD.formatear('+/-', 12) === '+12' && SGADD.formatear('+/-', -5) === '-5' &&
  SGADD.formatear('PTS', 3.456) === '3,5');

/* La corrección se aplica al INDEXAR, antes de que la fila entre a
   `jugadorPartidos` y contamine media, desvío y atípicos. */
const coreJs = require('fs').readFileSync('./js/sgadd-core.js', 'utf8');
check('el blanqueo corre al indexar Base Datos J',
  /blanquearTasasSinDenominador\(datos\);/.test(coreJs));
check('y antes de meter la fila en jugadorPartidos',
  coreJs.indexOf('blanquearTasasSinDenominador(datos);') <
  coreJs.indexOf('liga.jugadorPartidos.get(datos.__clave).push(datos)'));

console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
