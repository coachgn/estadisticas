/* =====================================================================
   test-fases.js · FASES, CRUCES Y SERIES (punto 75)

   Tres cosas pedidas explícitamente, y las tres se EJERCEN:
     a) que un cruce intrazonal o interzonal se resuelva bien;
     b) que cambiar la fase desde la barra repinte Clasificación y Fixture
        (con el sgadd-app.js REAL en un `vm`, no leyendo el fuente);
     c) que las métricas de una fase no mezclen la regular con los playoffs
        (con el `construirIndice` REAL sobre un libro armado).

   Los nombres de equipo son reales (punto 1): un typo se nota.

     node test-fases.js
   ===================================================================== */
'use strict';
const fs = require('fs');
const vm = require('vm');
const SGADD = require('./js/sgadd-core.js');
const F = require('./js/sgadd-fases.js');

let ok = 0, mal = 0;
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (detalle !== undefined ? '  → ' + JSON.stringify(detalle) : '')); }
}
function seccion(t) { console.log('\n' + t + '\n' + '─'.repeat(70)); }

/* ---------------------------------------------------------------------
   El libro de mentira: una zona de cuatro, todos contra todos (6
   partidos) y semifinales al mejor de 3 (3 partidos) en FASE = PLAYOFF.

     ATENAS 3-0 · PLATENSE 2-1 · NAUTICO 1-2 · UNIVERSAL 0-3
     S1  ATENAS 2 - 0 UNIVERSAL   (definida)
     S2  PLATENSE 1 - 0 NAUTICO   (en curso)
   --------------------------------------------------------------------- */
const AT = "ATENAS 'A' - MM", PL = "PLATENSE 'A' - MM", NA = 'NAUTICO ENSENADA - MM', UN = 'UNIVERSAL - MM';
function partido(fecha, fase, local, visita, pl, pv, torneo) {
  const base = { FECHA: fecha, PARTIDO: local + ' vs ' + visita, FASE: fase };
  if (torneo) base.TORNEO = torneo;
  const gl = pl > pv;
  return [
    Object.assign({}, base, { EQUIPO: local, CONDICION: 'LOCAL', RESULTADO: gl ? 'GANADO' : 'PERDIDO', PTS: String(pl), PTSopp: String(pv) }),
    Object.assign({}, base, { EQUIPO: visita, CONDICION: 'VISITANTE', RESULTADO: gl ? 'PERDIDO' : 'GANADO', PTS: String(pv), PTSopp: String(pl) }),
  ];
}
function libro(filasBD, torneo) {
  const conTorneo = !!torneo;
  const colsBD = ['FECHA', 'PARTIDO', 'EQUIPO'].concat(conTorneo ? ['TORNEO'] : [])
    .concat(['FASE', 'CONDICION', 'RESULTADO', 'PTS', 'PTSopp']);
  /* PROMEDIOS E con una fila por equipo y fase: es la que da de alta a los
     equipos en el índice. */
  const vistos = {};
  filasBD.forEach((f) => { vistos[f.EQUIPO + '|' + f.FASE + '|' + (f.TORNEO || '')] = f; });
  const colsE = ['EQUIPO'].concat(conTorneo ? ['TORNEO'] : []).concat(['FASE', 'PJ', 'PTS']);
  const filasE = Object.keys(vistos).map((k) => {
    const f = vistos[k];
    const r = { EQUIPO: f.EQUIPO, FASE: f.FASE, PJ: '1', PTS: '70' };
    if (conTorneo) r.TORNEO = f.TORNEO;
    return r;
  });
  return { 'PROMEDIOS E': { cols: colsE, filas: filasE }, 'Base Datos E': { cols: colsBD, filas: filasBD } };
}
const REGULAR = [].concat(
  partido('01/03/2026', 'REGULAR', AT, PL, 80, 70), partido('02/03/2026', 'REGULAR', AT, NA, 80, 60),
  partido('03/03/2026', 'REGULAR', AT, UN, 90, 50), partido('04/03/2026', 'REGULAR', PL, NA, 75, 70),
  partido('05/03/2026', 'REGULAR', PL, UN, 75, 60), partido('06/03/2026', 'REGULAR', NA, UN, 65, 60));
