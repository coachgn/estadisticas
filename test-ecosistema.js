/* test-ecosistema.js · el auditor del ecosistema (server/bin/ecosistema.js)
   Las funciones puras y la propiedad que más importa: que NO escriba. */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('./server/bin/ecosistema.js');

let ok = 0, mal = 0;
function check(nombre, cond) {
  if (cond) ok++; else { mal++; console.log('  ✖ ' + nombre); }
}

// --- fechas de las dos fuentes ---
check('iso lee dd/mm/aaaa de LICENCIAS', E.iso('18/09/2026') === '2026-09-18');
check('iso completa el día y el mes con cero', E.iso('3/9/2027') === '2027-09-03');
check('iso deja pasar aaaa-mm-dd del catálogo', E.iso('2026-10-16') === '2026-10-16');
check('iso de una fecha y hora toma el día', E.iso('17/03/2026 16:13:50') === '2026-03-17');
check('iso de vacío es null', E.iso('') === null && E.iso(null) === null);

// --- la clave de escudo, como el manifiesto ---
check('paréntesis como espacio', E.claveLogo('ARGENTINO (J)') === 'argentino j');
check('sin el sufijo de categoría', E.claveLogo("ATENAS 'A' - MM") === 'atenas a');
check('sin acentos', E.claveLogo('LANÚS') === 'lanus' && E.claveLogo('PEÑAROL (MDP)') === 'penarol mdp');
check('puntos como espacios', E.claveLogo('C.E.Y.E.') === 'c e y e');

/* Con la clave del auditor, todo nombre que el manifiesto de la LNB ya
   cubre con su forma corta tiene que encontrarse: si no, el aviso de
   «equipos sin escudo» mentiría. */
const lnb = JSON.parse(fs.readFileSync(path.join(__dirname, 'logos', 'liga-nacional', 'index.json'), 'utf8'));
const t = JSON.parse(fs.readFileSync(path.join(__dirname, 'torneos', 'liga-nacional-2026-27.json'), 'utf8'));
const cubiertos = Object.values(t.zonas).flatMap(z => z.equipos)
  .filter(e => [e.nombre].concat(e.alias || []).some(n => lnb[E.claveLogo(n)]));
check('el manifiesto real de la LNB resuelve la mayoría de los 18', cubiertos.length >= 14);

// --- la salida no imprime ids enteros ---
const id = '1VjjZUL-OV6DEmg0cU1b8ZiE0tX2odKrwNUPBfrSy_VY';
check('corto tapa el id', E.corto(id) === '1Vjj…y_VY' && E.corto(id).length < 12);
check('corto de vacío es una raya', E.corto('') === '—');

// --- solo lectura: ninguna escritura en KV ni en Google ---
const src = fs.readFileSync(path.join(__dirname, 'server', 'bin', 'ecosistema.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
check('no llama a kv', !/require\(['"]\.\.\/lib\/kv/.test(src) && !/\bkv\./.test(src));
check('no usa cargarParaEscribir ni catalogo-mutar', !/cargarParaEscribir|catalogo-mutar/.test(src));
check('no escribe en Google (ni PUT ni POST a sheets/script)',
  !/method:\s*['"](PUT|PATCH|DELETE)/.test(src) && !/sheets\.googleapis\.com[^'"]*:(batchUpdate|append)/.test(src));
check('el único archivo que escribe es el registro de scripts',
  (src.match(/writeFileSync\(/g) || []).length === 1 && /registro-scripts\.json/.test(src));

// --- LICENCIAS solo con --licencias (decisión del 2026-10-15) ---
check('LICENCIAS no se lee por defecto', /const lic = o\.licencias \? await licencias\(\) : null;/.test(src));

// --- el comando único ---
const auto = fs.readFileSync(path.join(__dirname, 'auto-process.js'), 'utf8');
check('auto-process apaga la IA en todos los hijos', /CENTRO_MANDO_MOTOR:\s*'no'/.test(auto) && /env:\s*ENV/.test(auto));
check('auto-process corre ingesta → auditar → contenido → render, en ese orden',
  /\['ingesta', 'auditar', 'contenido', 'render'\]/.test(auto));
check('auto-process no aprueba piezas: solo renderiza lo aprobado', !/aprobar\(/.test(auto));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
check('npm run auto-process existe', pkg.scripts && pkg.scripts['auto-process'] === 'node auto-process.js');
check('el package.json del panel no trae dependencias', !pkg.dependencies && !pkg.devDependencies);

// --- el render local ---
const rnd = fs.readFileSync(path.join(__dirname, 'centro-mando', 'renderizar.js'), 'utf8');
check('el render usa las placas del mismo contrato que Canva', /section\[data-document-role="page"\]/.test(rnd));
check('el render no suma dependencias (sin puppeteer ni playwright)', !/require\(['"](puppeteer|playwright)/.test(rnd));
check('el render no cambia el estado de la cola', !/\.estado\s*=/.test(rnd));

console.log('\n  test-ecosistema.js · ' + ok + ' pasaron · ' + mal + ' fallaron' + (mal ? '  ← FALLARON' : ''));
process.exit(mal ? 1 : 0);
