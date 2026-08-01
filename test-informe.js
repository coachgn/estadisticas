/* El informe arma HTML a partir de las secciones elegidas. Se verifica que
   respete la selección y que no reviente si falta algo. */
let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };

const I = require('./js/sgadd-informe.js');

console.log('\nSECCIONES DEL INFORME');
console.log('═'.repeat(70));
I.SECCIONES.forEach(s => console.log('  ' + (s.pre ? '[x]' : '[ ]') + ' ' + s.label));

console.log('\nVERIFICACIONES');
console.log('─'.repeat(70));
check('hay 9 secciones seleccionables', I.SECCIONES.length === 9, String(I.SECCIONES.length));
check('las claves para scouting vienen premarcadas',
  ['ficha', 'insight', 'personalidad', '4factores'].every(id => I.SECCIONES.find(s => s.id === id).pre));
check('las secundarias vienen desmarcadas',
  ['ofensiva', 'defensiva', 'partidos'].every(id => !I.SECCIONES.find(s => s.id === id).pre));
check('ficha e insight son virtuales (no son un tab entero)',
  I.SECCIONES.find(s => s.id === 'ficha').virtual === 'ficha' &&
  I.SECCIONES.find(s => s.id === 'insight').virtual === 'insight');
check('el resto mapea a un tab real',
  I.SECCIONES.filter(s => s.tab).every(s => ['personalidad','4factores','condicion','ofensiva','defensiva','plantel','partidos'].indexOf(s.tab) !== -1));
check('no hay ids duplicados', new Set(I.SECCIONES.map(s => s.id)).size === I.SECCIONES.length);

const sel = I.elegidas();
check('elegidas() devuelve un estado por sección', Object.keys(sel).length === I.SECCIONES.length);

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
