/* =====================================================================
   test-alcance.js · los clientes del mismo libro

   Nació de la auditoría del 2026-09-11 sobre los clientes dados de alta
   desde el Panel Master. Tres defectos, medidos en producción:

     1. «Publicar» NO LE LLEGABA A NINGÚN CLIENTE: el catálogo solo se
        pedía para el admin, y las zonas y los partidos publicados se leen
        de ahí. Un link de cliente de DEPORTIVO pintaba las 3 zonas del
        JSON contra las 4 publicadas, y 0 partidos manuales contra 2.
     2. Un cliente sin `clubes/<id>.json` se pintaba con el NARANJA de
        Reconquista, que es el tema por defecto (Universitario).
     3. El formato de la tabla y los partidos sin estadísticas son del
        TORNEO, pero vivían en el cliente que los cargó: el que se sumaba
        al mismo libro arrancaba sin zonas y con una tabla que no cuadraba.

   Se fija la solución: la tabla de ALCANCES (una sola, compartida por el
   modal y el servidor), la propagación a los clientes del mismo libro,
   la HERENCIA al dar de alta, el color de marca publicado, y que toda
   sesión con token lea lo publicado.
   ===================================================================== */
'use strict';

const fs = require('fs');
const vm = require('vm');
const NL = '\n';

let ok = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); }
};
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));

const AUTH = require('./js/sgadd-auth.js');
const M = require('./server/lib/catalogo-mutar.js');
const CATV = require('./server/lib/catalogo.js');

/* Ids con forma de id de Google. No son los reales. */
const S1 = '14tjg3AbCdEfGhIjKlMnOpQrStUvWxYz0123leaQ';   // el torneo de DEPORTIVO
const S2 = '1ZiAbCdEfGhIjKlMnOpQrStUvWxYz0123456Prim';
const S3 = '1CDAbCdEfGhIjKlMnOpQrStUvWxYz01234567U21';
const S4 = '1TJFmDAbCdEfGhIjKlMnOpQrStUvWxYz0123Jujy';

const ZONAS = {
  ordenTabla: ['PCT', 'DIF', 'PF'],
  formatos: { 'regular-12': { label: 'Regular · 12 equipos', equiposEsperados: 12, zonas: [
    { id: 'a', desde: 1, hasta: 2, label: 'Ascenso Zona A', tono: 'exito' },
    { id: 'c', desde: 9, hasta: 10, label: 'Repechaje Zona C', tono: 'aviso' },
    { id: 'd', desde: -2, label: 'Descenso', tono: 'peligro' }] } },
  porTramo: { '*': 'regular-12' },
};
const P1 = { id: 'm1', fecha: '2026-07-09', local: 'UNIVERSITARIO', puntosLocal: 62,
  visitante: "ATENAS 'B'", puntosVisitante: 66, torneo: 'IDA', fase: 'REGULAR' };
const P2 = { id: 'm2', fecha: '2026-07-09', local: 'SUD AMERICA LP', puntosLocal: 61,
  visitante: 'C.C TOLOSANO', puntosVisitante: 69, torneo: 'IDA', fase: 'REGULAR' };
const PV = { id: 'm3', fecha: '2026-08-20', local: 'HOGAR SOCIAL', puntosLocal: 70,
  visitante: 'U.N.L.P', puntosVisitante: 60, torneo: 'VUELTA', fase: 'REGULAR' };

/* La forma del catálogo de producción, con dos casos a propósito: una
   categoría de Reconquista en el MISMO torneo que DEPORTIVO (un club de
   varias categorías entre los que comparten libro) y la clave vieja con
   que DEPORTIVO guardó sus partidos. */
function base() {
  return JSON.parse(JSON.stringify({
    deportivo: { nombre: 'Deportivo La Plata', liga: 'la-plata', equipoPropio: 'DEPORTIVO LA PLATA', plan: 'PLATA',
      categorias: { 'deportivo-primera': { label: 'Primera 2026', sheetId: S1 } },
      competencia: ZONAS,
      partidosManuales: { 'deportivo-primera-2026': { 'IDA|REGULAR': [P1, P2], 'VUELTA|REGULAR': [PV] } } },
    sudamerica: { nombre: 'Sud América La Plata', liga: 'la-plata', equipoPropio: 'SUD AMERICA LP', plan: 'ORO',
      categorias: { 'sudamerica-primera': { label: 'Primera 2026', sheetId: S1 } } },
    'hogar-social': { nombre: 'Hogar Social', liga: 'la-plata', equipoPropio: 'HOGAR SOCIAL',
      categorias: { 'hogar-social-primera': { label: 'Primera 2026', sheetId: S1 } },
      /* una clave vieja de su única categoría, que le ganaría al bloque nuevo */
      competencia: { porCategoria: { 'hogar-social-primera-2026': {
        formatos: { x: { label: 'viejo', zonas: [] } }, porTramo: { '*': 'x' } } } } },
    reconquista: { nombre: 'Club Reconquista La Plata', liga: 'la-plata', equipoPropio: 'RECONQUISTA A', plan: 'ORO',
      categorias: { 'reconquista-primera': { label: 'Primera', sheetId: S2 },
        'reconquista-u21': { label: 'U21', sheetId: S3 },
        'reconquista-u23': { label: 'U23', sheetId: S1 } },
      competencia: { formatos: { regular: { label: 'Fase regular',
        zonas: [{ id: 'z', desde: 1, hasta: 8, label: 'Octavos', tono: 'exito' }] } }, porTramo: { '*': 'regular' } } },
    jujuy: { nombre: 'Jujuy Basquet', liga: 'liga-argentina', equipoPropio: 'JUJUY BASQUET', plan: 'PRO',
      categorias: { 'jujuy-primera': { label: 'Conferencia Norte', sheetId: S4 } } },
  }));
}
const aplicar = (cat, accion, d) => M.aplicar(cat, accion, d, CATV.validar);
const etiquetas = (comp) => {
  const f = comp && comp.formatos && comp.formatos[Object.keys(comp.formatos)[0]];
  return f ? f.zonas.map(z => z.label).join(' / ') : null;
};
const cuenta = (m) => Object.keys(m || {}).reduce((a, k) => a + (m[k] || []).length, 0);

