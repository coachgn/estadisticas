/* =====================================================================
   SGADD · El padrón de CLIENTES y el login multi-rol

       node test-clientes.js

   Lo que estos tests protegen:

     · que el cupo por plan lo haga cumplir el SERVIDOR, no la pantalla;
     · que un cliente entre con su club y NO pueda administrar nada;
     · que la tabla de cupos sea UNA SOLA para el front y el back;
     · y que un KV ilegible no borre accesos, que es el bug que ya se comió
       las claves de los tres administradores.

   El circuito se ejerce sobre los HANDLERS de verdad con un KV de mentira:
   probar las funciones puras por separado deja afuera justamente el
   cableado, que es donde estuvieron los últimos tres defectos.
   ===================================================================== */
'use strict';

const fs = require('fs');
const NL = '\n';
require('./server/lib/env.js').cargar();

let ok = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); }
};
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));

/* ---------------------------------------------------------------- KV falso */
const kv = require('./server/lib/kv.js');
const store = {};
kv.configurado = () => true;
kv.leer = async (k) => ({ valor: store[k] !== undefined ? JSON.parse(store[k]) : null, error: null });
kv.escribir = async (k, v) => { store[k] = JSON.stringify(v); };

const auth = require('./server/lib/auth.js');
const H = require('./server/api/handlers.js');
const catalogo = require('./server/lib/catalogo.js');
const C = require('./server/lib/clientes.js');
const A = require('./server/lib/admins.js');
const AUTH = require('./js/sgadd-auth.js');

const CAT = {
  deportivo: {
    nombre: 'Deportivo La Plata', liga: 'la-plata',
    equipoPropio: 'DEPORTIVO LA PLATA', estado: 'activo', plan: 'BRONCE',
    categorias: { 'deportivo-primera': { label: 'Primera 2026', sheetId: 'X' } },
  },
  jujuy: {
    nombre: 'Jujuy Básquet', liga: 'liga-argentina',
    equipoPropio: 'JUJUY', estado: 'activo', plan: 'ORO',
    categorias: { 'jujuy-norte': { label: 'Conferencia Norte', sheetId: 'Y' } },
  },
};
function sembrarCatalogo() {
  store[catalogo.CLAVE_KV] = JSON.stringify(CAT);
  catalogo.limpiarCache();
}

const tokAdmin = auth.firmarToken({ email: 'freytesgn@gmail.com' }, { expiraEn: '1h' });
const comoAdmin = (body, query) => ({ body: body || {}, query: query || {},
  headers: { authorization: 'Bearer ' + tokAdmin } });

