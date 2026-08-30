/* =====================================================================
   Backend · proxy con RBAC server-side

   Corre SIN instalar nada y SIN red: los handlers son funciones puras que
   devuelven `{status, body}`, y Google se reemplaza por un `fetch` de
   mentira. Es la convención del proyecto —`node test-x.js` desde la raíz—
   y justamente esta suite no puede ser la excepción: si verificar los
   permisos exigiera `npm install` y una credencial, se correría menos.

   La cadena real contra Google se prueba aparte, con
   `node server/bin/probar-google.js`.

   Cubre las cinco cosas que pueden salir mal en silencio:

     1. que el `sheetId` se filtre en alguna respuesta — el objetivo
        entero del backend,
     2. que un token manipulado pase la verificación,
     3. que un Básico reciba datos de scouting,
     4. que un cliente reciba filas de un equipo ajeno,
     5. que el servidor y el navegador apliquen reglas DISTINTAS.
   ===================================================================== */
'use strict';

const fs = require('fs');

/* Se configura el entorno ANTES de requerir nada del servidor: `config.js`
   lee `process.env` al llamar a `entorno()`, y los sheetId de prueba son
   los que después se buscan en las respuestas. */
const SHEET_DEPORTIVO = '1AAAA_sheet_privado_de_deportivo_AAAA';
const SHEET_RECONQUISTA = '1BBBB_sheet_privado_de_reconquista_BBBB';
process.env.JWT_SECRET = 'secreto-de-prueba-de-mas-de-32-caracteres-1234567890';
process.env.SHEET_DEPORTIVO_PRIMERA = SHEET_DEPORTIVO;
process.env.SHEET_RECONQUISTA_PRIMERA = SHEET_RECONQUISTA;
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@test.iam.gserviceaccount.com';
process.env.ORIGENES_PERMITIDOS = 'https://coachgn.github.io';

const jwtLib = require('./server/lib/jwt.js');
const auth = require('./server/lib/auth.js');
const reglas = require('./server/lib/reglas.js');
const sheets = require('./server/lib/google-sheets.js');
const handlers = require('./server/api/handlers.js');
const config = require('./server/lib/config.js');
const AUTH = require('./js/sgadd-auth.js');

let ok = 0, fail = 0;
const NL = String.fromCharCode(10);
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));

/* --------------------------------------------------------------------
   GOOGLE DE MENTIRA

   Devuelve un libro chico pero con la forma REAL: encabezados en la fila
   0, columna EQUIPO, y la fila `EQUIPO TIPO` que el panel usa como
   mediana de la liga.
   -------------------------------------------------------------------- */
const LIBRO = {
  'PROMEDIOS E': [
    ['EQUIPO', 'FASE', 'PTS', 'eFG%'],
    ['DEPORTIVO LA PLATA - MM', 'REGULAR', 75.6, 0.48],
    ['A. MAYO - MM', 'REGULAR', 71.2, 0.46],
    ['UNIVERSITARIO - MM', 'REGULAR', 69.8, 0.44],
    ['EQUIPO TIPO', 'TOTAL', 70.5, 0.46],
  ],
  'ACUMULADO E': [['EQUIPO', 'PTS'], ['DEPORTIVO LA PLATA - MM', 831], ['A. MAYO - MM', 783]],
  'Base Datos E': [
    ['PARTIDO', 'EQUIPO', 'FECHA', 'PTS'],
    ['DEPORTIVO LA PLATA vs A. MAYO', 'DEPORTIVO LA PLATA - MM', '07/05/2026', 78],
    ['DEPORTIVO LA PLATA vs A. MAYO', 'A. MAYO - MM', '07/05/2026', 71],
    ['A. MAYO vs UNIVERSITARIO', 'A. MAYO - MM', '14/05/2026', 66],
    ['A. MAYO vs UNIVERSITARIO', 'UNIVERSITARIO - MM', '14/05/2026', 70],
  ],
  'PROMEDIOS 4F': [['EQUIPO', 'PACE'], ['DEPORTIVO LA PLATA - MM', 78.2], ['A. MAYO - MM', 74.1]],
  'ACUMULADO 4F': [['EQUIPO', 'POS'], ['DEPORTIVO LA PLATA - MM', 860]],
  '4 FACTORES': [['PARTIDO', 'EQUIPO', 'eFG%'], ['DEPORTIVO LA PLATA vs A. MAYO', 'DEPORTIVO LA PLATA - MM', 0.51]],
  'PROMEDIOS J': [
    ['NOMBRES', 'EQUIPO', 'MIN', 'PTS'],
    ['BOTTE, IGNACIO', 'DEPORTIVO LA PLATA - MM', 28.4, 14.2],
    ['BORRAJO, FRANCISCO', 'A. MAYO - MM', 31.1, 17.9],
    ['JUGADOR TIPO', '', 22.7, 8.1],
  ],
  'ACUMULADO J': [['NOMBRES', 'EQUIPO', 'PTS'], ['BOTTE, IGNACIO', 'DEPORTIVO LA PLATA - MM', 156]],
  'Base Datos J': [
    ['PARTIDO', 'NOMBRES', 'EQUIPO', 'PTS'],
    ['DEPORTIVO LA PLATA vs A. MAYO', 'BOTTE, IGNACIO', 'DEPORTIVO LA PLATA - MM', 18],
    ['A. MAYO vs UNIVERSITARIO', 'BORRAJO, FRANCISCO', 'A. MAYO - MM', 22],
  ],
};

let llamadasAGoogle = [];
function googleFalso(url, opciones) {
  llamadasAGoogle.push(String(url));
  if (String(url).indexOf('oauth2.googleapis.com') !== -1) {
    return Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ access_token: 'token-falso', expires_in: 3600 }) });
  }
  /* Devuelve EXACTAMENTE los rangos que se pidieron, no las nueve hojas
     siempre: la segunda llamada (la de texto) pide solo cuatro, y un mock
     que ignora la query no probaría que se piden las que corresponden. */
  const pedidos = String(url).split('ranges=').slice(1)
    .map(x => decodeURIComponent(x.split('&')[0]));
  const nombres = pedidos.length ? pedidos : config.HOJAS;
  return Promise.resolve({ ok: true, status: 200,
    json: () => Promise.resolve({
      valueRanges: nombres.map(h => ({ range: h, values: LIBRO[h] || [] })),
    }) });
}
/* Una clave RSA DE VERDAD, generada al vuelo. Con una de mentira el
   módulo explota al firmar y todos los handlers devuelven 502 — y los
   checks de "no filtra el sheetId" pasarían por el motivo equivocado,
   sobre un cuerpo de error vacío. Ya pasó al escribir esta suite.

   Además así se ejerce `firmarRS256` de verdad: es la única parte de la
   cadena con Google que se puede probar sin red. */
process.env.GOOGLE_PRIVATE_KEY = require('crypto')
  .generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' });
const DEPS = { fetch: googleFalso };

const pedir = (handler, o) => {
  sheets.limpiarCache();
  llamadasAGoogle = [];
  return handler({
    headers: o.token ? { authorization: 'Bearer ' + o.token } : {},
    params: { clubId: o.club || 'deportivo' },
    query: o.query || {},
  }, DEPS);
};

/* Los tres perfiles, con tokens de verdad. */
const T_ADMIN = auth.firmarToken({ email: 'freytesgn@gmail.com', club: 'deportivo' }, { expiraEn: '1h' });
const T_BASICO = auth.firmarToken({ email: 'dt@deportivo.com', club: 'deportivo',
  equipoAsignado: 'DEPORTIVO LA PLATA', plan: 'BASICO' }, { expiraEn: '1h' });
const T_PRO = auth.firmarToken({ email: 'dt@deportivo.com', club: 'deportivo',
  equipoAsignado: 'DEPORTIVO LA PLATA', plan: 'PRO' }, { expiraEn: '1h' });

/* ==================================================================== */
titulo('EL sheetId NO SALE · el objetivo entero del backend');

/* Si el id se filtra por un campo de debug, no queda nada: con el id, la
   planilla se lee por fuera del panel. */
