/* =====================================================================
   LA HOJA DEL PDF · orden de las cards, cortes y sin barra naranja

   Tres pedidos del club (2026-09-12) que viven en el mismo lugar —el CSS
   de impresión y el orden del informe— y se fijan juntos:

     1 · en el scouting, «Claves estratégicas» va ARRIBA de «Resto del
         plantel», en pantalla, en el modal y en las hojas del PDF;
     2 · tarjetas, tablas y filas no se parten entre dos hojas, SALVO la
         tabla que firma cada hoja (punto 51), que envuelve el documento
         entero;
     3 · ninguna barra ni borde del acento del club en los márgenes.

   LA CAUSA DE LA BARRA NARANJA SE MIDIÓ EN LOS PDF DEL CLUB: un
   `box-shadow: inset 3px 0 0 var(--acento)` de un `tbody tr:hover`, sin
   `@media screen` y con combinador descendiente. Al imprimir con el mouse
   sobre la hoja Chrome captura `:hover`, y la fila que firma cada hoja
   envuelve todo: la barra salía a lo alto de CADA hoja. Por eso este test
   no busca un color: exige que ningún estado de puntero o de foco pinte
   algo fuera de `@media screen`.

   El CSS se PARSEA respetando los `@media` —no se buscan cadenas sueltas—
   porque la diferencia entre la regla buena y la mala es justamente en
   qué bloque vive.
   ===================================================================== */
'use strict';
const fs = require('fs');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

const HTML = fs.readFileSync('./index.html', 'utf8');
const SCOUT = fs.readFileSync('./js/sgadd-scouting.js', 'utf8');

/* ------------------------------------------------------------ el parser
   Reglas con su pila de at-rules. Sin comentarios —un `@page` nombrado en
   prosa ya engañó a otro test (punto 52)— y sin los `{}` de los strings. */
