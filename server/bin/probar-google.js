#!/usr/bin/env node
/* =====================================================================
   Prueba la lectura REAL contra una planilla privada.

     node server/bin/probar-google.js [--club deportivo]
     node server/bin/probar-google.js --sheet <ID> --rango "PROMEDIOS E"

   Es el chequeo de treinta segundos que separa "el código compila" de
   "Google nos deja leer": los tests corren con un `fetch` de mentira a
   propósito —para no depender de la red ni de una credencial— así que
   esto es lo único que prueba la cadena entera.
   ===================================================================== */
'use strict';

require('../lib/env.js').cargar();
const { obtenerDatosPlanilla, obtenerLibro } = require('../lib/google-sheets.js');
const { entorno } = require('../lib/config.js');
const catalogo = require('../lib/catalogo.js');

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].indexOf('--') !== 0) continue;
    const c = argv[i].slice(2), s = argv[i + 1];
    if (s === undefined || s.indexOf('--') === 0) o[c] = true; else { o[c] = s; i++; }
  }
  return o;
}

(async () => {
  const o = args(process.argv.slice(2));
  const env = entorno();

  console.log('');
  console.log('  cuenta de servicio  ' + (env.googleEmail || '(SIN CONFIGURAR)'));
  /* Se reporta si la clave tiene saltos REALES: es el error nº1 de las
     Service Accounts y el mensaje de OpenSSL no lo menciona. */
  console.log('  clave privada       ' + (env.googleKey
    ? (env.googleKey.indexOf('\n') !== -1 ? 'ok · con saltos de línea' : 'SOSPECHOSA · sin saltos, revisá los \\n')
    : '(SIN CONFIGURAR)'));

  if (!env.googleEmail || !env.googleKey) {
    console.error('\n  Falta configurar server/.env. Ver server/.env.example y server/README.md\n');
    process.exit(1);
  }

  let sheetId = o.sheet;
  let etiqueta = 'planilla suelta';
  if (!sheetId) {
    const clubId = o.club || 'deportivo';
    const cascada = await catalogo.cargar();
    if (cascada.aviso) console.log('  AVISO · ' + cascada.aviso);
    console.log('  catálogo desde     ' + cascada.origen);
    const cat = catalogo.resolver(cascada.catalogo, clubId, o.categoria);
    if (!cat) { console.error('\n  No existe esa categoría.\n'); process.exit(1); }
    if (!cat.sheetId) {
      console.error('\n  ' + clubId + ' no tiene sheetId configurado. Completá server/.env\n');
      process.exit(1);
    }
    sheetId = cat.sheetId;
    etiqueta = cat.club + ' · ' + cat.label;
  }
  console.log('  planilla            ' + etiqueta);
  console.log('');

  try {
    if (o.rango) {
      const r = await obtenerDatosPlanilla(sheetId, o.rango);
      console.log('  ' + r.rango + ' → ' + r.valores.length + ' filas');
      console.log('  encabezados: ' + JSON.stringify((r.valores[0] || []).slice(0, 8)));
    } else {
      const t0 = Date.now();
      const libro = await obtenerLibro(sheetId);
      const hojas = Object.keys(libro.hojas);
      let celdas = 0;
      hojas.forEach(h => {
        const f = libro.hojas[h];
        celdas += f.reduce((a, fila) => a + fila.length, 0);
        console.log('  ' + h.padEnd(14) + String(f.length).padStart(5) + ' filas'
          + (f.length ? '' : '   ← VACÍA'));
      });
      console.log('');
      console.log('  ' + (hojas.length - libro.faltantes.length) + '/' + hojas.length
        + ' hojas · ' + celdas.toLocaleString('es-AR') + ' celdas · ' + (Date.now() - t0) + ' ms');
      if (libro.faltantes.length) {
        console.log('  faltan: ' + libro.faltantes.join(', '));
      }
    }
    console.log('\n  OK · la planilla es privada y la cuenta de servicio la puede leer.\n');
  } catch (e) {
    console.error('\n  FALLÓ: ' + e.message);
    if (e.codigo === 'SIN_PERMISO_SHEET') {
      console.error('  → Compartí la planilla con ' + env.googleEmail + ' en modo Lector.');
    }
    if (e.codigo === 'AUTH_GOOGLE') {
      console.error('  → ' + (e.detalle || '') );
      console.error('  → Revisá que GOOGLE_PRIVATE_KEY tenga los \\n y que la API de Sheets esté habilitada.');
    }
    console.error('');
    process.exit(1);
  }
})();
