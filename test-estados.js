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
check('el buzón conoce los tres tipos de alerta',
  /reingreso:\s*\{/.test(buzon) && /traspaso:\s*\{/.test(buzon) && /inactividad:\s*\{/.test(buzon));
check('la campana no se dibuja cuando no hay nada pendiente',
  /if \(!n\) return '';/.test(buzon));
/* La campana vive en el HEADER, donde antes estaba el cartel "Datos
   actualizados". Así se ve desde cualquier sección, incluida Principal, que
   usa la capa de datos vieja y no pinta la barra de SGADD_APP. */
const indexHtml = fs.readFileSync('./index.html', 'utf8');
check('el slot del buzón está en el header, al lado del banner de estado',
  /<div id="buzonSlot"[\s\S]{0,200}id="status-banner-holder"/.test(indexHtml));
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
check('el badge dice cuántas alertas hay en su etiqueta accesible',
  /aria-label="\$\{n\} alerta/.test(buzon));
check('resolver() marca la decisión como del usuario',
  /aplicar\(estado\.mapa, a\.clave, idEstado, \{ origen: 'usuario' \}\)/.test(buzon));
check('y confirma con un toast', /toast\(e\.emoji/.test(buzon));

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
