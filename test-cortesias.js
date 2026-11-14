/* =====================================================================
   test-cortesias.js · LOS PASES DE CORTESÍA (punto 179)

   Una muestra del panel sin dar de alta un cliente: el motor de pases,
   el token, la lista blanca de rutas del guard central, el catálogo y el
   libro recortados al pase, y que nada se escriba en `sgadd:catalogo` ni
   en `sgadd:clientes`. Con los handlers de verdad y un Upstash de mentira.

     node test-cortesias.js
   ===================================================================== */
'use strict';
require('./server/lib/env.js').cargar();

let ok = 0, mal = 0;
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (detalle !== undefined ? '  → ' + JSON.stringify(detalle) : '')); }
}
function seccion(t) { console.log('\n' + t + '\n' + '─'.repeat(70)); }

/* ----------------------------------------- Upstash de mentira (catálogo) */
const kv = require('./server/lib/kv.js');
const store = {};
const escrituras = [];
kv.configurado = () => true;
kv.leer = async (k) => ({ valor: store[k] !== undefined ? JSON.parse(store[k]) : null, error: null });
kv.escribir = async (k, v) => { escrituras.push(k); store[k] = JSON.stringify(v); };
/* Los pases van por `deps.kv`: su propio almacén, para poder contar que
   no tocan ninguna otra clave. */
const { kvMemoria } = require('./server/lib/kv-memoria.js');
const MEM = kvMemoria();
const deps = { kv: MEM };

const C = require('./server/lib/cortesias.js');
const R = require('./server/rutas/cortesias.js');
const H = require('./server/rutas/handlers.js');
const PBP = require('./server/rutas/pbp.js');
const auth = require('./server/lib/auth.js');
const catalogo = require('./server/lib/catalogo.js');
const sheets = require('./server/lib/google-sheets.js');
const AUTH = require('./js/sgadd-auth.js');
const SGADD = require('./js/sgadd-core.js');

/* ------------------------------------------------------------ el libro */
const BO = 'BOCA JUNIORS', OB = 'OBRAS BASKET', QU = 'QUIMSA', RE = 'REGATAS (C)';
const cols = ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'PTS', 'PTSopp'];
const partidos = [[BO, OB, 80, 70], [QU, RE, 75, 72], [BO, QU, 66, 70], [OB, RE, 90, 60]];
const filasE = [];
partidos.forEach(([a, b, pa, pb], i) => {
  const f = '0' + (i + 1) + '/10/2026', p = a + ' vs ' + b;
  filasE.push([f, p, a, 'REGULAR', 'LOCAL', pa > pb ? 'GANADO' : 'PERDIDO', pa, pb]);
  filasE.push([f, p, b, 'REGULAR', 'VISITANTE', pa > pb ? 'PERDIDO' : 'GANADO', pb, pa]);
});
const colsJ = ['FECHA', 'PARTIDO', 'NOMBRES', 'EQUIPO', 'FASE', 'MIN', 'PTS'];
const filasJ = [
  ['01/10/2026', BO + ' vs ' + OB, 'VILDOZA, LUCAS', BO, 'REGULAR', 30, 18],
  ['01/10/2026', BO + ' vs ' + OB, 'GUTIERREZ, LEO', OB, 'REGULAR', 28, 22],
  ['02/10/2026', QU + ' vs ' + RE, 'ROBINSON, BRANDON', QU, 'REGULAR', 32, 25],
];
const LIBRO = { hojas: { 'Base Datos E': [cols].concat(filasE), 'Base Datos J': [colsJ].concat(filasJ),
  'PROMEDIOS J': [['NOMBRES', 'EQUIPO', 'FASE', 'PTS'], ['VILDOZA, LUCAS', BO, 'REGULAR', 18], ['GUTIERREZ, LEO', OB, 'REGULAR', 22]] },
  hojasTexto: {}, faltantes: [], leidoEn: 1 };
const ID_LNB = 'L'.repeat(40);
sheets.obtenerLibro = async (id) => { if (id === ID_LNB) return JSON.parse(JSON.stringify(LIBRO)); throw new Error('libro desconocido'); };
sheets.obtenerDatosPlanilla = async () => ({ valores: null });

const eq = (n) => ({ nombre: n, clave: SGADD.claveEquipo(n) });
const CAT = {
  lnb: { tipo: 'torneo', nombre: 'Liga Nacional 2026-27', liga: 'liga-nacional',
    formato: { fases: [{ id: 'regular', label: 'Fase regular' }] },
    categorias: {
      'lnb-unica': { label: 'Zona única', sheetId: ID_LNB, zona: 'unica', equipos: [BO, OB, QU, RE].map(eq) },
      'lnb-post': { label: 'Postemporada', sheetId: 'P'.repeat(40), zona: 'post', interzonal: true, equipos: [] },
      'lnb-vacia': { label: 'Sin libro', zona: 'vacia', equipos: [] },
    } },
  boca: { nombre: 'Boca', liga: 'liga-nacional', equipoPropio: BO, plan: 'PLATA',
    categorias: { 'boca-lnb': { label: 'LNB', sheetId: ID_LNB, torneo: 'lnb', zona: 'unica' } } },
};
store[catalogo.CLAVE_KV] = JSON.stringify(CAT);
const catalogoAntes = store[catalogo.CLAVE_KV];

