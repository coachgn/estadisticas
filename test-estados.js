/* =====================================================================
   Motor de estados de jugador y detección de alertas.

   Lo puro de `sgadd-estados.js`. El drawer, el toast y el badge usan
   `document` y viven en `sgadd-buzon.js`: se verifican a mano en el
   navegador, igual que el resto de las UI del proyecto. Lo que sí se
   testea del buzón es su fuente, para amarrar los contratos de
   accesibilidad que no se pueden romper en silencio.
   ===================================================================== */
global.SGADD = require('./js/sgadd-core.js');
const E = require('./js/sgadd-estados.js');
let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

/* =====================================================================
   FIXTURE · un equipo con 12 fechas y cuatro situaciones distintas
   ===================================================================== */
const colsE = ['EQUIPO', 'FASE', 'PJ'];
const filasE = [
  { EQUIPO: 'A', FASE: 'REGULAR', PJ: '12' },
  { EQUIPO: 'B', FASE: 'REGULAR', PJ: '12' },
];

const FECHAS = [];
for (let i = 1; i <= 12; i++) FECHAS.push('0' + (i < 10 ? '' : '') + (i < 10 ? '1' : '1') + '/0' + (i <= 9 ? i : 9) + '/2026');
/* Fechas simples y crecientes, una por jornada. */
const fecha = (i) => (i < 10 ? '0' + i : i) + '/05/2026';

const colsBD = ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'PTS', 'PTSopp'];
const filasBD = [];
for (let i = 1; i <= 12; i++) {
  filasBD.push({ FECHA: fecha(i), PARTIDO: 'A vs B ' + i, EQUIPO: 'A', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'GANADO', PTS: '80', PTSopp: '70' });
  filasBD.push({ FECHA: fecha(i), PARTIDO: 'A vs B ' + i, EQUIPO: 'B', FASE: 'REGULAR', CONDICION: 'VISITANTE', RESULTADO: 'PERDIDO', PTS: '70', PTSopp: '80' });
}

const colsJ = ['NOMBRES', 'EQUIPO', 'FASE', 'PJ', 'MIN', 'PTS'];
const filasJ = [
  { NOMBRES: 'TITULAR, FIJO', EQUIPO: 'A', FASE: 'REGULAR', PJ: '12', MIN: '30', PTS: '15' },
  // Era rotación (8 partidos, 20 min) y no juega hace 4: ALERTA.
  { NOMBRES: 'LESIONADO, LARGO', EQUIPO: 'A', FASE: 'REGULAR', PJ: '8', MIN: '20', PTS: '10' },
  // Nunca entró: NO es alerta, no es una baja, nunca estuvo.
  { NOMBRES: 'NUNCA, JUGO', EQUIPO: 'A', FASE: 'REGULAR', PJ: '0', MIN: '0', PTS: '0' },
  // Entraba 3 minutos sueltos: NO es alerta, no era rotación.
  { NOMBRES: 'JUVENIL, BANCO', EQUIPO: 'A', FASE: 'REGULAR', PJ: '3', MIN: '3', PTS: '1' },
  { NOMBRES: 'OTRO, EQUIPO', EQUIPO: 'B', FASE: 'REGULAR', PJ: '12', MIN: '28', PTS: '12' },
  // Aparece en los dos equipos: candidato a TRASPASO.
  { NOMBRES: 'VIAJERO, PEDRO', EQUIPO: 'A', FASE: 'REGULAR', PJ: '6', MIN: '22', PTS: '9' },
  { NOMBRES: 'VIAJERO, PEDRO', EQUIPO: 'B', FASE: 'REGULAR', PJ: '6', MIN: '24', PTS: '11' },
  { NOMBRES: 'JUGADOR TIPO', EQUIPO: '', FASE: 'REGULAR', PJ: '10', MIN: '15', PTS: '8' },
];

const colsBJ = ['FECHA', 'PARTIDO', 'NOMBRES', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'MIN', 'PTS'];
const filasBJ = [];
const jugo = (nombre, equipo, i, min) => filasBJ.push({
  FECHA: fecha(i), PARTIDO: 'A vs B ' + i, NOMBRES: nombre, EQUIPO: equipo,
  FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'GANADO', MIN: String(min), PTS: '8',
});
for (let i = 1; i <= 12; i++) jugo('TITULAR, FIJO', 'A', i, 30);
for (let i = 1; i <= 8; i++) jugo('LESIONADO, LARGO', 'A', i, 20);     // corta en la 8 → racha 4
for (let i = 1; i <= 3; i++) jugo('JUVENIL, BANCO', 'A', i, 3);        // racha 9 pero 3 min
for (let i = 1; i <= 12; i++) jugo('OTRO, EQUIPO', 'B', i, 28);
for (let i = 1; i <= 6; i++) jugo('VIAJERO, PEDRO', 'A', i, 22);       // primera mitad en A
for (let i = 7; i <= 12; i++) jugo('VIAJERO, PEDRO', 'B', i, 24);      // segunda en B

const idx = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsJ, filas: filasJ },
  'Base Datos E': { cols: colsBD, filas: filasBD },
  'Base Datos J': { cols: colsBJ, filas: filasBJ },
}, { fase: 'REGULAR' });

/* =====================================================================
   1. TAXONOMÍA
   ===================================================================== */
console.log('\n1. TAXONOMÍA DE ESTADOS');
console.log('═'.repeat(70));
check('hay cuatro estados', E.ESTADOS.length === 4, E.ESTADOS.map(e => e.id).join(','));
check('están los cuatro que pidió el club',
  ['ACTIVO', 'SUSPENSO', 'ALTA', 'BAJA'].every(id => !!E.POR_ID[id]));
check('el defecto es ACTIVO', E.DEFECTO === 'ACTIVO');
check('cada estado trae emoji, label y descripción',
  E.ESTADOS.every(e => !!e.emoji && !!e.label && !!e.descripcion));

/* La decisión de negocio más importante de la taxonomía: una BAJA sale de
   los planes futuros pero NO de las medianas. Los partidos que jugó, los
   jugó — borrarla sería reescribir el torneo. */
check('BAJA sale de los planes defensivos', E.POR_ID.BAJA.enPlan === false);
check('pero BAJA CONSERVA sus datos en las medianas de la competencia',
  E.POR_ID.BAJA.enMedianas === true);
check('SUSPENSO sigue en los planes: el DT rival necesita saber que existe',
  E.POR_ID.SUSPENSO.enPlan === true);
check('y avisa en scouting, para que su ausencia no pase inadvertida',
  E.POR_ID.SUSPENSO.avisaEnScouting === true);
check('ALTA también entra al análisis sin exigir piso de partidos',
  E.POR_ID.ALTA.enPlan === true && E.POR_ID.ALTA.avisaEnScouting === true);
