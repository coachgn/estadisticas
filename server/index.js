/* Arranque local. En Vercel no se usa: ahí entra por `api/index.js`. */
'use strict';

/* Carga el `.env` a mano, sin `dotenv`: son doce líneas y evita una
   dependencia en el arranque. En Vercel las variables ya vienen del
   entorno, así que este bloque no hace nada. */
require('./lib/env.js').cargar();

const { crearApp } = require('./app.js');
const { entorno } = require('./lib/config.js');

const env = entorno();
crearApp().listen(env.puerto, () => {
  console.log('SGADD API en http://localhost:' + env.puerto);
  console.log('  origenes CORS: ' + (env.origenes.join(', ') || '(ninguno configurado)'));
  console.log('  probar:        curl http://localhost:' + env.puerto + '/api/v1/salud');
});
