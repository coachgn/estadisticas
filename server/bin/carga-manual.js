#!/usr/bin/env node
/* =====================================================================
   SGADD · Disparo manual de la doble alerta de carga (torneos sin PBP)

       node server/bin/carga-manual.js previa            simula (no escribe)
       node server/bin/carga-manual.js previa --real     escribe en el calendario
       node server/bin/carga-manual.js control --real
       ... --forzar   crea el evento aunque su horario ya haya pasado

   Corre EL MISMO handler que el cron de Vercel, con las credenciales
   locales de server/.env (catálogo de KV y Service Account), sin esperar
   al horario. El calendario sale de TORNEOS_MANUALES_CALENDAR_ID (variable
   de entorno o server/.env); sin ella no escribe. Sin `--real` simula.
   ===================================================================== */
'use strict';

require('../lib/env.js').cargar();
const { manejarCronCargaManual } = require('../rutas/carga-manual.js');

const args = process.argv.slice(2);
const flujo = args.find(a => a === 'previa' || a === 'control');
if (!flujo) {
  console.error('Uso: node server/bin/carga-manual.js previa|control [--real] [--forzar]');
  process.exit(2);
}
const real = args.indexOf('--real') >= 0;
const env = Object.assign({}, process.env, { CRON_SECRET: 'disparo-local-' + process.pid });

manejarCronCargaManual(
  { headers: { authorization: 'Bearer ' + env.CRON_SECRET }, query: { flujo: flujo, simular: real ? '' : '1', forzar: args.indexOf('--forzar') >= 0 ? '1' : '' } },
  { env: env }
).then((r) => {
  console.log(JSON.stringify(r.body, null, 2));
  process.exit(r.status >= 400 ? 1 : 0);
}).catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
