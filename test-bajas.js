/* test-bajas.js · las bajas del buzón en el Simulador (punto 172).

   Valor sobre reemplazo: las jugadas del ausente pasan a valer lo que
   rinde su reemplazo, sus minutos van a la rotación, el efecto se escala
   por la parte de los partidos que jugó y, con play-by-play, se mezcla con
   su On/Off. Corre sobre la demo (17 equipos) y sobre planteles armados a
   mano para los casos que la demo no tiene. */
const fs = require('fs');
const vm = require('vm');
global.SGADD = require('./js/sgadd-core.js');
const DEMO = require('./js/sgadd-demo.js');
const F = require('./js/sgadd-4factores.js');

let ok = 0, mal = 0;
const titulo = (t) => console.log('\n' + t);
function check(nombre, cond) { if (cond) { ok++; console.log('  ✓ ' + nombre); } else { mal++; console.log('  ✗ ' + nombre); } }
const cerca = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-9 : tol);

const HOJAS = (r => r.hojas || r)(DEMO.rehidratar(JSON.parse(fs.readFileSync('./demo/datos-demo.json', 'utf8'))));
const TRAMO = SGADD.tramoPorDefecto(SGADD.combinacionesTorneoFase(HOJAS));
const IDX = SGADD.construirIndice(HOJAS, { fase: TRAMO.fase, torneo: TRAMO.torneo });
const EQ = IDX.lista();
const masUsado = (clave) => F.plantelDe(IDX, clave).sort((a, b) => b.usg * b.min - a.usg * a.min)[0];

/* Un plantel armado a mano: 9 jugadores, una estrella eficiente. */
function idxSintetico(opc) {
  const o = opc || {};
  const j = (n, min, usg, ppp, pj, extra) => Object.assign({ NOMBRES: n, EQUIPO: 'AZUL', MIN: min, 'USG%': usg, PPP: ppp, PLAYS: usg / 100 * min / 40 * 75, PJ: pj, PR: 1, TC: 0.2, RD: 3 }, extra || {});
  const pl = [
    j('ESTRELLA', 34, 30, 1.20, o.pjEstrella || 20),
    j('B', 30, 20, 0.95, 20), j('C', 28, 18, 0.92, 20), j('D', 26, 16, 0.90, 20), j('E', 24, 15, 0.90, 20),
    j('F', 20, 15, 0.85, 20), j('G', 16, 14, 0.82, 20), j('H', 12, 12, 0.80, 18), j('I', 10, 12, 0.78, 15),
  ];
  const banco = [];
  for (let k = 0; k < 10; k++) banco.push(Object.assign(j('BANCO' + k, 6, 12, 0.80, 10), { EQUIPO: 'OTRO' }));
  const e = { clave: 'AZUL', nombre: 'AZUL', pj: 20, promedios: { PLAYS: 80, RO: 10, PJ: 20 } };
  return { get: (c) => (c === 'AZUL' ? e : null), liga: { minJugador: 15, jugadores: pl.concat(banco), jugadoresPorEquipo: new Map([['AZUL', pl]]) } };
}

titulo('1 · Sin bajas, la proyección es la de siempre');
{
  const L = EQ[0].clave, V = EQ[1].clave;
  const a = F.simularEnfrentamiento(IDX, L, V);
  const b = F.simularEnfrentamiento(IDX, L, V, { bajasLocal: [], bajasVisitante: [] });
  check('mismo margen', a.margen === b.margen);
  check('misma probabilidad', a.confianza === b.confianza);
  check('bajas.aplicadas = false', a.bajas && a.bajas.aplicadas === false);
  check('margen sin y con bajas iguales', a.bajas.margenSinBajas === a.bajas.margenConBajas);
}