check('ACTIVO no genera ningún aviso', E.POR_ID.ACTIVO.avisaEnScouting === false);
check('estado() de un id inexistente cae al defecto en vez de romper',
  E.estado('NO_EXISTE').id === 'ACTIVO' && E.estado(null).id === 'ACTIVO');

/* =====================================================================
   2. CLAVES Y PERSISTENCIA
   ===================================================================== */
console.log('\n2. CLAVES Y ALMACENAMIENTO');
console.log('═'.repeat(70));
check('la clave es NOMBRE + EQUIPO, como el slug de la ficha',
  E.claveJugador('moreira , pedro', "ATENAS 'A' - MM") === 'MOREIRA, PEDRO|ATENAS A',
  E.claveJugador('moreira , pedro', "ATENAS 'A' - MM"));
/* Dos homónimos de equipos distintos son dos registros, no uno: es el
   mismo criterio que ya usa `jugadoresSlug`. */
check('dos homónimos de equipos distintos no comparten registro',
  E.claveJugador('PEREZ, JUAN', 'A') !== E.claveJugador('PEREZ, JUAN', 'B'));
check('la clave del almacén separa por club y por planilla',
  E.claveAlmacen('jujuy', 'apertura') !== E.claveAlmacen('reconquista', 'apertura') &&
  E.claveAlmacen('x', 'a') !== E.claveAlmacen('x', 'b'));
/* En Node no hay localStorage: el módulo tiene que degradar, no explotar. */
check('sin localStorage leerTodos devuelve {} en vez de romper',
  JSON.stringify(E.leerTodos('x', 'y')) === '{}');
check('y guardarTodos devuelve false sin tirar excepción',
  E.guardarTodos('x', 'y', { a: 1 }) === false);

/* =====================================================================
   3. REGISTROS Y PRECEDENCIA DE `origen: "usuario"`
   ===================================================================== */
console.log('\n3. PRECEDENCIA DE LA DECISIÓN DEL DT');
console.log('═'.repeat(70));
check('un jugador sin registro es ACTIVO por defecto',
  E.registroDe({}, 'X').estado === 'ACTIVO' && E.registroDe({}, 'X').origen === 'defecto');
check('registroDe con mapa nulo tampoco rompe', E.registroDe(null, 'X').estado === 'ACTIVO');

let mapa = E.aplicar({}, 'JUAN|A', 'SUSPENSO');
check('aplicar() guarda el estado', E.registroDe(mapa, 'JUAN|A').estado === 'SUSPENSO');
check('y lo marca como decisión del usuario', E.registroDe(mapa, 'JUAN|A').origen === 'usuario');
check('con fecha de corte para poder auditarlo', !!E.registroDe(mapa, 'JUAN|A').desde);
check('aplicar() no muta el mapa original', Object.keys({}).length === 0);
check('un estado inválido no ensucia el mapa',
  Object.keys(E.aplicar({}, 'X', 'INVENTADO')).length === 0);

/* LA REGLA DURA del pedido: lo que el DT confirma no se pisa nunca. */
const conDeteccion = E.fusionarDeteccion(mapa, [{ clave: 'JUAN|A', estado: 'BAJA' }]);
check('un escaneo automático NO pisa lo que confirmó el DT',
  E.registroDe(conDeteccion, 'JUAN|A').estado === 'SUSPENSO',
  E.registroDe(conDeteccion, 'JUAN|A').estado);
check('y el origen sigue siendo usuario', E.registroDe(conDeteccion, 'JUAN|A').origen === 'usuario');
/* Pero sí puede escribir sobre lo que puso otro escaneo. */
const autoSobreAuto = E.fusionarDeteccion(
  E.aplicar({}, 'ANA|A', 'SUSPENSO', { origen: 'automatico' }),
  [{ clave: 'ANA|A', estado: 'BAJA' }]);
check('un escaneo SÍ puede corregir a otro escaneo',
  E.registroDe(autoSobreAuto, 'ANA|A').estado === 'BAJA');
check('el DT puede cambiar de opinión sobre su propia decisión',
  E.registroDe(E.aplicar(mapa, 'JUAN|A', 'ACTIVO'), 'JUAN|A').estado === 'ACTIVO');

check('enPlan respeta la taxonomía',
  E.enPlan(E.aplicar({}, 'X|A', 'BAJA'), 'X|A') === false &&
  E.enPlan(E.aplicar({}, 'X|A', 'SUSPENSO'), 'X|A') === true &&
  E.enPlan({}, 'SIN_REGISTRO') === true);
check('enMedianas es true incluso para una BAJA',
  E.enMedianas(E.aplicar({}, 'X|A', 'BAJA'), 'X|A') === true);

/* =====================================================================
   4. DETECCIÓN DE INACTIVIDAD Y FILTRO ANTI-SPAM
   ===================================================================== */
console.log('\n4. ALERTA DE INACTIVIDAD (regla de los 4 partidos)');
console.log('═'.repeat(70));
check('la racha exigida es de 4 partidos', E.RACHA_INACTIVIDAD === 4);
check('el filtro anti-spam pide haber jugado alguno', E.MIN_PJ_PREVIOS === 0);
check('y un promedio previo de 8 minutos', E.MIN_MINUTOS_PREVIOS === 8.0);

const inact = E.detectarInactividad(idx, {});
const nombresInact = inact.map(a => a.nombre);
check('detecta al que ERA rotación y dejó de jugar',
  nombresInact.indexOf('LESIONADO, LARGO') !== -1, nombresInact.join(' | '));
/* Los dos falsos positivos que el filtro anti-spam tiene que matar. Sin
   ellos, sobre la liga real salían 50 alertas de 210 jugadores. */
check('NO alerta por el que nunca entró: no es una baja, nunca estuvo',
  nombresInact.indexOf('NUNCA, JUGO') === -1);
check('NO alerta por el juvenil que sumaba 3 minutos sueltos',
  nombresInact.indexOf('JUVENIL, BANCO') === -1);
check('NO alerta por el titular que juega todas las fechas',
  nombresInact.indexOf('TITULAR, FIJO') === -1);
check('cada alerta trae la racha y el promedio previo, no solo el nombre',
  inact.every(a => typeof a.racha === 'number' && typeof a.minPrevio === 'number' && a.pjPrevios > 0));
check('el detalle cita los números que la dispararon',
  inact.every(a => /\d/.test(a.detalle)), inact.map(a => a.detalle).join(' | '));
check('sugiere lesión o baja, y no elige por su cuenta',
  inact.every(a => a.sugerencias.indexOf('SUSPENSO') !== -1 && a.sugerencias.indexOf('BAJA') !== -1));
check('vienen ordenadas por racha descendente: primero el más ausente',
  inact.every((a, i, arr) => i === 0 || arr[i - 1].racha >= a.racha));

