/* =====================================================================
   Roles, planes y permisos · sgadd-auth.js

   LO PRIMERO, porque cambia cómo hay que leer todo lo que sigue: esto NO
   es una suite de seguridad. El panel es estático y lee por GViz anónimo,
   así que estos tests verifican que la INTERFAZ muestre lo que
   corresponde — no que nadie pueda llegar a los datos por otro lado. Ver
   la cabecera de `sgadd-auth.js`.

   Cubre las cinco cosas que pueden salir mal en silencio:

     1. que un mail que NO es admin entre como admin,
     2. que un plan mal escrito regale el módulo que se cobra aparte,
     3. que un cliente arme un cruce "rival vs rival",
     4. que una sección nueva quede sin gate porque nadie la agregó a la
        matriz,
     5. que el gate se aplique en el picker pero NO donde se resuelve la
        entidad, que es por donde entra un hash pegado a mano.
   ===================================================================== */
const fs = require('fs');
const A = require('./js/sgadd-auth.js');
const SGADD = require('./js/sgadd-core.js');

let ok = 0, fail = 0;
const NL = String.fromCharCode(10);
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));

/* Las sesiones se pasan EXPLÍCITAS a cada guard en vez de setear el estado
   del módulo: así un test no puede ensuciar al siguiente, que es el tipo
   de fuga que hace que una suite de permisos pase por el motivo
   equivocado. */
const ADMIN = { email: 'freytesgn@gmail.com' };
const BASICO = { email: 'dt@deportivo.com', equipoAsignado: 'DEPORTIVO LA PLATA', plan: 'BASICO' };
const PRO = { email: 'dt@deportivo.com', equipoAsignado: 'DEPORTIVO LA PLATA', plan: 'PRO' };

titulo('LOS TRES ADMINISTRADORES');

['freytesgn@gmail.com', 'francasa09@gmail.com', 'motorstats.ar@gmail.com'].forEach(m => {
  check(m + ' es admin', A.esAdmin(m) === true);
});
/* Mayúsculas y espacios se normalizan: un mail tipeado a mano en la URL
   viene como venga. */
check('el mail se normaliza en mayúsculas y espacios',
  A.esAdmin('  FreytesGN@Gmail.COM  ') === true);

/* NO se normalizan los puntos ni los alias con `+`, aunque en Gmail sean
   la misma casilla: esto es una lista de PERMITIDOS y toda normalización
   de más ensancha quién entra. Fallar cerrado es lo correcto acá. */
check('un punto de más NO entra como admin',
  A.esAdmin('f.reytesgn@gmail.com') === false);
check('un alias con + tampoco',
  A.esAdmin('freytesgn+test@gmail.com') === false);
check('ni un dominio parecido',
  A.esAdmin('freytesgn@gmail.com.ar') === false);
check('ni un mail cualquiera', A.esAdmin('cualquiera@gmail.com') === false);
[null, undefined, '', 0, {}, []].forEach(v => {
  check('esAdmin(' + JSON.stringify(v) + ') es false', A.esAdmin(v) === false);
});

/* La lista es LITERAL y no un patrón por dominio: un patrón le daría
   admin a cualquier mail nuevo de ese dominio sin que nadie lo decida. */