const PLAYOFF = [].concat(
  partido('10/04/2026', 'PLAYOFF', AT, UN, 88, 70), partido('12/04/2026', 'PLAYOFF', UN, AT, 60, 75),
  partido('11/04/2026', 'PLAYOFF', PL, NA, 71, 69));
const HOJAS = libro(REGULAR.concat(PLAYOFF));

const DOC = {
  id: 'apb-prueba', nombre: 'APB de prueba',
  zonas: {
    a: { label: 'Zona A', equipos: [{ nombre: AT }, { nombre: PL }, { nombre: NA }, { nombre: UN }] },
    b: { label: 'Zona B', equipos: [{ nombre: 'DEPORTIVO LA PLATA - MM' }, { nombre: 'HOGAR SOCIAL - MM' }] },
  },
  formato: { partidosPorEquipo: 3, inicio: '2026-03-01', finRegular: '2026-03-31', fases: [
    { id: 'regular', label: 'Fase regular', cruce: 'zona' },
    { id: 'semis', label: 'Semifinales', libro: ['PLAYOFF'], serie: { mejorDe: 3 },
      desde: '2026-04-08', hasta: '2026-04-20', cruces: [
        { id: 'S1', a: { zona: 'a', puesto: 1 }, b: { zona: 'a', puesto: 4 } },
        { id: 'S2', a: { zona: 'a', puesto: 2 }, b: { zona: 'a', puesto: 3 } }] },
    { id: 'final', label: 'Final', serie: { mejorDe: 1 }, desde: '2026-04-25', hasta: '2026-04-30',
      cruces: [{ id: 'F', a: { ganador: 'S1' }, b: { ganador: 'S2' } }] },
  ] },
};

/* =====================================================================
   1 · EL PARSER DE LA DECLARACIÓN
   ===================================================================== */
seccion('1 · el parser de la declaración');
{
  const r = F.parsear(DOC.formato);
  check('lee las tres fases, en el orden declarado', r.fases.map(f => f.id).join(',') === 'regular,semis,final');
  check('sin errores en una declaración sana', r.errores.length === 0, r.errores);
  const [reg, semis, fin] = r.fases;
  check('la regular es de liga', reg.tipo === 'liga');
  check('y su columna del libro se asume REGULAR', reg.libro.join() === 'REGULAR');
  check('con cruces, la fase es de eliminación', semis.tipo === 'eliminacion' && fin.tipo === 'eliminacion');
  check('el vínculo con el libro se declara (semis se juega como PLAYOFF)', semis.libro.join() === 'PLAYOFF');
  check('sin declarar, el id en mayúsculas (final → FINAL)', fin.libro.join() === 'FINAL');
  check('«ganador de S1» apunta a un cruce declarado antes', fin.cruces[0].a.tipo === 'ganador' && fin.cruces[0].a.cruce === 'S1');

  const roto = F.parsear({ fases: [
    { id: 'x', serie: { mejorDe: 2 }, cruces: [{ id: 'C', a: { ganador: 'NADA' }, b: { zona: 'a', puesto: 0 } }] },
    { id: 'y', cruces: [{ id: 'Y1', a: { ganador: 'Y1' }, b: { equipo: 'ATENAS' } }] },
    { id: 'z', desde: '2026-05-10', hasta: '2026-05-01' },
    { id: 'x' },
  ] });
  check('una serie par se rechaza (en básquet no hay empates)', roto.errores.some(e => /impar/.test(e)), roto.errores);
  check('una referencia a un cruce no declarado queda inválida', roto.fases[0].cruces[0].a.tipo === 'invalido');
  check('un puesto 0 no es un puesto', roto.fases[0].cruces[0].b.tipo === 'invalido');
  check('un cruce que se refiere a sí mismo es circular y queda inválido', roto.fases[1].cruces[0].a.tipo === 'invalido');
  check('una ventana al revés se descarta con su motivo', roto.fases[2].desde === null && roto.errores.some(e => /rango/.test(e)));
  check('una fase repetida se descarta', roto.fases.filter(f => f.id === 'x').length === 1);
  check('sin formato no hay fases ni revienta', F.parsear(null).fases.length === 0 && F.parsear({ fases: 'no' }).fases.length === 0);

  /* LO QUE YA ESTABA ESCRITO SE SIGUE LEYENDO: la Liga Argentina declara
     puestos, directos y cruce sin tipo ni cruces. */
  const lab = F.parsear(JSON.parse(fs.readFileSync('torneos/liga-argentina-2026-27.json', 'utf8')).formato);
  check('el formato de LAB se lee sin errores', lab.errores.length === 0, lab.errores);
  check('y sus rondas salen de eliminación por el vocabulario del núcleo',
    lab.fases.filter(f => f.tipo === 'eliminacion').map(f => f.id).join() === 'reclasificacion,octavos,cuartos,semifinal,final');
  check('cuartos se sigue declarando interzonal', lab.fases.find(f => f.id === 'cuartos').cruce === 'interzonal');
}

