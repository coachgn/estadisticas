/* =====================================================================
   Nombre del archivo en las exportaciones a PDF · sgadd-ui.js

   Las cinco superficies que imprimen usan `window.print()`, así que el
   nombre que Chrome propone en "Guardar como PDF" es el `document.title`.
   Antes decía siempre lo mismo —"Deportivo La Plata · Panel de Scouting"—
   y el DT terminaba con una carpeta de archivos homónimos que había que
   abrir para saber cuál era cuál.

   Cubre las tres cosas que pueden salir mal en silencio:

     1. la SANITIZACIÓN: un carácter prohibido no rompe con un error, el
        navegador simplemente no guarda el archivo,
     2. el FALLBACK: una vista a medio cargar no puede dejar el archivo
        sin nombre ni con uno a medias,
     3. la RESTAURACIÓN: si el título no vuelve, la pestaña del navegador
        queda con el nombre de un informe para siempre.
   ===================================================================== */
const fs = require('fs');
const vm = require('vm');
const SGADD_UI = require('./js/sgadd-ui.js');

let ok = 0, fail = 0;
const NL = String.fromCharCode(10);
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));

/* =====================================================================
   NOMBRE DEL ARCHIVO PDF

   Las cuatro exportaciones usan `window.print()`, así que el nombre que
   Chrome propone en "Guardar como PDF" es el `document.title`. Sin esto
   decía siempre lo mismo y el DT terminaba con una carpeta de archivos
   homónimos.
   ===================================================================== */
titulo('NOMBRE DEL ARCHIVO PDF · sanitización');

const S = SGADD_UI.sanearNombreArchivo;

/* Los prohibidos son la UNIÓN de lo que rechaza cada sistema: un informe
   se comparte por WhatsApp y termina abierto en Windows, Mac y Android. */
'/ \\ : * ? " < > |'.split(' ').forEach(c => {
  check('saca el carácter ' + JSON.stringify(c),
    S('Atenas' + c + 'Platense').indexOf(c) === -1, S('Atenas' + c + 'Platense'));
});
check('y los de control, que rompen en cualquier lado',
  S('Atenas' + String.fromCharCode(0) + String.fromCharCode(31) + 'Platense')
    === 'Atenas Platense');

/* Se reemplazan por ESPACIO y no por vacío: sin eso "ATENAS/PLATENSE"
   quedaba "ATENASPLATENSE", un equipo que no existe. */
check('el prohibido deja un espacio, no pega las dos palabras',
  S('ATENAS/PLATENSE') === 'ATENAS PLATENSE', S('ATENAS/PLATENSE'));

check('colapsa espacios múltiples',
  S('Ficha    Atenas     A') === 'Ficha Atenas A', S('Ficha    Atenas     A'));
check('y los separadores flotantes que deja el saneo',
  S('Club - - - Resumen') === 'Club - Resumen', S('Club - - - Resumen'));
check('recorta las puntas',
  S('   Ficha Atenas   ') === 'Ficha Atenas', S('   Ficha Atenas   '));
check('incluido un guión suelto adelante',
  S('- Ficha Atenas') === 'Ficha Atenas', S('- Ficha Atenas'));

/* Windows DESCARTA los puntos finales en silencio: "Ficha Atenas ." se
   guardaría como un archivo distinto del que el usuario escribió. */
check('y los puntos del final, que Windows se come sin avisar',
  S('Ficha Atenas .') === 'Ficha Atenas', S('Ficha Atenas .'));

/* Nombres de dispositivo de MS-DOS que Windows SIGUE reservando: un
   archivo `CON.pdf` no se puede crear y el error no explica por qué. */
['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT9'].forEach(r => {
  check(r + ' no queda como nombre reservado de Windows',
    S(r) !== r && S(r).indexOf(r) === 0, S(r));
});
check('pero un nombre que solo EMPIEZA con uno no se toca',
  S('CONCORDIA') === 'CONCORDIA', S('CONCORDIA'));

/* FALLBACK: una vista a medio cargar no puede dejar el archivo sin
   nombre. Un genérico limpio es mejor que el título de la app repetido. */
[null, undefined, '', '   ', '///', '...', '???'].forEach(v => {
  check('sin nada utilizable cae al respaldo: ' + JSON.stringify(v),
    S(v, 'Ficha_Jugador') === 'Ficha_Jugador', S(v, 'Ficha_Jugador'));
});
check('y sin respaldo declarado usa uno genérico',
  S('') === 'Informe', S(''));

/* El techo de largo no es el límite del sistema sino uno cómodo: un
   nombre de 200 caracteres se corta en la lista de archivos. */
