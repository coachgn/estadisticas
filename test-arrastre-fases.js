/* =====================================================================
   test-arrastre-fases.js · arrastre de puntos, fases por torneo y la
   llave de una temporada Apertura + Clausura (punto 133)

   El caso es Bahía Blanca: Apertura (regular y playoffs) y Clausura, que
   arranca con el 50 % de los puntos de la regular del Apertura y termina
   en play-in, permanencia, promoción, playoffs y una final extra que
   existe solo si los dos campeones son distintos.

   Lo que se EJERCE, no se lee:
     1. el parser de competencia (`arrastre`) y su validación;
     2. el motor de la tabla con arrastre, con PCT y con FIBA;
     3. que los playoffs del Apertura NO sumen a su regular, y que el
        TOTAL de la regular junte Apertura y Clausura sin eliminatorias;
     4. la declaración de fases (torneo, tabla, externo, condición) y la
        llave resuelta con la tabla de CADA tramo;
     5. la app REAL en un `vm`: el desempate publicado SOLO para la
        categoría (Olimpo / Alem) y la Clausura con su columna Arr.

     node test-arrastre-fases.js
   ===================================================================== */
'use strict';
const fs = require('fs');
const vm = require('vm');
const SGADD = require('./js/sgadd-core.js');
global.SGADD = SGADD;
const CL = require('./js/sgadd-clasificacion.js');
const C = require('./js/sgadd-config.js');
const F = require('./js/sgadd-fases.js');

let ok = 0, mal = 0;
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (detalle !== undefined ? '  → ' + JSON.stringify(detalle) : '')); }
}
function seccion(t) { console.log('\n' + t + '\n' + '─'.repeat(70)); }

/* Equipos reales de la Primera de Bahía Blanca (punto 1). */
const OLI = 'OLIMPO', ALE = 'LEANDRO N.ALEM', NAP = 'NAPOSTA', EST = 'ESTRELLA';

function partido(fecha, torneo, fase, local, visita, pl, pv) {
  const base = { FECHA: fecha, PARTIDO: local + ' vs ' + visita, FASE: fase, TORNEO: torneo };
  const gl = pl > pv;
  return [
    Object.assign({}, base, { EQUIPO: local, CONDICION: 'LOCAL', RESULTADO: gl ? 'GANADO' : 'PERDIDO', PTS: String(pl), PTSopp: String(pv) }),
    Object.assign({}, base, { EQUIPO: visita, CONDICION: 'VISITANTE', RESULTADO: gl ? 'PERDIDO' : 'GANADO', PTS: String(pv), PTSopp: String(pl) }),
  ];
}
function libro(filasBD) {
  const colsBD = ['FECHA', 'PARTIDO', 'EQUIPO', 'TORNEO', 'FASE', 'CONDICION', 'RESULTADO', 'PTS', 'PTSopp'];
  const vistos = {};
  filasBD.forEach((f) => { vistos[f.EQUIPO + '|' + f.FASE + '|' + f.TORNEO] = f; });
  const filasE = Object.keys(vistos).map((k) => {
    const f = vistos[k];
    return { EQUIPO: f.EQUIPO, TORNEO: f.TORNEO, FASE: f.FASE, PJ: '1', PTS: '70' };
  });
  return { 'PROMEDIOS E': { cols: ['EQUIPO', 'TORNEO', 'FASE', 'PJ', 'PTS'], filas: filasE },
    'Base Datos E': { cols: colsBD, filas: filasBD } };
}

/* EL LIBRO DE LA TEMPORADA.
     Apertura regular (todos contra todos, 6 partidos):
       NAPOSTA 3-0 · ESTRELLA 2-1 · OLIMPO 1-2 (le ganó a ALEM) · ALEM 0-3
       → puntos: NAP 6 · EST 5 · OLI 4 · ALE 3
     Apertura cuartos (FASE = CUARTOS): NAP-ALE y EST-OLI, tres partidos más
       que NO pueden sumar a la regular.
     Clausura regular (solo 2 partidos jugados):
       ALEM le gana a NAPOSTA · OLIMPO le gana a ESTRELLA */
const AP_REG = [].concat(
  partido('01/03/2026', 'APERTURA', 'REGULAR', NAP, EST, 80, 70),
  partido('02/03/2026', 'APERTURA', 'REGULAR', NAP, OLI, 80, 60),
  partido('03/03/2026', 'APERTURA', 'REGULAR', NAP, ALE, 90, 50),
  partido('04/03/2026', 'APERTURA', 'REGULAR', EST, OLI, 75, 70),
  partido('05/03/2026', 'APERTURA', 'REGULAR', EST, ALE, 75, 60),
  partido('06/03/2026', 'APERTURA', 'REGULAR', OLI, ALE, 81, 77));
const AP_PO = [].concat(
  partido('10/04/2026', 'APERTURA', 'CUARTOS', NAP, ALE, 88, 70),
  partido('12/04/2026', 'APERTURA', 'CUARTOS', ALE, NAP, 90, 75),
  partido('11/04/2026', 'APERTURA', 'CUARTOS', EST, OLI, 71, 69));
const CL_REG = [].concat(
  partido('01/08/2026', 'CLAUSURA', 'REGULAR', ALE, NAP, 70, 65),
  partido('02/08/2026', 'CLAUSURA', 'REGULAR', OLI, EST, 66, 60));
const HOJAS = libro(AP_REG.concat(AP_PO, CL_REG));

/* =====================================================================
   1 · EL PARSER DE COMPETENCIA
   ===================================================================== */