(async () => {
  const casos = [
    ['catálogo', await pedir(handlers.manejarCatalogo, { token: T_ADMIN })],
    ['equipos · admin', await pedir(handlers.manejarEquipos, { token: T_ADMIN })],
    ['equipos · cliente', await pedir(handlers.manejarEquipos, { token: T_BASICO })],
    ['scouting · pro', await pedir(handlers.manejarScouting, { token: T_PRO,
      query: { local: 'DEPORTIVO LA PLATA', visitante: 'A. MAYO' } })],
  ];
  casos.forEach(([nombre, r]) => {
    const json = JSON.stringify(r.body);
    /* Se exige 200 ADEMÁS de la ausencia del id: un 502 no trae nada, así
       que sin esto el check pasaría por el motivo equivocado. */
    check(nombre + ' responde 200', r.status === 200, r.status + ' ' + json.slice(0, 90));
    check(nombre + ' no filtra ningún sheetId',
      json.indexOf(SHEET_DEPORTIVO) === -1 && json.indexOf(SHEET_RECONQUISTA) === -1);
  });

  const cat = await pedir(handlers.manejarCatalogo, { token: T_BASICO });
  check('el catálogo entrega slugs, no ids',
    cat.body.clubes.every(c => typeof c.id === 'string' && !('sheetId' in c)));
  check('y dice qué categorías tienen libro sin revelar cuál',
    cat.body.clubes[0].categorias.every(x => typeof x.activo === 'boolean' && !('sheetId' in x)));

  /* Y el fuente: un `console.log` del id en producción lo mandaría a los
     logs de Vercel, que es otra forma de filtrarlo. */
  /* El fuente, sin comentarios: un `sheetId:` en un objeto de respuesta
     lo mandaría al cliente, y un `console.log` del id lo mandaría a los
     logs de Vercel, que es otra forma de filtrarlo. */
  const srcH = fs.readFileSync('./server/api/handlers.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('ningún handler pone sheetId en un objeto de respuesta',
    !/sheetId\s*:/.test(srcH));
  check('ni lo loguea', !/console\.[a-z]+\([^)]*sheetId/.test(srcH));

  /* ================================================================== */
  titulo('EL TOKEN · los ataques clásicos de JWT');

  const S = process.env.JWT_SECRET;
  const [cab, pay, firma] = T_PRO.split('.');

  /* `alg: none` es LA vulnerabilidad de JWT: si el verificador lee el
     algoritmo del token, un atacante lo pone en `none` y manda cualquier
     payload sin firma. Acá el algoritmo es una constante. */
  const sinAlg = jwtLib.b64url(JSON.stringify({ alg: 'none', typ: 'JWT' })) + '.' + pay + '.';
  check('alg:none se rechaza', auth.verificarToken(sinAlg).ok === false);

  /* Confusión de algoritmo: cambiar el header a RS256 para que el
     verificador use otra clave. Misma defensa. */
  const rs = jwtLib.b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + pay + '.' + firma;
  check('la confusión RS256/HS256 se rechaza', auth.verificarToken(rs).ok === false);

  /* Payload manipulado: BASICO que se asciende a PRO. Es exactamente lo
     que hoy se puede hacer editando la URL. */
  const [c2, p2] = T_BASICO.split('.');
  const robado = JSON.parse(jwtLib.deB64url(p2).toString('utf8'));
  robado.plan = 'PRO';
  const falsificado = c2 + '.' + jwtLib.b64url(JSON.stringify(robado)) + '.' + T_BASICO.split('.')[2];
  const vf = auth.verificarToken(falsificado);
  check('un Básico NO se puede ascender a Pro editando el payload', vf.ok === false, vf.motivo);

  check('una firma manipulada se rechaza',
    auth.verificarToken(cab + '.' + pay + '.' + 'x'.repeat(firma.length)).ok === false);
  check('un token con otro secreto se rechaza',
    jwtLib.verificar(T_PRO, 'otro-secreto-de-mas-de-32-caracteres-abcdefgh').ok === false);
  check('basura no rompe el verificador',
    auth.verificarToken('no-es-un-jwt').ok === false &&
    auth.verificarToken('').ok === false &&
    auth.verificarToken(null).ok === false);

  /* Un token sin `exp` es una credencial permanente. No se puede firmar
     uno, y si llegara desde otro lado se rechaza. */
  let tiro = null;
  try { jwtLib.firmar({ email: 'x@y.com' }, S, {}); } catch (e) { tiro = e.codigo; }
  check('no se puede firmar un token sin vencimiento', tiro === 'SIN_VENCIMIENTO', tiro);
  const eterno = jwtLib.b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.'
    + jwtLib.b64url(JSON.stringify({ email: 'x@y.com', iss: 'sgadd' }));
  const crypto = require('crypto');
  const fEterno = jwtLib.b64url(crypto.createHmac('sha256', S).update(eterno).digest());
  check('y uno sin exp bien firmado tampoco pasa',
    jwtLib.verificar(eterno + '.' + fEterno, S).motivo === 'VENCIDO');

  const vencido = jwtLib.firmar({ email: 'x@y.com' }, S, { expiraEn: 1 });
  await new Promise(r => setTimeout(r, 1100));
  check('un token vencido se rechaza con su propio motivo',
    jwtLib.verificar(vencido, S).motivo === 'VENCIDO');

  /* EL CLAIM DE ADMIN SE RE-DERIVA: un token firmado para un mail que NO
     está en la lista no puede pedir permisos de admin, aunque el token
     sea nuestro y válido. */
  const impostor = auth.firmarToken({ email: 'no-soy-admin@gmail.com' }, { expiraEn: '1h' });
  check('un token válido de un mail cualquiera NO es admin',
    auth.verificarToken(impostor).rol === AUTH.ROLES.CLIENTE);

  /* ================================================================== */
  titulo('BÁSICO EN SCOUTING · 403 antes de tocar Google');

  const sc = await pedir(handlers.manejarScouting, { token: T_BASICO,
    query: { local: 'DEPORTIVO LA PLATA', visitante: 'A. MAYO' } });
  check('el Plan Básico recibe 403 en scouting', sc.status === 403, sc.status);
  check('con el motivo REQUIERE_PLAN, no un genérico',
    sc.body.codigo === AUTH.MOTIVOS.REQUIERE_PLAN, sc.body.codigo);
  check('y le dice qué plan pedir', sc.body.planRequerido === 'PRO');
  /* Sin una sola fila de datos en el cuerpo. */
  check('el 403 no trae datos', !sc.body.hojas);
  /* Y NI SIQUIERA SE PIDIÓ EL DATO: si el gate estuviera después de la
     lectura, un bug de serialización podría filtrarlo. Acá no viajó. */
  check('el servidor ni consultó a Google', llamadasAGoogle.length === 0, llamadasAGoogle.length);

  const scPro = await pedir(handlers.manejarScouting, { token: T_PRO,
    query: { local: 'DEPORTIVO LA PLATA', visitante: 'A. MAYO' } });
  check('el Plan Pro sí recibe el informe', scPro.status === 200, scPro.status);
  check('y con los datos del rival, que es el objeto del informe',
    !!scPro.body.hojas['PROMEDIOS J']);

  /* LA REGLA DE ORO, del lado del servidor. */
  const ajeno = await pedir(handlers.manejarScouting, { token: T_PRO,
    query: { local: 'A. MAYO', visitante: 'UNIVERSITARIO' } });
  check('un Pro NO puede scoutear un cruce ajeno', ajeno.status === 403, ajeno.status);
  check('con su propio motivo', ajeno.body.codigo === 'CRUCE_AJENO');
  check('y tampoco se consultó a Google', llamadasAGoogle.length === 0);

  const admScout = await pedir(handlers.manejarScouting, { token: T_ADMIN,
    query: { local: 'A. MAYO', visitante: 'UNIVERSITARIO' } });
  check('un admin sí puede armar cualquier cruce', admScout.status === 200, admScout.status);

  /* ================================================================== */
  titulo('EQUIPO AJENO · 403, con la tabla de posiciones a mano');

  const eqAjeno = await pedir(handlers.manejarEquipos, { token: T_BASICO,
    query: { equipo: 'A. MAYO' } });
  check('pedir la ficha de un rival da 403', eqAjeno.status === 403, eqAjeno.status);
  check('con el motivo OTRO_EQUIPO', eqAjeno.body.codigo === AUTH.MOTIVOS.OTRO_EQUIPO);
  /* El mensaje dice qué SÍ puede: un 403 mudo manda al DT a reportar que
     el panel no anda. */
  check('y dice qué sí está disponible',
    Array.isArray(eqAjeno.body.disponible) && eqAjeno.body.disponible.indexOf('clasificacion') !== -1);

  const eqPropio = await pedir(handlers.manejarEquipos, { token: T_BASICO,
    query: { equipo: 'DEPORTIVO LA PLATA - MM' } });
  check('su propio equipo, con sufijo de categoría, sí abre', eqPropio.status === 200, eqPropio.status);

  /* El token está atado a un club: sin esto, el token de DEPORTIVO
     serviría para pedir el libro de Reconquista. */
  const otroClub = await pedir(handlers.manejarEquipos, { token: T_BASICO, club: 'reconquista' });
  check('el token de un club no sirve para otro', otroClub.status === 403, otroClub.status);
  check('con el motivo OTRO_CLUB', otroClub.body.codigo === 'OTRO_CLUB');
  const admOtro = await pedir(handlers.manejarEquipos, { token: T_ADMIN, club: 'reconquista' });
  check('pero un admin sí entra a los dos', admOtro.status === 200, admOtro.status);

  /* ================================================================== */
  titulo('EL RECORTE · qué filas viajan de verdad');

  const rCli = await pedir(handlers.manejarEquipos, { token: T_BASICO });
  const rAdm = await pedir(handlers.manejarEquipos, { token: T_ADMIN });
  check('el cliente recibe 200 sin pedir equipo', rCli.status === 200);

  const equiposDe = (filas) => filas.slice(1).map(f => f[0]);
  const pe = equiposDe(rCli.body.hojas['PROMEDIOS E']);
  /* EL BENCHMARK DE LA LIGA VA COMPLETO, y ese es el cambio.

     Todo el valor del panel es comparativo: un PACE de 76 no dice nada, lo
     que dice algo es el percentil contra la liga. Recortar los agregados
     de temporada no protegía un dato sensible — le sacaba al cliente la
     mitad del producto, y en silencio. */
  check('PROMEDIOS E trae la liga ENTERA, que es lo que hace comparables los números',
    pe.some(e => /A\. MAYO/.test(e)) && pe.some(e => /UNIVERSITARIO/.test(e)),
    JSON.stringify(pe));
  check('y el suyo también, obviamente', pe.some(e => /DEPORTIVO LA PLATA/.test(e)));
  /* EL DAÑO COLATERAL QUE ESTO CIERRA: con un solo equipo, la distribución
     tenía n=1 y el percentil del PROPIO equipo salía 50 en todas las
     métricas. Eso no se lee como "falta el dato", se lee como "está en el
     promedio" — un número inventado que parece real. */
  check('con más de un equipo, los percentiles vuelven a significar algo',
    new Set(pe.filter(e => !/TIPO/.test(e))).size > 1,
    new Set(pe).size + ' equipos');

  /* LA FILA `EQUIPO TIPO` SE CONSERVA: es la MEDIANA de la liga y de ella
     salen todos los percentiles del panel. Sin ella el cliente recibe sus
     números sin nada contra qué compararlos, que es el valor del
     producto. Y no es el dato de otro club: es el agregado. */
  check('pero la fila EQUIPO TIPO sobrevive al recorte',
    pe.some(e => /EQUIPO TIPO/.test(e)), JSON.stringify(pe));

  const pj = rCli.body.hojas['PROMEDIOS J'].slice(1);
  /* Los promedios de temporada de los jugadores también: sin ellos no hay
     Top 20 de la liga, ni percentiles de jugador, ni jugadores clave del
     rival en el informe de scouting. Son las MISMAS columnas que muestra
     cualquier ranking. */
  check('PROMEDIOS J trae a los jugadores de toda la liga',
    pj.some(f => /A\. MAYO/.test(f[1])), JSON.stringify(pj.map(f => f[1])));
  check('y conserva el JUGADOR TIPO, que también es la mediana',
    pj.some(f => /JUGADOR TIPO/.test(f[0])));

  /* LO QUE SIGUE BLOQUEADO, y es lo que hace "profunda" a una ficha: el
     log partido a partido. De ahí salen la evolución, el tab Partidos, los
     rendimientos atípicos, el split local/visitante y el perfil de tiro.
     Sin eso, un rival tiene su promedio de temporada y nada más. */
  const bdj = rCli.body.hojas['Base Datos J'].slice(1);
  check('el log partido a partido de un rival NO viaja',
    bdj.every(f => /DEPORTIVO LA PLATA/.test(f[2])), JSON.stringify(bdj.map(f => f[2])));

  /* La tabla de posiciones va COMPLETA a propósito: comparar contra la
     liga es el valor del panel, y no expone nada que la federación no
     publique ya. */
  check('Base Datos E va completa, para que exista la tabla de posiciones',
    rCli.body.hojas['Base Datos E'].length === LIBRO['Base Datos E'].length);
  check('y el admin recibe todo, sin recortes',
    rAdm.body.hojas['Base Datos J'].length === LIBRO['Base Datos J'].length);
  /* El benchmark es IDÉNTICO para los dos: no hay nada que recortar ahí. */
  check('el benchmark de la liga es el mismo para cliente y admin',
    JSON.stringify(rCli.body.hojas['PROMEDIOS E']) ===
    JSON.stringify(rAdm.body.hojas['PROMEDIOS E']));
  /* Y el log NO: es la única diferencia entre los dos payloads. */
  check('pero el log del cliente es más corto que el del admin',
    rCli.body.hojas['Base Datos J'].length < rAdm.body.hojas['Base Datos J'].length,
    rCli.body.hojas['Base Datos J'].length + ' vs ' + rAdm.body.hojas['Base Datos J'].length);

  /* El panel tiene que SABER que está viendo un recorte: sin eso
     calcularía percentiles sobre una liga fantasma. */
  check('la respuesta declara qué hoja se recortó',
    JSON.stringify(rCli.body.alcance.hojasRecortadas) === JSON.stringify(['Base Datos J']),
    JSON.stringify(rCli.body.alcance.hojasRecortadas));
  check('y que el resto viene completo',
    rCli.body.alcance.hojasCompletas.indexOf('PROMEDIOS E') !== -1 &&
    rCli.body.alcance.hojasCompletas.indexOf('Base Datos E') !== -1);
  check('el admin no tiene ninguna recortada',
    rAdm.body.alcance.hojasRecortadas.length === 0);

  /* ================================================================== */
  titulo('SIN TOKEN · el servidor no atiende');

  /* Diferencia con el frontend, y es a propósito: allá "sin sesión" es
     acceso abierto porque no hay autenticación. Acá SÍ la hay, así que
     sin token no se responde nada. */
  for (const [nombre, h] of [['catálogo', handlers.manejarCatalogo],
    ['equipos', handlers.manejarEquipos], ['scouting', handlers.manejarScouting]]) {
    const r = await pedir(h, {});
    check(nombre + ' sin token da 401', r.status === 401, r.status);
    check('  y no trae datos', !r.body.hojas && !r.body.clubes);
  }
  check('y nunca se consultó a Google sin token', llamadasAGoogle.length === 0);

  /* ================================================================== */
  titulo('LAS REGLAS SON LAS MISMAS QUE LAS DEL NAVEGADOR');

  /* Si el servidor tuviera su propia copia de la matriz, las dos
     divergirían y la divergencia sería SILENCIOSA. */
  const srcAuth = fs.readFileSync('./server/lib/auth.js', 'utf8');
  const srcReglas = fs.readFileSync('./server/lib/reglas.js', 'utf8');
  /* El servidor USA el módulo del navegador, no una reimplementación.

     Lo importa de `compartido/` y no de `../../js/` porque eso último
     cruza el límite del deploy —Vercel sube solo `server/`— y hacía que
     la función muriera al cargar. La copia es mecánica y hay checks más
     abajo que fallan si difiere del original: la fuente de verdad sigue
     siendo `js/`. */
  check('el servidor usa el módulo del navegador, no lo reimplementa',
    /require\('\.\/compartido\/sgadd-auth\.js'\)/.test(srcAuth) &&
    /require\('\.\/compartido\/sgadd-auth\.js'\)/.test(srcReglas));
  check('y no tiene su propia lista de admins',
    !/freytesgn@gmail\.com/.test(srcAuth + srcReglas));
  check('ni su propia cascada de planes',
    !/BASICO['"]?\s*:\s*['"]BASICO/.test(srcAuth + srcReglas));

  /* El mismo veredicto de los dos lados, sobre los mismos datos. */
  const ses = auth.verificarToken(T_BASICO).sesion;
  check('cliente y servidor coinciden en el equipo',
    AUTH.puedeVerEquipo('A. MAYO', ses) === false &&
    reglas.puedeAnalizarEquipo('A. MAYO', ses) === false);
  check('y en el plan',
    AUTH.tieneModulo('scouting', ses) === false &&
    reglas.puedeBloque('scouting', ses).ok === false);

  /* Un bloque que nadie declaró se sirve CERRADO, al revés que las
     secciones del frontend: allá el costo de un default permisivo es una
     pantalla de más, acá es filtrar datos. */
  check('un bloque desconocido se trata como cerrado',
    reglas.puedeBloque('inventado', ses).ok === false);
  check('pero para un admin sigue abierto todo lo declarado',
    reglas.puedeBloque('scouting', auth.verificarToken(T_ADMIN).sesion).ok === true);

  /* ================================================================== */
  titulo('CORS Y RATE LIMIT · lo que el PoC sí contempla');

  const srcApp = fs.readFileSync('./server/app.js', 'utf8')
    + fs.readFileSync('./server/lib/limitador.js', 'utf8');
  check('CORS usa lista de permitidos y no comodín',
    /env\.origenes\.indexOf\(origen\)/.test(srcApp) && !/origin:\s*['"]\*/.test(srcApp));
  check('y el origen sale del entorno, no del código',
    /ORIGENES_PERMITIDOS/.test(fs.readFileSync('./server/lib/config.js', 'utf8')));
  check('hay rate limit', /function limitador/.test(srcApp));
  check('y dice por escrito que en serverless NO limita de verdad',
    /serverless/i.test(srcApp) && /NO limita/.test(srcApp));

  const { limitador } = require('./server/lib/limitador.js');
  const lim = limitador(2, 60000);
  const req = { ip: '1.2.3.4' };
  let ultimo = null;
  const res = { set: () => res, status: (s) => { ultimo = s; return res; }, json: () => {} };
  let pasaron = 0;
  for (let i = 0; i < 4; i++) lim(req, res, () => pasaron++);
  check('el limitador deja pasar el cupo y corta después',
    pasaron === 2 && ultimo === 429, 'pasaron=' + pasaron + ' ultimo=' + ultimo);
  let otro = 0;
  lim({ ip: '5.6.7.8' }, res, () => otro++);
  check('y cuenta por IP, no global', otro === 1);

  /* ================================================================== */
  titulo('EL .env.example DOCUMENTA TODO LO QUE HACE FALTA');

  const ej = fs.readFileSync('./server/.env.example', 'utf8');
  ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'JWT_SECRET',
   'ORIGENES_PERMITIDOS', 'SHEET_DEPORTIVO_PRIMERA'].forEach(v => {
    check('.env.example declara ' + v, ej.indexOf(v) !== -1);
  });
  /* Un ejemplo con una credencial real adentro es exactamente lo que no
     puede pasar: se commitea sin que nadie lo mire. */
  check('y no trae ninguna credencial de verdad',
    !/BEGIN PRIVATE KEY-----\n/.test(ej) && /JWT_SECRET=\s*$/m.test(ej));
  check('el .env está en .gitignore',
    /server\/\.env/.test(fs.readFileSync('./.gitignore', 'utf8')));
  /* La trampa nº1 de las Service Accounts. */
  check('y avisa de los \\n de la clave privada', /\\\\n/.test(ej) || /\\n/.test(ej));
  check('config.js convierte esos \\n a saltos reales',
    /replace\(\/\\\\n\/g, '\\n'\)/.test(fs.readFileSync('./server/lib/config.js', 'utf8')));

  /* ================================================================== */
  titulo('EL LINK DE CLIENTE');

  const link = auth.generarLinkCliente({
    base: 'https://coachgn.github.io/estadisticas/',
    email: 'DT@Deportivo.com ', club: 'deportivo',
    equipo: 'DEPORTIVO LA PLATA', plan: 'PRO', expiraEn: '30d',
  });
  check('devuelve una URL con el token', /access_token=/.test(link.url));
  check('y el club, que el panel necesita para pintar la marca antes de responder',
    /club=deportivo/.test(link.url));
  check('el mail se normaliza', link.sesion.email === 'dt@deportivo.com');
  check('el plan viaja firmado', link.sesion.plan === 'PRO');
  check('y tiene vencimiento', !!link.expiraEn && new Date(link.expiraEn) > new Date());
  /* Un plan mal escrito cae a BÁSICO, nunca a PRO — la misma regla del
     frontend, y acá vale plata. */
  const malPlan = auth.generarLinkCliente({ base: 'https://x.com/', email: 'a@b.com', plan: 'PROO' });
  check('un plan mal escrito cae a Básico, no a Pro', malPlan.sesion.plan === 'BASICO');

  let e1 = null;
  try { auth.firmarToken({ plan: 'PRO' }, { expiraEn: '1h' }); } catch (e) { e1 = e.codigo; }
  check('un token sin mail no se firma', e1 === 'SIN_EMAIL', e1);

  /* ================================================================== */
  titulo('EL MÓDULO DE GOOGLE');

  const libro = await sheets.obtenerLibro(SHEET_DEPORTIVO, DEPS);
  check('trae las 9 hojas del contrato',
    Object.keys(libro.hojas).length === 9, Object.keys(libro.hojas).length);
  /* DOS batchGet y no nueve GET sueltos: la cuota de Sheets se mide en
     peticiones por minuto y el arranque pide el libro entero.

     Son dos y no uno porque hacen falta dos VISTAS de las mismas hojas —
     los valores crudos para el índice y el texto ya formateado para la
     capa vieja de Principal, que no se puede reproducir del lado del
     cliente (40% de precisión sobre 157.278 celdas, punto 3). */
  const batch = llamadasAGoogle.filter(u => /batchGet/.test(u));
  check('dos batchGet: valores y texto', batch.length === 2, batch.length);
  check('y van en paralelo, no encadenados',
    /Promise[.]all\([[]/.test(fs.readFileSync('./server/lib/google-sheets.js', 'utf8')));
  /* OJO al distinguirlos: `UNFORMATTED_VALUE` CONTIENE la subcadena
     `FORMATTED_VALUE`, así que hay que matchear el parámetro entero o el
     find devuelve la URL equivocada. */
  const urlValores = batch.find(u => /valueRenderOption=UNFORMATTED_VALUE/.test(u));
  const urlTexto = batch.find(u => /valueRenderOption=FORMATTED_VALUE/.test(u));
  check('el de valores pide las 9 hojas',
    (urlValores.match(/ranges=/g) || []).length === 9);
  /* Solo cuatro: pedir las nueve en texto duplicaría el payload para nada. */
  check('y el de texto solo las 4 que usa Principal',
    (urlTexto.match(/ranges=/g) || []).length === 4);
  check('y pide solo lectura',
    /spreadsheets\.readonly/.test(fs.readFileSync('./server/lib/google-sheets.js', 'utf8')));

  sheets.limpiarCache();
  llamadasAGoogle = [];
  await sheets.obtenerLibro(SHEET_DEPORTIVO, DEPS);
  const primera = llamadasAGoogle.length;
  await sheets.obtenerLibro(SHEET_DEPORTIVO, DEPS);
  check('la segunda lectura sale del caché', llamadasAGoogle.length === primera);

  const uno = await sheets.obtenerDatosPlanilla(SHEET_DEPORTIVO, 'PROMEDIOS E', DEPS);
  check('obtenerDatosPlanilla(sheetId, rango) devuelve filas', Array.isArray(uno.valores));

  /* Los errores de Google se traducen a algo accionable, y el detalle
     crudo no se propaga: puede traer el mail de la cuenta de servicio. */
  const falla403 = { fetch: (u) => /oauth2/.test(u)
    ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ access_token: 't', expires_in: 3600 }) })
    : Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) }) };
  sheets.limpiarCache();
  let cod = null;
  try { await sheets.obtenerLibro(SHEET_DEPORTIVO, falla403); } catch (e) { cod = e.codigo; }
  check('una planilla no compartida da SIN_PERMISO_SHEET', cod === 'SIN_PERMISO_SHEET', cod);

  sheets.limpiarCache();
  const rFalla = await pedir(handlers.manejarEquipos, { token: T_ADMIN });
  check('y el handler no propaga el detalle crudo de Google',
    rFalla.status === 200 || !/gserviceaccount/.test(JSON.stringify(rFalla.body)));