/* =====================================================================
   2 · LAS SERIES
   ===================================================================== */
seccion('2 · las series');
{
  const P = (f, l, v, pl, pv) => ({ fecha: f, local: l, visitante: v, localClave: SGADD.claveEquipo(l),
    visitanteClave: SGADD.claveEquipo(v), jugado: pl != null, ptsLocal: pl, ptsVisitante: pv });
  const s1 = F.series([P('2026-04-10', AT, UN, 88, 70), P('2026-04-12', UN, AT, 60, 75)], 3)[0];
  check('dos victorias al mejor de 3: serie definida', s1.estado === 'definida' && s1.ganador === 'ATENAS A');
  check('«Gana ATENAS 2-0»', F.resumen(s1) === "Gana " + AT + ' 2-0', F.resumen(s1));

  const s2 = F.series([P('2026-04-11', PL, NA, 71, 69), P('2026-04-14', NA, PL, null, null)], 3)[0];
  check('una victoria: en curso, sin ganador', s2.estado === 'en-curso' && s2.ganador === null);
  check('«Serie 1-0 · Partido 2» leído desde el ganador', F.resumen(s2, 'PLATENSE A') === 'Serie 1-0 · Partido 2', F.resumen(s2, 'PLATENSE A'));
  check('y «Serie 0-1» leído desde el otro lado, sin dar vuelta los nombres', F.resumen(s2, 'NAUTICO ENSENADA') === 'Serie 0-1 · Partido 2');
  check('el próximo partido es el que falta jugar', s2.proximo && s2.proximo.fecha === '2026-04-14');

  const sinMejor = F.series([P('2026-04-10', AT, UN, 88, 70), P('2026-04-12', UN, AT, 60, 75)], null)[0];
  check('SIN saber a cuántos era la serie NO se declara un ganador', sinMejor.ganador === null && sinMejor.estado === 'en-curso');
  check('pero el marcador de la serie se muestra igual', F.resumen(sinMejor) === 'Serie 2-0');

  const conEmpate = F.series([P('2026-04-10', AT, UN, 70, 70)], 3)[0];
  check('un empate no suma a nadie (es un dato mal cargado)', conEmpate.jugados === 0);
  const excedida = F.series([P('2026-04-10', AT, UN, 80, 70), P('2026-04-11', AT, UN, 80, 70), P('2026-04-12', AT, UN, 80, 70), P('2026-04-13', AT, UN, 80, 70)], 3)[0];
  check('más partidos que la serie se marca, no se tapa', excedida.excedida === true);
  check('sin jugar, al mejor de 3: «Mejor de 3 · Partido 1»',
    F.resumen(F.series([P('2026-04-10', AT, UN, null, null)], 3)[0]) === 'Mejor de 3 · Partido 1');
}

