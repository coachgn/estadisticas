/* =====================================================================
   Genera `sgadd.css` desde `tailwind.config.js` + `sgadd.in.css`.

   Se corre A MANO, igual que `generar-manual-etiquetas.js`:

       node generar-css.js

   POR QUÉ existe este archivo y no un `npx` suelto en la documentación:
   la versión y las banderas tienen que ser siempre las mismas. Si uno
   regenera con Tailwind 4 sobre una config de la 3, el CSS sale distinto
   y la diferencia no se ve hasta que alguien abre una sección puntual.

   CUÁNDO hay que correrlo: cada vez que se agrega una clase de Tailwind
   que no estaba en el proyecto. El scan es ESTÁTICO — solo ve lo que
   está literal en `index.html` y en `js/*.js`—, así que una clase armada
   por concatenación en runtime NO la va a encontrar.

   Se midió antes de migrar: de las 278 clases vivas del DOM (3 clubes ×
   6 secciones + ficha de equipo), las 278 estaban literales en el
   fuente. Por eso hoy no hay safelist. Si alguna vez hace falta una, va
   en `tailwind.config.js` y con el comentario de por qué.
   ===================================================================== */
const { execSync } = require('child_process');

const VERSION = 'tailwindcss@3';   /* la misma major que servía el CDN */
const CMD = 'npx --yes ' + VERSION +
  ' -c tailwind.config.js -i sgadd.in.css -o sgadd.css --minify';

console.log('Generando sgadd.css con ' + VERSION + '…');
try {
  /* `execSync` con un comando armado, y no `execFileSync('npx.cmd', …)`:
     desde la corrección de CVE-2024-27980 Node se niega a ejecutar un .cmd
     sin shell, y en Windows `npx` ES `npx.cmd`. Falla con ENOENT aunque el
     comando ande perfecto tipeado a mano, que es la pista más engañosa
     posible. Los argumentos son todos constantes de este archivo, así que
     no hay nada que escapar. */
  execSync(CMD, { stdio: 'inherit', cwd: __dirname });
} catch (e) {
  console.error('\nFalló la generación. Hace falta salida a npm la primera vez;');
  console.error('después queda en el caché de npx.');
  process.exit(1);
}

const { statSync } = require('fs');
const kb = Math.round(statSync(__dirname + '/sgadd.css').size / 1024);
console.log('\nListo: sgadd.css · ' + kb + ' KB');
console.log('Acordate de subir el ?v= del <link> en el index.html.');