/* ==================================================================== */
titulo('EL FRONTEND CONSUME LO QUE EL BACKEND MANDA · E2E');

/* Estos checks son el puente: toman el payload REAL que devuelve un
   handler y lo pasan por el adaptador REAL del frontend. Si el servidor
   cambia la forma de la respuesta, o el adaptador deja de entenderla,
   fallan acá — que es el único lugar donde las dos mitades se tocan. */
{
  const DATA = require('./js/sgadd-data.js');

  const rCli = await pedir(handlers.manejarEquipos, { token: T_BASICO });
  const rAdm = await pedir(handlers.manejarEquipos, { token: T_ADMIN });

  /* --- la forma del índice --- */
  const pe = DATA.matrizAFilas(rCli.body.hojas['PROMEDIOS E']);
  check('el adaptador saca los encabezados de la fila 0',
    pe.cols[0] === 'EQUIPO' && pe.cols.indexOf('eFG%') !== -1, JSON.stringify(pe.cols));
  check('y arma un objeto por fila, con la clave = encabezado',
    pe.filas.length > 0 && typeof pe.filas[0]['EQUIPO'] === 'string');
  check('los números llegan como números, no como texto',
    typeof pe.filas[0]['PTS'] === 'number', typeof pe.filas[0]['PTS']);
  /* Las tasas vienen como FRACCIÓN, igual que el `v` de GViz para una
     celda con formato %: si llegaran como 48 en vez de 0,48, todos los
     percentiles del panel saldrían por las nubes sin ningún síntoma. */
  check('y las tasas como fracción, igual que GViz',
    pe.filas[0]['eFG%'] > 0 && pe.filas[0]['eFG%'] < 1, pe.filas[0]['eFG%']);

  /* El recorte del servidor tiene que sobrevivir al adaptador: es el
     punto entero de que el filtrado sea server-side. */
  const nombres = pe.filas.map(f => f['EQUIPO']);
  check('la liga entera llega al índice, que es lo que hace comparables los números',
    nombres.some(n => /A\. MAYO/.test(n)) && nombres.some(n => /UNIVERSITARIO/.test(n)),
    JSON.stringify(nombres));
  check('y la fila TIPO sigue ahí, que es la mediana de la liga',
    nombres.some(n => /EQUIPO TIPO/.test(n)));

  const peAdm = DATA.matrizAFilas(rAdm.body.hojas['PROMEDIOS E']);
  check('cliente y admin ven el mismo benchmark', peAdm.filas.length === pe.filas.length,
    peAdm.filas.length + ' vs ' + pe.filas.length);

  /* Una fila enteramente vacía no es un dato: GViz ya las descartaba, y si
     entraran el índice contaría equipos fantasma. */
  const conVacias = DATA.matrizAFilas([['EQUIPO', 'PTS'], ['A', 1], ['', ''], [], ['B', 2]]);
  check('las filas vacías se descartan', conVacias.filas.length === 2, conVacias.filas.length);
  /* Sheets manda filas CORTAS cuando las últimas celdas están vacías: sin
     rellenar, esas columnas quedarían `undefined` en vez de ''. */
  const cortas = DATA.matrizAFilas([['A', 'B', 'C'], ['x']]);
  check('las filas cortas se rellenan en vez de quedar undefined',
    cortas.filas[0]['C'] === '', JSON.stringify(cortas.filas[0]));
  check('una matriz vacía no rompe',
    DATA.matrizAFilas([]).filas.length === 0 && DATA.matrizAFilas(null).cols.length === 0);

  /* --- la forma de la capa vieja de Principal --- */
  const leg = DATA.matrizALegacy(rCli.body.hojas['PROMEDIOS E'],
    rCli.body.hojasTexto['PROMEDIOS E']);
  check('la forma legacy trae cols con {id,label,type}',
    leg.cols[0] && leg.cols[0].label === 'EQUIPO' && !!leg.cols[0].id);
  check('y rows con {values, formatted}',
    leg.rows[0] && 'values' in leg.rows[0] && 'formatted' in leg.rows[0]);
  check('el valor crudo es número y el formateado es texto',
    typeof leg.rows[0].values['PTS'] === 'number' &&
    typeof leg.rows[0].formatted['PTS'] === 'string');
  /* Sin la vista en texto, `formatted` cae al valor crudo — que es
     EXACTAMENTE lo que hacía GViz con una celda sin `f`. No se inventa un
     formato: reproducir el de Sheets da 40% de precisión (punto 3). */
  const sinTexto = DATA.matrizALegacy(rCli.body.hojas['PROMEDIOS E'], null);
  check('sin la vista en texto, formatted cae al crudo en vez de inventarse',
    sinTexto.rows[0].formatted['PTS'] === String(sinTexto.rows[0].values['PTS']));

  /* LAS DOS VISTAS TIENEN QUE ESTAR ALINEADAS. Si el servidor filtrara
     cada una por su cuenta, el panel mostraría el número de una fila con
     el texto de otra — y eso no se ve, se lee mal. */
  const crudas = rCli.body.hojas['PROMEDIOS E'];
  const textos = rCli.body.hojasTexto['PROMEDIOS E'];
  check('el servidor recorta las dos vistas con los mismos índices',
    crudas.length === textos.length, crudas.length + ' vs ' + textos.length);
  check('y fila por fila hablan del mismo equipo',
    crudas.every((f, i) => String(f[0]) === String(textos[i][0])));

  /* Las hojas que Principal consume son exactamente las que el servidor
     manda en texto. Si divergen, Principal pierde el formato de una hoja
     sin que nadie se entere. */
  const idxSrc2 = fs.readFileSync('./index.html', 'utf8');
  const cfg = (idxSrc2.match(/const SHEETS_CONFIG = \[([\s\S]*?)\];/) || [])[1] || '';
  const usadas = (cfg.match(/name: '([^']+)'/g) || []).map(x => x.slice(7, -1));
  check('SHEETS_CONFIG y HOJAS_TEXTO piden las MISMAS hojas',
    usadas.slice().sort().join('|') === config.HOJAS_TEXTO.slice().sort().join('|'),
    JSON.stringify(usadas) + ' vs ' + JSON.stringify(config.HOJAS_TEXTO));

  /* --- el 403 del Básico llega como error, no como datos rotos --- */
  const sc403 = await pedir(handlers.manejarScouting, { token: T_BASICO,
    query: { local: 'DEPORTIVO LA PLATA', visitante: 'A. MAYO' } });
  check('un 403 no trae `hojas` que el adaptador pueda malinterpretar',
    !sc403.body.hojas && !sc403.body.hojasTexto);
  check('y el adaptador sobre un cuerpo de error devuelve vacío, no basura',
    DATA.matrizAFilas(sc403.body.hojas).filas.length === 0);
}

titulo('EL TOKEN EN EL NAVEGADOR');

