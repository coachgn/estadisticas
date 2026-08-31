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
const BRONCE = { email: 'dt@deportivo.com', equipoAsignado: 'DEPORTIVO LA PLATA', plan: 'BRONCE' };
const PRO = { email: 'dt@deportivo.com', equipoAsignado: 'DEPORTIVO LA PLATA', plan: 'PLATA' };

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
/* ABIERTO ENTRA A LAS PÚBLICAS, NO A LAS INTERNAS. Esto cambió: antes
   `sinRestricciones` (que es `rol !== CLIENTE`) lo dejaba pasar a todo, y
   un visitante cualquiera veía Simulador, Panel Master y Diagnóstico en el
   menú — las tres herramientas internas ofrecidas a quien abriera la URL.

   Lo que NO cambió es lo que sostiene el punto 19: el panel sigue abriendo
   sin sesión y las cinco secciones públicas siguen andando igual, así que
   los clubes que entran sin token no pierden nada. */
SGADD.SECCIONES.forEach(sec => {
  const interna = !!(A.MODULOS[sec] && A.MODULOS[sec].soloAdmin);
  check('sin sesión ' + (interna ? 'NO entra a ' : 'entra a ') + sec,
    A.puedoAcceder(sec, null).ok === !interna);
});
check('sin sesión ve todos los equipos', A.puedeVerEquipo('ATENAS A', null) === true);
check('y la lista no se filtra', A.equiposVisibles(listaAdmin, null).length === 2);

titulo('CLIENTE · el equipo asignado');

check('el rol de un cliente es CLIENTE', A.rol(BRONCE) === A.ROLES.CLIENTE);
check('ve su equipo', A.puedeVerEquipo('DEPORTIVO LA PLATA', BRONCE) === true);
check('NO ve un rival', A.puedeVerEquipo('ATENAS A', BRONCE) === false);

/* El equipo se compara con `claveEquipo()`, el mismo normalizador que usa
   toda la app: la planilla escribe el sufijo de categoría y el JSON del
   cliente no. Sin normalizar, el club no se reconocería a sí mismo y se
   quedaría sin ver NADA — el peor modo de fallar, porque parece que el
   panel está roto y no que la config lo está. */
