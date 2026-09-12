/* =====================================================================
   LOS ESTADOS COMPARTIDOS Y LO QUE NINGUNA RUTINA PUEDE BORRAR

   Pedido del club (2026-09-12), en tres partes que se testean juntas
   porque son la misma propiedad vista desde tres lados:

     1 · lo que un DT marca en la campana queda en el SERVIDOR y lo ve
         otra sesión del mismo club, sin que nadie le pase nada;
     2 · el servidor escribe JUGADOR POR JUGADOR y gana lo más nuevo: dos
         navegadores no se pisan, y reenviar lo mismo no hace nada;
     3 · ninguna escritura del catálogo —un alta, una publicación, un
         `sembrar`— puede dejar en cero lo que cargó un usuario: ni los
         estados, que viven en otra clave, ni los partidos manuales, las
         zonas y los planes, que viven adentro del catálogo.

   TODO CORRE CONTRA LOS HANDLERS DE VERDAD, con un Upstash de mentira en
   memoria: la convención de toda la suite del backend.
   ===================================================================== */
'use strict';
const fs = require('fs');
require('./server/lib/env.js').cargar();

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

const E = require('./js/sgadd-estados.js');

/* ------------------------------------------------------ Upstash de mentira
   Dos cosas: claves con JSON (el catálogo) y hashes (los estados). Se
   cuentan las operaciones para poder afirmar QUÉ se tocó, y cada una se
   puede hacer fallar para simular un Upstash que no contesta. */
const kv = require('./server/lib/kv.js');
const store = {};
const hashes = {};
const ops = [];
const falla = { leer: false, hash: false, escribirCampos: false };
kv.configurado = () => true;
kv.leer = async (k) => {
  ops.push('GET ' + k);
  if (falla.leer) return { valor: null, error: 'KV' };
  return { valor: store[k] !== undefined ? JSON.parse(store[k]) : null, error: null };
};
kv.escribir = async (k, v) => { ops.push('SET ' + k); store[k] = JSON.stringify(v); };
kv.borrar = async (k) => { ops.push('DEL ' + k); delete store[k]; delete hashes[k]; };
kv.leerHash = async (k) => {
  ops.push('HGETALL ' + k);
  if (falla.hash) throw Object.assign(new Error('caído'), { codigo: 'KV' });
  const h = hashes[k] || {};
  const out = {};
  Object.keys(h).forEach(c => { out[c] = JSON.parse(h[c]); });
  return out;
};
kv.leerCampos = async (k, campos) => {
  ops.push('HMGET ' + k);
  if (falla.hash) throw Object.assign(new Error('caído'), { codigo: 'KV' });
  const h = hashes[k] || {};
  const out = {};
  campos.forEach(c => { if (h[c] !== undefined) out[c] = JSON.parse(h[c]); });
  return out;
};
kv.escribirCampos = async (k, mapa) => {
  ops.push('HSET ' + k);
  if (falla.escribirCampos) throw Object.assign(new Error('caído'), { codigo: 'KV' });
  hashes[k] = hashes[k] || {};
  Object.keys(mapa).forEach(c => { hashes[k][c] = JSON.stringify(mapa[c]); });
  return Object.keys(mapa).length;
};
kv.tamanoHash = async (k) => Object.keys(hashes[k] || {}).length;

const auth = require('./server/lib/auth.js');
const catalogo = require('./server/lib/catalogo.js');
const H = require('./server/api/handlers.js');
const EST = require('./server/api/estados.js');

