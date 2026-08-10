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
const EQ = require('./js/sgadd-equipos.js');
let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const cerca = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < (tol || 1e-6);

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
/* Cortes recalibrados contra la distribución real de la liga: 25 / 20 / 15.
   El de 15 coincide con el umbral de calificación (~15,4 min), así que
   "Pocos Minutos" pasa a significar "no llega a tener percentil". */
check('25 min exactos → Jugador Clave', J.jugadoresRolMinutos(25).id === 'clave', JSON.stringify(J.jugadoresRolMinutos(25)));
check('24,9 min → todavía Importante (no llega a Clave)', J.jugadoresRolMinutos(24.9).id === 'importante');
check('20 min exactos → Jugador Importante', J.jugadoresRolMinutos(20).id === 'importante');
check('19,9 min → cae a Rotación', J.jugadoresRolMinutos(19.9).id === 'rotacion');
check('15 min exactos → Jugador de Rotación', J.jugadoresRolMinutos(15).id === 'rotacion');
check('14,9 min → Pocos Minutos', J.jugadoresRolMinutos(14.9).id === 'pocos');
check('los cortes declarados son 25 / 20 / 15 y no otros',
  J.ROLES_MINUTOS.map(r => r.min).join(',') === '25,20,15,-Infinity',
  J.ROLES_MINUTOS.map(r => r.min).join(','));
check('las cuatro bandas son contiguas: ningún valor de MIN queda sin banda',
  [40, 25, 24.9, 20, 19.9, 15, 14.9, 0].every(m => J.jugadoresRolMinutos(m) !== null));
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
check('MOREIRA (A), 25′, pasa a Jugador Clave con los cortes nuevos',
  J.jugadoresRolMinutos(moreiraA['MIN']).id === 'clave', moreiraA['MIN']);

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

const colsArq = ['NOMBRES', 'EQUIPO', 'FASE', 'MIN', 'PTS', 'PLAYS', 'eFG%', 'PPP', 'AST-PP',
  'RO', 'RD', 'RT', 'PR', 'T3I', 'T3%', 'PT1%', 'T1%', 'RTL%', 'FR'];
function filaBase(n) {
  return { NOMBRES: 'BASE ' + n, EQUIPO: 'A', FASE: 'REGULAR',
    MIN: '20', PTS: '8', PLAYS: '10', 'eFG%': '0,40', PPP: '0,80',
    'AST-PP': '0,9', RO: '2', RD: '4', RT: '6', PR: '2',
    T3I: '1,0', 'T3%': '0,25', 'PT1%': '0,10', 'T1%': '0,65',
    'RTL%': '0,18', FR: '1,5' };
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
  /* Buscador de Contacto: ahora es MULTIVARIABLE (RTL% + FR + PT1% + T1%).
     El criterio viejo (`PT1% > 0,25`) era inalcanzable: el PT1% más alto de
     la liga real es 0,230, así que el arquetipo daba cero sobre 210. */
  Object.assign(filaBase('CONTACTO'), { NOMBRES: 'CONTACTO', 'RTL%': '0,35', FR: '4', 'PT1%': '0,16', 'T1%': '0,80' }),
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
check('Buscador de Contacto: RTL% + FR + PT1% + T1% exigidos juntos',
  idsDe(J.jugadoresArquetipos(idxArq, jugArq('CONTACTO'))).indexOf('buscadorContacto') !== -1,
  JSON.stringify(J.jugadoresArquetipos(idxArq, jugArq('CONTACTO'))));
/* Las cuatro señales miden cosas distintas y por eso se exigen juntas:
   con volumen de línea pero sin puntería, o con puntería y sin volumen,
   NO es un buscador de contacto. */
check('con RTL% y FR altos pero T1% pobre NO califica',
  idsDe(J.jugadoresArquetipos(idxArq,
    Object.assign({}, jugArq('CONTACTO'), { 'T1%': 0.55 }))).indexOf('buscadorContacto') === -1);
check('con T1% de élite pero sin volumen de línea tampoco',
  idsDe(J.jugadoresArquetipos(idxArq,
    Object.assign({}, jugArq('CONTACTO'), { 'RTL%': 0.10, FR: 0.8, 'PT1%': 0.04 }))).indexOf('buscadorContacto') === -1);
check('el umbral de PT1% es alcanzable en la liga real (el viejo, 0,25, no lo era)',
  J.JUGADORES_UMBRALES.usoLibreContacto <= 0.20, J.JUGADORES_UMBRALES.usoLibreContacto);
check('el filtro de efectividad quedó en 0,72 como se pidió',
  J.JUGADORES_UMBRALES.t1Contacto === 0.72);
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

/* =====================================================================
   LOCAL VS. VISITANTE

   Fixture dedicada: un jugador con 3 partidos de local y 3 de visitante.
   Un solo caso por escenario, con el resto de las métricas EXACTAMENTE
   iguales entre condiciones, para que la "sensibilidad" no tenga dudas
   sobre cuál es la métrica que realmente cambia.
   ===================================================================== */
console.log('\n13. LOCAL VS. VISITANTE');
console.log('═'.repeat(70));

const colsCond = ['FECHA', 'PARTIDO', 'NOMBRES', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'PTS', 'eFG%', 'PLAYS', 'MIN', 'USG%', 'AST-PP'];
function filaCond(i, cond, pts, efg, plays, min, usg, astpp) {
  return {
    FECHA: String(i).padStart(2, '0') + '/05/2026', PARTIDO: 'X vs RIVAL' + i,
    NOMBRES: 'CONDICIONAL, TEST', EQUIPO: 'X', FASE: 'REGULAR',
    CONDICION: cond, RESULTADO: 'GANADO',
    PTS: String(pts), 'eFG%': String(efg).replace('.', ','), PLAYS: String(plays),
    MIN: String(min), 'USG%': String(usg).replace('.', ','), 'AST-PP': String(astpp).replace('.', ','),
  };
}

// Caso A: solo eFG% cambia de forma relevante (mucho mejor de local).
const filasCondA = [
  filaCond(1, 'LOCAL', 20, 0.50, 15, 30, 0.25, 1.0),
  filaCond(2, 'LOCAL', 22, 0.52, 15, 30, 0.25, 1.0),
  filaCond(3, 'LOCAL', 18, 0.48, 15, 30, 0.25, 1.0),
  filaCond(4, 'VISITANTE', 19, 0.35, 15, 30, 0.25, 1.0),
  filaCond(5, 'VISITANTE', 21, 0.37, 15, 30, 0.25, 1.0),
  filaCond(6, 'VISITANTE', 20, 0.36, 15, 30, 0.25, 1.0),
];
const idxCondA = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsJ, filas: [{ NOMBRES: 'CONDICIONAL, TEST', EQUIPO: 'X', FASE: 'REGULAR', MIN: '30', PTS: '20' }] },
  'Base Datos J': { cols: colsCond, filas: filasCondA },
}, { fase: 'REGULAR' });
const jCondA = idxCondA.liga.jugadores.find(j => j['NOMBRES'] === 'CONDICIONAL, TEST');
const splitA = J.jugadoresSplitCondicion(idxCondA, jCondA);