const largo = S('Reconquista '.repeat(30));
check('un nombre larguísimo se recorta', largo.length <= 120, largo.length);
check('y se corta por palabra, no a la mitad de una',
  !/\s$/.test(largo) && largo.indexOf('Reconquist ') === -1, JSON.stringify(largo.slice(-25)));
const pegado = S('R'.repeat(300));
check('sin espacios cerca, se corta duro en vez de devolver tres letras',
  pegado.length === 120, pegado.length);

/* No es destructivo con lo que SÍ es válido. */
check('los acentos y la ñ se conservan',
  S('Muñoz Peña · Ficha') === 'Muñoz Peña · Ficha', S('Muñoz Peña · Ficha'));
check('y los paréntesis de Liga Argentina, que distinguen equipos',
  S('Ficha HINDU (C)') === 'Ficha HINDU (C)', S('Ficha HINDU (C)'));

titulo('NOMBRE DEL ARCHIVO PDF · el giro del nombre de persona');

const NP = SGADD_UI.nombrePersona;
/* La planilla escribe APELLIDO, NOMBRE y todo en mayúsculas; un archivo
   se busca por el nombre como se dice en voz alta. */
check('"PEREZ, JUAN" → "Juan Perez"', NP('PEREZ, JUAN') === 'Juan Perez', NP('PEREZ, JUAN'));
check('apellido compuesto también da vuelta entero',
  NP('RUSSO NOWOSIELSKI, JUAN CRUZ') === 'Juan Cruz Russo Nowosielski',
  NP('RUSSO NOWOSIELSKI, JUAN CRUZ'));
check('sin coma se deja como viene, capitalizado',
  NP('LEBRON JAMES') === 'Lebron James', NP('LEBRON JAMES'));
check('el apóstrofe capitaliza lo que sigue',
  NP("O'CONNOR, SEAN") === "Sean O'Connor", NP("O'CONNOR, SEAN"));
check('y el guión también',
  NP('SAINT-JEAN, LUC') === 'Luc Saint-Jean', NP('SAINT-JEAN, LUC'));
check('los acentos que SÍ están se conservan',
  NP('PEÑA, MARTÍN') === 'Martín Peña', NP('PEÑA, MARTÍN'));
/* NO se inventan acentos: si la planilla escribe "PEREZ", el archivo dice
   "Perez". Un dato que no está no se completa a ojo. */
check('pero NO se inventan los que faltan',
  NP('PEREZ, JUAN') === 'Juan Perez' && NP('PEREZ, JUAN').indexOf('é') === -1);
check('sin nombre devuelve vacío, no una invención',
  NP('') === '' && NP(null) === '' && NP(undefined) === '');
check('una coma sin apellido no deja un espacio colgando',
  NP(', JUAN') === 'Juan', NP(', JUAN'));

titulo('NOMBRE DEL ARCHIVO PDF · las cinco convenciones');

const N = SGADD_UI.nombrePdf;

check('ficha de jugador → el nombre y apellido',
  N('jugador', { jugador: 'PEREZ, JUAN' }) === 'Juan Perez',
  N('jugador', { jugador: 'PEREZ, JUAN' }));
check('scouting → "Scouting vs <rival>"',
  N('scouting', { rival: 'ATENAS' }) === 'Scouting vs ATENAS',
  N('scouting', { rival: 'ATENAS' }));
check('ficha de equipo → "Ficha <equipo>"',
  N('equipo', { equipo: 'RECONQUISTA' }) === 'Ficha RECONQUISTA',
  N('equipo', { equipo: 'RECONQUISTA' }));
check('resumen → "<club> - <categoría> - Resumen"',
  N('resumen', { club: 'Deportivo La Plata', categoria: 'Primera' })
    === 'Deportivo La Plata - Primera - Resumen',
  N('resumen', { club: 'Deportivo La Plata', categoria: 'Primera' }));

/* Los equipos de La Plata se llaman `ATENAS 'A' - MM`. La comilla es
   decorativa y en un nombre de archivo estorba. */
check("la comilla decorativa de ATENAS 'A' se va",
  N('scouting', { rival: "ATENAS 'A'" }) === 'Scouting vs ATENAS A',
  N('scouting', { rival: "ATENAS 'A'" }));

/* El post-partido NO estaba en la convención pedida: se agrega porque es
   la cuarta exportación y dejarla con el nombre del navegador la volvía
   la única sin identificar. */