const src = fs.readFileSync('./js/sgadd-auth.js', 'utf8');
check('la lista de admins son mails literales, no un patrón de dominio',
  !/ADMINS[\s\S]{0,200}(indexOf\('@'\)|endsWith\(|\/@)/.test(src.slice(src.indexOf('const ADMINS'))));

titulo('ADMIN · acceso irrestricto');

check('el rol de un admin es ADMIN', A.rol(ADMIN) === A.ROLES.ADMIN);
SGADD.SECCIONES.forEach(sec => {
  check('admin entra a ' + sec, A.puedoAcceder(sec, ADMIN).ok === true);
});
check('admin ve cualquier equipo', A.puedeVerEquipo('ATENAS A', ADMIN) === true);
check('y también el suyo', A.puedeVerEquipo('DEPORTIVO LA PLATA', ADMIN) === true);
check('admin puede scoutear rival vs rival',
  A.puedeScoutearCruce('ATENAS A', 'PLATENSE A', ADMIN) === true);
check('y su cruce no se fuerza',
  A.forzarCruce('ATENAS A', 'PLATENSE A', 'local', ADMIN).forzado === false);
const listaAdmin = [{ clave: 'ATENAS A' }, { clave: 'DEPORTIVO LA PLATA' }];
check('admin ve la lista de equipos completa',
  A.equiposVisibles(listaAdmin, ADMIN).length === 2);

titulo('SIN SESIÓN · el panel se comporta como antes');

/* Es la única opción honesta: no hay autenticación, así que un "deny by
   default" no protegería nada —los datos siguen a un fetch de distancia—
   y en cambio rompería el panel para los tres clubes que lo usan hoy.
   El rol se llama ABIERTO y no ADMIN para poder distinguir en los tests
   quién entró por la puerta y quién porque no hay puerta. */
check('sin sesión el rol es ABIERTO, no ADMIN', A.rol(null) === A.ROLES.ABIERTO);
SGADD.SECCIONES.forEach(sec => {
  check('sin sesión entra a ' + sec, A.puedoAcceder(sec, null).ok === true);
});
check('sin sesión ve todos los equipos', A.puedeVerEquipo('ATENAS A', null) === true);
check('y la lista no se filtra', A.equiposVisibles(listaAdmin, null).length === 2);

titulo('CLIENTE · el equipo asignado');

check('el rol de un cliente es CLIENTE', A.rol(BASICO) === A.ROLES.CLIENTE);
check('ve su equipo', A.puedeVerEquipo('DEPORTIVO LA PLATA', BASICO) === true);
check('NO ve un rival', A.puedeVerEquipo('ATENAS A', BASICO) === false);

/* El equipo se compara con `claveEquipo()`, el mismo normalizador que usa
   toda la app: la planilla escribe el sufijo de categoría y el JSON del
   cliente no. Sin normalizar, el club no se reconocería a sí mismo y se
   quedaría sin ver NADA — el peor modo de fallar, porque parece que el
   panel está roto y no que la config lo está. */
['DEPORTIVO LA PLATA - MM', 'deportivo la plata',
 '  DEPORTIVO LA PLATA  '].forEach(v => {
  check('reconoce su equipo escrito como ' + JSON.stringify(v),
    A.puedeVerEquipo(v, BASICO) === true);
});

/* LA TRAMPA DE CONFIGURACIÓN, y hay que entenderla antes de dar de alta un
   cliente: la comilla de `RECONQUISTA 'A'` NO es decorativa, distingue el
   equipo A del B, y `claveEquipo()` la conserva a propósito. Así que
   `equipoAsignado` tiene que escribirse como la clave que produce el
   núcleo para ESE equipo — `RECONQUISTA A`, no `RECONQUISTA`.

   Si no coincide, el cliente no ve NINGÚN equipo, que es el peor modo de
   fallar: parece que el panel está roto y no que la config lo está. Por eso
   la sección lo denuncia en pantalla en vez de mostrar una grilla vacía. */
check("DEPORTIVO LA PLATA 'A' es OTRO equipo, y la comilla no se ignora",
  A.puedeVerEquipo("DEPORTIVO LA PLATA 'A' - MM", BASICO) === false);
const CON_LETRA = { email: 'dt@r.com', equipoAsignado: 'RECONQUISTA A', plan: 'PRO' };
check('un cliente asignado a RECONQUISTA A sí lo reconoce con su sufijo',
  A.puedeVerEquipo("RECONQUISTA 'A' - MM", CON_LETRA) === true);
check('y no se lleva puesto al B',
  A.puedeVerEquipo("RECONQUISTA 'B' - MM", CON_LETRA) === false);
/* Y no se pasa de listo: un club que EMPIEZA igual es otro club. Es el
   mismo filo que ya tuvo la resolución de escudos con DEPORTIVO LA PLATA
   contra DEPORTIVO SAN VICENTE (punto 6). */
check('pero DEPORTIVO SAN VICENTE NO es su equipo',
  A.puedeVerEquipo('DEPORTIVO SAN VICENTE', BASICO) === false);

/* Un cliente sin equipo asignado no ve ninguno: es una config incompleta,
   y dejarlo ver todo convertiría el error en acceso total sin síntoma. */
const SIN_EQUIPO = { email: 'dt@club.com', plan: 'PRO' };
check('un cliente sin equipo asignado no ve ninguno',
  A.puedeVerEquipo('ATENAS A', SIN_EQUIPO) === false &&
  A.puedeVerEquipo('DEPORTIVO LA PLATA', SIN_EQUIPO) === false);

check('la lista de equipos le queda en uno solo',
  A.equiposVisibles(listaAdmin, BASICO).length === 1 &&
  A.equiposVisibles(listaAdmin, BASICO)[0].clave === 'DEPORTIVO LA PLATA');
check('y filtra igual una lista de strings',
  A.equiposVisibles(['ATENAS A', 'DEPORTIVO LA PLATA'], BASICO).length === 1);
check('una lista vacía o inválida no rompe',
  A.equiposVisibles(null, BASICO).length === 0 &&
  A.equiposVisibles([], BASICO).length === 0);

titulo('CLIENTE · la matriz de secciones');

/* Principal, Clasificación, Equipos y Jugadores van completas: comparar
   contra la liga entera es el valor del panel, y no expone nada que la
   tabla de posiciones no muestre ya. */
['principal', 'clasificacion', 'equipos', 'jugadores'].forEach(sec => {
  check('cliente entra a ' + sec, A.puedoAcceder(sec, BASICO).ok === true);
  check('  y con Plan Pro también', A.puedoAcceder(sec, PRO).ok === true);
});

/* Simulador, Configuración y Diagnóstico son de administración. */
['simulador', 'configuracion', 'diagnostico'].forEach(sec => {
  const b = A.puedoAcceder(sec, BASICO);
  const pr = A.puedoAcceder(sec, PRO);
  check('cliente Básico NO entra a ' + sec, b.ok === false, JSON.stringify(b));
  check('cliente Pro TAMPOCO entra a ' + sec, pr.ok === false, JSON.stringify(pr));
  /* El motivo importa: el Pro no puede creer que le falta plan cuando lo
     que pasa es que la pantalla es interna. Un mensaje equivocado lo manda
     a comprar algo que no le va a dar acceso. */
  check('  y el motivo es SOLO_ADMIN, no falta de plan',
    b.motivo === A.MOTIVOS.SOLO_ADMIN && pr.motivo === A.MOTIVOS.SOLO_ADMIN);
});

titulo('CLIENTE BÁSICO · rebotado en Scouting');

const sc = A.puedoAcceder('scouting', BASICO);
check('el Plan Básico NO entra a Scouting', sc.ok === false);
check('y el motivo es que falta el plan, no un permiso',
  sc.motivo === A.MOTIVOS.REQUIERE_PLAN, sc.motivo);
check('el mensaje sabe qué plan pedir', sc.plan === A.PLANES.PRO, sc.plan);
check('tieneModulo lo dice igual', A.tieneModulo('scouting', BASICO) === false);
check('y no puede armar NINGÚN cruce, ni el suyo',
  A.puedeScoutearCruce('DEPORTIVO LA PLATA', 'ATENAS A', BASICO) === false);

/* Un plan mal escrito cae a BÁSICO y no a PRO: ante la duda, el menos
   permisivo. Un typo en el JSON no puede regalar el módulo que se cobra. */
['PROO', 'pro ', 'PREMIUM', '', null, undefined, 'BASICO', 0, 'true'].forEach(v => {
  const ses = A.parsearSesion({ email: 'x@y.com', equipoAsignado: 'X', plan: v });
  const esPro = String(v).trim().toUpperCase() === 'PRO';
  check('plan ' + JSON.stringify(v) + ' → ' + (esPro ? 'PRO' : 'BASICO'),
    ses.plan === (esPro ? 'PRO' : 'BASICO'), ses.plan);
});
check('y "pro" en minúscula SÍ es Pro, que es un tipeo razonable',
  A.parsearSesion({ email: 'x@y.com', plan: 'pro' }).plan === A.PLANES.PRO);

titulo('CLIENTE PRO · la regla de oro del cruce');

check('el Plan Pro entra a Scouting', A.puedoAcceder('scouting', PRO).ok === true);
check('puede scoutear su cruce de local',
  A.puedeScoutearCruce('DEPORTIVO LA PLATA', 'ATENAS A', PRO) === true);
check('y de visitante',
  A.puedeScoutearCruce('ATENAS A', 'DEPORTIVO LA PLATA', PRO) === true);

/* LA REGLA DE ORO: nada de "rival vs rival". */
check('NO puede armar un cruce rival vs rival',
  A.puedeScoutearCruce('ATENAS A', 'PLATENSE A', PRO) === false);
check('ni con su equipo escrito con sufijo del otro lado del cruce',
  A.puedeScoutearCruce('ATENAS A', 'NAUTICO ENSENADA', PRO) === false);
check('ni el mismo equipo de los dos lados',
  A.puedeScoutearCruce('DEPORTIVO LA PLATA', 'DEPORTIVO LA PLATA - MM', PRO) === false);

/* Un cruce a medio armar todavía no viola nada: se valida al elegir el
   segundo equipo. Bloquearlo con un solo lado daría un error mientras el
   DT está a mitad de camino. */
check('un cruce a medio armar no se rechaza',
  A.puedeScoutearCruce('ATENAS A', null, PRO) === true &&
  A.puedeScoutearCruce(null, 'ATENAS A', PRO) === true &&
  A.puedeScoutearCruce(null, null, PRO) === true);

titulo('CLIENTE PRO · el forzado respeta el lado que el DT tocó');

/* Tocó LOCAL y puso un rival → se fuerza el VISITANTE. Al revés le
   borraría justo lo que acaba de elegir. */
let f = A.forzarCruce('ATENAS A', 'PLATENSE A', 'local', PRO);
check('tocando local, se fuerza el visitante',
  f.local === 'ATENAS A' && f.visitante === 'DEPORTIVO LA PLATA', JSON.stringify(f));
check('y se avisa que hubo corrección', f.forzado === true);

f = A.forzarCruce('ATENAS A', 'PLATENSE A', 'visitante', PRO);
check('tocando visitante, se fuerza el local',
  f.local === 'DEPORTIVO LA PLATA' && f.visitante === 'PLATENSE A', JSON.stringify(f));
check('y también se avisa', f.forzado === true);

/* Si tocó SU equipo, el otro lado queda libre: elige contra quién juega. */
f = A.forzarCruce('DEPORTIVO LA PLATA', 'ATENAS A', 'local', PRO);
check('eligiendo su equipo de local, el rival queda como está',
  f.local === 'DEPORTIVO LA PLATA' && f.visitante === 'ATENAS A' && f.forzado === false,
  JSON.stringify(f));
f = A.forzarCruce('ATENAS A', 'DEPORTIVO LA PLATA', 'visitante', PRO);
check('y de visitante igual',
  f.local === 'ATENAS A' && f.forzado === false, JSON.stringify(f));

/* Un cruce que YA era válido no se toca ni avisa: informar de un cambio
   que no ocurrió es ruido. */
f = A.forzarCruce('DEPORTIVO LA PLATA - MM', 'ATENAS A', 'visitante', PRO);
check('un cruce ya válido no se corrige ni avisa', f.forzado === false, JSON.stringify(f));

/* Con un solo lado elegido, el otro se completa con su equipo: es lo que
   el DT iba a hacer igual. */
f = A.forzarCruce('ATENAS A', null, 'local', PRO);
check('con un solo rival elegido, el otro lado se completa solo',
  f.visitante === 'DEPORTIVO LA PLATA' && f.forzado === true, JSON.stringify(f));

check('a un admin no se le fuerza nada',
  A.forzarCruce('ATENAS A', 'PLATENSE A', 'local', ADMIN).forzado === false);
check('ni sin sesión',
  A.forzarCruce('ATENAS A', 'PLATENSE A', 'local', null).forzado === false);
check('ni a un cliente sin equipo asignado (no hay con qué forzar)',
  A.forzarCruce('ATENAS A', 'PLATENSE A', 'local', SIN_EQUIPO).forzado === false);

titulo('LA MATRIZ CUBRE TODAS LAS SECCIONES');

/* Una sección nueva que nadie agregue a la matriz queda ABIERTA — que es
   como se comportaba el panel antes de que existiera este módulo, así que
   no se rompe sola. Pero eso es justo lo que no se puede dejar pasar
   inadvertido: el día que entre "Finanzas", este test avisa. */
SGADD.SECCIONES.forEach(sec => {
  check(sec + ' está declarada en la matriz',
    Object.prototype.hasOwnProperty.call(A.MODULOS, sec), 'falta en MODULOS');
});
Object.keys(A.MODULOS).forEach(sec => {
  check('y ' + sec + ' de la matriz existe como sección',
    SGADD.SECCIONES.indexOf(sec) !== -1, 'sobra en MODULOS');
});
check('una sección inventada no rompe el guard',
  A.puedoAcceder('finanzas', BASICO).ok === true);

titulo('LA SESIÓN · parseo y precedencia');

check('una sesión sin mail no es una sesión',
  A.parsearSesion({ equipoAsignado: 'X', plan: 'PRO' }) === null);
[null, undefined, 'texto', [], 0, true].forEach(v => {
  check('parsearSesion(' + JSON.stringify(v) + ') es null', A.parsearSesion(v) === null);
});
const ps = A.parsearSesion({ email: '  DT@Club.COM ', equipoAsignado: '  Atenas  ', plan: 'pro' });
check('el mail y el equipo se recortan', ps.email === 'dt@club.com' && ps.equipoAsignado === 'Atenas');

/* La URL gana sobre `localStorage` para que un link armado a mano abra la
   vista de ese club en cualquier navegador. */
const almacen = {};
global.localStorage = {
  getItem: (k) => (k in almacen ? almacen[k] : null),
  setItem: (k, v) => { almacen[k] = String(v); },
  removeItem: (k) => { delete almacen[k]; },
};
almacen[A.CLAVE_SESION] = JSON.stringify({ email: 'viejo@club.com', equipoAsignado: 'ATENAS A', plan: 'BASICO' });
let s2 = A.cargarSesion('?usuario=nuevo@club.com&equipo=DEPORTIVO%20LA%20PLATA&plan=PRO');
check('la URL gana sobre lo guardado', s2.email === 'nuevo@club.com', JSON.stringify(s2));
check('y trae su equipo y su plan',
  s2.equipoAsignado === 'DEPORTIVO LA PLATA' && s2.plan === 'PRO');
/* Se persiste para que un F5 no devuelva a la vista completa a mitad de
   trabajo. */
check('la sesión de la URL queda guardada',
  JSON.parse(almacen[A.CLAVE_SESION]).email === 'nuevo@club.com');
check('y sin parámetro se levanta la guardada',
  A.cargarSesion('').email === 'nuevo@club.com');

/* `?usuario=` vacío LIMPIA: sin esa salida, un cliente que entró una vez
   por link se quedaba con esa vista para siempre. */
check('?usuario= vacío limpia la sesión', A.cargarSesion('?usuario=') === null);
check('y también la guardada', !almacen[A.CLAVE_SESION]);
check('un JSON corrupto no rompe el arranque',
  (almacen[A.CLAVE_SESION] = '{roto', A.cargarSesion('') === null));
delete global.localStorage;

titulo('EL GATE ESTÁ DONDE SE RESUELVE, NO SOLO EN EL PICKER');

/* Por el picker filtrado NO se llega a un equipo ajeno, pero por un hash
   pegado a mano SÍ. Estos checks leen el fuente porque las secciones usan
   `document` y no se pueden ejecutar en Node — es el mismo criterio que
   ya usan `test-scouting.js` y `test-config.js`. */
const eqSrc = fs.readFileSync('./js/sgadd-equipos.js', 'utf8');
const jugSrc = fs.readFileSync('./js/sgadd-jugadores.js', 'utf8');

check('Equipos filtra el picker',
  /teamPicker\(SGADD_AUTH\.equiposVisibles\(/.test(eqSrc));
check('y ADEMÁS chequea donde resuelve el equipo abierto',
  /if \(e && !SGADD_AUTH\.puedeVerEquipo\(e\.clave\)\)/.test(eqSrc));
check('Jugadores filtra el picker',
  /teamPicker\(SGADD_AUTH\.equiposVisibles\(/.test(jugSrc));
check('y chequea la ficha por el EQUIPO del jugador, no por su nombre',
  /if \(j && !SGADD_AUTH\.puedeVerEquipo\(j\['EQUIPO'\]\)\)/.test(jugSrc));

const idxSrc = fs.readFileSync('./index.html', 'utf8');
check('el router chequea antes de pintar cualquier sección',
  /const permiso = SGADD_AUTH\.puedoAcceder\(section\);/.test(idxSrc));
check('y el hash a mano no abre una sección interna',
  /function permitida\(sec\)/.test(idxSrc));
check('el menú esconde lo que la sesión no puede abrir',
  /function aplicarPermisosNav\(\)/.test(idxSrc));
/* Scouting se le MUESTRA al Básico a propósito: el punto es que sepa que
   el módulo existe y cómo pedirlo. */
check('pero Scouting se le sigue mostrando al Plan Básico',
  /p\.motivo === SGADD_AUTH\.MOTIVOS\.REQUIERE_PLAN/.test(idxSrc));

const scoSrc = fs.readFileSync('./js/sgadd-scouting.js', 'utf8');
check('el selector de cruce fuerza el otro lado',
  /SGADD_AUTH\.forzarCruce\(SCOUT_UI\.local, SCOUT_UI\.visitante, lado\)/.test(scoSrc));
check('y la UI avisa cuál lado se corrigió, en vez de cambiarlo en silencio',
  /SCOUT_UI\.forzado \? `/.test(scoSrc));

/* Las dos exportaciones a PDF llevan su propio guard: el archivo sale del
   panel y se comparte, así que es el último lugar donde conviene confiar
   en que alguien filtró río arriba. */
check('la ficha del jugador no arma el PDF de un equipo ajeno',
  /puedeVerEquipo\(ctx\.j && ctx\.j\['EQUIPO'\]\)\) return;/.test(
    fs.readFileSync('./js/sgadd-ficha.js', 'utf8')));
/* Un `equipoAsignado` que no matchea con ningún equipo del libro deja al
   cliente sin ver nada. La sección tiene que DECIRLO, no mostrar una
   grilla vacía. */
check('Equipos avisa si el equipo asignado no existe en el libro',
  /equiposAvisoSinEquipo/.test(eqSrc));
check('y Jugadores también',
  /equiposAvisoSinEquipo|jugadoresAvisoSinEquipo/.test(jugSrc));

check('ni el informe de equipo',
  /puedeVerEquipo\(eq\.clave\)\) return;/.test(
    fs.readFileSync('./js/sgadd-informe.js', 'utf8')));

titulo('LO QUE ESTE MÓDULO NO ES');

/* Este bloque existe para que nadie lea la suite y concluya que los datos
   están protegidos. Si algún día hay backend, estos checks se cambian por
   los de verdad — y hasta entonces dicen la verdad. */
check('el módulo declara por escrito que NO es seguridad',
  /ESTO NO ES SEGURIDAD/.test(src));
check('y explica por qué: sitio estático, GViz anónimo, sheetId público',
  /sheetId/.test(src) && /est[áa]tico/i.test(src) && /an[óo]nimo/i.test(src));
/* Los rankings de liga van COMPLETOS a propósito: comparar contra la liga
   entera es el valor del panel. `equiposVisibles` es para los pickers. */
check('y aclara que los rankings de liga NO se filtran',
  /NO se usa en los rankings/.test(src));

titulo('EL SELECTOR DE CLIENTE · solo admin, y la lista sale del catálogo');

/* Con tres clubes se cambiaba de cliente editando el `?club=` a mano. Con
   cincuenta eso no es incómodo: es el gesto donde uno se equivoca y
   termina mirando los datos del cliente que no era, sin ningún síntoma. */
{
  const CLI = require('./js/sgadd-clientes.js');

  /* SOLO ADMIN. A un CLIENTE una lista de clubes le sugiere un acceso que
     no tiene, y como esto NO es seguridad (punto 19), mostrársela sería
     mentirle sobre qué lo separa de esos datos. */
  check('el admin lo ve', CLI.seMuestra('ADMIN', [{}, {}], true));
  check('el cliente NO', !CLI.seMuestra('CLIENTE', [{}, {}], true));
  check('y una sesión abierta tampoco', !CLI.seMuestra('ABIERTO', [{}, {}], true));

  /* Sin backend no hay catálogo que pedir, y un desplegable vacío es peor
     que ninguno. */
  check('sin backend no se dibuja', !CLI.seMuestra('ADMIN', [{}, {}], false));
  check('sin lista tampoco', !CLI.seMuestra('ADMIN', null, true));

  /* Con UN club el control no lleva a ningún lado: solo gasta lugar en el
     header. Misma regla por la que el TOTAL no se ofrece con un torneo. */
  check('con un solo club no se dibuja', !CLI.seMuestra('ADMIN', [{}], true));

  /* EL TOKEN NO VIAJA EN LA URL. Vive en sessionStorage, que sobrevive a
     una recarga en la misma pestaña; volver a ponerlo en el query string
     solo lo dejaría otra vez en el historial y en los logs de cualquier
     proxy — justo de donde `sacarTokenDeLaUrl()` lo saca al leerlo. */
  const u = CLI.urlDeClub('jujuy', '?club=deportivo&access_token=SECRETO');
  check('el switch NO arrastra el token', u.indexOf('SECRETO') === -1 &&
    u.indexOf('access_token') === -1, u);
  check('y sí lleva el club nuevo', /(^|[?&])club=jujuy($|&)/.test(u), u);

  /* `?api=` SÍ se conserva: es lo que permite probar contra un servidor
     local, y perderlo mandaría la prueba a producción sin avisar. */
  check('conserva ?api= para poder probar contra un servidor local',
    CLI.urlDeClub('x', '?api=http://localhost:3000').indexOf('api=') !== -1);

  /* EL HASH SE DESCARTA. Lleva planilla, tramo y entidad, y nada de eso
     existe en el club nuevo: la planilla es de otro libro. Arrastrarlo
     abriría una ficha que no está. */
  check('no arrastra la ruta del club anterior', CLI.urlDeClub('x', '').indexOf('#') === -1);

  /* LOS INACTIVOS SE LISTAN IGUAL, marcados. El admin tiene que ver que el
     club existe y que le falta el libro, en vez de no encontrarlo y no
     saber si está mal dado de alta o si directamente no está. Es la misma
     decisión del selector de categorías (punto 6). */
  const ops = CLI.opciones([
    { id: 'zeta', nombre: 'Zeta', categorias: [{ activo: false }] },
    { id: 'alfa', nombre: 'Alfa', categorias: [{ activo: true }, { activo: false }] },
  ], 'alfa');
  check('el inactivo entra a la lista', ops.length === 2);
  check('y dice que no tiene datos', /sin datos/.test(ops.find(o => o.id === 'zeta').etiqueta));
  check('el activo cuenta sus categorías CON libro',
    /1 categoría/.test(ops.find(o => o.id === 'alfa').etiqueta),
    ops.find(o => o.id === 'alfa').etiqueta);
  check('se ordena alfabético, no por orden del catálogo', ops[0].id === 'alfa');
  check('y marca cuál es el que se está mirando',
    ops.find(o => o.id === 'alfa').actual && !ops.find(o => o.id === 'zeta').actual);

  /* LA LISTA SALE DEL CATÁLOGO Y DE NINGÚN OTRO LADO. El proyecto no tiene
     un listado de clubes —`?club=<id>` resuelve por convención (punto 6)—
     y hardcodear uno acá sería la segunda fuente de verdad de siempre, en
     el lugar donde más se nota: el club nuevo sería justo el que falta. */
  const fuente = fs.readFileSync('./js/sgadd-clientes.js', 'utf8');
  check('no hay una lista de clubes hardcodeada',
    !/(deportivo|reconquista|jujuy)/i.test(fuente));
  check('la lista se pide al catálogo', /SGADD_DATA\.catalogo\(\)/.test(fuente));

  /* CAMBIAR DE CLUB RECARGA, no repinta: hay que limpiar LOGOS, el caché
     de hojas y los tres tokens de color, y ese camino ya existe y está
     probado. Reproducir la limpieza acá sería una segunda implementación
     de las que se olvidan un paso. */
  check('el cambio de cliente recarga la página',
    /window\.location\.href = urlDeClub/.test(fuente));
  /* Se miran las LLAMADAS, no el texto: el módulo nombra `LOGOS.reset()`
     en un comentario justamente para explicar por qué NO lo llama, y un
     grep crudo lo daría por incumplido. */
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('y no intenta limpiar el estado por su cuenta',
    !/LOGOS\.reset\s*\(|limpiarCache\s*\(/.test(sinComentarios));

  /* Y DICE QUE NO ES SEGURIDAD, como todo el módulo de permisos. */
  check('el módulo declara que NO es un control de acceso',
    /NO ES UN CONTROL DE ACCESO/.test(fuente));
}

titulo('EL HUB DE CLIENTES · consulta todo, y NO finge que publica');

{
  const HUB = require('./js/sgadd-hub.js');
  const hub = fs.readFileSync('./js/sgadd-hub.js', 'utf8');

  /* NO SE MUESTRA EL `sheetId`. `catalogo.publico()` los borra a propósito
     antes de mandar la lista —"activo dice lo mismo sin revelar cuál"— y
     ese recorte es el punto entero del backend: sacar los ids del alcance
     del navegador. Agregarlos acá para que el hub se vea más completo
     sería desarmar la garantía desde adentro. */
  check('el hub no pinta ningún sheetId',
    !/k\.sheetId|categorias\[[^\]]*\]\.sheetId/.test(hub));
  const publico = fs.readFileSync('./server/lib/catalogo.js', 'utf8');
  check('y el catálogo público sigue sin mandarlos',
    /activo: !!c\[id\]\.categorias\[s\]\.sheetId/.test(publico) &&
    !/sheetId: c\[id\]/.test(publico));

  /* UN COMANDO A MEDIAS NO SE EMITE. Falla en la terminal con un error de
     la CLI, que es peor que un formulario diciendo qué falta. */
  check('sin los tres campos obligatorios no hay comando',
    HUB.comandoAlta({ club: 'x', categoria: 'y' }) === null);
  check('y se dice QUÉ falta, en castellano',
    HUB.faltantesAlta({ club: 'x' }).join(' ').indexOf('sheetId') !== -1);

  const cmd = HUB.comandoAlta({ club: 'nuevo', categoria: 'nuevo-primera', sheet: '1ABC' });
  check('el comando es el de la CLI real', /catalogo\.js alta/.test(cmd), cmd);
  check('y cita los tres campos', /--club/.test(cmd) && /--categoria/.test(cmd) && /--sheet/.test(cmd));

  /* LAS COMILLAS SE ESCAPAN. Un label lleva espacios —"Primera · Vuelta
     2026"— así que va entrecomillado, y una comilla adentro partiría el
     comando en dos sin que se note hasta pegarlo. */
  const conComilla = HUB.comandoAlta({ club: 'a', categoria: 'b', sheet: 'c', label: 'Primera "A"' });
  check('las comillas del label se escapan', /\\"A\\"/.test(conComilla), conComilla);

  /* UN ID ES UNA CLAVE, NO UN TÍTULO: viaja en `?club=<id>` y nombra
     `clubes/<id>.json`. Se valida al escribir, no al desplegar. */
  check('un id con mayúsculas o espacios no pasa',
    !HUB.idValido('Club Nuevo') && !HUB.idValido('CLUB') && !HUB.idValido('con espacio'));
  check('y uno normal sí', HUB.idValido('reconquista-u21') && HUB.idValido('jujuy'));
  check('no puede empezar con guión', !HUB.idValido('-x'));

  /* NO FINGE QUE PUBLICA. Un "Guardar" que no publica es peor que no
     tenerlo: el que lo aprieta se va convencido de que dio de alta un
     cliente. Misma decisión que la pestaña de Zonas (punto 17). */
  /* ETAPA 2: AHORA SÍ PUBLICA, y por eso el texto de "todavía no" se fue.
     El botón manda una INTENCIÓN, nunca un catálogo: mandar el objeto
     entero convertiría cualquier bug de esta pantalla en pérdida de datos
     de todos los clubes a la vez. */
  check('el botón guarda de verdad', /SGADD_DATA\.guardarCatalogo\(/.test(hub));
  check('y manda una intención, no el catálogo',
    /accion: 'alta'/.test(hub) && !/catalogo: /.test(hub));
  check('ya no dice que no publica', !/todavía no se[\s\S]{0,40}publica/i.test(hub));

  /* EL MOTIVO DEL SERVIDOR SE MUESTRA TAL CUAL. Están escritos para que el
     admin sepa qué corregir ("pegá el id, no la URL entera"); traducirlos
     acá los degradaría a un "error al guardar" genérico. */
  check('el error del servidor se muestra tal cual',
    /guardado\.mensaje = e\.message/.test(hub));
  /* Y en la pantalla, no en un `alert()`: el motivo hay que poder leerlo
     MIENTRAS se corrige el campo. */
  const hubSinComentarios = hub.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('y no en un alert', !/alert\(/.test(hubSinComentarios));

  /* LA LISTA SE REPINTA CON LO QUE DEVOLVIÓ EL SERVIDOR, no con lo que el
     formulario creyó mandar: si un guard recortó algo, se ve. */
  check('la lista se repinta con la respuesta del servidor',
    /SGADD_CLIENTES\.estado\.clubes = r\.clubes/.test(hub));

  /* TIPEAR NO REPINTA LA PESTAÑA: le sacaría el foco al input y haría
     imposible escribir un sheetId de 44 caracteres. Se refresca SOLO el
     bloque del alta. Misma regla que scoutMeta() y el buzón. */
  check('tipear refresca solo el bloque del alta',
    /getElementById\('hubAlta'\)/.test(hub));
  const configui = fs.readFileSync('./js/sgadd-configui.js', 'utf8');
  check('la pestaña Clientes va primera en el Panel Master',
    /id: 'clientes'[\s\S]{0,80}id: 'zonas'/.test(configui));
  /* Y ES LA QUE ABRE. Con Zonas por defecto el admin entraba y veía la
     config de UN club sin una pista de dónde estaban los demás, que es
     justo el problema que esta pantalla vino a resolver. */
  check('y es la pestaña por defecto',
    /pestana: 'clientes'/.test(configui));

  /* EL ACCESO SE LLAMA "PANEL MASTER", que es lo que es: la sección es
     soloAdmin y es el único lugar de gestión del producto. Con el nombre
     viejo el admin la leía como los ajustes de SU club. El ID de sección
     NO cambia: viaja en la ruta y en los links compartidos. */
  const idx = fs.readFileSync('./index.html', 'utf8');
  check('el nav dice Panel Master', /Panel Master/.test(idx));
  check('y la ruta sigue siendo /configuracion',
    /navigate\('configuracion'\)/.test(idx) &&
    A.MODULOS.configuracion && A.MODULOS.configuracion.soloAdmin === true);
}

titulo('EL CICLO DE VIDA EN LA UI · y que NO diverja del servidor');

{
  const HUB2 = require('./js/sgadd-hub.js');
  const MSRV = require('./server/lib/catalogo-mutar.js');
  const hub2 = fs.readFileSync('./js/sgadd-hub.js', 'utf8');

  /* EL RIESGO DE ESTE BLOQUE, en una línea: el servidor es el que hace
     valer la suscripción —devuelve 403— y el hub tiene su propia copia de
     la regla solo para PINTAR. Si divergieran, la pantalla mostraría
     'activo' sobre un club al que el backend ya le niega los datos: el
     admin ve todo bien y el cliente no puede entrar, que es la peor forma
     de fallar que tiene esto.

     Así que se comparan las DOS implementaciones sobre los mismos casos,
     incluidos los bordes. */
  const casos = [
    { estado: 'activo' },
    { estado: 'pausado' },
    { estado: 'inactivo' },
    { estado: 'activo', vence: '2020-01-01' },
    { estado: 'activo', vence: '2099-12-31' },
    { estado: 'pausado', vence: '2099-12-31' },
    { estado: 'inactivo', vence: '2020-01-01' },
    { },
    { vence: '' },
    { vence: 'no-es-fecha' },
    { estado: 'inventado' },
    { estado: 'activo', vence: '2026-09-30' },
  ];
  const momentos = [
    Date.parse('2026-09-30T00:00:00Z'),
    Date.parse('2026-09-30T09:00:00Z'),
    Date.parse('2026-09-30T23:59:59Z'),
    Date.parse('2026-10-01T00:00:01Z'),
  ];
  let distintos = [];
  casos.forEach((c) => momentos.forEach((m) => {
    const a = HUB2.estadoEfectivo(c, m);
    const b = MSRV.estadoEfectivo(c, m);
    if (a !== b) distintos.push(JSON.stringify(c) + ' @' + m + ': ui=' + a + ' srv=' + b);
  }));
  check('la UI y el servidor coinciden en los ' + (casos.length * momentos.length) + ' casos',
    distintos.length === 0, distintos.slice(0, 3).join(' | '));

  /* EL BORDE DEL DÍA, explícito: contra la medianoche el cliente figuraría
     vencido el mismo día que dice su factura, un día antes. */
  const nueve = Date.parse('2026-09-30T09:00:00Z');
  check('el día que vence sigue activo en la UI',
    HUB2.estadoEfectivo({ vence: '2026-09-30' }, nueve) === 'activo');
  check('y al día siguiente sale vencido',
    HUB2.estadoEfectivo({ vence: '2026-09-30' }, nueve + 86400000) === 'vencido');

  /* Los días que faltan se redondean HACIA ARRIBA: a doce horas del corte
     todavía queda 'un día', no cero. Un cartel que dice 0 sobre un cliente
     que todavía entra manda a renovar algo que no venció. */
  check('faltando 12 horas dice 1 día',
    HUB2.diasPara('2026-09-30', Date.parse('2026-09-30T12:00:00Z')) === 1);
  check('el día después dice -1 o menos',
    HUB2.diasPara('2026-09-30', Date.parse('2026-10-02T00:00:00Z')) < 0);
  check('sin fecha no hay cuenta', HUB2.diasPara(null) === null && HUB2.diasPara('') === null);

  /* LOS TRES ESTADOS Y LOS TRES PLANES son los mismos de los dos lados: si
     la UI ofreciera uno que el motor no acepta, el admin lo elegiría y
     recibiría un rechazo sin entender por qué está en la lista. */
  check('los estados de la UI son los del servidor',
    HUB2.ESTADOS.join(',') === MSRV.ESTADOS.join(','),
    HUB2.ESTADOS + ' vs ' + MSRV.ESTADOS);
  check('y los planes también',
    HUB2.PLANES.join(',') === MSRV.PLANES.join(','),
    HUB2.PLANES + ' vs ' + MSRV.PLANES);

  /* Y LOS PLANES DEL MOTOR DE PERMISOS son esos mismos: `PLANES` de
     `sgadd-auth` es lo que decide qué módulo abre cada uno. Un plan que el
     Panel Master puede asignar y el gate no conoce es un cliente pagando
     algo que no se le habilita. */
  check('el motor de permisos conoce los mismos planes',
    Object.keys(A.PLANES).sort().join(',') === MSRV.PLANES.slice().sort().join(','),
    Object.keys(A.PLANES) + ' vs ' + MSRV.PLANES);

  /* MASTER TIENE QUE SER SUPERCONJUNTO DE PRO. Con `===` en vez de orden,
     MASTER se quedaba sin Scouting porque no es literalmente PRO — un plan
     superior perdiendo un módulo del inferior es la clase de bug que nadie
     reporta porque parece un permiso mal puesto. */
  const ses = (p) => ({ email: 'x@y.com', plan: p, equipoAsignado: 'X' });
  check('MASTER abre Scouting, igual que PRO', A.tieneModulo('scouting', ses('MASTER')));
  check('BÁSICO no', !A.tieneModulo('scouting', ses('BASICO')));
  check('y un plan desconocido tampoco', !A.tieneModulo('scouting', ses('GRATIS')));

  /* SOLO LA BAJA PIDE CONFIRMACIÓN. Pausar y cambiar el plan son
     reversibles de un click y el estado queda a la vista; la baja es la
     única que el cliente lee como el final de la relación. */
  check('dar de baja pide confirmación',
    /accion === 'desactivar'[\s\S]{0,120}confirm\(/.test(hub2));
  check('pausar NO la pide',
    !/accion === 'pausar'[\s\S]{0,120}confirm\(/.test(hub2));

  /* EL BLOQUE COMERCIAL NO SE PINTA SI EL SERVIDOR NO LO MANDÓ, o sea para
     un no-admin: `publico()` omite esos campos y la tarjeta no puede
     inventarlos. */
  check('sin estado comercial no se pinta el bloque',
    /c\.estado === undefined && c\.plan === undefined/.test(hub2));

  /* UNA ACCIÓN EN VUELO DESHABILITA SOLO SU TARJETA. Con un flag global,
     tocar el plan de un cliente congelaría los controles de los otros
     cuarenta y nueve. */
  check('el pendiente se guarda por club, no como booleano',
    /pendiente\.club === c\.id/.test(hub2));
  check('y el error se muestra en la tarjeta del club que falló',
    /pendiente\.clubError === c\.id/.test(hub2));
}

console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
  '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