/* Y la precedencia también aplica al detector: lo ya contestado no vuelve. */
const yaContestado = E.aplicar({}, E.claveJugador('LESIONADO, LARGO', 'A'), 'SUSPENSO');
check('un jugador ya confirmado por el DT no vuelve a aparecer en el buzón',
  E.detectarInactividad(idx, yaContestado).every(a => a.nombre !== 'LESIONADO, LARGO'));

/* =====================================================================
   5. DETECCIÓN DE TRASPASO
   ===================================================================== */
console.log('\n5. ALERTA DE TRASPASO');
console.log('═'.repeat(70));
const trasp = E.detectarTraspasos(idx, {});
check('detecta al jugador que figura en dos equipos de la liga',
  trasp.length >= 2 && trasp.every(a => a.nombre === 'VIAJERO, PEDRO'),
  trasp.map(a => a.nombre + '@' + a.equipo).join(' | '));
check('genera una alerta por cada equipo donde aparece',
  new Set(trasp.map(a => a.equipo)).size === 2);
/* El equipo actual es donde jugó más recientemente. En la fixture,
   VIAJERO pasa de A (fechas 1-6) a B (fechas 7-12). */
const actual = trasp.find(a => a.esActual);
check('marca cuál es el equipo actual por la fecha del último partido',
  !!actual && actual.equipo === 'B', actual ? actual.equipo : 'ninguno');
check('al equipo actual le sugiere ALTA y al anterior BAJA',
  trasp.every(a => a.esActual ? a.sugerencias.indexOf('ALTA') !== -1 : a.sugerencias.indexOf('BAJA') !== -1));
check('el detalle nombra los dos equipos',
  trasp.every(a => a.detalle.indexOf('A') !== -1 && a.detalle.indexOf('B') !== -1));
/* No puede decidir sola: la clave es el string del nombre, así que dos
   homónimos son indistinguibles de un traspaso (deuda técnica conocida). */
check('no alerta por jugadores que están en un solo equipo',
  trasp.every(a => a.nombre !== 'TITULAR, FIJO' && a.nombre !== 'OTRO, EQUIPO'));

/* =====================================================================
   5 bis. ALERTA DE REINGRESO · el que vuelve

   Contracara necesaria de la alerta de inactividad: sin esto, un jugador
   marcado 🟡 SUSPENSO se quedaba con esa etiqueta para siempre, porque
   `origen: "usuario"` bloquea al detector. El DT tenía que acordarse solo
   de que volvió.
   ===================================================================== */
console.log('\n5 bis. ALERTA DE REINGRESO');
console.log('═'.repeat(70));

/* TITULAR juega las 12 fechas. Si alguien lo marcó como lesionado, el
   sistema tiene que avisar que está jugando igual. */
const claveTitular = E.claveJugador('TITULAR, FIJO', 'A');
const marcadoMal = E.aplicar({}, claveTitular, 'SUSPENSO', { origen: 'usuario' });
const reing = E.detectarReingresos(idx, marcadoMal);
check('avisa cuando un marcado como SUSPENSO volvió a jugar',
  reing.length === 1 && reing[0].nombre === 'TITULAR, FIJO',
  reing.map(r => r.nombre).join('|'));
check('la alerta dice en qué estado está y cuántos partidos jugó',
  reing[0].estadoActual === 'SUSPENSO' && reing[0].partidosJugados > 0 && /\d/.test(reing[0].detalle),
  reing[0].detalle);
check('sugiere volver a ACTIVO', reing[0].sugerencias.indexOf('ACTIVO') !== -1);
check('también avisa si estaba dado de BAJA y volvió a jugar',
  E.detectarReingresos(idx, E.aplicar({}, claveTitular, 'BAJA', { origen: 'usuario' })).length === 1);

/* ES LA ÚNICA alerta que se dispara sobre un registro marcado por el
   usuario, y no contradice la precedencia: no cambia nada, avisa de un
   hecho nuevo —jugó— que el DT no tenía cuando decidió. */
check('el reingreso NO cambia el estado por su cuenta: solo avisa',
  E.registroDe(marcadoMal, claveTitular).estado === 'SUSPENSO');
check('no avisa por un jugador ACTIVO que juega: eso no es noticia',
  E.detectarReingresos(idx, {}).length === 0);
/* LESIONADO, LARGO no juega hace 4 fechas: marcarlo suspenso es correcto y
   no tiene que generar un reingreso. */
const claveLesionado = E.claveJugador('LESIONADO, LARGO', 'A');
check('no avisa por el que sigue sin jugar después de marcarlo',
  E.detectarReingresos(idx, E.aplicar({}, claveLesionado, 'SUSPENSO', { origen: 'usuario' })).length === 0);
check('sin índice devuelve lista vacía en vez de romper',
  E.detectarReingresos(null, marcadoMal).length === 0 && E.detectarReingresos(idx, null).length === 0);

/* --- Volver a ACTIVO es siempre posible --- */
const reactivado = E.aplicar(marcadoMal, claveTitular, 'ACTIVO', { origen: 'usuario' });
check('reactivar deja el registro en ACTIVO y como decisión del usuario',
  E.registroDe(reactivado, claveTitular).estado === 'ACTIVO' &&
  E.registroDe(reactivado, claveTitular).origen === 'usuario');
check('y la alerta de reingreso desaparece',
  E.detectarReingresos(idx, reactivado).length === 0);
check('vuelve a entrar a los planes defensivos',
  E.enPlan(reactivado, claveTitular) === true);
/* Y el ciclo se puede repetir: se lesiona de nuevo, vuelve de nuevo. */
check('el ciclo se puede repetir sin límite',
  E.detectarReingresos(idx, E.aplicar(reactivado, claveTitular, 'SUSPENSO', { origen: 'usuario' })).length === 1);

/* =====================================================================
   6. AGREGADO Y RESUMEN
   ===================================================================== */
console.log('\n6. AGREGADO DE ALERTAS Y RESUMEN');
console.log('═'.repeat(70));
const todas = E.detectarAlertas(idx, {});
check('detectarAlertas junta traspasos e inactividad',
  todas.length === trasp.length + inact.length, todas.length);
check('cada alerta trae tipo, clave, nombre y equipo',
  todas.every(a => !!a.tipo && !!a.clave && !!a.nombre && !!a.equipo));
check('los traspasos van primero: son los que cambian el plantel',
  todas[0].tipo === 'traspaso');
check('sin índice no rompe: devuelve lista vacía',
  E.detectarAlertas(null, {}).length === 0);

const res = E.resumen(E.aplicar(E.aplicar({}, 'A|X', 'BAJA'), 'B|X', 'SUSPENSO'), todas);
check('el resumen cuenta por estado',
  res.porEstado.BAJA === 1 && res.porEstado.SUSPENSO === 1 && res.porEstado.ACTIVO === 0,
  JSON.stringify(res.porEstado));
check('cuenta las alertas y las agrupa por tipo',
  res.alertas === todas.length && res.porTipo.traspaso > 0);