{
  const AUTHF = require('./js/sgadd-auth.js');

  /* El navegador DECODIFICA sin verificar: no tiene el secreto ni puede
     tenerlo. Sirve para pintar la interfaz antes de la primera respuesta;
     quien decide es el servidor. */
  const p = AUTHF.leerPayload(T_PRO);
  check('el frontend puede leer el payload de su token',
    p && p.email === 'dt@deportivo.com' && p.plan === 'PRO', JSON.stringify(p));
  check('y el club al que está atado', p.club === 'deportivo');
  check('basura no rompe el lector',
    AUTHF.leerPayload('no-es-jwt') === null && AUTHF.leerPayload(null) === null &&
    AUTHF.leerPayload('') === null);

  /* QUE EL FRONTEND LO LEA NO SIGNIFICA QUE LO DECIDA. Este es el check
     que separa el gate de interfaz de la seguridad: un payload editado
     engaña a la UI y el servidor lo rechaza igual. */
  const partes = T_BASICO.split('.');
  const truchado = JSON.parse(jwtLib.deB64url(partes[1]).toString('utf8'));
  truchado.plan = 'PRO';
  const falso = partes[0] + '.' + jwtLib.b64url(JSON.stringify(truchado)) + '.' + partes[2];
  check('un token editado SÍ engaña al lector del frontend',
    AUTHF.leerPayload(falso).plan === 'PRO');
  check('pero el servidor lo rechaza', auth.verificarToken(falso).ok === false);
  /* Y no es que devuelva menos datos: no devuelve NINGUNO. */
  const conFalso = await pedir(handlers.manejarEquipos, { token: falso });
  check('y no le entrega un solo dato', conFalso.status === 401 && !conFalso.body.hojas,
    conFalso.status);

  /* Un token vencido no se acepta del lado del cliente tampoco: pintar la
     interfaz de una sesión que el servidor ya no atiende deja al DT
     mirando 401. */
  const vencido2 = jwtLib.firmar({ email: 'x@y.com', plan: 'PRO' },
    process.env.JWT_SECRET, { expiraEn: 1 });
  await new Promise(r => setTimeout(r, 1100));
  const rv = AUTHF.establecerToken(vencido2);
  check('un token vencido no se establece en el navegador',
    rv && rv.vencido === true && AUTHF.token() === null);

  /* El token se saca de la URL apenas se lee y va a sessionStorage. */
  const authSrc = fs.readFileSync('./js/sgadd-auth.js', 'utf8');
  check('el token se borra del query string al leerlo',
    /function sacarTokenDeLaUrl/.test(authSrc) &&
    /searchParams\.delete\('access_token'\)/.test(authSrc));
  /* El HASH se conserva: es la ruta de la app, y perderlo mandaría al DT a
     la pantalla de inicio cada vez que abre un link compartido. */
  check('y el hash se conserva, porque es la ruta de la app',
    /u\.pathname \+ u\.search \+ u\.hash/.test(authSrc));
  check('el token va a sessionStorage, no a localStorage',
    /sessionStorage/.test(authSrc) && !/localStorage\.setItem\(CLAVE_TOKEN/.test(authSrc));
  check('y gana sobre el ?usuario= editable',
    authSrc.indexOf("q.has('access_token')") < authSrc.indexOf("q.has('usuario')"));
}

titulo('DE DÓNDE SALEN LOS DATOS · los tres modos');

{
  const DATA = require('./js/sgadd-data.js');
  const AUTHF = require('./js/sgadd-auth.js');
  AUTHF.limpiarToken();

  DATA.configurar('');
  check('sin API configurada y sin token, no hay origen',
    DATA.origen({ slug: 'x' }) === 'ninguno');
  /* El modo GViz sigue vivo SOLO mientras dure el corte: una planilla con
     `sheetId` es hoy una config local, porque los JSON públicos ya no lo
     traen. Se borra cuando el backend esté desplegado. */
  check('con sheetId y sin API, cae a GViz (legacy de la transición)',
    DATA.origen({ sheetId: 'abc' }) === 'gviz');

  DATA.configurar('https://api.ejemplo.com/');
  check('la barra final de la URL de la API se normaliza',
    DATA.base() === 'https://api.ejemplo.com');
  check('con API pero sin token, tampoco va al backend',
    DATA.origen({ slug: 'x' }) === 'ninguno');

  AUTHF.establecerToken(T_PRO);
  check('con API y token, va al backend', DATA.origen({ slug: 'x' }) === 'backend');
  /* El backend GANA sobre GViz aunque la planilla traiga sheetId: si no,
     una config vieja seguiría leyendo la planilla pública por la espalda —
     que es justo el agujero que esto vino a cerrar. */
  check('y el backend gana sobre un sheetId que haya quedado dando vueltas',
    DATA.origen({ slug: 'x', sheetId: 'abc' }) === 'backend');
  AUTHF.limpiarToken();

  /* Sin nada, el error DICE QUÉ FALTA: un "no se pudieron cargar los
     datos" manda al DT a reportar que el panel no anda. */
  DATA.configurar('https://api.ejemplo.com');
  let msg = null;
  try { await DATA.cargarCategoria({ slug: 'x' }); } catch (e) { msg = e.codigo; }
  check('sin token, el error dice que hace falta un link de acceso',
    msg === 'SIN_TOKEN', msg);
  DATA.configurar('');
  let msg2 = null;
  try { await DATA.cargarCategoria({ id: 'x' }); } catch (e) { msg2 = e.codigo; }
  check('y sin libro conectado lo dice distinto', msg2 === 'SIN_LIBRO', msg2);
}

titulo('EL sheetId NO ESTÁ EN NINGÚN ARCHIVO PÚBLICO');

{
  /* El objetivo de la migración, verificado sobre los archivos que
     GitHub Pages sirve tal cual. Un id de Google son 44 caracteres que
     arrancan con 1; el patrón es laxo a propósito para que un id nuevo
     escrito a mano también salte. */
  const ID_GOOGLE = /[\"'][01][A-Za-z0-9_-]{25,}[\"']/;
  ['clubes/deportivo.json', 'clubes/reconquista.json', 'clubes/jujuy.json',
   'index.html', 'js/sgadd-core.js', 'js/sgadd-club.js', 'js/sgadd-app.js',
   'js/sgadd-data.js'].forEach(f => {
    const txt = fs.readFileSync('./' + f, 'utf8');
    const m = txt.match(ID_GOOGLE);
    check(f + ' no trae ningún id de planilla', !m, m && m[0]);
  });
  ['clubes/deportivo.json', 'clubes/reconquista.json', 'clubes/jujuy.json'].forEach(f => {
    const j = JSON.parse(fs.readFileSync('./' + f, 'utf8'));
    check(f + ' declara slug en todas sus planillas',
      (j.planillas || []).every(p => typeof p.slug === 'string' && p.slug));
  });

  /* Y el slug del JSON tiene que existir en el catálogo del servidor: si
     no, la categoría aparece en el selector y la carga devuelve 404. */
  const declarados = [];
  ['deportivo', 'reconquista', 'jujuy'].forEach(c => {
    const j = JSON.parse(fs.readFileSync('./clubes/' + c + '.json', 'utf8'));
    (j.planillas || []).forEach(p => declarados.push([c, p.slug]));
  });
  declarados.forEach(([club, slug]) => {
    check('el slug ' + slug + ' existe en el catálogo del servidor',
      !!config.resolverCategoria(club, slug), club + '/' + slug);
  });
}


titulo('LA CONFIGURACIÓN DEL DEPLOY');

/* SIN `vercel.json` TODOS LOS ENDPOINTS DAN 404, con el código
   perfectamente bien: Vercel publica cada archivo de `api/` en la ruta
   que le da su NOMBRE, así que `api/index.js` queda en `/api` y las rutas
   reales (`/api/v1/equipos/:clubId`) las buscaría como archivos que no
   existen. Es el tipo de cosa que solo se descubre desplegando, y por eso
   se fija acá. */
{
  const vercel = JSON.parse(fs.readFileSync('./server/vercel.json', 'utf8'));

  const rw = (vercel.rewrites || [])[0];
  check('vercel.json manda todo /api/* a la única función',
    !!rw && rw.source === '/api/(.*)' && rw.destination === '/api',
    JSON.stringify(rw));

  /* El handler tiene que ser una función `(req, res)`: es el contrato de
     Vercel, y una app de Express lo cumple tal cual. */
  const idxSrc = fs.readFileSync('./server/api/index.js', 'utf8');
  check('api/index.js exporta la app, que es un handler (req,res)',
    /module\.exports = crearApp\(\)/.test(idxSrc));

  /* Las respuestas de la API NO se pueden cachear, y esto no es una
     optimización al revés: lo que devuelve `/api/v1/equipos` DEPENDE DE
     QUIÉN PREGUNTA. El token va en un header, así que dos usuarios
     distintos piden la MISMA URL — un intermediario que cachee por URL le
     serviría el recorte de uno al otro. */
  const h = (vercel.headers || [])[0];
  const claves = ((h && h.headers) || []).reduce((o, x) => (o[x.key] = x.value, o), {});
  check('y ninguna respuesta de la API se cachea',
    /no-store/.test(claves['Cache-Control'] || ''), claves['Cache-Control']);
  check('con Vary en Authorization, que es lo que distingue a un usuario de otro',
    /Authorization/.test(claves.Vary || ''), claves.Vary);

  /* CORS lo maneja Express con su lista de permitidos. Declararlo TAMBIÉN
     en vercel.json daría dos lugares que responden headers de CORS, y cuál
     gana depende del orden. */
  const cors = JSON.stringify(vercel.headers || []);
  check('CORS NO se declara en vercel.json, lo maneja Express',
    !/Access-Control/i.test(cors));

  /* Lo que NO se sube. Un `.env` en el bundle es la credencial completa */
  const ign = fs.readFileSync('./server/.vercelignore', 'utf8');
  check('el .env está excluido del deploy', /^\.env$/m.test(ign));
  check('y los CLI de administración también, que se corren en local',
    /^bin\/$/m.test(ign));

  /* La raíz devuelve algo: sin nada estático no hay forma rápida de
     distinguir "no se desplegó" de "se desplegó y no tiene home". */
  const home = fs.readFileSync('./server/public/index.html', 'utf8');
  check('la raíz del deploy tiene una página que confirma que está vivo',
    /salud/.test(home));
  /* Pero es PÚBLICA: no puede decir qué clubes existen ni qué endpoints
     de datos hay. El nombre del producto sí puede aparecer — el panel ya
     está publicado y se llama así; lo que no puede aparecer es el mapa. */
  check('y no nombra ningún club',
    !/deportivo|reconquista|jujuy/i.test(home));
  check('ni ningún endpoint de datos: solo el de salud',
    (home.match(/\/api\/v1\/[a-z]+/gi) || []).every(r => /salud/.test(r)),
    JSON.stringify(home.match(/\/api\/v1\/[a-z]+/gi)));
  check('ni se indexa', /noindex/.test(home));
}

titulo('LAS VARIABLES QUE HAY QUE CONFIGURAR');

{
  /* Si `.env.example` y lo que el código lee se separan, alguien despliega
     con una variable faltante y el error aparece recién en producción. */
  const ej = fs.readFileSync('./server/.env.example', 'utf8');
  const cfg = fs.readFileSync('./server/lib/config.js', 'utf8');
  const usadas = (cfg.match(/process\.env\.([A-Z_0-9]+)/g) || [])
    .map(x => x.replace('process.env.', ''));
  [...new Set(usadas)].forEach(v => {
    check('.env.example declara ' + v, ej.indexOf(v) !== -1);
  });

  /* Los 5 slugs de los JSON de club tienen que tener su variable: si falta
     una, esa categoría aparece en el selector y la carga da 404. */
  const slugs = [];
  ['deportivo', 'reconquista', 'jujuy'].forEach(c => {
    const j = JSON.parse(fs.readFileSync('./clubes/' + c + '.json', 'utf8'));
    (j.planillas || []).forEach(p => slugs.push([c, p.slug]));
  });
  slugs.forEach(([club, slug]) => {
    const cat = config.resolverCategoria(club, slug);
    check(slug + ' resuelve, y su sheetId sale del entorno',
      !!cat && /process\.env\.SHEET_/.test(cfg));
  });

  /* CORS vacío = ningún origen de navegador aceptado. Es el default
     correcto (mejor no responderle a nadie que responderle a todos) pero
     hay que decir en el ejemplo cuál va. */
  check('el ejemplo trae el origen del panel publicado',
    /coachgn\.github\.io/.test(ej));

  /* LA CLAVE PRIVADA ACEPTA LAS DOS FORMAS, y conviene saberlo antes de
     pelearse con el panel de Vercel: con `\\n` literales (como sale del
     JSON de Google) o con saltos reales (como queda al pegarla en un
     textarea). El `replace` es un no-op sobre la segunda. */
  const conEscapes = 'A\\nB';
  const conSaltos = 'A' + String.fromCharCode(10) + 'B';
  const convertir = (v) => v.replace(/\\n/g, String.fromCharCode(10));
  check('la clave privada funciona con \\n literales',
    convertir(conEscapes) === conSaltos);
  check('y también pegada con saltos reales',
    convertir(conSaltos) === conSaltos);
}


titulo('EL BUNDLE DE VERCEL · nada puede salir de server/');

/* EL BUG QUE ESTO FIJA, y costó un deploy roto.

   `server/lib/auth.js` importaba `../../js/sgadd-auth.js` para no
   reescribir las reglas. La intención es correcta y sigue vigente. Lo que
   no se vio es que cruza el LÍMITE DEL DEPLOY: Vercel tiene como raíz
   `server/` y sube SOLO ese directorio, así que `../../js/` no existe del
   otro lado.

   Síntoma: `FUNCTION_INVOCATION_FAILED` en TODOS los endpoints, incluido
   `/api/v1/salud` — que no toca Google ni pide credenciales. La función
   moría al cargar, con el código perfectamente bien.

   Se resolvió copiando los dos módulos a `server/lib/compartido/` con
   `bin/sincronizar-compartido.js`. La fuente de verdad sigue siendo
   `js/`: el copiado es mecánico y los checks de abajo fallan si difieren. */
{
  const path = require('path');
  const sync = require('./server/bin/sincronizar-compartido.js');

  /* 1 · NINGÚN require puede salir de `server/`. Es la invariante que
     hace imposible repetir el bug: si mañana alguien vuelve a importar de
     `../../js/`, este check falla ANTES de desplegar. */
  const archivosServidor = [];
  (function recorrer(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      if (e.name === 'node_modules' || e.name === 'compartido') return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name.endsWith('.js')) archivosServidor.push(p);
    });
  })('./server');

  const fugas = [];
  archivosServidor.forEach(p => {
    const txt = fs.readFileSync(p, 'utf8');
    const m = txt.match(/require\(['"](\.\.\/)+(?!\.)[^'"]*['"]\)/g) || [];
    m.forEach(r => {
      /* `../lib/…` o `../app.js` son internos: suben un nivel pero siguen
         adentro de `server/`. Lo que no puede haber es un `../../`. */
      if (/\.\.\/\.\./.test(r)) fugas.push(p.replace(/\\/g, '/') + ' → ' + r);
    });
  });
  check('ningún módulo del servidor importa fuera de server/',
    fugas.length === 0, fugas.join(' | '));

  /* 2 · Las copias están al día. Si alguien toca `js/sgadd-auth.js` y no
     regenera, el servidor aplicaría reglas VIEJAS — y esa divergencia
     sería silenciosa, que es justo lo que la importación directa evitaba. */
  const viejos = sync.desincronizados();
  check('las copias de server/lib/compartido/ están al día',
    viejos.length === 0,
    viejos.length ? viejos.join(', ') + '  → corré: node server/bin/sincronizar-compartido.js' : '');

  /* 3 · Y son copias EXACTAS, no una versión editada a mano. */
  sync.MODULOS.forEach(nombre => {
    const copia = fs.readFileSync(path.join(sync.DESTINO, nombre), 'utf8');
    const fuente = fs.readFileSync('./js/' + nombre, 'utf8');
    check(nombre + ' es la fuente completa, sin editar',
      copia.indexOf(fuente) !== -1 && copia.length === copia.indexOf(fuente) + fuente.length);
    check('y lo declara arriba de todo, para el que abra el archivo',
      /ARCHIVO GENERADO · NO EDITAR/.test(copia.slice(0, 200)));
  });

  /* 4 · El servidor y el navegador siguen dando el MISMO veredicto. El
     punto de todo el rodeo: la copia no puede volverse una segunda fuente
     de verdad. */
  const AUTH_SERVIDOR = require('./server/lib/compartido/sgadd-auth.js');
  const ses = { email: 'dt@x.com', equipoAsignado: 'DEPORTIVO LA PLATA', plan: 'BASICO' };
  check('la copia y el original coinciden en el equipo',
    AUTH_SERVIDOR.puedeVerEquipo('A. MAYO', ses) === AUTH.puedeVerEquipo('A. MAYO', ses));
  check('en el plan',
    AUTH_SERVIDOR.tieneModulo('scouting', ses) === AUTH.tieneModulo('scouting', ses));
  check('y en la matriz de secciones entera',
    JSON.stringify(Object.keys(AUTH_SERVIDOR.MODULOS)) === JSON.stringify(Object.keys(AUTH.MODULOS)));
  check('la lista de admins es la misma',
    AUTH_SERVIDOR.ADMINS.join(',') === AUTH.ADMINS.join(','));

  /* 5 · El arranque local NO se sube. Vercel trata un `index.js` en la
     raíz del proyecto como entrypoint, y ese llama a `.listen()` en vez de
     exportar un handler: la raíz del deploy devolvía 500.

     LA BARRA INICIAL ES OBLIGATORIA. `.vercelignore` es sintaxis gitignore:
     un patrón `index.js` SIN barra excluye ese nombre en CUALQUIER
     profundidad — incluido `server/api/index.js`, el entrypoint de
     verdad. Con esa forma, el build local (`vercel build`) ni siquiera
     genera la función `api/index.func`: solo queda `api/handlers.func`
     (que no sirve nada) y el deploy entero da 404. Costó un segundo deploy
     roto encontrarlo, porque el primer check de esta suite pasaba igual
     (buscaba la palabra "index.js" en el archivo, sin mirar si estaba
     anclada) y el bug no se veía hasta correr `vercel build` de verdad. */
  const ign = fs.readFileSync('./server/.vercelignore', 'utf8');
  check('el arranque local (/index.js) está excluido, ANCLADO a la raíz',
    /^\/index\.js$/m.test(ign));
  check('y NO con el patrón sin barra, que en gitignore es recursivo y se comería a api/index.js',
    !/^index\.js$/m.test(ign));
  /* Pero `api/index.js` SÍ tiene que subir: es el entrypoint de verdad. */
  check('y api/index.js no queda excluido por eso',
    fs.existsSync('./server/api/index.js') && !/^api\//m.test(ign));

  /* 6 · Vercel autodetecta "framework: express" a partir del `main` de
     package.json (acá, `index.js`) y --desde esa detección-- usa `app.js`
     como handler de TODO lo que no sea `/api/*`, pisando el rewrite de
     este mismo archivo y dejando a `api/index.js` sin ninguna ruta. Pero
     `app.js` exporta `{ crearApp }` (una fábrica), no una app invocable:
     la raíz del deploy daba `FUNCTION_INVOCATION_FAILED` y `/api/v1/salud`
     daba 404, los dos con el código intacto. `"framework": null` apaga esa
     autodetección y deja el ruteo clásico por archivos de `api/`, que es
     el que esta suite y el bundle aislado ya verifican. */
  const vercelJson = JSON.parse(fs.readFileSync('./server/vercel.json', 'utf8'));
  check('vercel.json desactiva la autodetección de framework (pisaba a api/index.js)',
    vercelJson.framework === null, JSON.stringify(vercelJson.framework));
}


