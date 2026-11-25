/* QUIÉN ES ADMINISTRADOR · solo del servidor.

   Vivía en `js/sgadd-auth.js`, o sea en el JavaScript que se publica: la
   lista le decía a cualquiera a qué mails apuntarle en el login. Ahora el
   navegador no la tiene; el rol le llega en el token firmado (`adm`) y el
   servidor lo re-deriva contra ESTA lista en cada pedido.

   Es una lista literal a propósito: un patrón (`@motorstats.ar`) le daría
   admin a cualquier mail nuevo de ese dominio sin que nadie lo decida.
   La lee `sgadd-auth.js` con `require`, en Node (servidor y tests). */
'use strict';

module.exports = [
  'freytesgn@gmail.com',
  'francasa09@gmail.com',
  'motorstats.ar@gmail.com',
];