function reglas(css) {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const pila = [];
  let i = 0, inicio = 0;
  while (i < limpio.length) {
    const ch = limpio[i];
    if (ch === '{') {
      const cab = limpio.slice(inicio, i).trim();
      if (cab.charAt(0) === '@' && !/^@page\b|^@font-face/.test(cab)) {
        pila.push(cab);
        inicio = i + 1;
      } else {
        const fin = limpio.indexOf('}', i);
        out.push({ at: pila.slice(), sel: cab, dec: limpio.slice(i + 1, fin) });
        i = fin; inicio = fin + 1;
      }
    } else if (ch === '}') {
      pila.pop();
      inicio = i + 1;
    }
    i++;
  }
  return out;
}
const estilos = (HTML.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join('\n').replace(/<\/?style[^>]*>/g, '');
const R = reglas(estilos);
const enPrint = (r) => r.at.some(a => /@media[^{]*\bprint\b/.test(a));
const soloPantalla = (r) => r.at.some(a => /@media\s+screen\b/.test(a));
const selectores = (r) => r.sel.split(',').map(s => s.trim());

check('el parser encontró las reglas del <style>', R.length > 500, R.length);
check('y los bloques @media print', R.filter(enPrint).length > 100, R.filter(enPrint).length);

/* =====================================================================
   1 · CLAVES ARRIBA DEL RESTO
   ===================================================================== */
titulo('1 · SCOUTING · «Claves estratégicas» arriba de «Resto del plantel»');

const ids = (SCOUT.slice(SCOUT.indexOf('const SCOUT_CARDS'), SCOUT.indexOf('];', SCOUT.indexOf('const SCOUT_CARDS')))
  .match(/id: '([a-z]+)'/g) || []).map(x => x.slice(5, -1));
check('el modal lista claves antes que resto',
  ids.indexOf('claves') > -1 && ids.indexOf('claves') < ids.indexOf('resto'), ids.join(','));
check('y resto antes que las fichas', ids.indexOf('resto') < ids.indexOf('fichas'));
check('claves va inmediatamente arriba de resto', ids.indexOf('resto') === ids.indexOf('claves') + 1);

const informe = SCOUT.slice(SCOUT.indexOf('${scoutBloqueJugadores(inf)}'));
const pos = (b) => informe.indexOf('${scoutBloque' + b + '(inf)}');
check('la pantalla pinta jugadores → claves → resto → fichas',
  pos('Jugadores') === 0 && pos('Jugadores') < pos('Claves') && pos('Claves') < pos('Resto') && pos('Resto') < pos('Fichas'),
  [pos('Jugadores'), pos('Claves'), pos('Resto'), pos('Fichas')].join(' < '));

/* El PDF imprime el DOM en su orden (las cards destildadas se esconden, no
   se mueven), así que el orden de la pantalla ES el de las hojas. Lo que se
   fija además es DÓNDE se corta: */
const clase = (bloque) => ((SCOUT.match(new RegExp('<section class="([^"]*)"\\s*data-bloque="' + bloque + '">')) || [])[1] || '');
check('las claves NO abren hoja: van en la de la tabla de jugadores que las dispara',
  /\bscout-card\b/.test(clase('claves')) && !/\bscout-pagina\b/.test(clase('claves')), clase('claves'));
check('el resto SÍ abre hoja: la hoja 6 es jugadores + claves y la 7 el banco',
  /\bscout-pagina\b/.test(clase('resto')), clase('resto'));
check('jugadores y fichas siguen abriendo la suya',
  /\bscout-pagina\b/.test(clase('jugadores')) && /\bscout-pagina\b/.test(clase('fichas')));
const salto = R.find(r => enPrint(r) && /\.scout-pagina/.test(r.sel) && /page-break-before:\s*always|break-before:\s*page/.test(r.dec));
check('y `scout-pagina` es la que corta la hoja al imprimir', !!salto);

/* =====================================================================
   2 · LOS CORTES
   ===================================================================== */
titulo('2 · CORTES · tarjetas, tablas y filas no se parten entre hojas');

const evita = (sel) => R.some(r => enPrint(r) && selectores(r).indexOf(sel) > -1
  && /(^|;)\s*break-inside:\s*avoid/.test(r.dec) && /page-break-inside:\s*avoid/.test(r.dec));
['.card', '.scout-card', '.scout-ficha', '.scrollbox', 'table', 'tr', 'tbody tr', 'thead', '.chart-box', '.informe-bloque']
  .forEach(s => check('  ' + s + ' lleva break-inside y page-break-inside: avoid', evita(s)));

const firmada = R.filter(r => enPrint(r) && /hoja-firmada/.test(r.sel));
check('la tabla que firma cada hoja SÍ se parte: envuelve el documento entero',
  firmada.some(r => /table\.hoja-firmada(?![^,]*>)/.test(r.sel) && /break-inside:\s*auto\s*!important/.test(r.dec)
    && /page-break-inside:\s*auto\s*!important/.test(r.dec)));
check('igual que su fila y su celda de cuerpo',
  firmada.some(r => /hoja-firmada > tbody > tr(?!\s*>)/.test(r.sel) && /break-inside:\s*auto\s*!important/.test(r.dec))
  && firmada.some(r => /td\.hoja-cuerpo-celda/.test(r.sel) && /break-inside:\s*auto\s*!important/.test(r.dec)));

/* Las excepciones medidas no se pierden por la regla general (7.6 bis y ter). */
check('los bloques de la ficha del jugador se siguen pudiendo partir',
  R.some(r => enPrint(r) && /#fichaSalida \.informe-bloque/.test(r.sel) && /break-inside:\s*auto/.test(r.dec)));
check('y los `data-hoja` del informe de equipo', R.some(r => enPrint(r) && /\[data-hoja\]/.test(r.sel) && /break-inside:\s*auto/.test(r.dec)));

/* =====================================================================
   3 · SIN BARRA NARANJA
   ===================================================================== */
titulo('3 · SIN BORDES DEL ACENTO EN LOS MÁRGENES DEL PDF');

const pinta = /box-shadow|outline|border(-left|-right|-top|-bottom)?\s*:|background/;
const deEstado = R.filter(r => /:hover|:focus-visible|:focus\b|:active/.test(r.sel) && pinta.test(r.dec)
  && !/^\s*(transition|cursor)/.test(r.dec)
  /* los `:focus-visible` que solo dibujan el anillo de controles (botones,
     campos) no llegan al papel: `@media print` esconde esos controles. */
  && !/^(button|select|input|a|\[tabindex\])(:focus-visible)?$/.test(selectores(r)[0]));
const barras = deEstado.filter(r => /td|tr|tbody/.test(r.sel) && /box-shadow|border/.test(r.dec));
check('las barras de fila por hover o foco existen (el test mira algo)', barras.length >= 3, barras.length);
check('y TODAS viven en @media screen: al imprimir no se capturan',
  barras.every(soloPantalla), barras.filter(r => !soloPantalla(r)).map(r => r.sel).join(' | '));
const fondosFila = deEstado.filter(r => /tbody tr:hover\s*$|tr\.fila-jug:hover > td\s*$/.test(r.sel));
check('ni el fondo de la fila por hover llega al papel', fondosFila.length >= 1 && fondosFila.every(soloPantalla));
check('la barra de hover pinta solo la primera celda PROPIA (`>`), no las de las tablas de adentro',
  R.some(r => soloPantalla(r) && /tbody tr:hover > td:first-child/.test(r.sel))
  && !R.some(r => /tr:hover td:first-child/.test(r.sel) && /box-shadow[^;]*var\(--acento\)/.test(r.dec)));
check('la fila destacada del plantel sigue marcada en los dos medios: la puso el DT',
  R.some(r => !soloPantalla(r) && /#plantelTabla tr\.fila-destacada > td:first-child$/.test(r.sel) && /box-shadow/.test(r.dec)));

const celda = R.find(r => enPrint(r) && /td\.hoja-cuerpo-celda/.test(r.sel) && /box-shadow/.test(r.dec));
check('la celda de la hoja firmada no dibuja sombra, borde, contorno ni fondo',
  !!celda && /box-shadow:\s*none\s*!important/.test(celda.dec) && /outline:\s*0\s*!important/.test(celda.dec)
  && /border:\s*0\s*!important/.test(celda.dec) && /background:\s*transparent\s*!important/.test(celda.dec));

/* Ningún contenedor de la hoja trae un marco propio al imprimir. */
const contenedores = /^(html|body|:root|\.hoja-firmada|table\.hoja-firmada|#fichaSalida|#informeSalida|#rankingSalida|#scoutRoot|#view-root)$/;
const marcos = R.filter(r => enPrint(r) && selectores(r).some(s => contenedores.test(s.replace(/^(body|html)\.modo-[a-z-]+\s+/, '')))
  && /(box-shadow|outline)\s*:\s*(?!none|0)|border(-left|-right|-top|-bottom)?\s*:\s*(?!0|none)[^;]*\b(solid|dashed|double)/.test(r.dec));
check('ni html, ni body, ni los contenedores de salida llevan borde, contorno o sombra al imprimir',
  marcos.length === 0, marcos.map(r => r.sel + ' {' + r.dec.trim().slice(0, 60) + '}').join(' | '));
const paginas = (estilos.replace(/\/\*[\s\S]*?\*\//g, '').match(/@page[^{]*\{[^}]*\}/g) || []);
check('las @page no dibujan bordes', paginas.length >= 3 && paginas.every(p => !/border|outline|box-shadow/.test(p)), paginas.length);

console.log('\n' + '═'.repeat(70));
if (fail === 0) console.log('✓ TODO OK   ' + ok + ' pasaron, 0 fallaron');
else { console.log('✗ HAY FALLAS   ' + ok + ' pasaron, ' + fail + ' fallaron'); process.exit(1); }