const CAT = {
  deportivo: {
    nombre: 'Deportivo La Plata', liga: 'la-plata', equipoPropio: 'DEPORTIVO LA PLATA',
    estado: 'activo', plan: 'PLATA',
    categorias: { 'deportivo-primera': { label: 'Primera 2026', sheetId: 'X' } },
    /* Lo que carga un admin a mano y vive SOLO en KV: es lo que un
       catálogo de respaldo no tiene y lo que no se puede perder. */
    partidosManuales: { 'deportivo-primera': { 'IDA|REGULAR': [
      { id: 'm1', fecha: '2026-07-09', local: 'DEPORTIVO LA PLATA', visitante: 'ATENAS A', pl: 70, pv: 60 }] } },
    competencia: { formatos: { f: { zonas: [{ id: 'playoffs', desde: 1, hasta: 8, tono: 'positivo' }] } }, porTramo: { '*': 'f' } },
  },
  pausado: {
    nombre: 'Club Pausado', liga: 'la-plata', equipoPropio: 'PAUSADO', estado: 'pausado', plan: 'BRONCE',
    categorias: { 'pausado-primera': { label: 'Primera', sheetId: 'Z' } },
  },
  jujuy: {
    nombre: 'Jujuy Básquet', liga: 'liga-argentina', equipoPropio: 'JUJUY', estado: 'activo', plan: 'ORO',
    categorias: { 'jujuy-norte': { label: 'Conferencia Norte', sheetId: 'Y' } },
  },
};
function sembrar() { store[catalogo.CLAVE_KV] = JSON.stringify(CAT); catalogo.limpiarCache(); }

const tokDT1 = auth.firmarToken({ email: 'dt1@deportivo.com', club: 'deportivo', equipoAsignado: 'DEPORTIVO LA PLATA', plan: 'PLATA' }, { expiraEn: '1h' });
const tokDT2 = auth.firmarToken({ email: 'asistente@deportivo.com', club: 'deportivo', equipoAsignado: 'DEPORTIVO LA PLATA', plan: 'PLATA' }, { expiraEn: '1h' });
const tokJujuy = auth.firmarToken({ email: 'dt@jujuy.com', club: 'jujuy', equipoAsignado: 'JUJUY', plan: 'ORO' }, { expiraEn: '1h' });
const tokPausado = auth.firmarToken({ email: 'dt@pausado.com', club: 'pausado', equipoAsignado: 'PAUSADO', plan: 'BRONCE' }, { expiraEn: '1h' });
const tokAdmin = auth.firmarToken({ email: 'freytesgn@gmail.com' }, { expiraEn: '1h' });

const pedido = (tok, club, cat, body) => ({
  headers: tok ? { authorization: 'Bearer ' + tok } : {},
  params: { clubId: club, categoria: cat }, body: body || {}, query: {},
});
const HASH = EST.claveKV('deportivo', 'deportivo-primera');