titulo('NINGÚN ID DE GOOGLE SALE · detector genérico');

/* EL AGUJERO QUE ESTO CIERRA, y que la suite tenía en verde.

   El check original buscaba los DOS sheetId de la fixture. Pasaba — y
   mientras tanto el backend mandaba al navegador la columna `ID_ARCHIVO`
   entera: el id de Drive del box score de origen que MotorStats escribe
   en las tres maestras desde su v43.

   Medido contra la planilla REAL de DEPORTIVO: **76 ids distintos en 460
   filas**, y 152 de esas en `Base Datos E`, que se entrega COMPLETA hasta
   al cliente más restringido porque de ahí sale la tabla de posiciones.

   Buscar los ids que uno ya conoce no prueba nada sobre los que no. El
   detector de abajo busca la FORMA de un id de Google, así que caza
   también el que aparezca mañana en una columna nueva. */
{
  /* Un id de Drive son 33+ caracteres de [A-Za-z0-9_-] que arrancan con 1
     o 0. El patrón es laxo a propósito: un falso positivo se revisa a
     mano, un falso negativo es una fuga que nadie ve. */
  const ID_GOOGLE = /\b[01][A-Za-z0-9_-]{28,}\b/;

  const fixture = [
    ['PARTIDO', 'EQUIPO', 'ID_ARCHIVO', 'PTS'],
    ['A vs B', 'DEPORTIVO LA PLATA - MM', '1iVoCxBDFejThgUfG3-0srDwyeBbj_OMc3gu_NC9JS8M', 78],
    ['A vs B', 'A. MAYO - MM', '1EdDPUKETWmUWSAatDe_yWAvdpS82OIguSyneuOW-yBQ', 71],
  ];
  /* El detector tiene que servir: si no encuentra el id en la fixture
     cruda, tampoco lo encontraría en una respuesta y el test sería un
     adorno. */
  check('el detector reconoce un id de Drive de verdad',
    ID_GOOGLE.test(JSON.stringify(fixture)));

  const limpia = reglas.sinColumnasOcultas(fixture);
  check('ID_ARCHIVO se saca de la matriz', !ID_GOOGLE.test(JSON.stringify(limpia)));
  check('y las demás columnas quedan intactas',
    JSON.stringify(limpia[0]) === JSON.stringify(['PARTIDO', 'EQUIPO', 'PTS']) &&
    limpia[1][2] === 78);

  /* Se resuelve por NOMBRE y no por posición: el motor agrega columnas
     entre versiones, y un índice fijo cortaría la equivocada sin síntoma. */
  const movida = [['ID_ARCHIVO', 'EQUIPO'], ['1iVoCxBDFejThgUfG3-0srDwyeBbj_OMc3gu_NC9JS8M', 'X']];
  check('se corta por nombre de encabezado, no por posición',
    JSON.stringify(reglas.sinColumnasOcultas(movida)) === JSON.stringify([['EQUIPO'], ['X']]));
  check('una hoja sin esa columna no se toca',
    JSON.stringify(reglas.sinColumnasOcultas([['A', 'B'], [1, 2]])) ===
    JSON.stringify([['A', 'B'], [1, 2]]));
  check('y una matriz vacía no rompe',
    reglas.sinColumnasOcultas([]).length === 0 && reglas.sinColumnasOcultas(null).length === 0);

  /* LO QUE IMPORTA: sobre las respuestas REALES de los tres perfiles. */
  const conId = Object.assign({}, LIBRO, {
    'Base Datos E': [
      ['PARTIDO', 'EQUIPO', 'FECHA', 'ID_ARCHIVO', 'PTS'],
      ['A vs B', 'DEPORTIVO LA PLATA - MM', '07/05/2026', '1iVoCxBDFejThgUfG3-0srDwyeBbj_OMc3gu_NC9JS8M', 78],
      ['A vs B', 'A. MAYO - MM', '07/05/2026', '1EdDPUKETWmUWSAatDe_yWAvdpS82OIguSyneuOW-yBQ', 71],
    ],
  });
  const original = LIBRO['Base Datos E'];
  LIBRO['Base Datos E'] = conId['Base Datos E'];

  for (const [quien, token] of [['admin', T_ADMIN], ['básico', T_BASICO], ['pro', T_PRO]]) {
    const r = await pedir(handlers.manejarEquipos, { token });
    const json = JSON.stringify(r.body);
    check('la respuesta de equipos para ' + quien + ' no trae ningún id de Google',
      !ID_GOOGLE.test(json), (json.match(ID_GOOGLE) || [])[0]);
  }
  /* Incluido el scouting, que NO recorta filas —necesita al rival— pero sí
     tiene que sacar las columnas ocultas. */
  const sc = await pedir(handlers.manejarScouting, { token: T_PRO,
    query: { local: 'DEPORTIVO LA PLATA', visitante: 'A. MAYO' } });
  check('y la de scouting tampoco, aunque no recorte filas',
    !ID_GOOGLE.test(JSON.stringify(sc.body)),
    (JSON.stringify(sc.body).match(ID_GOOGLE) || [])[0]);

  /* Las dos vistas tienen que quedar con las MISMAS columnas: si a una se
     le saca ID_ARCHIVO y a la otra no, el texto se desalinea del valor. */
  const rr = await pedir(handlers.manejarEquipos, { token: T_ADMIN });
  Object.keys(rr.body.hojasTexto || {}).forEach(h => {
    check(h + ': valores y texto quedan con las mismas columnas',
      JSON.stringify(rr.body.hojas[h][0]) === JSON.stringify(rr.body.hojasTexto[h][0]),
      JSON.stringify(rr.body.hojas[h][0]) + ' vs ' + JSON.stringify(rr.body.hojasTexto[h][0]));
  });

  LIBRO['Base Datos E'] = original;
}


titulo('EL PADRÓN DE LA LIGA · listado 200, ficha ajena 403');

/* La distinción entera de este bloque:

     QUIÉNES juegan en la liga    →  público, va completo
     CÓMO juega un rival          →  eso es el análisis, y va 403

   El buzón necesita lo primero para que el DT pueda marcarle una lesión o
   una baja a cualquiera. Lo segundo es lo que el recorte protege. */
{
  const rCli = await pedir(handlers.manejarEquipos, { token: T_BASICO });
  const rAdm = await pedir(handlers.manejarEquipos, { token: T_ADMIN });

  check('el listado de la liga responde 200', rCli.status === 200, rCli.status);
  check('y viene el padrón', Array.isArray(rCli.body.padron), typeof rCli.body.padron);

  const enPadron = rCli.body.padron.map(p => p.nombre);
  check('trae a los jugadores del club',
    enPadron.indexOf('BOTTE, IGNACIO') !== -1, JSON.stringify(enPadron));
  /* LO QUE ESTE BLOQUE VIENE A ARREGLAR: antes el cliente solo recibía su
     plantel y el buscador del buzón no encontraba a nadie más. */
  check('Y TAMBIÉN a los de los rivales, que es el punto',
    enPadron.indexOf('BORRAJO, FRANCISCO') !== -1, JSON.stringify(enPadron));

  /* El padrón del cliente y el del admin son el MISMO: no hay recorte acá,
     porque quién juega en cada club es público. */
  check('el padrón del cliente y el del admin coinciden',
    JSON.stringify(rCli.body.padron) === JSON.stringify(rAdm.body.padron));

  /* La fila JUGADOR TIPO es la MEDIANA de la liga, no una persona:
     ofrecerla en el buscador dejaría marcarle una lesión a una
     estadística. */
  check('la fila JUGADOR TIPO no entra al padrón',
    !enPadron.some(n => /JUGADOR TIPO/i.test(n)));

  /* Un jugador aparece una vez por FASE y por TORNEO. Sin deduplicar, el
     buscador mostraría al mismo tres veces. */
  const claves = rCli.body.padron.map(p => p.nombre + '|' + p.equipo);
  check('y no viene repetido por fase', claves.length === new Set(claves).size,
    claves.length + ' filas · ' + new Set(claves).size + ' únicas');

  /* LA LÍNEA ESTÁ EN LAS COLUMNAS. Se verifica por LISTA BLANCA y no por
     lista negra: con una lista negra, la columna que alguien agregue mañana
     pasa sola. */
  const campos = new Set();
  rCli.body.padron.forEach(p => Object.keys(p).forEach(k => campos.add(k)));
  check('el padrón trae SOLO nombre y equipo',
    JSON.stringify([...campos].sort()) === JSON.stringify(reglas.PADRON_CAMPOS.slice().sort()),
    JSON.stringify([...campos]));
  /* Y ninguno de esos dos es un número: si mañana entra `MIN` o `PTS` acá,
     se filtró justo lo que el recorte de PROMEDIOS J bloquea. */
  check('y ningún valor del padrón es una estadística',
    rCli.body.padron.every(p => Object.values(p).every(v => typeof v === 'string')));

  /* EL OTRO LADO, que es el que no se toca: el análisis del rival. */
  const ficha = await pedir(handlers.manejarEquipos, { token: T_BASICO, query: { equipo: 'A. MAYO' } });
  check('pero la ficha de un equipo ajeno sigue dando 403', ficha.status === 403, ficha.status);
  check('con su motivo', ficha.body.codigo === AUTH.MOTIVOS.OTRO_EQUIPO);
  check('y sin una sola fila de datos', !ficha.body.hojas && !ficha.body.padron);

  /* El padrón sigue siendo útil aunque el benchmark vaya completo: trae a
     los jugadores que NO están en `PROMEDIOS J` de este tramo —altas
     recientes, cambios de fase— y es la lista que el buzón usa sin tener
     que recorrer el índice. Lo que NO afloja es el log. */
  check('el log partido a partido sigue recortado al plantel propio',
    rCli.body.hojas['Base Datos J'].slice(1).every(f => /DEPORTIVO LA PLATA/.test(f[2])));
}

titulo('LA CAMPANITA · toda la liga, pero la ficha ajena no se abre');

