/* =====================================================================
   SGADD · COMPARATIVA · el motor de ciclos

       node test-comparativa.js

   Lo que estos tests protegen, por encima de todo: que TENDENCIA y NIVEL
   sigan siendo dos ejes distintos. El primero mide contra el corte
   anterior y el segundo contra la liga; colapsarlos en un solo semáforo
   pierde la mitad de la lectura y es el error más fácil de cometer acá.
   ===================================================================== */
'use strict';

const fs = require('fs');
const NL = '\n';
global.SGADD = require('./js/sgadd-core.js');
const SGADD = global.SGADD;
const C = require('./js/sgadd-comparativa.js');

let ok = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); }
};
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));

/* =====================================================================
   LA FIXTURE

   Diez partidos de A contra B. El equipo A MEJORA en los últimos cuatro
   —más triples y más acierto— para que la tendencia tenga algo que
   detectar, y C es un tercer equipo que existe solo para que la liga
   tenga contra qué comparar el nivel.
   ===================================================================== */

function partido(n, eq, o) {
  return Object.assign({
    PARTIDO: 'p' + n, EQUIPO: eq, FASE: 'REGULAR', TORNEO: 'GENERAL',
    FECHA: '2026-05-' + String(n).padStart(2, '0'),
    RESULTADO: 'GANADO', CONDICION: 'LOCAL',
    PTS: 70, PLAYS: 80, POS: 70, MIN: 200,
    TCC: 28, TCI: 62, T2C: 22, T2I: 38, T3C: 6, T3I: 24,
    T1C: 10, T1I: 14, PP: 12, RO: 11, RD: 26, AST: 16, PR: 8, RT: 37,
  }, o);
}

const bde = [];
for (let i = 1; i <= 10; i++) {
  const mejor = i > 6;               // el último ciclo de A es mejor
  bde.push(partido(i, 'A', {
    PTS: mejor ? 85 : 70, TCC: mejor ? 34 : 28, T3C: mejor ? 12 : 6,
    RESULTADO: (i % 3) ? 'GANADO' : 'PERDIDO',
  }));
  bde.push(partido(i, 'B', {
    PTS: 72, PLAYS: 78, TCC: 27, TCI: 60, T3C: 8, T3I: 26, PP: 14, RO: 9, RD: 24,
    RESULTADO: (i % 3) ? 'PERDIDO' : 'GANADO', CONDICION: 'VISITANTE',
  }));
}

const colsE = ['EQUIPO', 'FASE', 'PJ', 'PTS', 'eFG%', 'PPP', 'RO%', 'PePP%', 'RTL%'];
const promE = [
  { EQUIPO: 'A', FASE: 'REGULAR', PJ: 10, PTS: 76, 'eFG%': 0.55, PPP: 0.95, 'RO%': 0.31, 'PePP%': 0.15, 'RTL%': 0.16 },
  { EQUIPO: 'B', FASE: 'REGULAR', PJ: 10, PTS: 72, 'eFG%': 0.51, PPP: 0.92, 'RO%': 0.27, 'PePP%': 0.18, 'RTL%': 0.21 },
  { EQUIPO: 'C', FASE: 'REGULAR', PJ: 10, PTS: 66, 'eFG%': 0.47, PPP: 0.86, 'RO%': 0.22, 'PePP%': 0.20, 'RTL%': 0.13 },
];

const idx = SGADD.construirIndice({
  'Base Datos E': { cols: Object.keys(bde[0]), filas: bde },
  'PROMEDIOS E': { cols: colsE, filas: promE },
}, { fase: 'REGULAR' });

/* =====================================================================
   LOS CORTES
   ===================================================================== */
titulo('LOS CORTES · un ciclo contra el anterior');

const ci = C.ciclos(idx, 'A', 4);
check('se arman los dos ciclos', !!(ci && ci.actual && ci.previo));
check('el actual son los ÚLTIMOS 4', ci.actual.pj === 4, ci.actual.pj);
check('y el previo los 4 de antes', ci.previo.pj === 4, ci.previo.pj);
check('sobre 10 partidos en total', ci.total === 10, ci.total);

/* Los dos ciclos no comparten un solo partido: si se solaparan, el delta
   estaría comparando en parte contra sí mismo. */
