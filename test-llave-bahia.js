/* =====================================================================
   test-llave-bahia.js · fases por TABLA y por LLAVE, el Play-In del
   Clausura de Bahía y el camino del equipo (2026-11-07, punto 167)

   El caso real, medido en los libros el 2026-11-07: el libro de la
   postemporada del Clausura trae TORNEO = «PLAY IN» y FASE = «CLAUSURA»
   (la carpeta al revés del punto 134), y «PLAY IN» no era una instancia
   conocida. Consecuencias:
     - el selector ponía «Play in - Clausura» en «Fase regular» y repetía
       la fase declarada como «Play-In - CLAUSURA · llave»;
     - Clasificación le armaba una TABLA de posiciones de cuatro equipos;
     - la llave del Clausura no veía ni un partido jugado.

   Lo que se EJERCE:
     1. el motor: la carpeta al revés del Play-In, el selector y el grupo;
     2. la llave y el CAMINO de un equipo (lo que viene, de dónde viene, el
        rival pendiente con sus dos candidatos);
     3. la tarjeta simple: escudo · nombre · puesto, sin la etiqueta larga;
     4. la app real en un `vm`: selector, Clasificación (llave + la tabla
        regular de la que salen los puestos) y Fixture (los cruces arriba y
        «Lo que viene» aunque la liga no haya publicado la fecha).

     node test-llave-bahia.js
   ===================================================================== */
'use strict';
const fs = require('fs');
const vm = require('vm');
const SGADD = require('./js/sgadd-core.js');
global.SGADD = SGADD;
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

/* La regular del Clausura: OLI 1° (+6), ALE 2° (+5), NAP 3° (−5), EST 4° (−6). */
const CL_REG = [].concat(
  partido('01/08/2026', 'CLAUSURA', 'REGULAR', ALE, NAP, 70, 65),
  partido('02/08/2026', 'CLAUSURA', 'REGULAR', OLI, EST, 66, 60));
/* El Play-In, con la carpeta al revés: TORNEO = PLAY IN, FASE = CLAUSURA.
   Se jugó P1 (3° contra 4°); P2 (1° contra 2°) todavía no. */
const PLAYIN = [].concat(partido('05/11/2026', 'PLAY IN', 'CLAUSURA', NAP, EST, 70, 60));

/* La declaración, como la guarda el editor de cruces: el Play-In SIN
   torneo y con su libro «PLAY IN»; los cuartos con torneo CLAUSURA, y la
   tabla escrita a mano con espacios («CLAUSURA | REGULAR»). */
const DECL = { fases: [
  { id: 'playin-clausura', label: 'Play-In - CLAUSURA', libro: ['PLAY IN'], cruce: 'zona',
    zonaLibro: 'postemporada-clausura', serie: { mejorDe: 1 },
    cruces: [
      { id: 'P1', label: 'Partido 1', a: { zona: 'oro', puesto: 3, tabla: 'CLAUSURA|REGULAR' }, b: { zona: 'oro', puesto: 4, tabla: 'CLAUSURA|REGULAR' } },
      { id: 'P2', label: 'Partido 2', a: { zona: 'oro', puesto: 1, tabla: 'CLAUSURA|REGULAR' }, b: { zona: 'oro', puesto: 2, tabla: 'CLAUSURA|REGULAR' } }] },
  { id: 'cuartos-clausura', label: 'Cuartos de Final - CLAUSURA', libro: ['CUARTOS'], cruce: 'zona',
    zonaLibro: 'postemporada-clausura', torneo: 'CLAUSURA', serie: { mejorDe: 3 },
    cruces: [
      { id: 'C1', label: 'Cuartos 1', a: { ganador: 'P1' }, b: { ganador: 'P2' } },
      { id: 'C2', label: 'Cuartos 2', a: { perdedor: 'P1' }, b: { zona: 'oro', puesto: 2, tabla: 'CLAUSURA | REGULAR' } }] }] };

/* =====================================================================
   1 · EL MOTOR: LA CARPETA AL REVÉS DEL PLAY-IN
   ===================================================================== */
seccion('1 · «PLAY IN - CLAUSURA» es el Play-In, en la postemporada, una sola vez');
const P = F.parsear(DECL, { zonasValidas: ['oro'], participan: { 'postemporada-clausura': ['oro'] } });
const FASES = P.fases;
check('la declaración se lee sin errores (y la tabla con espacios se normaliza)', !P.errores.length, P.errores);
check('la tabla «CLAUSURA | REGULAR» queda como CLAUSURA|REGULAR',
  FASES[1].cruces[1].b.tabla === 'CLAUSURA|REGULAR', FASES[1].cruces[1].b);