seccion('1 · `arrastre` en el formato: se lee, se exporta y se valida');
{
  const a = C.normalizarArrastre({ faseOrigen: 'Apertura | Regular', porcentaje: 50 });
  check('se acepta escrito a mano y se guarda normalizado', a && a.faseOrigen === 'APERTURA|REGULAR' && a.porcentaje === 50, a);
  check('`origen` es sinónimo de `faseOrigen`', (C.normalizarArrastre({ origen: 'APERTURA|REGULAR', porcentaje: 50 }) || {}).faseOrigen === 'APERTURA|REGULAR');
  check('un porcentaje fuera de 1..100 no es un arrastre', C.normalizarArrastre({ faseOrigen: 'A|B', porcentaje: 0 }) === null
    && C.normalizarArrastre({ faseOrigen: 'A|B', porcentaje: 120 }) === null);
  check('el TOTAL sintético no es un origen (no es un tramo jugado)', C.normalizarArrastre({ faseOrigen: '*TOTAL*|REGULAR', porcentaje: 50 }) === null);
  check('un origen sin las dos partes no es un arrastre', C.normalizarArrastre({ faseOrigen: 'APERTURA', porcentaje: 50 }) === null);

  const json = { competencia: {
    ordenTabla: ['FIBA'],
    formatos: {
      apertura: { label: 'Apertura', zonas: [{ id: 'cuartos', desde: 1, hasta: 6, tono: 'exito' }] },
      clausura: { label: 'Clausura', arrastre: { faseOrigen: 'APERTURA|REGULAR', porcentaje: 50 },
        zonas: [{ id: 'cuartos', desde: 1, hasta: 6, tono: 'exito' }, { id: 'playin', desde: 7, hasta: 10, tono: 'aviso' },
          { id: 'permanencia', desde: -2, tono: 'peligro' }] },
    },
    porTramo: { 'APERTURA|*': 'apertura', 'CLAUSURA|REGULAR': 'clausura', '*': null },
  } };
  const cfg = C.parsear(json);
  check('el formato conserva su arrastre', cfg.formatos.clausura.arrastre && cfg.formatos.clausura.arrastre.porcentaje === 50);
  check('y el que no declara queda en null', cfg.formatos.apertura.arrastre === null);
  const ida = JSON.parse(C.exportar(cfg));
  check('exportar → parsear conserva el arrastre (viaja con «Publicar»)',
    C.parsear({ competencia: ida }).formatos.clausura.arrastre.faseOrigen === 'APERTURA|REGULAR');
  check('arrastreDeTramo: rige en la Clausura', (C.arrastreDeTramo(cfg, 'CLAUSURA', 'REGULAR') || {}).porcentaje === 50);
  /* Con el comodín apuntando a la Clausura, el TOTAL resolvería ese
     formato: el arrastre igual NO rige ahí. */
  const conComodin = C.parsear({ competencia: Object.assign({}, json.competencia, { porTramo: { '*': 'clausura' } }) });
  check('el comodín le daría el formato al TOTAL…', C.formatoDeTramo(conComodin, '*TOTAL*', 'REGULAR').id === 'clausura');
  check('…pero nunca el arrastre: el TOTAL ya suma los partidos del origen', C.arrastreDeTramo(conComodin, '*TOTAL*', 'REGULAR') === null);
  check('ni en un tramo del mismo torneo que el origen',
    C.arrastreDeTramo(C.parsear({ competencia: { formatos: { x: { arrastre: { faseOrigen: 'APERTURA|REGULAR', porcentaje: 50 } } },
      porTramo: { '*': 'x' } } }), 'APERTURA', 'CUARTOS') === null);

  const conPct = C.parsear({ competencia: Object.assign({}, json.competencia, { ordenTabla: ['PCT', 'DIF', 'PF'] }) });
  const v1 = C.validar(conPct, { tramos: ['APERTURA|REGULAR'] });
  check('arrastre con desempate por porcentaje: aviso que pide puntos', v1.some(p => p.nivel === 'aviso' && /PUNTOS/.test(p.mensaje)), v1);
  const v2 = C.validar(cfg, { tramos: ['CLAUSURA|REGULAR'] });
  check('origen que el libro todavía no trae: aviso', v2.some(p => /que el libro no trae/.test(p.mensaje)), v2);
  const v3 = C.validar(C.parsear({ competencia: { ordenTabla: ['FIBA'], formatos: { x: { arrastre: { faseOrigen: 'APERTURA|REGULAR', porcentaje: 50 } } },
    porTramo: { 'APERTURA|REGULAR': 'x' } } }), {});
  check('un tramo que arrastra de sí mismo: error', v3.some(p => p.nivel === 'error' && /de sí mismo/.test(p.mensaje)), v3);
  const v4 = C.validar(cfg, { tramos: ['APERTURA|REGULAR', 'CLAUSURA|REGULAR'] });
  check('bien declarado, con FIBA y el origen en el libro: sin avisos de arrastre', !v4.some(p => /arrastra/.test(p.mensaje)), v4);
}

/* =====================================================================
   2 · EL MOTOR DE LA TABLA
   ===================================================================== */
