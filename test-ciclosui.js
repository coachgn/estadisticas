/* La sección Ciclos (Fase 3): lo que se dibuja a partir de un paquete con bloque `ciclos`. */
'use strict';
global.SGADD_CICLOS = require('./js/sgadd-ciclos.js');
global.SGADD_CANCHA = require('./js/sgadd-cancha.js');
const UI = require('./js/sgadd-ciclosui.js');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? ' → ' + d : '')); } };

const z = (f) => Array.from({ length: 14 }, (_, i) => f(i));
const partido = (i, fecha, pf, pc) => ({
  id: 'p' + i, fecha, rival: 'RIVAL ' + i, condicion: i % 2 ? 'LOCAL' : 'VISITANTE', final: [pf, pc],
  parciales: [[20, 18], [15, 20], [10, 12], [pf - 45, pc - 50]],
  trans: { propio: {}, rival: { RD: [3, 2, 5, 0], ROBO: [2, 1, 2, 1] } },
  cuartos: { favor: [[5, 2, 5, 5], [5, 2, 5, 5], [5, 2, 5, 5], [5, 2, 5, 5]], contra: [[5, 3, 7, 5], [5, 2, 5, 5], [5, 2, 5, 5], [5, 2, 5, 5]] },
  zonas: { favor: z(() => [1, 0]).map((x, k) => (k < 4 ? [5, 2] : [0, 0])), contra: z(k => (k === 12 ? [6, 4] : [1, 0])) },
  causas: { perd: { 'PEREZ': [2, 4] }, fall: { '2P': [1, 2], '3P': [0, 0] }, nRD: 1, nROBO: 2 },
});
const total = (l, k) => l.reduce((t, p) => t + p.zonas.favor.reduce((s, x) => s + x[0], 0), 0);
const paq = (n) => ({
  equipo: 'JUJUY', etiqueta: 'LAB',
  ciclos: { version: 1, partidos: Array.from({ length: n }, (_, i) => partido(i, '2026-10-' + String(10 + i).padStart(2, '0'), 80 + i, 78)) },
  liga: { ciclos: { lados: 20, trans: { RD: [40, 18, 40, 0], ROBO: [20, 10, 20, 5] } }, zonas: CICLOS_LIGA() },
  partidosPbp: [],
});
function CICLOS_LIGA() { return global.SGADD_CICLOS.ZONAS.map(zn => ({ zona: zn, ppt: 1.0 })); }
const idx = { liga: {}, lista: () => [{ nombre: 'JUJUY', clave: 'JUJUY' }] };

console.log('Con 5 partidos: un ciclo cerrado y otro abierto');
UI.estado.paq = paq(5); UI.estado.equipo = 'JUJUY'; UI.estado.paqDe = 'JUJUY';
let h = UI.html(idx);
check('muestra Ciclo 0 y Ciclo 1 (abierto)', /Ciclo 0/.test(h) && /Ciclo 1 ◆/.test(h));
check('abre en el último ciclo y lo marca abierto', /ciclo abierto/.test(h) && /1 de 4 partidos/.test(h));
check('la auditoría dice que no es apto', /no apto/.test(h) || !/apto para publicar/.test(h));
UI.estado.ciclo = 0;
h = UI.html(idx);
check('el ciclo cerrado trae sus cuatro partidos', (h.match(/RIVAL \d/g) || []).length >= 4);
check('la cancha vectorial está dentro del bloque interactivo', /data-cancha-bloque/.test(h) && /<svg class="cancha-svg"/.test(h));
check('la zona citada es un botón que enciende su perímetro', /data-cancha-ref="Z13"/.test(h));
check('las fugas nombran Z13 (la zona con más puntos de más)', /Z13/.test(UI.lecturaZonas(SGADD_CICLOS.armarCiclo(paq(5), 0))));
check('la transición compara contra la liga', /vs liga/.test(h));
check('cuarto a cuarto trae los cuatro', ['Q1', 'Q2', 'Q3', 'Q4'].every(q => h.indexOf(q) !== -1));
check('el equipo del nombre sale escapado', !/<script/i.test(h));

console.log('Comparar ciclos');
UI.estado.comparar = 1;
check('comparar con un ciclo abierto da la tabla sin tendencia', /Diferencia/.test(UI.html(idx)) && !/mejora|empeora/i.test(UI.html(idx).split('Contra otro ciclo')[1] || ''));