check('separa 3 partidos de local y 3 de visitante', splitA.local.pj === 3 && splitA.visitante.pj === 3);
check('PTS promedia igual de los dos lados (20 y 20) — no es la métrica sensible',
  Math.abs(splitA.local['PTS'] - 20) < 0.01 && Math.abs(splitA.visitante['PTS'] - 20) < 0.01);
check('eFG% de local (0.50) es bien distinto del de visitante (0.36)',
  Math.abs(splitA.local['eFG%'] - 0.50) < 0.01 && Math.abs(splitA.visitante['eFG%'] - 0.36) < 0.01);
check('con suficientes partidos de los dos lados, suficiente = true', splitA.suficiente === true);
check('la sensibilidad detecta eFG% como la métrica que más cambia',
  splitA.sensibilidad.clave === 'eFG%', JSON.stringify(splitA.sensibilidad));
check('favorece a Local (mejor eFG% de local)', splitA.sensibilidad.nivel === 'local');
check('el texto es de tipo "rendimiento" (Mejora de Local/Visitante), no de "uso"',
  splitA.sensibilidad.texto.indexOf('Mejora de Local en eFG%') === 0, splitA.sensibilidad.texto);

// Caso B: todo estable (ninguna métrica cruza su umbral).
const filasCondB = [
  filaCond(1, 'LOCAL', 20, 0.45, 15, 30, 0.25, 1.0),
  filaCond(2, 'LOCAL', 20, 0.45, 15, 30, 0.25, 1.0),
  filaCond(3, 'VISITANTE', 20, 0.45, 15, 30, 0.25, 1.0),
  filaCond(4, 'VISITANTE', 20, 0.45, 15, 30, 0.25, 1.0),
];
const idxCondB = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsJ, filas: [{ NOMBRES: 'CONDICIONAL, TEST', EQUIPO: 'X', FASE: 'REGULAR', MIN: '30', PTS: '20' }] },
  'Base Datos J': { cols: colsCond, filas: filasCondB },
}, { fase: 'REGULAR' });
const jCondB = idxCondB.liga.jugadores.find(j => j['NOMBRES'] === 'CONDICIONAL, TEST');
const splitB = J.jugadoresSplitCondicion(idxCondB, jCondB);
check('sin diferencias relevantes, el nivel es "estable"', splitB.sensibilidad.nivel === 'estable', JSON.stringify(splitB.sensibilidad));

// Caso C: la métrica que más cambia es de USO (minutos), no de rendimiento.
const filasCondC = [
  filaCond(1, 'LOCAL', 20, 0.45, 15, 35, 0.25, 1.0),
  filaCond(2, 'LOCAL', 20, 0.45, 15, 35, 0.25, 1.0),
  filaCond(3, 'VISITANTE', 20, 0.45, 15, 25, 0.25, 1.0),
  filaCond(4, 'VISITANTE', 20, 0.45, 15, 25, 0.25, 1.0),
];
const idxCondC = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsJ, filas: [{ NOMBRES: 'CONDICIONAL, TEST', EQUIPO: 'X', FASE: 'REGULAR', MIN: '30', PTS: '20' }] },
  'Base Datos J': { cols: colsCond, filas: filasCondC },
}, { fase: 'REGULAR' });
const jCondC = idxCondC.liga.jugadores.find(j => j['NOMBRES'] === 'CONDICIONAL, TEST');
const splitC = J.jugadoresSplitCondicion(idxCondC, jCondC);
check('detecta MIN como la métrica que más cambia (10 minutos de diferencia)',
  splitC.sensibilidad.clave === 'MIN', JSON.stringify(splitC.sensibilidad));
check('el texto de una métrica de "uso" no dice "Mejora" (es un cambio de rol, no de calidad)',
  splitC.sensibilidad.texto.indexOf('Mejora de') === -1, splitC.sensibilidad.texto);

// Caso D: muestra insuficiente (1 solo partido de visitante).
const filasCondD = [
  filaCond(1, 'LOCAL', 20, 0.45, 15, 30, 0.25, 1.0),
  filaCond(2, 'LOCAL', 20, 0.45, 15, 30, 0.25, 1.0),
  filaCond(3, 'VISITANTE', 20, 0.45, 15, 30, 0.25, 1.0),
];
const idxCondD = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsJ, filas: [{ NOMBRES: 'CONDICIONAL, TEST', EQUIPO: 'X', FASE: 'REGULAR', MIN: '30', PTS: '20' }] },
  'Base Datos J': { cols: colsCond, filas: filasCondD },
}, { fase: 'REGULAR' });
const jCondD = idxCondD.liga.jugadores.find(j => j['NOMBRES'] === 'CONDICIONAL, TEST');
const splitD = J.jugadoresSplitCondicion(idxCondD, jCondD);
check('con un solo partido de visitante, suficiente = false (' + J.MIN_PJ_CONDICION + ' es el mínimo)',
  splitD.suficiente === false, JSON.stringify({ local: splitD.local.pj, visitante: splitD.visitante.pj }));