titulo('2 · La baja del jugador clave cuesta margen');
{
  /* EL EQUIPO SE ELIGE POR LA PROPIEDAD, NO POR EL NOMBRE. La numeración de
     la demo es aleatoria con semilla fija (2026-11-13): «EQUIPO 5» dejó de
     ser siempre el mismo club. Lo que esta sección necesita es un equipo
     cuyo más usado SÍ le cuesta (ORTG y Net negativos). */
  const costoDe = (e) => { const t = masUsado(e.clave); return t ? F.impactoBajas(IDX, e.clave, [{ nombre: t.nombre }]) : null; };
  const eq = EQ.find(e => { const i = costoDe(e); return i && i.ok && i.ortg < 0 && i.net < 0 && i.net > -8; }) || EQ[3];
  const rival = EQ.find(e => e.clave !== eq.clave);
  const top = masUsado(eq.clave);
  const imp = F.impactoBajas(IDX, eq.clave, [{ nombre: top.nombre }]);
  check('impacto calculado', imp.ok);
  check('su ataque baja (ORTG negativo)', imp.ortg < 0);
  check('el Net del equipo baja', imp.net < 0);
  check('impacto acotado (menos de 8 por 100 posesiones)', imp.net > -8);
  const sin = F.simularEnfrentamiento(IDX, eq.clave, rival.clave);
  const con = F.simularEnfrentamiento(IDX, eq.clave, rival.clave, { bajasLocal: [{ nombre: top.nombre }] });
  check('con la baja del local, el margen del local baja', con.margen < sin.margen);
  check('bajas.aplicadas = true', con.bajas.aplicadas === true);
  check('el margen por jugador = posesiones × net / 100', cerca(con.bajas.local.jugadores[0].margen, con.paceEsperado * imp.net / 100, 1e-6));
  check('delta del margen ≈ el de su jugador', cerca(con.bajas.delta, con.bajas.local.margen, 1e-6));
  check('la probabilidad del local baja', con.confianza <= sin.confianza);
  const visit = F.simularEnfrentamiento(IDX, rival.clave, eq.clave, { bajasVisitante: [{ nombre: top.nombre }] });
  const visit0 = F.simularEnfrentamiento(IDX, rival.clave, eq.clave);
  check('con la baja del visitante, el margen del local sube', visit.margen > visit0.margen);
  check('el modelo ajustado no se tocó', cerca(F.simularEnfrentamiento(IDX, eq.clave, rival.clave).margen, sin.margen));
}

titulo('3 · Una baja nunca mejora al equipo');
{
  let peor = 0, todos = true, algunoSinCosto = false;
  EQ.forEach(e => {
    const top = masUsado(e.clave);
    if (!top) return;
    const imp = F.impactoBajas(IDX, e.clave, [{ nombre: top.nombre }]);
    if (!imp.ok) return;
    if (imp.net > 1e-9) todos = false;
    if (imp.jugadores[0].sinCosto) algunoSinCosto = true;
    peor = Math.min(peor, imp.net);
  });
  check('en los 17 equipos el net de la baja del más usado es ≤ 0', todos);
  check('el goleador de bajo PPP queda «sin costo», no mejora (EQUIPO 3)', algunoSinCosto);
  check('hay equipos donde la baja cuesta más de 2 por 100', peor < -2);
}

titulo('4 · Los minutos y las jugadas se reparten');
{
  const S = idxSintetico();
  const imp = F.impactoBajas(S, 'AZUL', [{ nombre: 'ESTRELLA' }]);
  check('impacto con una estrella de 1,20 PPP', imp.ok && imp.ortg < -3);
  const extra = imp.reemplazo.reduce((s, x) => s + x.minExtra, 0);
  check('los tres que más absorben se llevan una parte de sus 34 minutos', extra > 10 && extra <= 34 + 1e-6);
  check('absorbe más el banco que el titular de 30', imp.reemplazo[0].nombre !== 'B');
  const reparto = F.repartirUso([{ nombre: 'x', min: 40, usg: 50 }, { nombre: 'y', min: 40, usg: 50 }], 70);
  check('repartirUso: los usos suman las posesiones', cerca(reparto.jugadores.reduce((s, j) => s + j.plays, 0), 70, 1e-6));
}

titulo('5 · Se escala por los partidos que jugó');
{
  const lleno = F.impactoBajas(idxSintetico(), 'AZUL', [{ nombre: 'ESTRELLA' }]);
  const mitad = F.impactoBajas(idxSintetico({ pjEstrella: 10 }), 'AZUL', [{ nombre: 'ESTRELLA' }]);
  check('jugó 20 de 20: escala 1', cerca(lleno.jugadores[0].escala, 1));
  check('jugó 10 de 20: escala 0,5', cerca(mitad.jugadores[0].escala, 0.5));
  check('su ausencia pesa menos si ya faltó la mitad', Math.abs(mitad.net) < Math.abs(lleno.net));
}

titulo('6 · Dos bajas no se suman');
{
  const S = idxSintetico();
  const a = F.impactoBajas(S, 'AZUL', [{ nombre: 'ESTRELLA' }]);
  const b = F.impactoBajas(S, 'AZUL', [{ nombre: 'B' }]);
  const ab = F.impactoBajas(S, 'AZUL', [{ nombre: 'ESTRELLA' }, { nombre: 'B' }]);
  check('las dos juntas cuestan más que una', ab.net < a.net);
  check('pero no es la suma exacta (los reemplazos se pisan)', !cerca(ab.net, a.net + b.net, 1e-6));
  check('cada una conserva su propio número', ab.jugadores.length === 2);
}