/* =====================================================================
   3 · LA LLAVE · cruces intrazonales e interzonales
   ===================================================================== */
seccion('3 · la llave · cruces intrazonales e interzonales');
{
  const fases = F.parsear(DOC.formato).fases;
  const P = (f, l, v, pl, pv) => ({ fecha: f, local: l, visitante: v, localClave: SGADD.claveEquipo(l),
    visitanteClave: SGADD.claveEquipo(v), jugado: pl != null, ptsLocal: pl, ptsVisitante: pv });
  const tabla = (cerrada) => ({ a: { cerrada: cerrada, filas: [
    { clave: 'ATENAS A', nombre: AT, puesto: 1 }, { clave: 'PLATENSE A', nombre: PL, puesto: 2 },
    { clave: 'NAUTICO ENSENADA', nombre: NA, puesto: 3 }, { clave: 'UNIVERSAL', nombre: UN, puesto: 4 }] } });
  const zonaDeEquipo = F.zonasDeEquipos(DOC);
  const semis = [P('2026-04-10', AT, UN, 88, 70), P('2026-04-12', UN, AT, 60, 75), P('2026-04-11', PL, NA, 71, 69)];

  const ll = F.llave(fases, { tablas: tabla(true), partidosPorFase: { semis: semis, final: [] }, zonaDeEquipo: zonaDeEquipo });
  const S1 = ll.semis.cruces[0], S2 = ll.semis.cruces[1];
  check('1° vs 4° de la zona se resuelve con la tabla', S1.a.clave === 'ATENAS A' && S1.b.clave === 'UNIVERSAL');
  check('con la tabla cerrada, los lados están resueltos', S1.a.estado === 'resuelto' && S1.b.estado === 'resuelto');
  check('la serie se engancha por los equipos', S1.serie && S1.serie.ganador === 'ATENAS A');
  check('dos de la misma zona: intrazonal', S1.naturaleza === 'intrazonal');
  check('el 2° vs 3° en curso', S2.serie && S2.serie.estado === 'en-curso');
  const FIN = ll.final.cruces[0];
  check('la final toma al ganador de S1', FIN.a.estado === 'resuelto' && FIN.a.clave === 'ATENAS A');
  check('y el ganador de S2 queda pendiente mientras la serie no termina', FIN.b.estado === 'pendiente' && FIN.b.etiqueta === 'Ganador S2');

  /* LA TABLA ABIERTA PROYECTA, NO DECIDE. */
  const abierta = F.llave(fases, { tablas: tabla(false), partidosPorFase: {}, zonaDeEquipo: zonaDeEquipo });
  check('con la fase regular abierta el cruce sale «proyectado»', abierta.semis.cruces[0].a.estado === 'proyectado');
  const confirmada = F.llave(fases, { tablas: tabla(false), partidosPorFase: { semis: semis }, zonaDeEquipo: zonaDeEquipo });
  check('pero lo jugado confirma lo proyectado', confirmada.semis.cruces[0].a.estado === 'resuelto');

  /* INTERZONAL: el 1° de la zona B no está en este libro (entrega 2). */
  const inter = F.parsear({ fases: [{ id: 'cuartos', cruce: 'interzonal', cruces: [
    { id: 'C1', a: { zona: 'a', puesto: 1 }, b: { zona: 'b', puesto: 1 } }] }] }).fases;
  const li = F.llave(inter, { tablas: tabla(true), partidosPorFase: {}, zonaDeEquipo: zonaDeEquipo });
  const C1 = li.cuartos.cruces[0];
  check('el puesto de OTRA zona queda pendiente, no se adivina', C1.b.estado === 'pendiente' && !C1.b.clave);
  check('y se rotula con su zona', C1.b.etiqueta === '1° Zona B', C1.b.etiqueta);
  check('zona A contra zona B: interzonal', C1.naturaleza === 'interzonal');
  /* Si el libro trae el partido, lo jugado completa el lado pendiente. */
  const jugadoInter = [P('2026-05-01', AT, 'DEPORTIVO LA PLATA - MM', 80, 70)];
  const lj = F.llave(inter, { tablas: tabla(true), partidosPorFase: { cuartos: jugadoInter }, zonaDeEquipo: zonaDeEquipo });
  check('lo jugado completa el lado de la otra zona', lj.cuartos.cruces[0].b.clave === 'DEPORTIVO LA PLATA' && lj.cuartos.cruces[0].b.porLoJugado);
  check('y la naturaleza sale de las zonas de los equipos reales', lj.cuartos.cruces[0].naturaleza === 'interzonal');
  /* CON DOS CANDIDATAS NO SE ELIGE. */
  const dos = [P('2026-05-01', AT, 'DEPORTIVO LA PLATA - MM', 80, 70), P('2026-05-02', AT, 'HOGAR SOCIAL - MM', 80, 70)];
  const ld = F.llave(inter, { tablas: tabla(true), partidosPorFase: { cuartos: dos }, zonaDeEquipo: zonaDeEquipo });
  check('con dos series posibles para un lado pendiente, no se elige ninguna', ld.cuartos.cruces[0].serie === null);
  check('y las dos quedan a la vista como series sueltas', ld.cuartos.sueltas.length === 2);

  check('naturalezaPartido: misma zona', F.naturalezaPartido(semis[0], zonaDeEquipo) === 'intrazonal');
  check('naturalezaPartido: equipo sin zona conocida → null, no se inventa',
    F.naturalezaPartido(P('2026-05-01', AT, 'UN EQUIPO QUE NO EXISTE', 1, 0), zonaDeEquipo) === null);
}

