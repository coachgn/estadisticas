#!/usr/bin/env node
/* =====================================================================
   SGADD · Extrae el glosario del manual de MotorStats

     node generar-glosario.js

   El manual `MOTORSTATS_MANUAL_3_RECORRIDO_Y_GLOSARIO.html` vive en el
   repo del MOTOR (`C:\\Users\\Pc\\mi-motor-stats\\manuales`), que es otro
   proyecto. Este script lo lee y escribe `js/sgadd-glosario.js`, que sí
   viaja con el panel.

   POR QUÉ SE COPIA Y NO SE LEE EN VIVO. El panel es un sitio estático que
   se sirve desde GitHub Pages: no tiene acceso al disco de nadie. Y aunque
   lo tuviera, el manual es del motor y cambia con SU calendario — un panel
   que se rompe porque el otro proyecto reordenó una tabla es un
   acoplamiento que no vale la pena.

   Se corre a mano, igual que `generar-css.js` y `generar-logo.js`, y el
   resultado se commitea. Si el manual cambia, se vuelve a correr.

   DE DÓNDE SALE CADA DEFINICIÓN. Las tablas del manual tienen encabezados
   distintos según la sección —unas traen `Fórmula`, otras `Para qué se
   usa`— así que no se asume una forma: se leen los `<th>` de cada tabla y
   se mapea por NOMBRE de columna. Una tabla con otro formato se saltea en
   vez de producir filas con los campos corridos, que es el modo de fallar
   que nadie nota hasta que lee una definición equivocada.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const MANUAL = 'C:\\Users\\Pc\\mi-motor-stats\\manuales\\MOTORSTATS_MANUAL_3_RECORRIDO_Y_GLOSARIO.html';
const DESTINO = path.join(__dirname, 'js', 'sgadd-glosario.js');

/* Los nombres de columna que interesan, y a qué campo van. Se comparan sin
   acentos ni mayúsculas: el manual escribe "Cómo se lee" y "Como se lee"
   según la tabla. */
const CAMPOS = {
  'columna': 'sigla',
  'metrica': 'sigla',
  'abreviatura': 'sigla',
  'nombre completo': 'nombre',
  'nombre internacional': 'nombre',
  'significa': 'nombre',
  'formula': 'formula',
  'como se lee': 'lectura',
  'que te dice': 'lectura',
  'que contiene': 'lectura',
  'que es': 'lectura',
  'para que se usa': 'uso',
  'hoja': 'hoja',
  'hojas': 'hoja',
  'peso': 'peso',
  'familia': 'familia',
};

