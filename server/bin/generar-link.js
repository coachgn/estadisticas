#!/usr/bin/env node
/* =====================================================================
   Genera el link de acceso de un cliente.

     node server/bin/generar-link.js \
       --email dt@deportivo.com \
       --club deportivo \
       --equipo "DEPORTIVO LA PLATA" \
       --plan PRO \
       --expira 30d

   El link se le manda al club y reemplaza al `?usuario=…&plan=PRO`
   editable de hoy: el rol viaja firmado y el cliente no lo puede cambiar.
   ===================================================================== */
'use strict';

require('../lib/env.js').cargar();
const { generarLinkCliente } = require('../lib/auth.js');
const { CATALOGO } = require('../lib/config.js');

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.indexOf('--') !== 0) continue;
    const clave = a.slice(2);
    const sig = argv[i + 1];
    if (sig === undefined || sig.indexOf('--') === 0) { o[clave] = true; }
    else { o[clave] = sig; i++; }
  }
  return o;
}

const o = args(process.argv.slice(2));

if (o.help || !o.email) {
  console.log(`
Uso:
  node server/bin/generar-link.js --email <mail> [opciones]

Opciones:
  --email    <mail>     obligatorio
  --club     <slug>     ${Object.keys(CATALOGO).join(' | ')}
  --equipo   <EQUIPO>   el equipo asignado, como lo escribe la planilla
  --plan     BASICO|PRO  por defecto BASICO
  --expira   <7d|30d|12h> por defecto 7d
  --base     <url>      por defecto https://coachgn.github.io/estadisticas/

OJO con el nombre del equipo: se compara con claveEquipo(), así que la
LETRA importa. "RECONQUISTA" no reconoce a "RECONQUISTA 'A'" y el cliente
se queda sin ver ningún equipo (punto 19 de CLAUDE.md).
`);
  process.exit(o.email ? 0 : 1);
}

const club = o.club ? String(o.club).toLowerCase() : null;
if (club && !CATALOGO[club]) {
  console.error('Ese club no está en el catálogo: ' + club);
  console.error('Disponibles: ' + Object.keys(CATALOGO).join(', '));
  process.exit(1);
}

/* Aviso, no error: un cliente sin equipo asignado NO ve ningún equipo —
   es la regla de fallar cerrado del punto 19— pero puede ser lo que se
   quiere para un acceso de solo tabla de posiciones. */
if (club && !o.equipo) {
  console.warn('AVISO: sin --equipo, este cliente no va a ver ninguna ficha de equipo.');
  console.warn('       El equipo propio de ' + club + ' es: ' + CATALOGO[club].equipoPropio);
}

try {
  const r = generarLinkCliente({
    base: o.base || 'https://coachgn.github.io/estadisticas/',
    email: o.email,
    club: club,
    categoria: o.categoria || null,
    equipo: o.equipo || null,
    plan: o.plan || 'BASICO',
    expiraEn: o.expira || '7d',
  });

  console.log('');
  console.log('  mail      ' + r.sesion.email);
  console.log('  rol       ' + (require('../../js/sgadd-auth.js').rol(r.sesion)));
  console.log('  plan      ' + r.sesion.plan);
  console.log('  equipo    ' + (r.sesion.equipoAsignado || '(ninguno)'));
  console.log('  vence     ' + r.expiraEn);
  console.log('');
  console.log(r.url);
  console.log('');
  console.log('  El token queda en el historial del navegador y en los logs de');
  console.log('  cualquier proxy. Mandalo por un canal privado y usá vencimientos');
  console.log('  cortos. Ver docs/ARQUITECTURA-BACKEND.md punto 7.2.');
  console.log('');
} catch (e) {
  console.error('No se pudo generar el link: ' + e.message);
  process.exit(1);
}
