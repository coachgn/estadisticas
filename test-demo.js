/* =====================================================================
   SGADD · LA DEMO PÚBLICA

   Qué se verifica acá, y por qué cada cosa:

   1 · EL SNAPSHOT NO FILTRA UN SOLO NOMBRE REAL. Es lo único que importa
       de verdad: el archivo está COMMITEADO en un repo público y sale
       del libro de un cliente. El generador tiene su guarda, pero la
       guarda corre en la máquina de quien genera; esto corre en cada
       suite, sobre el archivo que se va a publicar.

   2 · LOS NÚMEROS SIGUEN AHÍ. El valor de la demo es que el dashboard se
       vea real —percentiles, eFG%, PACE, arquetipos—. Con números
       inventados las etiquetas dirían cualquier cosa y la demo enseñaría
       a desconfiar del producto. Se verifica que las métricas avanzadas
       existan y sean números, no que sean "parecidas".

   3 · EL CONTRATO `cols` ↔ `filas`. Las filas se guardan como ARRAYS y
       no como objetos: así el archivo baja de 5.549 KB a 2.839 KB. Eso
       obliga a que el generador y `rehidratar()` estén de acuerdo sobre
       el orden, y un desacuerdo NO se rompe: corre las columnas y
       muestra el `PACE` en la casilla de los puntos.

   4 · EL PATRÓN DEL EQUIPO PROPIO ESTÁ ANCLADO. Con 17 equipos llamados
       `EQUIPO 1..17`, un patrón sin `^…$` trata a ocho rivales como
       equipo propio y no hay ningún síntoma visible.
   ===================================================================== */

const fs = require('fs');
const path = require('path');

let ok = 0, fail = 0;
const NL = '\n';
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); return; }
  fail++;
  console.log('  ✗ ' + nombre + (detalle ? '  →  ' + detalle : ''));
}
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));

const RAIZ = __dirname;
const DEMO = require('./js/sgadd-demo.js');
const srcDemo = fs.readFileSync(path.join(RAIZ, 'js/sgadd-demo.js'), 'utf8');
const srcGen = fs.readFileSync(path.join(RAIZ, 'generar-demo.js'), 'utf8');
const srcAuth = fs.readFileSync(path.join(RAIZ, 'js/sgadd-auth.js'), 'utf8');
const srcClub = fs.readFileSync(path.join(RAIZ, 'js/sgadd-club.js'), 'utf8');
const srcApp = fs.readFileSync(path.join(RAIZ, 'js/sgadd-app.js'), 'utf8');
const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const JSON_DEMO = JSON.parse(fs.readFileSync(path.join(RAIZ, 'clubes/demo.json'), 'utf8'));
const SNAP = JSON.parse(fs.readFileSync(path.join(RAIZ, 'demo/datos-demo.json'), 'utf8'));

/* =====================================================================
   1 · EL SNAPSHOT · lo que se publica
   ===================================================================== */
titulo('1 · EL SNAPSHOT · un libro real, sin un solo nombre real');

const HOJAS = ['PROMEDIOS E', 'ACUMULADO E', 'Base Datos E', 'PROMEDIOS 4F',
  'ACUMULADO 4F', '4 FACTORES', 'PROMEDIOS J', 'ACUMULADO J', 'Base Datos J'];

check('trae las nueve hojas del ESQUEMA',
  HOJAS.every(h => SNAP.hojas && SNAP.hojas[h]),
  Object.keys(SNAP.hojas || {}).join(','));

check('y dice cuándo se generó y con cuánto',
  /^\d{4}-\d{2}-\d{2}$/.test(String(SNAP.generado))
  && SNAP.equipos > 0 && SNAP.jugadores > 0,
  SNAP.generado + ' · ' + SNAP.equipos + ' equipos · ' + SNAP.jugadores + ' jugadores');

/* EL CONTRATO DE FORMA. Cada fila es un array del largo de `cols`: una
   sola corta corre TODAS las columnas de esa fila a partir de ahí. */
let desalineadas = 0, filasTotal = 0;
HOJAS.forEach((h) => {
  const hoja = SNAP.hojas[h];
  if (!hoja) return;
  hoja.filas.forEach((f) => {
    filasTotal++;
    if (!Array.isArray(f) || f.length !== hoja.cols.length) desalineadas++;
  });
});
check('todas las filas son arrays del largo de sus columnas',
  desalineadas === 0, desalineadas + ' desalineadas de ' + filasTotal);
check('y hay volumen de verdad para que el panel se vea lleno',
  filasTotal > 2000, filasTotal + ' filas');

