/* =====================================================================
   SIMILITUD MULTI-ETIQUETA · contra quién es justo comparar a un jugador

   Lo que fija este archivo:

     · que la taxonomía del motor es LA DEL DOCUMENTO: se parsea
       AUDITORIA_ETIQUETAS_JUGADORES.md (sección I) y se exige que las tres
       listas de etiquetas coincidan con los catálogos que etiquetan;
     · el puntaje: función en cancha 50 %, perfiles técnicos 30 %, ADN
       (jerarquía) 20 %, con un filtro de volumen ANTES y un piso de 60 %;
     · el CASO DE CONTROL del club (2026-09-12): Raineri y Benavidez
       comparten «⭐ Jugador Franquicia» y juegan de forma opuesta, así que
       el match tiene que dar BAJO;
     · y que el grupo de pares ya no los junta.

   LA FIXTURE DEL CASO DE CONTROL SON SUS ETIQUETAS, NO SUS NÚMEROS. Se
   armó con lo que el club declaró y se midió igual en el libro U23 real
   el mismo día (40 %, volumen comparable). Si mañana alguno de los dos
   cambia de rendimiento, este test no miente: prueba lo que el motor
   hace con ESAS etiquetas, que es la pregunta.
   ===================================================================== */
const fs = require('fs');
global.SGADD = require('./js/sgadd-core.js');
const J = require('./js/sgadd-jugadores.js');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));
const cerca = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-9;

/* =====================================================================
   1. LA TAXONOMÍA SALE DEL DOCUMENTO
   ===================================================================== */
titulo('1. LAS ETIQUETAS SON LAS DE AUDITORIA_ETIQUETAS_JUGADORES.md');

const DOC = fs.readFileSync('./AUDITORIA_ETIQUETAS_JUGADORES.md', 'utf8');

/** El cuerpo de una sección `### I.n`, hasta la siguiente de su nivel. */
function seccion(marca) {
  const i = DOC.indexOf('### ' + marca);
  if (i < 0) return '';
  const j = DOC.indexOf('\n### ', i + 5);
  return DOC.slice(i, j < 0 ? undefined : j);
}
/** Los `id` de las tablas de una sección: la celda entre backticks que
    sigue a la etiqueta. Se lee por columna y no por posición de fila,
    así que agregar una columna al documento no rompe el parseo. */