/* =====================================================================
   4 · A QUÉ FASE PERTENECE UN PARTIDO PROGRAMADO
   ===================================================================== */
seccion('4 · la fase de un partido programado (reglas del punto 18)');
{
  const fases = F.parsear(DOC.formato).fases;
  check('una fecha dentro de una sola ventana se asigna', F.faseDeFecha('2026-04-15', fases).fase.id === 'semis');
  check('fuera de toda ventana no se asigna', F.faseDeFecha('2026-06-01', fases).fase === null);
  check('la regular toma su ventana de inicio y finRegular del formato', fases[0].desde === '2026-03-01'
    && fases[0].hasta === '2026-03-31' && F.faseDeFecha('2026-03-02', fases).fase.id === 'regular');
  check('y eso es solo para la PRIMERA fase: las demás no la heredan', fases[1].desde === '2026-04-08');
  const pisadas = F.parsear({ fases: [
    { id: 'a', desde: '2026-04-01', hasta: '2026-04-20' }, { id: 'b', desde: '2026-04-15', hasta: '2026-04-30' }] }).fases;
  const r = F.faseDeFecha('2026-04-16', pisadas);
  check('una fecha en DOS ventanas no se asigna a ninguna', r.fase === null && r.candidatos.length === 2);

  /* LA ETIQUETA DEL LIBRO GANA: un partido que el libro dice PLAYOFF se
     muestra en la fase PLAYOFF aunque su fecha caiga en otra ventana. */
  const FX = require('./js/sgadd-fixture.js');
  global.SGADD_FASES = F;
  const cal = [{ fecha: '2026-03-02', local: AT, visitante: NA, localClave: 'ATENAS A', visitanteClave: 'NAUTICO ENSENADA', declarado: true, jugado: false },
    { fecha: '2026-04-15', local: PL, visitante: NA, localClave: 'PLATENSE A', visitanteClave: 'NAUTICO ENSENADA', declarado: true, jugado: false },
    { fecha: '2026-06-01', local: AT, visitante: PL, localClave: 'ATENAS A', visitanteClave: 'PLATENSE A', declarado: true, jugado: false }];
  const deSemis = FX.calendarioDeFase(cal.map(x => Object.assign({}, x)), 'PLAYOFF', fases);
  check('el fixture de la fase se queda con lo de su ventana', deSemis.some(p => p.fecha === '2026-04-15'));
  check('y suelta lo de la ventana de otra', !deSemis.some(p => p.fecha === '2026-03-02'));
  check('lo que no se puede asignar se MUESTRA, marcado', deSemis.some(p => p.fecha === '2026-06-01' && p.sinFase));
  const sinVentanas = F.parsear({ fases: [{ id: 'regular' }, { id: 'playoff', libro: ['PLAYOFF'] }] }).fases;
  check('sin ventanas, una fase de eliminación no hereda el calendario entero', FX.calendarioDeFase(cal, 'PLAYOFF', sinVentanas).length === 0);
  check('y la fase de liga lo conserva, como siempre', FX.calendarioDeFase(cal, 'REGULAR', sinVentanas).length === 3);
  check('sin fase activa el calendario no se toca', FX.calendarioDeFase(cal, null, fases).length === 3);
  delete global.SGADD_FASES;
}