const tokAdmin = auth.firmarToken({ email: 'freytesgn@gmail.com' }, { expiraEn: '1h' });
const tokBoca = auth.firmarToken({ email: 'dt@boca.com', club: 'boca', equipoAsignado: BO, plan: 'PLATA' }, { expiraEn: '1h' });
const pedido = (tok, params, query, body) => ({ headers: tok ? { authorization: 'Bearer ' + tok } : {},
  params: params || {}, body: body || {}, query: query || {} });

(async () => {
  seccion('1 · Los datos del invitado');
  check('WhatsApp argentino escrito a mano → 549…', C.normalizarWhatsapp('0221 15 614-3994') === '5492216143994');
  check('WhatsApp con +54 9', C.normalizarWhatsapp('+54 9 221 614 3994') === '5492216143994');
  check('WhatsApp de otro país se respeta', C.normalizarWhatsapp('+34 612 345 678') === '34612345678');
  check('un número corto no es un WhatsApp', C.normalizarWhatsapp('123') === '');
  check('días rápidos 3 · 5 · 7 · 10 · 15', JSON.stringify(C.DIAS_RAPIDOS) === '[3,5,7,10,15]');
  check('días personalizados: 1 a 60 enteros', C.normalizarDias(22) === 22 && !C.normalizarDias(0) && !C.normalizarDias(61) && !C.normalizarDias(2.5));
  check('el contacto exige nombre y WhatsApp', !C.normalizarContacto({ nombre: 'Pepe' }).ok && C.normalizarContacto({ nombre: 'Pepe', whatsapp: '2216143994' }).ok);
  check('un mail mal escrito se denuncia', C.normalizarContacto({ nombre: 'P', whatsapp: '2216143994', email: 'pepe@' }).faltan.indexOf('email') !== -1);
  check('vence a las 23:59 de Argentina del día N', C.venceDe(7, new Date('2026-11-14T15:00:00Z')) === '2026-11-21T23:59:59.999-03:00');

  seccion('2 · Armar un pase contra el catálogo');
  const base = { torneo: 'lnb', zona: 'lnb-unica', equipo: BO, dias: 7, invitado: { nombre: 'Gonzalo Pérez', whatsapp: '2214440000' } };
  const mk = (x) => C.armar(Object.assign({}, base, x), CAT);
  check('un torneo que no existe', mk({ torneo: 'nada' }).codigo === 'TORNEO');
  check('un cliente no es un torneo', mk({ torneo: 'boca' }).codigo === 'TORNEO');
  check('una zona de postemporada no', mk({ zona: 'lnb-post' }).codigo === 'ZONA');
  check('una zona sin libro no', mk({ zona: 'lnb-vacia' }).codigo === 'ZONA');
  check('un equipo que no juega en la zona no', mk({ equipo: 'RIVER' }).codigo === 'EQUIPO');
  check('vigencia fuera de rango', mk({ dias: 90 }).codigo === 'DIAS');
  check('sin WhatsApp no hay pase', mk({ invitado: { nombre: 'X' } }).codigo === 'INVITADO');
  const a = mk({});
  check('un pase válido', a.ok && a.pase.plan === 'PLATA' && a.pase.pbp === true && a.pase.estado === 'activo', a);
  check('del código se guarda la huella', a.pase.huella === C.huella(a.codigo) && JSON.stringify(a.pase).indexOf(a.codigo) === -1);
  check('el equipo queda con el nombre del libro', a.pase.equipo === BO);
  const link = C.linkDelPase(a.pase, a.codigo);
  const msg = C.mensajeInvitacion(a.pase, link);
  check('el link lleva el torneo y el código', link.indexOf('club=lnb') !== -1 && link.indexOf('pase=' + a.codigo) !== -1);
  check('el mensaje nombra al DT, al equipo, los días y lleva el link', /Hola Gonzalo/.test(msg) && /Boca Juniors/.test(msg) && /7 días/.test(msg) && msg.indexOf(link) !== -1);
  check('el mensaje no trae huecos', !/undefined|null|NaN/.test(msg));
  check('wa.me con el número del DT', C.urlWhatsapp('5492216143994', msg).indexOf('https://wa.me/5492216143994?text=') === 0);

  seccion('3 · El estado y el token');
  check('un pase con la fecha pasada está vencido', C.estadoEfectivo(Object.assign({}, a.pase, { vence: '2020-01-01T23:59:59.999-03:00' })) === 'vencido');
  check('el token dura como mucho 72 h', C.segundosDeToken(Object.assign({}, a.pase, { vence: '2099-01-01T00:00:00Z' })) === 72 * 3600);
  check('el mail del token no es de un administrador', !AUTH.esAdmin(C.emailDelToken(a.pase.id)));
  const malo = auth.firmarToken({ email: 'freytesgn@gmail.com', cortesia: 'abcdefghij' }, { expiraEn: '1h' });
  check('un token de cortesía con mail de admin se rechaza', !auth.verificarToken(malo).ok);

  seccion('4 · La lista blanca de rutas');
  const P = a.pase;
  const ruta = (m, r, q) => C.rutaPermitida(m, r, q, P);
  check('el catálogo', ruta('GET', '/api/v1/catalogo'));
  check('el libro de SU zona', ruta('GET', '/api/v1/equipos/lnb', { categoria: 'lnb-unica' }));
  check('el libro de otra zona no', !ruta('GET', '/api/v1/equipos/lnb', { categoria: 'lnb-post' }));
  check('el libro de un cliente no', !ruta('GET', '/api/v1/equipos/boca', { categoria: 'boca-lnb' }));
  check('la ficha de un rival no', !ruta('GET', '/api/v1/equipos/lnb', { categoria: 'lnb-unica', equipo: OB }));
  check('el play-by-play de SU equipo', ruta('GET', '/api/v1/pbp/lnb/lnb-unica', { equipo: BO }));
  check('el play-by-play de un rival no', !ruta('GET', '/api/v1/pbp/lnb/lnb-unica', { equipo: OB }));
  check('sin pbp en el pase, ni el suyo', !C.rutaPermitida('GET', '/api/v1/pbp/lnb/lnb-unica', { equipo: BO }, Object.assign({}, P, { pbp: false })));
  check('fixture y llave del torneo', ruta('GET', '/api/v1/fixture/lnb') && ruta('GET', '/api/v1/torneos/lnb/llave'));
  check('el rival de otra zona no', !ruta('GET', '/api/v1/torneos/lnb/rival'));
  check('ninguna escritura', !ruta('POST', '/api/v1/catalogo') && !ruta('POST', '/api/v1/estados/lnb/lnb-unica'));
  check('salvo su propia telemetría', ruta('POST', '/api/v1/pase/actividad') && !ruta('GET', '/api/v1/pase/actividad') && !ruta('POST', '/api/v1/pase/solicitar'));

  /* TODAS las rutas registradas en la app: un token de cortesía pasa por la
     lista blanca y nada más. Una ruta nueva entra cerrada. */
  const { crearApp } = require('./server/app.js');
  const app = crearApp({ entorno: Object.assign({}, require('./server/lib/config.js').entorno(), { origenes: [] }), deps: deps });
  const rutas = app._router.stack.filter(l => l.route).map(l => ({ m: Object.keys(l.route.methods)[0].toUpperCase(), p: l.route.path }));
  const ABIERTAS = ['GET /api/v1/catalogo', 'GET /api/v1/equipos/:clubId', 'GET /api/v1/pbp/:clubId/:categoria',
    'GET /api/v1/fixture/:torneo', 'GET /api/v1/torneos/:torneo/llave', 'POST /api/v1/pase/actividad'];
  const concreta = (p) => p.replace(':clubId', 'lnb').replace(':torneo', 'lnb').replace(':categoria', 'lnb-unica').replace(':zona', 'lnb-unica');
  const abiertas = rutas.filter(r => C.rutaPermitida(r.m, concreta(r.p), { categoria: 'lnb-unica' }, P)).map(r => r.m + ' ' + r.p);
  check('de ' + rutas.length + ' rutas, el pase abre exactamente las seis (cinco lecturas y su telemetría)', JSON.stringify(abiertas.sort()) === JSON.stringify(ABIERTAS.slice().sort()), abiertas);
  check('el guard está ANTES de las rutas', app._router.stack.findIndex(l => l.name === 'guardCortesia' || (l.handle && l.handle.length === 3 && /cortesia/.test(String(l.handle))))
    < app._router.stack.findIndex(l => l.route));

  seccion('5 · Crear, consultar y canjear');
  const crear = (tok, x) => R.manejarCortesiasEscribir(pedido(tok, {}, {}, Object.assign({ accion: 'crear' }, base, x)), deps);
  catalogo.limpiarCache();
  check('un cliente no crea pases', (await crear(tokBoca, {})).status === 403);
  const cr = await crear(tokAdmin, { dias: 5 });
  check('el admin crea uno', cr.status === 200 && cr.body.pase && cr.body.link && cr.body.whatsappUrl, cr.body);
  check('la respuesta no trae la huella', cr.body.pase && !('huella' in cr.body.pase));
  check('el WhatsApp prearmado va al número del DT', cr.body.whatsappUrl.indexOf('wa.me/5492214440000') !== -1);
  const codigo = decodeURIComponent(/pase=([^&]+)/.exec(cr.body.link)[1]);
  const id = cr.body.pase.id;

  const lista = await R.manejarCortesias(pedido(tokAdmin), deps);
  check('la lista del admin lo trae', lista.status === 200 && lista.body.pases.some(p => p.id === id));
  check('un cliente no ve la lista', (await R.manejarCortesias(pedido(tokBoca), deps)).status === 403);

  const cons = await R.manejarPaseConsultar(pedido(null, {}, {}, { codigo: codigo }), deps);
  check('la puerta dice equipo y vencimiento', cons.status === 200 && cons.body.equipo === BO && cons.body.diasRestantes >= 1);
  check('la puerta enmascara el WhatsApp del invitado', cons.body.whatsappPista === '•••• 0000' && JSON.stringify(cons.body).indexOf('5492214440000') === -1, cons.body);
  check('un código inventado da 404', (await R.manejarPaseConsultar(pedido(null, {}, {}, { codigo: 'x'.repeat(32) }), deps)).status === 404);

  const canje = (contacto) => R.manejarPaseCanjear(pedido(null, {}, {}, { codigo: codigo, contacto: contacto }), deps);
  check('sin WhatsApp no se entra', (await canje({ nombre: 'Gonzalo' })).status === 400);
  const c1 = await canje({ nombre: 'Gonzalo', whatsapp: '221 444 0000', rol: 'Entrenador' });
  check('con nombre y WhatsApp sale el token', c1.status === 200 && c1.body.token, c1.body);
  const v = auth.verificarToken(c1.body.token);
  check('el token es CLIENTE + PLATA con el id del pase', v.ok && v.rol === 'CLIENTE' && v.sesion.plan === 'PLATA' && v.cortesia === id);
  check('atado al torneo, la zona y el equipo', v.club === 'lnb' && v.categoria === 'lnb-unica' && v.sesion.equipoAsignado === BO);
  await canje({ nombre: 'Gonzalo', whatsapp: '2214440000' });
  let p1 = await C.leer(id, deps);
  check('el mismo WhatsApp no suma otro contacto', p1.contactos.length === 1 && p1.usos === 2);
  await canje({ nombre: 'Asistente', whatsapp: '2215550001' });
  await canje({ nombre: 'Preparador', whatsapp: '2215550002' });
  const tope = await canje({ nombre: 'Otro', whatsapp: '2215550003' });
  check('el cuarto contacto distinto choca con el tope', tope.status === 403 && tope.body.codigo === 'TOPE');
  p1 = await C.leer(id, deps);
  check('quedan anotados los tres contactos (el lead)', p1.contactos.length === 3);

  seccion('6 · El guard sobre los handlers');
  const tok = c1.body.token;
  const req = (ruta, q) => ({ method: 'GET', path: ruta, query: q || {}, headers: { authorization: 'Bearer ' + tok } });
  const g = (ruta, q) => R.validarPedido(req(ruta, q), auth.verificarToken(tok), deps);
  check('pasa al libro de su zona', !(await g('/api/v1/equipos/lnb', { categoria: 'lnb-unica' })).error);
  check('no pasa a los estados', (await g('/api/v1/estados/lnb/lnb-unica')).error.status === 403);
  check('no pasa a fichajes', (await g('/api/v1/fichajes')).error.body.codigo === 'CORTESIA_NO_INCLUYE');

  catalogo.limpiarCache();
  const conGuard = async (ruta, params, query) => {
    const rq = Object.assign(pedido(tok, params, query), { method: 'GET', path: ruta });
    const gv = await R.validarPedido(rq, auth.verificarToken(tok), deps);
    if (gv.error) return gv.error;
    rq.cortesia = gv.pase;
    return rq;
  };
  const rqCat = await conGuard('/api/v1/catalogo');
  const cat = await H.manejarCatalogo(rqCat, deps);
  check('el catálogo trae UN club y UNA categoría', cat.status === 200 && cat.body.clubes.length === 1 && cat.body.clubes[0].categorias.length === 1, cat.body);
  const club = cat.body.clubes[0];
  check('presentado como cliente de su equipo, en PLATA', club.tipo === 'cliente' && club.equipoPropio === BO && club.categorias[0].planEfectivo === 'PLATA');
  check('el usuario es PLATA y lleva el pase', cat.body.usuario.plan === 'PLATA' && cat.body.usuario.cortesia.id === id);
  check('ni un sheetId en el catálogo', JSON.stringify(cat.body).indexOf(ID_LNB) === -1);
  check('el cliente Boca no aparece', !cat.body.clubes.some(c => c.id === 'boca'));

  const rqEq = await conGuard('/api/v1/equipos/lnb', { clubId: 'lnb' }, { categoria: 'lnb-unica' });
  const datos = await H.manejarEquipos(rqEq, deps);
  check('el libro sale', datos.status === 200, datos.body);
  check('con plan PLATA y la capa pbp', datos.body.alcance.plan === 'PLATA' && datos.body.alcance.capas.indexOf('pbp') !== -1);
  check('y la marca del pase', datos.body.alcance.cortesia && datos.body.alcance.cortesia.id === id);
  const bj = datos.body.hojas['Base Datos J'];
  const iEq = bj[0].indexOf('EQUIPO');
  check('Base Datos J recortada a SU equipo', bj.length > 1 && bj.slice(1).every(f => f[iEq] === BO), bj);
  check('PROMEDIOS J completa, como un Plata (rankings con contexto)', datos.body.hojas['PROMEDIOS J'].length === 3);
  check('ni un sheetId en el libro', JSON.stringify(datos.body).indexOf(ID_LNB) === -1);

  const sinGuard = await H.manejarEquipos(pedido(tok, { clubId: 'lnb' }, { categoria: 'lnb-unica' }), deps);
  check('el handler sin el guard no atiende al pase (defensa en profundidad)', sinGuard.status === 403);
  const pbpSinGuard = await PBP.manejarPbp(pedido(tok, { clubId: 'lnb', categoria: 'lnb-unica' }, { equipo: BO }), deps);
  check('el play-by-play sin el guard tampoco', pbpSinGuard.status === 403);
  check('el guard deja pasar el play-by-play de SU equipo', !(await g('/api/v1/pbp/lnb/lnb-unica', { equipo: BO })).error);
  const rqPbp = await conGuard('/api/v1/pbp/lnb/lnb-unica', { clubId: 'lnb', categoria: 'lnb-unica' }, { equipo: BO });
  const pbpCon = await PBP.manejarPbp(rqPbp, deps);
  check('y con el guard el handler lo atiende (no un 403)', pbpCon.status !== 403, pbpCon.body);

  /* EL BUG DE v383: el cliente no pedía el paquete porque `leerPbp` miraba
     `estadosCompartibles()`, que da false para un pase. La pantalla decía
     «sin backend o sin sesión» y el servidor nunca se enteraba. */
  const DATA = require('./js/sgadd-data.js');
  const AUTHP = require('./js/sgadd-auth.js');
  DATA.configurar('https://api.prueba');
  AUTHP.establecerToken(tok);
  const pedidas = [];
  const fetchPbp = async (url) => { pedidas.push(url); return { ok: true, status: 200, json: async () => ({ ok: true, paquete: {} }) }; };
  check('el pase no comparte estados', DATA.estadosCompartibles() === false);
  const lp = await DATA.leerPbp('lnb', 'lnb-unica', BO, { fetch: fetchPbp }).catch(e => ({ error: e.message }));
  check('pero SÍ pide el play-by-play de su equipo', lp.ok === true && pedidas.length === 1 && /\/api\/v1\/pbp\/lnb\/lnb-unica\?equipo=/.test(pedidas[0]), lp);
  AUTHP.establecerToken(null);

  seccion('7 · Revocar, regenerar y vencer');
  const rev = await R.manejarCortesiasEscribir(pedido(tokAdmin, {}, {}, { accion: 'revocar', id: id }), deps);
  check('revocar', rev.status === 200 && rev.body.pase.estadoEfectivo === 'revocado');
  check('revocado, el guard corta', (await g('/api/v1/catalogo')).error.status === 403);
  check('revocado, la puerta da 404', (await R.manejarPaseConsultar(pedido(null, {}, {}, { codigo: codigo }), deps)).status === 404);
  const ext = await R.manejarCortesiasEscribir(pedido(tokAdmin, {}, {}, { accion: 'extender', id: id, dias: 3 }), deps);
  check('extender lo reactiva', ext.status === 200 && ext.body.pase.estadoEfectivo === 'activo');
  const reg = await R.manejarCortesiasEscribir(pedido(tokAdmin, {}, {}, { accion: 'regenerar', id: id }), deps);
  const codigo2 = decodeURIComponent(/pase=([^&]+)/.exec(reg.body.link)[1]);
  check('regenerar da otro código', codigo2 !== codigo);
  check('y el viejo deja de servir', (await R.manejarPaseConsultar(pedido(null, {}, {}, { codigo: codigo }), deps)).status === 404
    && (await R.manejarPaseConsultar(pedido(null, {}, {}, { codigo: codigo2 }), deps)).status === 200);
  await C.guardar(Object.assign({}, await C.leer(id, deps), { vence: '2020-01-01T23:59:59.999-03:00' }), deps);
  const venc = await g('/api/v1/catalogo');
  check('vencido, el guard corta y lo dice', venc.error && venc.error.body.codigo === 'CORTESIA_VENCIDO', venc.error && venc.error.body);

  seccion('7 bis · Fase 2: la solicitud, la aprobación y la telemetría');
  check('la solicitud exige el club y el WhatsApp', C.normalizarSolicitud({ nombre: 'Ana' }).faltan.join(',') === 'club,whatsapp');
  const sol1 = await R.manejarPaseSolicitar(pedido(null, {}, {}, { nombre: 'Ana Pérez', club: 'Club Boca', whatsapp: '221 555 0001', liga: 'LNB', motivo: 'demo' }), deps);
  check('una solicitud de la landing entra sin token', sol1.status === 200 && sol1.body.nueva === true, sol1.body);
  check('y no devuelve su id a quien la manda', !('id' in sol1.body) && !('solicitud' in sol1.body));
  const sol2 = await R.manejarPaseSolicitar(pedido(null, {}, {}, { club: 'Club Boca', whatsapp: '+54 9 221 555-0001', ciudad: 'La Plata' }), deps);
  check('el mismo WhatsApp no crea otra: suma una vez más', sol2.status === 200 && sol2.body.nueva === false);
  check('sin WhatsApp no entra', (await R.manejarPaseSolicitar(pedido(null, {}, {}, { club: 'X' }), deps)).status === 400);
  const topeSol = C.sumarSolicitud(Object.fromEntries(Array.from({ length: C.MAX_PENDIENTES }, (_, i) => ['s' + i, { estado: 'pendiente', datos: { whatsapp: String(i) } }])), { whatsapp: '5492215550999' });
  check('con el tope de pendientes, una nueva se rechaza', !topeSol.ok && topeSol.codigo === 'TOPE');

  const listaF2 = await R.manejarCortesias(pedido(tokAdmin), deps);
  const pend = (listaF2.body.solicitudes || []).filter(x => x.estado === 'pendiente');
  check('el admin ve la solicitud pendiente', pend.length === 1 && pend[0].veces === 2 && pend[0].datos.ciudad === 'La Plata' && pend[0].datos.liga === 'LNB', listaF2.body.solicitudes);
  const solId = pend[0].id;
  check('un cliente no aprueba solicitudes', (await R.manejarCortesiasEscribir(pedido(tokBoca, {}, {}, { accion: 'aprobar', solicitudId: solId }), deps)).status === 403);
  const sinEq = await R.manejarCortesiasEscribir(pedido(tokAdmin, {}, {}, { accion: 'aprobar', solicitudId: solId, torneo: 'lnb', zona: 'lnb-unica', dias: 7 }), deps);
  check('aprobar sin equipo se rechaza y la solicitud sigue pendiente', sinEq.status === 400 && (await C.leerSolicitud(solId, deps)).estado === 'pendiente');
  const apr = await R.manejarCortesiasEscribir(pedido(tokAdmin, {}, {}, { accion: 'aprobar', solicitudId: solId, torneo: 'lnb', zona: 'lnb-unica', equipo: BO, dias: 7 }), deps);
  check('aprobar emite el pase con el link y el WhatsApp del DT', apr.status === 200 && apr.body.link && apr.body.whatsappUrl.indexOf('wa.me/5492215550001') !== -1, apr.body);
  check('el pase queda con origen «solicitud» y su id', apr.body.pase.origen === 'solicitud' && apr.body.pase.solicitudId === solId && apr.body.pase.invitado.nombre === 'Ana Pérez');
  const solAp = await C.leerSolicitud(solId, deps);
  check('y la solicitud queda aprobada con el pase', solAp.estado === 'aprobada' && solAp.paseId === apr.body.pase.id);
  check('no se aprueba dos veces', (await R.manejarCortesiasEscribir(pedido(tokAdmin, {}, {}, { accion: 'aprobar', solicitudId: solId, torneo: 'lnb', zona: 'lnb-unica', equipo: BO, dias: 7 }), deps)).status === 400);
  await R.manejarPaseSolicitar(pedido(null, {}, {}, { club: 'Otro Club', whatsapp: '2215550002' }), deps);
  const otra = ((await R.manejarCortesias(pedido(tokAdmin), deps)).body.solicitudes || []).find(x => x.estado === 'pendiente');
  const desc = await R.manejarCortesiasEscribir(pedido(tokAdmin, {}, {}, { accion: 'descartar', solicitudId: otra.id }), deps);
  check('descartar la cierra sin emitir un pase', desc.status === 200 && desc.body.solicitud.estado === 'descartada' && !desc.body.link);

  const codF2 = decodeURIComponent(/pase=([^&]+)/.exec(apr.body.link)[1]);
  const canF2 = await R.manejarPaseCanjear(pedido(null, {}, {}, { codigo: codF2, contacto: { nombre: 'Ana Pérez', whatsapp: '2215550001' } }), deps);
  const tokF2 = canF2.body.token;
  const actividad = async (tk, eventos) => {
    const rq = Object.assign(pedido(tk, {}, {}, { eventos: eventos }), { method: 'POST', path: '/api/v1/pase/actividad' });
    const gv = await R.validarPedido(rq, auth.verificarToken(tk), deps);
    if (gv.error) return gv.error;
    rq.cortesia = gv.pase;
    return R.manejarPaseActividad(rq, deps);
  };
  const a1 = await actividad(tokF2, [{ tipo: 'ingreso' }, { tipo: 'vista', dato: 'principal' }, { tipo: 'vista', dato: 'scouting' },
    { tipo: 'vista', dato: 'scouting' }, { tipo: 'export', dato: 'Scouting vs Rival de muestra A' }, { tipo: 'vista', dato: '<script>' }]);
  check('el pase registra su actividad por el guard', a1.status === 200 && a1.body.sumados === 5, a1.body);
  const actF2 = await C.leerActividad(apr.body.pase.id, deps);
  check('ingresos, secciones y exportes contados', actF2.ingresos === 1 && actF2.secciones.scouting === 2 && actF2.secciones.principal === 1
    && actF2.exportes['Scouting vs Rival de muestra A'] === 1, actF2);
  check('una etiqueta que no es una sección se descarta', !Object.keys(actF2.secciones).some(k => /script/.test(k)));
  check('sin el guard, la telemetría no atiende', (await R.manejarPaseActividad(pedido(tokF2, {}, {}, { eventos: [{ tipo: 'ingreso' }] }), deps)).status === 403);
  check('un cliente no registra actividad de pase', (await R.manejarPaseActividad(pedido(tokBoca, {}, {}, { eventos: [{ tipo: 'ingreso' }] }), deps)).status === 403);
  const listaAct = await R.manejarCortesias(pedido(tokAdmin), deps);
  check('el Panel Master recibe la actividad de cada pase', (listaAct.body.pases.find(p => p.id === apr.body.pase.id) || {}).actividad.ingresos === 1);
  await C.guardar(Object.assign({}, await C.leer(apr.body.pase.id, deps), { vence: '2020-01-01T23:59:59.999-03:00' }), deps);
  const aVenc = await actividad(tokF2, [{ tipo: 'ingreso' }]);
  check('vencido, tampoco registra (el guard corta)', aVenc.status === 403 && aVenc.body.codigo === 'CORTESIA_VENCIDO');

  seccion('8 · Lo que NO se toca');
  check('el catálogo de KV no se escribió', escrituras.indexOf(catalogo.CLAVE_KV) === -1 && store[catalogo.CLAVE_KV] === catalogoAntes);
  check('el padrón de clientes no se tocó', escrituras.every(k => !/clientes/.test(k)) && !store['sgadd:clientes']);
  check('los pases, sus solicitudes y su actividad viven solo en sgadd:cortesias*', Object.keys(MEM.hashes).filter(k => Object.keys(MEM.hashes[k]).length).every(k => k === C.CLAVE || k.indexOf(C.CLAVE + ':') === 0));

  seccion('9 · El panel: la barra, el Panel Master y los rivales de muestra');
  const vm = require('vm');
  const fs = require('fs');
  const DEMO = require('./js/sgadd-demo.js');
  let tokenPanel = null;
  const ctxPanel = {
    console, setTimeout, URL, JSON, Promise, Date, Math, Number, String, encodeURIComponent,
    SGADD, SGADD_DEMO: DEMO,
    SGADD_AUTH: { token: () => tokenPanel, leerPayload: AUTH.leerPayload },
    window: { sessionStorage: { getItem: () => JSON.stringify({ equipo: BO, vence: '2099-01-10T23:59:59.999-03:00', torneo: 'Liga Nacional' }) } },
    fetch: async (url) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(String(url), 'utf8')) }),
  };
  ctxPanel.sessionStorage = ctxPanel.window.sessionStorage;
  vm.createContext(ctxPanel);
  vm.runInContext(fs.readFileSync('./js/sgadd-cortesia.js', 'utf8') + '\nthis.SGADD_CORTESIA = SGADD_CORTESIA;', ctxPanel);
  const CP = ctxPanel.SGADD_CORTESIA;
  check('sin token no hay muestra ni barra', !CP.activa() && CP.barra() === '');
  tokenPanel = c1.body.token;
  check('con el token del pase, la muestra está activa', CP.activa());
  const b = CP.barra();
  check('la barra dice equipo, días y lleva a reservar por WhatsApp', /Muestra de cortesía/.test(b) && /Boca Juniors/.test(b)
    && /te quedan \d+ días/.test(b) && b.indexOf('wa.me/5492216143994') !== -1 && /Reservar tu licencia/.test(b));
  check('los días se cuentan por calendario de Argentina', CP.diasRestantes('2026-11-21T23:59:59.999-03:00', Date.parse('2026-11-14T15:00:00Z')) === 7
    && CP.diasRestantes('2026-11-14T23:59:59.999-03:00', Date.parse('2026-11-14T15:00:00Z')) === 1
    && CP.diasRestantes('2026-11-13T23:59:59.999-03:00', Date.parse('2026-11-14T15:00:00Z')) === 0);
  check('el servidor cuenta igual', C.diasRestantes({ estado: 'activo', vence: '2026-11-21T23:59:59.999-03:00' }, { ahora: '2026-11-14T15:00:00Z' }) === 7);
  const A = CP._adm.f;
  Object.assign(A, { torneo: 'lnb', zona: 'lnb-unica', equipo: BO, dias: 7, diasLibre: '', nombre: 'Juan', whatsapp: '' });
  check('el Panel Master exige el WhatsApp', CP.faltanAdmin().indexOf('su WhatsApp') !== -1);
  A.whatsapp = '221 444 0000';
  check('con WhatsApp no falta nada', CP.faltanAdmin().length === 0);
  A.diasLibre = '61';
  check('días personalizados fuera de rango se rechazan', CP.faltanAdmin().some(x => /vigencia/.test(x)));
  A.diasLibre = '22';
  check('días personalizados válidos', CP.faltanAdmin().length === 0);
  const htmlAdm = (CP.adminToggle(true), CP.adminHtml([{ id: 'lnb', tipo: 'torneo', nombre: 'LNB',
    categorias: [{ slug: 'lnb-unica', label: 'Zona única', activo: true, equipos: [{ nombre: BO }] }, { slug: 'lnb-post', interzonal: true, activo: true }] }]));
  check('los días rápidos 3 · 5 · 7 · 10 · 15 y el campo libre', [3, 5, 7, 10, 15].every(d => htmlAdm.indexOf('>' + d + ' días<') !== -1) && /Días personalizados/.test(htmlAdm));
  check('la postemporada no se ofrece como zona del pase', htmlAdm.indexOf('lnb-post') === -1);

  const riv = await CP.cargarRivales();
  check('tres rivales de muestra del snapshot de la demo', riv.length === 3 && riv.every(r => /^Rival de muestra [ABC]$/.test(r.nombre)), riv);
  const serialR = await CP.serial(riv[0].clave);
  check('anonimizados: equipo y jugadores con el patrón de la demo', /^EQUIPO \d+$/.test(serialR.equipo.clave)
    && (serialR.equipo.jugadores || []).every(j => /^JUGADOR \d+$/.test(j.nombre || j.NOMBRES || j.__nombre || 'JUGADOR 0')));
  check('medido contra su propia liga, rotulada «de muestra»', serialR.equipo.__ligaOrigen && serialR.equipo.__ligaOrigen.label === 'Liga de muestra');
  const idxLiga = SGADD.construirIndice(DEMO.rehidratar(require('./demo/datos-demo.json')), { fase: 'REGULAR', torneo: 'GENERAL' });
  const copia = SGADD.construirIndice({ 'Base Datos E': { cols: cols, filas: filasE.map(f => Object.fromEntries(cols.map((c, i) => [c, f[i]]))) } }, { fase: 'REGULAR', torneo: 'GENERAL' });
  check('el rival se injerta en la copia del Scouting', copia.injertarEquipo(serialR) && !!copia.get(riv[0].clave) && !!idxLiga);

  const fuenteScout = fs.readFileSync('./js/sgadd-scouting.js', 'utf8');
  check('Scouting suelta a un rival de la liga elegido por el hash', /scoutCortesia\(\)[\s\S]{0,900}esRivalDeMuestra\(k\)\) SCOUT_UI\[l\] = null/.test(fuenteScout));
  check('y el selector solo ofrece al equipo propio', /!cortesia \|\| SGADD\.esEquipoPropio\(e\.clave\)/.test(fuenteScout));

  seccion('10 · Fase 2 en el panel: telemetría, cierre, firma del PDF y aprobar');
  const memoria = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
  const lotes = [];
  let venceInfo = '2099-01-10T23:59:59.999-03:00';
  const ss2 = memoria();
  const nodos = {};
  const ctx2 = {
    console, setTimeout: (f) => { ctx2.__pend = f; return 1; }, clearTimeout() {}, setInterval() { return 1; }, URL, JSON, Promise, Date, Math, Number, String, encodeURIComponent,
    SGADD, SGADD_AUTH: { token: () => tokenPanel, leerPayload: AUTH.leerPayload },
    SGADD_DATA: { paseActividad: async (l) => { lotes.push(l); return { ok: true }; } },
    window: { sessionStorage: { getItem: (k) => (k === 'sgadd.paseInfo' ? JSON.stringify({ equipo: BO, vence: venceInfo, torneo: 'Liga Nacional' }) : ss2.getItem(k)), setItem: ss2.setItem },
      localStorage: memoria(), location: { href: '' } },
    document: { getElementById: (id) => nodos[id] || null, createElement: () => ({ set id(v) { nodos[v] = this; } }), body: { appendChild() {}, insertAdjacentHTML() {} } },
  };
  vm.createContext(ctx2);
  vm.runInContext(fs.readFileSync('./js/sgadd-cortesia.js', 'utf8') + '\nthis.SGADD_CORTESIA = SGADD_CORTESIA;', ctx2);
  const C2 = ctx2.SGADD_CORTESIA;
  check('el ingreso se registra una vez por sesión', C2.registrar('ingreso') && !C2.registrar('ingreso'));
  check('una vista por sección y por sesión', C2.registrar('vista', 'scouting') && !C2.registrar('vista', 'scouting') && C2.registrar('vista', 'equipos'));
  check('una sección inventada no se registra', !C2.registrar('vista', '<img>'));
  check('cada PDF cuenta', C2.registrar('export', 'Scouting vs Rival de muestra A') && C2.registrar('export', 'Scouting vs Rival de muestra A'));
  await ctx2.__pend();
  check('todo va al servidor en UN lote', lotes.length === 1 && lotes[0].length === 5 && lotes[0][0].tipo === 'ingreso', lotes);
  const res2 = C2.resumen();
  check('el resumen de cierre trae lo explorado', res2.ingresos === 1 && res2.secciones.map(x => x.nombre).join(',') === 'Equipos,Scouting' && res2.totalExportes === 2, res2);
  check('la firma del PDF dice muestra y vencimiento', C2.firmaPdf() === 'Muestra de cortesía · MotorStats AR · vence 10/01/2099');
  check('vigente, no hay cierre', !C2.vencida());
  venceInfo = '2020-01-01T23:59:59.999-03:00';
  check('vencida, se sabe sin preguntarle al servidor', C2.vencida());
  const fin = C2.finHtml('CORTESIA_VENCIDO');
  check('«Tu muestra terminó» con lo explorado y el CTA', /Tu muestra terminó/.test(fin) && /Scouting/.test(fin) && /Exportaste 2 informes/.test(fin)
    && /Reservar tu licencia por WhatsApp/.test(fin) && fin.indexOf('wa.me/5492216143994') !== -1, fin);
  check('el cierre no se descarta con un clic afuera ni con Esc', !/onclick="[^"]*cerrar/.test(fin) && /Volver al inicio/.test(fin));
  check('convertido, invita a entrar con su usuario', /Ingresar/.test(C2.finHtml('CORTESIA_CONVERTIDO')) && !/Reservar/.test(C2.finHtml('CORTESIA_CONVERTIDO')));
  check('iniciarMuestra con el pase vencido muestra el cierre', C2.iniciarMuestra() === true && /Tu muestra terminó/.test(nodos.cortesiaSlot.innerHTML));
  tokenPanel = null;
  check('fuera de un pase no registra nada ni firma', !C2.registrar('vista', 'principal') && C2.firmaPdf() === '');
  tokenPanel = c1.body.token;

  const UIP = require('./js/sgadd-ui.js');
  const cab = UIP.encabezadoInforme({ liga: { nombre: 'Liga Nacional' }, equipo: { nombre: 'Boca' }, cortesia: 'Muestra de cortesía · MotorStats AR · vence 21/11/2026' });
  check('el encabezado de cada hoja lleva la firma de la muestra', /class="cabecera-cortesia">Muestra de cortesía · MotorStats AR · vence 21\/11\/2026</.test(cab));
  check('y sin pase, el encabezado es el de siempre', !/cabecera-cortesia/.test(UIP.encabezadoInforme({ liga: { nombre: 'X' } })));
  const fuenteUi = fs.readFileSync('./js/sgadd-ui.js', 'utf8');
  check('toda exportación cuenta: el registro va en tituloPdf', /function tituloPdf[\s\S]{0,700}SGADD_CORTESIA\.registrar\('export'/.test(fuenteUi));
  check('las secciones se registran al pintar', /SGADD_CORTESIA\.registrar\('vista', section\)/.test(fs.readFileSync('./index.html', 'utf8')));

  const csSug = [{ id: 'lnb', tipo: 'torneo', nombre: 'Liga Nacional 2026-27', categorias: [{ slug: 'lnb-unica', label: 'Única', activo: true,
    equipos: [{ nombre: 'BOCA JUNIORS' }, { nombre: 'OBERA TENIS' }, { nombre: 'CLUB ATLETICO PEÑAROL' }] }] },
    { id: 'apb', tipo: 'torneo', nombre: 'APB 2026', categorias: [{ slug: 'apb-a', activo: true, equipos: [{ nombre: "ATENAS 'A'" }, { nombre: 'BOCA LP' }] }] }];
  const sug = C2.sugerirEquipo({ datos: { club: 'Club Atlético Boca Juniors', liga: 'Liga Nacional' } }, csSug);
  check('propone el equipo del catálogo por el club y la liga', sug && sug.equipo === 'BOCA JUNIORS' && sug.zona === 'lnb-unica', sug);
  check('sin la liga y con dos «Boca», no propone a ciegas', C2.sugerirEquipo({ datos: { club: 'Boca' } }, csSug) === null);
  check('«Club Atlético» no alcanza para proponer', C2.sugerirEquipo({ datos: { club: 'Club Atlético' } }, csSug) === null);

  console.log('\n' + (mal ? '✗ ' + mal + ' FALLARON' : '✓ todos') + ' · ' + ok + ' ok');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
