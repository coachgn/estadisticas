/* test-ciclos.js · el informe de ciclo de 4 partidos (js/sgadd-ciclos.js).
   1-5  un paquete sintético con los números calculados A MANO
   6    la ingesta REAL (LAB Norte): lo que emite ciclos.js entra a armarCiclo
        sin romper ninguna invariante. Si la carpeta no está, lo dice. */
const fs = require('fs');
const C = require('./js/sgadd-ciclos.js');
const CANCHA = require('./js/sgadd-cancha.js');

let pasan = 0, fallan = 0;
const ok = (c, m, d) => { if (c) pasan++; else { fallan++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };
const sec = (t) => console.log('\n' + t);

const z0 = () => CANCHA.ZONAS.map(() => [0, 0]);
function partido(i, final, o) {
  o = o || {};
  const zf = z0(), zc = z0();
  if (o.z13) zc[12] = o.z13;          // [intentos, convertidos] en contra, Z13
  zf[0] = [40, 20];                   // 40 tiros a favor: lo mismo que suman los cuatro cuartos
  return {
    id: 'P' + i, fecha: '2026-10-' + String(10 + i).padStart(2, '0'), rival: 'R' + i,
    condicion: i % 2 ? 'LOCAL' : 'VISITANTE', final,
    parciales: [[20, 20], [20, 20], [10, 20], [final[0] - 50, final[1] - 60]],
    trans: { propio: {}, rival: o.trans || { RD: [4, 2, 6, 1] } },
    cuartos: { favor: [[10, 5, 12, 11], [10, 5, 12, 11], [10, 3, 8, 11], [10, 5, 12, 11]], contra: [[10, 5, 12, 10], [10, 5, 12, 10], [10, 6, 14, 10], [10, 5, 12, 10]] },
    zonas: { favor: zf, contra: zc },
    causas: { perd: o.perd || {}, fall: o.fall || { '2P': [1, 2], '3P': [0, 0] }, nRD: 1, nROBO: o.nROBO || 0 },
  };
}
const paq = {
  equipo: 'TEST', etiqueta: 'LAB',
  liga: {
    zonas: CANCHA.ZONAS.map(z => ({ zona: z, i: 100, c: 40, ppt: z === 'Z13' ? 1.0 : 1.1 })),
    ciclos: { lados: 20, trans: { RD: [100, 50, 100, 10], ROBO: [40, 30, 60, 5], SAQUE: [0, 0, 0, 0], MUERTA: [0, 0, 0, 0], PERIODO: [0, 0, 0, 0] } },
  },
  partidos: { excluidos: [{ fecha: '2026-10-12', rival: 'X', motivo: 'marcador distinto' }], parciales: [] },
  partidosPbp: [],
  ciclos: { version: 1, partidos: [] },
};
for (let i = 1; i <= 6; i++) {
  paq.ciclos.partidos.push(partido(i, i % 2 ? [70, 80] : [80, 70],
    i <= 4 ? { z13: [10, 5], perd: { 'A, B': [1, 2] }, nROBO: 1, trans: { RD: [4, 2, 6, 1], ROBO: [2, 2, 4, 0] } } : {}));
}
const copia = (o) => JSON.parse(JSON.stringify(o));

sec('1 · ventanas');
{
  const v = C.ventanas(paq);
  ok(v.length === 2 && v[0].numero === 0 && v[0].cerrado && v[0].partidos === 4, 'el Ciclo 0 son los primeros 4 y está cerrado');
  ok(v[1].numero === 1 && !v[1].cerrado && v[1].partidos === 2, 'el Ciclo 1 tiene 2 y NO está cerrado');
  ok(v[0].desde === '2026-10-11' && v[0].hasta === '2026-10-14', 'las fechas del ciclo salen de sus partidos');
  ok(C.ventanas(paq, 3).length === 2, 'la ventana es un parámetro');
  ok(C.ventanas({}).length === 0, 'sin bloque ciclos no hay ventanas');
  const desorden = copia(paq); desorden.ciclos.partidos.reverse();
  ok(C.ventanas(desorden)[0].ids.join() === 'P1,P2,P3,P4', 'ordena por fecha aunque lleguen al revés');
}

sec('2 · resultados');
{
  const c = C.armarCiclo(paq, 0);
  ok(c.resultados.record.g === 2 && c.resultados.record.p === 2, 'récord 2-2 (a mano: P2 y P4 ganados)');
  ok(c.resultados.puntos.favor === 300 && c.resultados.puntos.contra === 300, 'puntos a favor y en contra: 300 y 300');
  ok(c.resultados.puntos.favorPP === 75, 'promedio 75 por partido');
  ok(C.armarCiclo(paq, 9) === null && C.armarCiclo(paq, -1) === null, 'un ciclo que no existe da null');
  ok(C.armarCiclo(paq, 1).meta.cerrado === false, 'el ciclo abierto se marca');
}

sec('3 · transición del rival contra la liga');
{
  const t = C.armarCiclo(paq, 0).transicion;
  // RD: 4 partidos × 6 pts = 24 → 6,00 por partido; liga 100 pts / 20 lados = 5,00 → exceso +1,00
  ok(t.porOrigen.RD.pts === 24 && t.porOrigen.RD.ptsPP === 6, 'RD: 24 puntos, 6,00 por partido');
  ok(t.porOrigen.RD.liga.ptsPP === 5 && t.porOrigen.RD.exceso === 1, 'RD: la liga rinde 5,00 → exceso +1,00');
  // ROBO: 4 × 4 = 16 → 4,00; liga 60/20 = 3,00 → +1,00. Daño: 1/(1+1) = 50 % cada uno
  ok(t.porOrigen.ROBO.exceso === 1 && t.porOrigen.RD.parteDelDanio === 50 && t.porOrigen.ROBO.parteDelDanio === 50, 'el daño se reparte 50/50 entre RD y ROBO');
  ok(t.ptsPP === 10, 'transición total 10,00 puntos por partido');
  const sin = copia(paq); delete sin.liga.ciclos;
  const t2 = C.armarCiclo(sin, 0).transicion;
  ok(t2.sinVara && t2.porOrigen.RD.exceso === undefined, 'sin vara de liga no se compara, ni se inventa');
}

sec('4 · causas, cuartos y zonas');
{
  const c = C.armarCiclo(paq, 0);
  ok(c.causas.jugadores[0].nombre === 'A, B' && c.causas.jugadores[0].perdidas === 4 && c.causas.jugadores[0].puntosRival === 8, 'las pérdidas por jugador se suman');
  ok(c.causas.nROBO === 4 && c.causas.falladosPrevios.dobles.n === 4 && c.causas.parteDeDobles === 100, 'causas: 4 robos y los errados previos son todos dobles');
  const q3 = c.cuartos[2];
  ok(q3.favor.pts === 32 && q3.favor.esperados === 44 && q3.favor.dif === -12, 'Q3 a favor: 32 puntos contra 44 esperados (4 × 8 y 4 × 11)');
  ok(q3.parcial.favor === 40 && q3.parcial.contra === 80 && q3.parcial.dif === -40, 'Q3 parcial 40-80');
  // Z13 en contra: 40 tiros, 20 convertidos × 3 = 60 pts; liga 1,00 → 60 − 40 = +20
  const z13 = c.zonas.contra.find(z => z.zona === 'Z13');
  ok(z13.i === 40 && z13.pts === 60 && z13.puntosDeMas === 20, 'Z13: 40 tiros, 60 puntos, +20 sobre la liga');
  ok(z13.pptAjustado === Math.round(((60 + 20 * 1.0) / 60) * 100) / 100, 'el PPT se ajusta por muestra (K = 20)');
  ok(c.zonas.fugas[0].zona === 'Z13', 'la mayor fuga es Z13');
  ok(c.resaltar.length >= 1 && c.resaltar[0].id === 'Z13' && c.resaltar[0].punteado === false, 'se propone resaltar Z13, con muestra suficiente');
  ok(CANCHA.normalizarResaltes(c.resaltar).length === c.resaltar.length, 'lo que propone lo entiende SGADD_CANCHA');
  const chico = copia(paq);
  chico.ciclos.partidos.forEach((p) => { p.zonas.contra[12] = [2, 1]; });
  ok(C.armarCiclo(chico, 0).zonas.contra.find(z => z.zona === 'Z13').muestraChica, 'con pocos tiros la zona es de muestra chica');
}

sec('5 · mapa, auditoría y comparación');
{
  const ps = copia(paq);
  ps.partidosPbp = [{ id: 'P3', tiros: { favor: [[75, 20, 1, 0]], contra: [[40, 30, 0, 3]] } }, { id: 'P4', tiros: { favor: [[70, 25, 0, 0]], contra: [] } }];
  const c = C.armarCiclo(ps, 0);
  ok(c.mapa.favor.length === 2 && c.mapa.contra.length === 1 && c.mapa.conPuntos === 2 && c.mapa.de === 4 && !c.mapa.completo, 'el mapa junta los tiros de los partidos que el paquete conserva');
  const a = C.auditar(c, ps);
  ok(a.apto, 'un ciclo cerrado y coherente es apto', a.items.filter(i => i.nivel === 'error'));
  ok(a.items.some(i => i.id === 'mapa' && i.nivel === 'aviso'), 'avisa que el mapa tiene 2 de 4 partidos');
  ok(a.items.some(i => i.id === 'partido-excluido'), 'avisa el partido excluido dentro del rango');
  ok(a.items.some(i => i.id === 'sos'), 'dice que no ajusta por SOS');
  const ab = C.auditar(C.armarCiclo(paq, 1), paq);
  ok(!ab.apto && ab.items.some(i => i.id === 'abierto' && i.nivel === 'error'), 'un ciclo abierto NO es apto');
  ok(C.auditar(null).apto === false, 'sin ciclo no es apto');
  const roto = copia(c); roto.zonas.favor[0].i += 5;
  const ar = C.auditar(roto, ps);
  ok(!ar.apto && ar.items.some(i => i.id === 'coherencia'), 'tiros por cuarto distintos de los de las zonas es un error');
  const tol = copia(c); tol.zonas.favor[0].i += 1;
  const at = C.auditar(tol, ps);
  const coh = at.items.find(i => i.id === 'coherencia');
  ok(coh && (coh.nivel === 'aviso' ? at.apto : true), 'un descalce chico de tiros no bloquea: es aviso y sigue apto (si es <= 2 %)', coh);
  const cmp = C.comparar(C.armarCiclo(paq, 0), C.armarCiclo(paq, 1));
  ok(cmp && cmp.filas.length === 6 && cmp.filas.every(f => !('tendencia' in f)), 'comparar da los dos lados, sin tendencia');
  const fz = cmp.filas.find(f => f.id === 'c-Z13');
  ok(fz.a === 1.5 && fz.b === null && fz.diferencia === null, 'Z13 en contra: 1,50 el ciclo 0; el 1 no tiene tiros y no se inventa un valor', fz);
  ok(C.comparar(null, c) === null, 'sin uno de los dos no compara');
}

sec('6 · la ingesta real');
{
  const ING = 'C:/Users/Pc/Documents/motorstats-ingestion/';
  if (!fs.existsSync(ING + 'salida/lab-2026-27-norte/partidos')) {
    console.log('  SALTEADO: no está la carpeta de la ingesta en esta máquina');
  } else {
    const cwd = process.cwd(); process.chdir(ING);
    const { cargarTemporada } = require(ING + 'analizar-pbp.js');
    const AV = require(ING + 'src/pbp/avanzado.js');
    const CI = require(ING + 'src/pbp/ciclos.js');
    const { analisis } = cargarTemporada('salida/lab-2026-27-norte', '');
    process.chdir(cwd);
    const d = analisis.filter(a => a.validacion.ok || a.validacion.okTiros);
    const liga = AV.baseLiga(d);
    const real = {
      equipo: 'JUJUY', liga: { zonas: liga.zonas, ciclos: CI.baseLigaCiclos(d) }, partidos: {}, partidosPbp: [],
      ciclos: CI.resumenCiclos(d, '112674', Object.fromEntries(liga.zonas.map(z => [z.zona, z.ppt]))),
    };
    const n = real.ciclos.partidos.length;
    ok(n >= 1, 'la ingesta emite el dato de cada partido validado (' + n + ')');
    const peso = JSON.stringify(real.ciclos).length / n;
    ok(peso < 1500, 'pesa menos de 1,5 KB por partido (' + Math.round(peso) + ' B)');
    real.ciclos.partidos.forEach((p) => {
      const sp = p.parciales.reduce((t, q) => [t[0] + q[0], t[1] + q[1]], [0, 0]);
      ok(sp[0] === p.final[0] && sp[1] === p.final[1], 'los parciales suman el marcador final · ' + p.fecha, [sp, p.final]);
      const tq = p.cuartos.favor.reduce((t, q) => t + q[0], 0), tz = p.zonas.favor.reduce((t, x) => t + x[0], 0);
      ok(tq === tz, 'los tiros por cuarto y por zona coinciden · ' + p.fecha, [tq, tz]);
      const pq = p.cuartos.favor.reduce((t, q) => t + q[2], 0);
      ok(pq <= p.final[0], 'los puntos de campo no superan el marcador · ' + p.fecha);
    });
    const ciclo = C.armarCiclo(real, 0);
    ok(ciclo && ciclo.meta.partidos === Math.min(4, n), 'armarCiclo funciona con el dato real');
    ok(Number.isFinite(ciclo.transicion.ptsPP) && !ciclo.transicion.sinVara, 'la transición trae la vara de la liga');
    ok(!/NaN|undefined|Infinity/.test(JSON.stringify(ciclo)), 'el ciclo real no trae NaN, undefined ni Infinity');
    const au = C.auditar(ciclo, real);
    ok(Array.isArray(au.items) && au.items.length >= 2, 'la auditoría corre sobre el dato real');
  }
}

sec('7 · plan de intervención: balance, metas y escenarios');
{
  const c = C.armarCiclo(paq, 0), P = C.planIntervencion(c);
  ok(Array.isArray(P.metas) && P.balance && P.escenarios, 'el plan trae metas, balance y escenarios');
  ok(P.metas.every((m, i, a) => i === 0 || a[i - 1].ptsPP >= m.ptsPP), 'las metas van de mayor a menor en pts por partido');
  ok(P.metas.every(m => m.ptsPP >= P.criterio.minPP && m.base && m.cambio && m.meta && (m.lado === 'Ataque' || m.lado === 'Defensa')), 'toda meta trae lado, cambio, base y el piso de peso');
  ok(Math.abs(P.balance.ataque + P.balance.defensa - P.balance.total) < 0.011, 'ataque + defensa = total');
  ok(P.balance.total === 0 || Math.abs(P.balance.pctAtaque + P.balance.pctDefensa - 100) < 0.21, 'los porcentajes cierran en 100');
  ok(Math.abs(P.escenarios.prudente - P.escenarios.teorico * C.SOLAPE_PRUDENTE) < 0.06, 'el prudente es el teórico por el solape declarado');
  ok(P.escenarios.margenPrudente === Math.round((P.escenarios.margenActual + P.escenarios.prudente) * 10) / 10, 'el margen proyectado suma el prudente al de hoy');
  ok(P.escenarios.siguiente === 1, 'proyecta hacia el ciclo siguiente');
  const sinLiga = copia(paq); delete sinLiga.liga;
  const Q = C.planIntervencion(C.armarCiclo(sinLiga, 0));
  ok(Q.metas.every(m => m.tipo === 'perdidas'), 'sin vara de la liga solo queda lo que no la necesita');
  ok(!/NaN|undefined|Infinity/.test(JSON.stringify(P)), 'el plan no trae NaN, undefined ni Infinity');
  ok(C.planIntervencion(null).metas.length === 0, 'sin ciclo no rompe');
}

console.log('\n' + pasan + ' pasan · ' + fallan + ' fallan');
process.exit(fallan ? 1 : 0);
