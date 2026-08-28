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
  const nombres = config.HOJAS;
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
  check('en UNA sola llamada, con batchGet',
    llamadasAGoogle.filter(u => /batchGet/.test(u)).length === 1);
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

  console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
    '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error(NL + 'La suite explotó: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