function normalizar(t) {
  return String(t || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

/** Saca el markup y normaliza los espacios. */
function texto(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function celdas(fila, etiqueta) {
  const re = new RegExp('<' + etiqueta + '[^>]*>([\\s\\S]*?)</' + etiqueta + '>', 'gi');
  const out = [];
  let m;
  while ((m = re.exec(fila))) out.push(texto(m[1]));
  return out;
}

const html = fs.readFileSync(MANUAL, 'utf8');

/* El título de la sección anterior a cada tabla sirve de contexto: en el
   glosario se muestra como el grupo al que pertenece la métrica. */
const secciones = [];
const reTitulo = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
let mt;
while ((mt = reTitulo.exec(html))) secciones.push({ pos: mt.index, titulo: texto(mt[1]) });

function grupoDe(pos) {
  let g = '';
  for (const s of secciones) { if (s.pos < pos) g = s.titulo; else break; }
  return g;
}

const entradas = [];
const vistas = new Set();
let tablasLeidas = 0, tablasSalteadas = 0;

const reTabla = /<table[\s\S]*?<\/table>/gi;
let m;
while ((m = reTabla.exec(html))) {
  const tabla = m[0];
  const filas = tabla.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  if (!filas.length) continue;

  const cabecera = celdas(filas[0], 'th').map(normalizar);
  const mapa = cabecera.map(h => CAMPOS[h] || null);

  /* Sin una columna de sigla no es una tabla de métricas: son las de
     "qué hoja mirar" y las de ejemplos, que no van al glosario. */
  if (mapa.indexOf('sigla') === -1) { tablasSalteadas++; continue; }
  tablasLeidas++;

  const grupo = grupoDe(m.index);

  for (let i = 1; i < filas.length; i++) {
    const c = celdas(filas[i], 'td');
    if (!c.length) continue;

    /* La tabla de familias trae TRES pares columna/familia por fila. Se
       recorre el mapa entero en vez de asumir una sigla por fila, o se
       perderían dos de cada tres. */
    let actual = null;
    for (let j = 0; j < c.length && j < mapa.length; j++) {
      const campo = mapa[j];
      if (!campo) continue;
      if (campo === 'sigla') {
        if (actual && actual.sigla) empujar(actual);
        actual = { sigla: c[j], grupo: grupo };
      } else if (actual) {
        actual[campo] = c[j];
      }
    }
    if (actual && actual.sigla) empujar(actual);
  }
}

function empujar(e) {
  if (!e.sigla || e.sigla.length > 40) return;
  /* Una sigla puede aparecer en dos tablas —el detalle y el resumen de
     familias—. Gana la PRIMERA, que es la de la tabla detallada: la de
     familias solo trae el nombre del grupo. Se completa lo que falte. */
  const clave = e.sigla.toUpperCase();
  const ya = vistas.has(clave) ? entradas.find(x => x.sigla.toUpperCase() === clave) : null;
  if (ya) {
    Object.keys(e).forEach((k) => { if (!ya[k] && e[k]) ya[k] = e[k]; });
    return;
  }
  vistas.add(clave);
  entradas.push(e);
}

/* SE DESCARTA LO QUE NO DEFINE NADA.

   La tabla de referencias cruzadas del manual repite siglas con la hoja
   donde vive cada una (`4F: NET PPP`), sin nombre ni explicacion: son
   punteros, no definiciones. En el glosario aparecian como filas con un
   guion en todas las columnas, que es peor que no estar — el que las ve
   concluye que el glosario esta incompleto.

   El corte es tener AL MENOS una de las tres cosas que a alguien le
   sirven: como se lee, para que se usa, o el nombre completo. */
const utiles = entradas.filter(e => e.lectura || e.uso || e.nombre);
const descartadas = entradas.length - utiles.length;
entradas.length = 0;
utiles.forEach(e => entradas.push(e));

/* CADA ENTRADA CON SU FAMILIA.

   El manual agrupa las métricas en familias con letra (`A · Identificación`,
   `C · Anotación`…) y esa letra ES el orden. Dos tablas del manual no
   traen esa columna:

     · los seis ratings, que viven bajo el título «Ratings»;
     · las cuatro abreviaturas de HOJA (`4F`, `AC`, `BD`, `E / J`), que no
       son métricas sino cómo el manual nombra las planillas.

   Se completan desde el título de su sección, con la letra que les
   corresponde por orden de lectura. NO se inventa una familia nueva: se
   usa el nombre que el propio manual les da. */
const FAMILIA_POR_GRUPO = {
  'Ratings': 'J · Ratings',
};
const SIGLAS_DE_HOJA = ['4F', 'AC', 'BD', 'E / J'];
entradas.forEach((e) => {
  if (e.familia) return;
  if (SIGLAS_DE_HOJA.indexOf(e.sigla) !== -1) { e.familia = 'K · Hojas'; return; }
  if (FAMILIA_POR_GRUPO[e.grupo]) e.familia = FAMILIA_POR_GRUPO[e.grupo];
});

/* Y el `grupo` se descarta: es el título del <h2> anterior a cada tabla,
   que en el manual puede ser una nota al pie («Celdas vacías: no es un
   error») y no una categoría. Sesenta y seis entradas caían ahí. La
   familia es la clasificación de verdad. */
entradas.forEach((e) => { delete e.grupo; });

/* SE ORDENA POR FAMILIA Y DESPUÉS POR SIGLA.

   La letra de la familia (`A · Identificación`, `C · Anotación`) ES el
   orden del manual, y ordenar solo por sigla lo perdía: `grupos()` mira el
   orden en que aparecen las familias en esta lista, así que con las
   entradas alfabéticas devolvía «Anotación, Hojas, Creación…», que no es
   ningún orden. Adentro de cada familia sí manda la sigla. */
entradas.sort((a, b) => {
  const fa = String(a.familia || 'ZZ'), fb = String(b.familia || 'ZZ');
  if (fa !== fb) return fa.localeCompare(fb, 'es');
  return a.sigla.localeCompare(b.sigla, 'es');
});

/* ------------------------------------------------------------- escribir */

const cuerpo = entradas.map((e) => {
  const campos = ['sigla', 'nombre', 'formula', 'lectura', 'uso', 'hoja', 'familia']
    .filter(k => e[k])
    .map(k => '    ' + k + ': ' + JSON.stringify(e[k]) + ',')
    .join('\n');
  return '  {\n' + campos + '\n  },';
}).join('\n');

const salida = `/* =====================================================================
   SGADD · Glosario de métricas · GENERADO, no editar a mano

   Sale de \`MOTORSTATS_MANUAL_3_RECORRIDO_Y_GLOSARIO.html\`, que vive en el
   repo del motor. Para regenerarlo:

       node generar-glosario.js

   NO SE EDITA ACÁ: cualquier cambio se pierde en la próxima corrida. Si una
   definición está mal, se corrige en el manual del motor — que es la fuente
   que el club audita — y se vuelve a generar.

   ${entradas.length} entradas.
   ===================================================================== */

const SGADD_GLOSARIO = (function () {
  'use strict';

  const ENTRADAS = [
${cuerpo}
  ];

  /* Índice por sigla en MAYÚSCULAS: es como se buscan desde el tooltip, y
     el catálogo del panel escribe \`eFG%\` mientras el manual puede escribir
     \`EFG%\`. */
  const PORSIGLA = {};
  ENTRADAS.forEach((e) => { PORSIGLA[e.sigla.toUpperCase()] = e; });

  /** La definición de una sigla, o \`null\`. */
  function buscar(sigla) {
    if (!sigla) return null;
    return PORSIGLA[String(sigla).toUpperCase().trim()] || null;
  }

  /**
   * La definición CORTA, para el tooltip.
   *
   * Se prefiere \`lectura\` sobre \`nombre\`: el nombre completo de \`eFG%\` es
   * "Effective Field Goal Percentage", que no le dice nada a nadie que no
   * lo sepa ya. Lo que sirve en un tooltip es qué significa el número.
   */
  function corta(sigla) {
    const e = buscar(sigla);
    if (!e) return null;
    return e.lectura || e.uso || e.nombre || null;
  }

  /** Busca por sigla, nombre o texto. Sin acentos ni mayúsculas. */
  function filtrar(q) {
    const t = String(q || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
      .toLowerCase().trim();
    if (!t) return ENTRADAS.slice();
    return ENTRADAS.filter((e) => {
      const todo = [e.sigla, e.nombre, e.lectura, e.uso, e.formula, e.familia]
        .filter(Boolean).join(' ')
        .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
      return todo.indexOf(t) !== -1;
    });
  }

  /** Las familias del manual, en su propio orden (la letra las ordena). */
  function grupos() {
    const vistos = [];
    ENTRADAS.forEach((e) => {
      if (e.familia && vistos.indexOf(e.familia) === -1) vistos.push(e.familia);
    });
    return vistos;
  }

  return { ENTRADAS, buscar, corta, filtrar, grupos };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_GLOSARIO;
`;

fs.writeFileSync(DESTINO, salida);

console.log('');
console.log('  tablas de métricas leídas: ' + tablasLeidas + '   (salteadas: ' + tablasSalteadas + ')');
console.log('  entradas: ' + entradas.length + '   (descartadas sin definición: ' + descartadas + ')');
console.log('  con fórmula: ' + entradas.filter(e => e.formula).length);
console.log('  con lectura: ' + entradas.filter(e => e.lectura).length);
console.log('  → js/sgadd-glosario.js  (' + Math.round(salida.length / 1024) + ' KB)');
console.log('');