console.log('Sello e historial');
{
  const p = paq(9);
  UI.estado.paq = p; UI.estado.error = null; UI.estado.ciclo = 0; UI.estado.comparar = null; UI.estado.sellados = [];
  let h2 = UI.html(idx);
  check('un ciclo cerrado sin sellar dice que está sin sellar', /sin sellar/.test(h2));
  check('el historial aparece con dos ciclos cerrados', /Evolución entre ciclos/.test(h2));
  const reg = SGADD_CICLOS.sellar(p, { tipo: 'ciclo', numero: 0, n: 4 }).registro;
  UI.estado.sellados = [reg];
  h2 = UI.html(idx);
  check('un ciclo sellado se muestra como tal, con su huella', /Ciclo sellado/.test(h2) && h2.indexOf(reg.huella) !== -1);
  check('y dice que coincide con el análisis actual', /coincide con el análisis actual/.test(h2));
  check('el historial marca el candado del sellado', /Ciclo 0 🔒/.test(h2));
  const cambiado = paq(9); cambiado.ciclos.partidos[1].final = [99, 70];
  UI.estado.paq = cambiado;
  check('si el dato de origen cambió, lo dice y muestra lo sellado', /el dato de origen cambió/.test(UI.html(idx)));
  UI.estado.sellados = []; UI.estado.paq = p;
}

console.log('El menú no ofrece Ciclos a Bronce ni a Plata');
{
  const html = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
  const f = html.slice(html.indexOf('function aplicarPermisosNav'));
  check('la regla del menú exceptúa a ciclos del «se muestra para vender»', /REQUIERE_PLAN && sec !== 'ciclos'/.test(f.slice(0, 900)));
  const A = require('./js/sgadd-auth.js');
  const ses = (plan) => ({ rol: 'CLIENTE', plan, email: 'a@b.com', equipoAsignado: 'X' });
  check('Plata y Bronce no la tienen; ORO sí', !A.tieneModulo('ciclos', ses('PLATA')) && !A.tieneModulo('ciclos', ses('BRONCE')) && A.tieneModulo('ciclos', ses('ORO')));
}

console.log('Sin bloque ciclos');
UI.estado.comparar = null; UI.estado.ciclo = null;
const vieja = paq(0); delete vieja.ciclos; UI.estado.paq = vieja;
check('un paquete viejo lo dice y no inventa', /Todavía no hay ciclos/.test(UI.html(idx)));

console.log('Error de carga');
UI.estado.paq = null; UI.estado.error = 'Sin conexión';
check('un fallo se dice', /No se pudo leer/.test(UI.html(idx)));

{
  const cic = global.SGADD_CICLOS;
  const mk = () => ({ ciclos: { partidos: [0, 1, 2, 3].map(i => ({ id: 'p' + i, fecha: '2026-03-0' + (i + 1), rival: 'R' + i, condicion: 'LOCAL', final: [70, 75],
      zonas: { favor: cic.ZONAS.map(() => [10, 2]), contra: cic.ZONAS.map(() => [8, 5]) }, trans: { rival: { RD: [2, 2, 4, 0] } }, causas: { perd: { 'X': [2, 4] } },
      cuartos: { favor: [[1, 1, 2, 1], [1, 1, 2, 1], [1, 1, 2, 1], [1, 1, 2, 1]], contra: [[1, 1, 2, 1], [1, 1, 2, 1], [1, 1, 2, 1], [1, 1, 2, 1]] }, parciales: [[18, 18], [18, 18], [17, 20], [17, 19]] })) },
    liga: { zonas: cic.ZONAS.map(z => ({ zona: z, ppt: 1.0 })), ciclos: { lados: 8, trans: { RD: [8, 4, 8, 0] } } } });
  const c = cic.armarCiclo(mk(), 0);
  const h = UI.bloquePlan(c);
  const todas = ['Balance estructural', 'Meta táctica', 'Pts por partido', 'Base', 'Sumatoria teórica', 'Escenario prudente', 'Margen hacia el Ciclo 1'].every(t => h.indexOf(t) >= 0);
  ok += todas ? 1 : 0; fail += todas ? 0 : 1; if (!todas) console.log('  ✗ el plan trae balance, tabla maestra y escenarios');
  const sinNaN = !/NaN|undefined/.test(h);
  ok += sinNaN ? 1 : 0; fail += sinNaN ? 0 : 1; if (!sinNaN) console.log('  ✗ el plan no muestra NaN ni undefined');
}

console.log(`\n${ok} pasan · ${fail} fallan`);
process.exit(fail ? 1 : 0);

/* ---- Las 6 secciones (2026-11-04) ---- */
{
  const U2 = require('./js/sgadd-ciclosui.js');
  const ids = U2.SECCIONES.map(x => x[0]).join(',');
  if (ids !== 'principal,equipos,jugadores,clasificacion,fixture,plan') { console.log('  ✗ las 6 secciones y su orden'); process.exitCode = 1; } else console.log('  ✓ las 6 secciones y su orden');
  const vacioOk = /no está en el paquete/.test(U2.bloqueClasificacion({ secciones: {} })) && /no trae el tablero/.test(U2.bloqueEquipos({}));
  if (!vacioOk) { console.log('  ✗ lo que el paquete no trae se dice'); process.exitCode = 1; } else console.log('  ✓ lo que el paquete no trae se dice');
}
