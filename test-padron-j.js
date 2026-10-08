/* =====================================================================
   `server/lib/padron-j.js` · la pestaña PADRON J → fichas de Fichajes

     node test-padron-j.js

   Los libros que llegan por la ingesta automática (la LNB) traen
   `PADRON J` con el nacimiento de cada jugador. Fichajes la lee directo
   del libro y completa las fichas manuales SIN pisarlas. La integración con
   el endpoint está en test-fichajes.js (3 bis); acá, el módulo puro.
   ===================================================================== */
'use strict';

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(68));

const P = require('./server/lib/padron-j.js');
const SGADD = require('./server/lib/compartido/sgadd-core.js');
const HOY = new Date(2026, 9, 7);

titulo('1. LAS FECHAS, como llegan de la planilla');
check('ISO', P.fechaIso('1991-03-14') === '1991-03-14');
check('d/m/aaaa (Argentina), con o sin ceros', P.fechaIso('14/3/1991') === '1991-03-14' && P.fechaIso('02/07/2001') === '2001-07-02');
check('número de serie de Sheets', P.fechaIso(33311) === '1991-03-14');
check('vacío o basura: cadena vacía', P.fechaIso('') === '' && P.fechaIso(null) === '' && P.fechaIso('5/5') === '');

titulo('2. LA PESTAÑA → FICHAS');
const ENC = ['ID_JUGADOR', 'NOMBRES', 'EQUIPO', 'TORNEO', 'ID_EQUIPO_FUENTE', 'DORSAL', 'NACIMIENTO', 'EDAD TEMPORADA', 'PUESTO', 'TALLA', 'FOTO'];
const r = P.fichasDelPadron([ENC,
  [428243, 'BRUSSINO, JUAN IGNACIO', 'LANÚS', 'IDA', 112600, 5, '14/3/1991', 35, '', '', '/fotos/428243'],
  [385838, 'WHITFIELD III,  ROBERT JAMARCUS', 'LANÚS', 'IDA', 112600, 3, '1999-05-10', 27, '2-3', 196, ''],
  [1, 'SIN DATOS', 'LANÚS', 'IDA', 112600, 9, '', '', '', '', ''],
  [2, 'MAL PUESTO', 'LANÚS', 'IDA', 112600, 8, '2000-01-01', 26, '1-3', 400, ''],
  [3, '', 'LANÚS', 'IDA', 112600, 7, '2000-01-01', 26, '', '', ''],
], HOY);
const k = (n, e) => SGADD.clavePersona(n) + '|' + SGADD.claveEquipo(e);
check('la clave es la de Fichajes (clavePersona | claveEquipo)', !!r.fichas[k('BRUSSINO, JUAN IGNACIO', 'LANÚS')], Object.keys(r.fichas).join(' / '));
check('nacimiento en ISO', r.fichas[k('BRUSSINO, JUAN IGNACIO', 'LANÚS')].nacimiento === '1991-03-14');
check('puesto y talla, si están', r.fichas[k('WHITFIELD III, ROBERT JAMARCUS', 'LANÚS')].posicion === '2-3'
  && r.fichas[k('WHITFIELD III, ROBERT JAMARCUS', 'LANÚS')].talla === 196);
check('espacios de más en el nombre no cambian la clave', !!r.fichas[k('WHITFIELD III, ROBERT JAMARCUS', 'LANÚS')]);
check('una fila sin datos no genera ficha', !r.fichas[k('SIN DATOS', 'LANÚS')]);
const mal = r.fichas[k('MAL PUESTO', 'LANÚS')];
check('un campo inválido se descarta SOLO, sin perder los otros de la fila', mal && mal.nacimiento === '2000-01-01' && mal.posicion === undefined && mal.talla === undefined);
check('una fila sin nombre no cuenta', r.filas === 4 && r.conDatos === 3);
check('una pestaña sin NOMBRES o EQUIPO no da nada', Object.keys(P.fichasDelPadron([['ID_JUGADOR'], [1]]).fichas).length === 0);
check('sin pestaña o vacía: nada', P.fichasDelPadron(null).filas === 0 && P.fichasDelPadron([ENC]).filas === 0);