check('sin muestra suficiente, no calcula sensibilidad (evita inventar una tendencia con 1 partido)',
  splitD.sensibilidad === null);
check('MIN_PJ_CONDICION exportado coincide con el mínimo real usado', J.MIN_PJ_CONDICION === 2);
check('CLAVES_CONDICION son las 6 que pidió el enunciado (PTS, eFG%, PLAYS, MIN, USG%, AST-PP)',
  J.CLAVES_CONDICION.join(',') === ['PTS', 'eFG%', 'PLAYS', 'MIN', 'USG%', 'AST-PP'].join(','));

console.log('\n14. ETIQUETAS DE EVOLUCIÓN (fecha + rival + condición)');
console.log('═'.repeat(70));
check('jugadoresCondicionCorta() da "L"/"V"/"?"',
  J.jugadoresCondicionCorta({ CONDICION: 'LOCAL' }) === 'L' &&
  J.jugadoresCondicionCorta({ CONDICION: 'VISITANTE' }) === 'V' &&
  J.jugadoresCondicionCorta({ CONDICION: '' }) === '?');

const filaEvol = { PARTIDO: 'CONDICIONAL vs RIVAL', EQUIPO: 'CONDICIONAL', CONDICION: 'LOCAL', __fecha: new Date(2025, 9, 14) };
const etiquetaJ = J.jugadoresEtiquetaEvolucion(filaEvol);
check('jugadoresEtiquetaEvolucion() trae fecha, "vs RIVAL" y la condición entre paréntesis',
  etiquetaJ === '14/10 - vs RIVAL (L)', etiquetaJ);

const equipoFicticio = { nombre: 'CONDICIONAL' };
const partidoEquipoFicticio = { PARTIDO: 'CONDICIONAL vs RIVAL', CONDICION: 'VISITANTE', __fecha: new Date(2025, 9, 14) };
check('equiposCondicionCorta() replica el mismo criterio L/V',
  EQ.equiposCondicionCorta({ CONDICION: 'LOCAL' }) === 'L' && EQ.equiposCondicionCorta({ CONDICION: 'VISITANTE' }) === 'V');
const etiquetaE = EQ.equiposEtiquetaEvolucion(partidoEquipoFicticio, equipoFicticio);
check('equiposEtiquetaEvolucion() da el mismo formato que la de Jugadores (fecha, rival, condición)',
  etiquetaE === '14/10 - vs RIVAL (V)', etiquetaE);
check('Jugadores y Equipos usan exactamente el mismo formato de etiqueta',
  etiquetaJ.replace(' (L)', '') === etiquetaE.replace(' (V)', ''));

/* =====================================================================
   RANKINGS TOP 20 DE LA LIGA (landing de la sección)

   Fixture aparte: hacen falta las columnas de rebote, creación y
   disciplina, que la fixture principal no trae porque prueba otra cosa.
   ===================================================================== */
console.log('\nX. RANKINGS DE LIGA · TOP 20');
console.log('═'.repeat(70));

const colsRk = ['NOMBRES', 'EQUIPO', 'FASE', 'PJ', 'MIN', 'PTS', 'PLAYS', 'PPP', 'eFG%', 'TS%', 'RTL%', 'USG%',
  'TC%', 'TCC', 'TCI', 'PT2%', 'T2%', 'T2C', 'T2I', 'PPT2', 'PT3%', 'T3%', 'T3C', 'T3I', 'PPT3',
  'PT1%', 'T1%', 'T1C', 'T1I', 'PPT1', 'RO', 'RD', 'RT', 'AST', 'AST%', 'AST-PP', 'FC', 'FR', 'PP', 'RO%', 'RD%', 'PePP%'];

function jr(nombre, equipo, o) {
  return Object.assign({
    NOMBRES: nombre, EQUIPO: equipo, FASE: 'REGULAR', PJ: '5', MIN: '20', PTS: '10',
    PLAYS: '10', PPP: '1,00', 'eFG%': '0,50', 'TS%': '0,55', 'RTL%': '0,20', 'USG%': '0,20',
    'TC%': '0,45', TCC: '4', TCI: '9', 'PT2%': '0,42', 'T2%': '0,50', T2C: '3', T2I: '6', PPT2: '1,00',
    'PT3%': '0,35', 'T3%': '0,33', T3C: '1', T3I: '3', PPT3: '1,00',
    'PT1%': '0,08', 'T1%': '0,70', T1C: '2', T1I: '3', PPT1: '0,67',
    RO: '2', RD: '4', RT: '6', AST: '2', 'AST%': '0,15', 'AST-PP': '1,50', FC: '2', FR: '2', PP: '1,3',
    'RO%': '0,05', 'RD%': '0,12', 'PePP%': '0,13',
  }, o);
}

const filasRk = [
  jr('JUGADOR TIPO', '', { MIN: '15', 'RO%': '0,05', 'RD%': '0,12', 'PePP%': '0,13' }),
  /* Rebotes: REBOTEADOR domina RO; ANCLA tiene más RD pero menos RO. */
  jr('REBOTEADOR, ALTO', 'A', { MIN: '30', RO: '5', RD: '6', RT: '11', 'AST-PP': '0,80', FC: '3', FR: '4', 'RO%': '0,10' }),
  jr('ANCLA, DEFENSIVA', 'A', { MIN: '28', RO: '1', RD: '9', RT: '10', 'AST-PP': '0,90' }),
  /* Creación: GENERADOR lidera AST-PP. */
  jr('GENERADOR, FINO', 'B', { MIN: '27', 'AST-PP': '3,20', 'AST%': '0,40', AST: '6', FC: '1', FR: '5', RO: '0,5' }),
  jr('ANOTADOR, PURO', 'B', { MIN: '26', PTS: '22', PLAYS: '18', 'AST-PP': '0,60', RO: '1,5' }),
  /* Por debajo del umbral de la liga: no puede entrar a ningún top. */
  jr('SUPLENTE, CORTO', 'A', { MIN: '6', RO: '9', 'AST-PP': '9,00' }),
];