['DEPORTIVO LA PLATA - MM', 'deportivo la plata',
 '  DEPORTIVO LA PLATA  '].forEach(v => {
  check('reconoce su equipo escrito como ' + JSON.stringify(v),
    A.puedeVerEquipo(v, BRONCE) === true);
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
  A.puedeVerEquipo("DEPORTIVO LA PLATA 'A' - MM", BRONCE) === false);
const CON_LETRA = { email: 'dt@r.com', equipoAsignado: 'RECONQUISTA A', plan: 'PLATA' };
check('un cliente asignado a RECONQUISTA A sí lo reconoce con su sufijo',
  A.puedeVerEquipo("RECONQUISTA 'A' - MM", CON_LETRA) === true);
check('y no se lleva puesto al B',
  A.puedeVerEquipo("RECONQUISTA 'B' - MM", CON_LETRA) === false);
/* Y no se pasa de listo: un club que EMPIEZA igual es otro club. Es el
   mismo filo que ya tuvo la resolución de escudos con DEPORTIVO LA PLATA
   contra DEPORTIVO SAN VICENTE (punto 6). */
check('pero DEPORTIVO SAN VICENTE NO es su equipo',
  A.puedeVerEquipo('DEPORTIVO SAN VICENTE', BRONCE) === false);

/* Un cliente sin equipo asignado no ve ninguno: es una config incompleta,
   y dejarlo ver todo convertiría el error en acceso total sin síntoma. */
const SIN_EQUIPO = { email: 'dt@club.com', plan: 'PLATA' };
check('un cliente sin equipo asignado no ve ninguno',
  A.puedeVerEquipo('ATENAS A', SIN_EQUIPO) === false &&
  A.puedeVerEquipo('DEPORTIVO LA PLATA', SIN_EQUIPO) === false);

check('la lista de equipos le queda en uno solo',
  A.equiposVisibles(listaAdmin, BRONCE).length === 1 &&
  A.equiposVisibles(listaAdmin, BRONCE)[0].clave === 'DEPORTIVO LA PLATA');
check('y filtra igual una lista de strings',
  A.equiposVisibles(['ATENAS A', 'DEPORTIVO LA PLATA'], BRONCE).length === 1);
check('una lista vacía o inválida no rompe',
  A.equiposVisibles(null, BRONCE).length === 0 &&
  A.equiposVisibles([], BRONCE).length === 0);

titulo('CLIENTE · la matriz de secciones');

/* Principal, Clasificación, Equipos y Jugadores van completas: comparar
   contra la liga entera es el valor del panel, y no expone nada que la
   tabla de posiciones no muestre ya. */
['principal', 'clasificacion', 'equipos', 'jugadores'].forEach(sec => {
  check('cliente entra a ' + sec, A.puedoAcceder(sec, BRONCE).ok === true);
  check('  y con Plan Plata también', A.puedoAcceder(sec, PRO).ok === true);
});

/* Simulador, Configuración y Diagnóstico son de administración. */
['simulador', 'configuracion', 'diagnostico'].forEach(sec => {
  const b = A.puedoAcceder(sec, BRONCE);
  const pr = A.puedoAcceder(sec, PRO);
  check('cliente Bronce NO entra a ' + sec, b.ok === false, JSON.stringify(b));
  check('cliente Pro TAMPOCO entra a ' + sec, pr.ok === false, JSON.stringify(pr));
  /* El motivo importa: el Pro no puede creer que le falta plan cuando lo
     que pasa es que la pantalla es interna. Un mensaje equivocado lo manda
     a comprar algo que no le va a dar acceso. */
  check('  y el motivo es SOLO_ADMIN, no falta de plan',
    b.motivo === A.MOTIVOS.SOLO_ADMIN && pr.motivo === A.MOTIVOS.SOLO_ADMIN);
});

titulo('CLIENTE BÁSICO · rebotado en Scouting');

const sc = A.puedoAcceder('scouting', BRONCE);
check('el Plan Bronce NO entra a Scouting', sc.ok === false);
check('y el motivo es que falta el plan, no un permiso',
  sc.motivo === A.MOTIVOS.REQUIERE_PLAN, sc.motivo);
check('el mensaje sabe qué plan pedir', sc.plan === A.PLANES.PLATA, sc.plan);
check('tieneModulo lo dice igual', A.tieneModulo('scouting', BRONCE) === false);
check('y no puede armar NINGÚN cruce, ni el suyo',
  A.puedeScoutearCruce('DEPORTIVO LA PLATA', 'ATENAS A', BRONCE) === false);

/* Un plan mal escrito cae a BRONCE y no a PLATA: ante la duda, el menos
   permisivo. Un typo en el JSON no puede regalar el módulo que se cobra.

   `'pro '` SALIÓ DE ESTA LISTA a propósito con el rebranding: los nombres
   viejos ahora se normalizan (`PRO` → `PLATA`) y de paso se les saca el
   espacio, porque un blanco de más al copiar un valor no puede bajarle el
   plan a un cliente que paga. Lo que sigue cayendo a BRONCE es lo que no
   se parece a NINGÚN plan, viejo o nuevo. */
['PROO', 'PREMIUM', '', null, undefined, 'BRONCE', 0, 'true'].forEach(v => {
  const ses = A.parsearSesion({ email: 'x@y.com', equipoAsignado: 'X', plan: v });
  const esPro = String(v).trim().toUpperCase() === 'PLATA';
  check('plan ' + JSON.stringify(v) + ' → ' + (esPro ? 'PLATA' : 'BRONCE'),
    ses.plan === (esPro ? 'PLATA' : 'BRONCE'), ses.plan);
});
check('y "pro" en minúscula SÍ es Pro, que es un tipeo razonable',
  A.parsearSesion({ email: 'x@y.com', plan: 'pro' }).plan === A.PLANES.PLATA);

titulo('CLIENTE PRO · la regla de oro del cruce');

check('el Plan Plata entra a Scouting', A.puedoAcceder('scouting', PRO).ok === true);
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
  A.puedoAcceder('finanzas', BRONCE).ok === true);

titulo('LA SESIÓN · parseo y precedencia');

check('una sesión sin mail no es una sesión',
  A.parsearSesion({ equipoAsignado: 'X', plan: 'PLATA' }) === null);
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
almacen[A.CLAVE_SESION] = JSON.stringify({ email: 'viejo@club.com', equipoAsignado: 'ATENAS A', plan: 'BRONCE' });
let s2 = A.cargarSesion('?usuario=nuevo@club.com&equipo=DEPORTIVO%20LA%20PLATA&plan=PRO');
check('la URL gana sobre lo guardado', s2.email === 'nuevo@club.com', JSON.stringify(s2));
check('y trae su equipo y su plan',
  s2.equipoAsignado === 'DEPORTIVO LA PLATA' && s2.plan === 'PLATA');
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
/* Scouting se le MUESTRA al Bronce a propósito: el punto es que sepa que
   el módulo existe y cómo pedirlo. */