seccion('2 · la tabla con arrastre: solo suma puntos, y ordena por puntos');
{
  const idxAp = SGADD.construirIndice(HOJAS, { torneo: 'APERTURA', fase: 'REGULAR' });
  const idxCl = SGADD.construirIndice(HOJAS, { torneo: 'CLAUSURA', fase: 'REGULAR' });
  const ap = CL.tabla(idxAp, { orden: ['FIBA'] });
  const arr = CL.puntosArrastre(ap, 50, 'APERTURA|REGULAR');
  const de = (k) => arr.porClave[SGADD.claveEquipo(k)];
  check('el 50 % de 6, 5, 4 y 3 puntos', de(NAP).puntos === 3 && de(EST).puntos === 2.5 && de(OLI).puntos === 2 && de(ALE).puntos === 1.5,
    Object.keys(arr.porClave).map(k => k + ' ' + arr.porClave[k].puntos));

  const cl = CL.tabla(idxCl, { orden: ['FIBA'], arrastre: arr });
  const fila = (n) => cl.find(r => r.nombre === n || SGADD.claveEquipo(r.nombre) === SGADD.claveEquipo(n));
  check('PJ, PG y PP son solo de la Clausura', fila(ALE).pj === 1 && fila(ALE).pg === 1 && fila(NAP).pp === 1);
  check('puntos = los del tramo + el arrastre', fila(ALE).puntos === 2 + 1.5 && fila(NAP).puntos === 1 + 3 && fila(OLI).puntos === 4,
    cl.map(r => r.nombre + ' ' + r.puntos));
  check('el arrastre queda a la vista en su fila', fila(NAP).arrastre === 3 && fila(NAP).puntosPropios === 1);
  check('con arrastre, NAPOSTA (perdió) queda arriba de ALEM (ganó)', cl.indexOf(fila(NAP)) < cl.indexOf(fila(ALE)), cl.map(r => r.nombre));
  check('la diferencia NO lleva arrastre', fila(ALE).dif === 5 && fila(NAP).dif === -5);

  const sinArr = CL.tabla(idxCl, { orden: ['FIBA'] });
  check('sin arrastre, la misma Clausura pone a ALEM arriba de NAPOSTA',
    sinArr.findIndex(r => r.nombre === ALE) < sinArr.findIndex(r => r.nombre === NAP));

  check('con PCT declarado y arrastre, se antepone PTS', CL.ordenConArrastre(['PCT', 'DIF', 'PF'], arr)[0] === 'PTS');
  check('con FIBA, el orden no se toca', CL.ordenConArrastre(['FIBA'], arr).join() === 'FIBA');
  check('sin arrastre, el orden no se toca', CL.ordenConArrastre(['PCT', 'DIF', 'PF'], null).join() === 'PCT,DIF,PF');
  const pct = CL.tabla(idxCl, { orden: ['PCT', 'DIF', 'PF'], arrastre: arr });
  check('el arrastre ordena aunque el bloque diga PCT', pct[0].nombre === OLI || pct[0].puntos === Math.max.apply(null, pct.map(r => r.puntos)),
    pct.map(r => r.nombre + ' ' + r.puntos));

  /* Un equipo del origen que todavía no jugó en la Clausura entra con sus
     puntos arrastrados y 0 PJ. */
  const soloUno = libro(AP_REG.concat(partido('01/08/2026', 'CLAUSURA', 'REGULAR', ALE, NAP, 70, 65)));
  const t1 = CL.tabla(SGADD.construirIndice(soloUno, { torneo: 'CLAUSURA', fase: 'REGULAR' }), { orden: ['FIBA'], arrastre: arr });
  const est = t1.find(r => SGADD.claveEquipo(r.nombre) === SGADD.claveEquipo(EST));
  check('el que no debutó en la Clausura figura con sus puntos arrastrados', est && est.pj === 0 && est.puntos === 2.5 && est.soloArrastre, est);
}

/* =====================================================================
   3 · LOS PLAYOFFS NO TOCAN LA REGULAR · y el acumulado
   ===================================================================== */
seccion('3 · los playoffs del Apertura no suman a su regular; el acumulado junta regulares');
{
  const reg = SGADD.construirIndice(HOJAS, { torneo: 'APERTURA', fase: 'REGULAR' });
  const ale = reg.get(SGADD.claveEquipo(ALE));
  check('ALEM en la regular del Apertura: 3 PJ (los cuartos no suman)', ale.record.pj === 3 && ale.record.ganados === 0, ale.record);
  check('la regular del Apertura tiene 6 partidos, no 9', reg.liga.partidos === 6, reg.liga.partidos);
  const tramos = SGADD.combinacionesTorneoFase(HOJAS).map(t => t.id);
  check('hay un tramo propio para los cuartos del Apertura', tramos.indexOf('APERTURA|CUARTOS') !== -1, tramos);
  check('hay ACUMULADO de la regular (*TOTAL*|REGULAR)', tramos.indexOf('*TOTAL*|REGULAR') !== -1, tramos);
  const tot = SGADD.construirIndice(HOJAS, { torneo: '*TOTAL*', fase: 'REGULAR' });
  check('el acumulado suma Apertura + Clausura regular (8) y NADA de cuartos', tot.liga.partidos === 8, tot.liga.partidos);
  const aleTot = tot.get(SGADD.claveEquipo(ALE));
  check('ALEM en el acumulado: 4 PJ, 1-3', aleTot.record.pj === 4 && aleTot.record.ganados === 1, aleTot.record);
  /* Un partido manual cargado en los cuartos tampoco entra a la regular. */
  const mapa = { 'APERTURA|CUARTOS': [{ id: 'm1', local: EST, visitante: OLI, puntosLocal: 70, puntosVisitante: 72 }] };
  check('un partido sin estadísticas de los cuartos no se cuenta en la regular',
    CL.manualesDelTramo(mapa, 'APERTURA', 'REGULAR').length === 0 && CL.manualesDelTramo(mapa, 'APERTURA', 'CUARTOS').length === 1);
}

/* =====================================================================
   4 · LA DECLARACIÓN DE FASES Y LA LLAVE
   ===================================================================== */
