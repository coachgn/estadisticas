/* =====================================================================
   SGADD · Rotación de token, resiliencia de KV y persistencia del tramo

       node test-resiliencia.js

   Tres cosas que comparten una idea: que el servicio siga andando cuando
   algo de abajo falla, y que el que está mirando la pantalla no pague el
   precio de un problema de infraestructura.
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

const kv = require('./server/lib/kv.js');

/* =====================================================================
   LA ROTACIÓN
   ===================================================================== */
titulo('ROTAR EL TOKEN · sin ventana de corte');

const ENV = {
  UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'NUEVO',
  UPSTASH_REDIS_REST_TOKEN_LEGACY: 'VIEJO',
};

const c = kv.credenciales(ENV);
check('se lee el token nuevo', c.token === 'NUEVO', c.token);
check('y el legacy, aparte', c.tokenLegacy === 'VIEJO', c.tokenLegacy);

/* EL NUEVO PRIMERO. Al revés, el viejo seguiría sirviendo todas las
   peticiones y la rotación no se completaría nunca: el healthcheck diría
   que anda y el token que se quiso revocar seguiría siendo el que trabaja. */
const orden = kv.tokensPara(c, false).map(t => t.cual);
check('el NUEVO se prueba primero', orden[0] === 'completo', orden.join(' → '));
check('y el legacy después', orden[1] === 'completo-legacy', orden.join(' → '));

/* Sin duplicados: si alguien pega el mismo valor en las dos variables, no
   tiene sentido pedirle dos veces lo mismo a Upstash. */
const igual = kv.tokensPara(kv.credenciales({
  UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'A',
  UPSTASH_REDIS_REST_TOKEN_LEGACY: 'A' }), false);
check('un token repetido no se prueba dos veces', igual.length === 1, igual.length);

/* El de solo lectura sigue primero para las lecturas: es el que menos
   permisos gasta, y el criterio del punto 18 bis no cambió. */
const lect = kv.tokensPara(kv.credenciales(Object.assign({
  UPSTASH_REDIS_REST_READONLY_TOKEN: 'RO' }, ENV)), true).map(t => t.cual);
check('en lectura va primero el de solo lectura', lect[0] === 'lectura', lect.join(' → '));
check('y el legacy queda al final', lect[lect.length - 1] === 'completo-legacy', lect.join(' → '));

/* DURANTE LA ROTACIÓN, EL LEGACY PUEDE SER EL ÚNICO QUE ANDA. Un
   `configurado()` en false ahí apagaría la escritura entera. */
check('con solo el legacy, el módulo se considera configurado',
  kv.configurado({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN_LEGACY: 'V' }));
check('y sin ningún token, no',
  !kv.configurado({ UPSTASH_REDIS_REST_URL: 'https://x' }));