(async () => {

/* =====================================================================
   1 · LA TABLA DE ALCANCES · una sola
   ===================================================================== */
titulo('1 · LA TABLA DE ALCANCES · la misma para el modal y el servidor');

check('las zonas se pueden llevar a este cliente, al libro o a todos',
  AUTH.alcancesDe('zonas').join() === 'club,libro,todos');
check('los partidos, a este cliente o al libro — no a todos',
  AUTH.alcancesDe('partidos_manuales').join() === 'club,libro');
check('el plan y el vencimiento admiten los tres',
  AUTH.alcancesDe('cambiar_plan').length === 3 && AUTH.alcancesDe('renovar').length === 3);
check('pausar, dar de baja y el alta: solo de a un cliente',
  ['pausar', 'desactivar', 'reactivar', 'alta', 'informe_entregado'].every(a => AUTH.alcancesDe(a).join() === 'club'));
check('una acción que no figura, solo de a uno (falla cerrado)', AUTH.alcancesDe('inventada').join() === 'club');
check('lo que no se propaga trae su motivo, en castellano',
  /torneo/i.test(AUTH.motivoSinAlcance('partidos_manuales', 'todos'))
  && /de a un cliente/.test(AUTH.motivoSinAlcance('pausar', 'libro'))
  && /identidad/.test(AUTH.motivoSinAlcance('alta', 'todos')));
check('y lo que sí se propaga no trae motivo', AUTH.motivoSinAlcance('zonas', 'todos') === '');

const SYNC = require('./server/bin/sincronizar-compartido.js');
check('el servidor tiene la MISMA tabla (la copia compartida está al día)',
  SYNC.desincronizados().indexOf('sgadd-auth.js') === -1);
const srcMutar = fs.readFileSync('./server/lib/catalogo-mutar.js', 'utf8');
check('y la hace cumplir en `aplicar`, leyéndola de ahí',
  /require\('\.\/compartido\/sgadd-auth\.js'\)/.test(srcMutar) && /AUTH\.alcancesDe\(accion\)/.test(srcMutar));

/* =====================================================================
   2 · QUIÉNES COMPARTEN LIBRO
   ===================================================================== */
titulo('2 · QUIÉNES COMPARTEN LIBRO · por el sheetId, que vive en el servidor');

const h = M.hermanasDeLibro(base(), 'deportivo', S1).map(x => x.club + '/' + x.slug).sort();
check('las otras categorías del mismo libro, de otros clubes',
  h.join() === 'hogar-social/hogar-social-primera,reconquista/reconquista-u23,sudamerica/sudamerica-primera', h.join());
check('sin sheetId no hay hermanas', M.hermanasDeLibro(base(), 'deportivo', '').length === 0);

/* =====================================================================
   3 · LAS ZONAS, POR ALCANCE
   ===================================================================== */
titulo('3 · LAS ZONAS · solo este, los del libro, o todos');

{
  const r = aplicar(base(), 'zonas', { club: 'deportivo', categoria: null,
    libroDeCategoria: 'deportivo-primera', alcance: 'libro', competencia: ZONAS });
  check('publicar al libro sale bien', r.ok, r.motivo);
  check('y llega a los 3 clubes que leen el libro, más el que publicó',
    r.aplicadoA.map(a => a.club).join() === 'deportivo,sudamerica,hogar-social,reconquista', JSON.stringify(r.aplicadoA));
  check('Sud América queda con el formato del torneo',
    etiquetas(r.catalogo.sudamerica.competencia) === 'Ascenso Zona A / Repechaje Zona C / Descenso');
  check('Hogar Social también, y su clave vieja YA NO le gana al bloque nuevo',
    etiquetas(r.catalogo['hogar-social'].competencia) === 'Ascenso Zona A / Repechaje Zona C / Descenso'
    && !r.catalogo['hogar-social'].competencia.porCategoria);
  const rq = r.catalogo.reconquista.competencia;
  check('a Reconquista —varias categorías— se le escribe SOLO la del torneo',
    etiquetas(rq.porCategoria && rq.porCategoria['reconquista-u23']) === 'Ascenso Zona A / Repechaje Zona C / Descenso');
  check('y su Primera conserva sus zonas: es otro torneo', etiquetas(rq) === 'Octavos');
  check('Jujuy, que no lee ese libro, no se toca', !r.catalogo.jujuy.competencia);
  check('no se muta el catálogo de entrada', true);

  const solo = aplicar(base(), 'zonas', { club: 'deportivo', competencia: ZONAS });
  check('sin alcance es «solo este cliente», como antes', solo.ok
    && solo.aplicadoA.length === 1 && !solo.catalogo.sudamerica.competencia);

  const todos = aplicar(base(), 'zonas', { club: 'deportivo', alcance: 'todos', competencia: ZONAS });
  check('«todos» llega a los 5 clubes', todos.ok && todos.aplicadoA.length === 5, todos.motivo);
  check('incluido Jujuy', etiquetas(todos.catalogo.jujuy.competencia) === 'Ascenso Zona A / Repechaje Zona C / Descenso');

  /* Las claves de categoría del que publica son de SU club. */
  const cat = base();
  cat.deportivo.competencia.porCategoria = { 'deportivo-primera': ZONAS };
  const conCat = aplicar(cat, 'zonas', { club: 'deportivo', alcance: 'libro',
    libroDeCategoria: 'deportivo-primera', competencia: cat.deportivo.competencia });
  check('el porCategoria del que publica NO se copia a los otros',
    conCat.ok && !(conCat.catalogo.sudamerica.competencia || {}).porCategoria, conCat.motivo);

  /* TODO O NADA: si uno no puede, no se escribe ninguno. */
  const roto = aplicar(base(), 'zonas', { club: 'reconquista', alcance: 'libro',
    libroDeCategoria: 'reconquista-u23', competencia: { porCategoria: { 'reconquista-u23': ZONAS } } });
  check('si un club no puede recibirlo, falla TODO', !roto.ok, 'debía fallar');
  check('y dice cuál', /Deportivo La Plata/.test(roto.motivo || ''), roto.motivo);

  const sinCat = aplicar(base(), 'zonas', { club: 'reconquista', alcance: 'libro', competencia: ZONAS });
  check('en un club de varias categorías, «libro» exige decir cuál',
    !sinCat.ok && /qué categoría/.test(sinCat.motivo), sinCat.motivo);
  const ajeno = aplicar(base(), 'zonas', { club: 'jujuy', alcance: 'libro', competencia: ZONAS });
  check('un libro que nadie más lee: se aplica solo a ese cliente',
    ajeno.ok && ajeno.aplicadoA.length === 1, ajeno.motivo);
}

/* =====================================================================
   4 · LOS PARTIDOS SIN ESTADÍSTICAS, POR ALCANCE
   ===================================================================== */
titulo('4 · LOS PARTIDOS SIN ESTADÍSTICAS · un resultado es del torneo');

{
  const r = aplicar(base(), 'partidos_manuales', { club: 'deportivo', categoria: 'deportivo-primera',
    claveVieja: 'deportivo-primera-2026', libroDeCategoria: 'deportivo-primera', alcance: 'libro',
    tramo: 'IDA|REGULAR', partidos: [P1, P2] });
  check('publicar al libro sale bien', r.ok, r.motivo);
  const dep = r.catalogo.deportivo.partidosManuales;
  check('DEPORTIVO pasa a la clave NUEVA (el slug) y la vieja se va',
    !!dep['deportivo-primera'] && !dep['deportivo-primera-2026'], JSON.stringify(Object.keys(dep)));
  check('sin perder el tramo que el pedido no traía (la VUELTA)',
    (dep['deportivo-primera']['VUELTA|REGULAR'] || []).length === 1
    && (dep['deportivo-primera']['IDA|REGULAR'] || []).length === 2);
  check('Sud América recibe los 2 de la IDA',
    ((r.catalogo.sudamerica.partidosManuales || {})['sudamerica-primera'] || {})['IDA|REGULAR'].length === 2);
  check('Reconquista, en su categoría de ese torneo y en ninguna otra',
    Object.keys(r.catalogo.reconquista.partidosManuales || {}).join() === 'reconquista-u23');
  check('Jujuy no', !r.catalogo.jujuy.partidosManuales);

  const cat = base();
  cat['hogar-social'].partidosManuales = { 'hogar-social-primera-2026': { 'VUELTA|REGULAR': [PV] } };
  const mig = aplicar(cat, 'partidos_manuales', { club: 'deportivo', categoria: 'deportivo-primera',
    alcance: 'libro', tramo: 'IDA|REGULAR', partidos: [P1, P2] });
  const hs = mig.catalogo['hogar-social'].partidosManuales;
  check('el club de UNA categoría con clave vieja se migra en el mismo gesto',
    mig.ok && !!hs['hogar-social-primera'] && !hs['hogar-social-primera-2026'], JSON.stringify(Object.keys(hs || {})));
  check('conservando su VUELTA', hs['hogar-social-primera']['VUELTA|REGULAR'].length === 1);

  const todos = aplicar(base(), 'partidos_manuales', { club: 'deportivo', categoria: 'deportivo-primera',
    alcance: 'todos', tramo: 'IDA|REGULAR', partidos: [P1] });
  check('«todos los clientes» se RECHAZA en el servidor, con su motivo',
    !todos.ok && /torneo/i.test(todos.motivo), todos.motivo);
  const total = aplicar(base(), 'partidos_manuales', { club: 'deportivo', categoria: 'deportivo-primera',
    alcance: 'libro', tramo: '*TOTAL*|REGULAR', partidos: [P1] });
  check('y el TOTAL sigue sin ser un tramo donde se juegue', !total.ok);
}

/* =====================================================================
   5 · LO COMERCIAL
   ===================================================================== */
titulo('5 · EL PLAN Y EL VENCIMIENTO · y lo que no se propaga');

{
  const r = aplicar(base(), 'cambiar_plan', { club: 'deportivo', plan: 'ORO', alcance: 'libro' });
  check('el plan se lleva a los clientes del mismo torneo', r.ok
    && r.catalogo.sudamerica.plan === 'ORO' && r.catalogo['hogar-social'].plan === 'ORO'
    && r.catalogo.reconquista.plan === 'ORO', r.motivo);
  check('una vez por club, aunque tenga varias categorías en ese libro',
    r.aplicadoA.filter(a => a.club === 'reconquista').length === 1);
  check('Jujuy no', r.catalogo.jujuy.plan === 'PRO');
  const multi = aplicar(base(), 'cambiar_plan', { club: 'reconquista', plan: 'BRONCE', alcance: 'libro' });
  check('desde un club de varias categorías cuentan TODOS sus libros',
    multi.ok && multi.catalogo.deportivo.plan === 'BRONCE', multi.motivo);

  const p = aplicar(base(), 'pausar', { club: 'deportivo', alcance: 'libro' });
  check('pausar a los del libro se rechaza, con su motivo', !p.ok && /de a un cliente/.test(p.motivo), p.motivo);
  check('pausar a uno sigue andando', aplicar(base(), 'pausar', { club: 'deportivo' }).ok);
  check('un alcance inventado se rechaza',
    !aplicar(base(), 'zonas', { club: 'deportivo', alcance: 'galaxia', competencia: ZONAS }).ok);
}

/* =====================================================================
   6 · LA HERENCIA
   ===================================================================== */
titulo('6 · LA HERENCIA · el que se suma a un torneo arranca con lo que el torneo tiene');

{
  const r = aplicar(base(), 'alta', { club: 'atenas-b', nombre: 'Atenas B', liga: 'la-plata',
    equipoPropio: 'ATENAS B', categoria: 'atenas-b-primera', label: 'Primera 2026',
    libroDe: 'deportivo/deportivo-primera' });
  check('el alta sale bien', r.ok, r.motivo);
  check('hereda las zonas de DEPORTIVO', r.herencia && r.herencia.zonasDe === 'deportivo'
    && etiquetas(r.catalogo['atenas-b'].competencia) === 'Ascenso Zona A / Repechaje Zona C / Descenso');
  check('y sus 3 partidos (la IDA y la VUELTA), aunque estén con la clave vieja',
    r.herencia.partidos === 3 && cuenta(r.catalogo['atenas-b'].partidosManuales['atenas-b-primera']) === 3,
    JSON.stringify(r.herencia));

  const conId = aplicar(base(), 'alta', { club: 'atenas-b', nombre: 'Atenas B', equipoPropio: 'ATENAS B',
    categoria: 'atenas-b-primera', label: 'Primera 2026', sheetId: S1 });
  check('pegando el id del mismo libro también hereda', conId.ok && conId.herencia.zonasDe === 'deportivo');

  const solo = aplicar(base(), 'alta', { club: 'nuevo', nombre: 'Nuevo', equipoPropio: 'NUEVO',
    categoria: 'nuevo-primera', label: 'Primera', sheetId: '1NuevoAbCdEfGhIjKlMnOpQrStUvWxYz0123Nuev' });
  check('un libro que nadie tiene no hereda nada', solo.ok && !solo.herencia.zonasDe && solo.herencia.partidos === 0
    && !solo.catalogo.nuevo.competencia);

  const cat = base();
  cat.sudamerica.categorias['sudamerica-primera'].sheetId = S2;
  cat.sudamerica.competencia = { formatos: { propio: { label: 'Propio', zonas: [] } }, porTramo: { '*': 'propio' } };
  const noPisa = aplicar(cat, 'alta', { club: 'sudamerica', categoria: 'sudamerica-primera', label: 'Primera 2026',
    libroDe: 'deportivo/deportivo-primera' });
  check('NO PISA las zonas que el club ya tenía', noPisa.ok
    && Object.keys(noPisa.catalogo.sudamerica.competencia.formatos).join() === 'propio');
  check('pero sí trae los partidos que le faltaban', noPisa.herencia.partidos === 3);

  const edit = aplicar(base(), 'alta', { club: 'sudamerica', categoria: 'sudamerica-primera', label: 'Primera A' });
  check('corregir la etiqueta NO es sumarse a un torneo: no hereda', edit.ok && edit.herencia === null
    && !edit.catalogo.sudamerica.competencia);

  const multi = aplicar(base(), 'alta', { club: 'jujuy', categoria: 'jujuy-u17', label: 'U17', sheetId: S1 });
  check('en un club de varias categorías, hereda en la categoría y no en el club',
    multi.ok && !!multi.catalogo.jujuy.competencia.porCategoria['jujuy-u17']
    && !multi.catalogo.jujuy.competencia.formatos, JSON.stringify(multi.catalogo.jujuy.competencia));

  const dup = M.unirManuales([{ 'IDA|REGULAR': [P1] },
    { 'IDA|REGULAR': [Object.assign({}, P1, { id: 'otro', visitante: 'ATENAS B - MM' })] }]);
  check('el mismo partido cargado dos veces, con otro id y otra escritura, cuenta UNA',
    dup['IDA|REGULAR'].length === 1);
}

/* =====================================================================
   7 · EL COLOR DE MARCA
   ===================================================================== */
titulo('7 · EL COLOR DE MARCA · viaja con el club');

{
  const r = aplicar(base(), 'alta', { club: 'universitario', nombre: 'Universitario', equipoPropio: 'UNIVERSITARIO',
    categoria: 'universitario-primera', label: 'Primera 2026', libroDe: 'deportivo/deportivo-primera', acento: '#1D4ED8' });
  check('se guarda, en minúsculas', r.ok && r.catalogo.universitario.acento === '#1d4ed8', r.motivo);
  const malo = aplicar(base(), 'alta', { club: 'sudamerica', categoria: 'sudamerica-primera', label: 'P', acento: 'verde' });
  check('un color que no es #rrggbb se rechaza y dice cómo va', !malo.ok && /#rrggbb/.test(malo.motivo));
  const cat = base();
  cat.sudamerica.acento = '#0d5e27';
  const borrar = aplicar(cat, 'alta', { club: 'sudamerica', categoria: 'sudamerica-primera', label: 'P', acento: '' });
  check('vacío lo borra (vuelve al del JSON)', borrar.ok && borrar.catalogo.sudamerica.acento === undefined);
  const noToca = aplicar(cat, 'alta', { club: 'sudamerica', categoria: 'sudamerica-primera', label: 'P' });
  check('y un alta que no lo manda no lo toca', noToca.catalogo.sudamerica.acento === '#0d5e27');
}

/* =====================================================================
   8 · LO QUE VIAJA AL NAVEGADOR
   ===================================================================== */
titulo('8 · LO QUE VIAJA AL NAVEGADOR · la huella sí, el sheetId nunca');

{
  const cat = base();
  cat.universitario = { nombre: 'Universitario', acento: '#1d4ed8',
    categorias: { 'universitario-primera': { label: 'Primera 2026', sheetId: S1 } } };
  const adm = CATV.publico(cat, { admin: true });
  const cli = CATV.publico(cat, { admin: false });
  const libro = (lista, id) => lista.filter(c => c.id === id)[0].categorias[0].libro;
  check('el admin recibe la HUELLA del libro de cada categoría', /^[0-9a-f]{8}$/.test(libro(adm, 'deportivo')));
  check('la misma para los clientes del mismo torneo',
    libro(adm, 'deportivo') === libro(adm, 'sudamerica') && libro(adm, 'deportivo') === libro(adm, 'universitario'));
  check('otra para otro libro', libro(adm, 'deportivo') !== libro(adm, 'jujuy'));
  check('el cliente NO la recibe', cli.every(c => c.categorias.every(k => k.libro === undefined)));
  check('el color de marca va para todos', cli.filter(c => c.id === 'universitario')[0].acento === '#1d4ed8');
  const todo = JSON.stringify(adm) + JSON.stringify(cli);
  check('y ni un sheetId en ninguno de los dos', [S1, S2, S3, S4].every(s => todo.indexOf(s) === -1));
  check('la huella es estable', CATV.huellaLibro(S1) === CATV.huellaLibro(S1) && CATV.huellaLibro('') === null);

  const src = fs.readFileSync('./server/api/handlers.js', 'utf8');
  check('la respuesta de guardar dice a quiénes llegó y qué heredó (lo dice el servidor)',
    /aplicadoA: r\.aplicadoA/.test(src) && /herencia: r\.herencia/.test(src));
}

/* =====================================================================
   9 · EL CLIENTE LEE LO PUBLICADO
   ===================================================================== */
titulo('9 · «PUBLICAR» LE LLEGA AL CLIENTE · el catálogo se pide con cualquier token');

function crearClientes(rol, token) {
  const src = fs.readFileSync('./js/sgadd-clientes.js', 'utf8') + '\n;this.SGADD_CLIENTES = SGADD_CLIENTES;';
  const pedidos = [];
  const pintadas = [];
  const ctx = {
    console, URLSearchParams,
    SGADD_AUTH: { ROLES: { ADMIN: 'ADMIN' }, rol: () => rol, token: () => token },
    SGADD_DATA: { apiConfigurada: () => true,
      catalogo: () => { pedidos.push(1); return Promise.resolve({ ok: true, origen: 'kv', clubes: CATV.publico(base(), { admin: rol === 'ADMIN' }) }); } },
    SGADD_APP: { estado: { idx: {} } },
    currentSection: 'clasificacion',
    renderSection: (s) => pintadas.push(s),
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { C: ctx.SGADD_CLIENTES, pedidos, pintadas };
}
{
  const cli = crearClientes('CLIENTE', 'tok');
  await cli.C.iniciar();
  check('una sesión de CLIENTE pide el catálogo', cli.pedidos.length === 1);
  check('y lo guarda: de ahí leen las zonas y los partidos publicados', (cli.C.estado.clubes || []).length === 5);
  check('el selector de clientes sigue siendo solo del admin', cli.C.html() === '');
  check('si llegó tarde, repinta la tabla UNA vez', cli.pintadas.join() === 'clasificacion');
  cli.C.recibir({ clubes: [] });
  check('y no vuelve a repintar en la siguiente', cli.pintadas.length === 1);

  const sin = crearClientes('CLIENTE', null);
  await sin.C.iniciar();
  check('sin token no se pide nada (la landing, la demo)', sin.pedidos.length === 0);

  const idx = fs.readFileSync('./index.html', 'utf8');
  const rec = idx.slice(idx.indexOf('async function reconciliarConCatalogo'), idx.indexOf('const id = CLUB.estado.id;'));
  check('el arranque lo entrega ANTES de inicializar la categoría', /SGADD_CLIENTES\.recibir\(cat\)/.test(rec));
}

titulo('9 bis · LA CLAVE DE UNA CATEGORÍA · el slug, y la vieja de respaldo');
{
  const sgaddPrevio = global.SGADD;
  global.SGADD = { planilla: (id) => ({ 'naranja-u21-clausura-2026': { slug: 'reconquista-u21' } })[id] || null };
  const CFG = require('./js/sgadd-config.js');
  const A = { formatos: {}, marca: 'A' }, B = { formatos: {}, marca: 'B' }, CLUBB = { porCategoria: {} };
  const claves = CFG.clavesDeCategoria('naranja-u21-clausura-2026');
  check('una planilla con JSON se busca por slug y por su id', claves.join() === 'reconquista-u21,naranja-u21-clausura-2026');
  check('una sin JSON, por su id (que ya es el slug)', CFG.clavesDeCategoria('hogar-social-primera').join() === 'hogar-social-primera');
  CLUBB.porCategoria = { 'naranja-u21-clausura-2026': A };
  check('lo guardado con la clave VIEJA se sigue leyendo', CFG.bloqueDeCategoria(CLUBB, claves) === A);
  CLUBB.porCategoria = { 'naranja-u21-clausura-2026': A, 'reconquista-u21': B };
  check('con las dos, gana el slug (lo último que publicó el servidor)', CFG.bloqueDeCategoria(CLUBB, claves) === B);
  check('los partidos, igual', CFG.deCategoria({ 'naranja-u21-clausura-2026': 1 }, 'naranja-u21-clausura-2026') === 1);
  const pub = CFG.porCategoriaASlugs({ porCategoria: { 'naranja-u21-clausura-2026': A, 'reconquista-u21': B } });
  check('al publicar, las claves pasan a slug y gana lo recién editado',
    Object.keys(pub.porCategoria).join() === 'reconquista-u21' && pub.porCategoria['reconquista-u21'].marca === 'A',
    JSON.stringify(pub.porCategoria));
  global.SGADD = sgaddPrevio;

  check('resolver() busca por las dos claves',
    /bloqueDeCategoria\(v\.config, clavesDeCategoria\(cat\)\)/.test(fs.readFileSync('./js/sgadd-config.js', 'utf8')));
  check('la tabla de posiciones lee los partidos por las dos claves',
    /SGADD_CONFIG\.deCategoria\(club\.partidosManuales\)/.test(fs.readFileSync('./js/sgadd-clasificacion.js', 'utf8')));
  const ui = fs.readFileSync('./js/sgadd-configui.js', 'utf8');
  check('publicar zonas y partidos manda el slug, la clave vieja y el alcance',
    (ui.match(/claveVieja:/g) || []).length === 2 && (ui.match(/alcance: alcance \|\| 'club'/g) || []).length === 2);
}

/* =====================================================================
   10 · PUBLICAR VS EXPORTAR, dicho en la pantalla
   ===================================================================== */
titulo('10 · PUBLICAR ALCANZA · exportar es un respaldo opcional');
{
  const ui = fs.readFileSync('./js/sgadd-configui.js', 'utf8');
  check('la pantalla dice que con publicar alcanza', /Alcanza con esto: no hace falta exportar ni commitear/.test(ui));
  check('y que exportar es opcional, un respaldo del repositorio', /Opcional · respaldo del repositorio/.test(ui));
  check('el aviso de publicado también lo dice', /no hace falta exportar ni commitear\.', true\)/.test(ui));

  /* LA GUÍA NOMBRA BOTONES: cada uno tiene que estar, literal, en la
     pantalla (la misma regla que fija test-alta.js para el alta). */
  const guia = fs.readFileSync('./GUIA_ALTA_CLIENTES.md', 'utf8');
  const hub = fs.readFileSync('./js/sgadd-hub.js', 'utf8');
  [['Del escudo', hub], ['Publicar en el cliente', ui], ['Publicar partidos', ui],
   ['Exportar', ui], ['Solo en este cliente', fs.readFileSync('./js/sgadd-confirmar.js', 'utf8')]].forEach(([b, src]) => {
    check('  la guía nombra «' + b + '» y la pantalla lo tiene', guia.indexOf(b) !== -1 && src.indexOf(b) !== -1);
  });
  check('y dice, con esas palabras, que publicar alcanza', /No hace falta exportar ni commitear/.test(guia));
}

/* =====================================================================
   11 · EL MODAL PREGUNTA EN QUÉ CLIENTES
   ===================================================================== */
titulo('11 · «¿EN QUÉ CLIENTES QUERÉS APLICAR ESTE CAMBIO?»');
{
  const nodos = {};
  global.document = {
    activeElement: null,
    getElementById: (id) => nodos[id] || null,
    createElement: () => ({ set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; } }),
    body: { appendChild(n) { nodos[n.id] = n; } },
    addEventListener() {},
  };
  const CONF = require('./js/sgadd-confirmar.js');
  const cat = base();
  cat.universitario = { nombre: 'Universitario', categorias: { 'universitario-primera': { label: 'P', sheetId: S1 } } };
  const clubes = CATV.publico(cat, { admin: true });

  const z = CONF.opcionesAlcance({ clubes, club: 'deportivo', slug: 'deportivo-primera', accion: 'zonas' });
  check('siempre las tres opciones', z.map(o => o.valor).join() === 'club,libro,todos');
  check('con los rótulos que se pidieron', z[0].titulo === 'Solo en este cliente'
    && z[1].titulo === 'Clientes que comparten este Sheet ID' && z[2].titulo === 'Todos los clientes del sistema');
  check('«libro» lista a los que leen el mismo libro', z[1].habilitado && z[1].clientes.length === 5
    && z[1].clientes.indexOf('Universitario') !== -1 && z[1].clientes.indexOf('Jujuy Basquet') === -1, z[1].clientes.join());
  check('«todos», al catálogo entero', z[2].habilitado && z[2].clientes.length === 6);

  const p = CONF.opcionesAlcance({ clubes, club: 'deportivo', slug: 'deportivo-primera', accion: 'partidos_manuales' });
  check('para partidos, «todos» sale GRIS y con el motivo', !p[2].habilitado && /torneo/i.test(p[2].motivo));
  const a = CONF.opcionesAlcance({ clubes, club: 'deportivo', slug: 'deportivo-primera', accion: 'alta' });
  check('para el alta, solo «este cliente»', a[0].habilitado && !a[1].habilitado && !a[2].habilitado && /identidad/.test(a[1].motivo));
  const j = CONF.opcionesAlcance({ clubes, club: 'jujuy', slug: 'jujuy-primera', accion: 'zonas' });
  check('un libro que nadie más lee: «libro» gris, «Ningún otro cliente lee este libro»',
    !j[1].habilitado && /Ningún otro cliente/.test(j[1].motivo));
  const sinHuella = CONF.opcionesAlcance({ clubes: CATV.publico(cat, { admin: false }), club: 'deportivo',
    slug: 'deportivo-primera', accion: 'zonas' });
  check('sin la huella (no es admin) no se inventa quién comparte', !sinHuella[1].habilitado);
  const plan = CONF.opcionesAlcance({ clubes, club: 'reconquista', accion: 'cambiar_plan', deClub: true });
  check('el plan de un club de varias categorías cuenta todos sus libros', plan[1].habilitado
    && plan[1].clientes.indexOf('Deportivo La Plata') !== -1);

  let recibido = 'nada';
  CONF.abrir({ titulo: 'Publicar', confirmar: 'Publicar', cambios: [{ label: 'x', antes: '1', despues: '2' }],
    alcance: { opciones: z, sugerido: 'libro' }, alConfirmar: (al) => { recibido = al; } });
  const html = CONF.html();
  check('el modal hace la pregunta', /¿En qué clientes querés aplicar este cambio\?/.test(html));
  check('con los tres radios', (html.match(/name="confAlcance"/g) || []).length === 3);
  check('arranca en lo sugerido si está habilitado', CONF.estado.alcance.elegido === 'libro');
  check('el botón dice a cuántos llega', CONF.textoConfirmar() === 'Publicar · 5 clientes', CONF.textoConfirmar());
  check('nada se manda hasta confirmar', recibido === 'nada');
  CONF.elegirAlcance('todos');
  CONF.confirmar();
  check('al confirmar, el alcance elegido le llega a quien dispara la petición', recibido === 'todos');

  CONF.abrir({ titulo: 'x', cambios: [{ label: 'x', antes: '1', despues: '2' }],
    alcance: { opciones: p, sugerido: 'todos' }, alConfirmar: (al) => { recibido = al; } });
  check('un sugerido gris cae a «solo este cliente»', CONF.estado.alcance.elegido === 'club');
  CONF.elegirAlcance('todos');
  check('y una opción gris no se puede elegir', CONF.estado.alcance.elegido === 'club');
  CONF.cerrar();

  /* Las pantallas lo usan. */
  global.SGADD = require('./js/sgadd-core.js');
  const enviados = [];
  let modal = null;
  global.SGADD_CONFIRMAR = { abrir(o) { modal = o; }, opcionesAlcance: CONF.opcionesAlcance,
    cambiosDeClub: CONF.cambiosDeClub };
  global.SGADD_DATA = { guardarCatalogo(i) { enviados.push(i); return Promise.resolve({ ok: true, clubes }); } };
  global.SGADD_CLIENTES = { estado: { clubes }, pintar() {} };
  const HUB = require('./js/sgadd-hub.js');
  HUB.accionClub('deportivo', 'cambiar_plan', 'ORO');
  check('cambiar el plan abre el modal con la pregunta', !!(modal && modal.alcance && modal.alcance.opciones.length === 3));
  check('arranca en «solo este cliente»', modal.alcance.sugerido === 'club');
  modal.alConfirmar('libro');
  check('y el pedido lleva el alcance elegido', enviados.length === 1 && enviados[0].alcance === 'libro'
    && enviados[0].plan === 'ORO');
  await new Promise(r => setTimeout(r, 0));
  HUB.pendiente.club = null;
  HUB.accionClub('deportivo', 'pausar');
  check('pausar también pregunta, con las otras dos grises',
    modal.alcance.opciones[0].habilitado && !modal.alcance.opciones[1].habilitado && !modal.alcance.opciones[2].habilitado);

  check('la herencia se cuenta en castellano',
    HUB.textoHerencia({ zonasDe: 'deportivo', partidos: 2 }, clubes) ===
    'Heredó de su torneo las zonas de la tabla de Deportivo La Plata y 2 partidos sin estadísticas. ');
  check('y sin herencia no dice nada', HUB.textoHerencia({ zonasDe: null, partidos: 0 }) === '');
  delete global.SGADD_CONFIRMAR; delete global.SGADD_DATA; delete global.SGADD_CLIENTES;
}

/* =====================================================================
   12 · EL COLOR DEL ESCUDO Y EL COLOR PUBLICADO
   ===================================================================== */
titulo('12 · EL COLOR · sale del escudo y el publicado le gana al del JSON');

function crearClub() {
  const src = fs.readFileSync('./js/sgadd-club.js', 'utf8').replace('const CLUB = (function () {', 'var CLUB = (function () {');
  const ctx = {
    console, setTimeout, clearTimeout, URLSearchParams,
    window: { location: { search: '?club=universitario' } },
    document: { readyState: 'complete', currentScript: { src: 'https://x/js/sgadd-club.js' },
      getElementsByTagName: () => [], getElementById: () => null,
      documentElement: { style: { setProperty() {} } }, body: { appendChild() {} },
      createElement: () => ({ style: {} }), addEventListener() {}, title: '' },
    fetch: async () => ({ ok: false, status: 404 }),
    SGADD: { CATALOGO: { patronEquipoPropio: /X/, planillas: [] }, limpiarCache() {},
      claveEquipo: require('./server/lib/compartido/sgadd-core.js').claveEquipo },
    LOGOS: { CFG: { basePaths: [], sufijos: [], overrides: {} }, reset() {}, getUrl: () => null },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.CLUB;
}
{
  const CLUB = crearClub();
  const px = [];
  const poner = (n, r, g, b, a) => { for (let i = 0; i < n; i++) px.push(r, g, b, a); };
  poner(600, 255, 255, 255, 255);    // el fondo blanco
  poner(300, 0x33, 0x34, 0x8a, 255); // el azul de DEPORTIVO
  poner(80, 0xcc, 0x00, 0x00, 255);  // un detalle rojo
  poner(400, 0x33, 0x34, 0x8a, 0);   // transparente: no cuenta
  check('el color de un escudo es el tono que más superficie cubre, sin el blanco',
    CLUB.colorDeEscudo(px) === '#33348a', CLUB.colorDeEscudo(px));
  const bn = [];
  for (let i = 0; i < 200; i++) bn.push(0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255);
  check('un escudo blanco y negro no propone ningún color', CLUB.colorDeEscudo(bn) === null);
  check('mezclar a medias blanco y negro da gris', CLUB.mezclarHex('#ffffff', '#000000', 0.5) === '#808080');

  const SRV = { id: 'universitario', nombre: 'Universitario', acento: '#1D4ED8',
    categorias: [{ slug: 'universitario-primera', label: 'Primera 2026', activo: true }] };
  const sinJson = CLUB.reconciliarConfig(null, SRV, { equipoPropio: 'UNIVERSITARIO' });
  check('sin JSON, el club toma el color publicado (y no el naranja de Reconquista)', sinJson.acento === '#1d4ed8');
  check('con la variante oscura derivada', /^#[0-9a-f]{6}$/.test(sinJson.acentoOscuro)
    && CLUB.contraste(sinJson.acentoOscuro, '#ffffff') > CLUB.contraste(sinJson.acento, '#ffffff'));
  check('y el escudo del header sale del EQUIPO propio', sinJson.equipoEscudo === 'UNIVERSITARIO');
  const conJson = CLUB.reconciliarConfig({ nombre: 'U', acento: '#0d5e27', acentoOscuro: '#083e1a', planillas: [] }, SRV);
  check('el publicado le gana al del JSON (misma cascada que las zonas)', conJson.acento === '#1d4ed8');
  const soloJson = CLUB.reconciliarConfig({ nombre: 'U', acento: '#0d5e27', acentoOscuro: '#083e1a', planillas: [] },
    Object.assign({}, SRV, { acento: null }));
  check('sin color publicado queda el del JSON, con su oscuro', soloJson.acento === '#0d5e27' && soloJson.acentoOscuro === '#083e1a');
}

console.log(NL + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