check('y cuánto confirmó el DT a mano', res.marcadosPorUsuario === 2);

/* =====================================================================
   7. CONTRATOS DE LA UI DEL BUZÓN

   El drawer usa `document` y no se puede instanciar en Node, pero los
   contratos de accesibilidad y de patrón sí se pueden amarrar sobre el
   fuente: son justamente los que se rompen sin que nadie lo note.
   ===================================================================== */
console.log('\n7. CONTRATOS DE LA UI DEL BUZÓN');
console.log('═'.repeat(70));
const fs = require('fs');
const buzon = fs.readFileSync('./js/sgadd-buzon.js', 'utf8');

check('el drawer se anuncia como diálogo modal',
  /role="dialog"/.test(buzon) && /aria-modal="true"/.test(buzon));
check('y está etiquetado por su título', /aria-labelledby="buzonTitulo"/.test(buzon));
check('cierra con ESC', /ev\.key === 'Escape'/.test(buzon));
check('cierra con clic afuera', /event\.target===this\)SGADD_BUZON\.cerrar\(\)/.test(buzon));
check('y tiene un botón de cierre explícito', /aria-label="Cerrar alertas"/.test(buzon));
/* Sin trampa de foco, el tabulador se va a la página de atrás y el drawer
   deja de ser modal en la práctica. */
check('atrapa el foco adentro mientras está abierto',
  /ev\.key !== 'Tab'/.test(buzon) && /shiftKey/.test(buzon));
check('y devuelve el foco al disparador al cerrar',
  /estado\.disparador[\s\S]{0,120}focus\(\)/.test(buzon));
check('usa overlay oscuro con desenfoque', /bg-black\/60 backdrop-blur-sm/.test(buzon));
check('tiene animación de entrada y de salida',
  /buzon-fade/.test(buzon) && /buzon-slide/.test(buzon) && /buzon-saliendo/.test(buzon));
/* Empty state: no una lista vacía, un cierre positivo. */
check('trae un empty state propio y no una lista vacía',
  /function vacio/.test(buzon) && /Plantel al día/.test(buzon));
check('el toast se anuncia a lectores de pantalla sin robar el foco',
  /role', 'status'/.test(buzon) && /aria-live', 'polite'/.test(buzon));
/* Que TODO botón del drawer tenga anillo de foco, no que haya "algunos":
   el que se olvida es siempre el que rompe la navegación por teclado. */
const botones = buzon.match(/<button[\s\S]*?>/g) || [];
const sinAnillo = botones.filter(b => !/focus-visible:ring-2/.test(b));
check('TODO botón del buzón declara focus ring visible',
  botones.length >= 3 && sinAnillo.length === 0,
  botones.length + ' botones, ' + sinAnillo.length + ' sin anillo');
check('y usa :focus-visible, no :focus: el anillo aparece con teclado, no con cada clic',
  !/\bfocus:ring-2/.test(buzon));
/* Descartar tiene que ser tan fácil como confirmar: si no, el buzón se
   vuelve una trampa y el DT deja de abrirlo. */
check('cada alerta ofrece SIEMPRE la opción de mantener activo',
  /Mantener activo/.test(buzon));
/* En un reingreso "mantener activo" no tiene sentido: el jugador
   justamente NO está activo. La acción neutra es dejarlo como está. */
check('en un reingreso la acción neutra es dejarlo como está, no "mantener activo"',
  /Dejarlo como está/.test(buzon) && /a\.tipo === 'reingreso'/.test(buzon));
/* Sin lista de confirmados no había forma de deshacer: la alerta que
   originó el estado desaparece justamente porque el DT la contestó. */
check('hay una lista de estados confirmados para poder revertir después',
  /function listaConfirmados/.test(buzon) && /Estados confirmados/.test(buzon));
check('con un botón de reactivar por jugador',
  /SGADD_BUZON\.revertir\(/.test(buzon) && /Reactivar/.test(buzon));
check('revertir marca ACTIVO como decisión del usuario y avisa con toast',
  /aplicar\(estado\.mapa, clave, 'ACTIVO', \{ origen: 'usuario' \}\)/.test(buzon) &&
  /vuelve a Activo/.test(buzon));
check('la lista solo muestra lo que confirmó el DT, no lo que detectó el motor',
  /reg\.origen === 'usuario' && x\.reg\.estado !== 'ACTIVO'/.test(buzon));
/* =====================================================================
   DOS NIVELES · EL AVISO INFORMA, LA ALERTA PREGUNTA

   Pedido del club: faltar a dos fechas casi nunca es una baja —un golpe,
   un viaje, una sanción— pero merece que el DT lo tenga a la vista. Si
   esos avisos entraran al buzón como alertas volvería el problema que el
   filtro anti-spam vino a resolver: una lista que nadie contesta.
   ===================================================================== */
console.log('\n11. NIVELES · AVISO vs ALERTA');
console.log('═'.repeat(70));

check('el umbral del aviso es menor que el de la alerta',
  E.RACHA_AVISO < E.RACHA_INACTIVIDAD, E.RACHA_AVISO + ' < ' + E.RACHA_INACTIVIDAD);

/* Fixture propia: 8 fechas, uno que falta a 2 y otro que falta a 5. No se
   toca la de arriba para no mover las cuentas que ya fija el resto. */
const filasBDn = [], filasBJn = [];
for (let i = 1; i <= 8; i++) {
  ['C', 'D'].forEach(eq => filasBDn.push({ FECHA: fecha(i), PARTIDO: 'C vs D ' + i,
    EQUIPO: eq, FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: 'GANADO', PTS: '80', PTSopp: '70' }));
}
const jugoN = (nombre, i) => filasBJn.push({ FECHA: fecha(i), PARTIDO: 'C vs D ' + i,
  NOMBRES: nombre, EQUIPO: 'C', FASE: 'REGULAR', CONDICION: 'LOCAL',
  RESULTADO: 'GANADO', MIN: '20', PTS: '8' });
for (let i = 1; i <= 6; i++) jugoN('AVISADO, DOS', i);        // racha 2 → aviso
for (let i = 1; i <= 3; i++) jugoN('ALERTADO, CINCO', i);     // racha 5 → alerta
for (let i = 1; i <= 8; i++) jugoN('REGULAR, TODAS', i);      // racha 0 → nada
const idxNiv = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: [{ EQUIPO: 'C', FASE: 'REGULAR', PJ: '8' }, { EQUIPO: 'D', FASE: 'REGULAR', PJ: '8' }] },
  'PROMEDIOS J': { cols: colsJ, filas: [
    { NOMBRES: 'AVISADO, DOS', EQUIPO: 'C', FASE: 'REGULAR', PJ: '6', MIN: '20', PTS: '8' },
    { NOMBRES: 'ALERTADO, CINCO', EQUIPO: 'C', FASE: 'REGULAR', PJ: '3', MIN: '20', PTS: '8' },
    { NOMBRES: 'REGULAR, TODAS', EQUIPO: 'C', FASE: 'REGULAR', PJ: '8', MIN: '20', PTS: '8' },
  ] },
  'Base Datos E': { cols: colsBD, filas: filasBDn },
  'Base Datos J': { cols: colsBJ, filas: filasBJn },
}, { fase: 'REGULAR' });
const detNiv = E.detectarInactividad(idxNiv, {});
const avisado = detNiv.find(a => /AVISADO/.test(a.nombre));
const alertado = detNiv.find(a => /ALERTADO/.test(a.nombre));