/* =====================================================================
   5 · EL SELECTOR DE LA BARRA
   ===================================================================== */
seccion('5 · el selector de la barra');
{
  /* EL NÚCLEO ORDENA LAS RONDAS, aunque el torneo no declare nada: sin
     esto CUARTOS, FINAL, OCTAVOS y SEMIFINAL empataban y salían por
     alfabeto (la final antes que los octavos). */
  /* El libro las trae DESORDENADAS a propósito —cuartos antes que
     octavos—: el sort es estable, y con el orden de inserción a favor el
     test pasaba aunque el núcleo no las conociera. */
  const rondas = libro([].concat(partido('01/03/2026', 'FINAL', AT, PL, 70, 60), partido('01/03/2026', 'CUARTOS', AT, NA, 70, 60),
    partido('01/03/2026', 'OCTAVOS', AT, UN, 70, 60), partido('01/03/2026', 'SEMIFINAL', PL, NA, 70, 60),
    partido('01/03/2026', 'REGULAR', NA, UN, 70, 60)));
  const orden = SGADD.combinacionesTorneoFase(rondas).map(t => t.fase).join(',');
  check('las rondas salen en el orden del torneo', orden === 'REGULAR,OCTAVOS,CUARTOS,SEMIFINAL,FINAL', orden);

  const fases = F.parsear(DOC.formato).fases;
  const tramos = F.enriquecerTramos(SGADD.combinacionesTorneoFase(HOJAS), fases);
  const po = tramos.find(t => t.fase === 'PLAYOFF');
  check('el libro dice PLAYOFF y la barra dice el nombre del reglamento', po && po.label === 'Semifinales', po && po.label);
  check('el id del tramo NO cambia (la ruta y los links siguen andando)', po && po.id === 'GENERAL|PLAYOFF');
  const fin = tramos.find(t => t.declarada === 'final');
  check('la fase declarada que no se jugó aparece, sin datos', fin && fin.sinDatos && /sin datos/.test(fin.label));
  check('con un id que ninguna celda puede producir', fin && fin.id.indexOf(F.SIN_DATOS) === 0);
  const crudos = SGADD.combinacionesTorneoFase(HOJAS);
  check('sin declaración la lista queda exactamente igual', JSON.stringify(F.enriquecerTramos(crudos, [])) === JSON.stringify(crudos));
  check('tipoDe: declarada manda', F.tipoDe('PLAYOFF', fases) === 'eliminacion' && F.tipoDe('REGULAR', fases) === 'liga');
  check('tipoDe: sin declarar, el núcleo decide', F.tipoDe('PLAYOFF', []) === 'eliminacion' && F.tipoDe('REGULAR', []) === 'liga'
    && F.tipoDe('ALGO QUE NO EXISTE', []) === 'liga');
}