check('pero Scouting se le sigue mostrando al Plan Bronce',
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
  check('la lista se pide al catálogo', /SGADD_DATA\.catalogo\(/.test(fuente));

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

  /* EL ACCESO SE LLAMA "PANEL ORO", que es lo que es: la sección es
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

  /* ORO TIENE QUE SER SUPERCONJUNTO DE PRO. Con `===` en vez de orden,
     ORO se quedaba sin Scouting porque no es literalmente PRO — un plan
     superior perdiendo un módulo del inferior es la clase de bug que nadie
     reporta porque parece un permiso mal puesto. */
  const ses = (p) => ({ email: 'x@y.com', plan: p, equipoAsignado: 'X' });
  check('ORO abre Scouting, igual que PRO', A.tieneModulo('scouting', ses('ORO')));
  check('BÁSICO no', !A.tieneModulo('scouting', ses('BRONCE')));
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

titulo('EL REBRANDING · los tokens ya emitidos NO se degradan');

/* ESTE ES EL BLOQUE QUE JUSTIFICA LOS ALIAS. Los tokens emitidos llevan
   `plan: "PRO"` o `"BASICO"` FIRMADO, y un JWT no se puede editar: sigue
   diciendo eso hasta que venza — el master del admin vence en 2027, y el
   catálogo en KV tiene clubes guardados en `"PRO"`.

   Sin alias, cada uno caería al plan más bajo por "plan desconocido": la
   regla correcta para un typo y la PEOR posible para un rename. Serían
   todos los clientes bajados de plan a la vez, en silencio, sin que nadie
   toque nada. */
{
  const ses = (p) => ({ email: 'x@y.com', plan: p, equipoAsignado: 'X' });

  check('BASICO sigue entrando como BRONCE', A.normalizarPlan('BASICO') === 'BRONCE');
  check('PRO sigue entrando como PLATA', A.normalizarPlan('PRO') === 'PLATA');
  check('MASTER sigue entrando como ORO', A.normalizarPlan('MASTER') === 'ORO');

  /* Y lo que importa no es el nombre sino el ACCESO: un token viejo en PRO
     tiene que seguir abriendo Scouting exactamente igual que antes. */
  check('un token viejo en PRO sigue abriendo Scouting',
    A.tieneModulo('scouting', ses('PRO')));
  check('uno en BASICO sigue sin abrirlo', !A.tieneModulo('scouting', ses('BASICO')));
  check('y uno en MASTER lo abre', A.tieneModulo('scouting', ses('MASTER')));

  /* LA JERARQUÍA, que es lo que el rename no podía romper. */
  check('BRONCE < PLATA < ORO',
    A.ORDEN_PLAN.BRONCE < A.ORDEN_PLAN.PLATA && A.ORDEN_PLAN.PLATA < A.ORDEN_PLAN.ORO);
  check('ORO hereda todo lo de PLATA',
    Object.keys(A.MODULOS).every(m => !A.tieneModulo(m, ses('PLATA')) || A.tieneModulo(m, ses('ORO'))));
  check('y PLATA todo lo de BRONCE',
    Object.keys(A.MODULOS).every(m => !A.tieneModulo(m, ses('BRONCE')) || A.tieneModulo(m, ses('PLATA'))));

  /* ORO NO APARECE EN `MODULOS`, y es a propósito: lo que agrega no es una
     pantalla sino una entrega que hace MotorStats cada cuatro partidos.
     Inventarle un módulo para que "se note" sería peor — un cliente
     pagando ORO y encontrando una sección vacía. */
  check('ningún módulo pide ORO',
    Object.keys(A.MODULOS).every(m => !A.MODULOS[m] || A.MODULOS[m].plan !== 'ORO'));
  check('y el hub explica qué incluye ORO en su lugar',
    /scouters de MotorStats/.test(require('./js/sgadd-hub.js').QUE_INCLUYE.ORO));

  /* Nada del sistema puede seguir hablando de los nombres viejos EN
     PANTALLA: los alias son para entender lo que entra, no para mostrarlo. */
  check('el nombre en pantalla es el nuevo',
    A.nombrePlan('PRO') === 'Plata' && A.nombrePlan('BASICO') === 'Bronce'
    && A.nombrePlan('MASTER') === 'Oro');

  /* EL CICLO DEL PLAN ORO, comparado contra el del servidor: es la misma
     regla escrita dos veces, y acá solo se pinta. */
  const HUBC = require('./js/sgadd-hub.js');
  const MC2 = require('./server/lib/catalogo-mutar.js');
  let dif = [];
  for (let pj = 0; pj <= 12; pj++) {
    [0, 2].forEach((desde) => [0, 1, 2].forEach((ent) => {
      const c = { cicloDesde: desde, informesEntregados: ent };
      if (JSON.stringify(HUBC.ciclo(c, pj)) !== JSON.stringify(MC2.ciclo(c, pj))) {
        dif.push('pj=' + pj + ' desde=' + desde + ' ent=' + ent);
      }
    }));
  }
  check('el ciclo de la UI coincide con el del servidor en 78 casos',
    dif.length === 0, dif.slice(0, 2).join(' | '));

  /* `4/4` Y NO `0/4` cuando se completó: el informe se debe DESPUÉS del
     cuarto partido, y un cartel en 0 se lee como "recién arranca". */
  check('al cuarto partido dice 4/4, no 0/4', HUBC.ciclo({}, 4).en === 4);
  check('y al quinto vuelve a 1/4', HUBC.ciclo({}, 5).en === 1);
  check('toca informe recién al completar el ciclo',
    !HUBC.ciclo({}, 3).toca && HUBC.ciclo({}, 4).toca);
  check('y deja de tocar cuando se marca entregado',
    !HUBC.ciclo({ informesEntregados: 1 }, 4).toca);

  /* MARCAR UN INFORME NO MUEVE EL ARRANQUE DEL CICLO: si lo corriera, un
     informe entregado tarde desplazaría todos los siguientes y el cliente
     recibiría menos de los que pagó. */
  const traz = MC2.informe({ x: { nombre: 'X', categorias: {} } }, { club: 'x' });
  check('marcar entregado no toca cicloDesde',
    traz.ok && traz.catalogo.x.cicloDesde === undefined && traz.catalogo.x.informesEntregados === 1);
}

titulo('LA SESIÓN DESPUÉS DEL LOGIN · los tres síntomas eran uno solo');

/* MEDIDO EN PRODUCCIÓN: el admin entraba bien —el pie decía
   ADMINISTRADOR con su mail— y el panel seguía diciendo "hace falta un
   link de acceso para ver esta categoría", y la pestaña Clientes decía
   que no tenía el catálogo a mano.

   No eran tres bugs: era uno. El panel arranca SIN token, `origen()` da
   `ninguno`, la carga falla y ese fallo queda cacheado y en pantalla.
   Poner el token después no reintenta nada.

   Y NO ERA UN GATE DEL SERVIDOR: el bypass de admin ya estaba —
   `sinRestricciones()` saltea el chequeo de club— así que "darle acceso
   al admin" no requería tocar ningún permiso. */
{
  const LG = require('./js/sgadd-login.js');
  const lg = fs.readFileSync('./js/sgadd-login.js', 'utf8');
  const cli = fs.readFileSync('./js/sgadd-clientes.js', 'utf8');
  const hs = fs.readFileSync('./server/api/handlers.js', 'utf8');

  /* 1 · ENTRAR TIENE QUE VOLVER A BAJAR LOS DATOS. */
  check('al entrar se limpian los dos cachés de datos',
    /SGADD_DATA\.limpiarCache\(\)/.test(lg) && /SGADD\.limpiarCache\(\)/.test(lg));
  check('y se recarga la categoría FORZANDO',
    /SGADD_APP\.cargar\(true\)/.test(lg));
  /* La capa vieja de Principal no pasa por `SGADD_APP`, así que si no se
     la refresca aparte el resumen general queda con el error del arranque. */
  check('y también la capa vieja de Principal',
    /refreshData\(\)/.test(lg));

  /* 2 · EL BYPASS DE ADMIN YA EXISTÍA EN EL SERVIDOR. Se fija para que no
     se lo saque creyendo que hace falta agregarlo. */
  check('un admin saltea el chequeo de club en el servidor',
    /!AUTH\.sinRestricciones\(ctx\.sesion\) && ctx\.tokenClub/.test(hs));
  check('y el guard de suscripción también lo deja pasar',
    /ctx\.rol === AUTH\.ROLES\.ADMIN\) return null/.test(hs));

  /* 3 · EL HUB SE REPINTA CUANDO LLEGA EL CATÁLOGO. Es asíncrono y la
     pestaña ya se pintó, así que sin esto había que ir a otra solapa y
     volver para verlo. */
  check('al llegar el catálogo se repinta el hub si está abierto',
    /getElementById\('hubClientes'\)[\s\S]{0,160}SGADD_HUB\.html\(\)/.test(cli));
  check('y se puede volver a pedir tras un login', /forzar/.test(cli));

  /* 4 · CERRAR SESIÓN. Antes no había ninguno: la única forma de salir era
     vaciar el storage a mano desde la consola, que no es una salida. */
  const idx2 = fs.readFileSync('./index.html', 'utf8');
  check('con sesión abierta el botón dice Cerrar sesión',
    /haySesion[\s\S]{0,260}Cerrar sesión/.test(idx2));
  check('y sin sesión dice Ingresar', /boton-ingreso">Ingresar/.test(idx2));
  check('salir limpia el token y la sesión',
    /limpiarToken\(\)[\s\S]{0,120}limpiarSesion\(\)/.test(lg));
  /* Se recarga en vez de repintar: al salir hay que soltar el índice y los
     cachés de las dos capas, y ese camino ya existe y está probado. */
  check('y recarga en vez de intentar repintar', /window\.location\.href = u\.toString\(\)/.test(lg));
  /* SALIR LIMPIA TODO LO DE `sgadd.*`, no solo el token: los estados de
     jugador, el override de config y el caché quedan bajo ese prefijo, y
     dejarlos deja el trabajo de un club en la máquina del siguiente. Se
     borra por prefijo porque la lista crece y la que se olvida es siempre
     la que se agregó después. */
  check('salir limpia todas las claves sgadd.*',
    /indexOf\('sgadd\.'\) === 0[\s\S]{0,80}removeItem/.test(lg));
  /* Y SE VA A LA RAÍZ, sin `?club=`: con el club puesto, salir volvía a
     cargar los datos de ese cliente. */
  check('y sale a la raíz, sin club',
    /u\.search = '';[\s\S]{0,60}u\.hash = '';/.test(lg));

  /* 5 · DÓNDE VIVE EL TOKEN, que era la causa de tener que re-loguearse en
     cada pestaña nueva. */
  const jwt = (payload) => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return b64({ alg: 'HS256' }) + '.' + b64(payload) + '.firma';
  };
  check('un token de admin se reconoce como persistente',
    A.esTokenDeAdmin(jwt({ email: 'freytesgn@gmail.com' })));
  /* SE RE-DERIVA CONTRA `ADMINS`: el token dice quién es, no qué es. Un
     payload que se declare admin sin estar en la lista no persiste — y
     tampoco entra, porque el servidor lo rechaza igual. */
  check('uno de un cliente NO',
    !A.esTokenDeAdmin(jwt({ email: 'dt@club.com' })));
  check('y un token roto tampoco',
    !A.esTokenDeAdmin('no-es-un-jwt') && !A.esTokenDeAdmin('') && !A.esTokenDeAdmin(null));

  const auth = fs.readFileSync('./js/sgadd-auth.js', 'utf8');
  /* Cerrar sesión tiene que limpiar LOS DOS almacenes: si solo se limpiara
     uno, la credencial quedaría viva en el otro y la pestaña siguiente
     volvería a entrar sola. */
  check('borrar el token limpia localStorage y sessionStorage',
    /localStorage\.removeItem\(CLAVE_TOKEN\)[\s\S]{0,200}sessionStorage\.removeItem\(CLAVE_TOKEN\)/.test(auth));
  /* EL TOKEN SE PERSISTE AL PONERLO. Hasta el login el único camino que
     ponía uno era el `?access_token=` de la URL, que llamaba a
     `guardarToken()` aparte; al entrar con clave se llamaba a
     `establecerToken()` directo, el token quedaba en memoria y la primera
     recarga lo perdía. Medido en producción: después de entrar, los dos
     storages estaban vacíos y todo lo demás funcionaba. */
  check('establecerToken persiste el token',
    /tokenActual = jwt;[\s\S]{0,900}guardarToken\(jwt\);/.test(auth));

  check('y al leer se miran los dos',
    /localStorage[\s\S]{0,200}sessionStorage/.test(auth.slice(auth.indexOf('function leerTokenGuardado'))));
}

titulo('LA LANDING NEUTRA · lo que ve quien entra sin club');

{
  const LAN = require('./js/sgadd-landing.js');
  const lan = fs.readFileSync('./js/sgadd-landing.js', 'utf8');
  const club = fs.readFileSync('./js/sgadd-club.js', 'utf8');
  const idx3 = fs.readFileSync('./index.html', 'utf8');

  /* SE DECIDE POR LA AUSENCIA DE `?club=`, no por si hay sesión: un admin
     logueado que entra a la URL limpia también ve la landing, porque
     todavía no eligió cliente. */
  check('sin ?club= es landing', LAN.activa(''));
  check('con ?club= no', !LAN.activa('?club=deportivo'));
  check('otros parámetros no la desactivan', LAN.activa('?api=x&cb=1'));

  /* LA DECISIÓN VIVE EN `CLUB`, y esto es por el ORDEN DE CARGA:
     `sgadd-club.js` va PRIMERO y se auto-arranca, así que cuando
     `aplicarUI` necesita saberlo `SGADD_LANDING` todavía no existe. Con la
     pregunta en el otro módulo, `enLanding` daba siempre false y la marca
     del club por defecto se pintaba igual — medido en el navegador. */
  check('CLUB expone esLanding()', /function esLanding\(\)/.test(club));
  check('y la landing delega en él', /CLUB\.esLanding\(\)/.test(lan));

  /* NO SE PINTA LA MARCA DE NINGÚN CLUB, pero SÍ el tema: sin los colores
     la landing sale en gris. Las dos cosas viven en `aplicarUI` y por eso
     se condiciona el bloque de marca y no la función entera. */
  check('el nombre del club no se pinta en la landing',
    /if \(c\.nombre && !enLanding\)/.test(club));
  check('la bajada tampoco', /if \(c\.bajada && !enLanding\)/.test(club));
  check('ni el escudo', /if \(esLanding\(\)\) return;/.test(club));

  /* Y `ponerEscudo` PREGUNTA DE NUEVO en vez de heredar la variable de
     `aplicarUI`: a esa función también la llama `marcarRender`, donde
     `enLanding` no existe. Cuando lo hacía, el ReferenceError reventaba
     `aplicar()` entero y el club se quedaba SIN CATÁLOGO — la sección
     clavada en "Cargando la categoría…" para siempre, sin que el síntoma
     nombrara a la landing por ningún lado.

     Se mira el CUERPO de la función, no el archivo: en `aplicarUI` la
     variable sí existe y ahí usarla es correcto. */
  {
    const desde = club.indexOf('function ponerEscudo');
    const cuerpo = club.slice(desde).split(/\n  function /)[0];
    check('ponerEscudo no hereda una variable que no es suya',
      desde !== -1 && !/[^.\w]enLanding[^\w]/.test(cuerpo.replace(/\/\*[\s\S]*?\*\//g, '')));
  }

  /* El tema queda: se aplica ANTES del corte. */
  check('pero el acento sí se aplica',
    club.indexOf("setProperty('--acento'") < club.indexOf('if (esLanding()) return;'));

  /* NO SE PIDEN DATOS. Sin club no hay libro que bajar, y el intento
     terminaba en la pantalla llena de carteles rojos que la landing vino a
     reemplazar. */
  check('el arranque no baja datos en la landing',
    /const errors = enLanding \? \[\] : await fetchAllData\(\)/.test(idx3));
  check('ni arma el índice para el buzón',
    /SGADD_APP !== 'undefined' && !enLanding/.test(idx3));
  /* Y hay DOS secuencias de arranque —`init` y `refreshData`— así que las
     dos tienen que estar cubiertas: editar una sola fue el error que dejó
     el cartel de "1 hoja con errores" arriba de la bienvenida. */
  check('las dos secuencias de arranque lo respetan',
    (idx3.match(/enLanding \? \[\] : await fetchAllData\(\)/g) || []).length === 2,
    String((idx3.match(/enLanding \? \[\] : await fetchAllData\(\)/g) || []).length));

  /* CADA SECCIÓN EXPLICA QUÉ SE VE AHÍ. Las cinco públicas, ni una más:
     las internas no se listan porque desde la landing no se llega. */
  /* CADA SECCION LISTADA TIENE SU EXPLICACION. Se comprueba la
     correspondencia y no un numero fijo: al sumar el Glosario, `ORDEN`
     quedo con una seccion que `SECCIONES` no definia y la landing pintaba
     una card vacia — un largo hardcodeado no lo habria cazado, solo habria
     obligado a cambiarlo. */
  check('hay una explicación por sección listada',
    LAN.ORDEN.length > 0 && LAN.ORDEN.every(k => !!LAN.SECCIONES[k]),
    LAN.ORDEN.filter(k => !LAN.SECCIONES[k]).join(',') || 'todas');
  check('y no sobra ninguna definición sin listar',
    Object.keys(LAN.SECCIONES).every(k => LAN.ORDEN.indexOf(k) !== -1),
    Object.keys(LAN.SECCIONES).filter(k => LAN.ORDEN.indexOf(k) === -1).join(','));
  check('y ninguna es una sección interna',
    !LAN.ORDEN.some(k => ['simulador', 'configuracion', 'diagnostico'].indexOf(k) !== -1));
  check('cada una dice qué es y qué trae',
    LAN.ORDEN.every(k => LAN.SECCIONES[k].que && LAN.SECCIONES[k].detalle
      && LAN.SECCIONES[k].items.length));

  /* SE USA LA VERSIÓN CHICA DEL LOGO. El original pesa 1,3 MB y acá se
     muestra a 72 px: cargarlo entero desharía el trabajo del arranque. */
  check('la landing usa el logo procesado, no el original',
    /motorlogo-\d+\.png/.test(lan) && !/motorlogo\.PNG/.test(lan));
  check('y el archivo existe', fs.existsSync('./logos/motorlogo-64.png')
    && fs.existsSync('./logos/motorlogo-128.png'));
  /* El tamaño es la razón de ser del generador: si alguien commitea el
     original con otro nombre, esto lo caza. */
  check('el logo chico pesa menos de 40 KB',
    fs.statSync('./logos/motorlogo-128.png').size < 40 * 1024,
    Math.round(fs.statSync('./logos/motorlogo-128.png').size / 1024) + ' KB');
}


titulo('LAS TRES SECCIONES INTERNAS · ocultas hasta que entre un ADMIN');

/* `sinRestricciones` es `rol !== CLIENTE`, así que un visitante SIN sesión
   —el rol ABIERTO— pasaba por ese `return true` y veía Simulador, Panel
   Master y Diagnóstico en el menú. Eran las tres herramientas internas
   ofrecidas a cualquiera que abriera la URL. */
{
  const internas = ['simulador', 'configuracion', 'diagnostico'];
  const publicas = ['principal', 'equipos', 'jugadores', 'clasificacion', 'scouting'];
  const admin = { email: 'freytesgn@gmail.com', plan: 'ORO' };
  const cliente = { email: 'dt@club.com', plan: 'PLATA', equipoAsignado: 'X' };

  check('un visitante sin sesión NO ve las internas',
    internas.every(m => !A.puedoAcceder(m, undefined).ok));
  check('un cliente tampoco',
    internas.every(m => !A.puedoAcceder(m, cliente).ok));
  check('un admin sí', internas.every(m => A.puedoAcceder(m, admin).ok));

  /* Y EL MOTIVO ES SOLO_ADMIN, no REQUIERE_PLAN: el nav muestra las de
     plan justamente para que el cliente sepa que existen, así que si estas
     devolvieran ese motivo volverían a aparecer. */
  check('el motivo es SOLO_ADMIN, que es el que el nav esconde',
    internas.every(m => A.puedoAcceder(m, undefined).motivo === A.MOTIVOS.SOLO_ADMIN));

  /* LO DEMÁS NO CAMBIA: ABIERTO sigue viendo las cinco públicas, que es lo
     que mantiene funcionando a quien entra sin token. */
  check('un visitante sigue viendo las cinco públicas',
    publicas.every(m => A.puedoAcceder(m, undefined).ok));
  check('y tieneModulo dice lo mismo que puedoAcceder',
    internas.every(m => !A.tieneModulo(m, undefined) && A.tieneModulo(m, admin)));
}


titulo('EL PIE INSTITUCIONAL · la misma firma en pantalla y en papel');

{
  const U = require('./js/sgadd-ui.js');
  const pie = U.pieInforme('31/08/2026');
  const web = U.pieWeb('31/08/2026');

  check('lleva el logo', /motorlogo-\d+\.png/.test(pie));
  check('la marca y la fecha', /MotorStats/.test(pie) && /31\/08\/2026/.test(pie));
  check('el mail', pie.indexOf(U.MAIL) !== -1);
  check('el usuario de Instagram', pie.indexOf(U.ARROBA) !== -1);
  check('y su icono', /<svg[^>]*pie-ig/.test(pie));

  /* EL DE PANTALLA LLEVA LOS ENLACES VIVOS; el de papel no, porque en un
     PDF un `mailto:` no se puede tocar y el subrayado solo ensucia. */
  check('la versión web enlaza el mail', /href="mailto:/.test(web));
  check('y el perfil', /href="https:\/\/www\.instagram\.com/.test(web));
  check('la de papel NO enlaza nada', !/<a /.test(pie));

  /* MISMO TEXTO EN LAS DOS: quien mira la pantalla y quien recibe el
     informe tienen que leer la misma firma. */
  const pelar = (h) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  check('el texto es idéntico en pantalla y en papel',
    pelar(pie) === pelar(web), pelar(pie) + '  ||  ' + pelar(web));

  /* SE USA LA VERSIÓN DE 64 px: el original pesa 1,3 MB y acá se muestra a
     14. Cargarlo entero en cada informe es el error que el generador
     existe para evitar. */
  check('el pie no carga el logo original', !/motorlogo\.PNG/.test(pie + web));
}

titulo('EL GLOSARIO · las definiciones salen del manual del motor');

{
  const GL = require('./js/sgadd-glosario.js');
  const GUI = require('./js/sgadd-glosarioui.js');
  const NUC = require('./js/sgadd-core.js');

  /* LA COBERTURA ES LO QUE HACE UTIL AL TOOLTIP. Con la mitad de las
     metricas sin definicion, pasar el mouse se vuelve una loteria y el DT
     deja de intentarlo. */
  const metricas = Object.keys(NUC.METRICAS || {});
  const sin = metricas.filter(k => !GL.buscar(k));
  check('todas las métricas del panel tienen definición',
    sin.length === 0, sin.join(', '));
  check('y son unas cuantas', metricas.length > 40, String(metricas.length));

  /* LA BUSQUEDA POR SIGLA NO DISTINGUE MAYUSCULAS: el panel escribe
     `eFG%` y el manual puede escribir `EFG%`. Sin normalizar, la mitad de
     los tooltips no abriria. */
  check('la sigla se busca sin distinguir mayúsculas',
    !!GL.buscar('efg%') && !!GL.buscar('EFG%') && !!GL.buscar(' eFG% '));
  check('una sigla que no existe devuelve null',
    GL.buscar('NOEXISTE') === null && GL.buscar('') === null && GL.buscar(null) === null);

  /* LA DEFINICION CORTA PREFIERE `lectura` SOBRE `nombre`: el nombre
     completo de eFG% es "Efectividad de tiro ajustada", que no le dice
     nada a quien no lo sabe ya. En un tooltip sirve qué significa el
     número. */
  const corta = GL.corta('eFG%');
  check('la definición corta dice cómo se lee el número',
    !!corta && corta.length > 15, corta);
  check('y existe para todas', metricas.every(k => !!GL.corta(k)));

  /* LA BUSQUEDA POR TEXTO IGNORA ACENTOS: nadie escribe "posesión" con
     tilde en un buscador. */
  check('buscar sin acento encuentra igual',
    GL.filtrar('posesion').length > 0 && GL.filtrar('rebote').length > 0);
  check('sin término devuelve todo', GL.filtrar('').length === GL.ENTRADAS.length);
  check('un término imposible devuelve vacío', GL.filtrar('zzzzqqq').length === 0);

  /* EL ARCHIVO ES GENERADO Y LO DICE. Editarlo a mano se pierde en la
     próxima corrida, así que la advertencia va arriba de todo. */
  const gen = fs.readFileSync('./js/sgadd-glosario.js', 'utf8');
  check('el archivo avisa que es generado', /GENERADO, no editar a mano/.test(gen));
  check('y dice con qué se regenera', /generar-glosario\.js/.test(gen));

  /* ================= EL TOOLTIP ================= */

  const ui = fs.readFileSync('./js/sgadd-glosarioui.js', 'utf8');

  /* SE ENGANCHA UNA VEZ, POR DELEGACION. Las tablas se repintan enteras en
     cada cambio de tramo: con un listener por celda habría cientos y cada
     repintado dejaría los viejos colgados. */
  check('el tooltip usa delegación en el document',
    /document\.addEventListener\('mouseover'/.test(ui));
  check('y no engancha por celda',
    !/querySelectorAll[\s\S]{0,80}addEventListener/.test(ui));
  check('es idempotente', /if \(enganchado/.test(ui));

  /* CON TECLADO TAMBIEN. Un tooltip que solo responde al mouse deja afuera
     a quien navega tabulando (punto 14). */
  check('responde al foco, no solo al mouse',
    /addEventListener\('focusin'/.test(ui));
  check('y se cierra con ESC', /key === 'Escape'/.test(ui));

  /* EL TEXTO SUELTO SOLO SE ACEPTA SI COINCIDE EXACTO con una sigla: sin
     eso, cualquier celda que dijera "PTS" —el apodo de un jugador, una
     nota— abriría un tooltip donde no corresponde. */
  check('una sigla exacta se reconoce',
    GUI.siglaDe({ getAttribute: () => null, textContent: 'eFG%' }) === 'eFG%');
  check('un texto cualquiera NO',
    GUI.siglaDe({ getAttribute: () => null, textContent: 'Juan Pérez' }) === null);
  check('y un texto largo tampoco',
    GUI.siglaDe({ getAttribute: () => null,
      textContent: 'una frase larga que contiene PTS adentro' }) === null);
  /* `data-metrica` gana sobre el texto: es la forma de marcar una celda
     cuyo texto no es la sigla. */
  check('data-metrica manda sobre el texto',
    GUI.siglaDe({ getAttribute: (a) => a === 'data-metrica' ? 'PACE' : null,
      textContent: 'Ritmo' }) === 'PACE');

  /* EN PAPEL NO HAY HOVER: un tooltip impreso sería un recuadro suelto en
     el medio de la hoja. */
  const idx4 = fs.readFileSync('./index.html', 'utf8');
  check('el tooltip no se imprime',
    /@media print \{ \.glosario-tip \{ display: none/.test(idx4));

  /* ================= LA SECCION ================= */

  /* ES PUBLICA: son definiciones, no números de un club. Un DT que quiere
     saber qué mide eFG% no debería necesitar un link. */
  check('el glosario es público', A.puedoAcceder('glosario', null).ok);
  check('y también para un cliente',
    A.puedoAcceder('glosario', { email: 'dt@club.com', plan: 'BRONCE', equipoAsignado: 'X' }).ok);
  /* HAY DOS LISTAS DE SECCIONES y tienen que coincidir: `SGADD.SECCIONES`,
     que el ruteo usa para distinguir el formato viejo del nuevo, y
     `VALID_SECTIONS` del index, que valida lo que llega por el hash. Al
     sumar el Glosario quedó en una sola y el ítem del menú no navegaba: el
     `navigate()` lo mandaba de vuelta a Principal sin decir nada. */
  const validas = (idx4.match(/const VALID_SECTIONS = \[([^\]]*)\]/) || [])[1] || '';
  check('las dos listas de secciones coinciden',
    NUC.SECCIONES.every(x => validas.indexOf("'" + x + "'") !== -1),
    NUC.SECCIONES.filter(x => validas.indexOf("'" + x + "'") === -1).join(','));

  /* Y EN LA LANDING SE MUESTRA ENTERO, no como vista previa: es la única
     sección que no depende de los datos de un club. */
  const lan2 = fs.readFileSync('./js/sgadd-landing.js', 'utf8');
  check('en la landing el glosario se muestra completo',
    /seccion === 'glosario'[\s\S]{0,120}SGADD_GLOSARIOUI\.html\(\)/.test(lan2));

  check('está en el vocabulario de secciones',
    NUC.SECCIONES.indexOf('glosario') !== -1);

  /* TIPEAR NO REPINTA LA SECCION: le sacaría el foco al buscador. Misma
     regla que el buzón y los campos de scouting. */
  check('tipear refresca solo la tabla',
    /getElementById\('glosarioCuerpo'\)/.test(ui));

  /* LAS CABECERAS ORDENABLES SE MARCAN CON `data-metrica`, no se dejan al
     reconocimiento por texto: la flecha de orden (⇅ / ▲ / ▼) vive DENTRO
     del `th`, así que su `textContent` deja de coincidir con la sigla y el
     tooltip no abre. Medido en producción: ninguna cabecera del ranking era
     reconocible por texto.

     Y todas las columnas rankeables tienen definición, o el subrayado
     punteado prometería un tooltip que no aparece. */
  {
    const JG = require('./js/sgadd-jugadores.js');
    const RK = require('./js/sgadd-rankings.js');
    const srcJ2 = fs.readFileSync('./js/sgadd-jugadores.js', 'utf8');
    const srcR2 = fs.readFileSync('./js/sgadd-rankings.js', 'utf8');

    check('la cabecera del ranking de jugadores lleva data-metrica',
      /<th data-metrica=/.test(srcJ2));
    check('y la del de equipos también', /<th data-metrica=/.test(srcR2));

    const cols = new Set();
    JG.JUGADORES_RANKINGS.forEach(g => g.cols.forEach(c => cols.add(c)));
    (RK.GRUPOS || []).forEach(g => (g.cols || []).forEach(c => cols.add(typeof c === 'string' ? c : (c.k || c.id))));
    const sinDef = [...cols].filter(c => c && !GL.buscar(c));
    check('todas las columnas rankeables tienen definición',
      cols.size > 25 && sinDef.length === 0, sinDef.join(', '));
  }

  /* EMPTY STATE CON SALIDA, no un contenedor vacío (punto 14). */
  check('sin resultados ofrece volver a la lista',
    /Sin resultados[\s\S]{0,400}Ver los/.test(ui));
}

console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
  '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
