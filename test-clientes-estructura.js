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
  ['Plan de la categoría', 'Pasar a prueba', 'Se aplica SOLO a esta categoría', 'hereda del club', 'En prueba (demo)']
    .forEach(t => check('  la guía nombra «' + t + '» y el Panel Master lo tiene',
      guia.indexOf(t) !== -1 && fuenteHub.indexOf(t) !== -1));

  console.log('\n' + '═'.repeat(70));
  if (fail === 0) console.log('✓ TODO OK   ' + ok + ' pasaron, 0 fallaron');
  else { console.log('✗ HAY FALLAS   ' + ok + ' pasaron, ' + fail + ' fallaron'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });

/* ------------------------------------------------------------ helpers */

/** La planilla del panel a partir de una categoría publicada. */
function planillaDe(k) {
  return { id: k.slug, slug: k.slug, label: k.label, activo: k.activo !== false && !k.bloqueada,
    plan: k.planEfectivo, estado: k.estadoEfectivo, bloqueada: !!k.bloqueada };
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
    CLUB: { estado: { id: 'sudamerica' } },
    location: { hash: op.hash || '' },
    adoptarPlanEfectivo: (p) => { log.push('adopta:' + p); return true; },
    SGADD_DATA: {
      cargarCategoria: async (p) => { log.push('datos:' + p.slug); throw new Error('sin red en el test'); },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('./js/sgadd-app.js', 'utf8'), ctx);
  ctx.SGADD_APP = vm.runInContext('SGADD_APP', ctx);
  return { SGADD_APP: ctx.SGADD_APP, log: log };
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
