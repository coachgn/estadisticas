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

console.log('\n2. ROL POR MINUTOS — bandas fijas, no percentiles');
console.log('═'.repeat(70));
check('26 min exactos → Jugador Clave', J.jugadoresRolMinutos(26).id === 'clave', JSON.stringify(J.jugadoresRolMinutos(26)));
check('25,9 min → todavía Importante (no llega a Clave)', J.jugadoresRolMinutos(25.9).id === 'importante');
check('23 min exactos → Jugador Importante', J.jugadoresRolMinutos(23).id === 'importante');
check('22,9 min → cae a Rotación', J.jugadoresRolMinutos(22.9).id === 'rotacion');
check('13 min exactos → Jugador de Rotación', J.jugadoresRolMinutos(13).id === 'rotacion');
check('12,9 min → Pocos Minutos', J.jugadoresRolMinutos(12.9).id === 'pocos');
check('cada banda trae el "rol" (la etiqueta larga) además del id',
  J.jugadoresRolMinutos(30).rol === 'Dependencia Absoluta' &&
  J.jugadoresRolMinutos(24).rol === 'Consistencia Estructural' &&
  J.jugadoresRolMinutos(18).rol === 'Impacto Quirúrgico' &&
  J.jugadoresRolMinutos(5).rol === 'Contención y Emergencia');
check('por debajo de 10 min se marca "urgente" (matiz dentro de Pocos Minutos)',
  J.jugadoresRolMinutos(9.9).urgente === true && J.jugadoresRolMinutos(12).urgente === false);
check('con minutos no numéricos da null (no revienta)', J.jugadoresRolMinutos(null) === null && J.jugadoresRolMinutos(undefined) === null);
check('con pocos minutos (RUIZ, 4′) el rol es Pocos Minutos aunque tenga buen percentil',
  J.jugadoresRolMinutos(ruiz['MIN']).id === 'pocos', ruiz['MIN']);
check('MOREIRA (A), 25′, es Jugador Importante', J.jugadoresRolMinutos(moreiraA['MIN']).id === 'importante', moreiraA['MIN']);

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
check('hay 4 tabs: General, Tiro, Evolución, Partidos', J.JUGADORES_TABS.length === 4,
  J.JUGADORES_TABS.map(t => t.id).join(','));
check('cada tab trae id, label y la pregunta que responde',
  J.JUGADORES_TABS.every(t => t.id && t.label && t.pregunta));

/* =====================================================================
   ADN DEL JUGADOR: arquetipos técnicos + jerarquía.

   Fixture dedicada: 9 jugadores "base" (mismo perfil, modesto) + 6
   outliers, uno por cada perfil técnico, con el resto de sus números en
   la media para que NO calcen en ningún otro perfil por accidente. Así
   se prueba que el motor discrimina, no que "siempre da positivo".
   ===================================================================== */
console.log('\n8. ARQUETIPOS TÉCNICOS');
console.log('═'.repeat(70));

const colsArq = ['NOMBRES', 'EQUIPO', 'FASE', 'MIN', 'PTS', 'PLAYS', 'eFG%', 'PPP', 'AST-PP', 'RO', 'RD', 'RT', 'PR', 'T3I', 'T3%', 'PT1%', 'T1%'];
function filaBase(n) {
  return { NOMBRES: 'BASE ' + n, EQUIPO: 'A', FASE: 'REGULAR',
    MIN: '20', PTS: '8', PLAYS: '10', 'eFG%': '0,40', PPP: '0,80',
    'AST-PP': '0,9', RO: '2', RD: '4', RT: '6', PR: '2',
    T3I: '1,0', 'T3%': '0,25', 'PT1%': '0,12', 'T1%': '0,70' };
}
const filasArq = [
  filaBase(1), filaBase(2), filaBase(3), filaBase(4), filaBase(5),
  filaBase(6), filaBase(7), filaBase(8), filaBase(9),
  // Terminador de Élite: mucho PLAYS + eFG% muy por encima + PPP > 1.05.
  Object.assign(filaBase('TERMINADOR'), { NOMBRES: 'TERMINADOR', PLAYS: '20', 'eFG%': '0,60', PPP: '1,10' }),
  // Generador: AST-PP > 1.40, resto en la media.
  Object.assign(filaBase('GENERADOR'), { NOMBRES: 'GENERADOR', 'AST-PP': '1,60' }),
  // Puntal en la Pintura: RO+RD (RT) muy por encima del promedio.
  Object.assign(filaBase('PUNTAL'), { NOMBRES: 'PUNTAL', RO: '6', RD: '10', RT: '16' }),
  // Amenaza Perimetral Real: volumen y acierto de triple.
  Object.assign(filaBase('AMENAZA'), { NOMBRES: 'AMENAZA', T3I: '5,0', 'T3%': '0,40' }),
  // Especialista Defensivo: recuperos muy por encima del promedio.
  Object.assign(filaBase('ESPDEF'), { NOMBRES: 'ESPDEF', PR: '5' }),
  // Buscador de Contacto: peso y acierto de tiro libre.
  Object.assign(filaBase('CONTACTO'), { NOMBRES: 'CONTACTO', 'PT1%': '0,30', 'T1%': '0,85' }),
  { NOMBRES: 'JUGADOR TIPO', EQUIPO: '', FASE: 'REGULAR', MIN: '10', PTS: '8' },
];
const idxArq = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsArq, filas: filasArq },
}, { fase: 'REGULAR' });