check('post-partido → el cruce con la fecha',
  N('partido', { local: 'ATENAS A', visitante: 'PLATENSE A', fecha: '05/05' })
    === 'ATENAS A vs PLATENSE A - 05-05',
  N('partido', { local: 'ATENAS A', visitante: 'PLATENSE A', fecha: '05/05' }));
/* La fecha lleva guiones y no barras: la barra es el separador de
   directorios en los tres sistemas y el saneo la borraría. */
check('con la fecha en guiones, porque la barra es un prohibido',
  N('partido', { local: 'A', visitante: 'B', fecha: '05/05' }).indexOf('/') === -1);
/* Es lo ÚNICO que separa la ida de la vuelta contra el mismo rival. */
check('y sin ella los dos cruces darían el MISMO archivo',
  N('partido', { local: 'A', visitante: 'B', fecha: '05/05' }) !==
  N('partido', { local: 'A', visitante: 'B', fecha: '20/08' }));
/* El marcador NO entra: el archivo se busca por el cruce, no por el
   resultado, y un nombre con el resultado adentro se vuelve incómodo de
   compartir cuando se perdió. Se verifica pasándolo y exigiendo que el
   nombre no cambie — un regex sobre dígitos no serviría: la fecha "05-05"
   se parece a un marcador. */
const conCruce = { local: 'ATENAS', visitante: 'PLATENSE', fecha: '05/05' };
check('el marcador no entra en el nombre',
  N('partido', conCruce) ===
  N('partido', Object.assign({ puntosLocal: 88, puntosVisitante: 71, marcador: '88-71' }, conCruce)),
  N('partido', conCruce));

titulo('NOMBRE DEL ARCHIVO PDF · los respaldos de cada convención');

/* ESTRATEGIA DE FALLBACK: si la vista no terminó de cargar, un genérico
   limpio. Nunca el título de la app ni un nombre a medias. */
[
  ['jugador', 'Ficha_Jugador'],
  ['scouting', 'Informe_Scouting'],
  ['equipo', 'Ficha_Equipo'],
  ['partido', 'Informe_Partido'],
  ['resumen', 'Resumen'],
].forEach(([tipo, esperado]) => {
  check(tipo + ' sin datos → ' + esperado, N(tipo, {}) === esperado, N(tipo, {}));
  check(tipo + ' sin el objeto entero → ' + esperado, N(tipo) === esperado, N(tipo));
  check(tipo + ' con los campos en blanco → ' + esperado,
    N(tipo, { jugador: '', rival: '', equipo: '', local: '', visitante: '', club: '', categoria: '' })
      === esperado);
});
/* Un cruce a medio resolver no puede dar "ATENAS vs " colgando. */
check('el post-partido con un solo lado cae al genérico',
  N('partido', { local: 'ATENAS' }) === 'Informe_Partido',
  N('partido', { local: 'ATENAS' }));
/* Con el club solo, "Club - Resumen" ya identifica. */
check('el resumen sin categoría igual identifica al club',
  N('resumen', { club: 'Jujuy Basquet' }) === 'Jujuy Basquet - Resumen',
  N('resumen', { club: 'Jujuy Basquet' }));
check('un tipo que no existe no rompe, cae a genérico',
  N('inventado', { x: 1 }) === 'Informe', N('inventado', { x: 1 }));

titulo('NOMBRE DEL ARCHIVO PDF · el título del documento va y VUELVE');

/* Se asigna justo antes de imprimir y se restaura al terminar: sin eso la
   pestaña del navegador queda con el nombre de un informe para siempre. */
function docFalso() {
  const oyentes = {};
  const g = {
    document: { title: 'Deportivo La Plata · Panel de Scouting' },
    window: {
      addEventListener: (ev, fn) => { (oyentes[ev] = oyentes[ev] || []).push(fn); },
      removeEventListener: (ev, fn) => {
        oyentes[ev] = (oyentes[ev] || []).filter(f => f !== fn);
      },
    },
    setTimeout: () => 0, clearTimeout: () => {},
    console: { log() {}, warn() {} },
    module: { exports: {} },
  };
  g.disparar = (ev) => (oyentes[ev] || []).slice().forEach(f => f());
  g.oyentes = oyentes;
  vm.createContext(g);
  vm.runInContext(fs.readFileSync('./js/sgadd-ui.js', 'utf8'), g, { filename: 'ui' });
  /* `SGADD_UI` se declara con `const` en el nivel superior del módulo, así
     que NO queda como propiedad del contexto: hay que pedírselo al mismo
     ámbito léxico donde se declaró. */
  g.SGADD_UI = vm.runInContext('SGADD_UI', g);
  return g;
}