const FORMATO = { fases: [
  { id: 'regular', label: 'Fase regular', cruce: 'zona' },
  { id: 'cuartos-ap', label: 'Cuartos · Apertura', libro: ['CUARTOS'], torneo: 'APERTURA', tabla: 'APERTURA|REGULAR',
    serie: { mejorDe: 3 }, cruces: [{ id: 'CA1', a: { zona: 'oro', puesto: 1 }, b: { zona: 'oro', puesto: 4 } },
      { id: 'CA2', a: { zona: 'oro', puesto: 2 }, b: { zona: 'oro', puesto: 3 } }] },
  { id: 'final-ap', label: 'Final · Apertura', libro: ['FINAL'], torneo: 'APERTURA', serie: { mejorDe: 3 },
    cruces: [{ id: 'FA', a: { ganador: 'CA1' }, b: { ganador: 'CA2' } }] },
  { id: 'playin', label: 'Play-In', libro: ['PLAY-IN'], torneo: 'CLAUSURA', tabla: 'CLAUSURA|REGULAR', serie: { mejorDe: 1 },
    cruces: [{ id: 'P1', a: { zona: 'oro', puesto: 7 }, b: { zona: 'oro', puesto: 8 } },
      { id: 'P2', a: { zona: 'oro', puesto: 9 }, b: { zona: 'oro', puesto: 10 } },
      { id: 'P3', a: { perdedor: 'P1' }, b: { ganador: 'P2' } }] },
  { id: 'permanencia', label: 'Permanencia', libro: ['PERMANENCIA'], torneo: 'CLAUSURA', tabla: 'CLAUSURA|REGULAR',
    serie: { mejorDe: 5 }, cruces: [{ id: 'PE', a: { zona: 'oro', puesto: 11 }, b: { zona: 'oro', puesto: 12 } }] },
  { id: 'promocion', label: 'Promoción', libro: ['PROMOCION'], serie: { mejorDe: 5 },
    cruces: [{ id: 'PR', a: { ganador: 'PE' }, b: { externo: 'Subcampeón Plata' } }] },
  { id: 'cuartos-cl', label: 'Cuartos · Clausura', libro: ['CUARTOS'], torneo: 'CLAUSURA', tabla: 'CLAUSURA|REGULAR',
    serie: { mejorDe: 3 }, cruces: [{ id: 'CC1', a: { zona: 'oro', puesto: 1 }, b: { zona: 'oro', puesto: 4 } },
      { id: 'CC2', a: { zona: 'oro', puesto: 2 }, b: { zona: 'oro', puesto: 3 } }] },
  { id: 'final-cl', label: 'Final · Clausura', libro: ['FINAL'], torneo: 'CLAUSURA', serie: { mejorDe: 3 },
    cruces: [{ id: 'FC', a: { ganador: 'CC1' }, b: { ganador: 'CC2' } }] },
  { id: 'final-extra', label: 'Final extra de temporada', libro: ['FINAL EXTRA'], serie: { mejorDe: 3 },
    cruces: [{ id: 'FX', a: { ganador: 'FA' }, b: { ganador: 'FC' }, condicion: 'distintos' }] },
] };