(async () => {

  /* =====================================================================
     1. EL MOTOR PURO
     ===================================================================== */
  titulo('1. EL MOTOR · marca de tiempo, upsert y fusión');

  const antes = Date.now();
  const m1 = E.aplicar({}, 'PEREZ, JUAN|DEPORTIVO LA PLATA', 'SUSPENSO');
  const r1 = m1['PEREZ, JUAN|DEPORTIVO LA PLATA'];
  check('aplicar() sella el cambio con su hora', typeof r1.actualizado === 'number' && r1.actualizado >= antes);
  check('y registroDe() la expone', E.registroDe(m1, 'PEREZ, JUAN|DEPORTIVO LA PLATA').actualizado === r1.actualizado);
  check('un registro viejo, sin marca, es el más antiguo de todos', E.marcaDeTiempo({ estado: 'BAJA' }) === 0);

  const ahora = 1800000000000;
  check('el servidor fuerza el origen a «usuario»',
    E.normalizarRegistro('A|B', { estado: 'BAJA', origen: 'automatico', actualizado: ahora - 1 }, ahora).origen === 'usuario');
  check('topa un reloj adelantado en la hora del servidor',
    E.normalizarRegistro('A|B', { estado: 'BAJA', actualizado: ahora + 86400000 }, ahora).actualizado === ahora);
  check('rechaza un estado que no existe', E.normalizarRegistro('A|B', { estado: 'LESIONADO' }, ahora) === null);
  check('rechaza una clave sin la forma NOMBRE|EQUIPO', E.normalizarRegistro('sin barra', { estado: 'BAJA' }, ahora) === null);
  check('recorta una nota larga', E.normalizarRegistro('A|B', { estado: 'BAJA', nota: 'x'.repeat(900) }, ahora).nota.length === E.MAX_NOTA);

  const viejo = { estado: 'SUSPENSO', origen: 'usuario', actualizado: ahora - 5000 };
  const re = E.resolverEscritura(
    { 'A|X': viejo, 'B|X': { estado: 'BAJA', origen: 'usuario', actualizado: ahora - 10 }, 'C|X': { estado: 'ALTA', actualizado: ahora - 100 } },
    { 'A|X': { estado: 'ACTIVO', actualizado: ahora - 1000 },
      'B|X': { estado: 'ACTIVO', actualizado: ahora - 900 },
      'C|X': { estado: 'ALTA', actualizado: ahora - 100 },
      'D|X': { estado: 'BAJA', actualizado: ahora - 1 },
      'roto': { estado: 'BAJA' } }, ahora);
  check('el cambio más nuevo se escribe', !!re.escribir['A|X'] && re.escribir['A|X'].estado === 'ACTIVO');
  check('uno más viejo que lo guardado NO pisa', !re.escribir['B|X'] && re.ignorados.indexOf('B|X') > -1);
  check('reenviar lo mismo no escribe nada', !re.escribir['C|X'] && re.ignorados.indexOf('C|X') > -1);
  check('un jugador nuevo se agrega', !!re.escribir['D|X']);
  check('lo inválido se informa y no se escribe', re.invalidos.indexOf('roto') > -1 && !re.escribir.roto);

  const local = {
    'SOLO, LOCAL|X': { estado: 'BAJA', origen: 'usuario', desde: '2026-09-01' },              // de antes de la sync
    'MAS, NUEVO|X': { estado: 'ACTIVO', origen: 'usuario', actualizado: ahora },
    'MAS, VIEJO|X': { estado: 'SUSPENSO', origen: 'usuario', actualizado: ahora - 9000 },
    'AUTO, MATICO|X': { estado: 'SUSPENSO', origen: 'automatico' },
  };
  const remoto = {
    'MAS, NUEVO|X': { estado: 'BAJA', origen: 'usuario', actualizado: ahora - 50 },
    'MAS, VIEJO|X': { estado: 'ALTA', origen: 'usuario', actualizado: ahora - 10 },
    'SOLO, REMOTO|X': { estado: 'ALTA', origen: 'usuario', actualizado: ahora - 70 },
  };
  const fu = E.fusionarRemoto(local, remoto);
  check('lo que solo está en el servidor BAJA al navegador', fu.mapa['SOLO, REMOTO|X'].estado === 'ALTA');
  check('lo que solo está en el navegador SE QUEDA — nada se borra por no estar arriba',
    fu.mapa['SOLO, LOCAL|X'].estado === 'BAJA');
  check('y SE SUBE: el servidor todavía no lo tiene', fu.subir.indexOf('SOLO, LOCAL|X') > -1);
  check('lo local más nuevo gana y se sube', fu.mapa['MAS, NUEVO|X'].estado === 'ACTIVO' && fu.subir.indexOf('MAS, NUEVO|X') > -1);
  check('lo del servidor más nuevo gana y no se sube', fu.mapa['MAS, VIEJO|X'].estado === 'ALTA' && fu.subir.indexOf('MAS, VIEJO|X') === -1);
  check('una detección automática no se sube: por el servidor viajan decisiones del DT',
    fu.subir.indexOf('AUTO, MATICO|X') === -1 && !!fu.mapa['AUTO, MATICO|X']);
  check('ninguna clave de los dos lados se pierde en la fusión',
    Object.keys(local).concat(Object.keys(remoto)).every(k => !!fu.mapa[k]));

  let lecturaFallo = false;
  try {
    await E.sincronizarConServidor(local, { leer: async () => { throw new Error('sin red'); }, escribir: async () => null });
  } catch (e) { lecturaFallo = true; }
  check('si el servidor no contesta, la vuelta FALLA en vez de devolver un mapa vacío', lecturaFallo);

  /* =====================================================================
     2. QUIÉN PUEDE
     ===================================================================== */
  titulo('2. LOS PERMISOS · cada club lo suyo');
  sembrar();

  let r = await EST.manejarEstados(pedido(null, 'deportivo', 'deportivo-primera'));
  check('sin token no se lee', r.status === 401, r.status);
  r = await EST.manejarEstados(pedido(tokJujuy, 'deportivo', 'deportivo-primera'));
  check('un cliente de otro club no lee los estados ajenos', r.status === 403 && r.body.codigo === 'OTRO_CLUB', r.status);
  r = await EST.manejarEstadosEscribir(pedido(tokJujuy, 'deportivo', 'deportivo-primera',
    { cambios: { 'X|DEPORTIVO LA PLATA': { estado: 'BAJA', actualizado: Date.now() } } }));
  check('ni los escribe', r.status === 403 && !hashes[HASH], r.status);
  r = await EST.manejarEstados(pedido(tokDT1, 'deportivo', 'categoria-inventada'));
  check('una categoría que no está en el catálogo no crea claves', r.status === 404 && !hashes[EST.claveKV('deportivo', 'categoria-inventada')]);
  r = await EST.manejarEstados(pedido(tokPausado, 'pausado', 'pausado-primera'));
  check('un club pausado no recibe el servicio', r.status === 403 && r.body.codigo === 'SUSCRIPCION', r.status);
  r = await EST.manejarEstados(pedido(tokAdmin, 'pausado', 'pausado-primera'));
  check('el admin sí, para poder revisar', r.status === 200, r.status);
  r = await EST.manejarEstados(pedido(tokDT1, 'deportivo', 'deportivo-primera'));
  check('el DT lee los de su club', r.status === 200 && r.body.ok && JSON.stringify(r.body.estados) === '{}');

  /* =====================================================================
     3. DOS SESIONES DEL MISMO CLUB
     ===================================================================== */
  titulo('3. LO QUE MARCA UNO LO VE EL OTRO');

  const t0 = Date.now();
  r = await EST.manejarEstadosEscribir(pedido(tokDT1, 'deportivo', 'deportivo-primera', { cambios: {
    'GOMEZ, LUCAS|DEPORTIVO LA PLATA': { estado: 'SUSPENSO', origen: 'usuario', desde: '2026-09-12', nota: 'Esguince', actualizado: t0 },
  } }));
  check('el DT 1 marca un lesionado y el servidor lo escribe',
    r.status === 200 && r.body.escritos.join() === 'GOMEZ, LUCAS|DEPORTIVO LA PLATA', JSON.stringify(r.body));
  r = await EST.manejarEstados(pedido(tokDT2, 'deportivo', 'deportivo-primera'));
  check('el asistente, en OTRA sesión, lo ve en su próxima lectura',
    r.status === 200 && r.body.estados['GOMEZ, LUCAS|DEPORTIVO LA PLATA'].estado === 'SUSPENSO');
  check('con la nota y la fecha', r.body.estados['GOMEZ, LUCAS|DEPORTIVO LA PLATA'].nota === 'Esguince'
    && r.body.estados['GOMEZ, LUCAS|DEPORTIVO LA PLATA'].desde === '2026-09-12');
  r = await EST.manejarEstados(pedido(tokAdmin, 'deportivo', 'deportivo-primera'));
  check('y el admin también', r.body.estados['GOMEZ, LUCAS|DEPORTIVO LA PLATA'].estado === 'SUSPENSO');

  /* El asistente marca a OTRO jugador: el hash suma un campo, no se
     reemplaza. Y la respuesta le trae lo que marcó el DT 1. */
  r = await EST.manejarEstadosEscribir(pedido(tokDT2, 'deportivo', 'deportivo-primera', { cambios: {
    'RUIZ, TOMAS|DEPORTIVO LA PLATA': { estado: 'BAJA', actualizado: Date.now() },
  } }));
  check('marcar a otro jugador NO pisa el del compañero',
    Object.keys(hashes[HASH]).sort().join() === 'GOMEZ, LUCAS|DEPORTIVO LA PLATA,RUIZ, TOMAS|DEPORTIVO LA PLATA');
  check('y la respuesta trae el mapa entero, con lo que cargó el otro',
    !!r.body.estados['GOMEZ, LUCAS|DEPORTIVO LA PLATA'] && !!r.body.estados['RUIZ, TOMAS|DEPORTIVO LA PLATA']);

  /* Un navegador que estuvo sin red vuelve con una decisión de AYER sobre
     el mismo jugador: no pisa la de hoy. */
  r = await EST.manejarEstadosEscribir(pedido(tokDT2, 'deportivo', 'deportivo-primera', { cambios: {
    'GOMEZ, LUCAS|DEPORTIVO LA PLATA': { estado: 'ACTIVO', actualizado: t0 - 86400000 },
  } }));
  check('una decisión más vieja no pisa a la más nueva',
    r.body.ignorados.length === 1 && JSON.parse(hashes[HASH]['GOMEZ, LUCAS|DEPORTIVO LA PLATA']).estado === 'SUSPENSO');
  r = await EST.manejarEstadosEscribir(pedido(tokDT2, 'deportivo', 'deportivo-primera', { cambios: {
    'GOMEZ, LUCAS|DEPORTIVO LA PLATA': { estado: 'ACTIVO', actualizado: Date.now() + 1 },
  } }));
  check('una más nueva sí: «Reactivar» escribe ACTIVO, no borra',
    JSON.parse(hashes[HASH]['GOMEZ, LUCAS|DEPORTIVO LA PLATA']).estado === 'ACTIVO');

  /* LA VUELTA COMPLETA DEL NAVEGADOR, con dos copias locales distintas y
     el motor que usa el buzón. */
  const api = (tok) => ({
    leer: async () => (await EST.manejarEstados(pedido(tok, 'deportivo', 'deportivo-primera'))).body.estados,
    escribir: async (c) => (await EST.manejarEstadosEscribir(pedido(tok, 'deportivo', 'deportivo-primera', { cambios: c }))).body.estados,
  });
  let navA = E.aplicar({}, E.claveJugador('PAZ, IVAN', 'DEPORTIVO LA PLATA'), 'ALTA');
  let navB = {};
  const vA = await E.sincronizarConServidor(navA, api(tokDT1));
  check('el navegador A sube lo que marcó', vA.subidos.length === 1);
  const vB = await E.sincronizarConServidor(navB, api(tokDT2));
  navB = vB.mapa;
  check('el navegador B, que no tenía nada, baja las tres decisiones del club',
    Object.keys(navB).length === 3 && E.registroDe(navB, E.claveJugador('PAZ, IVAN', 'DEPORTIVO LA PLATA')).estado === 'ALTA'
    && vB.cambio === true, Object.keys(navB).join(' · '));

  /* =====================================================================
     4. UPSTASH CAÍDO NO BORRA NADA
     ===================================================================== */
  titulo('4. CON KV CAÍDO · el navegador se queda con lo suyo');

  falla.hash = true;
  r = await EST.manejarEstados(pedido(tokDT1, 'deportivo', 'deportivo-primera'));
  check('una lectura fallida contesta 503 y NO un mapa vacío', r.status === 503 && r.body.estados === undefined, r.status);
  const antesFalla = JSON.stringify(navB);
  let quedo = navB;
  try { quedo = (await E.sincronizarConServidor(navB, api(tokDT1))).mapa; } catch (e) { /* el buzón lo atrapa */ }
  check('y la copia local del navegador sigue intacta', JSON.stringify(quedo) === antesFalla);
  falla.hash = false;
  falla.escribirCampos = true;
  r = await EST.manejarEstadosEscribir(pedido(tokDT1, 'deportivo', 'deportivo-primera',
    { cambios: { 'NUEVO, JUGADOR|DEPORTIVO LA PLATA': { estado: 'BAJA', actualizado: Date.now() } } }));
  check('una escritura fallida lo dice (503), para que el buzón reintente', r.status === 503 && r.body.codigo === 'KV_ESCRITURA');
  falla.escribirCampos = false;

  const muchos = {};
  for (let i = 0; i < EST.MAX_CAMBIOS + 1; i++) muchos['J' + i + '|DEPORTIVO LA PLATA'] = { estado: 'BAJA', actualizado: Date.now() };
  r = await EST.manejarEstadosEscribir(pedido(tokDT1, 'deportivo', 'deportivo-primera', { cambios: muchos }));
  check('un pedido desmedido se rechaza entero', r.status === 413);

  /* =====================================================================
     5. NINGUNA RUTINA TOCA LOS ESTADOS
     ===================================================================== */
  titulo('5. LO QUE CARGA UN USUARIO NO LO PISA NINGUNA RUTINA');

  const fuenteEst = fs.readFileSync('./server/api/estados.js', 'utf8');
  check('el endpoint de estados no tiene un solo camino que borre o reemplace el mapa',
    !/\.borrar\(|\.escribir\(|'DEL'|'SET'/.test(fuenteEst));
  const fuenteKv = fs.readFileSync('./server/lib/kv.js', 'utf8');
  const escCampos = fuenteKv.slice(fuenteKv.indexOf('async function escribirCampos'), fuenteKv.indexOf('async function tamanoHash'));
  check('y la escritura de campos es HSET: suma o actualiza campos, nunca los demás',
    /'HSET'/.test(escCampos) && !/'DEL'|'SET'|'HDEL'/.test(escCampos));
  ['server/api/handlers.js', 'server/lib/catalogo.js', 'server/lib/catalogo-mutar.js', 'server/bin/catalogo.js']
    .forEach(f => check('  ' + f + ' no nombra la clave de los estados',
      fs.readFileSync(f, 'utf8').indexOf('sgadd:estados') === -1));

  /* Un cambio del catálogo de verdad, con estados cargados. */
  const hashAntes = JSON.stringify(hashes[HASH]);
  ops.length = 0;
  r = await H.manejarCatalogoEscribir({ headers: { authorization: 'Bearer ' + tokAdmin },
    body: { accion: 'cambiar_plan', club: 'jujuy', plan: 'PLATA' }, query: {} });
  check('el admin cambia el plan de otro club', r.status === 200, r.status + ' ' + (r.body && r.body.mensaje));
  check('y el hash de estados no se tocó', JSON.stringify(hashes[HASH]) === hashAntes
    && !ops.some(o => /sgadd:estados/.test(o)), ops.join(' · '));

  /* =====================================================================
     6. EL CATÁLOGO SE ESCRIBE SOBRE LO QUE HAY, NO SOBRE UNA COPIA
     ===================================================================== */
  titulo('6. UPSERT DEL CATÁLOGO · KV recién leído o no se escribe');

  /* 6.a · el caché de OTRA instancia. Esta instancia leyó el catálogo
     hace un rato; en el medio otro admin cargó un partido y publicó zonas.
     Un alta sobre la foto vieja lo deshacía. */
  sembrar();
  await catalogo.cargar();                         // esta instancia cachea
  const otraInstancia = JSON.parse(store[catalogo.CLAVE_KV]);
  otraInstancia.deportivo.partidosManuales['deportivo-primera']['IDA|REGULAR'].push(
    { id: 'm2', fecha: '2026-07-16', local: 'UNIVERSAL', visitante: 'DEPORTIVO LA PLATA', pl: 55, pv: 71 });
  otraInstancia.jujuy.competencia = { formatos: { g: { zonas: [] } }, porTramo: { '*': 'g' } };
  store[catalogo.CLAVE_KV] = JSON.stringify(otraInstancia);
  check('(el caché de esta instancia todavía tiene la foto vieja)',
    (await catalogo.cargar()).catalogo.deportivo.partidosManuales['deportivo-primera']['IDA|REGULAR'].length === 1);

  r = await H.manejarCatalogoEscribir({ headers: { authorization: 'Bearer ' + tokAdmin },
    body: { accion: 'pausar', club: 'jujuy' }, query: {} });
  const tras = JSON.parse(store[catalogo.CLAVE_KV]);
  check('pausar un club se aplica', r.status === 200 && tras.jujuy.estado === 'pausado', r.status);
  check('y NO deshace el partido que cargó otro admin en el medio',
    tras.deportivo.partidosManuales['deportivo-primera']['IDA|REGULAR'].length === 2);
  check('ni las zonas que publicó', !!tras.jujuy.competencia && !!tras.jujuy.competencia.formatos.g);
  check('ni los planes', tras.deportivo.plan === 'PLATA');

  /* 6.b · KV no contesta al escribir. Antes: la cascada bajaba al literal
     del código y ESE se escribía encima de KV. */
  const intacto = store[catalogo.CLAVE_KV];
  catalogo.limpiarCache();
  falla.leer = true;
  ops.length = 0;
  r = await H.manejarCatalogoEscribir({ headers: { authorization: 'Bearer ' + tokAdmin },
    body: { accion: 'reactivar', club: 'jujuy' }, query: {} });
  falla.leer = false;
  check('con KV ilegible el catálogo NO se escribe (503)', r.status === 503 && r.body.codigo === 'KV_ILEGIBLE', r.status + ' ' + r.body.codigo);
  check('y no salió ni un SET', !ops.some(o => /^SET /.test(o)), ops.join(' · '));
  check('KV quedó exactamente como estaba: partidos, zonas y planes', store[catalogo.CLAVE_KV] === intacto);
  check('el mensaje dice por qué no se escribió', /pisaría lo publicado/.test(r.body.mensaje || ''), r.body.mensaje);

  /* 6.c · un catálogo inválido en KV tampoco se pisa con el respaldo. */
  store[catalogo.CLAVE_KV] = JSON.stringify('{"doble":"serializado"}');
  let codigo = null;
  try { await catalogo.cargarParaEscribir(); } catch (e) { codigo = e.codigo; }
  check('un KV inválido tampoco se escribe encima: hay que repararlo', codigo === 'KV_INVALIDO' || codigo === 'KV_ILEGIBLE', codigo);

  /* 6.d · la clave ausente sí parte del respaldo: es la primera alta. */
  delete store[catalogo.CLAVE_KV];
  const vacia = await catalogo.cargarParaEscribir();
  check('sin catálogo en KV todavía, se siembra desde el respaldo', vacia.origen === 'codigo' || vacia.origen === 'env');

  /* 6.e · lo que devuelve es una COPIA: mutarla no toca lo leído. */
  sembrar();
  const copia = await catalogo.cargarParaEscribir();
  copia.catalogo.deportivo.plan = 'ORO';
  check('devuelve una copia: mutarla no cambia lo guardado', JSON.parse(store[catalogo.CLAVE_KV]).deportivo.plan === 'PLATA');

  const cli = fs.readFileSync('./server/bin/catalogo.js', 'utf8');
  check('el CLI escribe sobre `cargarParaEscribir` en alta, baja y sembrar',
    /cargarParaEscribir\(\)/.test(cli) && /\['sembrar', 'alta', 'baja'\]/.test(cli));

  /* =====================================================================
     7. UN DEPLOY O UNA REINDEXACIÓN NO RESETEAN LA COPIA LOCAL
     ===================================================================== */
  titulo('7. UPGRADES · la copia local conserva su clave y su contenido');

  check('la clave local es la de siempre: un deploy no la cambia',
    E.claveAlmacen('reconquista', 'primera-clausura-2026') === 'sgadd.estados.reconquista.primera-clausura-2026');
  const legado = { 'VIEJO, UNO|A': { estado: 'BAJA', origen: 'usuario', desde: '2026-08-01' },
    'VIEJO, DOS|A': { estado: 'SUSPENSO', origen: 'usuario', desde: '2026-08-20' } };
  const primera = E.fusionarRemoto(legado, {});
  check('los estados guardados antes de la sincronización se conservan todos',
    Object.keys(primera.mapa).length === 2 && primera.mapa['VIEJO, UNO|A'].estado === 'BAJA');
  check('y se suben la primera vez: migran solos al servidor', primera.subir.length === 2);

  const buzon = fs.readFileSync('./js/sgadd-buzon.js', 'utf8');
  const cuerpo = (nombre) => {
    const i = buzon.indexOf('function ' + nombre + '(');
    const j = buzon.slice(i + 10).search(/\n  function /);
    return i < 0 ? '' : buzon.slice(i, j < 0 ? undefined : i + 10 + j);
  };
  check('la vuelta del servidor FUSIONA contra el mapa de ahora, no lo reemplaza',
    /fusionarRemoto\(estado\.mapa, r\.mapa\)/.test(cuerpo('sincronizarRemoto'))
    && !/estado\.mapa = r\.mapa;/.test(cuerpo('sincronizarRemoto')));
  check('marcar, resolver y reactivar comparten en el mismo gesto',
    ['marcar', 'resolver', 'revertir'].every(f => /sincronizarRemoto\(true, true\)/.test(cuerpo(f))));
  check('sin backend ni sesión no hay vuelta al servidor: el buzón es el de antes',
    /estadosCompartibles\(\)/.test(cuerpo('destinoRemoto')));
  check('la clave del servidor es el slug de la categoría, no el id del JSON',
    /p\.slug/.test(cuerpo('destinoRemoto')));
  check('se baja al volver a la pestaña y cada 30 s mientras está a la vista',
    /visibilitychange/.test(cuerpo('iniciarSondeo')) && /SONDEO_MS = 30000/.test(buzon));

  /* El cliente habla con las rutas de verdad. */
  const D = require('./js/sgadd-data.js');
  const A = require('./js/sgadd-auth.js');
  D.configurar('https://api.prueba');
  A.establecerToken(tokDT1);
  const llamadas = [];
  const fetchFalso = async (url, init) => {
    llamadas.push((init && init.method || 'GET') + ' ' + url);
    const m = url.match(/\/api\/v1\/estados\/([^/]+)\/([^/?]+)/);
    const req = pedido(A.token(), decodeURIComponent(m[1]), decodeURIComponent(m[2]),
      init && init.body ? JSON.parse(init.body) : {});
    const res = (init && init.method === 'POST') ? await EST.manejarEstadosEscribir(req) : await EST.manejarEstados(req);
    return { ok: res.status < 400, status: res.status, json: async () => res.body };
  };
  const lei = await D.leerEstados('deportivo', 'deportivo-primera', { fetch: fetchFalso });
  check('SGADD_DATA.leerEstados pega a GET /api/v1/estados/<club>/<categoría>',
    lei.ok && llamadas[0] === 'GET https://api.prueba/api/v1/estados/deportivo/deportivo-primera', llamadas[0]);
  const gua = await D.guardarEstados('deportivo', 'deportivo-primera',
    { 'SOSA, ALAN|DEPORTIVO LA PLATA': { estado: 'SUSPENSO', actualizado: Date.now() + 5 } }, { fetch: fetchFalso });
  check('y guardarEstados manda un POST con los cambios', gua.ok && /^POST /.test(llamadas[1]) && gua.escritos.length === 1);
  A.establecerToken(tokJujuy);
  let lanzo = null;
  try { await D.leerEstados('deportivo', 'deportivo-primera', { fetch: fetchFalso }); } catch (e) { lanzo = e.codigo; }
  check('un error del servidor LANZA con su código: no se confunde con «no hay nada»', lanzo === 'OTRO_CLUB', lanzo);

  console.log('\n' + '═'.repeat(70));
  if (fail === 0) console.log('✓ TODO OK   ' + ok + ' pasaron, 0 fallaron');
  else { console.log('✗ HAY FALLAS   ' + ok + ' pasaron, ' + fail + ' fallaron'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
