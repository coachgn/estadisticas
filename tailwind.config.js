/* =====================================================================
   SGADD · configuración de Tailwind

   ES LA MISMA que vivía en el <script> del <head> del index.html cuando
   Tailwind se servía por CDN. Se movió acá para poder generar el CSS de
   una vez y dejar de bajar el motor JIT en cada visita: eran ~400 KB
   sincronos en el <head> que dejaban la pantalla en blanco 26 segundos
   con red lenta (medido a 200 kbps).

   Los colores POR CLUB no están acá y no tienen que estar: viven en
   variables CSS (`--acento`, `--acento-texto`, `--acento-papel`) que
   `sgadd-club.js` escribe en runtime. Lo que se congela es lo estático.

   Se regenera a mano con `node generar-css.js`, igual que el manual de
   etiquetas. Si se agrega una clase nueva hay que volver a correrlo.
   ===================================================================== */
module.exports = {
  content: ['./index.html', './js/*.js'],
  theme: {
    extend: {
      colors: {
        base: '#0B1121',       /* Fondo principal oscuro navy */
        surface: '#111827',    /* Fondo de las tarjetas */
        surface2: '#1F2937',   /* Hover en filas y botones */
        hairline: '#374151',   /* Bordes más suaves */
        accent: '#FBBF24',     /* Amarillo dorado de la imagen */
        accentdeep: '#D97706',
        ink: '#F9FAFB',        /* Texto principal blanco */
        muted: '#9CA3AF',      /* Texto secundario gris */
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'sans-serif'],
        body: ['"Barlow"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
    },
  },
};