['PLAY IN', 'PLAY-IN', 'PLAYIN', 'Play In'].forEach((v) => {
  check('«' + v + ' - CLAUSURA» es una carpeta al revés', F.invertido(v, 'CLAUSURA'));
});
check('una regular derecha NO es al revés', !F.invertido('CLAUSURA', 'REGULAR'));
check('el tramo PLAY IN|CLAUSURA calza con el Play-In declarado', F.calza(FASES[0], 'CLAUSURA', 'PLAY IN'));
check('y NO con los cuartos del Clausura', !F.calza(FASES[1], 'CLAUSURA', 'PLAY IN'));
check('se juega por llave', F.tipoDe('CLAUSURA', FASES, 'PLAY IN') === 'eliminacion');
check('sin declaración también (la instancia la reconoce el motor)', F.tipoDe('CLAUSURA', [], 'PLAY IN') === 'eliminacion');

const HOJAS = libro(CL_REG.concat(PLAYIN));
const tramos = SGADD.combinacionesTorneoFase(HOJAS);
const sel = F.enriquecerTramos(tramos, FASES);
const playin = sel.filter(t => t.declarada === 'playin-clausura');
check('UNA sola opción del Play-In', playin.length === 1, sel.map(t => t.id + ' «' + t.label + '»'));
check('es el tramo con datos y con el nombre del reglamento', playin[0] && playin[0].id === 'PLAY IN|CLAUSURA'
  && !playin[0].llave && playin[0].label === 'Play-In - CLAUSURA', playin[0]);
check('va en Postemporada, no en Fase regular', playin[0] && F.grupoDeTramo(playin[0], FASES) === 'post');
check('la regular del Clausura sigue en Fase regular', F.grupoDeTramo(sel.find(t => t.id === 'CLAUSURA|REGULAR'), FASES) === 'regular');
check('los cuartos (sin jugar) se ofrecen como fase por jugar', sel.some(t => t.declarada === 'cuartos-clausura' && t.llave));

/* =====================================================================
   2 · LA LLAVE Y EL CAMINO
   ===================================================================== */
seccion('2 · la llave con la tabla del Clausura y el camino de cada equipo');
const tablaCl = { tramo: 'CLAUSURA|REGULAR', cerrada: true, filas: [
  { clave: OLI, nombre: OLI, puesto: 1 }, { clave: 'LEANDRO N ALEM', nombre: ALE, puesto: 2 },
  { clave: NAP, nombre: NAP, puesto: 3 }, { clave: EST, nombre: EST, puesto: 4 }] };
const k = s => SGADD.claveEquipo(s);
const jug = (f, l, v, pl, pv) => ({ fecha: f, local: l, visitante: v, localClave: k(l), visitanteClave: k(v),
  jugado: pl != null, ptsLocal: pl, ptsVisitante: pv });
const ctx = { tablas: {}, tablasPorTramo: { 'CLAUSURA|REGULAR': { oro: tablaCl, '*': tablaCl } }, tablaDeFase: {},
  partidosPorFase: { 'playin-clausura': [jug('2026-11-05', NAP, EST, 70, 60)], 'cuartos-clausura': [] },
  zonaDeEquipo: {}, nombresZona: { oro: 'Primera Oro' } };
const LL = F.llave(FASES, ctx);
check('P1 se define con lo jugado: gana NAPOSTA', LL['playin-clausura'].cruces[0].serie
  && LL['playin-clausura'].cruces[0].serie.ganador === NAP);
check('cada lado lleva su PUESTO en la tabla del Clausura', LL['playin-clausura'].cruces[0].a.puesto === 3
  && LL['playin-clausura'].cruces[0].b.puesto === 4);
const C1 = LL['cuartos-clausura'].cruces[0];
check('C1: el ganador de P1 (NAPOSTA) ya está, con su puesto', C1.a.clave === NAP && C1.a.puesto === 3, C1.a);
check('C1: el otro lado sale de P2, con los dos candidatos', C1.b.estado === 'pendiente'
  && C1.b.refLabel === 'Partido 2' && JSON.stringify(C1.b.opciones) === JSON.stringify([OLI, ALE]), C1.b);
check('C2: el perdedor de P1 es ESTRELLA, contra el 2° del Clausura', LL['cuartos-clausura'].cruces[1].a.clave === EST
  && LL['cuartos-clausura'].cruces[1].b.clave === 'LEANDRO N ALEM');

