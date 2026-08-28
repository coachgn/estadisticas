/* =====================================================================
   Rate limit

   Vive en su propio archivo y no en `app.js` porque `app.js` requiere
   Express, y la suite corre SIN instalar dependencias. Un limitador que
   no se puede testear sin `npm install` es uno que no se testea.
   ===================================================================== */
'use strict';

/* --------------------------------------------------------------------
   RATE LIMIT

   Contador en memoria del proceso, a propósito sin dependencia: para el
   PoC alcanza y se entiende de un vistazo.

   ADVERTENCIA QUE NO SE SACA: en serverless esto NO limita de verdad.
   Cada invocación puede caer en una instancia distinta con su propia
   memoria, así que el límite efectivo termina siendo (límite × instancias
   vivas), y una instancia fría arranca en cero. Bajo Express sí funciona
   —un solo proceso, una sola memoria—.

   Para producción en Vercel va Upstash/Redis o el rate limiting del propio
   borde. Está anotado en docs/ARQUITECTURA-BACKEND.md punto 6.4.
   -------------------------------------------------------------------- */
function limitador(max, ventanaMs) {
  const visto = new Map();
  return function (req, res, next) {
    const ahora = Date.now();
    /* `req.ip` respeta `trust proxy`, que se configura abajo. Sin eso,
       detrás de un proxy TODAS las peticiones comparten la IP del proxy y
       el primer cliente activo deja afuera a los demás. */
    const clave = req.ip || 'sin-ip';
    const e = visto.get(clave);
    if (!e || e.hasta < ahora) {
      visto.set(clave, { n: 1, hasta: ahora + ventanaMs });
      return next();
    }
    e.n++;
    if (e.n > max) {
      res.set('Retry-After', String(Math.ceil((e.hasta - ahora) / 1000)));
      return res.status(429).json({
        ok: false, codigo: 'DEMASIADAS_PETICIONES',
        mensaje: 'Demasiadas peticiones. Probá de nuevo en un minuto.',
      });
    }
    /* Limpieza oportunista: sin esto el Map crece sin techo y es una fuga
       de memoria en un proceso de larga vida. */
    if (visto.size > 5000) {
      visto.forEach((v, k) => { if (v.hasta < ahora) visto.delete(k); });
    }
    next();
  };
}

module.exports = { limitador };