/* =====================================================================
   6 · LAS MÉTRICAS NO MEZCLAN FASES (construirIndice real)
   ===================================================================== */
seccion('6 · las métricas no mezclan fases');
{
  const idxR = SGADD.construirIndice(HOJAS, { fase: 'REGULAR', torneo: SGADD.TORNEO_GENERAL });
  const idxP = SGADD.construirIndice(HOJAS, { fase: 'PLAYOFF', torneo: SGADD.TORNEO_GENERAL });
  check('la fase regular cuenta sus 6 partidos, no los 9 del libro', idxR.liga.partidos === 6, idxR.liga.partidos);
  check('los playoffs cuentan sus 3', idxP.liga.partidos === 3, idxP.liga.partidos);
  const atR = idxR.get('ATENAS A'), atP = idxP.get('ATENAS A');
  check('el récord de la regular no suma los playoffs (3-0)', atR.record.ganados === 3 && atR.record.perdidos === 0);
  check('el de los playoffs no suma la regular (2-0)', atP && atP.record.ganados === 2 && atP.record.perdidos === 0);
  check('ni un solo partido de playoff en la regular',
    atR.partidos.every(p => String(p.FASE).toUpperCase() === 'REGULAR'));

  /* EL TOTAL NUNCA JUNTA FASES: con Ida y Vuelta en la regular y playoffs
     de un solo torneo, el TOTAL existe para la regular y no mete la
     playoff adentro. */
  const conTorneos = libro([].concat(
    partido('01/03/2026', 'REGULAR', AT, PL, 80, 70, 'IDA'), partido('01/04/2026', 'REGULAR', PL, AT, 80, 70, 'VUELTA'),
    partido('01/05/2026', 'PLAYOFF', AT, PL, 90, 60, 'VUELTA')), true);
  const t = SGADD.combinacionesTorneoFase(conTorneos);
  check('hay TOTAL de la fase regular', t.some(x => x.id === '*TOTAL*|REGULAR'));
  check('y no hay TOTAL de los playoffs (un solo torneo)', !t.some(x => x.id === '*TOTAL*|PLAYOFF'));
  const idxTot = SGADD.construirIndice(conTorneos, { fase: 'REGULAR', torneo: '*TOTAL*' });
  check('el TOTAL de la regular cuenta la ida y la vuelta y NADA de playoffs', idxTot.liga.partidos === 2, idxTot.liga.partidos);

  /* EL ÍNDICE POR FASE DE LA LLAVE Y EL FIXTURE cubre toda la fase: con
     Ida y Vuelta, las dos. */
  const idxFase = F.indicePara(conTorneos, 'REGULAR');
  check('indicePara usa el TOTAL de la fase cuando hay dos torneos', idxFase && idxFase.liga.partidos === 2);
  check('y es el mismo objeto la segunda vez (caché por libro)', F.indicePara(conTorneos, 'REGULAR') === idxFase);
  check('una fase que el libro no tiene no da índice', F.indicePara(conTorneos, 'FINAL') === null);
}

/* =====================================================================
   7 · LA REACTIVIDAD · el sgadd-app.js REAL, en un vm
   ===================================================================== */