titulo('3. LA FUSIÓN · la ficha manual manda');
const f = P.fusionar({ 'A|X': { nacimiento: '1990', talla: 201 }, 'C|X': { posicion: '5' } },
  { 'A|X': { nacimiento: '1991-03-14', posicion: '3' }, 'B|X': { nacimiento: '2000-01-01' } });
check('el campo manual queda (nacimiento 1990, talla 201)', f.fichas['A|X'].nacimiento === '1990' && f.fichas['A|X'].talla === 201);
check('el padrón completa lo que falta (posición)', f.fichas['A|X'].posicion === '3');
check('un jugador solo en el padrón entra', f.fichas['B|X'].nacimiento === '2000-01-01');
check('un jugador solo en las manuales queda igual', JSON.stringify(f.fichas['C|X']) === JSON.stringify({ posicion: '5' }));
check('cuenta las fichas que ganaron algún campo', f.completadas === 2);
check('sin padrón, las manuales intactas', JSON.stringify(P.fusionar({ 'A|X': { talla: 1 } }, {}).fichas) === JSON.stringify({ 'A|X': { talla: 1 } }));

/* LAS FOTOS (punto 95): pasa solo lo que tiene forma de foto, y solo de
   los jugadores que viajan en el libro recortado. */
const PAD = [['NOMBRES', 'EQUIPO', 'FOTO'],
  ['BRUSSINO, JUAN IGNACIO', 'LANÚS', '/fotos/428243'],
  ['OTRO, JUGADOR', 'LANUS', 'https://cdn.ejemplo.com/f/1.jpg'],
  ['MALO, UNO', 'LANÚS', 'javascript:alert(1)'],
  ['MALO, DOS', 'LANÚS', '/fotos/abc'],
  ['RIVAL, TRES', 'BOCA', '/fotos/999'],
  ['', 'LANÚS', '/fotos/1']];
const fotos = P.fotosDelPadron(PAD);
const kb = P.claveFoto('BRUSSINO, JUAN IGNACIO', 'LANUS');
check('la ruta /fotos/<id> de la liga pasa tal cual', fotos[kb] === '/fotos/428243', JSON.stringify(fotos));
check('una URL https también', fotos[P.claveFoto('OTRO, JUGADOR', 'LANÚS')] === 'https://cdn.ejemplo.com/f/1.jpg');
check('lo que no tiene forma de foto se descarta (va a un <img>)',
  !fotos[P.claveFoto('MALO, UNO', 'LANÚS')] && !fotos[P.claveFoto('MALO, DOS', 'LANÚS')]);
check('una fila sin nombre no da foto', Object.keys(fotos).length === 3, Object.keys(fotos).length);
check('una pestaña sin FOTO no da nada', Object.keys(P.fotosDelPadron([['NOMBRES', 'EQUIPO'], ['A', 'B']])).length === 0);
const libroRec = { 'PROMEDIOS J': [['NOMBRES', 'EQUIPO'], ['BRUSSINO, JUAN IGNACIO', 'LANUS']] };
const viajan = P.fotosDelLibro(fotos, libroRec);
check('del libro recortado viaja solo la foto de quien está en PROMEDIOS J',
  Object.keys(viajan).length === 1 && viajan[kb] === '/fotos/428243', JSON.stringify(viajan));
check('el rival recortado no manda su foto', !viajan[P.claveFoto('RIVAL, TRES', 'BOCA')]);
check('sin libro no viaja ninguna', Object.keys(P.fotosDelLibro(fotos, {})).length === 0);
const handlers = require('fs').readFileSync('./server/api/handlers.js', 'utf8');
check('el handler pide PADRON J solo en categorías de un torneo',
  /deTorneo && cat\.sheetId/.test(handlers) && /fotosDelLibro\(await pFotos, rec\.hojas\)/.test(handlers));

console.log('\n' + '═'.repeat(68));
console.log((fail ? '✗ FALLARON ' + fail : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