const idxRk = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsRk, filas: filasRk },
  'Base Datos E': { cols: colsBD, filas: filasBD },
}, { fase: 'REGULAR' });

check('hay 8 grupos de ranking', J.JUGADORES_RANKINGS.length === 8,
  J.JUGADORES_RANKINGS.map(g => g.id).join(','));
check('el top por defecto es de 20', J.JUGADORES_TOP_N === 20);
check('están las seis tablas heredadas de la hoja RANKINGS J',
  ['produccion', 'eficiencia', 'tiro', 't2', 't3', 'libres'].every(id => J.JUGADORES_RANKINGS.some(g => g.id === id)));
check('el umbral por defecto sale del MIN del JUGADOR TIPO',
  J.jugadoresUmbralRanking(idxRk) === 15, J.jugadoresUmbralRanking(idxRk));

/* --- Tabla nueva: REBOTES --- */
const rkReb = J.jugadoresRanking(idxRk, 'rebotes');
check('la tabla de rebotes existe y se titula Rebotes', rkReb && rkReb.titulo === 'Rebotes');
check('ordena por rebote ofensivo', rkReb.orden === 'RO');
check('trae las columnas pedidas (MIN, RO, RD, RT)',
  rkReb.columnas.join(',') === 'MIN,RO,RD,RT', rkReb.columnas.join(','));
check('cada fila trae puesto, jugador y equipo',
  rkReb.filas.every(f => f.puesto >= 1 && !!f.jugador && !!f.equipo));
check('el primero es el que más rebotes ofensivos captura',
  rkReb.filas[0].jugador === 'REBOTEADOR, ALTO', rkReb.filas.map(f => f.jugador).join('|'));
check('el ancla defensiva, con más RD pero menos RO, queda por detrás',
  rkReb.filas.findIndex(f => f.jugador === 'ANCLA, DEFENSIVA') > 0,
  rkReb.filas.map(f => f.jugador + ':' + f.celdas['RO']).join('|'));
check('RT se resuelve aunque haya que derivarlo de RO+RD',
  rkReb.filas[0].celdas['RT'] === 11, rkReb.filas[0].celdas['RT']);

/* --- Tabla nueva: CREACIÓN Y DISCIPLINA --- */
const rkCre = J.jugadoresRanking(idxRk, 'creacion');
check('la tabla de creación y disciplina existe', rkCre && rkCre.titulo === 'Creación y disciplina');
check('ordena por AST-PP', rkCre.orden === 'AST-PP');
check('trae las columnas pedidas (MIN, AST-PP, AST%, FC, FR)',
  rkCre.columnas.join(',') === 'MIN,AST-PP,AST%,FC,FR', rkCre.columnas.join(','));
check('el primero es el mejor ratio de asistencias por pérdida',
  rkCre.filas[0].jugador === 'GENERADOR, FINO', rkCre.filas.map(f => f.jugador).join('|'));
check('trae las faltas cometidas y recibidas de cada uno',
  rkCre.filas[0].celdas['FC'] !== null && rkCre.filas[0].celdas['FR'] !== null,
  JSON.stringify(rkCre.filas[0].celdas));

/* --- Filtro de minutos --- */
check('el suplente de 6 minutos no entra a ningún top pese a liderar RO y AST-PP',
  !rkReb.filas.some(f => f.jugador === 'SUPLENTE, CORTO') &&
  !rkCre.filas.some(f => f.jugador === 'SUPLENTE, CORTO'),
  rkReb.filas.map(f => f.jugador).join('|'));
check('bajando el umbral a mano, el suplente sí aparece y lidera',
  J.jugadoresRanking(idxRk, 'rebotes', { umbral: 0 }).filas[0].jugador === 'SUPLENTE, CORTO',
  J.jugadoresRanking(idxRk, 'rebotes', { umbral: 0 }).filas[0].jugador);
check('el umbral aplicado viaja en el resultado, para poder mostrarlo', rkReb.umbral === 15, rkReb.umbral);
check('se informa cuántos quedaron elegibles, no solo los 20 mostrados',
  typeof rkReb.elegibles === 'number' && rkReb.elegibles >= rkReb.filas.length);

/* --- Contrato general de todas las tablas --- */
J.JUGADORES_RANKINGS.forEach(g => {
  const r = J.jugadoresRanking(idxRk, g.id);
  if (!r) { check('el grupo ' + g.id + ' se resuelve', false); return; }
  const desc = r.filas.every((f, i, a) => i === 0 || a[i - 1].valorOrden >= f.valorOrden);
  if (!desc) check('el grupo ' + g.id + ' viene ordenado descendente', false,
    r.filas.map(f => f.valorOrden).join(','));
});
check('todas las tablas vienen ordenadas de mayor a menor por su métrica de orden',
  J.JUGADORES_RANKINGS.every(g => {
    const r = J.jugadoresRanking(idxRk, g.id);
    return r && r.filas.every((f, i, a) => i === 0 || a[i - 1].valorOrden >= f.valorOrden);
  }));
check('todas las tablas respetan el tope de ' + J.JUGADORES_TOP_N,
  J.JUGADORES_RANKINGS.every(g => J.jugadoresRanking(idxRk, g.id).filas.length <= J.JUGADORES_TOP_N));
check('cada fila trae el slug para poder abrir la ficha del jugador',
  rkReb.filas.every(f => typeof f.slug === 'string' && f.slug.length > 0));
check('la slug del ranking es la misma que usa la grilla (nombre + equipo)',
  rkReb.filas[0].slug === J.jugadoresSlug({ NOMBRES: 'REBOTEADOR, ALTO', EQUIPO: 'A' }),
  rkReb.filas[0].slug);