const idsA = ci.actual.partidos.map(p => p.__id);
const idsB = ci.previo.partidos.map(p => p.__id);
check('los dos cortes NO comparten partidos',
  idsA.every(x => idsB.indexOf(x) === -1), idsA.concat(idsB).join(' '));

/* El corte se agrega sobre TOTALES, igual que el resto del proyecto: el
   eFG% del ciclo no es el promedio de los eFG% de cada noche. */
const efgAct = ci.actual.tiro['eFG%'];
const efgReal = (34 * 4 + 0.5 * 12 * 4) / (62 * 4);
check('las tasas del corte se recalculan sobre totales',
  Math.abs(efgAct - efgReal) < 1e-9, efgAct + ' vs ' + efgReal);

/* Con menos partidos que un ciclo entero, el previo trae lo que hay en vez
   de no existir: comparar 4 contra 3 es peor que 4 contra 4, y muchísimo
   mejor que no comparar. Lo que NO se hace es inventar partidos. */
const ci8 = C.ciclos(idx, 'A', 8);
check('con ventana grande el previo se achica en vez de desaparecer',
  ci8.actual.pj === 8 && ci8.previo.pj === 2, ci8.actual.pj + '/' + (ci8.previo || {}).pj);

const ci20 = C.ciclos(idx, 'A', 20);
check('y si no queda nada anterior, es null',
  ci20.actual.pj === 10 && ci20.previo === null);

check('un equipo sin partidos devuelve null', C.ciclos(idx, 'NOEXISTE', 4) === null);

/* =====================================================================
   LOS DOS EJES
   ===================================================================== */
titulo('TENDENCIA Y NIVEL · dos preguntas, dos columnas');

const r = C.comparar(idx, 'A', ci);
check('la comparación trae los cuatro bloques', r.bloques.length === 4,
  r.bloques.map(b => b.id).join(','));
check('y el nombre del equipo', r.equipo === 'A', r.equipo);

const fila = (k) => {
  let f = null;
  r.bloques.forEach(b => b.filas.forEach(x => { if (x.k === k) f = x; }));
  return f;
};

const efg = fila('eFG%');
check('el eFG% mejoró contra el ciclo anterior',
  efg.tendencia.estado === 'mejora', efg.tendencia.estado);
check('y el delta viaja para poder mostrarlo',
  efg.tendencia.delta > 0 && efg.tendencia.rel > 0);

/* EL SIGNO SE CORRIGE POR LA DIRECCIÓN DE LA MÉTRICA. En pérdidas por
   play, bajar es mejorar: pintarlo de rojo por "bajó" es el mismo error
   que el proyecto ya evita en los rankings invertidos. */
const mPP = { k: 'PePP%', dir: -1 };
check('bajar las pérdidas cuenta como MEJORA',
  C.tendencia(0.12, 0.18, mPP).estado === 'mejora');
check('y subirlas como que empeora',
  C.tendencia(0.20, 0.14, mPP).estado === 'empeora');
const mPTS = { k: 'PTS', dir: 1 };
check('mientras que en puntos es al revés',
  C.tendencia(80, 70, mPTS).estado === 'mejora'
  && C.tendencia(60, 70, mPTS).estado === 'empeora');

/* Un movimiento chico es ruido de muestra, no un cambio. */
check('un cambio por debajo del umbral es ESTABLE',
  C.tendencia(100, 101, mPTS).estado === 'estable',
  JSON.stringify(C.tendencia(100, 101, mPTS)));
check('sin corte anterior no hay tendencia, y lo dice',
  C.tendencia(100, null, mPTS).estado === 'sin-dato');

/* EL NIVEL ES OTRA COSA. Mide contra la liga, no contra el corte
   anterior, y por eso puede decir "bajo" mientras la tendencia dice
   "mejora": un equipo puede venir subiendo y seguir último. */
const nivelBajo = C.nivel(idx, { k: 'eFG%', fuente: 'tiro', dir: 1 }, 0.30);
const nivelAlto = C.nivel(idx, { k: 'eFG%', fuente: 'tiro', dir: 1 }, 0.90);
check('el nivel reconoce un valor pobre', nivelBajo.estado === 'bajo', JSON.stringify(nivelBajo));
check('y uno de élite', nivelAlto.estado === 'alto', JSON.stringify(nivelAlto));
check('con su puesto sobre el total de la liga',
  nivelAlto.puesto === 1 && nivelAlto.de === 3, nivelAlto.puesto + '/' + nivelAlto.de);
