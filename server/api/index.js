/* =====================================================================
   Envoltorio para Vercel.

   Vercel corre una app de Express tal cual si el módulo la exporta, así
   que este archivo es literalmente el mismo servidor con otro arranque:
   `app.js` no se entera de dónde está corriendo.

   Ojo con lo que NO se comporta igual que en Express, y está documentado
   en el punto 6.4 de docs/ARQUITECTURA-BACKEND.md: el rate limit y el
   caché de hojas viven en la memoria de una instancia, y acá hay muchas.
   ===================================================================== */
'use strict';

const { crearApp } = require('../app.js');

module.exports = crearApp();
