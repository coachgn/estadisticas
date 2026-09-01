/* =====================================================================
   SGADD · Confirmación, zonas por categoría y tooltips de la tabla

       node test-confirmar.js

   Tres cosas distintas que comparten una idea: que nada cambie en
   silencio, y que lo que dice la pantalla sea cierto EN ESA pantalla.
   ===================================================================== */
'use strict';

const fs = require('fs');
const NL = '\n';

let ok = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); }
};
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));

const CONF = require('./js/sgadd-confirmar.js');
const CFG = require('./js/sgadd-config.js');

/* =====================================================================
   EL DIFF
   ===================================================================== */
titulo('EL DIFF · qué cambia, campo por campo');

/* NO SE COMPARA EL OBJETO ENTERO. Un `JSON.stringify` distinto no le dice
   nada a nadie, y además dispararía por cualquier campo que el servidor
   toque por su cuenta —una fecha de último ingreso, un contador— que no
   es un cambio del admin. */
const c1 = CONF.cambiosDeClub({ plan: 'PLATA', estado: 'activo', vence: null },
  { plan: 'ORO', estado: 'activo', vence: '2026-12-31' });
check('detecta el cambio de plan', c1.some(c => c.campo === 'plan'
  && c.antes === 'PLATA' && c.despues === 'ORO'), JSON.stringify(c1));
check('y el de fecha', c1.some(c => c.campo === 'vence' && c.despues === '2026-12-31'));
check('sin inventar los que no cambiaron', c1.length === 2, JSON.stringify(c1));

/* VACÍO CONTRA VACÍO NO ES UN CAMBIO, aunque uno sea `null` y el otro
   `''`: el servidor y el formulario representan «sin dato» de formas
   distintas y eso no es una decisión de nadie. */
check('null y cadena vacía son lo mismo',
  CONF.cambiosDeClub({ vence: null }, { vence: '' }).length === 0);
check('y un campo que no está tampoco cuenta',
  CONF.cambiosDeClub({ plan: 'ORO' }, { plan: 'ORO' }).length === 0);

check('el estado se lee como cambio',
  CONF.cambiosDeClub({ estado: 'activo' }, { estado: 'pausado' })[0].label === 'Estado');

/* Las etiquetas son las que el admin ve, no los nombres de los campos. */
check('las etiquetas están en castellano',
  CONF.CAMPOS.every(c => /^[A-ZÁÉÍÓÚ]/.test(c.label)),
  CONF.CAMPOS.map(c => c.label).join(', '));

/* --- accesos --- */
/* Los mails se comparan como CONJUNTOS: el orden en que el servidor los
   devuelve no es una decisión del admin. */
const a1 = CONF.cambiosDeAccesos([{ email: 'a@x.com' }, { email: 'b@x.com' }],
  [{ email: 'b@x.com' }, { email: 'c@x.com' }]);
check('ve el mail que entra', a1.some(c => c.despues === 'c@x.com' && /nuevo/i.test(c.label)));
check('y el que sale', a1.some(c => c.antes === 'a@x.com' && /eliminado/i.test(c.label)));
check('sin contar el que sigue', a1.length === 2, JSON.stringify(a1));
check('el orden no es un cambio',
  CONF.cambiosDeAccesos([{ email: 'a@x.com' }, { email: 'b@x.com' }],
    [{ email: 'b@x.com' }, { email: 'a@x.com' }]).length === 0);
check('acepta strings además de objetos',
  CONF.cambiosDeAccesos(['a@x.com'], ['a@x.com', 'b@x.com']).length === 1);

/* --- zonas --- */
const res = CONF.resumenZonas({ formatos: {
  r12: { label: 'Regular 12', equiposEsperados: 12, zonas: [
    { id: 'campeon', label: 'Campeón', tono: 'exito', desde: 1, hasta: 1 },
    { id: 'descenso', label: 'Descenso', tono: 'peligro', desde: -2, hasta: null },
  ] },
} });
check('resume el formato con sus zonas', res.length === 1 && res[0].zonas.length === 2);
check('y sus equipos esperados', res[0].equipos === 12);

/* Los cortes se leen en castellano: `-2` es «los 2 últimos», que es lo
   que el admin necesita confirmar antes de publicar. */
check('un corte fijo se lee como el puesto', CONF.corte({ desde: 1, hasta: 1 }) === '1');
check('un rango, como rango', CONF.corte({ desde: 9, hasta: 10 }) === '9–10');
check('y uno negativo dice cuántos son del final',
  CONF.corte({ desde: -2 }) === 'los 2 últimos', CONF.corte({ desde: -2 }));