{
  const buzonSrc = fs.readFileSync('./js/sgadd-buzon.js', 'utf8');

  /* El buscador une el índice (recortado) con el padrón (completo) y
     deduplica: en modo GViz el padrón viene vacío y el índice ya tiene a
     todos, así que se comporta igual en los dos modos. */
  check('el buscador del buzón usa el padrón y no solo el índice',
    /function padronCompleto/.test(buzonSrc) &&
    /padronCompleto\(\)\.forEach/.test(buzonSrc));
  check('y el del índice gana sobre el del padrón, que no trae la fila',
    /vistos\.has\(clave\)\) return;/.test(buzonSrc));

  /* El botón de la ficha se DESHABILITA para un equipo ajeno. Se
     deshabilita en vez de esconderse: un botón que desaparece en unas
     tarjetas y en otras no se lee como un bug. */
  check('la ficha de un jugador ajeno queda deshabilitada',
    /function puedeVerFicha/.test(buzonSrc) && /cursor-not-allowed/.test(buzonSrc));
  check('con el motivo a la vista, no un botón muerto',
    /title="Su ficha completa no está incluida/.test(buzonSrc));
  /* El equipo sale de la CLAVE y no de un parámetro extra: así el permiso
     se resuelve en un solo lugar y ningún llamador se puede olvidar. */
  check('el permiso se resuelve desde la clave, no de un argumento opcional',
    /function equipoDeLaClave/.test(buzonSrc) &&
    /puedeVerFicha\(clave\)/.test(buzonSrc));
  /* Y el guard va TAMBIÉN en `irAFicha`: un botón deshabilitado no impide
     invocar la función desde la consola. */
  check('y `irAFicha` chequea igual, no confía en el botón',
    /function irAFicha\(clave\) \{[\s\S]{0,200}puedeVerFicha\(clave\)/.test(buzonSrc));

  /* El padrón viaja del backend al estado de la app sin pasar por el
     índice: si entrara al índice, los rivales contarían para los
     percentiles y las medianas de la liga saldrían mal. */
  const dataSrc = fs.readFileSync('./js/sgadd-data.js', 'utf8');
  const appSrc = fs.readFileSync('./js/sgadd-app.js', 'utf8');
  check('el cliente de datos pasa el padrón', /padron: \(cuerpo && cuerpo\.padron\)/.test(dataSrc));
  check('y la app lo guarda aparte del índice',
    /estado\.padron = r\.padron/.test(appSrc) &&
    !/construirIndice[\s\S]{0,120}padron/.test(appSrc));
}


titulo('ALERTAS EN EL SERVIDOR · se detecta al rival sin mandar su log');

/* LA INVARIANTE DE ESTE BLOQUE, en una línea:
   la alerta SÍ viaja, el historial de partidos que la produjo NO. */
{
  const A = require('./server/lib/alertas.js');
  const ESTADOS = require('./server/lib/compartido/sgadd-estados.js');

  /* Un libro con DOS equipos y un jugador de CADA UNO que dejó de jugar.
     El de `A. MAYO` es el que importa: es un rival del cliente, y antes de
     esto su alerta no se podía calcular. */
  const f = (i) => (i < 10 ? '0' + i : i) + '/05/2026';
  const bdE = [['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'PTS', 'PTSopp']];
  const bdJ = [['FECHA', 'PARTIDO', 'NOMBRES', 'EQUIPO', 'FASE', 'MIN', 'PTS']];
  for (let i = 1; i <= 12; i++) {
    const p = 'DEPORTIVO LA PLATA vs A. MAYO ' + i;
    bdE.push([f(i), p, 'DEPORTIVO LA PLATA - MM', 'REGULAR', 'LOCAL', 80, 70]);
    bdE.push([f(i), p, 'A. MAYO - MM', 'REGULAR', 'VISITANTE', 70, 80]);
    bdJ.push([f(i), p, 'BOTTE, IGNACIO', 'DEPORTIVO LA PLATA - MM', 'REGULAR', 30, 15]);
    if (i <= 8) {
      bdJ.push([f(i), p, 'PROPIO, PARADO', 'DEPORTIVO LA PLATA - MM', 'REGULAR', 21, 10]);
      bdJ.push([f(i), p, 'RIVAL, PARADO', 'A. MAYO - MM', 'REGULAR', 24, 12]);
    }
  }
  const LIBRO_ALERTAS = {
    hojas: {
      'PROMEDIOS E': [['EQUIPO', 'FASE', 'PJ'],
        ['DEPORTIVO LA PLATA - MM', 'REGULAR', 12], ['A. MAYO - MM', 'REGULAR', 12]],
      'PROMEDIOS J': [['NOMBRES', 'EQUIPO', 'FASE', 'PJ', 'MIN'],
        ['BOTTE, IGNACIO', 'DEPORTIVO LA PLATA - MM', 'REGULAR', 12, 30],
        ['PROPIO, PARADO', 'DEPORTIVO LA PLATA - MM', 'REGULAR', 8, 21],
        ['RIVAL, PARADO', 'A. MAYO - MM', 'REGULAR', 8, 24]],
      'Base Datos E': bdE, 'Base Datos J': bdJ,
      'ACUMULADO E': [], 'ACUMULADO J': [],
      'PROMEDIOS 4F': [], 'ACUMULADO 4F': [], '4 FACTORES': [],
    },
    hojasTexto: {}, faltantes: [], leidoEn: new Date().toISOString(),
  };

  A.limpiarCache();
  const r = A.alertasDeLaLiga(LIBRO_ALERTAS, {}, { claveCache: 'test' });
  const nombres = r.alertas.map(a => a.nombre);

  check('detecta al jugador del propio club', nombres.indexOf('PROPIO, PARADO') !== -1,
    JSON.stringify(nombres));
  /* EL PUNTO DE TODO ESTO: sin cálculo en el servidor, la alerta de un
     rival no se puede computar — su log lo recorta el backend. */
  check('Y TAMBIÉN al del rival, que es lo que el cliente no puede calcular',
    nombres.indexOf('RIVAL, PARADO') !== -1, JSON.stringify(nombres));
  check('la alerta trae el texto listo para mostrar',
    /4 partidos seguidos sin ingresar/.test(
      (r.alertas.find(a => a.nombre === 'RIVAL, PARADO') || {}).detalle || ''),
    (r.alertas.find(a => a.nombre === 'RIVAL, PARADO') || {}).detalle);
  check('y el que juega todas no genera ninguna', nombres.indexOf('BOTTE, IGNACIO') === -1);

  /* LISTA BLANCA de campos: con una lista negra, el campo que el detector
     agregue mañana viaja solo. */
  const campos = new Set();
  r.alertas.forEach(a => Object.keys(a).forEach(k => campos.add(k)));
  check('cada alerta trae solo campos declarados',
    [...campos].every(k => A.CAMPOS.indexOf(k) !== -1), JSON.stringify([...campos]));
  /* Lo que NO puede aparecer: de dónde salió la alerta. */
  const json = JSON.stringify(r.alertas);
  check('ninguna alerta trae ids de partido', !/__id|A\. MAYO vs|vs DEPORTIVO/.test(json));
  check('ni filas del log partido a partido',
    !/FECHA|PARTIDO|CONDICION/.test(json));

  /* ------------------------------------------------------------------
     LA INVARIANTE QUE PIDIERON CONGELAR: sobre la RESPUESTA REAL.
     ------------------------------------------------------------------ */
  const original = LIBRO.hojas ? null : null;
  const guardar = {};
  Object.keys(LIBRO_ALERTAS.hojas).forEach(h => { guardar[h] = LIBRO[h]; LIBRO[h] = LIBRO_ALERTAS.hojas[h]; });

  sheets.limpiarCache(); A.limpiarCache();
  const resp = await pedir(handlers.manejarEquipos, { token: T_BASICO });
  const cuerpo = JSON.stringify(resp.body);

  check('la respuesta trae la lista de alertas', Array.isArray(resp.body.alertas));
  const delRival = (resp.body.alertas || []).filter(a => /A\. MAYO/.test(a.equipo || ''));
  check('con la alerta del rival adentro', delRival.length === 1, JSON.stringify(resp.body.alertas));

  /* Y AL MISMO TIEMPO, su log sigue sin viajar. Se verifica sobre el
     payload ENTERO y no solo sobre `hojas`: el día que alguien agregue un
     campo de debug, este check lo caza. */
  const bdjCliente = resp.body.hojas['Base Datos J'].slice(1);
  check('el log de Base Datos J sigue recortado al propio plantel',
    bdjCliente.every(fila => /DEPORTIVO LA PLATA/.test(fila[3])),
    JSON.stringify(bdjCliente.map(x => x[3])));
  check('el rival NO tiene una sola fila de log en el payload',
    bdjCliente.every(fila => !/A\. MAYO/.test(fila[3])));
  /* Su nombre sí aparece —en el padrón y en la alerta— pero sus minutos
     partido a partido no: es exactamente la línea del diseño. */
  check('su nombre aparece (padrón y alerta) pero no su historial',
    /RIVAL, PARADO/.test(cuerpo) &&
    !/"A\. MAYO - MM","REGULAR",24/.test(cuerpo));
  /* Su promedio de temporada SÍ viaja —es el número que muestra cualquier
     ranking— pero su historial partido a partido no. Esa es la línea. */
  check('su promedio de temporada sí, porque es el benchmark',
    resp.body.hojas['PROMEDIOS J'].slice(1).some(x => /A\. MAYO/.test(x[1])));

  /* El tramo viaja con la respuesta: una racha se cuenta DENTRO de una
     competencia, y si el cliente no sabe cuál se usó no puede saber si
     está mirando lo mismo. */
  check('la respuesta declara sobre qué tramo se calcularon',
    !!resp.body.tramoAlertas && !!resp.body.tramoAlertas.fase,
    JSON.stringify(resp.body.tramoAlertas));

  Object.keys(guardar).forEach(h => { LIBRO[h] = guardar[h]; });
  sheets.limpiarCache(); A.limpiarCache();
}

titulo('EL SERVIDOR NO REIMPLEMENTA EL JOIN NI EL DETECTOR');

/* La razón por la que esto es sólido y no una segunda implementación con
   los mismos bugs esperando. */
{
  const src = fs.readFileSync('./server/lib/alertas.js', 'utf8');

  check('el servidor arma el índice con construirIndice(), no a mano',
    /NUCLEO\.construirIndice\(/.test(src));
  check('y detecta con los detectores de sgadd-estados.js',
    /ESTADOS\.detectarInactividad\(/.test(src) && /ESTADOS\.detectarTraspasos\(/.test(src));
  /* Si alguien vuelve a escribir un join acá, se pierden la herencia de
     fecha y el guard de ambigüedad del punto 3 quater — que es donde este
     proyecto ya se quemó una vez. */
  check('no hay un join partido-a-jugador escrito a mano',
    !/idPartido\(|__fecha\s*=|FECHA['"]\]\s*\|\|/.test(src));
  check('ni una racha contada a mano',
    !/racha\s*\+\+|RACHA_INACTIVIDAD\s*=/.test(src));
  /* Y el adaptador de matriz a filas es el MISMO del frontend: si cada uno
     convirtiera por su cuenta, un día una fila vacía se descartaría de un
     lado y del otro no. */
  check('usa el mismo adaptador de matrices que el frontend',
    /DATOS\.matrizAFilas\(/.test(src));

  /* Los cuatro módulos compartidos están al día. El de estados es nuevo:
     si alguien toca la regla de los 4 partidos en `js/` y no regenera, el
     servidor detectaría con la regla vieja. */
  const sync = require('./server/bin/sincronizar-compartido.js');
  check('sgadd-estados.js está entre los módulos vendorizados',
    sync.MODULOS.indexOf('sgadd-estados.js') !== -1, JSON.stringify(sync.MODULOS));
  check('y sgadd-data.js también, por el adaptador',
    sync.MODULOS.indexOf('sgadd-data.js') !== -1);
  check('los cuatro están sincronizados con js/',
    sync.desincronizados().length === 0,
    sync.desincronizados().join(', '));

  /* EL MISMO CÓDIGO DE LOS DOS LADOS: se compara el detector vendorizado
     contra el del navegador sobre el mismo índice. */
  const ESTADOS_SERVIDOR = require('./server/lib/compartido/sgadd-estados.js');
  const ESTADOS_CLIENTE = require('./js/sgadd-estados.js');
  check('la regla de inactividad es la misma en los dos lados',
    ESTADOS_SERVIDOR.RACHA_INACTIVIDAD === ESTADOS_CLIENTE.RACHA_INACTIVIDAD &&
    ESTADOS_SERVIDOR.RACHA_AVISO === ESTADOS_CLIENTE.RACHA_AVISO);
  check('y el filtro anti-spam también',
    ESTADOS_SERVIDOR.MIN_PJ_PREVIOS === ESTADOS_CLIENTE.MIN_PJ_PREVIOS &&
    ESTADOS_SERVIDOR.MIN_MINUTOS_PREVIOS === ESTADOS_CLIENTE.MIN_MINUTOS_PREVIOS);
}

titulo('EL CLIENTE · qué hace con la lista del servidor');

{
  const EST = require('./js/sgadd-estados.js');
  const buzon = fs.readFileSync('./js/sgadd-buzon.js', 'utf8');

  /* El servidor NO tiene el mapa de estados: vive en el localStorage de
     cada navegador. Detecta todo y el cliente filtra lo que ya contestó. */
  const lista = [{ tipo: 'inactividad', clave: 'A|X', nombre: 'A' },
    { tipo: 'inactividad', clave: 'B|X', nombre: 'B' }];
  const mapa = EST.aplicar({}, 'A|X', 'SUSPENSO');
  const filtradas = EST.filtrarRespondidas(lista, mapa);
  check('el cliente descarta las que el DT ya contestó',
    filtradas.length === 1 && filtradas[0].clave === 'B|X');
  check('y con el mapa vacío no descarta ninguna',
    EST.filtrarRespondidas(lista, {}).length === 2);

  /* Ante la misma clave y tipo gana la LOCAL: si el navegador pudo
     calcularla, tiene el dato completo delante. */
  const local = [{ tipo: 'inactividad', clave: 'A|X', nombre: 'A', racha: 9 }];
  const servidor = [{ tipo: 'inactividad', clave: 'A|X', nombre: 'A', racha: 4 },
    { tipo: 'inactividad', clave: 'C|Y', nombre: 'C' }];
  const unidas = EST.combinarAlertas(local, servidor);
  check('no se duplica al mismo jugador', unidas.length === 2, unidas.length);
  check('y gana la local, que tiene el dato completo',
    unidas.find(a => a.clave === 'A|X').racha === 9);
  check('las del servidor que el cliente no pudo calcular sí entran',
    !!unidas.find(a => a.clave === 'C|Y'));

  /* Los REINGRESOS quedan locales: ese detector dispara solo sobre
     jugadores que el DT marcó, así que sin su mapa no hay sobre quién
     correr. */
  check('el buzón calcula los reingresos localmente',
    /E\.detectarReingresos\(st\.idx, estado\.mapa\)/.test(buzon));
  check('y toma del servidor el resto',
    /E\.filtrarRespondidas\(delServidor, estado\.mapa\)/.test(buzon));
  /* Sin lista del servidor —modo GViz, donde no hay recorte— se comporta
     exactamente como antes. */
  check('sin lista del servidor detecta todo localmente, como antes',
    /: E\.detectarAlertas\(st\.idx, estado\.mapa\)/.test(buzon));
}


titulo('EL TRAMO DE LAS ALERTAS · el servidor mira lo mismo que el panel');

/* Esto existe por dos bugs que convivían y que NINGÚN test veía, porque
   las alertas SALÍAN: solo que de una liga que no existe.

   1 · `torneoPorDefecto()` recibía `hojas` donde espera la LISTA de
   torneos, así que devolvía siempre `GENERAL` — que no es un torneo sino
   el centinela de "no scopear". El índice salía SIN SCOPE: IDA y VUELTA
   colapsados, los promedios del segundo pisando a los del primero y cada
   jugador contado dos veces (el defecto del punto 3 ter).

   2 · `torneosDisponibles()` no conoce al sintético `*TOTAL*`, que desde
   que abre el libro por defecto el cliente pide en CADA carga.

   Medido en producción antes del fix: pidiendo `torneo=*TOTAL*`, el
   servidor contestaba `tramoAlertas: { torneo: 'GENERAL' }`. */
{
  const A2 = require('./server/lib/alertas.js');

  /* Un libro de IDA y VUELTA, que es cuando existe el TOTAL sintético. */
  const g = (i) => (i < 10 ? '0' + i : i);
  const bdE2 = [['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'TORNEO', 'CONDICION', 'PTS', 'PTSopp']];
  const bdJ2 = [['FECHA', 'PARTIDO', 'NOMBRES', 'EQUIPO', 'FASE', 'TORNEO', 'MIN', 'PTS']];
  [['IDA', '05'], ['VUELTA', '08']].forEach(([tor, mes]) => {
    for (let i = 1; i <= 6; i++) {
      const fe = g(i) + '/' + mes + '/2026';
      const pa = 'ATENAS A vs PLATENSE A ' + tor + i;
      bdE2.push([fe, pa, "ATENAS 'A' - MM", 'REGULAR', tor, 'LOCAL', 80, 70]);
      bdE2.push([fe, pa, "PLATENSE 'A' - MM", 'REGULAR', tor, 'VISITANTE', 70, 80]);
      bdJ2.push([fe, pa, 'FIJO, TITULAR', "ATENAS 'A' - MM", 'REGULAR', tor, 30, 15]);
      /* Jugó toda la IDA y ni un minuto de la VUELTA: la alerta solo se ve
         mirando el tramo completo. */
      if (tor === 'IDA') bdJ2.push([fe, pa, 'PARADO, ENLAVUELTA', "ATENAS 'A' - MM", 'REGULAR', tor, 22, 11]);
    }
  });
  const LIBRO2 = { hojas: {
      'PROMEDIOS E': [['EQUIPO', 'FASE', 'TORNEO', 'PJ'],
        ["ATENAS 'A' - MM", 'REGULAR', 'IDA', 6], ["PLATENSE 'A' - MM", 'REGULAR', 'IDA', 6],
        ["ATENAS 'A' - MM", 'REGULAR', 'VUELTA', 6], ["PLATENSE 'A' - MM", 'REGULAR', 'VUELTA', 6]],
      'PROMEDIOS J': [['NOMBRES', 'EQUIPO', 'FASE', 'TORNEO', 'PJ', 'MIN'],
        ['FIJO, TITULAR', "ATENAS 'A' - MM", 'REGULAR', 'IDA', 6, 30],
        ['PARADO, ENLAVUELTA', "ATENAS 'A' - MM", 'REGULAR', 'IDA', 6, 22]],
      'Base Datos E': bdE2, 'Base Datos J': bdJ2,
      'ACUMULADO E': [], 'ACUMULADO J': [],
      'PROMEDIOS 4F': [], 'ACUMULADO 4F': [], '4 FACTORES': [] },
    hojasTexto: {}, faltantes: [], leidoEn: new Date().toISOString() };

  /* EL SINTÉTICO SE ACEPTA. Antes se rechazaba por "inexistente" y se caía
     al centinela sin scope. */
  A2.limpiarCache();
  const rT = A2.alertasDeLaLiga(LIBRO2, { fase: 'REGULAR', torneo: '*TOTAL*' }, { claveCache: 't1' });
  check('el servidor acepta el torneo sintético que pide el panel',
    rT.torneo === '*TOTAL*', rT.torneo);

  /* NUNCA `GENERAL`. Es el centinela de "no scopear", no un torneo: si
     aparece acá, las alertas describen un índice con los dos torneos
     colapsados. */
  A2.limpiarCache();
  const rNada = A2.alertasDeLaLiga(LIBRO2, {}, { claveCache: 't2' });
  check('sin tramo pedido NO cae en GENERAL, que colapsaría los torneos',
    rNada.torneo !== 'GENERAL', rNada.torneo);
  /* Y elige EL MISMO tramo que abriría el panel, que en este libro —dos
     torneos en la misma fase— es el TOTAL. Que coincidan es la propiedad:
     si el servidor calculara las alertas sobre otro recorte, el buzón
     hablaría de una liga distinta de la que el DT tiene delante. */
  check('y elige el mismo tramo que abriría el panel',
    rNada.torneo === '*TOTAL*' && rNada.fase === 'REGULAR',
    rNada.torneo + '|' + rNada.fase);

  /* Un torneo REAL pedido explícitamente se respeta, como siempre. */
  A2.limpiarCache();
  const rIda = A2.alertasDeLaLiga(LIBRO2, { fase: 'REGULAR', torneo: 'IDA' }, { claveCache: 't3' });
  check('un torneo real pedido se respeta', rIda.torneo === 'IDA', rIda.torneo);

  /* Y uno que NO existe en el libro no se cuela. */
  A2.limpiarCache();
  const rMal = A2.alertasDeLaLiga(LIBRO2, { fase: 'REGULAR', torneo: 'CLAUSURA' }, { claveCache: 't4' });
  check('un torneo inexistente cae a uno real, no al centinela',
    rMal.torneo !== 'CLAUSURA' && rMal.torneo !== 'GENERAL', rMal.torneo);

  /* LO QUE EL SCOPE COMPRA: mirando el TOTAL se ve al que jugó la Ida
     entera y desapareció en la Vuelta. */
  check('en el TOTAL se detecta al que dejó de jugar en la Vuelta',
    rT.alertas.some(a => /PARADO, ENLAVUELTA/.test(a.nombre)),
    JSON.stringify(rT.alertas.map(a => a.nombre)));
}

titulo('ESCRIBIR EL CATÁLOGO · la unica ruta que puede romper a todos');

/* El catálogo es la única pieza cuyo deterioro rompe a TODOS los clubes a
   la vez: KV le gana al código, así que un catálogo malo deja los libros
   en 502 sin que nadie haya tocado una planilla. Esa bomba ya se armó dos
   veces desde la CLI, y desde una pantalla web es MÁS fácil de armar, no
   menos: un formulario invita a probar. */
{
  const M = require('./server/lib/catalogo-mutar.js');
  const CATV = require('./server/lib/catalogo.js');
  const SHEET_OK = '1Zi2cBd0WGUTks-S0XCxR0hoGpB9KZGuqisFhzdtJl4s';

  const VIGENTE = {
    deportivo: { nombre: 'Deportivo', liga: 'la-plata', equipoPropio: 'DEPORTIVO LA PLATA',
      categorias: { 'deportivo-primera': { label: 'Primera', sheetId: SHEET_OK } } },
  };

  /* ALTA de una categoría en un club que ya existe. */
  const r1 = M.aplicar(VIGENTE, 'alta', {
    club: 'deportivo', categoria: 'deportivo-u21', label: 'U21', sheetId: SHEET_OK,
  }, CATV.validar);
  check('el alta agrega la categoría', r1.ok &&
    !!r1.catalogo.deportivo.categorias['deportivo-u21'], r1.motivo);
  check('y NO toca las que ya estaban',
    r1.catalogo.deportivo.categorias['deportivo-primera'].sheetId === SHEET_OK);
  check('no dice que creó un club', r1.creoClub === false);

  /* NO SE MUTA EL CATÁLOGO DE ENTRADA. Si `aplicar` escribiera sobre el
     objeto vigente, un guard que después aborta ya lo habría dejado sucio
     en el caché del proceso. */
  check('el catálogo vigente queda intacto',
    Object.keys(VIGENTE.deportivo.categorias).length === 1);

  /* CLUB NUEVO: sin nombre no se puede mostrar en ningún selector. */
  const sinNombre = M.aplicar(VIGENTE, 'alta', {
    club: 'nuevo', categoria: 'nuevo-primera', label: 'Primera', sheetId: SHEET_OK }, CATV.validar);
  check('un club nuevo sin nombre no entra', !sinNombre.ok, sinNombre.motivo);
  const conNombre = M.aplicar(VIGENTE, 'alta', {
    club: 'nuevo', nombre: 'Club Nuevo', categoria: 'nuevo-primera',
    label: 'Primera', sheetId: SHEET_OK }, CATV.validar);
  check('con nombre sí, y avisa que creó el club', conNombre.ok && conNombre.creoClub);

  /* UN ID ES UNA CLAVE: viaja en `?club=<id>` y nombra clubes/<id>.json. */
  const idMalo = M.aplicar(VIGENTE, 'alta', {
    club: 'Club Nuevo', nombre: 'x', categoria: 'y', label: 'z', sheetId: SHEET_OK }, CATV.validar);
  check('un id con espacios o mayúsculas se rechaza', !idMalo.ok, idMalo.motivo);

  /* PEGAR LA URL EN VEZ DEL ID es el error de dedo más común, y da un 502
     críptico media hora después en vez de un mensaje al guardar. */
  const urlEntera = M.aplicar(VIGENTE, 'alta', {
    club: 'deportivo', categoria: 'x', label: 'X',
    sheetId: 'https://docs.google.com/spreadsheets/d/' + SHEET_OK + '/edit' }, CATV.validar);
  check('pegar la URL entera se rechaza', !urlEntera.ok, urlEntera.motivo);
  check('y el mensaje dice qué pegar', /pegá el id|no la URL/i.test(urlEntera.motivo));

  /* EL GUARD QUE NO SE NEGOCIA: ninguna categoría pierde su libro. Es la
     versión servidor del guard de la CLI, y existe por lo mismo — KV le
     gana al código, así que una categoría sin sheetId pasa a activo:false
     y su carga devuelve 502. */
  const perdido = M.librosPerdidos(VIGENTE, {
    deportivo: { nombre: 'Deportivo', categorias: { 'deportivo-primera': { label: 'Primera', sheetId: '' } } },
  });
  check('se detecta la categoría que quedaría sin libro',
    perdido.length === 1 && perdido[0] === 'deportivo/deportivo-primera', JSON.stringify(perdido));
  check('y con el libro puesto no denuncia nada',
    M.librosPerdidos(VIGENTE, VIGENTE).length === 0);

  /* LA BAJA es la excepción explícita: ahí perder la categoría ES el
     pedido, no un accidente, así que el guard no puede bloquearla. */
  const DOS = Object.assign({}, VIGENTE, {
    jujuy: { nombre: 'Jujuy', liga: 'liga-argentina', equipoPropio: 'JUJUY BASQUET',
      categorias: { 'jujuy-primera': { label: 'Conferencia Norte', sheetId: SHEET_OK } } },
  });
  const b = M.aplicar(DOS, 'baja', { club: 'deportivo', categoria: 'deportivo-primera' }, CATV.validar);
  check('la baja de una categoría no la bloquea el guard', b.ok, b.motivo);
  check('y el club se va con su última categoría', b.ok && !b.catalogo.deportivo);
  check('sin tocar al otro club', b.ok && !!b.catalogo.jujuy);

  /* PERO EL CATÁLOGO NO PUEDE QUEDAR VACÍO, y se dice con esas palabras:
     el mensaje de `validar()` —"no tiene ningún club"— desde una pantalla
     de baja se lee como un error del sistema, no como el límite que es. */
  const ultimo = M.aplicar(VIGENTE, 'baja', { club: 'deportivo', categoria: 'deportivo-primera' }, CATV.validar);
  check('dar de baja el ÚLTIMO club se rechaza', !ultimo.ok, ultimo.motivo);
  check('y el mensaje lo explica', /último club|no puede quedar vac/i.test(ultimo.motivo));

  /* NO SE BORRA UN CLUB CON CATEGORÍAS DE UN GESTO. Un club es un cliente,
     y ese es el click que uno lamenta. */
  const bClub = M.aplicar(VIGENTE, 'baja', { club: 'deportivo' }, CATV.validar);
  check('borrar un club con categorías se rechaza', !bClub.ok, bClub.motivo);
  check('y dice cuántas quedan', /1 categoría/.test(bClub.motivo));

  /* Una acción desconocida no puede caer en un default que escriba. */
  check('una acción desconocida no escribe nada',
    !M.aplicar(VIGENTE, 'reemplazar-todo', { catalogo: {} }, CATV.validar).ok);

  /* Y EL VALIDADOR ES EL MISMO QUE USA LA CASCADA AL LEER. Dos validadores
     terminan discrepando, y el que se relaja es siempre el de escritura. */
  const src = fs.readFileSync('./server/api/handlers.js', 'utf8');
  check('el endpoint valida con el validador de la cascada',
    /mutar\.aplicar\([\s\S]{0,80}catalogo\.validar\)/.test(src));

  /* SOLO ADMIN, y se re-deriva contra la lista del servidor: el rol del
     token no se cree por venir firmado. */
  check('el endpoint exige rol ADMIN',
    /ctx\.rol !== AUTH\.ROLES\.ADMIN[\s\S]{0,600}403, 'SOLO_ADMIN'/.test(src));

  /* NUNCA SE ACEPTA UN CATÁLOGO ENTERO DESDE EL NAVEGADOR: entra una
     intención y el servidor la aplica sobre lo que HAY. Aceptar el objeto
     completo convertiría cualquier bug del frontend en pérdida de datos. */
  check('el handler no toma un catálogo del cuerpo',
    !/cuerpo\.catalogo|body\.catalogo/.test(src));

  /* SIN KV NO SE FINGE QUE SE GUARDÓ. Es el modo de fallar del sembrado
     que no tuvo efecto porque Vercel no leía KV. */
  check('sin Upstash configurado responde 503 y lo explica',
    /kv\.configurado\(\)[\s\S]{0,200}503/.test(src));

  /* CORS tiene que dejar pasar POST o el preflight falla ANTES de la
     petición, con un error que habla de red y no de CORS. */
  const appSrc2 = fs.readFileSync('./server/app.js', 'utf8');
  check('CORS permite POST', /methods: \['GET', 'POST', 'OPTIONS'\]/.test(appSrc2));
  check('y hay parser de JSON con tope', /express\.json\(\{ limit/.test(appSrc2));
}

titulo('EL TOKEN DE SOLO LECTURA · el servidor lee, el CLI escribe');

/* Vercel no tiene por qué poder escribir el catálogo: lo único que hace
   con KV es leerlo. Con el token completo arriba, cualquier fallo de la
   API podría pisar el catálogo de los tres clubes. */
{
  const KVT = require('./server/lib/kv.js');

  /* LAS CUATRO VARIANTES DE NOMBRE. Upstash bautiza distinto según por
     dónde se cree la base, y esto ya costó dos vueltas con el token
     completo: llegaron credenciales con el tercer nombre y el cliente no
     las reconocía. */
  const variantes = ['KV_REST_API_READ_ONLY_TOKEN', 'UPSTASH_KV_REST_API_READ_ONLY_TOKEN',
                     'UPSTASH_REDIS_REST_READONLY_TOKEN', 'UPSTASH_REDIS_REST_READ_ONLY_TOKEN'];
  variantes.forEach((nombre) => {
    const env = { UPSTASH_REDIS_REST_URL: 'https://x' };
    env[nombre] = 'RO';
    check('reconoce ' + nombre, KVT.configurado(env));
  });

  /* El servidor con SOLO el token de lectura tiene que poder leer. */
  const soloRO = { UPSTASH_REDIS_REST_URL: 'https://x', KV_REST_API_READ_ONLY_TOKEN: 'RO' };
  let usado = null;
  const espia = async (url, o) => {
    usado = o.headers.Authorization;
    return { ok: true, json: async () => ({ result: null }) };
  };
  {
    const r = await KVT.leer('sgadd:catalogo', { env: soloRO, fetch: espia });
    check('con solo el token de lectura, leer funciona', r.error === null);
    check('y va con ESE token', usado === 'Bearer RO', usado);

    /* ESCRIBIR FALLA ACÁ, NO EN UPSTASH. Sin la guarda sale la petición y
       vuelve un NOPERM crudo: el administrador ve un error de red donde lo
       que pasa es que está corriendo el CLI contra el entorno del
       servidor. */
    usado = null;
    let codigo = null;
    try { await KVT.escribir('sgadd:catalogo', { a: 1 }, { env: soloRO, fetch: espia }); }
    catch (e) { codigo = e.codigo; }
    check('escribir con token de solo lectura falla con un código propio',
      codigo === 'KV_SOLO_LECTURA', codigo);
    check('y NI SIQUIERA sale a la red', usado === null, usado);

    /* Con el token completo, escribir sigue funcionando igual que antes:
       la guarda solo mira el caso en que el completo NO está. */
    const completo = { UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'RW',
                       KV_REST_API_READ_ONLY_TOKEN: 'RO' };
    usado = null;
    await KVT.escribir('sgadd:catalogo', { a: 1 }, { env: completo, fetch: espia });
    check('con el token completo escribe, y usa el completo', usado === 'Bearer RW', usado);

    /* Y leer sigue prefiriendo el de lectura aunque estén los dos: es lo
       que hace que el CLI no gaste el permiso de escritura en un GET. */
    usado = null;
    await KVT.leer('sgadd:catalogo', { env: completo, fetch: espia });
    check('teniendo los dos, leer usa el de lectura', usado === 'Bearer RO', usado);
  }
}

titulo('EL CATÁLOGO · la cascada KV → env → código');

/* LO QUE ESTA CASCADA COMPRA: dar de alta un club deja de ser un cambio
   de código y un redeploy.

   Y LO QUE NO SE NEGOCIA: el nivel 3 —el literal del código— no se saca
   nunca. Es lo que hace que mover el catálogo a un servicio externo no
   vuelva frágil al servidor. Si Upstash no contesta, la cascada baja sola
   y los clubes que ya estaban siguen funcionando; lo único que deja de
   poder hacerse es dar de alta uno nuevo, que puede esperar. */
{
  const CAT = require('./server/lib/catalogo.js');
  const KV = require('./server/lib/kv.js');

  const DE_KV = {
    nuevoclub: { nombre: 'Club Nuevo', liga: 'la-plata', equipoPropio: 'NUEVO A',
      categorias: { 'nuevoclub-primera': { label: 'Primera', sheetId: '1DESDE_KV' } } },
  };
  const DE_ENV = {
    otroclub: { nombre: 'Otro', liga: 'x', equipoPropio: 'OTRO',
      categorias: { 'otroclub-primera': { label: 'Primera', sheetId: '1DESDE_ENV' } } },
  };

  /* Un Upstash de mentira: `fetch` inyectado, igual que con Google. Así la
     cascada se ejerce entera sin una cuenta ni red — que es la convención
     de toda esta suite. */
  const kvFalso = (respuesta) => ({
    env: { UPSTASH_REDIS_REST_URL: 'https://falso.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't' },
    fetch: () => Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ result: respuesta === null ? null : JSON.stringify(respuesta) }) }),
  });
  const kvCaido = {
    env: { UPSTASH_REDIS_REST_URL: 'https://falso.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't' },
    fetch: () => Promise.reject(new Error('ECONNREFUSED')),
  };

  /* --- nivel 1 · KV manda --- */
  CAT.limpiarCache();
  let r = await CAT.cargar(kvFalso(DE_KV));
  check('con KV disponible, el catálogo sale de KV', r.origen === 'kv', r.origen);
  check('y trae el club que solo está ahí', !!r.catalogo.nuevoclub);

  /* --- nivel 2 · sin KV, la variable de entorno --- */
  CAT.limpiarCache();
  process.env.SGADD_CATALOGO = JSON.stringify(DE_ENV);
  r = await CAT.cargar({});
  check('sin KV configurado, cae a SGADD_CATALOGO', r.origen === 'env', r.origen);
  check('y trae su club', !!r.catalogo.otroclub);

  /* --- nivel 3 · el respaldo del código --- */
  CAT.limpiarCache();
  delete process.env.SGADD_CATALOGO;
  r = await CAT.cargar({});
  check('sin nada, cae al literal del código', r.origen === 'codigo', r.origen);
  check('que trae los tres clubes de siempre',
    !!r.catalogo.deportivo && !!r.catalogo.reconquista && !!r.catalogo.jujuy);

  /* --- EL CASO QUE IMPORTA: Upstash caído --- */
  CAT.limpiarCache();
  r = await CAT.cargar(kvCaido);
  check('si Upstash NO responde, el servidor NO se cae', r.origen === 'codigo', r.origen);
  check('y lo dice en un aviso, en vez de callarlo', !!r.aviso, r.aviso);
  check('los clubes que ya estaban siguen ahí', !!r.catalogo.deportivo);

  /* --- un blob corrupto se IGNORA, no envenena --- */
  const corruptos = [
    ['no es un objeto', 'texto suelto'],
    ['un array', [1, 2]],
    ['un club sin nombre', { x: { categorias: { a: { label: 'A' } } } }],
    ['un club sin categorías', { x: { nombre: 'X' } }],
    ['una categoría sin label', { x: { nombre: 'X', categorias: { a: {} } } }],
    ['un sheetId que no es texto', { x: { nombre: 'X', categorias: { a: { label: 'A', sheetId: 5 } } } }],
  ];
  for (const [nombre, malo] of corruptos) {
    CAT.limpiarCache();
    const rr = await CAT.cargar(kvFalso(malo));
    check('KV con ' + nombre + ' → se ignora y baja la cascada',
      rr.origen === 'codigo' && !!rr.aviso, rr.origen);
  }
  /* Pero un `sheetId` VACÍO sí es válido: es la categoría que todavía no
     tiene libro, y aparece deshabilitada en el selector (punto 6). */
  CAT.limpiarCache();
  const sinLibro = { x: { nombre: 'X', categorias: { a: { label: 'A', sheetId: '' } } } };
  check('pero una categoría sin libro es válida', CAT.validar(sinLibro) === null);

  /* La clave que todavía no existe NO es un error: es el estado normal
     antes de la primera alta, y no tiene que ensuciar con un aviso. */
  CAT.limpiarCache();
  r = await CAT.cargar(kvFalso(null));
  check('una clave que aún no existe no genera aviso',
    r.origen === 'codigo' && !r.aviso, JSON.stringify(r.aviso));

  /* --- el caché evita una ida a Upstash por request --- */
  CAT.limpiarCache();
  let llamadas = 0;
  const contando = { env: kvFalso(DE_KV).env,
    fetch: () => { llamadas++; return kvFalso(DE_KV).fetch(); } };
  await CAT.cargar(contando);
  await CAT.cargar(contando);
  await CAT.cargar(contando);
  check('el catálogo se lee UNA vez y se cachea', llamadas === 1, llamadas);

  /* --- resolución: funciones puras sobre el catálogo --- */
  CAT.limpiarCache();
  const base = (await CAT.cargar({})).catalogo;
  const dep = CAT.resolver(base, 'deportivo', 'deportivo-primera');
  check('resolver() encuentra la categoría', !!dep && dep.slug === 'deportivo-primera');
  check('sin categoría abre la primera del club',
    CAT.resolver(base, 'deportivo').slug === 'deportivo-primera');
  check('un club que no existe devuelve null', CAT.resolver(base, 'nada') === null);
  check('y una categoría que no existe también',
    CAT.resolver(base, 'deportivo', 'no-existe') === null);

  /* EL sheetId SIGUE SIN SALIR, venga de donde venga el catálogo. Es lo
     que no puede aflojarse al mover el catálogo de lugar. */
  const pub = CAT.publico({ x: { nombre: 'X', liga: 'l',
    categorias: { a: { label: 'A', sheetId: '1SECRETO_DE_GOOGLE_AAAA' } } } });
  check('el catálogo público no trae el sheetId',
    JSON.stringify(pub).indexOf('1SECRETO') === -1, JSON.stringify(pub));
  check('pero sí dice si la categoría tiene libro', pub[0].categorias[0].activo === true);
  check('y `activo` es false cuando no lo tiene',
    CAT.publico({ x: { nombre: 'X', categorias: { a: { label: 'A' } } } })[0]
      .categorias[0].activo === false);

  /* --- el cliente de KV --- */
  /* TRES juegos de nombres según por dónde se cree la base. Ya pasó que
     llegaran los del tercero y el cliente no los reconociera. */
  check('acepta los tres juegos de nombres de credenciales',
    KV.configurado({ UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' }) &&
    KV.configurado({ UPSTASH_KV_REST_API_URL: 'u', UPSTASH_KV_REST_API_TOKEN: 't' }) &&
    KV.configurado({ KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't' }));
  check('y sin ninguno se declara sin configurar', KV.configurado({}) === false);
  /* La LECTURA nunca lanza: es lo que permite que el catálogo se caiga al
     respaldo en vez de tumbar el request. */
  const fallo = await KV.leer('x', kvCaido);
  check('leer() devuelve el error en vez de lanzarlo',
    fallo.valor === null && !!fallo.error, JSON.stringify(fallo));
  /* La ESCRITURA sí lanza: la usa el CLI, y un fallo silencioso ahí haría
     creer que un alta se guardó cuando no. */
  let tiro = false;
  try { await KV.escribir('x', { a: 1 }, kvCaido); } catch (e) { tiro = true; }
  check('escribir() SÍ lanza, para que el CLI no mienta', tiro === true);

  CAT.limpiarCache();
  await CAT.cargar({});
}

titulo('LA CLI DEL CATÁLOGO');

{
  const cli = fs.readFileSync('./server/bin/catalogo.js', 'utf8');

  ['listar', 'alta', 'baja'].forEach(c => {
    check("el comando `" + c + "` existe", new RegExp("cmd === '" + c + "'").test(cli));
  });
  /* `sembrar` promueve el catálogo del código a KV sin cambios: es el
     primer paso, y sin él la primera alta tendría que reescribir todo. */
  check('y `sembrar`, para promover el catálogo del código a KV',
    /cmd === 'sembrar'/.test(cli));

  /* LEE LA CASCADA Y ESCRIBE SOLO EN KV: si además tocara el código haría
     falta un commit, que es justo lo que esto viene a evitar. */
  check('lee el catálogo vigente antes de modificarlo',
    /await catalogo\.cargar\(\{ forzar: true \}\)/.test(cli));
  check('y escribe solo en KV', /kv\.escribir\(catalogo\.CLAVE_KV/.test(cli));
  /* Se valida ANTES de escribir: un catálogo roto en KV se ignora al leer,
     pero dejarlo escrito confunde al que después mire por qué su alta "no
     tomó". */
  /* El margen es más largo que antes porque entre la validación y la
     escritura ahora está también `revisarLibros`. Lo que se fija es el
     ORDEN: primero se valida, después se escribe. */
  check('valida antes de guardar, no después',
    cli.indexOf('catalogo.validar(cat)') < cli.indexOf('kv.escribir(catalogo.CLAVE_KV'));

  /* Un `sheetId` no se imprime entero ni en la terminal del admin: la
     salida de un comando termina pegada en un chat más seguido de lo que
     uno quiere. */
  check('los sheetId salen enmascarados en `listar`',
    /function enmascarar/.test(cli) && /enmascarar\(k\.sheetId\)/.test(cli));
  /* `exportar` sí los muestra —para eso está— pero lo avisa. */
  check('y `exportar` avisa que trae secretos en claro',
    /trae los sheetId en claro/.test(cli));

  /* Sin Upstash configurado, `alta` NO puede fingir que guardó. */
  check('sin KV, los comandos de escritura se niegan',
    /function exigirKV/.test(cli) && (cli.match(/exigirKV\(\);/g) || []).length >= 3);
  check('y dicen exactamente qué variables faltan',
    /UPSTASH_REDIS_REST_URL/.test(cli) && /KV_REST_API_URL/.test(cli));

  /* EL GUARD QUE EVITA ROMPER PRODUCCIÓN, y por qué está donde está.

     El catálogo del CÓDIGO resuelve cada `sheetId` desde una variable de
     entorno que vive en Vercel, no en la máquina del administrador. Un
     comando corrido desde ahí escribe en KV un catálogo con los sheetId
     VACÍOS — y como KV le gana al código, los clubes que hoy funcionan
     pasan a 502 sin que nadie toque su planilla.

     Va en `guardar()` y NO en un comando: los tres escriben el catálogo
     entero. La primera versión solo cuidaba `sembrar`, y `alta` volvió a
     armar la bomba a los dos minutos. */
  check('el guard vive en guardar(), por donde pasan los tres comandos',
    /function revisarLibros/.test(cli) &&
    /revisarLibros\(cat, opciones && opciones\.forzar\)[\s\S]{0,120}kv\.escribir/.test(cli));
  check('y los tres comandos pasan por ahí',
    (cli.match(/await guardar\(cat, \{ forzar/g) || []).length === 4,
    (cli.match(/await guardar\(cat, \{ forzar/g) || []).length);
  /* La señal que distingue un catálogo legítimamente incompleto de uno
     escrito desde el lugar equivocado: si la máquina no tiene NINGUNA
     SHEET_*, los vacíos no son una decisión. */
  check('se distingue por si la máquina tiene alguna SHEET_*',
    /indexOf\('SHEET_'\) === 0/.test(cli));
  check('y se puede forzar a propósito con --sin-libros',
    /sin-libros/.test(cli));
  /* Nunca escribe y después avisa: aborta ANTES del kv.escribir. */
  check('aborta ANTES de escribir, no después',
    cli.indexOf('revisarLibros(cat') < cli.indexOf('kv.escribir(catalogo.CLAVE_KV'));

  /* Dar de baja un club NO invalida los links ya emitidos: no hay
     revocación individual. Conviene que el CLI lo diga. */
  check('la baja avisa que los links emitidos siguen firmados',
    /siguen firmados/.test(cli));

  /* Y el generador de links lee la cascada: sin esto, dar de alta un club
     por CLI y después emitirle un link fallaba mirando una copia vieja. */
  const gen = fs.readFileSync('./server/bin/generar-link.js', 'utf8');
  check('generar-link.js valida el club contra la cascada, no contra el código',
    /await catalogo\.cargar\(\)/.test(gen) && !/require\('\.\.\/lib\/config\.js'\)/.test(gen));
}

  console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
    '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error(NL + 'La suite explotó: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
