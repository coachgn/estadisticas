/* =====================================================================
   LA ESTRUCTURA DE CLIENTES · el club es el padre, la categoría el hijo

   Pedido del club (2026-09-13): un club con Primera en ORO, la U23 en
   PLATA y la U19 en prueba, que se pueda pausar de a una y que el panel
   haga valer el plan de la categoría ABIERTA y no uno global del club.

   Lo que se fija acá, y EJERCIENDO el código real —los handlers con un
   Upstash de mentira, y los módulos del navegador en un `vm`—, no leyendo
   el fuente:

     a) el alta de un cliente de UNA categoría (el «cliente suelto»);
     b) sumarle una segunda categoría con las mismas credenciales, sin
        tocar su identidad, sus accesos, sus zonas ni sus estados;
     c) planes mixtos y el gating por la categoría activa, del lado del
        servidor Y del panel;
     d) la pausa selectiva: una categoría cortada y las demás andando.

   Ver el punto 60 de CLAUDE.md.
   ===================================================================== */
'use strict';
const fs = require('fs');
const vm = require('vm');
require('./server/lib/env.js').cargar();

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

/* ------------------------------------------------------ Upstash de mentira */
const kv = require('./server/lib/kv.js');
const store = {};
const hashes = {};
const ops = [];
kv.configurado = () => true;
kv.leer = async (k) => { ops.push('GET ' + k); return { valor: store[k] !== undefined ? JSON.parse(store[k]) : null, error: null }; };
kv.escribir = async (k, v) => { ops.push('SET ' + k); store[k] = JSON.stringify(v); };
kv.borrar = async (k) => { ops.push('DEL ' + k); delete store[k]; delete hashes[k]; };
kv.leerHash = async (k) => {
  ops.push('HGETALL ' + k);
  const h = hashes[k] || {}; const out = {};
  Object.keys(h).forEach(c => { out[c] = JSON.parse(h[c]); });
  return out;
};
kv.leerCampos = async (k, campos) => {
  ops.push('HMGET ' + k);
  const h = hashes[k] || {}; const out = {};
  campos.forEach(c => { if (h[c] !== undefined) out[c] = JSON.parse(h[c]); });
  return out;
};
kv.escribirCampos = async (k, mapa) => {
  ops.push('HSET ' + k);
  hashes[k] = hashes[k] || {};
  Object.keys(mapa).forEach(c => { hashes[k][c] = JSON.stringify(mapa[c]); });
  return Object.keys(mapa).length;
};
kv.tamanoHash = async (k) => Object.keys(hashes[k] || {}).length;

const auth = require('./server/lib/auth.js');
const catalogo = require('./server/lib/catalogo.js');
const clientes = require('./server/lib/clientes.js');
const mutar = require('./server/lib/catalogo-mutar.js');
const sheets = require('./server/lib/google-sheets.js');
const H = require('./server/api/handlers.js');
const EST = require('./server/api/estados.js');
const AUTH = require('./js/sgadd-auth.js');

/* Un libro mínimo: los handlers de datos lo recortan y lo devuelven. Lo que
   se mide acá es QUÉ PLAN Y QUÉ ESTADO declaran, no las hojas. */
const LIBRO = () => ({ hojas: { 'PROMEDIOS J': [['NOMBRES', 'EQUIPO', 'MIN'], ['PEREZ, JUAN', 'SUD AMERICA LP', 20]] },
  hojasTexto: {}, faltantes: [], leidoEn: 1 });
sheets.obtenerLibro = async () => LIBRO();

/* Un club YA EXISTENTE en el catálogo, con lo que vive solo en KV: plan,
   zonas publicadas y partidos cargados a mano. Es lo que ninguna
   operación sobre OTRO club puede tocar. */
const CAT = {
  deportivo: {
    nombre: 'Deportivo La Plata', liga: 'la-plata', equipoPropio: 'DEPORTIVO LA PLATA', plan: 'PLATA',
    categorias: { 'deportivo-primera': { label: 'Primera 2026', sheetId: 'SHEETDEPORTIVO0000000000' } },
    competencia: { formatos: { f: { zonas: [{ id: 'playoffs', desde: 1, hasta: 8, tono: 'positivo' }] } }, porTramo: { '*': 'f' } },
    partidosManuales: { 'deportivo-primera': { 'IDA|REGULAR': [
      { id: 'm1', fecha: '2026-07-09', local: 'DEPORTIVO LA PLATA', puntosLocal: 70, visitante: 'ATENAS A', puntosVisitante: 60 }] } },
  },
};
store[catalogo.CLAVE_KV] = JSON.stringify(CAT);

const tokAdmin = auth.firmarToken({ email: 'freytesgn@gmail.com' }, { expiraEn: '1h' });
const tokSud = auth.firmarToken({ email: 'dt@sudamerica.com', club: 'sudamerica', equipoAsignado: 'SUD AMERICA LP', plan: 'BRONCE' }, { expiraEn: '1h' });

const pedido = (tok, params, body, query) => ({
  headers: tok ? { authorization: 'Bearer ' + tok } : {},
  params: params || {}, body: body || {}, query: query || {},
});
const escribir = (body) => H.manejarCatalogoEscribir(pedido(tokAdmin, {}, body));
const leerCat = () => JSON.parse(store[catalogo.CLAVE_KV]);
const catPublico = async (tok) => { catalogo.limpiarCache(); return H.manejarCatalogo(pedido(tok)); };
const equipos = async (tok, club, cat) => { catalogo.limpiarCache(); return H.manejarEquipos(pedido(tok, { clubId: club }, {}, { categoria: cat })); };

