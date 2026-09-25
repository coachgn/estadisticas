/* =====================================================================
   test-fixture-apb.js · el conector de basket-club y la arquitectura de
   fuentes externas de fixture (punto 70).

     node test-fixture-apb.js

   LAS FIXTURES SON MARKUP REAL, recortado de las tres páginas de
   basket-club el 2026-09-25 y conservado byte a byte
   (`test-fixtures/basket-club/zona-*.html`). Un HTML inventado a mano
   probaría el parser contra lo que uno CREE que publica el sitio, que es
   justo lo que no hay que hacer: el valor del test es que falle el día que
   el sitio cambie de estructura.
   ===================================================================== */
'use strict';

const fs = require('fs');
const F = require('./server/lib/fixture-fuentes.js');
const API = require('./server/api/fixture.js');
const CORE = require('./js/sgadd-core.js');
const PANEL = require('./js/sgadd-fixture.js');

let ok = 0, mal = 0;
function check(n, cond, det) {
  if (cond) { ok++; console.log('  ✓ ' + n); }
  else { mal++; console.log('  ✗ ' + n + (det !== undefined ? '  → ' + JSON.stringify(det) : '')); }
}
function seccion(t) { console.log('\n' + t); }

const HTML = {};
'abc'.split('').forEach((z) => { HTML[z] = fs.readFileSync('test-fixtures/basket-club/zona-' + z + '.html', 'utf8'); });
const APB = JSON.parse(fs.readFileSync('torneos/apb-2026-masculino.json', 'utf8'));
const HOY = '2026-09-25';

/* =====================================================================
   1 · El parser contra el markup real
   ===================================================================== */