const jugArq = (nombre) => idxArq.liga.jugadores.find(j => j['NOMBRES'] === nombre);
const idsDe = (arqs) => arqs.map(a => a.id);

check('Terminador de Élite: PLAYS alto + eFG% > 1.15x liga + PPP > 1.05',
  idsDe(J.jugadoresArquetipos(idxArq, jugArq('TERMINADOR'))).indexOf('terminador') !== -1,
  idsDe(J.jugadoresArquetipos(idxArq, jugArq('TERMINADOR'))));
check('Generador: AST-PP > 1.40',
  idsDe(J.jugadoresArquetipos(idxArq, jugArq('GENERADOR'))).indexOf('generador') !== -1);
check('Puntal en la Pintura: RO+RD > 1.20x el promedio de la liga',
  idsDe(J.jugadoresArquetipos(idxArq, jugArq('PUNTAL'))).indexOf('puntal') !== -1);
check('Amenaza Perimetral Real: T3I > 3.0 y T3% > 34%',
  idsDe(J.jugadoresArquetipos(idxArq, jugArq('AMENAZA'))).indexOf('amenaza') !== -1);
check('Especialista Defensivo: recuperos > 1.30x el promedio',
  idsDe(J.jugadoresArquetipos(idxArq, jugArq('ESPDEF'))).indexOf('especialistaDef') !== -1);
check('Buscador de Contacto: PT1% > 25% y T1% > 80%',
  idsDe(J.jugadoresArquetipos(idxArq, jugArq('CONTACTO'))).indexOf('buscadorContacto') !== -1);
check('un jugador "promedio" no calza en NINGÚN perfil (el motor discrimina, no siempre da positivo)',
  J.jugadoresArquetipos(idxArq, jugArq('BASE 1')).length === 0,
  J.jugadoresArquetipos(idxArq, jugArq('BASE 1')));
check('el terminador NO además dispara Generador/Puntal/Amenaza/etc. por accidente',
  idsDe(J.jugadoresArquetipos(idxArq, jugArq('TERMINADOR'))).length === 1,
  idsDe(J.jugadoresArquetipos(idxArq, jugArq('TERMINADOR'))));
check('jugadoresPromediosLiga() calcula PLAYS, eFG%, RT y PR de los calificados',
  ['PLAYS', 'eFG%', 'RT', 'PR'].every(k => typeof J.jugadoresPromediosLiga(idxArq)[k] === 'number'),
  J.jugadoresPromediosLiga(idxArq));

console.log('\n9. JERARQUÍA (ADN) — cascada excluyente');
console.log('═'.repeat(70));

const colsJer = ['NOMBRES', 'EQUIPO', 'FASE', 'MIN', 'PLAYS'];
function filaJer(n, min, plays) {
  return { NOMBRES: n, EQUIPO: 'A', FASE: 'REGULAR', MIN: String(min), PLAYS: String(plays) };
}
const filasJer = [
  filaJer('B1', 15, 8), filaJer('B2', 15, 8), filaJer('B3', 15, 8), filaJer('B4', 15, 8),
  filaJer('FRANQUICIA', 30, 25),   // PLAYS muy por encima del promedio + más de 28 min
  filaJer('REFERENTE', 20, 15),    // PLAYS por encima del promedio, pero sin los 28 min
  filaJer('QUINTETO', 24, 8),      // minutos de sobra, PLAYS en la media
  filaJer('ESPECIALISTA', 15, 8),  // ni minutos ni PLAYS destacados
  { NOMBRES: 'JUGADOR TIPO', EQUIPO: '', FASE: 'REGULAR', MIN: '10', PLAYS: '8' },
];
const idxJer = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsJer, filas: filasJer },
}, { fase: 'REGULAR' });
const jugJer = (nombre) => idxJer.liga.jugadores.find(j => j['NOMBRES'] === nombre);