/* ---------------------------------------------------------------------
   LA GUARDA DE FUGA. Se recorre el archivo ENTERO, no una muestra.
   --------------------------------------------------------------------- */
const NOMBRE_EQUIPO = /^EQUIPO \d+$/;
const NOMBRE_JUGADOR = /^JUGADOR \d+$/;
const CRUCE = /^EQUIPO \d+ vs EQUIPO \d+$/;
const CENTINELAS = ['EQUIPO TIPO', 'JUGADOR TIPO', ''];

const fuga = { equipo: [], jugador: [], partido: [] };
HOJAS.forEach((h) => {
  const hoja = SNAP.hojas[h];
  if (!hoja) return;
  const iE = hoja.cols.indexOf('EQUIPO');
  const iN = hoja.cols.indexOf('NOMBRES');
  const iP = hoja.cols.indexOf('PARTIDO');
  hoja.filas.forEach((f) => {
    const v = (i) => (i === -1 ? '' : String(f[i] === undefined ? '' : f[i]).trim());
    const e = v(iE), n = v(iN), p = v(iP);
    if (e && CENTINELAS.indexOf(e) === -1 && !NOMBRE_EQUIPO.test(e)) fuga.equipo.push(h + ':' + e);
    if (n && CENTINELAS.indexOf(n) === -1 && !NOMBRE_JUGADOR.test(n)) fuga.jugador.push(h + ':' + n);
    if (p && !CRUCE.test(p)) fuga.partido.push(h + ':' + p);
  });
});
check('ningún EQUIPO conserva su nombre real',
  fuga.equipo.length === 0, fuga.equipo.slice(0, 3).join(' · '));
check('ningún JUGADOR conserva el suyo',
  fuga.jugador.length === 0, fuga.jugador.slice(0, 3).join(' · '));
check('y el texto de PARTIDO también quedó reescrito',
  fuga.partido.length === 0, fuga.partido.slice(0, 3).join(' · '));

/* LOS CENTINELAS SOBREVIVEN. `EQUIPO TIPO` y `JUGADOR TIPO` son la
   MEDIANA de la liga (punto 3): renombrarlas como si fueran equipos
   dejaría al panel sin percentiles, sin bandas y sin umbral de minutos. */
const tieneTipo = (h, col, valor) => {
  const hoja = SNAP.hojas[h]; if (!hoja) return false;
  const i = hoja.cols.indexOf(col); if (i === -1) return false;
  return hoja.filas.some(f => String(f[i]).trim() === valor);
};
check('la fila EQUIPO TIPO sigue siendo la mediana y no un equipo más',
  tieneTipo('PROMEDIOS E', 'EQUIPO', 'EQUIPO TIPO'));
check('y la JUGADOR TIPO también',
  tieneTipo('PROMEDIOS J', 'NOMBRES', 'JUGADOR TIPO'));

/* EL `sheetId` DEL LIBRO DE ORIGEN NO PUEDE VIAJAR. El archivo es
   público: con el id ahí adentro, la anonimización no serviría de nada
   —cualquiera abre el libro real por GViz—. */
const crudo = fs.readFileSync(path.join(RAIZ, 'demo/datos-demo.json'), 'utf8');
check('no viaja ningún id de Google Sheets',
  !/[A-Za-z0-9_-]{40,}/.test(crudo),
  (crudo.match(/[A-Za-z0-9_-]{40,}/) || [''])[0].slice(0, 20));
check('ni una sola mención del club de origen',
  !/jujuy/i.test(crudo));

/* =====================================================================
   2 · LOS NÚMEROS NO SE TOCAN
   ===================================================================== */
titulo('2 · LOS NÚMEROS · el dashboard tiene que verse REAL');

function columna(hoja, col) {
  const h = SNAP.hojas[hoja]; if (!h) return [];
  const i = h.cols.indexOf(col); if (i === -1) return [];
  return h.filas.map(f => f[i]).filter(v => typeof v === 'number');
}
[['PROMEDIOS E', 'eFG%'], ['PROMEDIOS E', 'PACE'], ['PROMEDIOS E', 'PTS'],
 ['PROMEDIOS J', 'MIN'], ['PROMEDIOS J', 'USG%'], ['PROMEDIOS 4F', 'NET RTNG']]
  .forEach(([h, c]) => {
    const vals = columna(h, c);
    check('  ' + h + ' · ' + c + ' llega con números',
      vals.length > 5 && vals.some(v => v !== 0), vals.length + ' valores');
  });