check('y la mediana de la liga, para mostrarla al lado',
  Math.abs(nivelBajo.mediana - 0.51) < 1e-9, nivelBajo.mediana);

/* En una métrica invertida, el mejor es el más BAJO. */
const nivelInv = C.nivel(idx, { k: 'PePP%', fuente: 'factores', dir: -1 }, 0.15);
check('en una métrica invertida el puesto 1 es el valor más bajo',
  nivelInv.puesto === 1, JSON.stringify(nivelInv));

/* LOS DOS EJES SON INDEPENDIENTES, y esta es la propiedad del módulo. */
check('tendencia y nivel se calculan por separado',
  typeof C.tendencia === 'function' && typeof C.nivel === 'function');
const src = fs.readFileSync('./js/sgadd-comparativa.js', 'utf8');
check('y el módulo lo declara por escrito',
  /TENDENCIA\s+=\s+el delta contra el ciclo ANTERIOR/.test(src)
  && /NIVEL\s+=\s+dónde está parado contra la LIGA/.test(src));

/* =====================================================================
   QUÉ CAMBIÓ
   ===================================================================== */
titulo('LAS MÉTRICAS CRÍTICAS · lo que más se movió');

check('se destacan las que se movieron', r.criticas.length > 0, r.criticas.length);
check('ninguna estable entra a la lista',
  r.criticas.every(f => f.tendencia.estado === 'mejora' || f.tendencia.estado === 'empeora'));

/* SE ORDENA POR EL MOVIMIENTO RELATIVO. Con el absoluto ganarían siempre
   las métricas de escala grande —un rating se mueve en decenas y un
   porcentaje en centésimas— y la lista sería siempre la misma. */
const bloquesFalsos = [{ filas: [
  { k: 'RTNG OFF', tendencia: { estado: 'empeora', rel: -0.05, delta: -5 } },
  { k: 'T3%', tendencia: { estado: 'empeora', rel: -0.40, delta: -0.12 } },
] }];
check('ordena por el cambio relativo, no por el absoluto',
  C.destacadas(bloquesFalsos)[0].k === 'T3%',
  C.destacadas(bloquesFalsos).map(f => f.k).join(','));

/* Y LAS CAÍDAS PRIMERO: el informe existe para encontrarlas. */
const mezcla = [{ filas: [
  { k: 'SUBE', tendencia: { estado: 'mejora', rel: 0.90, delta: 1 } },
  { k: 'BAJA', tendencia: { estado: 'empeora', rel: -0.10, delta: -1 } },
] }];
check('una caída chica va antes que una mejora grande',
  C.destacadas(mezcla)[0].k === 'BAJA',
  C.destacadas(mezcla).map(f => f.k).join(','));

/* =====================================================================
   POR FECHAS
   ===================================================================== */
titulo('POR RANGOS DE FECHA · el corte que elige el DT');

const pa = C.enRango(idx, 'A', '2026-05-07', '2026-05-10');
const pb = C.enRango(idx, 'A', '2026-05-01', '2026-05-04');
check('el rango trae solo los partidos de esas fechas', pa.length === 4, pa.length);
check('y el otro los suyos', pb.length === 4, pb.length);
check('los dos rangos no se pisan',
  pa.every(x => pb.indexOf(x) === -1));
check('un rango vacío devuelve una lista vacía, no null',
  C.enRango(idx, 'A', '2027-01-01', '2027-02-01').length === 0);

/* UN PARTIDO SIN FECHA NO ENTRA A NINGÚN RANGO. Es la misma regla del
   calendario (punto 18): atribuirlo por las malas contamina los DOS
   cortes y no se nota. Se cuentan aparte para poder avisarlo. */
const bdeSF = bde.slice();
bdeSF.push(partido(11, 'A', { FECHA: '' }));
bdeSF.push(partido(11, 'B', { FECHA: '', CONDICION: 'VISITANTE', RESULTADO: 'PERDIDO' }));
const idxSF = SGADD.construirIndice({
  'Base Datos E': { cols: Object.keys(bde[0]), filas: bdeSF },
  'PROMEDIOS E': { cols: colsE, filas: promE },
}, { fase: 'REGULAR' });
check('un partido sin fecha queda afuera del rango',
  C.enRango(idxSF, 'A', '2026-01-01', '2027-01-01').length === 10,
  C.enRango(idxSF, 'A', '2026-01-01', '2027-01-01').length);