titulo('7 · Con play-by-play, el On/Off se mezcla');
{
  const S = idxSintetico();
  const box = F.impactoBajas(S, 'AZUL', [{ nombre: 'ESTRELLA' }]);
  const oo = F.impactoBajas(S, 'AZUL', [{ nombre: 'ESTRELLA', onOff: { dif: 20, minOn: 600, minOff: 400 } }]);
  const chico = F.impactoBajas(S, 'AZUL', [{ nombre: 'ESTRELLA', onOff: { dif: 20, minOn: 30, minOff: 10 } }]);
  check('la fuente dice box + on/off', oo.jugadores[0].fuente === 'box + on/off');
  check('un On/Off de +20 con muestra empuja el costo hacia abajo', oo.net < box.net);
  check('el peso crece con los minutos con y sin él', oo.jugadores[0].pesoOnOff > chico.jugadores[0].pesoOnOff);
  check('con 10 minutos sin él casi no mueve', Math.abs(chico.net - box.net) < Math.abs(oo.net - box.net) / 4);
  const sinDato = F.impactoBajas(S, 'AZUL', [{ nombre: 'ESTRELLA', onOff: { dif: null, minOn: 600, minOff: 400 } }]);
  check('sin On/Off válido queda el box', sinDato.jugadores[0].fuente === 'box' && cerca(sinDato.net, box.net));
}

titulo('8 · Lo que no se puede calcular se dice');
{
  const S = idxSintetico();
  const r = F.impactoBajas(S, 'AZUL', [{ nombre: 'NADIE' }]);
  check('un jugador sin minutos queda en omitidas', !r.ok && r.omitidas.length === 1);
  check('equipo inexistente: sin impacto', !F.impactoBajas(S, 'ROJO', [{ nombre: 'X' }]).ok);
  check('acentos y mayúsculas no importan', F.impactoBajas(S, 'AZUL', [{ nombre: 'estrella' }]).ok);
}

titulo('9 · La pantalla · el badge y las bajas del buzón');
{
  const src = fs.readFileSync('./js/sgadd-4factores.js', 'utf8');
  const estados = { 'ESTRELLA': { id: 'SUSPENSO', emoji: '🟡', label: 'Suspenso / Lesión' } };
  const ctx = { SGADD: global.SGADD, console, module: undefined,
    escapeHtml: (s) => String(s), escapeAttr: (s) => String(s),
    SGADD_BUZON: { estadoDe: (n) => estados[n] || { id: 'ACTIVO' } }, SGADD_PBP: undefined };
  vm.createContext(ctx);
  vm.runInContext(src + '\n;this.SIM = SIMULADOR; this.bajasDe = simuladorBajasDe; this.badge = simuladorBadgeBajas; this.F4 = SGADD_4F;', ctx);
  const S = idxSintetico();
  const lista = ctx.bajasDe(S, 'AZUL');
  check('el buzón marca la baja del SUSPENSO', lista.length === 1 && lista[0].nombre === 'ESTRELLA' && /Suspenso/.test(lista[0].motivo));
  estados.B = { id: 'ALTA', emoji: '🔵', label: 'Alta' };
  check('un ALTA no es baja', ctx.bajasDe(S, 'AZUL').length === 1);
  const r = { local: 'AZUL', visitante: 'OTRO', bajas: { aplicadas: true, local: Object.assign(ctx.F4.impactoBajas(S, 'AZUL', lista), { margen: -2 }), visitante: null, margenSinBajas: 3, margenConBajas: 1 } };
  r.bajas.local.jugadores = r.bajas.local.jugadores.map(j => Object.assign({}, j, { margen: -2.34 }));
  const html = ctx.badge(r, { local: lista, visitante: [] });
  check('el badge dice «Ajustado por baja de ESTRELLA»', /⚠️ Ajustado por baja de <b>ESTRELLA<\/b>/.test(html));
  check('con el margen en puntos', /−2,3 pts<\/span> en margen/.test(html));
  check('y el motivo del buzón', /Suspenso/.test(html));
  check('y a quién van sus minutos', /Sus minutos van a/.test(html));
  check('con el control para apagarlas', /simuladorAlternarBajas/.test(html));
  ctx.SIM.aplicarBajas = false;
  const apagado = ctx.badge(Object.assign({}, r, { bajas: Object.assign({}, r.bajas, { aplicadas: false }) }), { local: lista, visitante: [] });
  check('apagadas: dice que el buzón las marca y no ajusta', /Sin ajuste/.test(apagado) && !/Ajustado por baja/.test(apagado));
  check('sin bajas no hay badge', ctx.badge(r, { local: [], visitante: [] }) === '');
}

console.log('\n' + (mal ? '✗ HAY FALLAS' : '✓ Todo en verde') + ` · ${ok} OK · ${mal} FALLARON`);
if (mal) process.exit(1);