let g = docFalso();
const original = g.document.title;
g.SGADD_UI.tituloPdf('Juan Perez');
check('el título toma el nombre del informe', g.document.title === 'Juan Perez', g.document.title);
check('y el helper se declara activo', g.SGADD_UI.tituloPdfActivo() === true);
g.disparar('afterprint');
check('afterprint lo devuelve a su lugar', g.document.title === original, g.document.title);
check('y se declara libre otra vez', g.SGADD_UI.tituloPdfActivo() === false);
/* El oyente se desengancha: si se acumulara, cada exportación dejaría uno
   más y el décimo Ctrl+P correría diez restauraciones. */
check('el oyente de afterprint se desengancha',
  (g.oyentes.afterprint || []).length === 0, (g.oyentes.afterprint || []).length);

/* DOS LLAMADAS SEGUIDAS SIN IMPRIMIR EN EL MEDIO. Si la segunda tomara
   como "original" el nombre que puso la primera, la pestaña quedaría con
   el nombre de un informe para siempre. */
g = docFalso();
g.SGADD_UI.tituloPdf('Ficha Atenas');
g.SGADD_UI.tituloPdf('Scouting vs Platense');
check('dos llamadas seguidas no se pisan el título original',
  g.document.title === 'Scouting vs Platense');
g.disparar('afterprint');
check('y vuelve al de la app, no al del primer informe',
  g.document.title === 'Deportivo La Plata · Panel de Scouting', g.document.title);

/* El nombre que llega a `tituloPdf` también se sanea: es el último punto
   por el que pasa todo, así que un llamador que se olvide no puede dejar
   un `/` en el título. */
g = docFalso();
g.SGADD_UI.tituloPdf('Ficha ATENAS/PLATENSE');
check('tituloPdf también sanea lo que le pasan',
  g.document.title.indexOf('/') === -1, g.document.title);
g = docFalso();
g.SGADD_UI.tituloPdf('');
check('y un nombre vacío no deja la pestaña en blanco',
  g.document.title === 'Informe', g.document.title);

titulo('NOMBRE DEL ARCHIVO PDF · las cinco superficies lo usan');

/* UN SOLO LUGAR arma el nombre. Cinco copias de la misma sanitización
   terminan divergiendo — el bug que ya tuvo el rol funcional (punto 8). */
const SUPERFICIES = [
  ['js/sgadd-ficha.js', "nombrePdf('jugador'", 'ficha del jugador'],
  ['js/sgadd-scouting.js', "nombrePdf('scouting'", 'informe pre-partido'],
  ['js/sgadd-informe.js', "nombrePdf('equipo'", 'informe de equipo'],
  ['js/sgadd-equipos.js', "nombrePdf('partido'", 'post-partido'],
  ['index.html', "nombrePdf('resumen'", 'resumen por Ctrl+P'],
];
SUPERFICIES.forEach(([archivo, marca, que]) => {
  const src = fs.readFileSync('./' + archivo, 'utf8');
  check(que + ' nombra su PDF', src.indexOf(marca) !== -1);
});

/* El título se pone ANTES de `window.print()`: Chrome lee el título al
   generar el archivo, así que ponerlo después no cambia nada. */
[['js/sgadd-ficha.js', 'ficha'], ['js/sgadd-scouting.js', 'scouting'],
 ['js/sgadd-informe.js', 'informe'], ['js/sgadd-equipos.js', 'equipos']]
  .forEach(([archivo, que]) => {
    const src = fs.readFileSync('./' + archivo, 'utf8');
    /* Se comparan las posiciones SIN los comentarios: `sgadd-ficha.js` y
       `sgadd-informe.js` nombran `window.print()` en su comentario de
       cabecera, mucho antes del llamado real, y con el fuente crudo el
       test daba rojo por el comentario. */
    const vivo = src.replace(/\/\*[\s\S]*?\*\//g, '');
    check(que + ' lo pone ANTES de imprimir',
      vivo.indexOf('tituloPdf(') !== -1 &&
      vivo.indexOf('tituloPdf(') < vivo.indexOf('window.print()'));
  });

/* El respaldo de Ctrl+P NO puede pisar a una exportación que ya nombró su
   archivo, ni ponerle nombre de informe a una pantalla que no lo es. */
const idxSrc = fs.readFileSync('./index.html', 'utf8');
check('el respaldo de Ctrl+P se corre si una exportación ya nombró',
  /tituloPdfActivo\(\)\) return;/.test(idxSrc));
check('y solo alcanza a Principal y Clasificación',
  /currentSection !== 'principal' && currentSection !== 'clasificacion'/.test(idxSrc));

console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
  '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
