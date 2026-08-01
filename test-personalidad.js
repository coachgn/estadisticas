/* El perfil se mide en PERCENTIL contra la propia liga: el mismo código
   tiene que dar perfiles distintos y coherentes en dos ligas distintas. */
global.SGADD = require('./js/sgadd-core.js');
const P = require('./js/sgadd-personalidad.js');
const fs = require('fs');
let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };

const leer = p => { const L = fs.readFileSync(p, 'utf8').trim().split('\n'); const c = L[0].split('\t').map(x => x.trim());
  return { cols: c, filas: L.slice(1).map(l => { const v = l.split('\t'); const o = {}; c.forEach((k, i) => o[k] = (v[i] || '').trim()); return o; }).filter(f => Object.values(f).some(v => v !== '')) }; };

const idx = SGADD.construirIndice({ 'PROMEDIOS E': leer('./test-fixtures/prom.tsv'), 'PROMEDIOS 4F': leer('./test-fixtures/p4f.tsv') }, { fase: 'REGULAR' });

console.log('\nPERFILES · Primera (12 equipos)');
console.log('═'.repeat(76));
const perfiles = idx.lista().map(e => ({ e, p: P.perfil(idx, e) }));
perfiles.forEach(({ e, p }) => console.log('  ' + e.nombre.padEnd(26) + p.arquetipo.titulo));

console.log('\nVERIFICACIONES');
console.log('─'.repeat(76));
/* 6 y no 8: dos ejes salen de métricas CALCULADAS que necesitan el join con
   Base Datos E, que este test no carga. Se verifican abajo por separado. */
check('cada equipo trae los 6 ejes disponibles sin Base Datos E',
  perfiles.every(x => x.p.ejes.length === 6), perfiles.map(x => x.p.ejes.length).join(','));
check('el tab degrada sin romper cuando faltan métricas',
  perfiles.every(x => x.p.arquetipo && x.p.rasgos));
check('los percentiles están en 0-100', perfiles.every(x => x.p.ejes.every(j => j.percentil >= 0 && j.percentil <= 100)));
check('no todos tienen el mismo arquetipo (discrimina)',
  new Set(perfiles.map(x => x.p.arquetipo.titulo)).size >= 3,
  String(new Set(perfiles.map(x => x.p.arquetipo.titulo)).size) + ' arquetipos distintos');
check('cada frase menciona rasgos concretos', perfiles.every(x => x.p.arquetipo.frase.length > 20));
check('el resumen trae mejor y peor factor', perfiles.every(x => x.p.resumen && x.p.resumen.fuerte && x.p.resumen.debil));
/* Sin Base Datos E hay 4 factores, no 8: recorta a 2+2 para no solapar.
   El 3+3 se verifica abajo con la planilla completa. */
check('recorta armas/grietas para no solaparse cuando hay pocos factores',
  perfiles.every(x => x.p.resumen.fuertes.length === 2 && x.p.resumen.debiles.length === 2),
  perfiles.map(x => x.p.resumen.fuertes.length + '/' + x.p.resumen.debiles.length).join(' '));
check('armas y grietas no se solapan', perfiles.every(x => {
  const a = x.p.resumen.fuertes.map(f => f.clave), b = x.p.resumen.debiles.map(f => f.clave);
  return a.every(k => b.indexOf(k) === -1);
}));
check('mejor y peor no son el mismo', perfiles.every(x => x.p.resumen.fuerte.clave !== x.p.resumen.debil.clave));

// El equipo mediano no puede tener rasgos fuertes en todo.
const promRasgos = perfiles.reduce((s, x) => s + x.p.rasgos.length, 0) / perfiles.length;
check('el promedio de rasgos marcados es razonable (1-5)', promRasgos >= 1 && promRasgos <= 5, promRasgos.toFixed(1));

console.log('\nEJES DEFENSIVOS (requieren Base Datos E)');
console.log('─'.repeat(76));
const colsBD = ('PARTIDO\tEQUIPO\tFASE\tCONDICION\tRESULTADO\tPTS\tTCC\tTCI\tT3C\tT1C\tPP\tPLAYS\tRO\tRD').split('\t');
const eqs = idx.lista().map(e => e.nombre);
const juegos = [];
eqs.forEach((a, i) => eqs.forEach((b, j) => {
  if (j <= i) return;
  const P1 = a + ' vs ' + b;
  juegos.push([P1, a, 'REGULAR', 'LOCAL', 'GANADO', '70', '25', '58', '6', '12', '13', '80', '9', '28']);
  juegos.push([P1, b, 'REGULAR', 'VISITANTE', 'PERDIDO', '66', '24', '60', '5', '10', '15', '82', '8', '26']);
}));
const bd = juegos.map(r => { const o = {}; colsBD.forEach((c, i) => o[c] = r[i]); return o; });
const idxFull = SGADD.construirIndice({
  'PROMEDIOS E': leer('./test-fixtures/prom.tsv'),
  'PROMEDIOS 4F': leer('./test-fixtures/p4f.tsv'),
  'Base Datos E': { cols: colsBD, filas: bd },
}, { fase: 'REGULAR' });
const pFull = P.perfil(idxFull, idxFull.get('RECONQUISTA A'));
check('con Base Datos E aparecen los 8 ejes', pFull.ejes.length === 8, String(pFull.ejes.length));
const rFull = pFull.resumen;
check('con los 8 factores sí da 3 armas y 3 grietas',
  rFull.fuertes.length === 3 && rFull.debiles.length === 3,
  rFull.fuertes.length + '/' + rFull.debiles.length);