const camNap = F.camino(LL, FASES, c => c === NAP);
check('el camino de NAPOSTA: viene de ganar P1', camNap.anterior && camNap.anterior.cruce.id === 'P1'
  && F.resultadoDe(camNap.anterior) === 'Ganó 70–60 a ' + EST, camNap.anterior && F.resultadoDe(camNap.anterior));
check('y lo que viene es C1, contra «Ganador de Partido 2»', camNap.actual && camNap.actual.cruce.id === 'C1'
  && !camNap.actual.rival.clave);
const camEst = F.camino(LL, FASES, c => c === EST);
check('ESTRELLA perdió P1 pero sigue: el perdedor de P1 juega C2', camEst.actual && camEst.actual.cruce.id === 'C2'
  && !camEst.eliminado);
const camAle = F.camino(LL, FASES, c => c === 'LEANDRO N ALEM');
check('ALEM: lo que viene es P2 (todavía no se jugó), sin un cruce anterior', camAle.actual && camAle.actual.cruce.id === 'P2'
  && !camAle.anterior);
const sinP2 = F.llave([FASES[0]], Object.assign({}, ctx, { partidosPorFase: { 'playin-clausura': [
  jug('2026-11-05', NAP, EST, 70, 60), jug('2026-11-06', OLI, ALE, 80, 70)] } }));
const camAle2 = F.camino(sinP2, [FASES[0]], c => c === 'LEANDRO N ALEM');
check('si ALEM pierde P2 y no hay otra fase, quedó afuera', camAle2.eliminado && !camAle2.actual, camAle2);
check('un equipo que no está en la llave no tiene camino', !F.camino(LL, FASES, c => c === 'PUEYRREDON').actual);

/* =====================================================================
   3 · LA TARJETA SIMPLE
   ===================================================================== */
seccion('3 · la tarjeta: escudo · nombre · puesto, y nada más');
const sinTitles = h => h.replace(/title="[^"]*"/g, '');
const cartaP1 = F.cruceHTML(LL['playin-clausura'].cruces[0], {});
check('el puesto va como pastilla «3°»', /class="fase-puesto"[^>]*>3°</.test(cartaP1), cartaP1);
check('la etiqueta larga NO ocupa la tarjeta (solo va en el title)', !/Primera Oro/.test(sinTitles(cartaP1))
  && /title="[^"]*Primera Oro/.test(cartaP1));
check('el marcador va en el orden de la tarjeta (arriba–abajo)', /05\/11<\/span> <b class="font-mono">70–60</, cartaP1);
check('en un torneo de una zona no dice «Intrazonal»', !/Intrazonal/.test(cartaP1));
const cartaC1 = F.cruceHTML(C1, {});
check('el lado pendiente dice de dónde sale y entre quiénes', /Ganador de Partido 2/.test(cartaC1)
  && new RegExp(OLI + ' o ' + ALE.replace('.', '\\.')).test(cartaC1), cartaC1);
const prov = F.cruceHTML(F.llave(FASES, Object.assign({}, ctx, { tablasPorTramo: { 'CLAUSURA|REGULAR': {
  '*': Object.assign({}, tablaCl, { cerrada: false }) } }, partidosPorFase: {} }))['playin-clausura'].cruces[1], {});
check('un lado proyectado lleva «~» en el puesto', /fase-puesto fase-puesto-proy[^>]*>~1°</.test(prov), prov);
const cam = F.caminoHTML(camNap, {});
check('la card del camino dice lo que viene y de dónde viene', /Lo que viene · Cuartos de Final - CLAUSURA · Cuartos 1/.test(cam)
  && /Viene de/.test(cam) && /Ganó 70–60 a ESTRELLA/.test(cam), cam);

/* =====================================================================
   4 · LA APP REAL
   ===================================================================== */