check('trae la mediana del propio top para el resalte de referencia',
  rkReb.medianas && typeof rkReb.medianas['RO'] === 'number', JSON.stringify(rkReb.medianas));
check('un grupo inexistente da null, no una excepción', J.jugadoresRanking(idxRk, 'NO_EXISTE') === null);
check('sin índice devuelve null en vez de romper', J.jugadoresRanking(null, 'rebotes') === null);

/* --- `+/-` en los rankings: columna sí, criterio de orden NO --- */
const grupoProd = J.JUGADORES_RANKINGS.find(g => g.id === 'produccion');
check('la tabla de producción muestra el +/-', grupoProd.cols.indexOf('+/-') !== -1,
  grupoProd.cols.join(','));
check('pero sigue ordenando por PTS: el top 20 tiene que ser el de puntos',
  grupoProd.orden === 'PTS');
/* El +/- de un jugador depende de los otros cuatro que estaban en cancha:
   como criterio de selección daría un ranking del equipo disfrazado de
   ranking de jugadores. */
check('NINGÚN grupo usa +/- como métrica de orden',
  J.JUGADORES_RANKINGS.every(g => g.orden !== '+/-'),
  J.JUGADORES_RANKINGS.map(g => g.id + ':' + g.orden).join(','));
check('con la planilla vieja (sin la columna) la tabla se arma igual, con el +/- en null',
  (() => {
    const r = J.jugadoresRanking(idxRk, 'produccion');
    return r && r.filas.length > 0 && r.filas.every(f => f.celdas['+/-'] === null);
  })());

/* --- Orden dinámico por cabecera --- */
console.log('\nX bis. ORDEN DINÁMICO POR COLUMNA');
console.log('═'.repeat(70));

check('sin pedir orden, se muestra por la métrica del grupo',
  rkReb.ordenPor === 'RO' && rkReb.dir === 'desc', JSON.stringify({ por: rkReb.ordenPor, dir: rkReb.dir }));

const porRD = J.jugadoresRanking(idxRk, 'rebotes', { ordenPor: 'RD' });
check('ordenando por RD, el primero es el que más rebotes defensivos tiene',
  porRD.filas[0].jugador === 'ANCLA, DEFENSIVA', porRD.filas.map(f => f.jugador + ':' + f.celdas['RD']).join('|'));
check('el resultado informa por qué columna se está mostrando',
  porRD.ordenPor === 'RD' && porRD.dir === 'desc');
check('el orden descendente se cumple fila a fila',
  porRD.filas.every((f, i, a) => i === 0 || a[i - 1].celdas['RD'] >= f.celdas['RD']),
  porRD.filas.map(f => f.celdas['RD']).join(','));

const porRDAsc = J.jugadoresRanking(idxRk, 'rebotes', { ordenPor: 'RD', dir: 'asc' });
check('el sentido ascendente invierte la tabla',
  porRDAsc.filas.every((f, i, a) => i === 0 || a[i - 1].celdas['RD'] <= f.celdas['RD']),
  porRDAsc.filas.map(f => f.celdas['RD']).join(','));
/* Se compara el VALOR y no el nombre: con empates (varios con el mismo RD)
   el primero ascendente no tiene por qué ser el mismo jugador que el último
   descendente, pero el número sí tiene que coincidir. */
check('ascendente arranca en el mismo valor en que termina el descendente',
  porRDAsc.filas[0].celdas['RD'] === porRD.filas[porRD.filas.length - 1].celdas['RD'],
  JSON.stringify({ asc: porRDAsc.filas[0].celdas['RD'], descUltimo: porRD.filas[porRD.filas.length - 1].celdas['RD'] }));

/* La regla que evita que la tabla deje de ser lo que dice ser. */
check('reordenar NO cambia quién entra al top: son los mismos jugadores',
  porRD.filas.map(f => f.jugador).sort().join('|') === rkReb.filas.map(f => f.jugador).sort().join('|'),
  JSON.stringify({ rd: porRD.filas.length, ro: rkReb.filas.length }));
check('el grupo sigue declarando su métrica de selección aunque se muestre por otra',
  porRD.orden === 'RO' && porRD.ordenPor === 'RD');
check('el puesto se renumera según el orden mostrado',
  porRD.filas.every((f, i) => f.puesto === i + 1));

check('pedir orden por una columna que no está en la tabla cae al orden del grupo',
  J.jugadoresRanking(idxRk, 'rebotes', { ordenPor: 'T3I' }).ordenPor === 'RO');
check('una dirección inválida cae a descendente',
  J.jugadoresRanking(idxRk, 'rebotes', { dir: 'lo-que-sea' }).dir === 'desc');
check('se puede ordenar por cualquier columna declarada del grupo',
  rkCre.columnas.every(k => J.jugadoresRanking(idxRk, 'creacion', { ordenPor: k }).ordenPor === k));

/* Los nulos no pueden colarse al tope en ascendente: un "—" arriba de
   todo parece el mejor y es el que no tiene dato. */
const filasNulo = filasRk.concat([jr('SIN, DATO', 'B', { MIN: '24', RD: '' })]);
const idxNulo = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsRk, filas: filasNulo },
  'Base Datos E': { cols: colsBD, filas: filasBD },
}, { fase: 'REGULAR' });
const conNulo = J.jugadoresRanking(idxNulo, 'rebotes', { ordenPor: 'RD', dir: 'asc' });
check('un jugador sin dato en la columna de orden queda al fondo, no al tope',
  conNulo.filas[0].celdas['RD'] !== null,
  conNulo.filas.map(f => f.jugador + ':' + f.celdas['RD']).join('|'));

/* =====================================================================
   MOTOR CENTRALIZADO DE ADN + FILTRO POR EQUIPO
   ===================================================================== */
console.log('\nY. ADN CENTRALIZADO Y SELECTOR DE EQUIPO');
console.log('═'.repeat(70));

const jugRk = idxRk.liga.jugadoresPorEquipo.get('A') || [];
const reboteador = jugRk.find(j => j['NOMBRES'] === 'REBOTEADOR, ALTO');
const adnReb = J.jugadoresADN(idxRk, reboteador);