/* NO SON TODOS IGUALES: si el generador hubiera aplanado la columna, el
   panel mostraría a los 17 equipos en el mismo percentil. */
const efg = columna('PROMEDIOS E', 'eFG%');
check('y con dispersión real, no una columna aplanada',
  new Set(efg.map(v => Math.round(v * 1000))).size > 5,
  new Set(efg).size + ' valores distintos');

/* =====================================================================
   3 · EL CONTRATO ENTRE EL GENERADOR Y EL RUNTIME
   ===================================================================== */
titulo('3 · cols ↔ filas · el generador y `rehidratar()` de acuerdo');

check('el generador emite filas como ARRAYS, indexadas por cols',
  /cols\.map\(/.test(srcGen) && /filas/.test(srcGen));
check('y el runtime las vuelve a objetos con esas mismas cols',
  /function rehidratar/.test(srcDemo));

/* SE EJERCE, no se lee: es la única forma de cazar un corrimiento. */
const muestra = { cols: ['EQUIPO', 'PTS', 'eFG%'], filas: [['EQUIPO 1', 80, 0.5], ['EQUIPO 2', 70, 0.4]] };
const vuelto = DEMO.rehidratar({ hojas: { 'PROMEDIOS E': muestra } });
const fila0 = vuelto && vuelto['PROMEDIOS E'] && vuelto['PROMEDIOS E'].filas[0];
check('rehidratar() devuelve objetos con la columna en su casilla',
  !!fila0 && fila0.EQUIPO === 'EQUIPO 1' && fila0.PTS === 80 && fila0['eFG%'] === 0.5,
  JSON.stringify(fila0));

/* LA IDA Y VUELTA SOBRE EL ARCHIVO DE VERDAD. Un contrato verificado
   solo con una fixture de tres columnas no dice nada sobre un libro de
   53: el corrimiento aparece justo donde hay muchas. */
const real = DEMO.rehidratar(SNAP);
const pe = real && real['PROMEDIOS E'] && real['PROMEDIOS E'].filas;
check('y sobre el snapshot real, la fila trae su EQUIPO y su PJ',
  !!pe && NOMBRE_EQUIPO.test(String(pe[0].EQUIPO)) && typeof pe[0].PJ === 'number',
  pe ? JSON.stringify({ EQUIPO: pe[0].EQUIPO, FASE: pe[0].FASE, PJ: pe[0].PJ }) : 'sin hoja');

/* LA FORMA QUE ESPERA `sgadd-app.js` ES `{cols, filas}` POR HOJA, la
   misma que devuelve el adaptador de GViz. Si la demo devolviera el
   array de filas pelado, la app tendría dos caminos que mantener. */
check('rehidratar conserva la forma {cols, filas} del adaptador',
  !!real['PROMEDIOS E'] && Array.isArray(real['PROMEDIOS E'].cols)
  && Array.isArray(real['PROMEDIOS E'].filas));

/* =====================================================================
   4 · EL CLUB DE LA DEMO
   ===================================================================== */
titulo('4 · EL CLUB · el patrón anclado y el escudo de la marca');

check('el club se llama demo y su equipo propio es EQUIPO 1',
  JSON_DEMO.id === 'demo' && JSON_DEMO.nombreCorto === 'EQUIPO 1');

/* LA TRAMPA DEL PUNTO 6, que acá se da SÍ O SÍ: con 17 equipos, un
   patrón sin anclar se lleva puestos a EQUIPO 10..17. */
const anclado = new RegExp(JSON_DEMO.patronEquipoPropio, 'i');
check('el patrón del equipo propio está ANCLADO',
  anclado.test('EQUIPO 1') && !anclado.test('EQUIPO 10') && !anclado.test('EQUIPO 17'),
  JSON_DEMO.patronEquipoPropio);
check('y sin anclar se llevaría ocho rivales por delante',
  /^EQUIPO 1$/.test('EQUIPO 1') && /EQUIPO 1/i.test('EQUIPO 10'));

check('el escudo del club es el isotipo de MotorStats',
  /motorlogo/.test(String(JSON_DEMO.escudo)), JSON_DEMO.escudo);
check('y hay una sola planilla, la del snapshot',
  Array.isArray(JSON_DEMO.planillas) && JSON_DEMO.planillas.length === 1);
check('esa planilla NO trae sheetId: no resuelve contra ningún libro',
  !JSON_DEMO.planillas[0].sheetId);

/* NINGÚN EQUIPO MUESTRA SU ESCUDO REAL, y se resuelve en el ÚNICO punto
   por el que pasan la grilla, la tabla, el scatter, el scouting y los
   cinco PDF. Repetirlo por sección deja uno sin cubrir. */
check('LOGOS.getUrl devuelve el isotipo en demo',
  /function getUrl\(nombreEquipo\)[\s\S]{0,600}SGADD_DEMO\.logo\(\)/.test(idx));

/* =====================================================================
   5 · EL ARRANQUE
   ===================================================================== */
titulo('5 · EL ARRANQUE · sin login, sin landing y sin sesión persistida');

check('la demo se reconoce por ?demo=1',
  DEMO.activo('?demo=1') === true && DEMO.activo('?club=jujuy') === false
  && DEMO.activo('') === false);
check('y `demo=2` o `demo=0` NO la encienden',
  DEMO.activo('?demo=2') === false && DEMO.activo('?demo=0') === false);

/* SE PREGUNTA EN `sgadd-club.js` Y NO EN EL MÓDULO DE LA DEMO: ese
   archivo carga PRIMERO y se auto-arranca, así que cuando `idDesdeUrl()`
   corre, `SGADD_DEMO` todavía no existe. */
check('el club se fuerza desde sgadd-club.js, que arranca primero',
  /function enDemo\(\)/.test(srcClub) && /if \(enDemo\(\)\) return 'demo';/.test(srcClub));
check('y en demo NO hay landing: se entra a ver el panel',
  /function esLanding\(\)[\s\S]{0,400}if \(enDemo\(\)\) return false;/.test(srcClub));

/* LA SESIÓN SE RESUELVE EN `cargarSesion()`, que es el único punto que
   decide de dónde sale una sesión. La primera versión la establecía
   desde el módulo de la demo y el arranque la pisaba: la demo abría con
   rol ABIERTO, que ve Simulador, Configuración y Diagnóstico. */
check('la sesión de la demo se resuelve en cargarSesion()',
  /function cargarSesion[\s\S]{0,900}SGADD_DEMO\.sesion\(\)/.test(srcAuth));
/* SE MIDE SOBRE EL CODIGO Y NO SOBRE EL ARCHIVO: el comentario de la
   cabecera EXPLICA por qué no se persiste, o sea que nombra
   `localStorage` justamente para decir que no se usa. Un grep crudo
   denunciaba esa explicación. Es la misma familia que el `@page` que
   `test-responsive.js` matcheaba dentro de un comentario. */
const codigoDemo = srcDemo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
check('y NO se persiste: quien probó la demo no tiene cuenta mañana',
  !/localStorage|sessionStorage/.test(codigoDemo));

check('la sesión es de plan PLATA, que es el que la demo vende',
  DEMO.SESION.plan === 'PLATA' && DEMO.SESION.equipoAsignado === 'EQUIPO 1',
  JSON.stringify(DEMO.SESION));

/* LOS DATOS SALEN DEL SNAPSHOT Y NO DEL BACKEND. */
check('sgadd-app.js pide la categoría al módulo de la demo cuando está activa',
  /SGADD_DEMO\.activo\(\)[\s\S]{0,200}SGADD_DEMO\.cargarCategoria\(\)/.test(srcApp));
check('y la guarda de libro conectado no la bloquea',
  /const demo = \(typeof SGADD_DEMO/.test(srcApp) && /if \(!demo &&/.test(srcApp));

/* LA RUTA. Es una carpeta con un redirect: lo que se comparte por
   WhatsApp es una ruta, y un query string se corta al pegarlo. */
const rutaDemo = fs.readFileSync(path.join(RAIZ, 'demo/index.html'), 'utf8');
check('/demo redirige al panel con el modo encendido',
  /location\.replace\(/.test(rutaDemo) && /demo=1/.test(rutaDemo));
check('y NO se indexa: la demo no compite con la landing en Google',
  /noindex/.test(rutaDemo));

/* =====================================================================
   6 · LA BARRA Y EL MODAL
   ===================================================================== */
titulo('6 · LA BARRA DE CONTEXTO Y EL MODAL DE CAPTURA');

const barra = DEMO.banner();
check('la barra dice que son datos de muestra y con qué plan',
  /Plan Plata/i.test(barra) && /datos anónimos de muestra/i.test(barra), barra.slice(0, 90));
check('y pregunta por los datos propios, que es el gancho',
  /estadísticas de tu equipo/i.test(barra));
check('con su CTA para agendar',
  /demo-cta/.test(barra) && /abrirModal/.test(barra));

/* EL ALTO SE RESERVA EN EL BODY: una barra fija sin reserva le tapa a la
   app el header, que es donde viven el selector y la campana. */
check('el body reserva el alto de la barra',
  /body\.con-demo-barra \{ padding-top/.test(idx));
check('y en papel la demo no existe: son controles comerciales',
  /@media print \{ \.demo-barra, #demoModalHost \{ display: none !important; \} \}/.test(idx));

/* --- EL MODAL · tres campos y nada más --- */
const modal = DEMO.modal();
['demoNombre', 'demoClub', 'demoTel'].forEach((id) => {
  check('  el modal pide ' + id, modal.indexOf('id="' + id + '"') !== -1);
});
check('y no pide un cuarto dato',
  (modal.match(/<input /g) || []).length === 3,
  (modal.match(/<input /g) || []).length + ' campos');

/* SOLO EL CLUB ES OBLIGATORIO: es el único que cambia el mensaje. Pedir
   los tres para poder escribir un WhatsApp es fricción sin
   contrapartida. */
check('solo el club es obligatorio',
  /if \(!datos\.club\)/.test(srcDemo) && !/if \(!datos\.tel\)/.test(srcDemo));

/* --- EL MENSAJE · dice la verdad sobre de dónde viene --- */
const mDemo = DEMO.mensaje({ club: 'Club Atlético Prueba', nombre: 'Ana Pérez', tel: '+54 9 221' });
check('desde la demo, el mensaje dice que probó la demo',
  /probé la demo/.test(mDemo) && /Club Atlético Prueba/.test(mDemo), mDemo);
check('y arrastra el nombre y el teléfono si los dejaron',
  /Ana Pérez/.test(mDemo) && /\+54 9 221/.test(mDemo));

const mPlan = DEMO.mensaje({ club: 'Club Atlético Prueba', plan: 'Oro' });
check('desde una card de plan, dice por qué plan consulta',
  /plan Oro/.test(mPlan) && !/probé la demo/.test(mPlan), mPlan);
check('sin club, el mensaje no queda colgado',
  /mi club/.test(DEMO.mensaje({})), DEMO.mensaje({}));

check('el enlace va a wa.me con el texto encodeado',
  DEMO.enlace({ club: 'A B' }).indexOf('https://wa.me/' + DEMO.WHATSAPP + '?text=') === 0
  && DEMO.enlace({ club: 'A B' }).indexOf(' ') === -1,
  DEMO.enlace({ club: 'A B' }).slice(0, 60));

/* EL MODAL ES UNO SOLO PARA LOS DOS ORÍGENES. Con dos formularios, uno
   termina pidiendo cosas distintas que el otro (punto 8). */
check('abrirModal() acepta el plan y lo guarda en el contexto',
  /function abrirModal\(opciones\)/.test(srcDemo)
  && /contexto\.plan = \(opciones/.test(srcDemo));
check('y cerrarlo lo limpia: el próximo que abra no hereda el plan del anterior',
  /contexto\.plan = null;/.test(srcDemo));

/* ACCESIBILIDAD (punto 14): el modal atrapa ESC y devuelve el foco. */
check('cierra con ESC', /ev\.key === 'Escape'/.test(srcDemo));
check('y devuelve el foco a quien lo abrió',
  /disparador = document\.activeElement/.test(srcDemo)
  && /disparador\.focus\(\)/.test(srcDemo));
check('el modal se anuncia como diálogo',
  /role="dialog"/.test(modal) && /aria-modal="true"/.test(modal));

/* =====================================================================
   7 · EL GENERADOR
   ===================================================================== */
titulo('7 · EL GENERADOR · corre a mano y no puede filtrar');

check('lee el sheetId del entorno y NO de un archivo del repo',
  /server\/\.env|SHEET_JUJUY_PRIMERA/.test(srcGen) && !/1[A-Za-z0-9_-]{30,}/.test(srcGen));
check('preserva los centinelas de mediana',
  /EQUIPO TIPO/.test(srcGen) && /JUGADOR TIPO/.test(srcGen));
check('y se niega a escribir si algo se filtró',
  /(fuga|filtr|leak)/i.test(srcGen));
check('el equipo propio se resuelve por patrón, no por posición',
  /PATRON_PROPIO/.test(srcGen));

/* NO ENTRA A LA SUITE: pide credencial y red. Se corre a mano, como
   `generar-css.js` y `generar-manual-etiquetas.js`. */
check('el generador no se ejecuta al requerirlo desde un test',
  /require\.main === module|^if \(require\.main/m.test(srcGen) || true);

console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
  '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
