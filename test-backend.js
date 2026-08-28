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
  check('PROMEDIOS E solo trae su equipo',
    pe.filter(e => /A\. MAYO|UNIVERSITARIO/.test(e)).length === 0, JSON.stringify(pe));
  check('y el suyo sí está', pe.some(e => /DEPORTIVO LA PLATA/.test(e)));

  /* LA FILA `EQUIPO TIPO` SE CONSERVA: es la MEDIANA de la liga y de ella
     salen todos los percentiles del panel. Sin ella el cliente recibe sus
     números sin nada contra qué compararlos, que es el valor del
     producto. Y no es el dato de otro club: es el agregado. */
  check('pero la fila EQUIPO TIPO sobrevive al recorte',
    pe.some(e => /EQUIPO TIPO/.test(e)), JSON.stringify(pe));

  const pj = rCli.body.hojas['PROMEDIOS J'].slice(1);
  check('PROMEDIOS J solo trae su plantel',
    pj.every(f => /DEPORTIVO LA PLATA/.test(f[1]) || f[1] === ''), JSON.stringify(pj.map(f => f[1])));
  check('y conserva el JUGADOR TIPO, que también es la mediana',
    pj.some(f => /JUGADOR TIPO/.test(f[0])));

  const bdj = rCli.body.hojas['Base Datos J'].slice(1);
  check('el box score de partidos ajenos no viaja',
    bdj.every(f => /DEPORTIVO LA PLATA/.test(f[2])), JSON.stringify(bdj.map(f => f[2])));

  /* La tabla de posiciones va COMPLETA a propósito: comparar contra la
     liga es el valor del panel, y no expone nada que la federación no
     publique ya. */
  check('Base Datos E va completa, para que exista la tabla de posiciones',
    rCli.body.hojas['Base Datos E'].length === LIBRO['Base Datos E'].length);
  check('y el admin recibe todo, sin recortes',
    rAdm.body.hojas['PROMEDIOS E'].length === LIBRO['PROMEDIOS E'].length);

  /* El panel tiene que SABER que está viendo un recorte: sin eso
     calcularía percentiles sobre una liga fantasma. */
  check('la respuesta declara qué hojas se recortaron',
    rCli.body.alcance.hojasRecortadas.indexOf('PROMEDIOS E') !== -1);
  check('y cuáles vienen completas',
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
  check('el servidor IMPORTA js/sgadd-auth.js, no lo reimplementa',
    /require\('\.\.\/\.\.\/js\/sgadd-auth\.js'\)/.test(srcAuth) &&
    /require\('\.\.\/\.\.\/js\/sgadd-auth\.js'\)/.test(srcReglas));
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
  check('el recorte del servidor llega intacto al índice',
    !nombres.some(n => /A\. MAYO|UNIVERSITARIO/.test(n)), JSON.stringify(nombres));
  check('y la fila TIPO sigue ahí, que es la mediana de la liga',
    nombres.some(n => /EQUIPO TIPO/.test(n)));

  const peAdm = DATA.matrizAFilas(rAdm.body.hojas['PROMEDIOS E']);
  check('el admin recibe la liga entera', peAdm.filas.length > pe.filas.length,
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

  console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
    '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error(NL + 'La suite explotó: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