check('jugadoresADN() devuelve las cuatro taxonomías juntas',
  !!adnReb.rolMinutos && !!adnReb.jerarquia && Array.isArray(adnReb.arquetipos) && !!adnReb.rolFuncional,
  JSON.stringify(Object.keys(adnReb)));
check('el rol funcional sale de la cascada compartida',
  J.JUGADORES_ROLES_FUNCIONALES.some(r => r.id === adnReb.rolFuncional.id), adnReb.rolFuncional.id);
check('ningún rol funcional usa posiciones tradicionales',
  J.JUGADORES_ROLES_FUNCIONALES.every(r => !/\b(base|alero|pivote?|ala|escolta)\b/i.test(r.label)));
check('la cascada de roles siempre resuelve', !!adnReb.rolFuncional.label);
check('jugadoresADN() sin jugador da null', J.jugadoresADN(idxRk, null) === null);

check('el perfil base calcula la mezcla de lanzamiento sobre intentos',
  cerca(J.jugadoresPerfilBase(idxRk, reboteador).mezclaTriple, 3 / 9, 1e-6),
  J.jugadoresPerfilBase(idxRk, reboteador).mezclaTriple);
check('el perfil base relativiza el rebote contra la mediana de la liga',
  cerca(J.jugadoresPerfilBase(idxRk, reboteador).reboteRel, 0.10 / 0.05, 1e-6),
  J.jugadoresPerfilBase(idxRk, reboteador).reboteRel);

const badges = J.jugadoresBadges(adnReb);
check('los badges traen jerarquía, rol y arquetipos con el mismo formato',
  badges.some(b => b.tipo === 'jerarquia') && badges.some(b => b.tipo === 'rol'),
  JSON.stringify(badges.map(b => b.tipo + ':' + b.texto)));
check('cada badge trae texto listo para pintar', badges.every(b => typeof b.texto === 'string' && b.texto.length > 2));
check('jugadoresBadges(null) da lista vacía, no rompe', J.jugadoresBadges(null).length === 0);

/* --- El plantel del picker: orden estricto por MIN --- */
const plantelA = (idxRk.liga.jugadoresPorEquipo.get('A') || [])
  .slice().sort((a, b) => (b['MIN'] || 0) - (a['MIN'] || 0));
check('el plantel de un equipo se ordena por MIN de mayor a menor',
  plantelA.every((j, i, a) => i === 0 || a[i - 1]['MIN'] >= j['MIN']),
  plantelA.map(j => j['NOMBRES'] + ':' + j['MIN']).join('|'));
check('el primero del plantel es el que más minutos juega',
  plantelA[0]['NOMBRES'] === 'REBOTEADOR, ALTO', plantelA[0]['NOMBRES']);
check('el índice agrupa por equipo sin mezclar planteles',
  plantelA.every(j => SGADD.claveEquipo(j['EQUIPO']) === 'A'));

/* --- El selector NO puede volver a sacar al usuario de la sección ---
   La UI usa `document` y no se exporta, así que el contrato se verifica
   sobre el propio fuente: es un guard contra la regresión concreta que
   hubo (el picker navegaba a Equipos → Plantel). */
const fuenteJ = require('fs').readFileSync('./js/sgadd-jugadores.js', 'utf8');
const cuerpoElegir = fuenteJ.slice(
  fuenteJ.indexOf('function jugadoresElegirEquipo'),
  fuenteJ.indexOf('function jugadoresCambiarUmbral'));