check('y se cuenta aparte, para poder avisarlo',
  C.sinFecha(idxSF, 'A') === 1, C.sinFecha(idxSF, 'A'));
/* Pero SÍ entra a un ciclo: ahí el corte es por posición, no por fecha. */
check('aunque sí entra a un ciclo, que corta por posición',
  C.ciclos(idxSF, 'A', 4).total === 11, C.ciclos(idxSF, 'A', 4).total);

/* =====================================================================
   JUGADORES
   ===================================================================== */
titulo('JUGADORES · cara a cara, sin ordenar de mejor a peor');

const j = (n, o) => Object.assign({
  NOMBRES: n, EQUIPO: 'A', __clave: n.toLowerCase(),
  PJ: 10, MIN: 25, PTS: 12, PLAYS: 12, PPP: 1.0, 'USG%': 0.20,
  'eFG%': 0.50, 'T3%': 0.33, 'T2%': 0.50, 'T1%': 0.70,
  RO: 2, RD: 4, 'AST-PP': 1.2, 'PePP%': 0.14,
}, o);

const cmp = C.compararJugadores(idx, [
  j('TIRADOR, FINO', { 'T3%': 0.42, 'eFG%': 0.60, 'PePP%': 0.10 }),
  j('INTERNO, DURO', { 'T3%': 0.20, RO: 5, RD: 8, 'PePP%': 0.19 }),
]);
check('compara dos jugadores', !!cmp && cmp.jugadores.length === 2);
check('con una fila por métrica', cmp.filas.length === C.METRICAS_JUGADOR.length);

const f3 = cmp.filas.find(f => f.k === 'T3%');
check('en triples gana el que más mete', f3.mejor === 0, f3.mejor);

/* LA DIRECCIÓN MANDA: en pérdidas por play gana el más BAJO. Es el mismo
   criterio que en los ciclos y el que hace que el ◆ signifique siempre lo
   mismo: "el mejor", no "el número más grande". */
const fpp = cmp.filas.find(f => f.k === 'PePP%');
check('en pérdidas por play gana el MÁS BAJO', fpp.mejor === 0, fpp.mejor);

/* RT se deriva de RO+RD cuando la planilla no lo trae, con el mismo
   criterio que el resto del proyecto. */
const frt = cmp.filas.find(f => f.k === 'RT');
check('RT se deriva de RO+RD si falta',
  frt.valores[0] === 6 && frt.valores[1] === 13, frt.valores.join(','));

/* CON EMPATE NO GANA NADIE: marcar uno al azar diría algo que el dato no
   dice. */
const emp = C.compararJugadores(idx, [j('UNO'), j('OTRO')]);
check('con empate no se marca a ninguno',
  emp.filas.every(f => f.mejor === -1),
  emp.filas.filter(f => f.mejor !== -1).map(f => f.k).join(','));

check('con un solo jugador no hay comparación', C.compararJugadores(idx, [j('SOLO')]) === null);

/* --- el motor de recomendación --- */
check('dice en qué se separan', cmp.recomendacion.clave.length > 0);
/* PJ y MIN describen la MUESTRA, no el juego: separan siempre y no dicen
   nada sobre en qué se diferencian como jugadores. */
check('y NO lista minutos ni partidos',
  cmp.recomendacion.clave.every(c => c.k !== 'MIN' && c.k !== 'PJ'),
  cmp.recomendacion.clave.map(c => c.k).join(','));
/* Se ordena por separación relativa: la primera es la que más los parte. */
check('la primera es la de mayor separación',
  cmp.recomendacion.clave[0].separacion >= cmp.recomendacion.clave[cmp.recomendacion.clave.length - 1].separacion);

/* LA MUESTRA MANDA SOBRE TODO LO DEMÁS. */
const corto = C.compararJugadores(idx, [j('UNO', { PJ: 2 }), j('OTRO', { PJ: 9, PTS: 20 })]);
check('avisa cuando alguno tiene muestra corta',
  corto.recomendacion.muestraCorta === true && corto.recomendacion.pjMinimo === 2);
check('y no avisa cuando los dos tienen muestra',
  cmp.recomendacion.muestraCorta === false);

/* =====================================================================
   EL CATÁLOGO
   ===================================================================== */
titulo('EL CATÁLOGO DE MÉTRICAS');