seccion('7 · cambiar la fase en la barra repinta Clasificación y Fixture');
{
  const root = { innerHTML: '' };
  const ctx = {
    console, Promise, JSON, Math, Date, Map, Set, WeakMap, Array, Object, String, Number, RegExp, Error,
    SGADD: SGADD, SGADD_UI: require('./js/sgadd-ui.js'), SGADD_CONFIG: require('./js/sgadd-config.js'),
    window: { location: { hash: '#clasificacion' } }, location: { hash: '#clasificacion' },
    history: { pushState() {}, replaceState() {} },
    setTimeout: () => 0, clearTimeout() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: (id) => (id === 'view-root' ? root : null), querySelector: () => null,
      querySelectorAll: () => [], getElementsByTagName: () => [] },
    LOGOS: { getUrl: () => null, iniciales: (n) => String(n).slice(0, 2) },
    currentSection: 'clasificacion',
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['sgadd-app.js', 'sgadd-clasificacion.js', 'sgadd-fixture.js', 'sgadd-fases.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync('./js/' + f, 'utf8'), ctx, { filename: f });
  });
  const planillasAntes = SGADD.CATALOGO.planillas;
  SGADD.CATALOGO.planillas = [{ id: 'apb-a', label: 'Primera · Zona A', slug: 'apb-a', activo: true,
    torneoId: 'apb-prueba', zonaId: 'a' }];
  const APP = vm.runInContext('SGADD_APP', ctx);
  const FXv = vm.runInContext('SGADD_FIXTURE', ctx);
  APP.estado.planillaId = 'apb-a';
  APP.estado.hojas = HOJAS;
  APP.estado.torneo = SGADD.TORNEO_GENERAL;
  APP.estado.fase = 'REGULAR';
  APP.reindexar();
  FXv.estado.torneo = 'apb-prueba'; FXv.estado.doc = DOC;

  root.innerHTML = vm.runInContext('buildClasificacion()', ctx);
  check('en la fase regular, Clasificación es la tabla', /Tabla de posiciones/.test(root.innerHTML) && !/Llave y series/.test(root.innerHTML));
  check('la barra ofrece la fase del reglamento', /Semifinales/.test(root.innerHTML));
  check('y la final todavía no jugada, deshabilitada', /Final — sin datos<\/option>/.test(root.innerHTML)
    && /value="\*SIN-DATOS\*\|FINAL"[^>]*disabled/.test(root.innerHTML));

  APP.cambiarTramo('GENERAL|PLAYOFF');
  check('cambiar la fase reindexa sobre los playoffs', APP.estado.idx.liga.partidos === 3);
  check('y Clasificación se repinta SOLA con la llave', /Llave y series/.test(root.innerHTML), root.innerHTML.slice(0, 120));
  check('la llave nombra los cruces declarados con sus equipos', /ATENAS &#39;A&#39; - MM/.test(root.innerHTML) && /UNIVERSAL/.test(root.innerHTML));
  check('con el estado de cada serie', /Gana ATENAS/.test(root.innerHTML) && /Serie 1-0 · Partido 2/.test(root.innerHTML));
  check('la final muestra al ganador de S1 y espera al de S2', /Ganador S2/.test(root.innerHTML));
  check('la tabla de la fase no desaparece: queda plegada', /Tabla de la fase · todos los partidos/.test(root.innerHTML));

  APP.cambiarTramo(F.SIN_DATOS + '|FINAL');
  check('elegir una fase sin datos no hace nada', APP.estado.fase === 'PLAYOFF');

  ctx.currentSection = 'fixture';
  APP.cambiarTramo('GENERAL|REGULAR');
  check('en el Fixture, cambiar la fase también repinta', /Fase/.test(root.innerHTML) && /selTramo/.test(root.innerHTML));
  check('y avisa que hay partidos de otra fase', /También hay partidos jugados de <b>Semifinales<\/b>/.test(root.innerHTML));
  APP.cambiarTramo('GENERAL|PLAYOFF');
  check('en la fase de playoffs, cada partido lleva el estado de su serie', /fase-chip[^>]*>Serie 1-0 · Partido 2|fase-chip[^>]*>Gana ATENAS/.test(root.innerHTML));
  check('y dice si el cruce es intrazonal', /Intrazonal/.test(root.innerHTML));

  SGADD.CATALOGO.planillas = planillasAntes;
}

console.log('\n' + (mal ? '✗ HAY FALLAS · ' : '✓ TODO OK · ') + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