check('en singular cuando es uno solo',
  CONF.corte({ desde: -1 }) === 'los 1 último', CONF.corte({ desde: -1 }));

/* =====================================================================
   NADA SE MANDA SIN CONFIRMAR
   ===================================================================== */
titulo('EL MODAL NO ES UN CARTEL');

const src = fs.readFileSync('./js/sgadd-confirmar.js', 'utf8');
/* Es la propiedad entera del módulo: si la petición saliera antes, sería
   un aviso y no una confirmación. */
check('la petición vive en `alConfirmar` y no en `abrir`',
  /estado\.alConfirmar = typeof o\.alConfirmar === 'function'/.test(src)
  && /function confirmar\(\)[\s\S]{0,600}fn\(\)/.test(src));
check('cancelar no dispara nada',
  /function cerrar\(\)[\s\S]{0,200}estado\.alConfirmar = null;/.test(src));
/* Sin cambios no hay nada que confirmar: el botón queda apagado en vez de
   mandar una petición que no cambia nada. */
check('sin cambios el botón se apaga', /const nada = !estado\.cambios\.length/.test(src)
  && /\$\{estado\.yendo \|\| nada \? 'disabled'/.test(src));
check('cierra con ESC, como el resto de los modales', /ev\.key === 'Escape'/.test(src));
check('y el foco va al botón de confirmar', /if \(b\) b\.focus\(\)/.test(src));

const hub = fs.readFileSync('./js/sgadd-hub.js', 'utf8');
/* El `confirm()` nativo preguntaba «¿seguimos?» sin decir qué: es lo que
   este modal vino a reemplazar. */
check('el hub ya no usa el confirm() nativo para la baja',
  !/confirm\('Dar de baja/.test(hub) && !/confirm\('Sacar a/.test(hub));
check('la acción de club pasa por el modal',
  /function accionClub[\s\S]{0,900}SGADD_CONFIRMAR\.abrir\(/.test(hub));
check('y la de accesos también',
  /function accionAcceso[\s\S]{0,1400}SGADD_CONFIRMAR\.abrir\(/.test(hub));
/* La petición quedó en una función aparte, que solo llama el modal. */
check('la petición está separada del handler',
  /function aplicarClub\(/.test(hub) && /function aplicarAcceso\(/.test(hub));
/* SIN el módulo cargado, la pantalla sigue funcionando: es una mejora, no
   una dependencia dura. */
check('sin el módulo, el hub sigue andando',
  /typeof SGADD_CONFIRMAR === 'undefined'\) return aplicarClub/.test(hub));

const cui = fs.readFileSync('./js/sgadd-configui.js', 'utf8');
check('publicar también confirma',
  /function configPublicar[\s\S]{0,1600}SGADD_CONFIRMAR\.abrir\(/.test(cui));
check('y muestra el resumen de zonas, no una lista de campos',
  /zonas: SGADD_CONFIRMAR\.resumenZonas\(b\)/.test(cui));
/* Publicar es de ADMIN y necesita backend: sin las dos cosas, el botón no
   se ofrece — uno que no puede hacer nada invita a clickearlo. */
check('publicar es solo para admin con backend',
  /function configPuedePublicar[\s\S]{0,300}rol\(\) === 'ADMIN'/.test(cui)
  && /apiConfigurada\(\)/.test(cui));
check('y «guardar en este navegador» sigue existiendo',
  /Guardar en este navegador/.test(cui));

/* =====================================================================
   ZONAS POR CATEGORÍA
   ===================================================================== */
titulo('SUBCLIENTES · cada categoría con sus propias zonas');

const club = { competencia: {
  formatos: { club: { label: 'Del club', equiposEsperados: 12,
    zonas: [{ id: 'descenso', desde: -2, tono: 'peligro' }] } },
  porTramo: { '*': 'club' },
  porCategoria: {
    'reconquista-u21': {
      formatos: { u21: { label: 'U21', equiposEsperados: 13,
        zonas: [{ id: 'campeon', desde: 1, hasta: 1, tono: 'exito' }] } },
      porTramo: { '*': 'u21' },
    },
  },
} };

const rPrim = CFG.resolver(club, 'GENERAL', 'REGULAR', 'reconquista-primera');
const rU21 = CFG.resolver(club, 'GENERAL', 'REGULAR', 'reconquista-u21');

/* EL AISLAMIENTO ES LA PROPIEDAD. Las claves de `porTramo` son
   `TORNEO|FASE`, y dos categorías con la misma clave —`GENERAL|REGULAR`
   es lo más común de todo— compartían zonas sin que nadie lo pidiera:
   bajar el descenso en Primera se lo bajaba también a la U21. */
check('la U21 usa SU formato', rU21.formato.label === 'U21', rU21.formato.label);
check('y Primera el del club', rPrim.formato.label === 'Del club', rPrim.formato.label);
check('con sus propios equipos esperados',
  rU21.formato.equiposEsperados === 13 && rPrim.formato.equiposEsperados === 12,
  rU21.formato.equiposEsperados + '/' + rPrim.formato.equiposEsperados);
check('y sus propias zonas',
  rU21.formato.zonas[0].id === 'campeon' && rPrim.formato.zonas[0].id === 'descenso');

/* `propio` dice si la categoría tiene reglas suyas o hereda las del club:
   sin eso, el DT no puede saber si lo que edita le cambia la tabla a las
   otras categorías. */
check('se sabe si la categoría hereda o tiene lo suyo',
  rU21.propio === true && rPrim.propio === false);

/* DEGRADA SOLO: un club sin `porCategoria` se comporta exactamente como
   antes, que es el caso de los tres clientes de hoy. */
const simple = { competencia: { formatos: { x: { label: 'X', zonas: [] } }, porTramo: { '*': 'x' } } };
check('un club sin porCategoria no cambia',
  CFG.resolver(simple, 'G', 'R', 'la-que-sea').formato.label === 'X');
check('ni sin categoría abierta',
  CFG.resolver(club, 'GENERAL', 'REGULAR', null).formato.label === 'Del club');

/* NO SE FUSIONAN los dos niveles: el que gana, gana entero. Mezclar zonas
   de dos orígenes daría cascadas que ninguno de los dos declaró. */
check('el bloque de la categoría NO hereda formatos del club',
  Object.keys(CFG.parsear(club).porCategoria['reconquista-u21'].formatos).join(',') === 'u21',
  Object.keys(CFG.parsear(club).porCategoria['reconquista-u21'].formatos).join(','));

/* La recursión es de UN nivel: una categoría no tiene sub-categorías. */
const anidado = { competencia: { formatos: { a: { label: 'A', zonas: [] } }, porTramo: { '*': 'a' },
  porCategoria: { uno: { formatos: { b: { label: 'B', zonas: [] } }, porTramo: { '*': 'b' },
    porCategoria: { dos: { formatos: { c: { label: 'C', zonas: [] } } } } } } } };
check('no hay sub-sub-categorías',
  CFG.parsear(anidado).porCategoria.uno.porCategoria === undefined);

/* --- la cascada de tres niveles --- */
const cas = fs.readFileSync('./js/sgadd-config.js', 'utf8');
check('la cascada es borrador → publicado → JSON del repo',
  cas.indexOf("origen: 'local'") < cas.indexOf("origen: 'publicado'")
  && cas.indexOf("origen: 'publicado'") < cas.indexOf("origen: base ? 'json'"));
check('y en Node, sin catálogo, no rompe', CFG.publicado('x') === null);

/* =====================================================================
   LO QUE SE PUBLICA
   ===================================================================== */
titulo('LA ACCIÓN `zonas` DEL CATÁLOGO');

const M = require('./server/lib/catalogo-mutar.js');
const cat = { reconquista: { nombre: 'Reconquista', categorias: { p: { label: 'Primera', sheetId: 'X' } } } };
const bloque = { formatos: { a: { label: 'Regular 12', zonas: [{ id: 'descenso', desde: -2, tono: 'peligro' }] } }, porTramo: { '*': 'a' } };

let m = M.aplicar(cat, 'zonas', { club: 'reconquista', competencia: bloque }, () => null);
check('publica el bloque', m.ok && !!m.catalogo.reconquista.competencia);
/* SE GUARDA EL BLOQUE ENTERO, no un parche: fusionar dos orígenes daría
   cascadas que ninguno declaró. */
check('y lo guarda tal cual',
  JSON.stringify(m.catalogo.reconquista.competencia) === JSON.stringify(bloque));

const borrado = M.aplicar(m.catalogo, 'zonas', { club: 'reconquista', competencia: null }, () => null);
/* Un bloque vacío devuelve el club al JSON del repo: es la única forma de
   deshacer sin tener que adivinar cómo era antes. */
check('publicar vacío lo borra',
  borrado.ok && borrado.catalogo.reconquista.competencia === undefined);

const sinF = M.aplicar(cat, 'zonas', { club: 'reconquista', competencia: {} }, () => null);
check('un bloque sin formatos se rechaza', !sinF.ok, sinF.motivo);
check('y el mensaje dice cómo vaciarlo de verdad',
  /publicalo vacio/i.test(sinF.motivo), sinF.motivo);
check('un club que no existe, también', !M.aplicar(cat, 'zonas', { club: 'zzz', competencia: bloque }, () => null).ok);
check('y un bloque que no es objeto',
  !M.aplicar(cat, 'zonas', { club: 'reconquista', competencia: 'texto' }, () => null).ok);

/* LAS ZONAS VAN PARA TODOS, no solo para el admin: es cómo se pinta la
   tabla del cliente, y dejarla del lado del admin haría que publicar no
   sirviera de nada. */
const catalogo = require('./server/lib/catalogo.js');
const pubCliente = catalogo.publico(m.catalogo, { admin: false })[0];
const pubAdmin = catalogo.publico(m.catalogo, { admin: true })[0];
check('el cliente recibe las zonas', !!pubCliente.competencia);
check('y el admin también', !!pubAdmin.competencia);
/* Pero el estado comercial sigue siendo solo del admin. */
check('sin que se le filtre el plan al cliente',
  pubCliente.plan === undefined && pubAdmin.plan !== undefined);

/* =====================================================================
   LOS TOOLTIPS DE LA TABLA DE POSICIONES
   ===================================================================== */
titulo('LA TABLA DE POSICIONES DICE QUÉ ES CADA COLUMNA');

const clasif = fs.readFileSync('./js/sgadd-clasificacion.js', 'utf8');
const esperado = {
  'Pos': /Posici/, 'PJ': /Partidos Jugados/, 'PG': /Partidos Ganados/,
  'PP': /Partidos Perdidos/, 'PG L': /Ganados de Local/, 'PP L': /Perdidos de Local/,
  'PG V': /Ganados de Visitante/, 'PP V': /Perdidos de Visitante/,
  'PF': /Puntos a Favor/, 'PC': /Puntos en Contra/, 'Dif': /Diferencia de Puntos/,
  'PCT%': /Porcentaje de Victorias/, 'PF/P': /Puntos a Favor por Partido/,
  'PC/P': /Puntos en Contra por Partido/,
};
Object.keys(esperado).forEach((k) => {
  const re = new RegExp("'" + k.replace(/[%/]/g, m2 => '\\' + m2) + "': '([^']+)'");
  const m3 = clasif.match(re);
  check('  ' + k + ' se explica', !!m3 && esperado[k].test(m3[1]), m3 && m3[1]);
});

/* LA COLISIÓN QUE JUSTIFICA TODO ESTO: `PP` acá es «Partidos Perdidos» y
   en el glosario del motor es «Pérdidas», que es cierto en el box score y
   falso en esta tabla. Un tooltip que dice algo verdadero en otro lado es
   peor que no decir nada. */
const GL = require('./js/sgadd-glosario.js');
check('el glosario dice OTRA cosa para PP',
  /rdida/i.test((GL.buscar('PP') || {}).nombre || ''), (GL.buscar('PP') || {}).nombre);
/* Se mira el CODIGO, no los comentarios: el de arriba explica justamente
   por que no se usa `data-metrica`, y nombrarlo ahi hacia fallar al test
   por decir la verdad. Es la trampa que este proyecto ya se comio tres
   veces. */
const clasifSinComentarios = clasif.replace(/\/\*[\s\S]*?\*\//g, '');
check('por eso la tabla usa `data-glosa` y NO `data-metrica`',
  /data-glosa="\$\{SGADD_UI\.esc\(g\)\}"/.test(clasif)
  && !/data-metrica/.test(clasifSinComentarios));

const ui = fs.readFileSync('./js/sgadd-glosarioui.js', 'utf8');
check('la glosa local GANA sobre el glosario',
  /const glosa = \(el && el\.getAttribute\)[\s\S]{0,200}glosa \? \{ sigla: sigla, lectura: glosa \}/.test(ui));
check('y un elemento con solo glosa es candidato',
  /\[data-glosa\]/.test(ui));
/* `Equipo` no es una sigla: explicarla sería ruido, y sin glosa el
   tooltip ni la considera. */
check('la columna Equipo no lleva glosa',
  !/'Equipo': '/.test(clasif));

/* =====================================================================
   UI · lo que se pidio con una captura
   ===================================================================== */
titulo('LOS ENCABEZADOS, EL RESALTE Y LA BARRA DE ACCIONES');

{
  const idx2 = fs.readFileSync('./index.html', 'utf8');

  /* Los valores van centrados y los titulos a la izquierda: en una
     columna angosta el titulo queda colgado del borde y no se lee sobre su
     propia columna. */
  check('los encabezados de tabla van centrados',
    idx2.indexOf('.scrollbox table th:not(:first-child):not(.text-left) { text-align: center') !== -1);
  /* LA PRIMERA COLUMNA NO: es el nombre, y ahi la izquierda es lo
     correcto — un nombre centrado en una columna de ancho variable baila
     de fila en fila. */
  check('menos la primera, que es el nombre',
    /:not\(:first-child\)/.test(idx2));
  /* Y un `th` que pide `text-left` a mano tampoco: hay columnas de texto
     que no son la primera. */
  /* Y LA TABLA DE POSICIONES NO PIDE `text-left` PARA TODAS. Pedia, y por
     eso la regla de arriba la respetaba y la dejaba sin centrar — que es
     justo la tabla de la captura. Ahora la alineacion se decide por
     columna: las dos primeras a la izquierda, el resto centradas. */
  const clasif2 = fs.readFileSync('./js/sgadd-clasificacion.js', 'utf8');
  check('la tabla de posiciones centra de la tercera en adelante',
    /i < 2 \? ' text-left' : ' text-center'/.test(clasif2));
  check('y su clase base ya no fuerza la izquierda',
    /const thBase = 'px-3 py-2\.5 text-\[10px\]/.test(clasif2));

  check('y las que piden alinearse a mano se respetan',
    /:not\(\.text-left\)/.test(idx2));

  /* EL RESALTE DEL EQUIPO PROPIO sirve para encontrar a los tuyos entre
     doce rivales. Adentro de un plantel son TODOS del mismo club:
     pintarlos a todos no distingue a nadie y le compite al unico resalte
     que ahi si informa, la columna por la que se ordena. */
  const jug = fs.readFileSync('./js/sgadd-jugadores.js', 'utf8');
  check('el ranking del plantel no resalta al equipo propio',
    /const propio = \(r\.ambito !== 'plantel'\) && SGADD\.esEquipoPropio/.test(jug));
  check('pero el de la liga si', /esEquipoPropio\(f\.claveEquipo\)/.test(jug));

  /* PUBLICAR es la accion principal y va sola arriba: las cuatro estaban
     en fila y la unica que le cambia algo al cliente quedaba tercera. */
  const cui2 = fs.readFileSync('./js/sgadd-configui.js', 'utf8');
  /* Se comparan los BOTONES, no las apariciones en el archivo: el texto
     tambien aparece en los comentarios que explican la diferencia, y ahi
     el orden no significa nada. Es la trampa de siempre. */
  const botones = (cui2.match(/>\s*(Publicar en el cliente|Guardar en este navegador)</g) || [])
    .map(x => x.replace(/[><\s]/g, ''));
  check('publicar va primero y solo',
    botones[0] === 'Publicarenelcliente', botones.join(' | '));
  check('y se explica que es la via automatica',
    /Es la v\u00eda autom\u00e1tica|Es la vía automática/.test(cui2));
  /* La diferencia entre las tres es la que hace que un cambio le llegue al
     club o se quede en una computadora. Va en la pantalla, no en un
     tooltip. */
  check('las tres acciones se explican en pantalla',
    /<dt[^>]*>Publicar</.test(cui2) && /<dt[^>]*>Guardar ac/.test(cui2)
    && /<dt[^>]*>Exportar JSON</.test(cui2));
  check('y se dice por que exportar es manual',
    /no puede escribir[\s\S]{0,60}archivos del repositorio/.test(cui2));

  /* La preconfiguracion es la pantalla mas abstracta del panel: declara
     una estructura que todavia no tiene datos. Sin decir que decide, se
     lee como un formulario administrativo. */
  check('la preconfiguracion dice para que sirve',
    /estructura del torneo<\/strong>: fases, zonas/.test(cui2));
  check('y que calcula con eso',
    /Posiciones<[\s\S]{0,200}Simulador</.test(cui2));
}

console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
  '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