/* --- el reintento, ejercido --- */
(async () => {
  let intentos = [];
  const fetchFalso = (permitido) => async (url, o) => {
    const t = String(o.headers.Authorization).replace('Bearer ', '');
    intentos.push(t);
    if (t === permitido) return { ok: true, json: async () => ({ result: 'ok' }) };
    return { ok: false, status: 401, json: async () => ({ error: 'NOPERM' }) };
  };

  /* El caso de la rotación a medio camino: el nuevo todavía no llegó a
     Upstash (o ya no sirve) y el viejo sí. */
  intentos = [];
  let r = await kv.comando(['GET', 'x'], { env: ENV, fetch: fetchFalso('VIEJO') });
  check('si el nuevo falla por permisos, cae al legacy', r === 'ok');
  check('y probó los dos, en orden', intentos.join(',') === 'NUEVO,VIEJO', intentos.join(','));
  check('el healthcheck sabe cuál respondió',
    kv.tokenEnUso() === 'completo-legacy', kv.tokenEnUso());

  /* Y el caso normal: el nuevo anda y el legacy NI SE PRUEBA. */
  intentos = [];
  r = await kv.comando(['GET', 'x'], { env: ENV, fetch: fetchFalso('NUEVO') });
  check('con el nuevo andando, el legacy no se usa',
    intentos.join(',') === 'NUEVO', intentos.join(','));
  check('y se anota que respondió el nuevo', kv.tokenEnUso() === 'completo', kv.tokenEnUso());

  /* UN TIMEOUT NO SE REINTENTA. El token está bien y repetir la petición
     solo duplica la espera del que está del otro lado. */
  intentos = [];
  const cae500 = async (url, o) => {
    intentos.push(String(o.headers.Authorization).replace('Bearer ', ''));
    return { ok: false, status: 500, json: async () => ({}) };
  };
  let err = null;
  try { await kv.comando(['GET', 'x'], { env: ENV, fetch: cae500 }); }
  catch (e) { err = e; }
  check('un 500 NO dispara el fallback', intentos.length === 1, intentos.join(','));
  check('y el error sube tal cual', err && err.codigo === 'KV_500', err && err.codigo);

  /* Y LO ESPECIFICO GANA A LO GENERICO: con solo el token de lectura,
     `tokensPara` para escritura devuelve vacio, asi que el mensaje de «no
     hay token» taparia al que si dice que pasa — que el CLI esta corriendo
     contra el entorno del servidor, que solo lee. */
  let codRO = null;
  try {
    await kv.escribir('k', { a: 1 }, {
      env: { UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_READONLY_TOKEN: 'RO' },
      fetch: async () => ({ ok: true, json: async () => ({}) }),
    });
  } catch (e) { codRO = e.codigo; }
  check('escribir con solo el token de lectura dice POR QUÉ',
    codRO === 'KV_SOLO_LECTURA', codRO);

  /* =====================================================================
     RESILIENCIA · el cliente no se queda en blanco
     ===================================================================== */
  titulo('KV CAÍDO · el panel sigue funcionando');

  const catalogo = require('./server/lib/catalogo.js');
  const leerOk = kv.leer;
  const confOk = kv.configurado;

  kv.configurado = () => true;
  kv.leer = async () => ({ valor: null, error: 'KV' });
  catalogo.limpiarCache();

  const cat = await catalogo.cargar({ forzar: true });
  /* LA CASCADA ES LA RESILIENCIA: KV → variable de entorno → el literal
     del código. Un catálogo vacío dejaría al panel sin un solo club. */
  check('el catálogo se cae al respaldo, no a vacío',
    Object.keys(cat.catalogo || {}).length > 0, Object.keys(cat.catalogo || {}).length);
  check('y NO dice que viene de kv', cat.origen !== 'kv', cat.origen);
  /* EL AVISO VIAJA: sin él, el Panel Master no puede distinguir «no hay
     nada publicado» de «no se pudo leer lo publicado», que son dos
     situaciones muy distintas para el que está por publicar. */
  check('con un aviso que dice qué pasó', /No se pudo leer/.test(cat.aviso || ''), cat.aviso);

  kv.leer = leerOk; kv.configurado = confOk;
  catalogo.limpiarCache();

  /* --- las zonas caen al JSON del repo --- */
  const CFG = require('./js/sgadd-config.js');
  const clubJson = { competencia: { formatos: { r: { label: 'Del repo', zonas: [] } }, porTramo: { '*': 'r' } } };
  /* Sin `SGADD_CLIENTES` —que es lo que pasa cuando el catálogo no cargó—
     `publicado()` devuelve null y la cascada sigue al archivo. */
  check('sin catálogo, las zonas salen del JSON del club',
    CFG.vigente(clubJson, 'x').origen === 'json', CFG.vigente(clubJson, 'x').origen);
  check('y el formato es el del repo',
    CFG.resolver(clubJson, 'G', 'R', null).formato.label === 'Del repo');
  check('publicado() no rompe sin catálogo', CFG.publicado('x') === null);

  /* --- el badge del Panel Master --- */
  const hub = fs.readFileSync('./js/sgadd-hub.js', 'utf8');
  check('el Panel Master tiene badge de estado', /function badgeServicio/.test(hub));
  check('distingue en línea de respaldo',
    /Servicio KV en l/.test(hub) && /Modo respaldo JSON activo/.test(hub));
  /* Lo que hace falta decirle al admin no es que KV se cayó, sino qué
     deja de poder hacer: publicar y dar de alta NO se van a guardar. */
  check('y dice qué deja de andar',
    /publicar y dar de alta NO se van a guardar/i.test(hub));
  check('sin tapar que el cliente sigue viendo su tabla',
    /siguen viendo su .ltima configuraci.n del repo/i.test(hub));

  const cli = fs.readFileSync('./js/sgadd-clientes.js', 'utf8');
  check('el origen del catálogo se guarda en el estado',
    /estado\.origen = \(cat && cat\.origen\)/.test(cli));

  /* =====================================================================
     PERSISTENCIA DEL TRAMO
     ===================================================================== */
  titulo('CAMBIAR DE CATEGORÍA · sin perder el tramo elegido');

  global.SGADD = require('./js/sgadd-core.js');
  const APP = require('./js/sgadd-app.js');

  const tramos = [
    { id: 'APERTURA|REGULAR', torneo: 'APERTURA', fase: 'REGULAR', cobertura: 4, conPartidos: true },
    { id: 'APERTURA|PLAYOFF', torneo: 'APERTURA', fase: 'PLAYOFF', cobertura: 3, conPartidos: true },
  ];

  /* EL PAR EXACTO gana cuando existe. */
  APP.estado.preferencia = { torneo: 'APERTURA', fase: 'PLAYOFF' };
  check('el par exacto se conserva',
    (APP.tramoPreferido(tramos) || {}).id === 'APERTURA|PLAYOFF',
    (APP.tramoPreferido(tramos) || {}).id);

  /* Y SI EL TORNEO NO EXISTE EN EL LIBRO NUEVO, se conserva la FASE: es lo
     que el DT eligió conceptualmente —«quiero ver los playoffs»— y el
     torneo es cómo lo llama cada categoría, que no tiene por qué coincidir. */
  APP.estado.preferencia = { torneo: 'IDA', fase: 'PLAYOFF' };
  check('sin el torneo, se conserva la fase',
    (APP.tramoPreferido(tramos) || {}).id === 'APERTURA|PLAYOFF',
    (APP.tramoPreferido(tramos) || {}).id);

  /* SIN NADA PARECIDO manda el default: inventar un tramo que no existe
     deja la vista vacía sin decir por qué. */
  APP.estado.preferencia = { torneo: 'X', fase: 'NOEXISTE' };
  check('sin nada parecido, no se inventa un tramo',
    APP.tramoPreferido(tramos) === null);
  APP.estado.preferencia = null;
  check('y sin preferencia tampoco', APP.tramoPreferido(tramos) === null);
  check('ni con una lista vacía', APP.tramoPreferido([]) === null);

  const app = fs.readFileSync('./js/sgadd-app.js', 'utf8');
  /* SE GUARDA SOLO LO ELEGIDO A MANO. Si se guardara el default, la
     preferencia sería siempre la del primer libro que se abrió y el
     criterio de `tramoPorDefecto` —que elige por cobertura y cambia de
     libro en libro— dejaría de correr. */
  check('la preferencia se graba en cambiarTramo, que es la elección del DT',
    /function cambiarTramo[\s\S]{0,900}recordarTramo\(\)/.test(app));
  check('y NO en el ruteo, que es navegación y no decisión',
    !/function cambiarFase[\s\S]{0,200}recordarTramo\(\)/.test(app)
    && !/function cambiarTorneo[\s\S]{0,200}recordarTramo\(\)/.test(app));
  /* Cambiar de categoría borra el torneo —es del libro anterior— pero NO
     la preferencia, que es justo lo que hay que conservar. */
  check('cambiar de categoría no borra la preferencia',
    /function cambiarPlanilla[\s\S]{0,700}estado\.torneo = null;/.test(app)
    && !/function cambiarPlanilla[\s\S]{0,700}preferencia = null/.test(app));
  /* Y el orden: el hash gana sobre la preferencia, y la preferencia sobre
     el default. Un link compartido tiene que abrir donde dice el link. */
  check('el hash sigue ganando sobre la preferencia',
    app.indexOf('const delHash') < app.indexOf('tramoPreferido(tramos) ||'));
  check('y la preferencia sobre el default del libro',
    /tramoPreferido\(tramos\) \|\| SGADD\.tramoPorDefecto\(tramos\)/.test(app));

  /* --- el toggle de promedios/totales --- */
  /* Es estado de MÓDULO y por eso ya sobrevivía al cambio de categoría.
     Se fija para que nadie lo mueva adentro de una función que se resetea
     por repintado. */
  const jug = fs.readFileSync('./js/sgadd-jugadores.js', 'utf8');
  check('el modo de los rankings vive en el estado del módulo',
    /rankingModo: 'promedio'/.test(jug) && /plantelRankingModo: 'promedio'/.test(jug),
    'rankingModo=' + /rankingModo: 'promedio'/.test(jug) + ' plantel=' + /plantelRankingModo: 'promedio'/.test(jug));
  check('y nada lo resetea al cambiar de planilla',
    !/planillaId[\s\S]{0,300}rankingModo = 'promedio'/.test(jug));
  const eq = fs.readFileSync('./js/sgadd-equipos.js', 'utf8');
  check('el del plantel de Equipos también', /modoPlantel: 'promedio'/.test(eq));

  /* =====================================================================
     EL HEALTHCHECK
     ===================================================================== */
  titulo('EL HEALTHCHECK · prueba permisos de verdad');

  const salud = fs.readFileSync('./server/bin/kv-salud.js', 'utf8');
  /* Lee las dos claves que sostienen el producto: sin eso, un token con
     permisos parciales pasaría el chequeo y fallaría en el primer alta. */
  check('lee el padrón de clientes', /clientes\.cargar\(\)/.test(salud));
  check('y el catálogo', /catalogo\.cargar\(/.test(salud));
  check('y verifica la tabla de cupos', /AUTH\.CUPO_MAILS/.test(salud));
  /* LA ESCRITURA VA SOBRE UNA CLAVE PROPIA, nunca sobre el padrón ni el
     catálogo: una verificación que puede romper lo que verifica no sirve. */
  check('escribe sobre una clave de prueba, no sobre datos reales',
    /CLAVE_PRUEBA = 'sgadd:salud'/.test(salud)
    && !/escribir\(admins\.CLAVE_KV|escribir\(catalogo\.CLAVE_KV/.test(salud));
  check('y la limpia al terminar', /kv\.borrar\(CLAVE_PRUEBA\)/.test(salud));
  /* El legacy es de TRANSICIÓN: si queda puesto, el token que se quiso
     revocar sigue vivo y la rotación no rotó nada. */
  check('avisa si quedó un token legacy puesto',
    /token LEGACY configurado/.test(salud) && /revoc/.test(salud));

  const doc = fs.readFileSync('./ROTAR_TOKEN_UPSTASH.md', 'utf8');
  check('el procedimiento está documentado', doc.length > 1500);
  check('y el legacy se pone ANTES de generar el nuevo',
    doc.indexOf('LEGACY') < doc.indexOf('Generar el token nuevo'));
  check('y se revoca el viejo al final, no antes',
    doc.lastIndexOf('revoc') > doc.indexOf('Generar el token nuevo'));

  console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
    '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(NL + 'La suite explotó: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
