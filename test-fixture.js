/* =====================================================================
   test-fixture.js · la sección FIXTURE y los empty states de pretemporada
   (punto 68), más la grilla compacta del Panel Master (punto 69).

     node test-fixture.js
   ===================================================================== */
'use strict';

const fs = require('fs');
const vm = require('vm');
const F = require('./js/sgadd-fixture.js');
const CORE = require('./js/sgadd-core.js');
const AUTH = require('./js/sgadd-auth.js');
const UI = require('./js/sgadd-ui.js');

/* Los modulos de UI usan `document` y globals del navegador, asi que se
   cargan en un `vm` con lo minimo. Es el patron de `test-boot.js`: probar el
   HTML que sale de verdad, no el fuente que lo produce. */
function contextoUi() {
  const ctx = {
    console, Promise, Math, JSON, Date, Number, String, Object, Array, RegExp, isFinite, parseFloat, parseInt,
    setTimeout: () => 0, clearTimeout: () => 0,
    document: {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      addEventListener: () => {}, createElement: () => ({ style: {}, appendChild() {}, remove() {} }),
      body: { contains: () => false, appendChild() {} }, activeElement: null,
    },
    LOGOS: { getUrl: () => null, iniciales: (n) => String(n || '?').slice(0, 2).toUpperCase(), resolver: () => Promise.resolve() },
    navigate: () => {}, currentSection: 'configuracion',
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/sgadd-core.js', 'utf8') + '\nthis.SGADD = SGADD;', ctx);
  vm.runInContext(fs.readFileSync('js/sgadd-auth.js', 'utf8') + '\nthis.SGADD_AUTH = SGADD_AUTH;', ctx);
  vm.runInContext(fs.readFileSync('js/sgadd-ui.js', 'utf8') + '\nthis.SGADD_UI = SGADD_UI;', ctx);
  return ctx;
}

/** Carga un modulo de UI en el `vm` y llama a una de sus funciones. */
function enVm(archivo, fn, args) {
  const ctx = contextoUi();
  vm.runInContext(fs.readFileSync(archivo, 'utf8'), ctx);
  ctx.__args = args || [];
  return vm.runInContext(fn + '.apply(null, __args)', ctx);
}

let ok = 0, mal = 0;
function check(n, cond, det) {
  if (cond) { ok++; console.log('  ✓ ' + n); }
  else { mal++; console.log('  ✗ ' + n + (det !== undefined ? '  → ' + JSON.stringify(det) : '')); }
}
function seccion(t) { console.log('\n' + t); }

const LA = JSON.parse(fs.readFileSync('torneos/liga-argentina-2026-27.json', 'utf8'));

/* Un índice de mentira con la forma que produce `construirIndice`: lo único
   que el motor le pide es `lista()` y los partidos con CONDICION. */
function idxDe(equipos) {
  return { lista: () => equipos };
}

/* =====================================================================
   1 · Las fechas · sin `Date` para el día
   ===================================================================== */
seccion('1 · fechas');
{
  check('ISO pasa derecho', F.fechaISO('2026-10-15') === '2026-10-15');
  check('d/m/aaaa de la planilla', F.fechaISO('8/05/2026') === '2026-05-08');
  check('dd/mm/aaaa también', F.fechaISO('15/05/2026') === '2026-05-15');
  check('lo que no se entiende es null, no una fecha inventada',
    F.fechaISO('') === null && F.fechaISO('ayer') === null && F.fechaISO(null) === null);
  /* LA TRAMPA DE LA ZONA HORARIA: `new Date('2026-10-15')` es medianoche
     UTC, o sea el 14 a las 21 en Argentina. El partido saldría un día
     antes en la agenda del DT. */
  check('el 15 se muestra como 15 y no como 14', /\b15 de octubre\b/.test(F.fechaLarga('2026-10-15', true)));
  check('con día de la semana', F.fechaLarga('2026-10-15', true).indexOf('jueves') === 0,
    F.fechaLarga('2026-10-15', true));
  check('el mes se lee en castellano', F.mesLargo('2026-10') === 'octubre 2026');
  check('la aritmética de meses cruza el año', F.mesMas('2026-12', 1) === '2027-01'
    && F.mesMas('2027-01', -1) === '2026-12');
}

/* =====================================================================
   2 · El calendario declarado
   ===================================================================== */
seccion('2 · calendario del torneo');
{
  const norte = F.normalizarCalendario(LA, 'norte');
  const sur = F.normalizarCalendario(LA, 'sur');
  const todos = F.normalizarCalendario(LA);
  check('se acota a la zona', norte.length + sur.length === todos.length && norte.length > 0 && sur.length > 0);
  check('y ningún partido de la Norte nombra a un equipo de la Sur', norte.every((p) => {
    const eqSur = LA.zonas.sur.equipos.map(e => CORE.claveEquipo(e.nombre));
    return eqSur.indexOf(p.localClave) === -1 && eqSur.indexOf(p.visitanteClave) === -1;
  }));
  check('vienen ordenados por fecha', norte.every((p, i) => !i || norte[i - 1].fecha <= p.fecha));
  check('nacen SIN jugar y sin marcador', norte.every(p => !p.jugado && p.ptsLocal === null));
  check('la clave del cruce no depende del orden de los equipos',
    F.claveCruce('2026-10-15', 'A', 'B') === F.claveCruce('2026-10-15', 'B', 'A'));
  check('sin calendario devuelve vacío y no rompe',
    F.normalizarCalendario(null).length === 0 && F.normalizarCalendario({}).length === 0);
}

/* =====================================================================
   3 · Lo jugado sale del ÍNDICE
   ===================================================================== */
seccion('3 · los partidos jugados');
{
  const idx = idxDe([
    { clave: 'JUJUY BASQUET', nombre: 'JUJUY BASQUET', partidos: [
      { CONDICION: 'LOCAL', FECHA: '18/10/2026', PARTIDO: 'JUJUY BASQUET vs HINDU (C)', PTS: 80, PTSopp: 70 },
      { CONDICION: 'VISITANTE', FECHA: '25/10/2026', PARTIDO: 'SALTA BASKET vs JUJUY BASQUET', PTS: 60, PTSopp: 75 },
    ] },
    { clave: 'HINDU (C)', nombre: 'HINDU (C)', partidos: [
      /* EL MISMO CRUCE desde el otro lado: no puede entrar dos veces. */
      { CONDICION: 'VISITANTE', FECHA: '18/10/2026', PARTIDO: 'JUJUY BASQUET vs HINDU (C)', PTS: 70, PTSopp: 80 },
    ] },
    { clave: 'SALTA BASKET', nombre: 'SALTA BASKET', partidos: [
      { CONDICION: 'LOCAL', FECHA: '25/10/2026', PARTIDO: 'SALTA BASKET vs JUJUY BASQUET', PTS: 60, PTSopp: 75 },
    ] },
  ]);
  const j = F.jugadosDelIndice(idx);
  check('cada cruce entra UNA vez, tomado del lado local', j.length === 2, j.map(x => x.local + '-' + x.visitante));
  check('el local es el local y el marcador va de ese lado',
    j[0].localClave === 'JUJUY BASQUET' && j[0].ptsLocal === 80 && j[0].ptsVisitante === 70);
  check('el segundo cruce también', j[1].localClave === 'SALTA BASKET' && j[1].ptsLocal === 60);
  check('todos vienen marcados como jugados', j.every(p => p.jugado));

  check('el rival sale del texto «A vs B»',
    F.rivalDelTexto('JUJUY BASQUET vs HINDU (C)', 'JUJUY BASQUET') === 'HINDU (C)');
  /* La clave del índice ya está normalizada y el texto no: si el módulo
     usara un normalizador propio, no cruzarían (pasó en la primera versión). */
  check('y cruza aunque el texto venga con el sufijo de la planilla',
    F.rivalDelTexto('C. MARCHIGIANO - MM vs A. CHASCOMUS - MM', 'C MARCHIGIANO') === 'A. CHASCOMUS - MM');
  check('un texto que no se puede partir devuelve null',
    F.rivalDelTexto('algo raro', 'X') === null && F.rivalDelTexto('', 'X') === null);
  check('un equipo que no es ninguno de los dos lados, también',
    F.rivalDelTexto('A vs B', 'C') === null);
  check('sin CONDICION no se inventa de qué lado jugó',
    F.jugadosDelIndice(idxDe([{ clave: 'A', nombre: 'A', partidos: [{ FECHA: '1/01/2026', PARTIDO: 'A vs B', PTS: 1 }] }])).length === 0);
  check('sin índice no rompe', F.jugadosDelIndice(null).length === 0);
}

/* =====================================================================
   4 · El cruce · EL MARCADOR ES DEL ÍNDICE
   ===================================================================== */
seccion('4 · calendario + índice');
{
  const cal = [{ fecha: '2026-10-18', hora: '20:00', zona: 'norte', local: 'JUJUY BASQUET', visitante: 'HINDU (C)',
    localClave: 'JUJUY BASQUET', visitanteClave: 'HINDU (C)', declarado: true, jugado: false, ptsLocal: null, ptsVisitante: null }];
  const jug = [{ fecha: '2026-10-18', hora: null, zona: null, local: 'JUJUY BASQUET', visitante: 'HINDU (C)',
    localClave: 'JUJUY BASQUET', visitanteClave: 'HINDU (C)', declarado: false, jugado: true, ptsLocal: 80, ptsVisitante: 70 }];
  const u = F.unir(cal, jug);
  check('un cruce declarado que se jugó NO se duplica', u.length === 1);
  check('toma el marcador del índice', u[0].ptsLocal === 80 && u[0].jugado === true);
  check('y conserva la hora y la zona, que el índice no tiene',
    u[0].hora === '20:00' && u[0].zona === 'norte');

  /* El calendario de LAB es PARCIAL: si un partido jugado no está
     declarado y se descartara, la sección mentiría apenas empiece. */
  const extra = jug.concat([{ fecha: '2026-10-25', local: 'SALTA BASKET', visitante: 'JUJUY BASQUET',
    localClave: 'SALTA BASKET', visitanteClave: 'JUJUY BASQUET', jugado: true, ptsLocal: 60, ptsVisitante: 75 }]);
  check('un partido jugado que el calendario NO declara entra igual', F.unir(cal, extra).length === 2);
  check('sin nada, nada', F.unir(null, null).length === 0);
}

/* =====================================================================
   5 · La vista del equipo
   ===================================================================== */
seccion('5 · los partidos de un equipo');
{
  const ps = F.unir(F.normalizarCalendario(LA, 'norte'), []);
  const mios = F.delEquipo(ps, 'JUJUY BASQUET');
  check('solo los suyos', mios.length > 0 && mios.every(p =>
    p.localClave === 'JUJUY BASQUET' || p.visitanteClave === 'JUJUY BASQUET'));
  check('con el rival y la condición resueltos', mios.every(p => p.rival && typeof p.esLocal === 'boolean'));
  check('el rival nunca es uno mismo', mios.every(p => p.rivalClave !== 'JUJUY BASQUET'));
  check('un equipo que no está devuelve vacío', F.delEquipo(ps, 'EQUIPO QUE NO EXISTE').length === 0);
  check('sin equipo, tampoco inventa', F.delEquipo(ps, '').length === 0);

  check('un partido sin jugar no tiene resultado', F.resultado({ jugado: false, ptsPropios: 10, ptsRival: 2 }) === null);
  check('ganado y perdido', F.resultado({ jugado: true, ptsPropios: 80, ptsRival: 70 }) === 'GANADO'
    && F.resultado({ jugado: true, ptsPropios: 70, ptsRival: 80 }) === 'PERDIDO');
  check('jugado pero sin marcador cargado tampoco inventa',
    F.resultado({ jugado: true, ptsPropios: null, ptsRival: null }) === null);
}

/* =====================================================================
   6 · Por qué mes abre
   ===================================================================== */
seccion('6 · el mes por defecto');
{
  const ps = [{ fecha: '2026-10-18' }, { fecha: '2026-11-02' }];
  check('el mes en curso, si tiene partidos',
    JSON.stringify(F.mesPorDefecto(ps, '2026-10-05')) === JSON.stringify({ mes: '2026-10', motivo: 'actual' }));
  /* ANTES DEL TORNEO todo el calendario está adelante: abrir en el mes
     actual mostraría una pantalla vacía el día que más se mira. */
  check('el primero que viene, si el actual está vacío',
    JSON.stringify(F.mesPorDefecto(ps, '2026-09-25')) === JSON.stringify({ mes: '2026-10', motivo: 'proximo' }));
  check('el último, si ya terminó todo',
    JSON.stringify(F.mesPorDefecto(ps, '2027-06-01')) === JSON.stringify({ mes: '2026-11', motivo: 'terminado' }));
  check('sin partidos, el actual y lo dice',
    F.mesPorDefecto([], '2026-09-25').motivo === 'sin-partidos');
}

/* =====================================================================
   7 · LOS AÑOS ATÍPICOS · se denuncian, no se tocan
   ===================================================================== */
seccion('7 · fechas con el año equivocado');
{
  /* Medido en el libro real de la Zona C el 2026-09-25: dos fechas vienen
     cargadas en 2029 sobre una temporada 2026. */
  const ps = [{ fecha: '2026-05-08' }, { fecha: '2026-05-15' }, { fecha: '2026-05-22' },
    { fecha: '2029-05-27' }, { fecha: '2029-05-29' }];
  const at = F.aniosAtipicos(ps);
  check('se marcan los dos de 2029', at.length === 2 && at.every(p => p.fecha.slice(0, 4) === '2029'));
  check('NO se descartan ni se corrigen: siguen en la lista',
    F.unir(ps.map(p => Object.assign({ localClave: 'A', visitanteClave: 'B' }, p)), []).length === 5);
  /* Una temporada real cruza el año (octubre a abril) y eso no es un error. */
  check('una temporada oct-abr no dispara nada',
    F.aniosAtipicos([{ fecha: '2026-10-15' }, { fecha: '2026-12-20' }, { fecha: '2027-04-20' }]).length === 0);
  check('un solo año, nada', F.aniosAtipicos([{ fecha: '2026-05-08' }]).length === 0);
  check('sin fechas, nada', F.aniosAtipicos([]).length === 0 && F.aniosAtipicos(null).length === 0);
}

/* =====================================================================
   8 · La agenda completa
   ===================================================================== */
seccion('8 · agenda');
{
  const a = F.agenda({ torneo: LA, zona: 'norte', idx: null, equipo: 'JUJUY BASQUET', hoy: '2026-09-25' });
  check('la Norte declara sus partidos', a.declarados === 17 && a.jugados === 0);
  check('el calendario se declara PARCIAL', a.calendarioParcial === true);
  check('Jujuy tiene su partido de la primera fecha', a.mios.length === 1
    && a.mios[0].fecha === '2026-10-18' && a.mios[0].rival === 'HINDU (C)');
  check('y lo juega de local', a.mios[0].esLocal === true);
  check('abre en octubre, diciendo que septiembre está vacío',
    a.mes === '2026-10' && a.mesMotivo === 'proximo');
  /* La clave va NORMALIZADA (`claveEquipo`): los paréntesis de la
     provincia se conservan en el NOMBRE y salen de la clave. */
  check('el próximo rival es Hindú', a.rival && a.rival.clave === 'HINDU C'
    && a.rival.nombre === 'HINDU (C)', a.rival && a.rival.clave);
  /* Es la primera fecha: el rival NO jugó antes, y decirlo es la respuesta
     correcta — no un hueco. */
  check('que no tiene partido anterior en el torneo', a.rival.anterior === null);
  check('y sí tiene el siguiente, que no es contra nosotros',
    a.rival.siguiente && a.rival.siguiente.fecha === '2026-10-20'
    && a.rival.siguiente.rivalClave !== 'JUJUY BASQUET', a.rival.siguiente);

  /* SIN EQUIPO PROPIO —un torneo que el admin mira entero— la sección
     sigue sirviendo: muestra el calendario de la zona. */
  const s = F.agenda({ torneo: LA, zona: 'norte', idx: null, equipo: '', hoy: '2026-09-25' });
  check('sin equipo propio muestra el calendario igual', s.delMes.length === 17 && s.rival === null);

  /* EL TORNEO QUE NO EMPEZÓ: es el caso de todo octubre menos las fechas. */
  const v = F.agenda({ torneo: { calendario: { partidos: [] } }, idx: null, equipo: 'X', hoy: '2026-09-25' });
  check('sin nada declarado ni jugado, la agenda queda vacía y no rompe',
    v.total === 0 && v.delMes.length === 0 && v.proximo === null && v.rival === null);

  /* EL MARCADOR MANDA sobre el declarado, también acá. */
  const idx = idxDe([{ clave: 'JUJUY BASQUET', nombre: 'JUJUY BASQUET', partidos: [
    { CONDICION: 'LOCAL', FECHA: '18/10/2026', PARTIDO: 'JUJUY BASQUET vs HINDU (C)', PTS: 88, PTSopp: 71 }] }]);
  const b = F.agenda({ torneo: LA, zona: 'norte', idx: idx, equipo: 'JUJUY BASQUET', hoy: '2026-10-19' });
  check('jugado el partido, la agenda lo muestra con su marcador',
    b.mios[0].jugado && b.mios[0].ptsPropios === 88 && F.resultado(b.mios[0]) === 'GANADO');
  check('y deja de ser el próximo', b.proximo === null || b.proximo.fecha > '2026-10-18');
  check('sin duplicarlo: el declarado y el jugado son el mismo cruce',
    b.mios.filter(p => p.fecha === '2026-10-18').length === 1);
}

/* =====================================================================
   9 · La sección está registrada en TODOS lados
   ===================================================================== */
seccion('9 · registro de la sección');
{
  check('en el vocabulario del router', SGADDSecciones().indexOf('fixture') !== -1);
  const idx = fs.readFileSync('index.html', 'utf8');
  check('en VALID_SECTIONS del index', /VALID_SECTIONS = \[[^\]]*'fixture'/.test(idx));
  check('en el switch de renderSection', /case 'fixture':/.test(idx));
  check('en el nav', /data-nav="fixture"/.test(idx));
  check('con su título', /fixture: 'Fixture'/.test(idx));
  check('y el script carga', /js\/sgadd-fixture\.js/.test(idx));
  /* Sumar un nombre a SECCIONES cambia cómo se leen los links VIEJOS
     (punto 16): es seguro mientras ninguna FASE se llame igual. */
  check('«fixture» no colisiona con ninguna FASE',
    Object.keys(CORE.FASES || {}).map(f => f.toLowerCase()).indexOf('fixture') === -1);

  /* ES ABIERTA, como la tabla de posiciones: el calendario publicado de la
     liga no es un análisis que se cobre. */
  check('el módulo es abierto', AUTH.MODULOS.fixture === null);
  ['BRONCE', 'PLATA', 'ORO'].forEach((plan) => {
    const r = AUTH.puedoAcceder('fixture', { sesion: { email: 'x@y.com', club: 'c', plan: plan } });
    check('el plan ' + plan + ' entra a Fixture', r.ok, r);
  });
}
function SGADDSecciones() { return CORE.SECCIONES; }

/* =====================================================================
   10 · EMPTY STATES · el libro existe y está vacío
   ===================================================================== */
seccion('10 · pretemporada');
{
  /* Medido en el navegador el 2026-09-25 con un libro de 9 hojas y cero
     filas: ninguna sección explotaba —eso ya estaba bien— pero Equipos y
     Jugadores decían «muestra insuficiente», que describe otra cosa. */
  const t = UI.sinDatosTodavia({});
  check('el empty state dice que no hay partidos JUGADOS', /todav[íi]a no hay partidos jugados/i.test(t));
  check('y explica por qué: la competencia no empezó', /no empez|primer box score/i.test(t));
  check('NO habla de muestra insuficiente ni de percentiles',
    !/muestra insuficiente|percentil/i.test(t), t.slice(0, 200));
  check('manda al fixture', /navigate\('fixture'\)/.test(t));
  check('salvo que no haya torneo al que mandar',
    !/navigate\('fixture'\)/.test(UI.sinDatosTodavia({ fixture: false })));
  check('el detalle se puede reemplazar', /la tabla de posiciones/i.test(
    UI.sinDatosTodavia({ detalle: 'La tabla de posiciones se arma con los partidos jugados.' })));

  const app = fs.readFileSync('js/sgadd-app.js', 'utf8');
  check('el aviso de muestra separa los dos vacíos',
    /!estado\.idx\.lista\(\)\.length/.test(app) && /sinDatosTodavia/.test(app));
  /* LA TABLA DE POSICIONES SE EJERCE, no se lee: con un `/sinDatosTodavia/`
     sobre el fuente, desactivar la rama —`false &&`— dejaba la cadena ahí y
     el test seguía en verde. Un test que no falla sin el arreglo no prueba
     nada. */
  const vacia = enVm('js/sgadd-clasificacion.js', 'clasifTablaHTML',
    [{ lista: () => [], liga: { fase: 'REGULAR', torneo: 'GENERAL' }, get: () => null }, {}]);
  check('la tabla de posiciones vacía usa el empty state de pretemporada',
    /todav[íi]a no hay partidos jugados/i.test(vacia), vacia.slice(0, 160));
  check('y no el cartel seco de antes', !/Sin partidos cargados en este tramo/.test(vacia));
}

/* =====================================================================
   11 · Las iniciales · el bug de los paréntesis
   ===================================================================== */
seccion('11 · LOGOS.iniciales');
{
  /* `HINDU (C)` daba `H(` en el scatter, la tabla, el scouting y los cinco
     PDF: el paréntesis contaba como palabra. Solo se veía con UNA palabra
     antes del paréntesis, por eso sobrevivió tanto. */
  const src = fs.readFileSync('index.html', 'utf8');
  const cuerpo = src.slice(src.indexOf('function iniciales(nombre)'));
  const fin = cuerpo.indexOf('\n  }');
  const fn = new Function('return ' + cuerpo.slice(0, fin + 4).replace(/^function/, 'function'))();
  check('HINDU (C) → HC, no H(', fn('HINDU (C)') === 'HC', fn('HINDU (C)'));
  check('LA UNION (C) → LU', fn('LA UNION (C)') === 'LU');
  check('SP. SUARDI → SS', fn('SP. SUARDI') === 'SS');
  check("RECONQUISTA 'B'- MM → RB", fn("RECONQUISTA 'B'- MM") === 'RB', fn("RECONQUISTA 'B'- MM"));
  check('los que ya andaban no se movieron',
    fn('SALTA BASKET') === 'SB' && fn('RIVER') === 'R' && fn('JUJUY BASQUET') === 'JB');
  check('vacío no da vacío: da ?', fn('') === '?' && fn(null) === '?');
  check('un nombre de puros símbolos tampoco queda vacío', fn('(( ))') === '?');
}

/* =====================================================================
   12 · El Panel Master compacto
   ===================================================================== */
seccion('12 · la grilla de clientes');
{
  const HUB = require('./js/sgadd-hub.js');
  const c = { id: 'deportivo', nombre: 'Deportivo La Plata', liga: 'la-plata', equipoPropio: 'DEPORTIVO LA PLATA',
    categorias: [
      { slug: 'a', label: 'Primera', activo: true, planEfectivo: 'PLATA', estadoEfectivo: 'activo' },
      { slug: 'b', label: 'U21', activo: false, planEfectivo: 'PLATA', estadoEfectivo: 'activo' },
    ] };
  const r = HUB.resumenClub(c);
  check('cuenta las categorías con libro', r.conDatos === 1 && r.total === 2);
  check('el plan que rige', r.plan === 'PLATA');
  /* Con planes distintos por categoría (punto 60), decir el primero sería
     decir que el club entero es BRONCE cuando su Primera es ORO. */
  const mix = HUB.resumenClub({ id: 'x', nombre: 'X', categorias: [
    { slug: 'a', activo: true, planEfectivo: 'ORO', estadoEfectivo: 'activo' },
    { slug: 'b', activo: true, planEfectivo: 'BRONCE', estadoEfectivo: 'pausado' }] });
  check('con planes distintos dice «mixto», no el primero', mix.plan === 'mixto' && mix.estado === 'mixto');

  const src = fs.readFileSync('js/sgadd-hub.js', 'utf8');
  const grilla = src.slice(src.indexOf('CUATRO POR FILA'), src.indexOf('CUATRO POR FILA') + 700);
  check('la grilla es de 4 columnas en escritorio', /lg:grid-cols-4/.test(grilla), grilla.slice(0, 80));
  check('con pasos intermedios y no un salto de 1 a 4',
    /grid-cols-2/.test(grilla) && /md:grid-cols-3/.test(grilla));

  /* LA TARJETA COMPACTA NO PUEDE TRAER CONTROLES: el punto de sacarlos de
     la grilla es que un clic de más no pause a un cliente. Se EJERCE y se
     mira el HTML: leyendo el fuente de la función, meterle de vuelta un
     `bloqueSuscripcion(c)` no se notaba —la llamada no contiene ninguna de
     las cadenas que se buscaban— y el test quedaba en verde. */
  const cSus = { id: 'deportivo', nombre: 'Deportivo La Plata', liga: 'la-plata', plan: 'PLATA', estado: 'activo',
    categorias: [{ slug: 'a', label: 'Primera', activo: true, planEfectivo: 'PLATA', estadoEfectivo: 'activo' }] };
  const htmlTarjeta = HUB.tarjetaClub(cSus);
  check('la tarjeta no ofrece pausar, dar de baja ni cambiar el plan',
    !/accionClub|accionCategoria|<select|Pausar|Dar de baja/i.test(htmlTarjeta), htmlTarjeta.slice(0, 200));
  check('y su único handler abre el detalle',
    (htmlTarjeta.match(/onclick=/g) || []).length === 1 && /SGADD_HUB\.verDetalle/.test(htmlTarjeta));
  check('el nombre, el plan y el estado sí están',
    /Deportivo La Plata/.test(htmlTarjeta) && /PLATA/.test(htmlTarjeta) && /activo/.test(htmlTarjeta));
  check('y es un <button>: se abre con Enter', /^<button type="button"/.test(htmlTarjeta));
  /* EL DETALLE SÍ trae los controles: es lo que se movió al modal. */
  const htmlDetalle = HUB.detalleClub(cSus);
  check('el detalle sí trae los controles de suscripción',
    /<select|accionCategoria|accionClub/i.test(htmlDetalle));
  check('el modal pinta los MISMOS bloques, no una copia',
    /bloqueSuscripcion\(c\)/.test(src.slice(src.indexOf('function detalleClub'), src.indexOf('function modalDetalle')))
    && /bloqueAccesos\(c\)/.test(src.slice(src.indexOf('function detalleClub'), src.indexOf('function modalDetalle'))));
  check('cierra con ESC', /ev\.key === 'Escape' && detalle\.club/.test(src));
  check('y con un clic afuera', /if\(event\.target===this\)SGADD_HUB\.cerrarDetalle\(\)/.test(src));
  /* El foco se busca por la TARJETA y no por el disparador: un clic del
     mouse no siempre enfoca al <button>, y ahí el disparador es el body. */
  check('el foco vuelve a la tarjeta, buscándola por su id',
    src.indexOf("querySelector('[data-club-card=\"'") < src.indexOf('detalle.disparador && document.body.contains'),
    'el fallback del disparador va después');
}

/* =====================================================================
   13 · El torneo y la zona llegan al cliente
   ===================================================================== */
seccion('13 · torneo y zona en el catálogo');
{
  const cat = require('./server/lib/catalogo.js');
  const c = { jujuy: { nombre: 'J', categorias: {
    'jujuy-lab': { label: 'LAB', sheetId: 'x'.repeat(40), torneo: 'liga-argentina-2026-27', zona: 'norte' } } } };
  const mio = cat.publico(c, { club: 'jujuy', origen: 'kv' })[0].categorias[0];
  check('el cliente recibe el torneo y la zona de SU categoría',
    mio.torneo === 'liga-argentina-2026-27' && mio.zona === 'norte');
  const ajeno = cat.publico(c, { club: 'otro', origen: 'kv' })[0].categorias[0];
  check('y no los de otro club', ajeno.torneo === undefined);
  check('sigue sin viajar ningún sheetId', !/x{40}/.test(JSON.stringify(cat.publico(c, { admin: true, origen: 'kv' }))));

  /* La zona de un TORNEO es su propio fixture: sin esto, abrir la Zona C
     decía «esta categoría no está enganchada a un torneo» — y es el torneo. */
  const club = fs.readFileSync('js/sgadd-club.js', 'utf8');
  check('un torneo usa su propio id como torneo de la categoría',
    /s\.tipo === 'torneo' && !p\.torneoId\) p\.torneoId = s\.id/.test(club));
  check('y la planilla recibe torneo y zona', /if \(k\.torneo\) p\.torneoId = k\.torneo/.test(club));
  /* EL CAMPO SE LLAMA `torneoId` Y NO `torneo`: el JSON del club YA usa
     `torneo` para el NOMBRE del torneo («CONFERENCIA NORTE»), que baja a
     cada planilla. Con el mismo nombre, el fixture buscaba
     `torneos/CONFERENCIA NORTE.json` y el selector ofrecia «solo fixture»
     en cualquier categoria sin libro. Es la colision del punto 18, otra vez. */
  check('y NO se llama `torneo`, que en el JSON del club es el NOMBRE',
    JSON.parse(fs.readFileSync('clubes/jujuy.json', 'utf8')).torneo === 'CONFERENCIA NORTE'
    && !/p\.torneo =/.test(club), 'el JSON del club ya ocupa esa clave');
}