(async () => {

  /* =====================================================================
     1 · EL MOTOR COMPARTIDO
     ===================================================================== */
  titulo('1 · LA CASCADA · plan y estado de la categoría, con herencia del club');

  const club = {
    plan: 'PLATA',
    categorias: {
      primera: { label: 'Primera', plan: 'ORO' },
      u23: { label: 'U23' },
      u19: { label: 'U19', plan: 'BRONCE', estado: 'pausado' },
      u17: { label: 'U17', estado: 'prueba' },
    },
  };
  const s = (slug, c) => AUTH.suscripcionDeCategoria(c || club, slug);
  check('una categoría con plan propio usa el suyo', s('primera').plan === 'ORO' && s('primera').planDe === 'categoria');
  check('una sin plan hereda el del club', s('u23').plan === 'PLATA' && s('u23').planDe === 'club');
  check('sin plan en ninguno de los dos, `plan` es null (lo decide el servidor)',
    AUTH.suscripcionDeCategoria({ categorias: { x: {} } }, 'x').plan === null);
  check('una categoría pausada no tiene acceso', s('u19').estado === 'pausado' && s('u19').acceso === false);
  check('y dice que la pausa es SUYA', s('u19').estadoDe === 'categoria');
  check('en prueba TIENE acceso', s('u17').estado === 'prueba' && s('u17').acceso === true);
  check('las demás del mismo club siguen activas', s('primera').acceso && s('u23').acceso);

  const pausadoEntero = Object.assign({}, club, { estado: 'pausado' });
  check('un club pausado corta TODAS sus categorías, aunque digan otra cosa',
    ['primera', 'u23', 'u17'].every(k => !s(k, pausadoEntero).acceso && s(k, pausadoEntero).estadoDe === 'club'));
  const vencido = Object.assign({}, club, { vence: '2020-01-01' });
  check('un club vencido corta todas, la prueba incluida',
    AUTH.estadoSuscripcion(vencido) === 'vencido' && !s('u17', vencido).acceso);
  check('un club en prueba con la fecha pasada también vence',
    AUTH.estadoSuscripcion({ estado: 'prueba', vence: '2020-01-01' }) === 'vencido');
  check('un estado que no se reconoce se lee como «hereda»',
    AUTH.suscripcionDeCategoria({ categorias: { x: { estado: 'raro' } } }, 'x').estadoDe === 'club');

  check('el plan del club como TITULAR es el más alto que tiene activo', AUTH.planDelClub(club) === 'ORO');
  check('una categoría pausada no suma para el titular',
    AUTH.planDelClub({ plan: 'BRONCE', categorias: { a: { plan: 'ORO', estado: 'pausado' }, b: {} } }) === 'BRONCE');

  /* RETROCOMPATIBILIDAD · el catálogo de hoy tiene todo en el club. */
  const viejo = { plan: 'PRO', estado: 'activo', categorias: { unica: { label: 'Primera', sheetId: 'X' } } };
  check('un club de hoy (plan en el club, nombre viejo PRO) se lee igual: PLATA',
    AUTH.suscripcionDeCategoria(viejo, 'unica').plan === 'PLATA');
  check('y el servidor le hace valer lo mismo que antes',
    H.planEfectivo(catalogo.resolver({ v: Object.assign({ nombre: 'V' }, viejo) }, 'v', 'unica').suscripcion, null, 'kv') === 'PLATA');
  check('el Panel Master pinta los mismos estados que el motor compartido',
    JSON.stringify(require('./js/sgadd-hub.js').ESTADOS) === JSON.stringify(AUTH.ESTADOS_SUSCRIPCION));

  /* =====================================================================
     2 · a) EL CLIENTE SUELTO · un club con una sola categoría
     ===================================================================== */
  titulo('2 · ALTA NUEVA · club + categoría inicial + plan');

  const r1 = await escribir({ accion: 'alta', club: 'sudamerica', nombre: 'Sud América La Plata', liga: 'la-plata',
    equipoPropio: 'SUD AMERICA LP', acento: '#0d5e27', categoria: 'sudamerica-primera', label: 'Primera 2026',
    libroDe: 'deportivo/deportivo-primera', plan: 'PLATA' });
  check('el alta sale bien', r1.status === 200 && r1.body.creoClub === true, JSON.stringify(r1.body).slice(0, 160));
  let enKV = leerCat();
  check('el club queda con UNA categoría', Object.keys(enKV.sudamerica.categorias).length === 1);
  check('el plan va a la CATEGORÍA, no al club',
    enKV.sudamerica.categorias['sudamerica-primera'].plan === 'PLATA' && enKV.sudamerica.plan === undefined);
  check('el libro se copió en el servidor', enKV.sudamerica.categorias['sudamerica-primera'].sheetId === CAT.deportivo.categorias['deportivo-primera'].sheetId);
  check('y la respuesta no trae el id del libro', JSON.stringify(r1.body).indexOf('SHEETDEPORTIVO') === -1);
  check('el club que ya estaba no se tocó', JSON.stringify(enKV.deportivo) === JSON.stringify(CAT.deportivo));

  const malo = await escribir({ accion: 'alta', club: 'otro', nombre: 'Otro', equipoPropio: 'X',
    categoria: 'otro-primera', label: 'P', libroDe: 'deportivo/deportivo-primera', plan: 'PLATINO' });
  check('un plan que no existe se RECHAZA en el alta (no cae al más bajo)', malo.status === 400 && /Plan desconocido/.test(malo.body.mensaje));

  const pubSuelto = await catPublico(tokSud);
  const suyo = pubSuelto.body.clubes.find(c => c.id === 'sudamerica');
  check('el cliente recibe el plan de SU categoría', suyo.categorias[0].planEfectivo === 'PLATA', JSON.stringify(suyo.categorias[0]));
  check('y su usuario queda con ese plan, aunque su link diga BRONCE', pubSuelto.body.usuario.plan === 'PLATA');
  const ajeno = pubSuelto.body.clubes.find(c => c.id === 'deportivo');
  check('del club AJENO no le llega ni plan ni estado', ajeno.categorias[0].planEfectivo === undefined && ajeno.plan === undefined);

  /* EL APP DEL CLIENTE SUELTO · entra directo a su única categoría. */
  const app1 = appCon([planillaDe(suyo.categorias[0])]);
  app1.SGADD_APP.inicializar();
  check('con una sola categoría el panel abre en ella, sin pasos', app1.SGADD_APP.estado.planillaId === 'sudamerica-primera');

  /* =====================================================================
     3 · b) EXPANDIR EL CLUB · segunda categoría, mismas credenciales
     ===================================================================== */
  titulo('3 · EXPANDIR · una segunda categoría sin tocar la identidad ni los datos');

  /* Lo que el club ya tiene y NO puede perder: un acceso con clave y
     estados de jugador marcados por el cuerpo técnico. */
  let padron = {};
  const inv = clientes.alta(padron, 'dt@sudamerica.com', 'sudamerica', { plan: 'PLATA' });
  padron = inv.padron;
  const fij = await clientes.fijarClave(padron, 'dt@sudamerica.com', inv.codigo, 'una-clave-larga-123');
  store[clientes.CLAVE_KV] = JSON.stringify(fij.padron);
  const padronAntes = store[clientes.CLAVE_KV];
  const HASH = EST.claveKV('sudamerica', 'sudamerica-primera');
  hashes[HASH] = { 'PEREZ, JUAN|SUD AMERICA LP': JSON.stringify({ estado: 'SUSPENSO', origen: 'usuario', nota: 'esguince', actualizado: 1 }) };
  const hashAntes = JSON.stringify(hashes[HASH]);
  /* Zonas propias del club, publicadas antes de expandir. */
  enKV = leerCat();
  enKV.sudamerica.competencia = { formatos: { g: { zonas: [{ id: 'z', desde: 1, hasta: 4, tono: 'exito' }] } }, porTramo: { '*': 'g' } };
  store[catalogo.CLAVE_KV] = JSON.stringify(enKV);
  const identidad = (c) => JSON.stringify([c.nombre, c.liga, c.equipoPropio, c.acento, c.competencia]);
  const idAntes = identidad(enKV.sudamerica);
  ops.length = 0;

  const r2 = await escribir({ accion: 'alta', club: 'sudamerica', categoria: 'sudamerica-u23', label: 'U23 2026',
    sheetId: 'SHEETU23000000000000000000', plan: 'ORO' });
  check('la categoría nueva entra', r2.status === 200 && r2.body.creoClub === false, JSON.stringify(r2.body).slice(0, 160));
  enKV = leerCat();
  check('el club tiene DOS categorías', Object.keys(enKV.sudamerica.categorias).length === 2);
  check('la nueva con su plan', enKV.sudamerica.categorias['sudamerica-u23'].plan === 'ORO');
  check('la primera conserva el suyo', enKV.sudamerica.categorias['sudamerica-primera'].plan === 'PLATA');
  check('nombre, liga, equipo, color y zonas del club intactos', identidad(enKV.sudamerica) === idAntes);
  check('los accesos del club (mails y claves) no se tocaron', store[clientes.CLAVE_KV] === padronAntes);
  check('los estados de la campana no se tocaron', JSON.stringify(hashes[HASH]) === hashAntes);
  check('la única escritura fue la del catálogo: ni HSET, ni DEL, ni el padrón',
    ops.filter(o => /^(SET|HSET|DEL)/.test(o)).join(',') === 'SET ' + catalogo.CLAVE_KV, ops.join(','));

  const sinEstado = await escribir({ accion: 'alta', club: 'sudamerica', categoria: 'sudamerica-u23', label: 'U23 · Clausura' });
  check('editar la etiqueta sin mandar plan NO le borra el plan',
    sinEstado.status === 200 && leerCat().sudamerica.categorias['sudamerica-u23'].plan === 'ORO');

  /* MISMAS CREDENCIALES: el login devuelve el mismo club y ve las dos. */
  catalogo.limpiarCache();
  const login = await H.manejarLogin(pedido(null, {}, { email: 'dt@sudamerica.com', clave: 'una-clave-larga-123' }));
  check('el mismo mail y la misma clave siguen entrando', login.status === 200 && login.body.club === 'sudamerica', JSON.stringify(login.body).slice(0, 120));
  check('el link se firma con el plan del club como titular: el más alto (ORO)', login.body.plan === 'ORO');
  const tokLogin = login.body.token;
  const pub2 = await catPublico(tokLogin);
  const suyo2 = pub2.body.clubes.find(c => c.id === 'sudamerica');
  check('con ese token el cliente ve sus DOS categorías', suyo2.categorias.length === 2);
  check('cada una con su plan', suyo2.categorias.map(k => k.slug + ':' + k.planEfectivo).sort().join(',')
    === 'sudamerica-primera:PLATA,sudamerica-u23:ORO', JSON.stringify(suyo2.categorias));

  const cupo = await H.manejarClientes(pedido(tokAdmin, {}, {}, { club: 'sudamerica' }));
  check('el cupo de mails es el del titular (ORO · 4), el mismo para las dos categorías',
    cupo.status === 200 && cupo.body.clubes[0].cupo.tope === AUTH.cupoDeMails('ORO'), JSON.stringify(cupo.body).slice(0, 200));

  /* =====================================================================
     4 · c) PLANES MIXTOS · el gating mira la categoría ACTIVA
     ===================================================================== */
  titulo('4 · PLANES MIXTOS · ORO en una, PLATA en otra, BRONCE en una tercera');

  await escribir({ accion: 'alta', club: 'sudamerica', categoria: 'sudamerica-u19', label: 'U19',
    sheetId: 'SHEETU19000000000000000000', plan: 'BRONCE' });

  const eP = await equipos(tokLogin, 'sudamerica', 'sudamerica-primera');
  const eU23 = await equipos(tokLogin, 'sudamerica', 'sudamerica-u23');
  check('los datos de Primera declaran PLATA', eP.status === 200 && eP.body.alcance.plan === 'PLATA', eP.status + ' ' + JSON.stringify(eP.body).slice(0, 120));
  check('y los de la U23, ORO', eU23.status === 200 && eU23.body.alcance.plan === 'ORO');
  check('la ficha por jugador (ORO) se concede en la U23', eU23.body.alcance.bloques['scouting.fichas'] === true);
  check('y NO en Primera, del mismo club y con el mismo token', eP.body.alcance.bloques['scouting.fichas'] === false);

  const scU19 = await H.manejarScouting(pedido(tokLogin, { clubId: 'sudamerica' }, {},
    { categoria: 'sudamerica-u19', local: 'SUD AMERICA LP', visitante: 'ATENAS A' }));
  const scU23 = await H.manejarScouting(pedido(tokLogin, { clubId: 'sudamerica' }, {},
    { categoria: 'sudamerica-u23', local: 'SUD AMERICA LP', visitante: 'ATENAS A' }));
  check('el scouting de la U19 (BRONCE) se niega, aunque el link diga ORO', scU19.status === 403 && scU19.body.codigo === 'REQUIERE_PLAN', scU19.status);
  check('el de la U23 (ORO) se sirve', scU23.status === 200, scU23.status + ' ' + (scU23.body.mensaje || ''));

  /* EL PANEL · el menú adopta el plan de la categoría que se abre. */
  const pub3 = await catPublico(tokLogin);
  const cats3 = pub3.body.clubes.find(c => c.id === 'sudamerica').categorias.map(planillaDe);
  const app = appCon(cats3, { rol: 'CLIENTE' });
  app.SGADD_APP.inicializar();
  app.SGADD_APP.estado.planillaId = 'sudamerica-u23';
  await app.SGADD_APP.cargar();
  check('al abrir la U23 el panel adopta ORO ANTES de pedir los datos',
    app.log.join(',').indexOf('adopta:ORO,datos:sudamerica-u23') === 0, app.log.join(','));
  app.log.length = 0;
  app.SGADD_APP.cambiarPlanilla('sudamerica-u19');
  await new Promise(r => setTimeout(r, 10));
  check('y al cambiar a la U19 adopta BRONCE', app.log.join(',').indexOf('adopta:BRONCE,datos:sudamerica-u19') === 0, app.log.join(','));

  const sesionOro = AUTH.parsearSesion({ email: 'dt@sudamerica.com', plan: 'ORO', equipoAsignado: 'SUD AMERICA LP' });
  const sesionPlata = AUTH.parsearSesion({ email: 'dt@sudamerica.com', plan: 'PLATA', equipoAsignado: 'SUD AMERICA LP' });
  check('con la sesión en ORO el panel pinta la ficha por jugador',
    AUTH.puedoVerBloque('scouting.fichas', sesionOro).ok === true);
  check('con la de PLATA, no', AUTH.puedoVerBloque('scouting.fichas', sesionPlata).ok === false);

  const suf = app.SGADD_APP.sufijoCategoria;
  check('el selector dice el plan de cada categoría', suf({ activo: true, plan: 'ORO' }) === ' · ORO');
  check('y marca la que está en prueba', suf({ activo: true, plan: 'PLATA', estado: 'prueba' }) === ' · PLATA · en prueba');
  check('una sin libro sigue diciendo «sin datos»', suf({ activo: false }) === ' — sin datos');

  /* =====================================================================
     5 · d) PAUSA SELECTIVA
     ===================================================================== */
  titulo('5 · PAUSA SELECTIVA · una categoría cortada, las demás andando');

  ops.length = 0;
  /* La foto va ACÁ y no en la sección 3: el login de arriba anota el
     último ingreso en el padrón, que es un cambio legítimo y no de pausar. */
  const padronPrePausa = store[clientes.CLAVE_KV];
  const pausa = await escribir({ accion: 'cambiar_estado', club: 'sudamerica', categoria: 'sudamerica-u19', estado: 'pausado' });
  check('se pausa SOLO la U19', pausa.status === 200, JSON.stringify(pausa.body).slice(0, 160));
  enKV = leerCat();
  check('el estado queda en la categoría', enKV.sudamerica.categorias['sudamerica-u19'].estado === 'pausado');
  check('el club sigue sin estado propio (activo)', enKV.sudamerica.estado === undefined);
  check('las otras dos no tienen estado escrito', !enKV.sudamerica.categorias['sudamerica-primera'].estado
    && !enKV.sudamerica.categorias['sudamerica-u23'].estado);
  check('pausar no tocó los estados de jugador ni los accesos',
    JSON.stringify(hashes[HASH]) === hashAntes && store[clientes.CLAVE_KV] === padronPrePausa
    && ops.filter(o => /^(HSET|DEL)/.test(o)).length === 0);

  const d19 = await equipos(tokLogin, 'sudamerica', 'sudamerica-u19');
  check('los datos de la U19 se niegan', d19.status === 403 && d19.body.codigo === 'SUSCRIPCION_PAUSADO', d19.status);
  check('y el mensaje dice que es ESA categoría', /categoría/.test(d19.body.mensaje) && /otras categorías/.test(d19.body.mensaje), d19.body.mensaje);
  const dP = await equipos(tokLogin, 'sudamerica', 'sudamerica-primera');
  check('Primera sigue sirviendo datos', dP.status === 200);
  check('y la U23 también', (await equipos(tokLogin, 'sudamerica', 'sudamerica-u23')).status === 200);
  const dAdm = await equipos(tokAdmin, 'sudamerica', 'sudamerica-u19');
  check('el admin sí entra a la pausada, para poder revisarla', dAdm.status === 200);

  catalogo.limpiarCache();
  const est19 = await EST.manejarEstados(pedido(tokLogin, { clubId: 'sudamerica', categoria: 'sudamerica-u19' }));
  const estP = await EST.manejarEstados(pedido(tokLogin, { clubId: 'sudamerica', categoria: 'sudamerica-primera' }));
  check('los estados compartidos de la U19 también se cortan', est19.status === 403);
  check('los de Primera siguen, con lo que el cuerpo técnico marcó', estP.status === 200
    && estP.body.estados['PEREZ, JUAN|SUD AMERICA LP'].nota === 'esguince', JSON.stringify(estP.body).slice(0, 140));

  const pub4 = await catPublico(tokLogin);
  const cats4 = pub4.body.clubes.find(c => c.id === 'sudamerica').categorias;
  const u19 = cats4.find(k => k.slug === 'sudamerica-u19');
  check('el cliente la recibe BLOQUEADA y con su estado', u19.bloqueada === true && u19.estadoEfectivo === 'pausado');
  check('las otras dos, no', cats4.filter(k => k.bloqueada).length === 1);
  const pubAdm = await catPublico(tokAdmin);
  const u19adm = pubAdm.body.clubes.find(c => c.id === 'sudamerica').categorias.find(k => k.slug === 'sudamerica-u19');
  check('al admin le llega lo declarado y lo efectivo, sin «bloqueada»',
    u19adm.estado === 'pausado' && u19adm.estadoEfectivo === 'pausado' && u19adm.bloqueada === undefined);

  const app4 = appCon(cats4.map(planillaDe), { rol: 'CLIENTE', hash: '#/sudamerica-u19/equipos' });
  app4.SGADD_APP.inicializar();
  check('un link a la categoría pausada abre en una que anda', app4.SGADD_APP.estado.planillaId !== 'sudamerica-u19'
    && app4.SGADD_APP.estado.planillaId, app4.SGADD_APP.estado.planillaId);
  const club4 = crearClub();
  const cfg4 = club4.reconciliarConfig(null, pub4.body.clubes.find(c => c.id === 'sudamerica'), {});
  const p19 = cfg4.planillas.find(p => p.slug === 'sudamerica-u19');
  check('el panel la marca como no abrible', p19.activo === false && p19.bloqueada === true);
  check('y el selector dice por qué: pausada, no «sin datos»', app4.SGADD_APP.sufijoCategoria(p19) === ' — pausada');

  const prop = mutar.aplicar(leerCat(), 'cambiar_estado',
    { club: 'sudamerica', categoria: 'sudamerica-u19', estado: 'pausado', alcance: 'libro' }, catalogo.validar);
  check('pausar una categoría no se propaga a otros clientes', prop.ok === false);

  const vuelve = await escribir({ accion: 'reactivar', club: 'sudamerica', categoria: 'sudamerica-u19' });
  enKV = leerCat();
  check('reactivar la categoría le BORRA el estado: vuelve a heredar el del club',
    vuelve.status === 200 && enKV.sudamerica.categorias['sudamerica-u19'].estado === undefined);
  check('y vuelve a servir datos', (await equipos(tokLogin, 'sudamerica', 'sudamerica-u19')).status === 200);

  await escribir({ accion: 'probar', club: 'sudamerica', categoria: 'sudamerica-u19' });
  check('en prueba la categoría tiene acceso', (await equipos(tokLogin, 'sudamerica', 'sudamerica-u19')).status === 200);
  check('y queda marcada como prueba', leerCat().sudamerica.categorias['sudamerica-u19'].estado === 'prueba');

  await escribir({ accion: 'pausar', club: 'sudamerica' });
  check('pausar el CLUB sí corta las tres', (await Promise.all(['sudamerica-primera', 'sudamerica-u23', 'sudamerica-u19']
    .map(k => equipos(tokLogin, 'sudamerica', k)))).every(r => r.status === 403));
  catalogo.limpiarCache();
  const loginPausado = await H.manejarLogin(pedido(null, {}, { email: 'dt@sudamerica.com', clave: 'una-clave-larga-123' }));
  check('y el login lo dice en la puerta', loginPausado.status === 403, loginPausado.status);
  await escribir({ accion: 'reactivar', club: 'sudamerica' });

  for (const k of ['sudamerica-primera', 'sudamerica-u23', 'sudamerica-u19']) {
    await escribir({ accion: 'cambiar_estado', club: 'sudamerica', categoria: k, estado: 'pausado' });
  }
  catalogo.limpiarCache();
  const loginTodas = await H.manejarLogin(pedido(null, {}, { email: 'dt@sudamerica.com', clave: 'una-clave-larga-123' }));
  check('con TODAS sus categorías pausadas de a una, tampoco entra',
    loginTodas.status === 403 && loginTodas.body.codigo === 'SUSCRIPCION_CATEGORIAS', loginTodas.status + ' ' + (loginTodas.body.codigo || ''));

  /* =====================================================================
     6 · EL PANEL MASTER · lo que ve y lo que manda
     ===================================================================== */
  titulo('6 · PANEL MASTER · plan y estado por fila, y el plan en el alta');

  const HUB = require('./js/sgadd-hub.js');
  const cAdm = (await catPublico(tokAdmin)).body.clubes.find(c => c.id === 'sudamerica');
  const fila = HUB.filaCategoria(cAdm, cAdm.categorias.find(k => k.slug === 'sudamerica-u23'));
  check('cada fila trae el desplegable de plan', /aria-label="Plan de U23/.test(fila) && /accionCategoria\('sudamerica','sudamerica-u23','cambiar_plan'/.test(fila));
  check('con el plan propio elegido', /<option value="ORO" selected>/.test(fila));
  check('y el de estado, con «hereda del club»', /cambiar_estado/.test(fila) && /hereda del club/.test(fila));
  const cCli = pub4.body.clubes.find(c => c.id === 'sudamerica');
  check('sin los datos de admin la fila NO pinta controles comerciales',
    !/cambiar_plan/.test(HUB.filaCategoria({ id: 'x', categorias: [] }, { slug: 'a', label: 'A', activo: true })));
  void cCli;

  HUB.reiniciarAlta();
  check('un alta nueva arranca con un plan explícito', HUB.alta.plan === 'BRONCE');
  Object.assign(HUB.alta, { club: 'nuevo', nombre: 'Nuevo', equipoPropio: 'NUEVO', categoria: 'nuevo-primera',
    label: 'Primera', fuente: 'existente', libroDe: 'deportivo/deportivo-primera' });
  HUB.elegirPlanAlta('ORO');
  const intencion = HUB.intencionAlta();
  check('el plan viaja en el pedido de alta', intencion.plan === 'ORO');
  check('y el modal lo enumera', HUB.cambiosAlta(intencion).some(f => f.label === 'Plan' && f.despues === 'ORO'));
  HUB.elegirEstadoAlta('prueba');
  check('una categoría nueva puede arrancar en prueba', HUB.intencionAlta().estado === 'prueba');

  /* LA GUÍA NOMBRA LO QUE LA PANTALLA TIENE: una guía que manda a buscar un
     control que no existe es peor que no tener guía (punto 53). */
  const guia = fs.readFileSync('./GUIA_ALTA_CLIENTES.md', 'utf8');
  const fuenteHub = fs.readFileSync('./js/sgadd-hub.js', 'utf8');
  ['Plan de la categoría', 'Pasar a prueba', 'Se aplica SOLO a esta categoría', 'hereda del club', 'En prueba (demo)',
    'Prueba hasta', 'Equipo propio en esta categoría', 'Marcar entregado']
    .forEach(t => check('  la guía nombra «' + t + '» y el Panel Master lo tiene',
      guia.indexOf(t) !== -1 && fuenteHub.indexOf(t) !== -1));

  /* Se devuelven las tres categorías a activas: las secciones que siguen
     parten de un club andando. */
  for (const k of ['sudamerica-primera', 'sudamerica-u23', 'sudamerica-u19']) {
    await escribir({ accion: 'reactivar', club: 'sudamerica', categoria: k });
  }

  /* =====================================================================
     7 · e) EL EQUIPO PROPIO ES DE LA CATEGORÍA (punto 61)
     ===================================================================== */
  titulo('7 · EQUIPO PROPIO · «RECONQUISTA A» en Primera, «RECONQUISTA» en la U23');

  const cEq = { equipoPropio: 'RECONQUISTA A', categorias: { p: { label: 'P' }, u: { label: 'U', equipoPropio: 'RECONQUISTA' } } };
  check('una categoría con equipo propio usa el suyo',
    JSON.stringify(AUTH.equipoDeCategoria(cEq, 'u')) === JSON.stringify({ equipo: 'RECONQUISTA', equipoDe: 'categoria' }));
  check('una sin equipo hereda el del club',
    JSON.stringify(AUTH.equipoDeCategoria(cEq, 'p')) === JSON.stringify({ equipo: 'RECONQUISTA A', equipoDe: 'club' }));
  check('sin equipo en ninguno de los dos, null', AUTH.equipoDeCategoria({ categorias: { x: {} } }, 'x').equipo === null);

  const rq1 = await escribir({ accion: 'alta', club: 'reconquista', nombre: 'Club Reconquista', liga: 'la-plata',
    equipoPropio: 'RECONQUISTA A', categoria: 'reconquista-primera', label: 'Primera',
    sheetId: 'SHEETRQPRIMERA00000000000', plan: 'ORO' });
  const rq2 = await escribir({ accion: 'alta', club: 'reconquista', categoria: 'reconquista-u23', label: 'U23',
    sheetId: 'SHEETRQU23000000000000000', plan: 'ORO', equipoPropioCategoria: "RECONQUISTA - U23M" });
  enKV = leerCat();
  check('el alta y la expansión salen bien', rq1.status === 200 && rq2.status === 200, JSON.stringify(rq2.body).slice(0, 160));
  check('la U23 guarda SU equipo, ya normalizado (sin « - U23M»)',
    enKV.reconquista.categorias['reconquista-u23'].equipoPropio === 'RECONQUISTA', enKV.reconquista.categorias['reconquista-u23'].equipoPropio);
  check('el del club sigue siendo «RECONQUISTA A»', enKV.reconquista.equipoPropio === 'RECONQUISTA A');
  check('y Primera no escribe uno: hereda', enKV.reconquista.categorias['reconquista-primera'].equipoPropio === undefined);
  const igual = await escribir({ accion: 'cambiar_equipo', club: 'reconquista', categoria: 'reconquista-primera', equipoPropio: "RECONQUISTA 'A' - MM" });
  check('declarar en una categoría el MISMO del club no lo guarda repetido',
    igual.status === 200 && leerCat().reconquista.categorias['reconquista-primera'].equipoPropio === undefined);
  const vacioClub = await escribir({ accion: 'cambiar_equipo', club: 'reconquista', equipoPropio: '' });
  check('el del club no se puede vaciar (el cliente no vería ningún equipo)', vacioClub.status === 400);

  /* Un libro con los dos nombres, como el de verdad. `Base Datos J` es la
     hoja que el servidor recorta al equipo propio. */
  const libroOriginal = sheets.obtenerLibro;
  sheets.obtenerLibro = async () => ({ hojas: {
    'PROMEDIOS J': [['NOMBRES', 'EQUIPO', 'MIN'], ['A1', "RECONQUISTA 'A' - MM", 20], ['U1', 'RECONQUISTA - U23M', 18]],
    'Base Datos J': [['PARTIDO', 'NOMBRES', 'EQUIPO', 'MIN'],
      ['X vs Y', 'A1', "RECONQUISTA 'A' - MM", 20], ['X vs Y', 'U1', 'RECONQUISTA - U23M', 18], ['X vs Y', 'Z', 'ATENAS A', 20]],
  }, hojasTexto: {}, faltantes: [], leidoEn: 1 });
  const tokRq = auth.firmarToken({ email: 'dt@reconquista.com', club: 'reconquista', equipoAsignado: 'RECONQUISTA A', plan: 'ORO' }, { expiraEn: '1h' });
  const dRqP = await equipos(tokRq, 'reconquista', 'reconquista-primera');
  const dRqU = await equipos(tokRq, 'reconquista', 'reconquista-u23');
  const equiposDe = (r) => (r.body.hojas['Base Datos J'] || []).slice(1).map(f => f[2]);
  check('en Primera el servidor recorta con «RECONQUISTA A»',
    dRqP.status === 200 && dRqP.body.alcance.equipoAsignado === 'RECONQUISTA A'
    && JSON.stringify(equiposDe(dRqP)) === JSON.stringify(["RECONQUISTA 'A' - MM"]), JSON.stringify(equiposDe(dRqP)));
  check('en la U23, con el MISMO token, recorta con «RECONQUISTA» y el cliente ve a su equipo',
    dRqU.status === 200 && dRqU.body.alcance.equipoAsignado === 'RECONQUISTA'
    && JSON.stringify(equiposDe(dRqU)) === JSON.stringify(['RECONQUISTA - U23M']), JSON.stringify(equiposDe(dRqU)));
  const fichaU23 = await H.manejarEquipos(pedido(tokRq, { clubId: 'reconquista' }, {}, { categoria: 'reconquista-u23', equipo: 'RECONQUISTA' }));
  check('y puede abrir la ficha de «RECONQUISTA» en la U23', fichaU23.status === 200, fichaU23.status);
  const fichaAjena = await H.manejarEquipos(pedido(tokRq, { clubId: 'reconquista' }, {}, { categoria: 'reconquista-primera', equipo: 'RECONQUISTA' }));
  check('pero no la del «RECONQUISTA» (sin letra) en Primera, que ahí es otro equipo', fichaAjena.status === 403, fichaAjena.status);
  const scRq = await H.manejarScouting(pedido(tokRq, { clubId: 'reconquista' }, {},
    { categoria: 'reconquista-u23', local: 'RECONQUISTA - U23M', visitante: 'ATENAS A' }));
  check('el scouting de la U23 acepta el cruce con SU equipo', scRq.status === 200, scRq.status + ' ' + (scRq.body.mensaje || ''));
  /* Un acceso dado de alta con un equipo PROPIO del mail (no el heredado
     del club) es una decisión sobre ese mail y no se pisa. */
  const tokOtroEq = auth.firmarToken({ email: 'b@reconquista.com', club: 'reconquista', equipoAsignado: 'RECONQUISTA B', plan: 'ORO' }, { expiraEn: '1h' });
  check('un mail con equipo propio distinto del club conserva el suyo',
    (await equipos(tokOtroEq, 'reconquista', 'reconquista-u23')).body.alcance.equipoAsignado === 'RECONQUISTA B');
  const tokAjeno = auth.firmarToken({ email: 'x@sudamerica.com', club: 'sudamerica', equipoAsignado: 'SUD AMERICA LP', plan: 'ORO' }, { expiraEn: '1h' });
  check('a otro club no se le presta el equipo: el guard OTRO_CLUB cierra antes',
    (await equipos(tokAjeno, 'reconquista', 'reconquista-u23')).status === 403);
  sheets.obtenerLibro = libroOriginal;

  const pubRq = await catPublico(tokRq);
  const catsRq = pubRq.body.clubes.find(c => c.id === 'reconquista').categorias;
  check('el catálogo le dice al cliente el equipo de cada categoría',
    catsRq.map(k => k.slug + ':' + k.equipoEfectivo).sort().join(',') === 'reconquista-primera:RECONQUISTA A,reconquista-u23:RECONQUISTA',
    JSON.stringify(catsRq.map(k => [k.slug, k.equipoEfectivo])));
  check('y abre con el de la primera categoría', pubRq.body.usuario.equipoAsignado === 'RECONQUISTA A');
  check('a otro cliente no le llegan los equipos de Reconquista',
    (await catPublico(tokSud)).body.clubes.find(c => c.id === 'reconquista').categorias.every(k => k.equipoEfectivo === undefined));

  /* EL PANEL · la sesión y el patrón del equipo propio siguen a la categoría. */
  const clubRq = crearClub();
  /* El `extra` es el equipo del token, como lo pasa el arranque del index. */
  const cfgRq = clubRq.reconciliarConfig(null, pubRq.body.clubes.find(c => c.id === 'reconquista'), { equipoPropio: 'RECONQUISTA A' });
  const pRqU = cfgRq.planillas.find(p => p.slug === 'reconquista-u23');
  const pRqP = cfgRq.planillas.find(p => p.slug === 'reconquista-primera');
  check('cada planilla trae su equipo', pRqU.equipoPropio === 'RECONQUISTA' && pRqP.equipoPropio === 'RECONQUISTA A');
  check('el patrón derivado del catálogo se marca como derivado', cfgRq.patronDerivado === true);
  const patU = new RegExp(clubRq.patronDeCategoria(cfgRq, pRqU), 'i');
  const patP = new RegExp(clubRq.patronDeCategoria(cfgRq, pRqP), 'i');
  check('en la U23 el equipo propio es «RECONQUISTA» y no «RECONQUISTA A»', patU.test('RECONQUISTA') && !patU.test('RECONQUISTA A'));
  check('en Primera, al revés', patP.test('RECONQUISTA A') && !patP.test('RECONQUISTA'));
  const cfgJson = { patronEquipoPropio: 'RECONQUISTA' };
  check('un patrón del JSON que ya reconoce al equipo de la categoría se respeta',
    clubRq.patronDeCategoria(cfgJson, { equipoPropio: 'RECONQUISTA A' }) === 'RECONQUISTA');
  check('uno del JSON que NO lo reconoce cede al de la categoría, anclado',
    clubRq.patronDeCategoria({ patronEquipoPropio: '^DEPORTIVO LA PLATA$' }, { equipoPropio: 'DEPORTIVO' }) === '^DEPORTIVO$');

  AUTH.establecerSesion({ email: 'dt@reconquista.com', plan: 'ORO', equipoAsignado: 'RECONQUISTA A' });
  check('la sesión del cliente adopta el equipo de la categoría', AUTH.fijarEquipoEfectivo('RECONQUISTA') === true
    && AUTH.equipoPropio() === 'RECONQUISTA');
  check('y con eso ve a su equipo en el picker de la U23', AUTH.puedeVerEquipo('RECONQUISTA - U23M')
    && !AUTH.puedeVerEquipo("RECONQUISTA 'A' - MM"));
  AUTH.establecerSesion({ email: 'freytesgn@gmail.com' });
  check('el admin no adopta equipo: no tiene restricciones', AUTH.fijarEquipoEfectivo('RECONQUISTA') === false);
  AUTH.limpiarSesion();

  const appRq = appCon(catsRq.map(planillaDe), { rol: 'CLIENTE', auth: true, club: clubRq, cfg: cfgRq });
  appRq.SGADD_APP.inicializar();
  appRq.SGADD_APP.estado.planillaId = 'reconquista-u23';
  await appRq.SGADD_APP.cargar();
  check('al abrir la U23 el panel adopta su equipo ANTES de pedir los datos',
    appRq.log.join(',').indexOf('equipo:RECONQUISTA,') !== -1
    && appRq.log.indexOf('equipo:RECONQUISTA') < appRq.log.indexOf('datos:reconquista-u23'), appRq.log.join(','));
  check('y el patrón de esEquipoPropio pasa a ser el de la U23', appRq.patron() === '/^RECONQUISTA$/i', appRq.patron());

  global.SGADD_CLIENTES = { estado: { clubes: (await catPublico(tokAdmin)).body.clubes } };
  HUB.elegirModo('reconquista');
  check('el Panel Master precarga el equipo de la categoría que se edita', HUB.alta.equipoPropio === 'RECONQUISTA A');
  HUB.elegirCategoria('reconquista-u23');
  check('y al pasar a la U23, el suyo', HUB.alta.equipoPropio === 'RECONQUISTA');
  check('con varias categorías, el equipo que se edita es el de la CATEGORÍA', HUB.equipoEsDeCategoria() === true
    && HUB.intencionAlta().equipoPropioCategoria === 'RECONQUISTA' && HUB.intencionAlta().equipoPropio === undefined);
  check('y el modal lo dice por categoría', HUB.cambiosAlta(Object.assign(HUB.intencionAlta(), { equipoPropioCategoria: 'OTRO' }))
    .some(f => /^Equipo propio · U23/.test(f.label)));
  HUB.elegirModo('nuevo');
  check('un club nuevo edita el equipo del CLUB', HUB.equipoEsDeCategoria() === false);
  const filaRq = HUB.filaCategoria(cAdm, { slug: 'k', label: 'K', activo: true, planEfectivo: 'ORO', estadoEfectivo: 'activo', equipoPropio: 'RECONQUISTA' });
  check('la fila del Panel Master muestra el equipo propio de la categoría', /RECONQUISTA/.test(filaRq));

  /* =====================================================================
     8 · f) VENCIMIENTO Y CADUCIDAD DE LA PRUEBA POR CATEGORÍA (punto 61)
     ===================================================================== */
  titulo('8 · VENCIMIENTO · la prueba de una categoría termina sola, las demás siguen');

  const AYER = '2026-09-01', LEJOS = '2099-12-31';
  const HOY = Date.parse('2026-09-13T12:00:00Z');
  const cV = { plan: 'ORO', categorias: {
    primera: { label: 'P' },
    u19: { label: 'U19', estado: 'prueba', vence: AYER },
    u17: { label: 'U17', estado: 'prueba', vence: LEJOS },
    u21: { label: 'U21', vence: AYER },
  } };
  const sv = (k, c) => AUTH.suscripcionDeCategoria(c || cV, k, HOY);
  check('una prueba con la fecha pasada queda PAUSADA, no vencida',
    sv('u19').estado === 'pausado' && sv('u19').pruebaVencida === true && sv('u19').acceso === false);
  check('y dice que el corte es de la categoría y por su fecha', sv('u19').estadoDe === 'categoria' && sv('u19').venceDe === 'categoria');
  check('una prueba con la fecha por delante sigue con acceso', sv('u17').estado === 'prueba' && sv('u17').acceso);
  check('una categoría activa con su fecha pasada queda vencida', sv('u21').estado === 'vencido' && !sv('u21').pruebaVencida);
  check('la principal del mismo club sigue activa', sv('primera').acceso && sv('primera').estado === 'activo');
  check('la fecha de la categoría no estira la del club: club vencido corta todo',
    sv('u17', Object.assign({}, cV, { vence: AYER })).estado === 'vencido' && sv('u17', Object.assign({}, cV, { vence: AYER })).estadoDe === 'club');
  check('una prueba vencida heredada del club también pasa a pausada',
    AUTH.suscripcionDeCategoria({ estado: 'prueba', categorias: { a: { vence: AYER } } }, 'a', HOY).estado === 'pausado');
  check('una categoría pausada a mano no cambia por la fecha', AUTH.suscripcionDeCategoria(
    { categorias: { a: { estado: 'pausado', vence: AYER } } }, 'a', HOY).pruebaVencida === false);
  check('el titular no suma una prueba terminada', AUTH.planDelClub(
    { plan: 'BRONCE', categorias: { a: { plan: 'ORO', estado: 'prueba', vence: AYER }, b: {} } }, HOY) === 'BRONCE');

  /* EL SERVIDOR DERIVA LO MISMO QUE EL MOTOR, en TODAS las combinaciones:
     `resolver` guarda lo declarado y la fecha que rige, y
     `estadoEfectivo` tiene que dar exactamente el estado de la cascada. */
  const originalNow = Date.now;
  Date.now = () => HOY;
  let combinaciones = 0, distintas = [];
  [undefined, 'activo', 'prueba', 'pausado', 'inactivo'].forEach(ce => [undefined, AYER, LEJOS].forEach(cv =>
    [undefined, 'activo', 'prueba', 'pausado'].forEach(ke => [undefined, AYER, LEJOS].forEach(kvn => {
      const clubX = { nombre: 'X', estado: ce, vence: cv, categorias: { k: { label: 'K', estado: ke, vence: kvn } } };
      const motor = AUTH.suscripcionDeCategoria(clubX, 'k').estado;
      const serv = mutar.estadoEfectivo(catalogo.resolver({ x: clubX }, 'x', 'k').suscripcion);
      combinaciones++;
      if (motor !== serv) distintas.push([ce, cv, ke, kvn, motor, serv].join('/'));
    }))));
  Date.now = originalNow;
  check('el guard del servidor y la cascada coinciden en las ' + combinaciones + ' combinaciones',
    distintas.length === 0, distintas.slice(0, 3).join(' | '));

  /* Por la API: dar una prueba con fecha a la U19. */
  const pr = await escribir({ accion: 'probar', club: 'sudamerica', categoria: 'sudamerica-u19' });
  const venc = await escribir({ accion: 'renovar', club: 'sudamerica', categoria: 'sudamerica-u19', vence: LEJOS });
  enKV = leerCat();
  check('el Panel Master fija la fecha de UNA categoría',
    pr.status === 200 && venc.status === 200 && enKV.sudamerica.categorias['sudamerica-u19'].vence === LEJOS, JSON.stringify(venc.body).slice(0, 120));
  check('sin tocar la del club ni la de las otras categorías', enKV.sudamerica.vence === undefined
    && enKV.sudamerica.categorias['sudamerica-primera'].vence === undefined);
  const atras = await escribir({ accion: 'renovar', club: 'sudamerica', categoria: 'sudamerica-u19', vence: AYER });
  check('una fecha pasada no se acepta (para cortar está Pausar)', atras.status === 400);
  check('con la fecha por delante la prueba sirve datos', (await equipos(tokLogin, 'sudamerica', 'sudamerica-u19')).status === 200);

  /* EL TIEMPO PASA: se simula escribiendo la fecha vencida directo en KV,
     que es lo que ve el servidor el día después. */
  enKV.sudamerica.categorias['sudamerica-u19'].vence = AYER;
  store[catalogo.CLAVE_KV] = JSON.stringify(enKV);
  ops.length = 0;
  const d19v = await equipos(tokLogin, 'sudamerica', 'sudamerica-u19');
  check('pasada la fecha la U19 se corta SOLA, sin que nadie escriba nada',
    d19v.status === 403 && d19v.body.codigo === 'SUSCRIPCION_PAUSADO' && ops.filter(o => /^(SET|HSET|DEL)/.test(o)).length === 0, d19v.status);
  check('y el mensaje dice que terminó la prueba de ESA categoría', /prueba de esta categoría terminó/.test(d19v.body.mensaje), d19v.body.mensaje);
  check('Primera y la U23 siguen sirviendo datos', (await equipos(tokLogin, 'sudamerica', 'sudamerica-primera')).status === 200
    && (await equipos(tokLogin, 'sudamerica', 'sudamerica-u23')).status === 200);
  const estV = await EST.manejarEstados(pedido(tokLogin, { clubId: 'sudamerica', categoria: 'sudamerica-u19' }));
  check('los estados compartidos de la U19 también se cortan', estV.status === 403);
  catalogo.limpiarCache();
  const loginV = await H.manejarLogin(pedido(null, {}, { email: 'dt@sudamerica.com', clave: 'una-clave-larga-123' }));
  check('el cliente sigue entrando: tiene otras categorías andando', loginV.status === 200, loginV.status);
  const pubV = await catPublico(tokLogin);
  const u19v = pubV.body.clubes.find(c => c.id === 'sudamerica').categorias.find(k => k.slug === 'sudamerica-u19');
  check('el catálogo la manda bloqueada, pausada y con la prueba terminada',
    u19v.bloqueada === true && u19v.estadoEfectivo === 'pausado' && u19v.pruebaVencida === true && u19v.venceEfectivo === AYER, JSON.stringify(u19v));
  const pU19v = crearClub().reconciliarConfig(null, pubV.body.clubes.find(c => c.id === 'sudamerica'), {})
    .planillas.find(p => p.slug === 'sudamerica-u19');
  check('el selector dice «prueba terminada», no «pausada»', app.SGADD_APP.sufijoCategoria(pU19v) === ' — prueba terminada', app.SGADD_APP.sufijoCategoria(pU19v));
  const u19adm2 = (await catPublico(tokAdmin)).body.clubes.find(c => c.id === 'sudamerica').categorias.find(k => k.slug === 'sudamerica-u19');
  check('el Panel Master la nombra «prueba terminada»', HUB.nombreEstadoCategoria(u19adm2) === 'prueba terminada');
  const filaV = HUB.filaCategoria(cAdm, u19adm2);
  check('y la fila trae la fecha para extenderla', /type="date"/.test(filaV) && /value="2026-09-01"/.test(filaV)
    && /accionCategoria\('sudamerica','sudamerica-u19','renovar'/.test(filaV));
  const extiende = await escribir({ accion: 'renovar', club: 'sudamerica', categoria: 'sudamerica-u19', vence: LEJOS });
  check('extender la fecha la reabre, sin reactivar a mano', extiende.status === 200
    && (await equipos(tokLogin, 'sudamerica', 'sudamerica-u19')).status === 200);
  const sinFecha = await escribir({ accion: 'renovar', club: 'sudamerica', categoria: 'sudamerica-u19', vence: '' });
  check('vaciar la fecha la borra de la categoría', sinFecha.status === 200 && leerCat().sudamerica.categorias['sudamerica-u19'].vence === undefined);
  const propV = mutar.aplicar(leerCat(), 'renovar', { club: 'sudamerica', categoria: 'sudamerica-u19', vence: LEJOS, alcance: 'libro' }, catalogo.validar);
  check('una fecha de categoría propagada va a CATEGORÍAS del mismo libro, no a clubes',
    !propV.ok || Object.keys(propV.catalogo).every(id => propV.catalogo[id].vence === undefined), propV.motivo);

  const nuevaPrueba = await escribir({ accion: 'alta', club: 'sudamerica', categoria: 'sudamerica-u15', label: 'U15',
    sheetId: 'SHEETU15000000000000000000', estado: 'prueba', vence: LEJOS });
  check('el alta de una categoría puede arrancar en prueba CON fecha',
    nuevaPrueba.status === 200 && leerCat().sudamerica.categorias['sudamerica-u15'].estado === 'prueba'
    && leerCat().sudamerica.categorias['sudamerica-u15'].vence === LEJOS, JSON.stringify(nuevaPrueba.body).slice(0, 120));
  HUB.reiniciarAlta();
  Object.assign(HUB.alta, { club: 'nuevo', nombre: 'Nuevo', equipoPropio: 'NUEVO', categoria: 'nuevo-primera',
    label: 'Primera', fuente: 'existente', libroDe: 'deportivo/deportivo-primera' });
  HUB.elegirEstadoAlta('prueba');
  HUB.elegirVenceAlta('2099-01-31');
  check('el formulario manda la fecha de la prueba', HUB.intencionAlta().vence === '2099-01-31');
  check('y el modal la enumera', HUB.cambiosAlta(HUB.intencionAlta()).some(f => f.label === 'Prueba hasta' && f.despues === '2099-01-31'));
  HUB.elegirEstadoAlta('');
  check('volver a «Activa» se lleva la fecha', HUB.intencionAlta().vence === undefined);

  /* =====================================================================
     9 · g) EL CICLO ORO ES DE CADA CATEGORÍA (punto 61)
     ===================================================================== */
  titulo('9 · CICLO ORO · cada categoría en ORO lleva sus propios informes');

  await escribir({ accion: 'cambiar_plan', club: 'sudamerica', categoria: 'sudamerica-primera', plan: 'ORO' });
  const inf1 = await escribir({ accion: 'informe_entregado', club: 'sudamerica', categoria: 'sudamerica-primera' });
  await escribir({ accion: 'informe_entregado', club: 'sudamerica', categoria: 'sudamerica-primera' });
  const inf3 = await escribir({ accion: 'informe_entregado', club: 'sudamerica', categoria: 'sudamerica-u23' });
  enKV = leerCat();
  check('los informes se cuentan en cada categoría', inf1.status === 200 && inf3.status === 200
    && enKV.sudamerica.categorias['sudamerica-primera'].informesEntregados === 2
    && enKV.sudamerica.categorias['sudamerica-u23'].informesEntregados === 1, JSON.stringify(inf1.body).slice(0, 120));
  check('el club no acumula un contador compartido', enKV.sudamerica.informesEntregados === undefined);
  const infSin = await escribir({ accion: 'informe_entregado', club: 'sudamerica' });
  check('con varias categorías hay que decir de cuál es el informe', infSin.status === 400 && /decí de cuál/.test(infSin.body.mensaje));

  const cP = catalogo.resolver(enKV, 'sudamerica', 'sudamerica-primera').suscripcion;
  const cU = catalogo.resolver(enKV, 'sudamerica', 'sudamerica-u23').suscripcion;
  check('Primera con 8 partidos y 2 entregados: no toca informe', mutar.ciclo(cP, 8).toca === false);
  check('la U23 con 8 partidos y 1 entregado: TOCA, sin que Primera le descuente', mutar.ciclo(cU, 8).toca === true);
  const eOroP = await equipos(tokLogin, 'sudamerica', 'sudamerica-primera');
  const eOroU = await equipos(tokLogin, 'sudamerica', 'sudamerica-u23');
  check('los datos de cada categoría declaran SU ciclo',
    eOroP.body.alcance.informesEntregados === 2 && eOroU.body.alcance.informesEntregados === 1);

  const admOro = (await catPublico(tokAdmin)).body.clubes.find(c => c.id === 'sudamerica');
  const oroCats = HUB.categoriasOro(admOro).map(k => k.slug).sort().join(',');
  check('el Panel Master lista las categorías en ORO con acceso',
    oroCats === 'sudamerica-primera,sudamerica-u23', oroCats);
  const bloque = HUB.bloqueOro(admOro);
  check('con un «Marcar entregado» por categoría',
    /accionCategoria\('sudamerica','sudamerica-primera','informe_entregado'\)/.test(bloque)
    && /accionCategoria\('sudamerica','sudamerica-u23','informe_entregado'\)/.test(bloque)
    && !/accionClub\('sudamerica','informe_entregado'\)/.test(bloque));
  check('y sin ciclo inventado para la que no está abierta', /abrí la categoría para ver el ciclo/.test(bloque));
  check('una categoría BRONCE no aparece en el bloque ORO', !/sudamerica-u19','informe_entregado/.test(bloque));

  /* RETROCOMPATIBLE: un club de UNA categoría con el contador en el club. */
  const viejoOro = { plan: 'ORO', informesEntregados: 3, cicloDesde: 2, categorias: { unica: { label: 'P', sheetId: 'SHEETX0000000000000000000' } } };
  const ciV = AUTH.cicloDeCategoria(viejoOro, 'unica');
  check('un club de hoy con una sola categoría sigue viendo sus informes', ciV.informesEntregados === 3 && ciV.cicloDesde === 2 && ciV.cicloDe === 'club');
  const mud = mutar.informe({ v: viejoOro }, { club: 'v' });
  check('al marcar el siguiente, el contador se muda a la categoría y el del club se va',
    mud.ok && mud.catalogo.v.categorias.unica.informesEntregados === 4 && mud.catalogo.v.categorias.unica.cicloDesde === 2
    && mud.catalogo.v.informesEntregados === undefined && mud.catalogo.v.cicloDesde === undefined);
  check('con varias categorías el contador viejo del club NO se reparte',
    AUTH.cicloDeCategoria(Object.assign({}, viejoOro, { categorias: { a: {}, b: {} } }), 'a').informesEntregados === 0);

  console.log('\n' + '═'.repeat(70));
  if (fail === 0) console.log('✓ TODO OK   ' + ok + ' pasaron, 0 fallaron');
  else { console.log('✗ HAY FALLAS   ' + ok + ' pasaron, ' + fail + ' fallaron'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });

/* ------------------------------------------------------------ helpers */

/** La planilla del panel a partir de una categoría publicada. */
function planillaDe(k) {
  return { id: k.slug, slug: k.slug, label: k.label, activo: k.activo !== false && !k.bloqueada,
    plan: k.planEfectivo, estado: k.estadoEfectivo, bloqueada: !!k.bloqueada, equipoPropio: k.equipoEfectivo };
}

/** `sgadd-app.js` en un vm, con un espía sobre la adopción y los datos. */
function appCon(planillas, o) {
  const op = o || {};
  const log = [];
  const SGADD = require('./js/sgadd-core.js');
  const ctx = {
    console, JSON, Object, Array, Math, Map, Set, Promise, Date, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    SGADD: Object.assign(Object.create(SGADD), {
      CATALOGO: { planillas: planillas },
      planilla: (id) => planillas.filter(p => p.id === id)[0] || null,
      planillasVisibles: () => planillas.filter(p => p.activo),
    }),
    SGADD_UI: { esc: (x) => String(x) },
    CLUB: op.club ? { estado: { id: 'x' }, patronDeCategoria: op.club.patronDeCategoria, cfg: op.cfg }
      : { estado: { id: 'sudamerica' } },
    location: { hash: op.hash || '' },
    adoptarPlanEfectivo: (p) => { log.push('adopta:' + p); return true; },
    SGADD_DATA: {
      cargarCategoria: async (p) => { log.push('datos:' + p.slug); throw new Error('sin red en el test'); },
    },
  };
  if (op.auth) ctx.SGADD_AUTH = { fijarEquipoEfectivo: (e) => { log.push('equipo:' + e); return true; } };
  ctx.SGADD.CATALOGO.patronEquipoPropio = /X/;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('./js/sgadd-app.js', 'utf8'), ctx);
  ctx.SGADD_APP = vm.runInContext('SGADD_APP', ctx);
  return { SGADD_APP: ctx.SGADD_APP, log: log, patron: () => String(ctx.SGADD.CATALOGO.patronEquipoPropio) };
}

/** `sgadd-club.js` en un vm, como lo cargan test-alcance y test-plan-racha. */
function crearClub() {
  const src = fs.readFileSync('./js/sgadd-club.js', 'utf8').replace('const CLUB = (function () {', 'var CLUB = (function () {');
  const ctx = {
    console, setTimeout, clearTimeout, URLSearchParams,
    window: { location: { search: '?club=sudamerica' } },
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
