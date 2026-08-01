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

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