seccion('4 · fases con torneo, tabla, externo y la final extra');
{
  const p = F.parsear(FORMATO, { zonasValidas: ['oro'] });
  check('la declaración completa no tiene errores', !p.errores.length, p.errores);
  const ca = p.fases.find(f => f.id === 'cuartos-ap'), cc = p.fases.find(f => f.id === 'cuartos-cl');
  check('cada fase guarda su TORNEO del libro', ca.torneo === 'APERTURA' && cc.torneo === 'CLAUSURA');
  check('los lados heredan la tabla de su fase', ca.cruces[0].a.tabla === 'APERTURA|REGULAR' && cc.cruces[0].a.tabla === 'CLAUSURA|REGULAR');
  check('el lado de otro torneo queda como externo', p.fases.find(f => f.id === 'promocion').cruces[0].b.tipo === 'externo');
  check('la condición «distintos» se conserva', p.fases.find(f => f.id === 'final-extra').cruces[0].condicion === 'distintos');
  check('declaradaDe separa los cuartos por torneo',
    F.declaradaDe(p.fases, 'CUARTOS', 'APERTURA').id === 'cuartos-ap' && F.declaradaDe(p.fases, 'CUARTOS', 'CLAUSURA').id === 'cuartos-cl');
  check('sin torneo (o el TOTAL) toma la primera, como siempre', F.declaradaDe(p.fases, 'CUARTOS').id === 'cuartos-ap'
    && F.declaradaDe(p.fases, 'CUARTOS', '*TOTAL*').id === 'cuartos-ap');

  const malo = F.parsear({ fases: [{ id: 'x', libro: ['X'], tabla: 'CLAUSURA', cruces: [
    { id: 'A', a: { zona: 'oro', puesto: 1, tabla: 'nada' }, b: { zona: 'oro', puesto: 2 }, condicion: 'si-llueve' }] }] });
  check('una tabla que no es TORNEO|FASE es error', malo.errores.some(e => /no es un tramo/.test(e)), malo.errores);
  check('una condición desconocida es error', malo.errores.some(e => /condición/.test(e)), malo.errores);

  /* Las tablas de cada tramo: 12 equipos, para que existan los puestos
     7° a 12°. La de la Clausura y la del Apertura son DISTINTAS. */
  const eq = (pre) => Array.from({ length: 12 }, (_, i) => ({ clave: pre + (i + 1), nombre: pre + (i + 1), puesto: i + 1, pj: 11 }));
  const ctx = { tablas: { oro: { filas: eq('TOT'), tramo: '*TOTAL*|REGULAR', cerrada: true } },
    tablasPorTramo: { 'APERTURA|REGULAR': { oro: { filas: eq('AP'), cerrada: true } },
      'CLAUSURA|REGULAR': { oro: { filas: eq('CL'), cerrada: false } } },
    partidosPorFase: {}, zonaDeEquipo: {}, nombresZona: { oro: 'Oro' } };
  let ll = F.llave(p.fases, ctx);
  check('los cuartos del Apertura salen de la tabla del Apertura', ll['cuartos-ap'].cruces[0].a.clave === 'AP1' && ll['cuartos-ap'].cruces[0].b.clave === 'AP4');
  check('los del Clausura, de la del Clausura', ll['cuartos-cl'].cruces[0].a.clave === 'CL1');
  check('y la etiqueta dice de qué tabla', /Clausura · Regular/.test(ll['cuartos-cl'].cruces[0].a.etiqueta), ll['cuartos-cl'].cruces[0].a.etiqueta);
  check('Play-In: 7° vs 8° y 9° vs 10° de la Clausura', ll.playin.cruces[0].a.clave === 'CL7' && ll.playin.cruces[1].b.clave === 'CL10');
  check('con la Clausura abierta van proyectados', ll.playin.cruces[0].a.estado === 'proyectado');
  check('P3: perdedor de P1 contra ganador de P2, a definir', ll.playin.cruces[2].a.estado === 'pendiente' && /Perdedor P1/.test(ll.playin.cruces[2].a.etiqueta));
  check('Permanencia: 11° vs 12°, al mejor de 5', ll.permanencia.cruces[0].a.clave === 'CL11' && ll.permanencia.fase.mejorDe === 5);
  check('Promoción: el externo queda a definir con su nombre', ll.promocion.cruces[0].b.estado === 'pendiente' && ll.promocion.cruces[0].b.etiqueta === 'Subcampeón Plata');

  /* Sin la tabla del tramo, NO se usa una equivocada: queda a definir. */
  const sinCl = F.llave(p.fases, { tablas: ctx.tablas, tablasPorTramo: {}, partidosPorFase: {}, zonaDeEquipo: {} });
  check('sin la tabla de la Clausura, el puesto queda a definir (no se toma el acumulado)',
    sinCl.playin.cruces[0].a.estado === 'pendiente' && !sinCl.playin.cruces[0].a.clave);

  /* LA FINAL EXTRA: con el mismo campeón no se juega; con dos distintos, sí. */
  const serie = (a, b, ga) => [0, 1].map(i => ({ fecha: '2026-0' + (5 + i) + '-01', localClave: a, visitanteClave: b, local: a, visitante: b,
    jugado: true, ptsLocal: ga ? 80 : 60, ptsVisitante: ga ? 60 : 80 }));
  const mismo = Object.assign({}, ctx, { partidosPorFase: {
    'cuartos-ap': serie('AP1', 'AP4', true).concat(serie('AP2', 'AP3', true)),
    'final-ap': serie('AP1', 'AP2', true),
    'cuartos-cl': serie('AP1', 'CL4', true).concat(serie('CL2', 'CL3', true)),
    'final-cl': serie('AP1', 'CL2', true) } });
  /* El 1° de la Clausura es el mismo equipo que ganó el Apertura. */
  mismo.tablasPorTramo = { 'APERTURA|REGULAR': ctx.tablasPorTramo['APERTURA|REGULAR'],
    'CLAUSURA|REGULAR': { oro: { filas: eq('CL').map((f, i) => i === 0 ? Object.assign({}, f, { clave: 'AP1', nombre: 'AP1' }) : f), cerrada: true } } };
  ll = F.llave(p.fases, mismo);
  check('mismo campeón en Apertura y Clausura: la final extra no se juega', ll['final-extra'].cruces[0].noSeJuega === true, ll['final-extra'].cruces[0]);
  check('y lo dice en la card', /No se juega/.test(F.cruceHTML(ll['final-extra'].cruces[0])));
  const otro = Object.assign({}, mismo, { partidosPorFase: Object.assign({}, mismo.partidosPorFase, { 'final-cl': serie('AP1', 'CL2', false) }) });
  ll = F.llave(p.fases, otro);
  check('campeones distintos: la final extra se juega entre los dos', !ll['final-extra'].cruces[0].noSeJuega
    && ll['final-extra'].cruces[0].a.clave === 'AP1' && ll['final-extra'].cruces[0].b.clave === 'CL2', ll['final-extra'].cruces[0]);
}

/* =====================================================================
   5 · LA APP REAL · el desempate de la categoría y la Clausura con Arr.
   ===================================================================== */