seccion('1 · basket-club · el parser');
{
  const r = F.parsearBasketClub(HTML.c, { hoy: HOY, zona: 'c' });
  check('lee los partidos de la página', r.partidos.length >= 6, r.partidos.length);
  check('sin avisos sobre markup conocido', r.avisos.length === 0, r.avisos);
  check('todos con fecha AAAA-MM-DD', r.partidos.every(p => /^\d{4}-\d{2}-\d{2}$/.test(p.fecha)));
  check('todos con los dos equipos', r.partidos.every(p => p.local && p.visitante));
  check('ninguno se enfrenta a sí mismo', r.partidos.every(p => p.local !== p.visitante));
  check('vienen ordenados por fecha', r.partidos.every((p, i) => !i || r.partidos[i - 1].fecha <= p.fecha));

  const fin = r.partidos.filter(p => p.estado === 'FINALIZADO');
  check('los finalizados traen marcador', fin.length > 0 && fin.every(p => p.ptsLocal != null && p.ptsVisitante != null));
  const prog = r.partidos.filter(p => p.estado === 'PROGRAMADO');
  check('los programados traen hora y NO marcador',
    prog.length > 0 && prog.every(p => /^\d{2}:\d{2}$/.test(p.hora || '') && p.ptsLocal === null));

  /* EL DATO QUE EL DT VIENE A BUSCAR un viernes. */
  const tv = r.partidos.filter(p => p.transmision.length);
  check('captura la transmisión, con su link', tv.length > 0
    && tv.every(p => p.transmision.every(t => t.nombre && /^https?:\/\//.test(t.url))), tv[0] && tv[0].transmision);
  check('y el que no tiene, no inventa una', r.partidos.some(p => !p.transmision.length));
  /* basket-club NO publica la sede: se verificó en las tres zonas. */
  check('NO emite sede: la fuente no la publica', r.partidos.every(p => !('sede' in p)));

  const todas = 'abc'.split('').map(z => F.parsearBasketClub(HTML[z], { hoy: HOY, zona: z }));
  check('las tres zonas parsean', todas.every(x => x.partidos.length > 0 && !x.avisos.length));
  check('cada partido lleva su zona', todas.every((x, i) => x.partidos.every(p => p.zona === 'abc'[i])));
}

seccion('1 bis · «Hoy» y las fechas');
{
  /* El sitio escribe «Hoy» en la jornada en curso: la fecha la da el
     ENCABEZADO de jornada que viene antes en la página. */
  const r = F.parsearBasketClub(HTML.c, { hoy: HOY, zona: 'c' });
  const hoyes = r.partidos.filter(p => p.fecha === HOY);
  check('los partidos de «Hoy» quedan con la fecha de hoy', hoyes.length > 0, r.partidos.map(p => p.fecha));

  check('dd/mm/aaaa', F.fechaDesdeDDMM('02/10/2026') === '2026-10-02');
  check('lo que no es fecha da null', F.fechaDesdeDDMM('Hoy') === null && F.fechaDesdeDDMM('') === null);
  check('una jornada sin año se resuelve contra la referencia',
    F.fechaDesdeJornada('Viernes 2 de octubre', '2026-09-25') === '2026-10-02');
  /* A MÁS DE SEIS MESES el año es el otro: una jornada de enero leída en
     diciembre es del año que viene, no del que pasó. */
  check('enero leído en diciembre es del año que viene',
    F.fechaDesdeJornada('Viernes 9 de enero', '2026-12-20') === '2027-01-09');
  check('y diciembre leído en enero, del anterior',
    F.fechaDesdeJornada('Viernes 19 de diciembre', '2027-01-10') === '2026-12-19');
  check('un encabezado que no es fecha da null', F.fechaDesdeJornada('Próximos partidos', HOY) === null);
  check('la hora se normaliza a dos dígitos', F.hora('9:30 HS') === '09:30' && F.hora('21:30 HS') === '21:30');
  check('sin hora, null', F.hora('Final') === null);
}

/* =====================================================================
   2 · Los estados
   ===================================================================== */
seccion('2 · estados');
{
  check('una hora es un partido por jugarse', F.clasificarEstado('21:30 HS').estado === 'PROGRAMADO');
  check('«Final» es finalizado', F.clasificarEstado('Final').estado === 'FINALIZADO');
  check('«Finalizado» también', F.clasificarEstado('Finalizado').estado === 'FINALIZADO');
  check('«En juego» y «En vivo»', F.clasificarEstado('En juego').estado === 'EN_JUEGO'
    && F.clasificarEstado('EN VIVO').estado === 'EN_JUEGO');
  check('suspendido, postergado y reprogramado', ['Suspendido', 'Postergado', 'Reprogramado']
    .every(x => F.clasificarEstado(x).estado === 'SUSPENDIDO'));
  check('y anda sin acentos', F.clasificarEstado('Reprogramado').estado === 'SUSPENDIDO'
    && F.clasificarEstado('POSTERGADO').estado === 'SUSPENDIDO');
  /* LA VÁLVULA: un estado que el sitio invente mañana no rompe nada y
     viaja CRUDO para poder mostrarlo tal cual. */
  const otro = F.clasificarEstado('A definir por mesa directiva');
  check('lo que no se reconoce cae en OTRO, con su texto',
    otro.estado === 'OTRO' && otro.estadoTexto === 'A definir por mesa directiva');
  check('vacío es programado', F.clasificarEstado('').estado === 'PROGRAMADO');
  check('los estados declarados son los que el panel conoce',
    F.ESTADOS.join(',') === 'PROGRAMADO,EN_JUEGO,FINALIZADO,SUSPENDIDO,OTRO');

  /* UN PARTIDO CON MARCADOR ESTÁ JUGADO, diga lo que diga la etiqueta: el
     marcador es el hecho. */
  const r = F.parsearBasketClub(HTML.a, { hoy: HOY, zona: 'a' });
  check('con marcador, el estado nunca queda en PROGRAMADO',
    r.partidos.filter(p => p.ptsLocal != null).every(p => p.estado !== 'PROGRAMADO'));

  /* EL CASO QUE LO EJERCE DE VERDAD: el sitio deja la HORA y ya publicó el
     marcador —pasa mientras la jornada se está cargando—. En las páginas
     reales de hoy no ocurre, así que se arma tomando un partido finalizado
     REAL y devolviéndole la hora en lugar de «Final»: el resto del markup
     queda intacto. */
  const unFinal = HTML.a.match(/<li class="flex items-center gap-1[\s\S]*?font-display[\s\S]*?<\/li>/);
  check('la fixture trae un partido finalizado para el caso', !!unFinal);
  if (unFinal) {
    const conHora = unFinal[0].replace(/>\s*Final\s*</, '>21:30 HS<');
    const x = F.parsearBasketClub('<ul>' + conHora + '</ul>', { hoy: HOY, zona: 'a' });
    const conMarcador = x.partidos.filter(p => p.ptsLocal != null);
    check('marcador publicado + hora todavía puesta = FINALIZADO, no PROGRAMADO',
      conMarcador.length > 0 && conMarcador.every(p => p.estado === 'FINALIZADO'),
      conMarcador.map(p => p.estado));
    check('y la hora se conserva, que es un dato',
      conMarcador.some(p => p.hora === '21:30'), conMarcador.map(p => p.hora));
  }
}

/* =====================================================================
   3 · El cruce con el libro
   ===================================================================== */
seccion('3 · cruce con el libro');
{
  const libroB = ['A MAYO', "ATENAS B", 'C E Y E', 'DEPORTIVO LA PLATA', 'DEPORTIVO SAN VICENTE',
    'HOGAR SOCIAL', 'PLATENSE B', 'SUD AMERICA LP', 'C C TOLOSANO', 'UNIVERSITARIO', 'U N L P', 'VILLA SAN CARLOS A'];
  const cl = CORE.claveEquipo;
  const eq = (n) => F.equipoDelLibro(n, libroB, null, cl);

  check('igual', eq('HOGAR SOCIAL') === 'HOGAR SOCIAL');
  check('el libro agrega la letra: ATENAS "B" → ATENAS B', eq('ATENAS "B"') === 'ATENAS B');
  check('el libro separa las siglas: C.E.Y.E. → C E Y E', eq('C.E.Y.E.') === 'C E Y E');
  check('U.N.L.P. → U N L P', eq('U.N.L.P.') === 'U N L P');
  check('el libro abrevia la primera palabra: ASOCIACIÓN MAYO → A MAYO', eq('ASOCIACIÓN MAYO') === 'A MAYO');
  check('TOLOSANO → C C TOLOSANO', eq('TOLOSANO') === 'C C TOLOSANO');
  check('SUD AMÉRICA → SUD AMERICA LP', eq('SUD AMÉRICA') === 'SUD AMERICA LP');
  check('VILLA SAN CARLOS → VILLA SAN CARLOS A', eq('VILLA SAN CARLOS') === 'VILLA SAN CARLOS A');
  check('un equipo que no está da null, no el más parecido', eq('CLUB INEXISTENTE') === null);

  /* EL ALIAS DECLARADO GANA: es la salida para lo que la cascada no puede
     resolver sin adivinar (BANCO PROVINCIA DE LA PLATA → BANCO PROVINCIA A). */
  const libroA = ['BANCO PROVINCIA A', 'ATENAS A'];
  check('sin alias, ese caso NO se fuerza',
    F.equipoDelLibro('BANCO PROVINCIA DE LA PLATA', libroA, null, cl) === null);
  check('con alias declarado, cruza',
    F.equipoDelLibro('BANCO PROVINCIA DE LA PLATA', libroA,
      { 'BANCO PROVINCIA DE LA PLATA': 'BANCO PROVINCIA A' }, cl) === 'BANCO PROVINCIA A');
  /* CON DOS CANDIDATOS NO SE ELIGE: atribuir un partido al equipo
     equivocado contamina el calendario de dos clubes. */
  check('con dos candidatos no adivina',
    F.equipoDelLibro('ATENAS', ['ATENAS A', 'ATENAS B'], null, cl) === null);

  const r = F.parsearBasketClub(HTML.b, { hoy: HOY, zona: 'b' });
  const x = F.cruzarConLibro(r.partidos, libroB, null, cl);
  check('la zona B cruza entera contra su libro', x.sinCruce.length === 0, x.sinCruce);
  check('y cada partido queda con claves del libro',
    x.partidos.every(p => libroB.indexOf(p.localClave) !== -1 && libroB.indexOf(p.visitanteClave) !== -1));

  /* LO QUE NO CRUZA IGUAL VIAJA: son partidos reales del torneo. */
  const y = F.cruzarConLibro(r.partidos, ['HOGAR SOCIAL'], null, cl);
  check('lo que no cruza se REPORTA y no se esconde',
    y.partidos.length === r.partidos.length && y.sinCruce.length > 0);
  check('y queda marcado, para no confundirlo con un cruce bueno',
    y.partidos.some(p => p.sinCruce === true));
}

/* =====================================================================
   4 · La configuración del torneo
   ===================================================================== */
seccion('4 · fuentes declaradas');
{
  const c = F.configDe(APB);
  check('APB declara su fuente', !!c && c.adaptador === 'basket-club');
  check('con una URL por zona', c && Object.keys(c.zonas).sort().join(',') === 'a,b,c');
  check('y su TTL', c && c.ttlMs === 10 * 60 * 1000);
  check('las tres URLs son de basket-club',
    c && Object.keys(c.zonas).every(z => /^https:\/\/basket-club\.com\//.test(c.zonas[z])));

  /* UN TORNEO SIN FUENTE SIGUE ANDANDO con su calendario declarado: es LAB
     hoy, y es lo que hace que esto sea aditivo. */
  const lab = JSON.parse(fs.readFileSync('torneos/liga-argentina-2026-27.json', 'utf8'));
  check('LAB no declara fuente externa y eso es válido', F.configDe(lab) === null);
  check('un adaptador que no existe se ignora',
    F.configDe({ fixture: { adaptador: 'inventado', zonas: { a: 'https://x.com' } } }) === null);
  check('una fuente sin URLs válidas, también',
    F.configDe({ fixture: { adaptador: 'basket-club', zonas: { a: 'no-es-una-url' } } }) === null);
  check('el registro declara qué adaptadores hay',
    Object.keys(F.ADAPTADORES).indexOf('basket-club') !== -1);

  /* EL ARCHIVO ES PÚBLICO: ni un sheetId adentro. */
  check('el archivo del torneo no trae ningún sheetId',
    !/"sheetId"\s*:|[A-Za-z0-9_-]{40,}/.test(JSON.stringify(APB)));
  const eq = Object.keys(APB.zonas).reduce((a, z) => a + APB.zonas[z].equipos.length, 0);
  check('las tres zonas suman 35 equipos', eq === 35, eq);
  check('cada equipo trae su alias de la fuente', Object.keys(APB.zonas).every(z =>
    APB.zonas[z].equipos.every(e => Array.isArray(e.alias) && e.alias.length)));
}

/* =====================================================================
   5 · EL RESPALDO · la fuente falla y el DT igual ve su calendario
   ===================================================================== */
async function respaldo() {
  seccion('5 · manejo de fallos');
  const cfg = F.configDe(APB);
  const paginas = (url) => HTML[/zona-a/.test(url) ? 'a' : (/zona-b/.test(url) ? 'b' : 'c')];

  const ok200 = async (url) => ({ ok: true, status: 200, text: async () => paginas(url) });
  const r = await API.refrescar(cfg, { fetch: ok200 }, HOY);
  check('con las tres p\u00e1ginas, las tres zonas',
    Object.keys(r.zonas).sort().join(',') === 'a,b,c' && !r.fallaron.length, r.fallaron);

  /* UNA ZONA CA\u00cdDA NO TUMBA A LAS OTRAS: con tres zonas, perder las tres
     por una sola ser\u00eda convertir un problema chico en uno grande. */
  const caeB = async (url) => {
    if (/zona-b/.test(url)) throw new Error('ECONNREFUSED');
    return { ok: true, status: 200, text: async () => paginas(url) };
  };
  const r2 = await API.refrescar(cfg, { fetch: caeB }, HOY);
  check('una zona ca\u00edda deja pasar a las otras dos',
    Object.keys(r2.zonas).sort().join(',') === 'a,c' && r2.fallaron.length === 1, r2.fallaron);
  check('y se dice cu\u00e1l fall\u00f3', /^b:/.test(r2.fallaron[0]));

  /* EL CASO TRAICIONERO: la p\u00e1gina responde 200 y ya no se reconoce nada.
     NO es \u00abel torneo no tiene partidos\u00bb \u2014 servir cero borrar\u00eda el
     calendario de la pantalla sin que nadie se entere. */
  const cambiado = async () => ({ ok: true, status: 200, text: async () => '<html><body>Mantenimiento</body></html>' });
  const r3 = await API.refrescar(cfg, { fetch: cambiado }, HOY);
  check('un HTML cambiado NO se sirve como \u00abcero partidos\u00bb', Object.keys(r3.zonas).length === 0);
  check('y se explica que cambi\u00f3 la estructura', r3.fallaron.length === 3
    && r3.fallaron.every(x => /estructura/.test(x)), r3.fallaron);

  const err500 = async () => ({ ok: false, status: 500, text: async () => '' });
  const r4 = await API.refrescar(cfg, { fetch: err500 }, HOY);
  check('un 500 de la fuente tampoco', Object.keys(r4.zonas).length === 0 && r4.fallaron.length === 3);
  check('con el c\u00f3digo del error a la vista', /respondi\u00f3 500/.test(r4.fallaron[0]), r4.fallaron[0]);

  /* EL TECHO DE TIEMPO: una fuente que no contesta no puede colgar la
     funci\u00f3n serverless. */
  const colgada = () => new Promise(() => {});
  const t0 = Date.now();
  const r5 = await API.refrescar({ adaptador: 'basket-club', zonas: { a: 'https://x.test/a' } },
    { fetch: colgada }, HOY);
  check('una fuente que no contesta se corta sola',
    Object.keys(r5.zonas).length === 0 && Date.now() - t0 < 20000, Date.now() - t0);
  check('y lo dice', /no contest/.test(r5.fallaron[0] || ''), r5.fallaron[0]);
}

/* =====================================================================
   6 · El panel: la fuente en vivo manda sobre el calendario declarado
   ===================================================================== */
function panel() {
  seccion('6 · el panel con la fuente en vivo');
  const mapa = PANEL.mapaAlias(APB, 'b');
  /* Cada equipo aporta su nombre y sus alias; los que normalizan igual
     colapsan en una sola clave, que es lo correcto. Lo que se exige es que
     NINGÚN alias declarado quede afuera: el que falte no cruza. */
  check('el mapa cubre todos los alias declarados de la zona',
    APB.zonas.b.equipos.every(e => (e.alias || []).every(al => mapa[CORE.claveEquipo(al)] === e.nombre)),
    APB.zonas.b.equipos.filter(e => (e.alias || []).some(al => mapa[CORE.claveEquipo(al)] !== e.nombre)).map(e => e.nombre));
  check('y el nombre del libro también entra, no solo el alias',
    APB.zonas.b.equipos.every(e => mapa[CORE.claveEquipo(e.nombre)] === e.nombre));
  check('sin mezclar zonas: la B no trae equipos de la C',
    !mapa[CORE.claveEquipo('RECONQUISTA "B"')]);
  check('y traduce el nombre de la fuente al del libro',
    mapa[CORE.claveEquipo('SUD AM\u00c9RICA')] === 'SUD AMERICA LP - MM', mapa[CORE.claveEquipo('SUD AM\u00c9RICA')]);
  check('tambi\u00e9n el que ya viene igual',
    mapa[CORE.claveEquipo('HOGAR SOCIAL')] === 'HOGAR SOCIAL - MM');

  const r = F.parsearBasketClub(HTML.b, { hoy: HOY, zona: 'b' });
  const n = PANEL.normalizarFuente(r.partidos, mapa, 'b');
  check('los partidos en vivo quedan con claves del libro',
    n.length === r.partidos.length && n.every(p => p.localClave && p.visitanteClave));
  check('conservan el estado y la transmisi\u00f3n',
    n.some(p => p.transmision.length) && n.every(p => 'estado' in p));
  check('y quedan marcados como en vivo', n.every(p => p.envivo === true));

  /* LA FUENTE MANDA SOBRE EL DECLARADO: trae los horarios de hoy y las
     reprogramaciones, que es para lo que existe. */
  const conFuente = PANEL.agenda({ torneo: APB, zona: 'b', idx: null, fuente: r.partidos, hoy: HOY });
  check('con fuente, la agenda la usa', conFuente.envivo === true && conFuente.total === r.partidos.length);
  const sinFuente = PANEL.agenda({ torneo: APB, zona: 'b', idx: null, hoy: HOY });
  check('sin fuente cae al calendario declarado, sin romper',
    sinFuente.envivo === false && sinFuente.total === 0);

  /* EL MARCADOR SIGUE SALIENDO DEL LIBRO (punto 68): la fuente aporta el
     calendario, no la verdad del resultado. */
  const idx = { lista: () => [{ clave: 'HOGAR SOCIAL - MM', nombre: 'HOGAR SOCIAL - MM', partidos: [
    { CONDICION: 'LOCAL', FECHA: '24/09/2026', PARTIDO: 'HOGAR SOCIAL - MM vs PLATENSE \'B\' - MM', PTS: 99, PTSopp: 11 }] }] };
  const cruzada = PANEL.agenda({ torneo: APB, zona: 'b', idx: idx, fuente: r.partidos, hoy: '2026-09-26' });
  const ese = cruzada.partidos.filter(p => p.fecha === '2026-09-24'
    && [p.localClave, p.visitanteClave].indexOf('HOGAR SOCIAL') !== -1);
  check('un cruce que el libro tiene toma SU marcador',
    ese.some(p => p.ptsLocal === 99 || p.ptsVisitante === 99), ese.map(p => p.local + ' ' + p.ptsLocal + '-' + p.ptsVisitante));

  /* LA COLUMNA DE TV Y EL CHIP DE ESTADO. */
  check('la transmisi\u00f3n se pinta como link',
    /target="_blank"/.test(PANEL.transmisiones({ transmision: [{ nombre: 'Cebra TV', url: 'https://x.test' }] })));
  check('y sin transmisi\u00f3n va un gui\u00f3n, no un hueco',
    /\u2014/.test(PANEL.transmisiones({ transmision: [] })));
  /* EL ESTADO SOLO SE MUESTRA CUANDO APORTA: \u00abprogramado\u00bb al lado de una
     hora es repetir lo mismo con otras palabras. */
  check('programado y finalizado no ponen chip',
    PANEL.chipEstado({ estado: 'PROGRAMADO' }) === '' && PANEL.chipEstado({ estado: 'FINALIZADO' }) === '');
  check('suspendido y en juego s\u00ed',
    /suspendido/i.test(PANEL.chipEstado({ estado: 'SUSPENDIDO', estadoTexto: 'Suspendido' }))
    && /en juego/i.test(PANEL.chipEstado({ estado: 'EN_JUEGO' })));
  check('y un estado desconocido se muestra TAL CUAL lo dijo la fuente',
    /a definir/i.test(PANEL.chipEstado({ estado: 'OTRO', estadoTexto: 'A definir' })));
}

/* =====================================================================
   7 · La capa de datos del panel · se EJERCE, no se lee
   ===================================================================== */
async function capaDeDatos() {
  seccion('7 · SGADD_DATA.fixtureDeTorneo');
  const DATA = require('./js/sgadd-data.js');
  const AUTH = require('./js/sgadd-auth.js');

  /* SIN BACKEND devuelve null y NO lanza: es lo que hace que la seccion
     ande igual en Pages sin API y en la demo. */
  DATA.configurar('');
  check('sin backend devuelve null', (await DATA.fixtureDeTorneo('apb-2026-masculino', 'a')) === null);

  DATA.configurar('http://api.test');
  /* Un JWT de mentira pero BIEN FORMADO: `establecerToken` solo decodifica
     el payload —la firma la valida el servidor— asi que el test no necesita
     el secreto ni la CLI. */
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.'
    + b64({ email: 'dt@test.com', club: 'reconquista', plan: 'BRONCE',
      exp: Math.floor(Date.now() / 1000) + 3600 }) + '.firma';
  AUTH.establecerToken(JWT);
  let pedida = null;
  const fake = async (url, o) => {
    pedida = { url: url, auth: (o.headers || {}).Authorization };
    return { ok: true, status: 200, json: async () => ({ ok: true, torneo: 'apb-2026-masculino',
      fuente: 'basket-club', actualizado: '2026-09-25T18:00:00.000Z', stale: false,
      zonas: { a: { partidos: [{ fecha: '2026-09-28', local: 'X', visitante: 'Y' }], avisos: [] } } }) };
  };
  const r = await DATA.fixtureDeTorneo('apb-2026-masculino', 'a', { fetch: fake });
  /* EL BUG QUE SE ESCAPO: la primera version usaba un helper `traer` que es
     LOCAL a cada funcion del modulo, asi que en el navegador tiraba
     «traer is not defined» y el panel caia al calendario declarado como si
     la fuente se hubiera caido — con su cartel de «no contesto» y todo.
     Ningun test lo vio porque ninguno ejercia esta funcion. */
  check('devuelve el cuerpo del servidor', !!r && r.ok === true && !!r.zonas.a);
  check('pega a la ruta del torneo, con la zona', /\/api\/v1\/fixture\/apb-2026-masculino\?zona=a$/.test(pedida.url), pedida.url);
  check('y manda el token', pedida.auth === 'Bearer ' + JWT);

  const sinZona = await DATA.fixtureDeTorneo('apb-2026-masculino', '', { fetch: fake });
  check('sin zona pide el torneo entero', !/\?zona=/.test(pedida.url) && !!sinZona);

  /* UN ERROR DEL SERVIDOR SE PROPAGA con su motivo: quien llama decide. */
  const err = async () => ({ ok: false, status: 502, json: async () => ({ ok: false, codigo: 'FUENTE', mensaje: 'No se pudo leer el fixture.' }) });
  let capturado = null;
  try { await DATA.fixtureDeTorneo('x', 'a', { fetch: err }); }
  catch (e) { capturado = e; }
  check('un error del servidor llega con su mensaje y su codigo',
    capturado && capturado.codigo === 'FUENTE' && /No se pudo leer/.test(capturado.message));
  if (AUTH.limpiarToken) AUTH.limpiarToken();
}

(async () => {
  await respaldo();
  await capaDeDatos();
  panel();
  console.log('\n' + (mal ? '\u2717 HAY FALLAS \u00b7 ' : '\u2713 TODO OK \u00b7 ') + ok + ' pasaron, ' + mal + ' fallaron');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e.stack); process.exit(1); });