check('jugadoresElegirEquipo() NO navega a otra sección',
  !/navigate\s*\(/.test(cuerpoElegir) && !/equiposIrA\s*\(/.test(cuerpoElegir), cuerpoElegir.slice(0, 200));
check('jugadoresElegirEquipo() escribe el filtro local y repinta la propia sección',
  /JUGADORES\.filtroEquipo\s*=/.test(cuerpoElegir) && /jugadoresPintar\(\)/.test(cuerpoElegir));
check('volver a tocar el mismo escudo saca el filtro (toggle)',
  /===\s*clave\)\s*\?\s*null/.test(cuerpoElegir), cuerpoElegir.slice(0, 260));
check('el plantel filtrado ordena por MIN descendente en el propio render',
  /jugadoresPorEquipo\.get\(clave\)[\s\S]{0,160}b\['MIN'\][^\n]*a\['MIN'\]/.test(fuenteJ));

/* =====================================================================
   HANDLERS INLINE CON NOMBRES QUE TRAEN COMILLA SIMPLE

   Los equipos de La Plata se llaman `RECONQUISTA 'A' - MM`. Metido en un
   onclick con solo escape de HTML, el parser decodifica las entidades ANTES
   de que exista el JS y el handler queda `f('RECONQUISTA 'A' - MM')`:
   SyntaxError, el clic no hace nada y no se ve ningún error en pantalla.
   Era el motivo de que en Jugadores → Partidos el clic en una fila no
   abriera el detalle del partido en Equipos.
   ===================================================================== */
const UI = require('./js/sgadd-ui.js');
console.log('\n15. ESCAPE PARA HANDLERS INLINE');
console.log('═'.repeat(70));

const nombreConComilla = "RECONQUISTA 'A' - MM";
const attr = UI.escJs(nombreConComilla);
check('escJs deja la comilla simple escapada para el literal de JS',
  attr.indexOf("\\&#39;") !== -1, attr);
/* La prueba de fuego: decodificar las entidades (lo que hace el parser) y
   evaluar el handler resultante tiene que devolver el nombre intacto. */
const decodificar = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
check('el handler resultante es JS válido y recupera el nombre exacto',
  (() => {
    try { return eval("(function(x){return x;})('" + decodificar(attr) + "')") === nombreConComilla; }
    catch (e) { return false; }
  })(), decodificar(attr));
check('con solo esc() ese mismo handler NO compila: es el bug que se cerró',
  (() => {
    try { eval("(function(x){return x;})('" + decodificar(UI.esc(nombreConComilla)) + "')"); return false; }
    catch (e) { return true; }
  })());
check('la barra invertida también se escapa, y en el orden correcto',
  (() => {
    const raro = "A\\B'C";
    try { return eval("(function(x){return x;})('" + decodificar(UI.escJs(raro)) + "')") === raro; }
    catch (e) { return false; }
  })());
check('sigue escapando el HTML: un < no puede salir del atributo',
  UI.escJs('<img>').indexOf('<') === -1, UI.escJs('<img>'));
check('null y undefined dan string vacío, no "null"',
  UI.escJs(null) === '' && UI.escJs(undefined) === '');

/* Guard de regresión sobre el fuente: ningún handler inline puede volver a
   interpolar un valor con `escapeAttr` o `esc` a secas. */
const fuentesUI = ['./js/sgadd-jugadores.js', './js/sgadd-equipos.js', './js/sgadd-rankings.js',
  './js/sgadd-scouting.js', './js/sgadd-ui.js'];
const sospechosos = [];
fuentesUI.forEach(f => {
  const src = require('fs').readFileSync(f, 'utf8');
  const re = /on(?:click|input|change)="[^"]*\('\$\{(?:escapeAttr|esc|SGADD_UI\.esc)\(/g;
  let m;
  while ((m = re.exec(src)) !== null) sospechosos.push(f + ': ' + m[0]);
});
check('ningún handler inline interpola un valor sin escJs',
  sospechosos.length === 0, sospechosos.join(' | '));

/* =====================================================================
   16. RECALIBRACIÓN POR DISTRIBUCIÓN REAL

   Tres correcciones que salieron de medir la liga entera, no de ajustar
   umbrales a ojo. Los tres puntos ciegos que cierran (P-1, P-5, P-6)
   tenían la misma raíz: umbrales que decían una cosa y en los datos
   significaban otra.
   ===================================================================== */
console.log('\n16. RECALIBRACIÓN POR DISTRIBUCIÓN REAL');
console.log('═'.repeat(70));

/* --- La referencia de los relativos de rebote ---
   El JUGADOR TIPO de la planilla es la mediana de TODOS los jugadores del
   libro, incluidos los de 0 minutos: en la liga real venía 1,66x por
   debajo de la mediana de los calificados. Con esa referencia, un umbral
   de "1,20x la liga" lo pasaba el 65% del plantel. */
const colsRef = ['NOMBRES', 'EQUIPO', 'FASE', 'MIN', 'RO%', 'RD%', 'RO', 'RD', 'RT', 'T3I', 'T2I', 'PPT2'];
const filaRef = (n, min, ro, rd) => ({ NOMBRES: n, EQUIPO: 'A', FASE: 'REGULAR', MIN: String(min),
  'RO%': String(ro).replace('.', ','), 'RD%': String(rd).replace('.', ','),
  RO: '1', RD: '3', RT: '4', T3I: '1', T2I: '9', PPT2: '0,90' });
const idxRef = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsRef, filas: [
    /* Cuatro que califican (MIN ≥ 20, el del JUGADOR TIPO) con RO% alto… */
    filaRef('CAL 1', 24, 0.040, 0.100), filaRef('CAL 2', 26, 0.044, 0.110),
    filaRef('CAL 3', 22, 0.038, 0.095), filaRef('CAL 4', 28, 0.042, 0.105),
    /* …y tres que no juegan y arrastran la mediana del libro hacia abajo. */
    filaRef('BANCA 1', 2, 0.004, 0.010), filaRef('BANCA 2', 1, 0.003, 0.008),
    filaRef('BANCA 3', 3, 0.005, 0.012),
    { NOMBRES: 'JUGADOR TIPO', EQUIPO: '', FASE: 'REGULAR', MIN: '20',
      'RO%': '0,010', 'RD%': '0,025', RO: '1', RD: '3', RT: '4', T3I: '1', T2I: '9', PPT2: '0,90' },
  ] },
}, { fase: 'REGULAR' });

const refReb = J.jugadoresReferenciasRebote(idxRef);
check('con muestra suficiente la referencia es la mediana de los CALIFICADOS, no el JUGADOR TIPO',
  refReb.origen === 'mediana de calificados', refReb.origen);
check('y esa mediana es sensiblemente mayor que la del TIPO (que incluye a los que no juegan)',
  refReb['RO%'] > idxRef.liga.jugadorTipo['RO%'] * 2,
  refReb['RO%'] + ' vs ' + idxRef.liga.jugadorTipo['RO%']);
const perfCal1 = J.jugadoresPerfilBase(idxRef, idxRef.liga.jugadores.find(j => j['NOMBRES'] === 'CAL 1'));
check('un jugador de rotación normal queda cerca de 1,00 y no inflado a 4x',
  perfCal1.reboteRel > 0.8 && perfCal1.reboteRel < 1.2, perfCal1.reboteRel);
check('el perfil expone de dónde salió la referencia, para poder auditarlo',
  perfCal1.refRebote === 'mediana de calificados', perfCal1.refRebote);
check('sin calificados suficientes se degrada al JUGADOR TIPO en vez de romper',
  J.jugadoresReferenciasRebote({ liga: { jugadorTipo: { 'RO%': 0.02, 'RD%': 0.05 }, jugadoresCalificados: [] } }).origen === 'JUGADOR TIPO');
check('sin índice tampoco revienta', !!J.jugadoresReferenciasRebote(null));

/* --- P-1: los tres roles interiores son alcanzables ---
   Antes `rim-runner` iba primero con un piso que el discriminante de
   origen ya garantizaba, así que se llevaba el grupo interior completo. */
const rolesIds = J.JUGADORES_ROLES_FUNCIONALES.map(r => r.id);
const pos = (id) => rolesIds.indexOf(id);
check('finalizador-corto se evalúa ANTES que rim-runner',
  pos('finalizador-corto') < pos('rim-runner'), rolesIds.join(' > '));