function idsDeTabla(texto) {
  const lineas = texto.split(/\r?\n/).filter(l => /^\|/.test(l));
  const cab = lineas.find(l => /\|\s*`id`\s*\|/.test(l));
  if (!cab) return [];
  const col = cab.split('|').map(c => c.trim()).indexOf('`id`');
  return lineas.slice(lineas.indexOf(cab) + 2)
    .map(l => (l.split('|')[col] || '').trim())
    .filter(c => /^`[^`]+`$/.test(c)).map(c => c.slice(1, -1));
}

const docMinutos = idsDeTabla(seccion('I.1'));
const docJerarquia = idsDeTabla(seccion('I.2'));
const docPerfiles = idsDeTabla(seccion('I.3'));
const docFuncion = idsDeTabla(seccion('I.4'));
const ids = (l) => l.map(x => x.id);
const mismos = (a, b) => a.length === b.length && a.slice().sort().join() === b.slice().sort().join();

check('el documento existe y trae la sección I', /## I\. Glosario de clasificación ofensiva/.test(DOC));
check('I.1 · banda de minutos: las del documento son las del motor',
  docMinutos.length > 0 && mismos(docMinutos, ids(J.ROLES_MINUTOS)), docMinutos.join(',') + ' vs ' + ids(J.ROLES_MINUTOS).join(','));
check('I.2 · ADN (jerarquía): las del documento son las del motor',
  docJerarquia.length > 0 && mismos(docJerarquia, ids(J.JERARQUIA)), docJerarquia.join(','));
check('I.3 · perfiles técnicos: los del documento son los del motor',
  docPerfiles.length > 0 && mismos(docPerfiles, ids(J.PERFILES_TECNICOS)), docPerfiles.join(','));
check('I.4 · función en cancha: las del documento son las del motor',
  docFuncion.length > 0 && mismos(docFuncion, ids(J.JUGADORES_ROLES_FUNCIONALES)), docFuncion.join(','));
/* La jerarquía es una CASCADA y la cercanía de dos escalones se mide por
   su posición: si el documento y el motor la ordenaran distinto, el
   puntaje de ADN diría otra cosa que la auditoría. */
check('I.2 · y en el MISMO orden de cascada, que es lo que mide la cercanía',
  docJerarquia.join() === ids(J.JERARQUIA).join(), docJerarquia.join());
check('los tres ejes del puntaje son las tres preguntas del documento',
  /I\.2 · Jerarquía en el plantel/.test(DOC) && /I\.3 · Arquetipos técnicos/.test(DOC)
  && /I\.4 · Rol funcional/.test(DOC));

/* El motor LEE los catálogos, no una copia: con una lista propia, el día
   que entre una etiqueta nueva la similitud la ignoraría en silencio. */
const FUENTE = fs.readFileSync('./js/sgadd-jugadores.js', 'utf8');
const cuerpo = (nombre) => {
  const i = FUENTE.indexOf('function ' + nombre + '(');
  return i < 0 ? '' : FUENTE.slice(i, FUENTE.indexOf('\n}', i));
};
check('la cercanía de jerarquía sale de JERARQUIA, no de una lista escrita a mano',
  /JERARQUIA\.map/.test(cuerpo('jugadoresSimilitudAdn'))
  && !/'franquicia'|'referente'|'especialista'/.test(cuerpo('jugadoresSimilitudAdn')));
check('ni la función ni los perfiles nombran una etiqueta a mano',
  !/'(generador-primario|spacing|slasher|generador|amenaza)'/.test(
    cuerpo('jugadoresSimilitudFuncion') + cuerpo('jugadoresSimilitudPerfiles')));

/* =====================================================================
   2. LOS PESOS Y EL PISO
   ===================================================================== */
titulo('2. EL PUNTAJE · pesos, piso y tolerancias de volumen');

const S = J.SIMILITUD;
check('los pesos suman 100 %', cerca(S.pesos.funcion + S.pesos.perfiles + S.pesos.adn, 1));
check('la función en cancha pesa más que los perfiles, y los perfiles más que el ADN',
  S.pesos.funcion > S.pesos.perfiles && S.pesos.perfiles > S.pesos.adn);
check('el piso de afinidad es 60 %', cerca(S.piso, 0.60));
check('el filtro de volumen: 5 minutos y 6 puntos de USG%', S.tolMinutos === 5 && cerca(S.tolUsg, 0.06));

/* Un ADN armado con los catálogos de verdad: el label y el eje salen de
   ahí, así que la fixture no puede nombrar un rol que no existe. */
const porId = (lista, id) => {
  const x = lista.find(e => e.id === id);
  if (!x) throw new Error('etiqueta inexistente en el catálogo: ' + id);
  return x;
};
function adn(o) {
  const rol = porId(J.JUGADORES_ROLES_FUNCIONALES, o.funcion);
  return {
    nombre: o.nombre,
    perfil: { min: o.min, usg: o.usg, esPerimetral: o.origen === 'perimetral', esInterior: o.origen === 'interior' },
    rolMinutos: J.jugadoresRolMinutos(o.min),
    jerarquia: porId(J.JERARQUIA, o.jerarquia),
    arquetipos: (o.perfiles || []).map(id => porId(J.PERFILES_TECNICOS, id)),
    rolFuncional: { id: rol.id, eje: rol.eje || null, label: rol.label,
      secundarios: (o.secundarios || []).map(id => {
        const s2 = porId(J.JUGADORES_ROLES_FUNCIONALES, id);
        return { id: s2.id, eje: s2.eje || null, label: s2.label };
      }) },
  };
}

/* =====================================================================
   3. EL CASO DE CONTROL · RAINERI vs BENAVIDEZ
   ===================================================================== */
titulo('3. CASO DE CONTROL · mismo ADN, funciones opuestas');

const RAINERI = adn({
  nombre: 'RAINERI, TADEO', min: 28.9, usg: 0.209, origen: 'perimetral',
  jerarquia: 'franquicia',
  perfiles: ['generador', 'especialistaDef', 'buscadorContacto'],
  funcion: 'generador-primario', secundarios: ['slasher'],
});
const BENAVIDEZ = adn({
  nombre: 'BENAVIDEZ, JULIAN', min: 28.4, usg: 0.217, origen: 'perimetral',
  jerarquia: 'franquicia',
  perfiles: ['generador', 'amenaza'],
  funcion: 'spacing',
});

check('los dos son ⭐ Jugador Franquicia', RAINERI.jerarquia.label === 'Jugador Franquicia'
  && BENAVIDEZ.jerarquia.id === RAINERI.jerarquia.id);
check('y los dos son Jugador Clave por minutos', RAINERI.rolMinutos.id === 'clave' && BENAVIDEZ.rolMinutos.id === 'clave');

const control = J.jugadoresSimilitud(RAINERI, BENAVIDEZ);
check('EL VOLUMEN ES COMPARABLE: la separación no la hace el filtro sino las etiquetas',
  control.volumen.ok, JSON.stringify(control.volumen));
check('el ADN coincide del todo (100 %)', cerca(control.adn, 1));
check('los perfiles técnicos comparten solo «Generador» de cuatro distintos (25 %)',
  cerca(control.perfiles, 0.25), control.perfiles);
check('la función en cancha NO coincide: penetrador con contacto contra tirador de descarga',
  control.funcion <= 0.25, control.funcion);
check('el match total es BAJO: 40 %', control.porcentaje === 40, control.porcentaje);
check('por debajo del piso de 60 %: no son afines', control.afin === false && control.total < S.piso);
check('la similitud es simétrica',
  J.jugadoresSimilitud(BENAVIDEZ, RAINERI).porcentaje === control.porcentaje);

/* Lo que el caso NO es: con el escalón viejo (banda + jerarquía) eran
   pares. Se fija para que nadie lo reponga creyendo que es equivalente. */
check('con el criterio viejo —misma banda y misma jerarquía— habrían sido pares',
  RAINERI.rolMinutos.id === BENAVIDEZ.rolMinutos.id && RAINERI.jerarquia.id === BENAVIDEZ.jerarquia.id);

/* =====================================================================
   4. LOS ESCALONES DE CADA EJE
   ===================================================================== */
titulo('4. CADA EJE, POR SEPARADO');

check('un jugador consigo mismo da 100 %', J.jugadoresSimilitud(RAINERI, RAINERI).porcentaje === 100);

const GEMELO = adn({ nombre: 'GEMELO, FUNCIONAL', min: 27, usg: 0.22, origen: 'perimetral',
  jerarquia: 'referente', perfiles: ['generador', 'buscadorContacto'],
  funcion: 'generador-primario', secundarios: ['slasher'] });
const gem = J.jugadoresSimilitud(RAINERI, GEMELO);
check('misma función, jerarquía de al lado y perfiles parecidos: afines',
  gem.afin && cerca(gem.funcion, 1) && cerca(gem.adn, 0.5), JSON.stringify(gem));

const PENETRA = adn({ nombre: 'SLASHER, PURO', min: 29, usg: 0.21, origen: 'perimetral',
  jerarquia: 'franquicia', perfiles: ['generador'], funcion: 'slasher' });
check('el rol de uno es la faceta SECUNDARIA del otro: 60 % del eje',
  cerca(J.jugadoresSimilitudFuncion(RAINERI, PENETRA), 0.6));
const MANEJA = adn({ nombre: 'MANEJA, SEGUNDO', min: 27, usg: 0.2, origen: 'perimetral',
  jerarquia: 'franquicia', perfiles: [], funcion: 'manejador-secundario' });
check('mismo eje (los dos crean) sin ser el mismo rol: 50 %',
  cerca(J.jugadoresSimilitudFuncion(RAINERI, MANEJA), 0.5));
const POSTE = adn({ nombre: 'POSTE, BAJO', min: 28, usg: 0.21, origen: 'interior',
  jerarquia: 'franquicia', perfiles: ['puntal'], funcion: 'ancla-defensiva' });
check('uno adentro y otro afuera, sin nada en común en la función: 0',
  J.jugadoresSimilitudFuncion(RAINERI, POSTE) === 0);

const SIN = adn({ nombre: 'SIN, PERFIL', min: 12, usg: 0.15, origen: 'perimetral',
  jerarquia: 'especialista', perfiles: [], funcion: 'perimetral-media' });
const SIN2 = adn({ nombre: 'SIN, PERFIL DOS', min: 11, usg: 0.16, origen: 'perimetral',
  jerarquia: 'especialista', perfiles: [], funcion: 'perimetral-media' });
check('dos sin ningún perfil técnico coinciden en eso (100 %)',
  cerca(J.jugadoresSimilitudPerfiles(SIN, SIN2), 1));
check('uno con perfil y otro sin ninguno no comparten nada (0 %)',
  J.jugadoresSimilitudPerfiles(SIN, RAINERI) === 0);
check('jerarquías a dos escalones: 0', J.jugadoresSimilitudAdn(RAINERI, SIN) === 0);

/* =====================================================================
   5. EL FILTRO DE VOLUMEN VA PRIMERO
   ===================================================================== */
titulo('5. VOLUMEN · minutos y USG% comparables antes que las etiquetas');

const CLON = (o) => adn(Object.assign({ nombre: 'CLON', origen: 'perimetral', jerarquia: 'franquicia',
  perfiles: ['generador', 'amenaza'], funcion: 'spacing' }, o));
const lejos = J.jugadoresSimilitud(BENAVIDEZ, CLON({ min: 18, usg: 0.217 }));
check('etiquetas idénticas pero 10 minutos menos y otra banda: NO son afines',
  lejos.porcentaje === 100 && !lejos.volumen.minutos && !lejos.afin, JSON.stringify(lejos.volumen));
const borde = J.jugadoresVolumenComparable(
  adn({ nombre: 'A', min: 24.9, usg: 0.2, jerarquia: 'referente', funcion: 'spacing' }),
  adn({ nombre: 'B', min: 25.1, usg: 0.2, jerarquia: 'referente', funcion: 'spacing' }));
check('en el borde de dos bandas (24,9 y 25,1) los minutos siguen siendo comparables',
  borde && borde.minutos === true && borde.dMin < 1);
const usoLejos = J.jugadoresSimilitud(BENAVIDEZ, CLON({ min: 28, usg: 0.30 }));
check('mismos minutos pero 8 puntos más de USG%: no son afines', !usoLejos.volumen.uso && !usoLejos.afin);
const sinUso = J.jugadoresSimilitud(BENAVIDEZ, CLON({ min: 28, usg: null }));
check('sin USG% cargado no se filtra por uso: un dato ausente no excluye a nadie',
  sinUso.volumen.uso === true && sinUso.afin === true);

/* =====================================================================
   6. EL GRUPO DE PARES USA LA SIMILITUD
   ===================================================================== */
titulo('6. EL GRUPO DE PARES · solo afines, y lo dice');

let nid = 0;
function jug(nombre, MIN, PLAYS, extra) {
  return Object.assign({
    NOMBRES: nombre, EQUIPO: 'EQ' + (nid++ % 4), FASE: 'REGULAR', MIN: MIN, PLAYS: PLAYS, PJ: 10,
    'T2I': 1, 'T2C': 0.5, 'T3I': 1, 'T3C': 0.3, 'eFG%': 0.45, 'TS%': 0.5, 'PPP': 0.8, 'USG%': 0.2,
    'PTS': 5, 'AST': 1, 'AST%': 0.1, 'PePP%': 0.15, 'AST-PP': 0.9, 'RO%': 0.02, 'RD%': 0.05,
    RO: 1, RD: 2, PR: 0.5, PP: 1, 'T3%': 0.3,
  }, extra || {});
}
function indice(jugadores, umbral) {
  const u = umbral || 15;
  return { liga: { jugadores: jugadores, jugadoresCalificados: jugadores.filter(j => j.MIN >= u),
    minJugador: u, jugadorTipo: null, jugadoresPorEquipo: new Map() }, leerJugador: () => null };
}
/* Cinco de la misma banda y la misma jerarquía. Cuatro tiran de afuera;
   PIVOT tira 9 dobles y ningún triple, así que el motor lo lee interior. */
const pool = [
  jug('TIRA, UNO', 28, 20, { T2I: 3 }), jug('TIRA, DOS', 28, 19, { T2I: 3 }),
  jug('TIRA, TRES', 28, 21, { T2I: 4 }), jug('TIRA, CUATRO', 28, 18, { T2I: 3 }),
  jug('PIVOT, INTERIOR', 28, 20, { T2I: 9, T3I: 0, T3C: 0, 'T3%': null }),
  jug('ROTA, UNO', 17, 6), jug('ROTA, DOS', 17, 5), jug('ROTA, TRES', 17, 7),
];
const ix = indice(pool);
const adnLiga = J.jugadoresAdnLiga(ix);
const gT = J.jugadoresPeerGroup(ix, pool[0], 'pares');
check('el nivel del grupo es «afines»', gT.nivel === 'afines', gT.nivel);
check('el de la misma banda y jerarquía pero otra función en cancha queda AFUERA',
  gT.jugadores.indexOf(pool[4]) === -1,
  adnLiga.get(pool[4]).rolFuncional.id + ' vs ' + adnLiga.get(pool[0]).rolFuncional.id);
check('TODOS los del grupo pasan el piso contra el jugador',
  gT.jugadores.every(x => J.jugadoresSimilitud(adnLiga.get(pool[0]), adnLiga.get(x)).afin));
check('y ninguno fuera del grupo lo pasa entre los calificados',
  ix.liga.jugadoresCalificados.filter(x => gT.jugadores.indexOf(x) === -1)
    .every(x => !J.jugadoresSimilitud(adnLiga.get(pool[0]), adnLiga.get(x)).afin));
check('el grupo trae el porcentaje de cada uno, para poder auditarlo',
  Array.isArray(gT.similitudes) && gT.similitudes.length === gT.n
  && gT.similitudes.every(x => x.porcentaje >= 60));
check('y el motivo dice el criterio con su piso',
  /afines/.test(gT.motivo) && /60 %/.test(gT.motivo) && /función en cancha/.test(gT.motivo), gT.motivo);

/* El interior no tiene 3 afines: cae al escalón siguiente y lo DICE. */
const gP = J.jugadoresPeerGroup(ix, pool[4], 'pares');
check('sin 3 afines cae a la banda de minutos', gP.nivel === 'primaria', gP.nivel);
check('y el motivo explica que no hubo afines', /No hubo 3 jugadores afines/.test(gP.motivo), gP.motivo);

/* Un NO calificado no decide contra quién se mide otro: sus etiquetas
   van con `~` (punto 8). Con el umbral en 27, NOCAL (26 min) tiene la
   misma banda, el mismo uso y las mismas etiquetas que los tiradores:
   pasa el filtro y el piso, y aun así no entra. */
const conNoCal = pool.concat([jug('NOCAL, TIRA', 26, 19, { T2I: 3 })]);
const ixP = indice(conNoCal, 27);
const adnP = J.jugadoresAdnLiga(ixP);
check('el no calificado sería afín por etiquetas y volumen',
  J.jugadoresSimilitud(adnP.get(conNoCal[0]), adnP.get(conNoCal[8])).afin);
const gNoCal = J.jugadoresPeerGroup(ixP, conNoCal[0], 'pares');
check('pero los afines salen solo de los calificados',
  gNoCal.jugadores.indexOf(conNoCal[8]) === -1 && gNoCal.jugadores.every(x => x.MIN >= 27), gNoCal.nivel);

console.log('\n' + '═'.repeat(70));
if (fail === 0) console.log('✓ TODO OK   ' + ok + ' pasaron, 0 fallaron');
else { console.log('✗ HAY FALLAS   ' + ok + ' pasaron, ' + fail + ' fallaron'); process.exit(1); }
