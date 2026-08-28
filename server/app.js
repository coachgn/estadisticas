/* =====================================================================
   El envoltorio Express

   Treinta líneas sobre los handlers de `api/handlers.js`, que son los que
   tienen la lógica. `api/index.js` hace lo mismo para Vercel.
   ===================================================================== */
'use strict';

const express = require('express');
const cors = require('cors');
const { entorno } = require('./lib/config.js');
const h = require('./api/handlers.js');

const { limitador } = require('./lib/limitador.js');

function crearApp(opciones) {
  const o = opciones || {};
  const env = o.entorno || entorno();
  const app = express();

  /* Necesario para que `req.ip` sea la IP real detrás de Vercel o de
     cualquier proxy. Va con `1` y no con `true`: `true` confía en toda la
     cadena de `X-Forwarded-For`, que el cliente puede falsear para
     esquivar el rate limit. */
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  /* CORS con LISTA DE PERMITIDOS, nunca `*`.

     El frontend (GitHub Pages) y el backend (Vercel) viven en dominios
     distintos, así que CORS hace falta sí o sí. Pero con `*` cualquier
     página podría hacer que el navegador de un cliente pida sus datos.

     `credentials: false` a propósito: el token va en el header
     `Authorization`, no en una cookie, así que no hace falta — y sin
     credenciales el navegador ni siquiera permite `*` combinado con
     cookies, que es la trampa clásica. */
  app.use(cors({
    origin: function (origen, cb) {
      /* Sin `Origin` son peticiones que no vienen de un navegador (curl,
         el propio servidor, un health check): se dejan pasar porque CORS
         no las protege de nada. Lo que protege el token es otra capa. */
      if (!origen) return cb(null, true);
      if (env.origenes.indexOf(origen) !== -1) return cb(null, true);
      return cb(new Error('Origen no permitido: ' + origen));
    },
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
    maxAge: 600,
  }));

  app.use(limitador(env.rateMax, env.rateVentanaMs));

  const responder = (fn) => async (req, res) => {
    try {
      const r = await fn(req, o.deps);
      res.status(r.status).json(r.body);
    } catch (e) {
      /* El stack se loguea, no se responde: un stack en el cuerpo expone
         rutas del servidor y versiones de dependencias. */
      console.error('[sgadd]', e && e.stack ? e.stack : e);
      res.status(500).json({ ok: false, codigo: 'INTERNO', mensaje: 'Error del servidor.' });
    }
  };

  app.get('/api/v1/salud', (req, res) => res.json({ ok: true, servicio: 'sgadd-api' }));
  app.get('/api/v1/catalogo', responder(h.manejarCatalogo));
  app.get('/api/v1/equipos/:clubId', responder(h.manejarEquipos));
  app.get('/api/v1/scouting/:clubId', responder(h.manejarScouting));

  app.use((req, res) => res.status(404).json({ ok: false, codigo: 'SIN_RUTA' }));

  /* El error de CORS llega acá como excepción del middleware: sin este
     handler, Express devuelve su página HTML de error y el fetch del
     navegador falla con un mensaje que no explica nada. */
  app.use((err, req, res, _next) => {
    if (err && /Origen no permitido/.test(err.message)) {
      return res.status(403).json({ ok: false, codigo: 'ORIGEN', mensaje: err.message });
    }
    console.error('[sgadd]', err && err.stack ? err.stack : err);
    res.status(500).json({ ok: false, codigo: 'INTERNO' });
  });

  return app;
}

module.exports = { crearApp };