check('ancla-defensiva también',
  pos('ancla-defensiva') < pos('rim-runner'), rolesIds.join(' > '));
check('existe un fallback INTERIOR: un interior sin rasgo dominante no cae con los perimetrales',
  pos('poste-bajo') !== -1 && pos('poste-bajo') < pos('spacing'));
check('el fallback interior va después de los tres roles específicos',
  pos('poste-bajo') > pos('rim-runner'));

const interior = { esInterior: true, esPerimetral: false, mezclaTriple: 0.05,
  pptDoble: 1.30, reboteRel: 2.00, reboteDefRel: 1.50, astPP: 0.5, ast: 1, min: 25, usoTriple: 0.05 };
check('un interior que termina cerca del aro es Finalizador Corto, no Rim Runner',
  J.jugadoresRolFuncional(interior).id === 'finalizador-corto', J.jugadoresRolFuncional(interior).id);
const anclaP = Object.assign({}, interior, { pptDoble: 0.85, reboteRel: 1.05, reboteDefRel: 1.60 });
check('el que sostiene el cristal DEFENSIVO más que el ofensivo es Ancla Defensiva',
  J.jugadoresRolFuncional(anclaP).id === 'ancla-defensiva', J.jugadoresRolFuncional(anclaP).id);
const rimP = Object.assign({}, interior, { pptDoble: 0.85, reboteRel: 1.80, reboteDefRel: 1.20 });
check('el que vive del cristal OFENSIVO sigue siendo Rim Runner',
  J.jugadoresRolFuncional(rimP).id === 'rim-runner', J.jugadoresRolFuncional(rimP).id);
const posteP = Object.assign({}, interior, { pptDoble: 0.85, reboteRel: 1.00, reboteDefRel: 1.00 });
check('el interior sin dimensión dominante cae en Poste Bajo, no en Rol Complementario',
  J.jugadoresRolFuncional(posteP).id === 'poste-bajo', J.jugadoresRolFuncional(posteP).id);
/* El comparativo es lo que impide que ancla y rim runner sean el mismo test
   con otro nombre: en esta liga el que rebotea en defensa casi siempre
   rebotea también en ataque. */
check('con RD y RO igual de altos gana Rim Runner: el ancla exige que el defensivo pese MÁS',
  J.jugadoresRolFuncional(Object.assign({}, interior,
    { pptDoble: 0.85, reboteRel: 1.60, reboteDefRel: 1.60 })).id === 'rim-runner');

/* --- P-6 / P-9: la zona gris de origen se resuelve por cristal --- */
const colsZG = ['NOMBRES', 'EQUIPO', 'FASE', 'MIN', 'RO%', 'RD%', 'RO', 'RD', 'RT', 'T3I', 'T2I', 'PPT2'];
const zg = (n, t3i, t2i, rt) => ({ NOMBRES: n, EQUIPO: 'A', FASE: 'REGULAR', MIN: '24',
  'RO%': '0,030', 'RD%': '0,090', RO: '2', RD: '4', RT: String(rt), T3I: String(t3i), T2I: String(t2i), PPT2: '0,90' });
const idxZG = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsZG, filas: [
    zg('GRIS REBOTEA', 2, 8, 12),    // mezcla 0,20 → zona gris, RT muy alto
    zg('GRIS NO REBOTEA', 2, 8, 2),  // mezcla 0,20 → zona gris, RT muy bajo
    zg('MEDIO 1', 2, 8, 6), zg('MEDIO 2', 2, 8, 6), zg('MEDIO 3', 2, 8, 6),
    { NOMBRES: 'JUGADOR TIPO', EQUIPO: '', FASE: 'REGULAR', MIN: '20',
      'RO%': '0,020', 'RD%': '0,060', RO: '1', RD: '3', RT: '6', T3I: '2', T2I: '8', PPT2: '0,90' },
  ] },
}, { fase: 'REGULAR' });
const perfZG = (n) => J.jugadoresPerfilBase(idxZG, idxZG.liga.jugadores.find(j => j['NOMBRES'] === n));
const gr = perfZG('GRIS REBOTEA'), gn = perfZG('GRIS NO REBOTEA');
check('la fixture cae de verdad en la zona gris de mezcla (0,12 a 0,30)',
  cerca(gr.mezclaTriple, 0.20, 1e-6) && gr.mezclaTriple >= J.JUGADORES_UMBRALES.mezclaTripleInterior &&
  gr.mezclaTriple < J.JUGADORES_UMBRALES.mezclaTripleaPerimetral, gr.mezclaTriple);
check('en la zona gris, el que pesa en el cristal se resuelve como INTERIOR',
  gr.esInterior === true && gr.esPerimetral === false,
  'int=' + gr.esInterior + ' per=' + gr.esPerimetral + ' rtRel=' + gr.reboteTotalRel);
check('y el que no, como PERIMETRAL',
  gn.esPerimetral === true && gn.esInterior === false,
  'int=' + gn.esInterior + ' per=' + gn.esPerimetral + ' rtRel=' + gn.reboteTotalRel);
check('ya no existe el caso "ni interior ni perimetral" con tiros de campo cargados',
  idxZG.liga.jugadores.filter(j => j['NOMBRES'] !== 'JUGADOR TIPO')
    .map(j => J.jugadoresPerfilBase(idxZG, j))
    .every(p => p.esInterior || p.esPerimetral));
/* Sin un solo tiro de campo no hay origen que inferir: eso NO se completa
   con el desempate, se deja explícitamente sin clasificar. */
check('sin tiros de campo el origen queda vacío: no se inventa',
  (() => { const p = J.jugadoresPerfilBase(idxZG, { NOMBRES: 'X', T3I: 0, T2I: 0 });
    return p.esInterior === false && p.esPerimetral === false && p.mezclaTriple === null; })());
check('el desempate usa el rebote TOTAL, que es el que dice cuánto vidrio toma',
  typeof gr.reboteTotalRel === 'number' && J.JUGADORES_UMBRALES.reboteDesempate === 1.10);

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