const ms = C.metricas();
check('todas declaran su dirección',
  ms.every(m => m.dir === 1 || m.dir === -1),
  ms.filter(m => m.dir !== 1 && m.dir !== -1).map(m => m.k).join(','));
check('y de qué parte del corte se leen',
  ms.every(m => ['ritmo', 'tiro', 'factores'].indexOf(m.fuente) !== -1),
  ms.filter(m => ['ritmo', 'tiro', 'factores'].indexOf(m.fuente) === -1).map(m => m.k).join(','));
/* Las invertidas son exactamente las que uno espera: recibir menos,
   perder menos, que el rival acierte menos. */
const invertidas = ms.filter(m => m.dir === -1).map(m => m.k).sort();
check('las invertidas son las que hay que MINIMIZAR',
  invertidas.join(',') === 'PePP%,RO Opp%,RTNG DEF,eFG Opp%', invertidas.join(','));

/* Y TODAS TIENEN DEFINICIÓN EN EL GLOSARIO: la tabla las marca con
   `data-metrica`, así que una sin entrada promete un tooltip que no
   aparece. */
const GL = require('./js/sgadd-glosario.js');
const sinDef = ms.map(m => m.k).concat(C.METRICAS_JUGADOR.map(m => m.k))
  .filter(k => !GL.buscar(k));
check('todas tienen definición en el glosario', sinDef.length === 0, sinDef.join(', '));

/* =====================================================================
   EL CABLEADO
   ===================================================================== */
titulo('EL CABLEADO · sección interna, y una sola comparativa');

const AUTH = require('./js/sgadd-auth.js');
check('comparativa está en el vocabulario de secciones',
  SGADD.SECCIONES.indexOf('comparativa') !== -1);
check('es solo para ADMIN',
  AUTH.puedoAcceder('comparativa', { email: 'freytesgn@gmail.com' }).ok
  && !AUTH.puedoAcceder('comparativa', { email: 'dt@club.com', plan: 'ORO', equipoAsignado: 'X' }).ok);
check('y el motivo es SOLO_ADMIN, no falta de plan',
  AUTH.puedoAcceder('comparativa', { email: 'dt@club.com', plan: 'ORO', equipoAsignado: 'X' }).motivo === 'SOLO_ADMIN');

const idxHtml = fs.readFileSync('./index.html', 'utf8');
/* Sumar una sección toca DOS listas: el vocabulario del núcleo y
   `VALID_SECTIONS` del index. Con la segunda sin actualizar, el ítem del
   menú se dibuja y no navega — sin ningún síntoma. */
check('y también está en VALID_SECTIONS del index',
  /VALID_SECTIONS = \[[^\]]*'comparativa'/.test(idxHtml));
check('el router la resuelve', /case 'comparativa':/.test(idxHtml));
check('con su ítem en el menú', /data-nav="comparativa"/.test(idxHtml));

/* UNA SOLA COMPARATIVA EN LA APP. El tab legacy de Scouting se mudó acá:
   dos comparadores distintos era pedirle al DT que eligiera entre dos
   caminos al mismo lugar. */
check('Scouting ya no ofrece "Comparar Jugadores"',
  !/label: 'Comparar Jugadores'/.test(idxHtml));
check('y quedó como una sola cosa, el informe pre-partido',
  /SCOUTING ES UNA SOLA COSA/.test(idxHtml));

const ui = fs.readFileSync('./js/sgadd-comparativaui.js', 'utf8');
/* El motor es PURO: la UI es la única que toca el DOM. */
check('el motor no toca document', !/document\./.test(src));
check('y la UI sí, que es su trabajo', /document\.getElementById/.test(ui));
/* Los tonos salen del vocabulario cerrado del punto 15, no de hex sueltos:
   un hex no sobrevive al aplanado del papel ni garantiza contraste. */
check('los tonos son los de zona, no hex sueltos',
  /zona-exito/.test(ui) && /zona-peligro/.test(ui)
  && !/color:\s*#[0-9a-fA-F]{6}/.test(ui));
/* Ningún estado se comunica SOLO con color (punto 14). */
check('la tendencia lleva flecha además de color',
  /FLECHA = \{ mejora: '▲'/.test(ui));
/* Cada sigla se marca para el tooltip del glosario. */
check('las métricas se marcan con data-metrica', /data-metrica="\$\{esc\(f\.k\)\}"/.test(ui));

console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
  '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