/* =====================================================================
   14 · La categoría SIN LIBRO pero con torneo se puede abrir
   ===================================================================== */
seccion('14 · entrar al fixture antes de que exista el libro');
{
  const APP = require('./js/sgadd-app.js');
  /* Antes del primer partido la zona no tiene libro, y con la categoría
     deshabilitada el club no podía ver ni su propio calendario. */
  check('sin libro y sin torneo sigue diciendo «sin datos»',
    APP.sufijoCategoria({ activo: false }) === ' — sin datos');
  check('sin libro pero con torneo dice que es solo el fixture',
    APP.sufijoCategoria({ activo: false, torneoId: 'liga-argentina-2026-27' }) === ' — solo fixture');
  check('con libro no cambia', APP.sufijoCategoria({ activo: true, plan: 'ORO' }) === ' · ORO');
  /* EL BLOQUEO COMERCIAL GANA: una pausada no se abre ni para el fixture. */
  check('una categoría pausada sigue diciendo pausada, aunque tenga torneo',
    APP.sufijoCategoria({ activo: false, torneoId: 'x', bloqueada: true, estado: 'pausado' }) === ' — pausada');

  const app = fs.readFileSync('js/sgadd-app.js', 'utf8');
  const opt = app.slice(app.indexOf('<option value='), app.indexOf('<option value=') + 300);
  check('el selector la habilita', opt.indexOf('x.activo || (x.torneoId') !== -1, opt.slice(0, 140));
  check('pero NO si está bloqueada', opt.indexOf('!x.bloqueada') !== -1);
}

console.log('\n' + (mal ? '✗ HAY FALLAS · ' : '✓ TODO OK · ') + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