(async () => {

  /* =====================================================================
     LA TABLA DE CUPOS
     ===================================================================== */
  titulo('EL CUPO POR PLAN · una sola tabla para el front y el back');

  check('el motor compartido declara los cupos',
    AUTH.CUPO_MAILS.BRONCE === 2 && AUTH.CUPO_MAILS.PLATA === 3 && AUTH.CUPO_MAILS.ORO === 4,
    JSON.stringify(AUTH.CUPO_MAILS));

  /* VIVE EN EL MOTOR COMPARTIDO y no en la landing ni en el servidor: la
     landing se lo promete al cliente y el servidor lo hace cumplir. Con
     dos tablas, la que se relaja es siempre la del servidor —que es la que
     decide— y el cliente termina con más accesos de los que paga, o con
     menos de los que le prometieron. */
  global.SGADD_AUTH = AUTH;
  const LAN = require('./js/sgadd-landing.js');
  check('la landing LEE esa tabla, no la repite',
    LAN.PLANES_MAILS.map(p => p.mails).join(',') === '2,3,4',
    LAN.PLANES_MAILS.map(p => p.nombre + '=' + p.mails).join(' '));
  const srcLan = fs.readFileSync('./js/sgadd-landing.js', 'utf8');
  check('y no tiene los números escritos a mano',
    /SGADD_AUTH\.CUPO_MAILS/.test(srcLan));
  const srcCli = fs.readFileSync('./server/lib/clientes.js', 'utf8');
  check('el servidor también la lee del motor compartido',
    /AUTH\.cupoDeMails\(/.test(srcCli) && !/BRONCE: 2/.test(srcCli));

  /* El alias tiene que seguir funcionando: un catálogo viejo puede decir
     `PRO` y sin pasarlo por el alias caería a BRONCE, bajándole el cupo al
     cliente sin que nadie lo haya tocado. */
  check('un plan con nombre viejo mantiene su cupo',
    AUTH.cupoDeMails('PRO') === 3 && AUTH.cupoDeMails('MASTER') === 4,
    AUTH.cupoDeMails('PRO') + '/' + AUTH.cupoDeMails('MASTER'));
  check('y uno desconocido cae al más chico, nunca al más grande',
    AUTH.cupoDeMails('LO QUE SEA') === 2);

  /* =====================================================================
     EL CIRCUITO COMPLETO
     ===================================================================== */
  titulo('DE ALTA A LOGIN · el circuito, sobre los handlers de verdad');

  sembrarCatalogo();
  delete store[C.CLAVE_KV];

  let r = await H.manejarClientes(comoAdmin(null, { club: 'deportivo' }));
  check('el admin ve el cupo del club', r.status === 200
    && r.body.clubes[0].cupo.tope === 2 && r.body.clubes[0].cupo.usados === 0,
    JSON.stringify(r.body.clubes && r.body.clubes[0] && r.body.clubes[0].cupo));

  const a1 = await H.manejarClientesEscribir(comoAdmin({ accion: 'alta', email: 'DT@Club.com', club: 'deportivo' }));
  check('da de alta un mail', a1.status === 200, a1.status + ' ' + (a1.body.mensaje || ''));
  /* EL MAIL SE NORMALIZA: sin eso, `DT@Club.com` y `dt@club.com` serían
     dos accesos distintos y gastarían dos cupos. */
  check('y lo guarda normalizado', a1.body.mails[0].email === 'dt@club.com',
    a1.body.mails[0].email);
  /* EL CÓDIGO SE DEVUELVE UNA VEZ. Si se pudiera volver a leer, KV pasaría
     a ser suficiente para entrar como cualquier cliente. */
  check('devuelve el código de invitación', typeof a1.body.codigo === 'string'
    && a1.body.codigo.length > 30, (a1.body.codigo || '').length);
  const guardado = JSON.parse(store[C.CLAVE_KV]);
  check('pero en KV solo queda su huella',
    !!guardado['dt@club.com'].invitacion.hash
    && JSON.stringify(guardado).indexOf(a1.body.codigo) === -1);

  const a2 = await H.manejarClientesEscribir(comoAdmin({ accion: 'alta', email: 'ayudante@club.com', club: 'deportivo' }));
  check('entra el segundo, y el cupo lo dice', a2.status === 200
    && a2.body.cupoActual.usados === 2 && a2.body.cupoActual.libres === 0,
    JSON.stringify(a2.body.cupoActual));

  /* EL CUPO LO HACE CUMPLIR EL SERVIDOR. La pantalla lo muestra para que
     el admin no llegue al tope de sorpresa, pero una validación que solo
     vive en el navegador no es una validación. */
  const a3 = await H.manejarClientesEscribir(comoAdmin({ accion: 'alta', email: 'tercero@club.com', club: 'deportivo' }));
  check('el tercero NO entra en BRONCE', a3.status === 400, a3.status);
  check('y el mensaje dice qué hacer',
    /plan BRONCE admite 2/.test(a3.body.mensaje) && /subí el plan/i.test(a3.body.mensaje),
    a3.body.mensaje);

  /* EL PLAN SALE DEL CATÁLOGO, no del cuerpo del pedido: si lo mandara el
     navegador, el cupo lo decidiría quien lo quiere saltear. */
  const trampa = await H.manejarClientesEscribir(comoAdmin({
    accion: 'alta', email: 'tercero@club.com', club: 'deportivo', plan: 'ORO' }));
  check('y mandar un plan en el pedido NO saltea el cupo', trampa.status === 400,
    trampa.status + ' ' + (trampa.body.mensaje || ''));

  CAT.deportivo.plan = 'PLATA';
  sembrarCatalogo();
  const a4 = await H.manejarClientesEscribir(comoAdmin({ accion: 'alta', email: 'tercero@club.com', club: 'deportivo' }));
  check('subiendo el plan del club, sí entra', a4.status === 200
    && a4.body.cupoActual.tope === 3, a4.status + ' ' + JSON.stringify(a4.body.cupoActual));

  /* UN MAIL ESTÁ EN UN SOLO CLUB: con el mismo en dos, el login tendría
     que adivinar cuál abrir. */
  const dup = await H.manejarClientesEscribir(comoAdmin({ accion: 'alta', email: 'dt@club.com', club: 'jujuy' }));
  check('un mail no se puede dar de alta en dos clubes', dup.status === 400,
    dup.status + ' ' + (dup.body.mensaje || ''));

  /* Un admin ya entra por su propia puerta: darlo de alta como cliente le
     ACOTARÍA la vista y gastaría un cupo del club. */
  const adm = await H.manejarClientesEscribir(comoAdmin({ accion: 'alta', email: 'freytesgn@gmail.com', club: 'jujuy' }));
  check('un administrador no se da de alta como cliente', adm.status === 400,
    adm.body.mensaje);

  /* --- el cliente entra --- */
  titulo('EL LOGIN DEL CLIENTE');

  const s1 = await H.manejarLogin({ body: { email: 'dt@club.com', clave: 'cualquier cosa larga' } });
  /* SE DISTINGUE «todavía no fijó su clave» del resto, y no filtra el
     padrón: para llegar acá hay que traer el código, que es un secreto de
     256 bits. Sin esta rama el cliente concluye que le dieron mal el
     acceso. */
  check('sin haber fijado clave, se lo dice', s1.status === 409
    && s1.body.codigo === 'FALTA_CLAVE', s1.status + ' ' + s1.body.codigo);

  const c1 = await H.manejarClave({ body: { email: 'dt@club.com', codigo: a1.body.codigo, claveNueva: 'una frase larga mia' } });
  check('canjea el código y elige su clave', c1.status === 200, c1.body.mensaje);

  /* LA INVITACIÓN SE CONSUME: dejarla viva sería una segunda llave
     permanente para una puerta que ya tiene dueño. */
  const c2 = await H.manejarClave({ body: { email: 'dt@club.com', codigo: a1.body.codigo, claveNueva: 'otra clave distinta' } });
  check('y el código muere al usarse', c2.status === 400, c2.status);

  const s2 = await H.manejarLogin({ body: { email: 'dt@club.com', clave: 'una frase larga mia' } });
  check('ahora entra', s2.status === 200 && s2.body.ok, s2.status + ' ' + (s2.body.mensaje || ''));
  check('y el rol es CLIENTE, no ADMIN', s2.body.rol === 'CLIENTE', s2.body.rol);
  /* EL CLUB VIAJA EN LA RESPUESTA para que la pantalla sepa a dónde
     mandarlo sin tener que abrir el token. */
  check('la respuesta trae su club', s2.body.club === 'deportivo', s2.body.club);

  const datos = auth.verificarToken(s2.body.token);
  check('el token también', datos.club === 'deportivo', datos.club);
  /* EL PLAN Y EL EQUIPO SALEN DEL CATÁLOGO, no del padrón: guardarlos en
     el registro del mail los congelaría el día del alta, y un upgrade no
     le llegaría a quien ya estaba dado de alta. */
  check('con el equipo propio del club',
    datos.sesion.equipoAsignado === 'DEPORTIVO LA PLATA', datos.sesion.equipoAsignado);
  check('y el plan VIGENTE del club, no el del día del alta',
    datos.sesion.plan === 'PLATA', datos.sesion.plan);

  const s3 = await H.manejarLogin({ body: { email: 'dt@club.com', clave: 'una clave equivocada' } });
  check('con la clave equivocada, no', s3.status === 401 && s3.body.codigo === 'CREDENCIALES',
    s3.status + ' ' + s3.body.codigo);
  /* MISMO MENSAJE QUE UN MAIL QUE NO EXISTE: distinguirlos diría qué mails
     están dados de alta. */
  const s4 = await H.manejarLogin({ body: { email: 'nadie@ningunlado.com', clave: 'una clave cualquiera' } });
  check('y un mail que no existe contesta lo MISMO',
    s4.status === s3.status && s4.body.mensaje === s3.body.mensaje,
    s4.status + ' ' + s4.body.mensaje);

  /* El circuito que rompió a los admins: entrar, salir, volver a entrar. */
  const s5 = await H.manejarLogin({ body: { email: 'dt@club.com', clave: 'una frase larga mia' } });
  check('vuelve a entrar después de un intento fallido', s5.status === 200,
    s5.status + ' ' + (s5.body.mensaje || ''));
  check('y su hash sigue en el padrón',
    !!JSON.parse(store[C.CLAVE_KV])['dt@club.com'].clave);

  /* =====================================================================
     LOS PERMISOS DEL CLIENTE
     ===================================================================== */
  titulo('LO QUE UN CLIENTE NO PUEDE');

  const comoCliente = (body, query) => ({ body: body || {}, query: query || {},
    headers: { authorization: 'Bearer ' + s2.body.token } });

  const p1 = await H.manejarClientes(comoCliente(null, {}));
  check('no puede leer los accesos de nadie', p1.status === 403
    && p1.body.codigo === 'SOLO_ADMIN', p1.status + ' ' + p1.body.codigo);
  const p2 = await H.manejarClientesEscribir(comoCliente({ accion: 'alta', email: 'x@y.com', club: 'deportivo' }));
  check('ni dar de alta a otro', p2.status === 403, p2.status);
  const p3 = await H.manejarCatalogoEscribir(comoCliente({ accion: 'alta_club', id: 'trucho' }));
  check('ni tocar el catálogo', p3.status === 403, p3.status);

  /* EL GATE DE INTERFAZ. No es seguridad —el panel es estático y cualquiera
     con la consola se pone `rol: ADMIN`— pero es lo que hace que el cliente
     no vea módulos que no le sirven. Las cuatro internas quedan afuera. */
  const ses = { email: 'dt@club.com', plan: 'ORO', equipoAsignado: 'DEPORTIVO LA PLATA' };
  ['configuracion', 'simulador', 'diagnostico', 'comparativa'].forEach((s) => {
    const v = AUTH.puedoAcceder(s, ses);
    check('  ' + s + ' es solo para admin',
      !v.ok && v.motivo === 'SOLO_ADMIN', JSON.stringify(v));
  });
  /* Y las que SÍ le tocan siguen abiertas: el gate acota, no cierra. */
  ['principal', 'equipos', 'jugadores', 'clasificacion', 'glosario'].forEach((s) => {
    check('  ' + s + ' le queda abierta', AUTH.puedoAcceder(s, ses).ok);
  });
  check('y scouting con plan PLATA o mejor',
    AUTH.puedoAcceder('scouting', ses).ok
    && !AUTH.puedoAcceder('scouting', Object.assign({}, ses, { plan: 'BRONCE' })).ok);

  /* =====================================================================
     LA BAJA Y LA REINVITACIÓN
     ===================================================================== */
  titulo('BAJA Y REINVITACIÓN');

  const rein = await H.manejarClientesEscribir(comoAdmin({ accion: 'reinvitar', email: 'dt@club.com', club: 'deportivo' }));
  check('reinvitar da un código nuevo', rein.status === 200 && !!rein.body.codigo);
  /* NO LE BORRA LA CLAVE: mientras no canjee el código nuevo, la vieja
     sigue sirviendo. Invalidarla de entrada dejaría afuera a alguien que
     está entrando bien, por un click de más del administrador. */
  const sigue = await H.manejarLogin({ body: { email: 'dt@club.com', clave: 'una frase larga mia' } });
  check('y NO le rompe la clave que ya tenía', sigue.status === 200, sigue.status);

  const baja = await H.manejarClientesEscribir(comoAdmin({ accion: 'baja', email: 'dt@club.com', club: 'deportivo' }));
  check('la baja lo saca de la lista', baja.status === 200
    && !baja.body.mails.some(m => m.email === 'dt@club.com'),
    baja.body.mails.map(m => m.email).join(','));
  check('y le libera el cupo', baja.body.cupoActual.usados === 2, JSON.stringify(baja.body.cupoActual));
  const muerto = await H.manejarLogin({ body: { email: 'dt@club.com', clave: 'una frase larga mia' } });
  check('ya no entra', muerto.status === 401, muerto.status);

  /* =====================================================================
     UN KV ILEGIBLE
     ===================================================================== */
  titulo('UN KV ILEGIBLE NO BORRA ACCESOS');

  /* El mismo bug que se comió las claves de los tres administradores: la
     lectura falla, `cargar` devuelve {} y la rama de fallo ESCRIBE ese
     vacío encima. No se repite acá. */
  const leerOk = kv.leer, escribirOk = kv.escribir;
  let escrito = 'NADA';
  kv.leer = async () => ({ valor: null, error: 'KV' });
  kv.escribir = async (k, v) => { escrito = v; };

  const caido = await H.manejarLogin({ body: { email: 'ayudante@club.com', clave: 'la que sea larga' } });
  check('con KV caído el login NO dice «clave incorrecta»',
    caido.status === 503, caido.status + ' ' + (caido.body.mensaje || ''));
  check('y no escribe nada', escrito === 'NADA', JSON.stringify(escrito));

  const leerCaido = await H.manejarClientes(comoAdmin(null, {}));
  check('leer los accesos con KV caído avisa, no miente',
    leerCaido.status === 503, leerCaido.status);
  const escrCaido = await H.manejarClientesEscribir(comoAdmin({ accion: 'alta', email: 'z@z.com', club: 'deportivo' }));
  check('y el alta tampoco inventa', escrCaido.status === 503, escrCaido.status);
  check('sin escribir', escrito === 'NADA', JSON.stringify(escrito));

  kv.leer = leerOk; kv.escribir = escribirOk;

  let lanzo = false;
  kv.leer = async () => ({ valor: null, error: 'KV' });
  try { await C.cargar(); } catch (e) { lanzo = (e.codigo === 'KV'); }
  check('cargar LANZA cuando la lectura falla', lanzo);
  kv.leer = leerOk;

  /* =====================================================================
     EL CABLEADO
     ===================================================================== */
  titulo('EL CABLEADO');

  const app = fs.readFileSync('./server/app.js', 'utf8');
  check('las dos rutas están declaradas',
    /app\.get\('\/api\/v1\/clientes'/.test(app) && /app\.post\('\/api\/v1\/clientes'/.test(app));

  const hub = fs.readFileSync('./js/sgadd-hub.js', 'utf8');
  check('el Panel Master tiene el bloque de accesos', /function bloqueAccesos/.test(hub));
  check('y se cuelga de la tarjeta de cada club', /\$\{bloqueAccesos\(c\)\}/.test(hub));
  /* Tipear NO repinta: le sacaría el foco al input. Misma regla que el
     buscador del buzón y los campos de scouting. */
  check('tipear el mail no repinta la lista',
    /function campoAcceso[\s\S]{0,300}accesosAbierto\.nuevo = String/.test(hub)
    && !/function campoAcceso[\s\S]{0,300}repintarLista\(\)/.test(hub));
  /* TODO HELPER QUE EL MODULO USA TIENE QUE ESTAR DECLARADO.

     `escJs` se uso en los handlers inline de la lista de mails y no se
     habia declarado: cada repintado tiraba un ReferenceError que el
     `.catch` del fetch se tragaba, asi que el alta FUNCIONABA y la
     pantalla mostraba «escJs is not defined». Medido en produccion.

     El chequeo es generico a proposito: cualquier helper que se use sin
     declarar cae acá, no solo este. */
  ['esc', 'escJs'].forEach((h) => {
    const usa = new RegExp('[^A-Za-z0-9_.]' + h + '\\(').test(hub);
    const declara = new RegExp('const ' + h + ' =').test(hub);
    check('  el hub declara `' + h + '`, que usa', !usa || declara);
  });

  check('el código se avisa que se muestra una sola vez',
    /Se muestra UNA vez/.test(hub));

  const data = fs.readFileSync('./js/sgadd-data.js', 'utf8');
  check('el adaptador tiene las dos llamadas',
    /function clientes\(/.test(data) && /function guardarClientes\(/.test(data));

  const lg = fs.readFileSync('./js/sgadd-login.js', 'utf8');
  /* El que todavía no eligió su clave va derecho a elegirla: sin el salto,
     lee «todavía no elegiste tu clave», mira el formulario que le pide una
     clave que no tiene, y concluye que le dieron mal el acceso. */
  check('FALTA_CLAVE lleva al formulario de fijar clave',
    /codigo === 'FALTA_CLAVE'[\s\S]{0,200}estado\.modo = 'fijar'/.test(lg));
  check('y el club de la respuesta manda sobre el del token',
    /let club = r\.club \|\| null;/.test(lg));

  /* EL LOADER: solo el logo. Dos cosas moviéndose a distinta velocidad
     compiten por la mirada y ninguna dice más que la otra. */
  const idx = fs.readFileSync('./index.html', 'utf8');
  const loader = idx.slice(idx.indexOf('<div id="loader"'), idx.indexOf('APP SHELL'));
  check('la pantalla de carga muestra el logo', /motorlogo-128\.png/.test(loader));
  check('y YA NO tiene el disco girando',
    !/animate-spin-slow/.test(loader), loader.replace(/\s+/g, ' ').slice(0, 200));
  check('el logo conserva su pulso', /class="cargando-logo"/.test(loader));
  check('que se apaga con prefers-reduced-motion',
    /prefers-reduced-motion[\s\S]{0,200}\.cargando-logo \{ animation: none/.test(idx));

  console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
    '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(NL + 'La suite explotó: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
