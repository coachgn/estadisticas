/* Escalones por tercios (punto 174): el criterio ÚNICO de meta del Diagnóstico y de Ciclos. */
const E = require('./js/sgadd-escalones.js');
let ok = 0, mal = 0;
const check = (n, c, d) => { if (c) ok++; else { mal++; console.log('  ✗', n, d || ''); } };
const cerca = (a, b) => Math.abs(a - b) < 1e-9;
const dist = Array.from({ length: 101 }, (_, i) => i);          // el valor ES su percentil

console.log('1 · los tercios');
check('P0-33 inferior · P34-66 medio · P67-100 superior', E.tercioDe(0).id === 'inferior' && E.tercioDe(33).id === 'inferior' && E.tercioDe(34).id === 'medio' && E.tercioDe(66).id === 'medio' && E.tercioDe(67).id === 'superior' && E.tercioDe(100).id === 'superior');
check('el percentil se redondea (los informes de ciclo lo traen entero)', E.tercioDe(33.4).id === 'inferior' && E.tercioDe(33.6).id === 'medio');
check('sin dato no hay tercio', E.tercioDe(null) === null && E.escalonPct(NaN) === null);

console.log('2 · el escalón realista');
check('P3 → el techo del tercio inferior (P33), no P70', E.escalonPct(3).pct === 33 && E.escalonPct(3).tipo === 'subir');
check('P40 → el techo del tercio medio (P66)', E.escalonPct(40).pct === 66);
check('P70 → se sostiene, con piso en P67', E.escalonPct(70).tipo === 'sostener' && E.escalonPct(70).piso === 67 && E.escalonPct(70).pct === null);
check('a menos de 5 puntos del techo, el escalón es el inicio del tercio siguiente', E.escalonPct(30).pct === 34 && E.escalonPct(62).pct === 67 && E.escalonPct(28).pct === 33);
check('nunca un salto de más de un tercio', [0, 5, 20, 33, 34, 50, 62, 66].every(p => { const e = E.escalonPct(p); return e.pct - p <= 34; }));

console.log('3 · el plan de una métrica');
let pl = E.plan({ valor: 3, dist, invertida: false });
check('P3: escalón P33, ciclo a la mitad (P18), nada de P70', pl.tipo === 'subir' && cerca(pl.escalon.valor, 33) && cerca(pl.ciclo.valor, 18) && pl.tercio === 'inferior', JSON.stringify(pl));
pl = E.plan({ valor: 50, dist, invertida: false });
check('P50: escalón P66, ciclo P58', cerca(pl.escalon.valor, 66) && cerca(pl.ciclo.valor, 58));
pl = E.plan({ valor: 80, dist, invertida: false });
check('P80: sostener, piso P67 y sin ciclo', pl.tipo === 'sostener' && pl.ciclo === null && cerca(pl.piso.valor, 67));
pl = E.plan({ valor: 97, dist, invertida: true });          // invertida: 97 es de lo peor
check('invertida: P3 (valor alto) baja hacia el escalón, no hacia arriba', pl.tipo === 'subir' && pl.escalon.valor < 97 && pl.ciclo.valor < 97 && pl.ciclo.valor > pl.escalon.valor, JSON.stringify(pl));
check('la meta nunca es peor que hoy', [2, 10, 30, 45, 60].every(v => { const p = E.plan({ valor: v, dist }); return p.ciclo.valor > v && p.ciclo.valor <= p.escalon.valor; }));
check('una distribución chata no inventa una mejora', E.plan({ valor: 5, dist: [5, 5, 5, 5, 5, 5] }).tipo === 'sostener');
check('la fracción del ciclo se puede cambiar', cerca(E.plan({ valor: 3, dist, fraccion: 1 }).ciclo.valor, 33));
check('haciaReferencia: mitad del camino', cerca(E.haciaReferencia(1, 3), 2) && E.haciaReferencia(null, 3) === null);
check('percentilDe: rango medio y dirección', cerca(E.percentilDe([1, 2, 3, 4], 2, false), 37.5) && cerca(E.percentilDe([1, 2, 3, 4], 2, true), 62.5));

console.log('4 · una sola lógica en los dos módulos (nada de p70 / p40 sueltos)');
const fs = require('fs');
const sinComentarios = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const con = sinComentarios('./js/sgadd-conclusiones.js'), cic = sinComentarios('./js/sgadd-cicloinforme.js');
check('conclusiones y ciclos leen el mismo módulo de escalones', /sgadd-escalones\.js/.test(con) && /sgadd-escalones\.js/.test(cic));
check('ninguno compara un percentil contra 70 ni 40 a mano', !/pct\s*(>=|<)\s*(70|40)\b/.test(cic) && !/percentil\s*(>=|<)\s*(70|40)\b/.test(con));
check('ninguno busca el p70 / p40 de la liga como meta', !/enPercentil\([^)]*,\s*(70|40)\)/.test(cic) && !/OBJETIVO\s*=\s*70/.test(con));
check('las metas de ciclo usan el plan de tercios', /planDe\(/.test(cic) && /ESC\.plan\(/.test(con));
const idxh = fs.readFileSync('./index.html', 'utf8');
check('el módulo carga antes que los dos que lo usan', idxh.indexOf('sgadd-escalones.js') > 0 && idxh.indexOf('sgadd-escalones.js') < idxh.indexOf('sgadd-cicloinforme.js') && idxh.indexOf('sgadd-escalones.js') < idxh.indexOf('sgadd-conclusiones.js'));

console.log('\n' + (mal ? '✗ HAY FALLAS   ' : '') + ok + ' pasan · ' + mal + ' fallan');
process.exit(mal ? 1 : 0);