check('e incluyen presión y protección del aro',
  pFull.ejes.some(x => x.id === 'presion') && pFull.ejes.some(x => x.id === 'proteccion'),
  pFull.ejes.map(x => x.id).join(', '));

console.log('\nINSIGHT · victorias vs derrotas');
console.log('─'.repeat(76));
const colsI = ('PARTIDO\tEQUIPO\tFASE\tCONDICION\tRESULTADO\tPTS\tTCC\tTCI\tT2C\tT2I\tT3C\tT3I\tT1C\tT1I\tPP\tPLAYS\tRO\tRD\tAST').split('\t');
const fI = [];
const mk = (i, res, t3c, t3i) => {
  const P1 = 'P' + i;
  fI.push({ PARTIDO: P1, EQUIPO: "RECONQUISTA 'A' - MM", FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: res,
    PTS: '70', TCC: String(20 + t3c), TCI: String(38 + t3i), T2C: '20', T2I: '38', T3C: String(t3c), T3I: String(t3i),
    T1C: '14', T1I: '20', PP: '13', PLAYS: '80', RO: '8', RD: '30', AST: '14' });
  fI.push({ PARTIDO: P1, EQUIPO: 'RIVAL ' + i, FASE: 'REGULAR', CONDICION: 'VISITANTE',
    RESULTADO: res === 'GANADO' ? 'PERDIDO' : 'GANADO', PTS: '68', TCC: '25', TCI: '60', T2C: '18', T2I: '38',
    T3C: '7', T3I: '22', T1C: '12', T1I: '18', PP: '14', PLAYS: '80', RO: '8', RD: '28', AST: '12' });
};
for (let i = 1; i <= 6; i++) mk(i, 'GANADO', 9, 25);    // T3% 36%
for (let i = 7; i <= 11; i++) mk(i, 'PERDIDO', 6, 24);  // T3% 25%

const idxI = SGADD.construirIndice({
  'PROMEDIOS E': leer('./test-fixtures/prom.tsv'), 'PROMEDIOS 4F': leer('./test-fixtures/p4f.tsv'),
  'Base Datos E': { cols: colsI, filas: fI } }, { fase: 'REGULAR' });
const ins = P.insight(idxI, idxI.get('RECONQUISTA A'));
check('separa victorias de derrotas', ins.g.pj === 6 && ins.d.pj === 5, ins.g.pj + '-' + ins.d.pj);
check('detecta que el triple se derrumba', ins.cambian.some(f => f.clave === 'T3%'),
  ins.cambian.map(f => f.clave).join(','));
check('y que el rebote NO cambia', ins.estables.some(f => f.clave === 'RO%'),
  ins.estables.map(f => f.clave).join(','));
check('genera texto narrativo', ins.texto.length >= 2 && ins.texto[0].length > 30);
ins.texto.forEach(t => console.log('    ' + t));

const pocos = P.insight(idxI, idxI.get('ATENAS A'));
check('sin Base Datos E de ese equipo, no inventa', !pocos || !pocos.suficiente);

console.log('\nAGNOSTICISMO DE LIGA');
console.log('─'.repeat(76));
/* Misma forma de juego, escala distinta: una liga de PACE 80 y otra de 100.
   El perfil tiene que salir IGUAL porque se mide contra la propia liga. */
function ligaEscalada(factor) {
  const base = leer('./test-fixtures/prom.tsv');
  const filas = base.filas.map(f => {
    const o = {};
    Object.keys(f).forEach(k => {
      const n = SGADD.num(f[k]);
      o[k] = (typeof n === 'number' && ['PACE', 'POS', 'PLAYS'].indexOf(k) !== -1)
        ? String(n * factor).replace('.', ',') : f[k];
    });
    return o;
  });
  return SGADD.construirIndice({ 'PROMEDIOS E': { cols: base.cols, filas }, 'PROMEDIOS 4F': leer('./test-fixtures/p4f.tsv') }, { fase: 'REGULAR' });
}
const idxRapida = ligaEscalada(1.25);
const a = P.perfil(idx, idx.get('RECONQUISTA A'));
const b = P.perfil(idxRapida, idxRapida.get('RECONQUISTA A'));
check('una liga 25% más rápida NO cambia el perfil',
  a.arquetipo.titulo === b.arquetipo.titulo, a.arquetipo.titulo + '  vs  ' + b.arquetipo.titulo);
check('ni los percentiles de ritmo',
  Math.abs(a.ejes[0].percentil - b.ejes[0].percentil) < 0.01);

console.log('\n' + '═'.repeat(76));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