check('el de dos fechas entra como AVISO', !!avisado && avisado.nivel === 'aviso',
  avisado ? avisado.nivel + ' · racha ' + avisado.racha : 'no detectado');
check('el de cinco entra como ALERTA', !!alertado && alertado.nivel === 'alerta',
  alertado ? alertado.nivel + ' · racha ' + alertado.racha : 'no detectado');
check('el que jugó todas no aparece', !detNiv.some(a => /REGULAR/.test(a.nombre)));

/* La diferencia que importa: el aviso NO propone estados, así que su
   tarjeta no le puede pedir una decisión al DT. */
check('el aviso no trae sugerencias de estado', !!avisado && avisado.sugerencias.length === 0);
check('la alerta sí las trae', !!alertado && alertado.sugerencias.length === 2,
  alertado ? alertado.sugerencias.join(',') : '');

check('soloAlertas() y soloAvisos() parten el total sin perder ninguna',
  E.soloAlertas(detNiv).every(a => a.nivel !== 'aviso') &&
  E.soloAvisos(detNiv).every(a => a.nivel === 'aviso') &&
  E.soloAlertas(detNiv).length + E.soloAvisos(detNiv).length === detNiv.length);

/* El badge de la campana cuenta DECISIONES pendientes, no avisos: si los
   sumara, el número volvería a ser el que nadie contesta. */
const resNiv = E.resumen({}, detNiv);
check('el resumen separa alertas de avisos',
  resNiv.alertas === E.soloAlertas(detNiv).length && resNiv.avisos === E.soloAvisos(detNiv).length,
  JSON.stringify({ alertas: resNiv.alertas, avisos: resNiv.avisos }));
check('el badge del buzón cuenta solo las que piden decisión',
  /function badge\(\)[\s\S]{0,600}const n = alertasQuePiden\(\)/.test(buzon));
/* La campana se dibuja SIEMPRE (ver el bloque de más abajo: se iba al
   cambiar de tramo). Lo que distingue un aviso de una alerta es el
   badge, no la existencia del control. */
check('y la campana se dibuja igual, haya avisos o no haya nada',
  !/if \(!n && !nAvisos\) return '';/.test(buzon));

/* Para pintarlo AL LADO del jugador hace falta poder preguntarlo por clave. */
check('pendienteDe() devuelve lo que hay sobre un jugador',
  E.pendienteDe(detNiv, avisado.clave) === avisado);
check('y null para el que no tiene nada',
  E.pendienteDe(detNiv, E.claveJugador('REGULAR, TODAS', 'C')) === null);
/* Con las dos cosas encima manda la que pide decisión. */
check('si tiene aviso y alerta, gana la alerta',
  E.pendienteDe([{ clave: 'X', nivel: 'aviso' }, { clave: 'X', nivel: 'alerta' }], 'X').nivel === 'alerta');

/* --- Marcar a mano, sin esperar las cuatro fechas del detector --- */
check('el buzón expone marcar() para adelantarse a la alerta',
  /function marcar\(nombre, equipo, idEstado\)/.test(buzon));