seccion('5 · la app real: FIBA de la categoría (Olimpo / Alem) y la Clausura con arrastre');
{
  const root = { innerHTML: '' };
  const CAT = 'bahia-blanca-2026-oro';
  /* El caso reportado: el bloque del CLUB dice PCT y la CATEGORÍA, FIBA.
     OLIMPO y ALEM empatan en el Apertura (1-2 contra 1-2 no: armamos el
     empate con un partido más) y OLIMPO ganó el duelo directo. */
  const jsonClub = { competencia: {
    ordenTabla: ['PCT', 'DIF', 'PF'],
    formatos: { regular: { label: 'Regular', zonas: [] } }, porTramo: { '*': 'regular' },
    porCategoria: {}, } };
  jsonClub.competencia.porCategoria[CAT] = {
    ordenTabla: ['FIBA'],
    formatos: { apertura: { label: 'Apertura', zonas: [{ id: 'c', desde: 1, hasta: 2, tono: 'exito' }] },
      clausura: { label: 'Clausura', arrastre: { faseOrigen: 'APERTURA|REGULAR', porcentaje: 50 },
        zonas: [{ id: 'c', desde: 1, hasta: 2, tono: 'exito' }] } },
    porTramo: { 'APERTURA|REGULAR': 'apertura', 'CLAUSURA|REGULAR': 'clausura', '*': null } };
  /* Empate en el Apertura: ALEM le gana a ESTRELLA en un partido extra.
     OLIMPO y ALEM quedan 1-2 y 1-3... se iguala dándole a OLIMPO una
     derrota más: los dos 1-3 (5 puntos), OLIMPO ganó el duelo (81-77) y
     ALEM tiene MEJOR diferencia general (PCT › DIF lo pone arriba). */
  const EMP = AP_REG.concat(
    partido('07/03/2026', 'APERTURA', 'REGULAR', ALE, EST, 99, 60),
    partido('08/03/2026', 'APERTURA', 'REGULAR', NAP, OLI, 99, 50),
    partido('09/03/2026', 'APERTURA', 'REGULAR', NAP, ALE, 70, 69),
    partido('10/03/2026', 'APERTURA', 'REGULAR', EST, OLI, 70, 69));
  /* Un partido de cuartos del CLAUSURA: el mismo valor de FASE que los del
     Apertura, que solo la columna TORNEO separa. */
  const CL_PO = partido('20/09/2026', 'CLAUSURA', 'CUARTOS', OLI, NAP, 70, 68);
  const hojas = libro(EMP.concat(AP_PO, CL_REG, CL_PO));

  const ctx = {
    console, Promise, JSON, Math, Date, Map, Set, WeakMap, Array, Object, String, Number, RegExp, Error, Infinity,
    SGADD: SGADD, SGADD_UI: require('./js/sgadd-ui.js'),
    CLUB: { cfg: jsonClub, estado: { id: 'bahia-blanca-2026' } },
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
  /* El parser de competencia va ADENTRO del vm: `resolver()` mira el
     `CLUB` y el `SGADD_APP` de su propio global. */
  ['sgadd-config.js', 'sgadd-app.js', 'sgadd-clasificacion.js', 'sgadd-fixture.js', 'sgadd-fases.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync('./js/' + f, 'utf8'), ctx, { filename: f });
  });
  const planillasAntes = SGADD.CATALOGO.planillas;
  SGADD.CATALOGO.planillas = [{ id: CAT, slug: CAT, label: 'Primera Oro', activo: true }];
  const APP = vm.runInContext('SGADD_APP', ctx);
  APP.estado.planillaId = CAT;
  APP.estado.hojas = hojas;
  APP.estado.torneo = 'APERTURA';
  APP.estado.fase = 'REGULAR';
  APP.reindexar();

  const reglas = vm.runInContext('clasifReglasDeTramo("APERTURA", "REGULAR")', ctx);
  check('el orden es el de la CATEGORÍA (FIBA), no el del club (PCT)', reglas.orden.join() === 'FIBA', reglas.orden);
  const tAp = vm.runInContext('clasifTablaDeTramo("APERTURA", "REGULAR")', ctx);
  const iO = tAp.findIndex(r => r.nombre === OLI), iA = tAp.findIndex(r => r.nombre === ALE);
  check('OLIMPO y ALEM empatan en puntos de tabla', tAp[iO].puntos === tAp[iA].puntos, [tAp[iO].puntos, tAp[iA].puntos]);
  check('ALEM tiene mejor diferencia (con PCT › DIF iría arriba)', tAp[iA].dif > tAp[iO].dif, [tAp[iA].dif, tAp[iO].dif]);
  check('con FIBA, OLIMPO va arriba de ALEM: ganó el duelo directo', iO < iA && tAp[iO].desempate === 'duelo directo',
    tAp.map(r => r.puesto + ' ' + r.nombre + (r.desempate ? ' [' + r.desempate + ']' : '')));
  root.innerHTML = vm.runInContext('buildClasificacion()', ctx);
  check('la tabla muestra la columna Pts cuando ordena por puntos', /data-glosa="Puntos de tabla/.test(root.innerHTML));
  check('y la fila dice qué la desempató', /Desempate: duelo directo/.test(root.innerHTML));
  check('sin columna Arr. en el Apertura (no arrastra)', !/>Arr\.</.test(root.innerHTML));

  APP.cambiarTramo('CLAUSURA|REGULAR');
  check('la Clausura arrastra de la categoría',
    vm.runInContext('((clasifReglasDeTramo().arrastre || {}).declarado || {}).porcentaje', ctx) === 50);
  check('Clasificación muestra la columna Arr.', />Arr\.</.test(root.innerHTML), root.innerHTML.slice(0, 200));
  check('y avisa de dónde salen los puntos', /50 % de los puntos<\/b> de Apertura - Regular/.test(root.innerHTML));

  /* La llave de la Clausura usa la tabla de la Clausura CON arrastre. */
  vm.runInContext('SGADD_FIXTURE.estado.torneo = "bahia"; SGADD_FIXTURE.estado.doc = ' + JSON.stringify({
    id: 'bahia', zonas: { oro: { label: 'Oro', equipos: [OLI, ALE, NAP, EST].map(n => ({ nombre: n })) } },
    formato: { fases: [{ id: 'regular', label: 'Fase regular' },
      { id: 'cuartos-ap', label: 'Cuartos · Apertura', libro: ['CUARTOS'], torneo: 'APERTURA', tabla: 'APERTURA|REGULAR', serie: { mejorDe: 3 } },
      { id: 'cuartos-cl', label: 'Cuartos · Clausura', libro: ['CUARTOS'], torneo: 'CLAUSURA', tabla: 'CLAUSURA|REGULAR', serie: { mejorDe: 3 } },
      { id: 'semis-cl', label: 'Semis · Clausura', libro: ['SEMIFINAL'], torneo: 'CLAUSURA', tabla: 'CLAUSURA|REGULAR',
        serie: { mejorDe: 3 }, cruces: [{ id: 'S1', a: { zona: 'oro', puesto: 1 }, b: { zona: 'oro', puesto: 4 } }] }] },
  }) + ';', ctx);
  SGADD.CATALOGO.planillas[0].torneoId = 'bahia'; SGADD.CATALOGO.planillas[0].zonaId = 'oro';
  const cx = vm.runInContext('SGADD_FASES.contexto()', ctx);
  const tCl = cx.tablasPorTramo['CLAUSURA|REGULAR'] && cx.tablasPorTramo['CLAUSURA|REGULAR'].oro;
  const tablaCl = vm.runInContext('clasifTablaDeTramo("CLAUSURA", "REGULAR")', ctx);
  check('la llave arma la tabla de la Clausura', !!tCl, Object.keys(cx.tablasPorTramo || {}));
  check('los cuartos del Apertura toman SOLO sus 3 partidos', (cx.partidosPorFase['cuartos-ap'] || []).length === 3,
    (cx.partidosPorFase['cuartos-ap'] || []).length);
  check('y los del Clausura SOLO el suyo', (cx.partidosPorFase['cuartos-cl'] || []).length === 1,
    (cx.partidosPorFase['cuartos-cl'] || []).length);
  check('y es la MISMA de Clasificación (con el arrastre)', tCl && tCl.filas[0].clave === tablaCl[0].clave
    && tCl.filas.map(f => f.clave).join() === tablaCl.filter(r => !r.sinPartidos).map(r => r.clave).join());

  SGADD.CATALOGO.planillas = planillasAntes;
}

/* =====================================================================
   6 · EL LIBRO VINCULADO DE PLAYOFFS CON LA CARPETA AL REVÉS (punto 134)

   El caso de Bahía, tal como está en el catálogo: la fase de Cruces dice
   FASE = APERTURA y torneo APERTURA, con su libro vinculado de la zona Oro;
   el libro, armado desde la carpeta «OCTAVOS - APERTURA», trae
   TORNEO = OCTAVOS y FASE = APERTURA. El selector mostraba el tramo con
   datos Y la misma fase «· llave», que abría el modo llave.
   ===================================================================== */
seccion('6 · libro vinculado de playoffs: una sola opción y la llave con datos');
const DECL_BAHIA = { fases: [{ id: 'octavos', label: 'Octavos de Final - APERTURA', libro: ['APERTURA'],
  cruce: 'zona', zonaLibro: 'octavos-apertura', torneo: 'APERTURA', serie: { mejorDe: 3 },
  cruces: [{ id: 'O1', a: { zona: 'oro', puesto: 1 }, b: { zona: 'oro', puesto: 4 } },
    { id: 'O2', a: { zona: 'oro', puesto: 2 }, b: { zona: 'oro', puesto: 3 } }] }] };
const OCT = [].concat(
  partido('20/04/2026', 'OCTAVOS', 'APERTURA', NAP, ALE, 80, 60),
  partido('22/04/2026', 'OCTAVOS', 'APERTURA', ALE, NAP, 61, 79),
  partido('20/04/2026', 'OCTAVOS', 'APERTURA', EST, OLI, 70, 72));
{
  const p = F.parsear(DECL_BAHIA, { zonasValidas: ['oro'], participan: { 'octavos-apertura': ['oro'] } });
  check('la declaración de Bahía se lee sin errores', !p.errores.length, p.errores);
  const fases = p.fases;
  const conDatos = SGADD.combinacionesTorneoFase(libro(AP_REG.concat(OCT)));
  check('el libro trae el tramo al revés: OCTAVOS|APERTURA', conDatos.some(t => t.id === 'OCTAVOS|APERTURA'), conDatos.map(t => t.id));
  const sel = F.enriquecerTramos(conDatos, fases);
  const deOct = sel.filter(t => t.declarada === 'octavos');
  check('UNA sola opción para los octavos', deOct.length === 1, sel.map(t => t.id + ' «' + t.label + '»'));
  check('es el tramo con datos, no la llave', deOct[0] && deOct[0].id === 'OCTAVOS|APERTURA' && !deOct[0].llave);
  check('sin el sufijo «· llave» y con el nombre del reglamento', deOct[0] && deOct[0].label === 'Octavos de Final - APERTURA', deOct[0] && deOct[0].label);
  check('ninguna opción de llave en el selector', !sel.some(t => t.llave));
  check('la regular del Apertura no se confunde con los octavos', !sel.find(t => t.id === 'APERTURA|REGULAR').declarada);
  check('el tramo se reconoce como eliminación (Clasificación pinta la llave)', F.tipoDe('APERTURA', fases, 'OCTAVOS') === 'eliminacion');

  const sinJugar = F.enriquecerTramos(SGADD.combinacionesTorneoFase(libro(AP_REG)), fases);
  check('si el equipo no jugó los octavos, la llave SÍ se ofrece', sinJugar.filter(t => t.declarada === 'octavos').length === 1
    && sinJugar.some(t => t.llave), sinJugar.map(t => t.id));

  const dos = F.parsear({ fases: [
    { id: 'octavos', label: 'Octavos de Final - APERTURA', libro: ['APERTURA'], torneo: 'APERTURA', serie: { mejorDe: 3 } },
    { id: 'cuartos', label: 'Cuartos de Final - APERTURA', libro: ['APERTURA'], torneo: 'APERTURA', serie: { mejorDe: 3 } }] }).fases;
  check('con octavos y cuartos sobre el mismo valor, cada tramo va a su instancia',
    (F.declaradaDe(dos, 'APERTURA', 'OCTAVOS') || {}).id === 'octavos' && (F.declaradaDe(dos, 'APERTURA', 'CUARTOS') || {}).id === 'cuartos');
  const bien = F.parsear({ fases: [{ id: 'oct', label: 'Octavos', libro: ['OCTAVOS'], torneo: 'APERTURA', serie: { mejorDe: 3 } }] }).fases;
  check('declarada «al derecho» (FASE OCTAVOS) también calza con la carpeta al revés', !!F.declaradaDe(bien, 'APERTURA', 'OCTAVOS'));
  check('una carpeta al derecho sigue calzando como antes', (F.declaradaDe(bien, 'OCTAVOS', 'APERTURA') || {}).id === 'oct');
  check('otro torneo no calza (Clausura)', !F.declaradaDe(fases, 'CLAUSURA', 'OCTAVOS'));

  /* La postemporada del servidor: sus partidos traen el TORNEO del libro. */
  const ctx0 = { tablas: {}, nombresZona: {}, partidosPorFase: {} };
  F.mezclarLlave(ctx0, fases, { zonas: {}, postemporada: { partidos: [
    { fase: 'APERTURA', torneo: 'OCTAVOS', zonaLibro: 'octavos-apertura', fecha: '2026-04-20', local: NAP, visitante: ALE, ptsLocal: 80, ptsVisitante: 60 },
    { fase: 'APERTURA', torneo: 'CLAUSURA', zonaLibro: 'otra', fecha: '2026-10-20', local: NAP, visitante: ALE, ptsLocal: 80, ptsVisitante: 60 }] } }, 'oro', null);
  check('la llave del servidor suma los partidos de los octavos (y no los de otro libro)',
    (ctx0.partidosPorFase.octavos || []).length === 1, (ctx0.partidosPorFase.octavos || []).length);
}

seccion('6 bis · la app real con el libro vinculado fusionado');
{
  const root = { innerHTML: '' };
  const CAT = 'leandro-n-alem-primera-oro';
  const hojas = libro(AP_REG.concat(OCT));
  const ctx = {
    console, Promise, JSON, Math, Date, Map, Set, WeakMap, Array, Object, String, Number, RegExp, Error, Infinity,
    SGADD: SGADD, SGADD_UI: require('./js/sgadd-ui.js'),
    CLUB: { cfg: {}, estado: { id: 'leandro-n-alem' } },
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
  ['sgadd-config.js', 'sgadd-app.js', 'sgadd-clasificacion.js', 'sgadd-fixture.js', 'sgadd-fases.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync('./js/' + f, 'utf8'), ctx, { filename: f });
  });
  const planillasAntes = SGADD.CATALOGO.planillas;
  SGADD.CATALOGO.planillas = [{ id: CAT, slug: CAT, label: 'Primera Oro', activo: true, torneoId: 'bahia', zonaId: 'oro' }];
  vm.runInContext('SGADD_FIXTURE.estado.torneo = "bahia"; SGADD_FIXTURE.estado.doc = ' + JSON.stringify({
    id: 'bahia', zonas: { oro: { label: 'Oro', equipos: [OLI, ALE, NAP, EST].map(n => ({ nombre: n })) },
      'octavos-apertura': { label: 'Octavos - APERTURA', interzonal: true, participan: ['oro'], equipos: [] } },
    formato: DECL_BAHIA }) + ';', ctx);
  const APP = vm.runInContext('SGADD_APP', ctx);
  APP.estado.planillaId = CAT;
  APP.estado.hojas = hojas;
  APP.estado.torneo = 'OCTAVOS';
  APP.estado.fase = 'APERTURA';
  APP.reindexar();

  const barra = vm.runInContext('SGADD_APP.barra()', ctx);
  const opciones = (barra.match(/<option[^>]*>[^<]*<\/option>/g) || []);
  check('el selector trae los octavos UNA vez', opciones.filter(o => /Octavos/.test(o)).length === 1, opciones);
  check('sin la opción «· llave»', !opciones.some(o => /· llave/.test(o)), opciones);
  check('no se entra en modo llave', !vm.runInContext('SGADD_FASES.esLlave(SGADD_APP.estado.torneo)', ctx));
  check('el índice del tramo trae a los equipos de los octavos (datos completos)',
    APP.estado.idx && APP.estado.idx.liga.n === 4 && APP.estado.idx.liga.partidos === 3, APP.estado.idx && APP.estado.idx.liga);
  check('Scouting y Equipos no quedan bloqueados', !vm.runInContext(
    'SGADD_FASES.bloqueaEnLlave("scouting", SGADD_APP.estado.torneo) || SGADD_FASES.bloqueaEnLlave("equipos", SGADD_APP.estado.torneo)', ctx));
  const cx = vm.runInContext('SGADD_FASES.contexto()', ctx);
  check('la llave toma los partidos del libro vinculado', (cx.partidosPorFase.octavos || []).length === 3,
    (cx.partidosPorFase.octavos || []).length);
  root.innerHTML = vm.runInContext('buildClasificacion()', ctx);
  check('Clasificación pinta la llave de los octavos, sin el aviso de «solo la llave»',
    /Octavos de Final/.test(root.innerHTML) && !/solo la llave/.test(root.innerHTML), root.innerHTML.slice(0, 300));
  SGADD.CATALOGO.planillas = planillasAntes;
}

console.log('\n' + (mal ? '✗ HAY FALLAS · ' : '✓ TODO OK · ') + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