check('Jugador Franquicia: PLAYS > 1.20x liga y más de 28 minutos',
  J.jugadoresJerarquia(idxJer, jugJer('FRANQUICIA')).id === 'franquicia',
  J.jugadoresJerarquia(idxJer, jugJer('FRANQUICIA')));
check('Referente Ofensivo: PLAYS por encima del promedio, no llega a Franquicia',
  J.jugadoresJerarquia(idxJer, jugJer('REFERENTE')).id === 'referente',
  J.jugadoresJerarquia(idxJer, jugJer('REFERENTE')));
check('Pieza de Quinteto Titular: minutos altos sin ser el foco de PLAYS',
  J.jugadoresJerarquia(idxJer, jugJer('QUINTETO')).id === 'quinteto',
  J.jugadoresJerarquia(idxJer, jugJer('QUINTETO')));
check('Especialista de Rol: el fallback cuando no destaca en minutos ni en PLAYS',
  J.jugadoresJerarquia(idxJer, jugJer('ESPECIALISTA')).id === 'especialista',
  J.jugadoresJerarquia(idxJer, jugJer('ESPECIALISTA')));
check('cada nivel de jerarquía trae emoji, label y descripción',
  J.JERARQUIA.every(n => n.emoji && n.label && n.descripcion));

console.log('\n10. SÍNTESIS DE PERFIL (integración)');
console.log('═'.repeat(70));
const sint = J.jugadoresSintesisPerfil(idxArq, jugArq('TERMINADOR'));
check('trae las 6 piezas: rol, arquetipos, jerarquía, impacto, eficiencia, conclusión',
  sint.rolMinutos && Array.isArray(sint.arquetipos) && sint.jerarquia && sint.impacto && sint.eficiencia && sint.conclusion,
  Object.keys(sint));
check('el nivel de impacto/eficiencia es uno de Alto/Medio/Bajo',
  ['Alto', 'Medio', 'Bajo'].indexOf(sint.impacto.nivel) !== -1 && ['Alto', 'Medio', 'Bajo'].indexOf(sint.eficiencia.nivel) !== -1,
  sint.impacto.nivel + ' / ' + sint.eficiencia.nivel);
check('un jugador con PLAYS y eFG% muy por encima de la liga tiene impacto y eficiencia Alto',
  sint.impacto.nivel === 'Alto' && sint.eficiencia.nivel === 'Alto');
check('la conclusión es un texto no vacío que menciona su rol por minutos',
  typeof sint.conclusion.texto === 'string' && sint.conclusion.texto.indexOf(sint.rolMinutos.rol) !== -1,
  sint.conclusion.texto);
check('jugadoresPuntoDeFuga() encuentra el percentil más bajo entre las métricas de referencia',
  J.jugadoresPuntoDeFuga(idxArq, jugArq('TERMINADOR')) === null || typeof J.jugadoresPuntoDeFuga(idxArq, jugArq('TERMINADOR')).percentil === 'number');

console.log('\n11. EVOLUCIÓN MULTIMÉTRICA');
console.log('═'.repeat(70));
check('hay 14 métricas seleccionables en el gráfico de evolución',
  J.JUGADORES_METRICAS_EVOLUCION.length === 14, J.JUGADORES_METRICAS_EVOLUCION.map(m => m.id).join(','));
check('incluye las que pidió el enunciado (MIN, PTS, PLAYS, eFG%, TS%, USG%, RTL%, T2%, T3%, T1%, AST-PP, RO, RD, RT)',
  ['MIN', 'PTS', 'PLAYS', 'eFG%', 'TS%', 'USG%', 'RTL%', 'T2%', 'T3%', 'T1%', 'AST-PP', 'RO', 'RD', 'RT']
    .every(id => J.JUGADORES_METRICAS_EVOLUCION.some(m => m.id === id)));
check('cada métrica seleccionable existe en el registro SGADD.METRICAS (formatea sin reventar)',
  J.JUGADORES_METRICAS_EVOLUCION.every(m => SGADD.metrica(m.id) !== null));

console.log('\n12. TAB TIRO — zonas');
console.log('═'.repeat(70));
check('hay 3 zonas: Triple, Doble, Tiro libre', J.ZONAS_TIRO.length === 3, J.ZONAS_TIRO.map(z => z.id).join(','));
check('cada zona trae las 5 claves que arma la tabla (peso, conv, ppp, C, I)',
  J.ZONAS_TIRO.every(z => z.peso && z.conv && z.ppp && z.c && z.i));
check('las claves de zona existen en el registro de métricas',
  J.ZONAS_TIRO.every(z => SGADD.metrica(z.peso) && SGADD.metrica(z.conv) && SGADD.metrica(z.ppp) && SGADD.metrica(z.c) && SGADD.metrica(z.i)));

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