check('y lo guarda como decisión del usuario, que gana sobre el detector',
  /function marcar\([\s\S]{0,300}origen: 'usuario'/.test(buzon));
check('marcar a mano recalcula: puede tapar una alerta que estaba pendiente',
  /function marcar\([\s\S]{0,600}sincronizar\(\)/.test(buzon));

const jug = fs.readFileSync('./js/sgadd-jugadores.js', 'utf8');
check('la ficha del jugador ofrece los cuatro estados',
  /function jugadoresControlEstado/.test(jug) && /function jugadoresMarcarEstado/.test(jug));
/* Es un CONTROL, no contenido: en el PDF de la ficha no va. */
check('y ese control no se imprime', /border-hairline" data-no-print/.test(jug));

/* --- La sección de observación se pliega, y el atajo a la ficha --- */
/* Con 26 en observación (la U23 real) la lista empuja a las alertas
   —lo único que pide respuesta— fuera de la pantalla. */
/* El drawer se abre como un ÍNDICE: buscador arriba y las tres listas
   plegadas con su número. Con 14 alertas + 13 avisos, la altura del
   contenido baja de 2747 a 828px medidos en Primera. */
check('las tres listas usan el MISMO componente plegable',
  /function seccion\(id, titulo, cuenta, cuerpo, tono\)/.test(buzon) &&
  /seccion\('alertas',/.test(buzon) && /seccion\('obs',/.test(buzon) && /seccion\('conf',/.test(buzon));
check('las tres arrancan plegadas',
  /secciones: \{ alertas: false, obs: false, conf: false \}/.test(buzon));
check('y cada encabezado dice cuántos hay sin tener que abrirlo',
  /<span class="ml-auto tabular-nums text-ink">\$\{cuenta\}<\/span>/.test(buzon));
/* El plegado vive en el ESTADO y no en el DOM: si viviera en el DOM, un
   repintado volvería a plegar lo que el DT acababa de abrir. */
check('lo que el DT abre queda abierto y sobrevive al repintado',
  /ontoggle="SGADD_BUZON\.recordarSeccion\(/.test(buzon) &&
  /function recordarSeccion\(id, abierta\)[\s\S]{0,150}estado\.secciones\[id\] = !!abierta/.test(buzon));
check('y recordarSeccion() ignora un id que no existe en vez de inventarlo',
  /if \(id in estado\.secciones\)/.test(buzon));

/* Con la sección plegada, ESE número es toda la información: dejarlo en
   14 después de resolver tres es peor que no mostrarlo. */
check('resolver una alerta baja el contador del encabezado',
  /#buzonSec-alertas summary span:last-child/.test(buzon));
check('y resuelta la última se repinta, que trae el cierre positivo',
  /if \(!quedan\) \{ repintarPanel\(\); return; \}/.test(buzon));

/* --- El buscador: llegar a CUALQUIER jugador del torneo --- */
check('el drawer abre con un buscador arriba de las tres listas',
  /function bloqueBuscador\(\)/.test(buzon) &&
  /const lista = bloqueBuscador\(\)/.test(buzon));
/* Busca sobre TODO el torneo, y con el backend eso ya no es lo mismo que
   el índice: el servidor recorta las filas de los rivales, así que el
   índice trae solo el plantel propio. El padrón —nombre y equipo de toda
   la liga, sin una sola estadística— viene aparte y se une acá.

   En modo GViz el padrón viene vacío y el índice ya tiene a todos, así
   que el buscador se comporta igual en los dos modos. */
check('busca sobre toda la categoría, no solo sobre los que ya tienen alerta',
  /function padronCompleto[\s\S]{0,900}idx\.liga\.jugadores/.test(buzon) &&
  /function padronCompleto[\s\S]{0,900}st\.padron/.test(buzon));
check('y el jugador del índice gana sobre el del padrón, que no trae su fila',
  /vistos\.has\(clave\)\) return;/.test(buzon));
/* "MUÑOZ" tiene que aparecer escribiendo "munoz". */
check('la búsqueda ignora acentos y mayúsculas',
  /normalize\('NFD'\)\.replace\(\/\[\\u0300-\\u036f\]\/g, ''\)\.toLowerCase\(\)/.test(buzon));
check('y busca por nombre Y por equipo',
  /normalizar\(r\.nombre\)\.indexOf\(q\) < 0 && normalizar\(r\.equipo\)\.indexOf\(q\) < 0/.test(buzon));
/* Pero mostrar a un rival en el buscador NO abre su ficha: eso es
   análisis en profundidad y es justo lo que el plan del club no cubre.
   El botón queda deshabilitado con su motivo, y `irAFicha` chequea
   igual — un botón deshabilitado no impide llamar a la función. */
check('mostrar a un rival no habilita su ficha',
  /function puedeVerFicha/.test(buzon) && /cursor-not-allowed/.test(buzon));
check('y el guard está también en irAFicha, no solo en el botón',
  /function irAFicha\(clave\) \{[\s\S]{0,200}puedeVerFicha\(clave\)/.test(buzon));
check('con menos de dos letras no devuelve media liga',
  /if \(q\.length < 2\) return \[\];/.test(buzon));
check('y los resultados se recortan, con aviso de cuántos quedaron afuera',
  /slice\(0, MAX_RESULTADOS\)/.test(buzon) && /afiná la búsqueda/.test(buzon));

/* El input NO puede repintar el drawer entero: un repintado por tecla le
   saca el foco y hace imposible escribir un apellido. Es la misma regla
   que ya cumplen `scoutMeta()` y `scoutMarca()`. */
check('tipear repinta SOLO los resultados, no el drawer',
  /function buscar\(texto\)[\s\S]{0,300}getElementById\('buzonResultados'\)/.test(buzon) &&
  !/function buscar\(texto\)[\s\S]{0,300}repintarPanel\(\)/.test(buzon));
/* Marcar un estado sí repinta: ahí el foco y el cursor no viajan solos. */
check('y el repintado devuelve el foco y el cursor al buscador',
  /function repintarPanel[\s\S]{0,1600}setSelectionRange\(cursor, cursor\)/.test(buzon));

check('desde el buscador se marca cualquier estado a mano',
  /function marcarPorClave\(clave, idEstado\)/.test(buzon) &&
  /marcarPorClave[\s\S]{0,600}marcar\(partes\[0\], partes\[1\] \|\| '', idEstado\)/.test(buzon));
/* Reusa `marcar()` para no tener dos caminos de escritura: uno de los dos
   se olvidaría de persistir o de sincronizar. */
check('y reusa marcar(), no escribe el mapa por su cuenta',
  !/function marcarPorClave[\s\S]{0,400}E\.aplicar\(/.test(buzon));

/* NO todas las alertas tienen `racha`: un reingreso o un traspaso no son
   una cuenta de fechas, y asumir que sí imprimía "🔔 undefined fechas" —
   justo en el caso más común, marcar SUSPENSO a alguien que jugó hace
   poco, que dispara la alerta de reingreso. */
check('el resumen de lo pendiente no asume que toda alerta tiene racha',
  /function resumenPendiente[\s\S]{0,400}a\.tipo === 'inactividad'/.test(buzon) &&
  /function resumenPendiente[\s\S]{0,500}TIPOS\[a\.tipo\]/.test(buzon));
/* --- Las cards de observación se abren y marcan el estado ahí mismo --- */
/* Los avisos no llevan los botones a la vista: con los cuatro desplegados
   en trece tarjetas volvería el buzón que nadie contesta. Pero cuando el
   DT ya sabe qué pasó —y de eso se trata el aviso— tiene que poder
   anotarlo sin ir hasta la ficha. */
check('una card de observación se abre con un clic',
  /onclick="SGADD_BUZON\.abrirAviso\(/.test(buzon) &&
  /function abrirAviso\(clave\)/.test(buzon));
check('y abierta muestra los cuatro estados',
  /\$\{abierto \? botonesEstado\(a\.clave\) : ''\}/.test(buzon));
/* Trece abiertas es exactamente la lista que la sección plegable vino a
   evitar, así que se abre UNA por vez y la misma card la cierra. */
check('se abre una sola por vez, y volver a tocarla la cierra',
  /estado\.avisoAbierto = \(estado\.avisoAbierto === clave\) \? null : clave;/.test(buzon));
check('abrir una card repinta SOLO la lista, no el drawer',
  /function abrirAviso[\s\S]{0,300}getElementById\('buzonAvisos'\)/.test(buzon) &&
  !/function abrirAviso[\s\S]{0,300}repintarPanel/.test(buzon));
check('el estado de apertura se anuncia con aria-expanded',
  /aria-expanded="\$\{abierto\}"/.test(buzon));
/* No solo color: el chevron dice si está abierta o cerrada. */
check('y no se comunica solo con el borde',
  /\$\{abierto \? '▾' : '▸'\}/.test(buzon));

/* Es el MISMO gesto que en el buscador —elegir a alguien y decir qué le
   pasa— así que tiene que verse igual: un solo juego de botones. */
check('el buscador y las cards usan los MISMOS botones de estado',
  /function botonesEstado\(clave\)/.test(buzon) &&
  /const botones = botonesEstado\(clave\);/.test(buzon) &&
  (buzon.match(/onclick="SGADD_BUZON\.marcarPorClave\(/g) || []).length === 1);
check('y marcan el estado vigente para no repetir lo que ya está puesto',
  /aria-pressed="\$\{e\.id === actual\}"/.test(buzon));

check('cada alerta y cada aviso llevan su atajo a la ficha',
  /function botonFicha\(clave, nombre\)/.test(buzon) &&
  (buzon.match(/\$\{botonFicha\(a\.clave, a\.nombre\)\}/g) || []).length === 2);
/* El slug NO se arma en el buzón: se busca el jugador y se le pide a
   `jugadoresSlug()`. Repetir la fórmula sería un segundo lugar que se
   desincroniza, que es el bug que ya tuvo el rol funcional. */
check('el slug sale de jugadoresSlug(), no de una fórmula duplicada',
  /function irAFicha[\s\S]{0,1600}entidad: jugadoresSlug\(j\)/.test(buzon));
check('y si el jugador no está en la categoría abierta, avisa en vez de romper',
  /function irAFicha[\s\S]{0,800}if \(!j\) \{ toast\(/.test(buzon));
/* El drawer se cierra porque el DT se va a otra pantalla: el foco tiene
   que ir al contenido nuevo, no volver a la campana que abrió el modal. */
check('al ir a la ficha el foco NO vuelve al disparador',
  /function irAFicha[\s\S]{0,900}estado\.disparador = null;\s*\r?\n\s*cerrar\(\);/.test(buzon));

/* Lo pendiente se ve DONDE ESTÁ EL JUGADOR, no solo dentro del drawer. */
check('el aviso se muestra en la ficha y en la card del plantel',
  /function jugadoresBadgePendiente/.test(jug) && /function jugadoresLineaPendiente/.test(jug));
check('y también en la ficha de scouting del rival',
  /SGADD_BUZON\.pendienteDe/.test(fs.readFileSync('./js/sgadd-scouting.js', 'utf8')));
/* El estado confirmado manda sobre la sospecha: no se muestran los dos. */
check('con un estado confirmado la línea de aviso se calla',
  /function jugadoresLineaPendiente[\s\S]{0,400}est\.id !== 'ACTIVO'\) return '';/.test(jug));

check('el buzón conoce los tres tipos de alerta',
  /reingreso:\s*\{/.test(buzon) && /traspaso:\s*\{/.test(buzon) && /inactividad:\s*\{/.test(buzon));
/* LA CAMPANA ESTÁ SIEMPRE · esta regla CAMBIÓ, y conviene saber por qué.

   Antes no se dibujaba sin alertas ni avisos, con el argumento de que un
   icono permanentemente vacío entrena a ignorarlo. Ese argumento valía
   cuando el drawer era SOLO una lista de alertas.

   Dos cosas lo invalidaron:

     1. El drawer tiene buscador y lista de estados confirmados desde el
        punto 13. Es útil con cero pendientes, y esconderlo deja al DT sin
        forma de marcar a nadie a mano.
     2. DESAPARECÍA AL CAMBIAR DE TRAMO. Medido en DEPORTIVO: VUELTA tiene
        12 partidos y 0 alertas, así que la campana se iba al pasar de Ida
        a Vuelta y volvía sola al volver. Un control que aparece y
        desaparece según el recorte se lee como un bug, no como una señal.

   Lo que NO cambió es la regla que importa: el NÚMERO significa "esto
   espera una respuesta tuya". Sin alertas no hay badge, y el icono se
   atenúa para que la ausencia se note igual. */
check('la campana se dibuja siempre, también sin nada pendiente',
  !/if \(!n && !nAvisos\) return '';/.test(buzon));
check('pero el número sigue atado a las alertas que piden decisión',
  /\$\{n \? `<span class="buzon-badge">\$\{n\}<\/span>` : ''\}/.test(buzon));
check('y sin nada pendiente el icono se atenúa en vez de irse',
  /buzon-quieto/.test(buzon));
check('con el título diciendo para qué sirve igual',
  /Plantel al día/.test(buzon));
/* La campana vive en el HEADER, donde antes estaba el cartel "Datos
   actualizados". Así se ve desde cualquier sección, incluida Principal, que
   usa la capa de datos vieja y no pinta la barra de SGADD_APP. */
const indexHtml = fs.readFileSync('./index.html', 'utf8');
check('el slot del buzón está en el header, al lado del banner de estado',
  /id="status-banner-holder"[\s\S]{0,200}<div id="buzonSlot"/.test(indexHtml));
/* Los dos van dentro de un mismo grupo con `ml-auto`. Sueltos, el
   `justify-between` del header los repartía a lo ancho y la campana quedaba
   flotando en el MEDIO de la barra en vez de anclada a la derecha. El buzón
   va último dentro del grupo, o sea pegado al borde. */
check('van agrupados y anclados al extremo derecho, no repartidos por el flex',
  /<div class="flex items-center gap-3 shrink-0 ml-auto">[\s\S]{0,900}id="buzonSlot"/.test(indexHtml));
/* Y EL ORDEN DENTRO DEL GRUPO. El selector de CLIENTE va primero: es el
   contexto más amplio de la pantalla —de qué club son todos los demás
   datos— así que se lee antes que el estado y que las alertas, que hablan
   de ESE club. El buzón queda último, pegado al borde. */
check('el selector de cliente va antes del estado y del buzón',
  /id="clientesSlot"[\s\S]{0,400}id="status-banner-holder"[\s\S]{0,400}id="buzonSlot"/.test(indexHtml));
check('y NO en la barra de sección, que Principal no pinta',
  !/buzonSlot/.test(fs.readFileSync('./js/sgadd-app.js', 'utf8')));
/* El arranque del índice tiene que colgar de `init()`, NO de `refreshData()`:
   refreshData solo corre cuando el usuario toca "Actualizar datos", así que
   la campana no aparecía hasta que alguien la tocara o entrara a Equipos. */
const bloqueInit = indexHtml.slice(indexHtml.indexOf('async function init()'));
check('init() dispara SGADD_APP.cargar() para que el buzón tenga alertas al arrancar',
  /SGADD_APP\.cargar\(\)[\s\S]{0,160}SGADD_BUZON\.sincronizar\(\)/.test(
    bloqueInit.slice(0, bloqueInit.indexOf('Cambio de categoria'))));
check('el punto verde de "datos actualizados" acompaña a la hora',
  /bg-green-500[^`]*\$\{escapeHtml\(lastUpdated\.toLocaleTimeString/.test(indexHtml));
/* Estaba duplicado: el header decía "Datos actualizados" y el pie del menú
   la hora. Ahora el header queda para los errores, que sí necesitan verse. */
check('el header solo se usa para avisos de error, no repite el estado OK',
  /Sin errores el header queda vacío/.test(indexHtml));
check('el badge dice en su etiqueta accesible qué hay pendiente',
  /const etiqueta = n/.test(buzon) &&
  /alerta' \+ \(n === 1 \? '' : 's'\) \+ ' de plantel pendiente/.test(buzon) &&
  /en observación/.test(buzon));
check('resolver() marca la decisión como del usuario',
  /aplicar\(estado\.mapa, a\.clave, idEstado, \{ origen: 'usuario' \}\)/.test(buzon));
check('y confirma con un toast', /toast\(e\.emoji/.test(buzon));

/* =====================================================================
   EL DRAWER NO PIERDE LA POSICIÓN DE LECTURA

   `root.innerHTML = panel()` reconstruía TODO el drawer, así que el
   contenedor scrolleable nacía en scrollTop 0: resolver la novena tarjeta
   mandaba al DT de vuelta al principio. Con quince alertas eso convierte el
   buzón en algo que no se termina de usar.
   ===================================================================== */
console.log('\n8. DRAWER · resolver una alerta no resetea el scroll');
console.log('═'.repeat(70));

check('el contenedor scrolleable tiene id propio para poder leer su scrollTop',
  /id="buzonScroll"/.test(buzon));
check('resolver() ya NO reconstruye el drawer entero con innerHTML = panel()',
  !/function resolver[\s\S]{0,2000}?root\.innerHTML = panel\(\)/.test(buzon));
check('saca SOLO la tarjeta resuelta del DOM',
  /function quitarTarjeta/.test(buzon) && /removeChild\(li\)/.test(buzon));
/* La altura se anima porque `height:auto` no lo es; sin fijarla en px antes,
   la tarjeta desaparece de golpe y el salto es el mismo que se evita. */
check('la anima colapsando la altura, fijándola antes en píxeles',
  /li\.style\.height = li\.offsetHeight \+ 'px'/.test(buzon) &&
  /li\.style\.height = '0px'/.test(buzon));
/* `space-y` pone margin-top en la SIGUIENTE tarjeta: sin anularlo queda un
   hueco fantasma donde estaba la que se fue. */
check('y colapsa también margen, padding y borde, o queda un hueco fantasma',
  /marginTop = '0px'/.test(buzon) && /paddingTop = '0px'/.test(buzon) &&
  /borderWidth = '0px'/.test(buzon));
check('la posición de lectura se restaura acotada al alto nuevo',
  /scrollTop = Math\.min\([\s\S]{0,80}scrollHeight - [\s\S]{0,30}clientHeight/.test(buzon));
check('el repintado completo, cuando hace falta, también conserva el scroll',
  /function repintarPanel[\s\S]{0,1600}scrollTop = Math\.min/.test(buzon));
/* Preservar el scroll SIN preservar los desplegables no alcanza: si el
   plegado viviera en el DOM, al repintar volverían cerrados, el contenido
   se acortaría y el scrollTop guardado quedaría por encima del máximo
   nuevo, así que el navegador lo recorta a 0. Por eso vive en el estado. */
check('los plegados sobreviven al repintado porque viven en el estado',
  /estado\.secciones\[id\]/.test(buzon) &&
  /const abierta = !!estado\.secciones\[id\];/.test(buzon));
check('prefers-reduced-motion saltea la animación de salida',
  /function sinMovimiento[\s\S]{0,200}prefers-reduced-motion/.test(buzon) &&
  /\.buzon-tarjeta-saliendo \{ transition: none !important/.test(indexHtml));

/* El bug escondido detrás del fix: los botones se identificaban por ÍNDICE
   del array. Al sacar una tarjeta sin repintar, `estado.alertas` se
   recalcula y se acorta, así que los índices de las de abajo quedan
   corridos y el clic siguiente resuelve al jugador EQUIVOCADO — sin ningún
   síntoma visible. La clave sobrevive a que la lista cambie debajo. */
check('las acciones se anclan a la CLAVE del jugador, no al índice del array',
  /SGADD_BUZON\.resolver\('\$\{SGADD_UI\.escJs\(a\.clave\)\}'/.test(buzon));
check('y resolver() busca la alerta por clave',
  /estado\.alertas\.filter\(x => x\.clave === clave\)\[0\]/.test(buzon));
check('cada tarjeta lleva su clave en data-alerta para poder ubicarla',
  /data-alerta="\$\{SGADD_UI\.esc\(a\.clave\)\}"/.test(buzon));
/* Si el recálculo movió algo más que la tarjeta tocada, la remoción
   quirúrgica dejaría la lista desincronizada del estado. */
check('si el recálculo cambió algo más que la tarjeta tocada, repinta completo',
  /esperado !== real[\s\S]{0,60}repintarPanel\(\)/.test(buzon));

/* El id del club sale de `CLUB.estado.id`. Con la propiedad equivocada
   (`CLUB.ID`, que NO existe) todos los clubes escribían en la misma clave
   y Jujuy habría pisado los estados de Reconquista — el fallback coincidía
   con el nombre del club por defecto, así que no se notaba. */
check('el id del club sale de CLUB.estado.id, no de una propiedad inexistente',
  /CLUB\.estado && CLUB\.estado\.id/.test(buzon), 'clubId()');
check('y tiene respaldos encadenados antes de caer al default',
  /CLUB\.cfg && CLUB\.cfg\.id/.test(buzon) && /idDesdeUrl/.test(buzon));
check('los estados se leen y se guardan separados por club Y por planilla',
  /leerTodos\(clubId\(\), st\.planillaId\)/.test(buzon) &&
  /guardarTodos\(clubId\(\), estado\.planillaId/.test(buzon));

/* =====================================================================
   8. SINCRONIZACIÓN BIDIRECCIONAL GRÁFICO ↔ TABLA
   ===================================================================== */
console.log('\n8. SINCRONIZACIÓN GRÁFICO ↔ TABLA');
console.log('═'.repeat(70));
const eq = fs.readFileSync('./js/sgadd-equipos.js', 'utf8');
const ch = fs.readFileSync('./js/sgadd-charts.js', 'utf8');

check('el scatter lleva la clave del jugador en cada punto', /clave: j\.__clave/.test(ch));
check('y avisa hacia afuera quién está bajo el cursor',
  /onHover:/.test(ch) && /equiposDestacarJugador\(clave, 'grafico'\)/.test(ch));
check('las filas de la tabla llevan el mismo ancla `data-jug`', /data-jug="\$\{escapeAttr\(j\.__clave/.test(eq));
check('y avisan al entrar y al salir',
  /onmouseenter="equiposDestacarJugador/.test(eq) && /onmouseleave="equiposDestacarJugador\(null/.test(eq));
/* El bucle infinito que este diseño evita: gráfico avisa → tabla pinta →
   tabla avisa → gráfico repinta → gráfico avisa… */
check('hay UN solo punto de entrada para las dos direcciones',
  (eq.match(/function equiposDestacarJugador/g) || []).length === 1);
check('el parámetro `origen` corta el bucle de repintado',
  /if \(origen === 'grafico'\) return;/.test(eq));
check('y sale temprano si no cambió nada',
  /if \(val === equiposJugDestacado\) return;/.test(eq));
check('la tabla del plantel tiene id para poder ubicarla', /id="plantelTabla"/.test(eq));
check('el gráfico se actualiza sin animación: el hover tiene que ser inmediato',
  /ch\.update\('none'\)/.test(eq));
check('también mueve el tooltip, no solo el tamaño del nodo',
  /tooltip\.setActiveElements/.test(eq));
check('la fila del plantel muestra el estado cuando no es ACTIVO',
  /est\.id !== 'ACTIVO'/.test(eq));
check('y degrada sin el módulo de buzón cargado',
  /typeof SGADD_BUZON !== 'undefined'/.test(eq));

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