seccion('4 · la app real: selector, Clasificación y Fixture con el Play-In abierto');
{
  const root = { innerHTML: '' };
  const CAT = 'napostá-primera';
  const vmctx = {
    console, Promise, JSON, Math, Date, Map, Set, WeakMap, Array, Object, String, Number, RegExp, Error, Infinity,
    SGADD: SGADD, SGADD_UI: require('./js/sgadd-ui.js'),
    CLUB: { cfg: {}, estado: { id: 'naposta' } },
    window: { location: { hash: '#clasificacion' } }, location: { hash: '#clasificacion' },
    history: { pushState() {}, replaceState() {} },
    setTimeout: () => 0, clearTimeout() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: (id) => (id === 'view-root' ? root : null), querySelector: () => null,
      querySelectorAll: () => [], getElementsByTagName: () => [] },
    LOGOS: { getUrl: () => null, iniciales: (n) => String(n).slice(0, 2) },
    currentSection: 'clasificacion',
  };
  vmctx.globalThis = vmctx;
  vm.createContext(vmctx);
  ['sgadd-config.js', 'sgadd-app.js', 'sgadd-clasificacion.js', 'sgadd-fixture.js', 'sgadd-fases.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync('./js/' + f, 'utf8'), vmctx, { filename: f });
  });
  const antes = SGADD.CATALOGO.planillas;
  SGADD.CATALOGO.planillas = [{ id: CAT, slug: CAT, label: 'Primera Oro', activo: true, torneoId: 'bahia', zonaId: 'oro',
    equipoPropio: NAP }];
  vm.runInContext('SGADD_FIXTURE.estado.torneo = "bahia"; SGADD_FIXTURE.estado.doc = ' + JSON.stringify({
    id: 'bahia', nombre: 'Bahía Blanca · Primera 2026',
    zonas: { oro: { label: 'Primera Oro', equipos: [OLI, ALE, NAP, EST].map(n => ({ nombre: n })) },
      'postemporada-clausura': { label: 'Postemporada Clausura', interzonal: true, participan: ['oro'], equipos: [] } },
    formato: DECL }) + ';', vmctx);
  const APP = vm.runInContext('SGADD_APP', vmctx);
  APP.estado.planillaId = CAT;
  APP.estado.hojas = HOJAS;
  APP.estado.torneo = 'PLAY IN';
  APP.estado.fase = 'CLAUSURA';
  APP.reindexar();

  const barra = vm.runInContext('SGADD_APP.barra()', vmctx);
  const grupos = {};
  (barra.match(/<optgroup label="[^"]*">[\s\S]*?<\/optgroup>/g) || []).forEach((g) => {
    grupos[/label="([^"]*)"/.exec(g)[1]] = (g.match(/<option[^>]*>[^<]*<\/option>/g) || []).map(o => o.replace(/<[^>]+>/g, ''));
  });
  check('Fase regular NO trae el Play-In', !(grupos['Fase regular'] || []).some(o => /play/i.test(o)), grupos);
  check('Postemporada trae «Play-In - CLAUSURA» una vez', (grupos.Postemporada || []).filter(o => /Play-In/.test(o)).length === 1, grupos);
  check('y ninguna «Play-In … · llave» repetida', !Object.keys(grupos).some(g => grupos[g].some(o => /Play-In.*· llave/.test(o))), grupos);

  const cx = vm.runInContext('SGADD_FASES.contexto()', vmctx);
  check('la llave del Clausura LEE el partido jugado del Play-In', (cx.partidosPorFase['playin-clausura'] || []).length === 1,
    (cx.partidosPorFase['playin-clausura'] || []).length);
  check('y sus puestos salen de la regular del Clausura', cx.tablaDeFase['playin-clausura'] === 'CLAUSURA|REGULAR', cx.tablaDeFase);

  root.innerHTML = vm.runInContext('buildClasificacion()', vmctx);
  const h = root.innerHTML;
  check('Clasificación pinta la llave, no una tabla de posiciones del Play-In', /Llave y series/.test(h)
    && !/>Tabla de posiciones</.test(h));
  check('la tabla de abajo es la regular de la que salen los puestos', /Tabla de la que salen los puestos · Clausura · Regular/.test(h));
  check('arriba va «Lo que viene» del equipo propio', /data-camino/.test(h) && /Lo que viene · Cuartos de Final - CLAUSURA/.test(h), h.slice(0, 400));

  const fx = vm.runInContext('SGADD_FIXTURE.html()', vmctx);
  check('el Fixture trae los cruces del Play-In arriba', /Play-In - CLAUSURA · cruces y series/.test(fx));
  check('y «Lo que viene» aunque la liga no haya publicado la fecha', /data-camino/.test(fx) && /Ganador de Partido 2/.test(fx));
  check('sin la contradicción «Sin próximo partido declarado»', !/Sin próximo partido declarado/.test(fx));
  check('las otras fases se nombran bien (no «CLAUSURA» suelto)', !/<b>CLAUSURA<\/b>/.test(fx));
  SGADD.CATALOGO.planillas = antes;
}

console.log('\n' + (mal ? '✗ HAY FALLAS · ' : '✓ TODO OK · ') + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
