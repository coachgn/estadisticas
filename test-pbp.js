/* =====================================================================
   test-pbp.js · la capa de LABORATORIO de play-by-play (punto 62)

   Quintetos, cierre, clutch y mapa de tiro que arma motorstats-ingestion
   desde el play-by-play oficial y sirve `/api/v1/pbp`. Se prueban juntas
   las cuatro mitades, porque son la misma propiedad vista desde cuatro
   lados: SOLO LA CATEGORÍA HABILITADA LO VE, Y NADIE MÁS SE ENTERA.

     1 · el vocabulario cerrado de capas y cómo se lee de una categoría;
     2 · el catálogo: validar, resolver, publicar y la acción que la cambia;
     3 · el endpoint, contra el handler de verdad y un Upstash de mentira;
     4 · la pantalla: el bloque se pinta, escapa lo que viene de afuera, y
         la pestaña y la card NO aparecen sin la capa.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('./server/lib/env.js').cargar();

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

/* ------------------------------------------------------ Upstash de mentira */
const kv = require('./server/lib/kv.js');
const store = {};
const hashes = {};
const ops = [];
const falla = { hash: false };
kv.configurado = () => true;
kv.leer = async (k) => { ops.push('GET ' + k); return { valor: store[k] !== undefined ? JSON.parse(store[k]) : null, error: null }; };
kv.escribir = async (k, v) => { ops.push('SET ' + k); store[k] = JSON.stringify(v); };
kv.borrar = async (k) => { ops.push('DEL ' + k); delete store[k]; };
kv.leerCampos = async (k, campos) => {
  ops.push('HMGET ' + k);
  if (falla.hash) throw Object.assign(new Error('caído'), { codigo: 'KV' });
  const h = hashes[k] || {}; const out = {};
  campos.forEach(c => { if (h[c] !== undefined) out[c] = JSON.parse(h[c]); });
  return out;
};
kv.leerHash = async () => { throw new Error('el endpoint no tiene por qué leer el hash entero'); };
kv.escribirCampos = async () => { throw new Error('el endpoint NO escribe'); };

const auth = require('./server/lib/auth.js');
const catalogo = require('./server/lib/catalogo.js');
const mutar = require('./server/lib/catalogo-mutar.js');
const sheets = require('./server/lib/google-sheets.js');
const H = require('./server/api/handlers.js');
const PBP = require('./server/api/pbp.js');
const A = require('./js/sgadd-auth.js');
global.SGADD = require('./js/sgadd-core.js');

sheets.obtenerLibro = async () => ({ hojas: { 'PROMEDIOS J': [['NOMBRES', 'EQUIPO', 'MIN'], ['PEREZ, JUAN', 'JUJUY BASQUET', 20]] },
  hojasTexto: {}, faltantes: [], leidoEn: 1 });

const CAT = {
  jujuy: {
    nombre: 'Jujuy Básquet', liga: 'liga-argentina', equipoPropio: 'JUJUY BASQUET', plan: 'ORO',
    categorias: { 'jujuy-primera': { label: 'Conferencia Norte', sheetId: 'SHEETJUJUY00000000000000', laboratorio: ['pbp'] } },
  },
  deportivo: {
    nombre: 'Deportivo La Plata', liga: 'la-plata', equipoPropio: 'DEPORTIVO LA PLATA', plan: 'ORO',
    categorias: { 'deportivo-primera': { label: 'Primera 2026', sheetId: 'SHEETDEPORTIVO0000000000' } },
  },
  /* Un TORNEO con su zona y un CLIENTE enganchado a esa zona (Boca en la
     LNB, 2026-10-09): el cliente lee los tiros que la ingesta sube al torneo. */
  'liga-x': {
    nombre: 'Liga X', tipo: 'torneo', liga: 'liga-x',
    categorias: { 'liga-x-unica': { label: 'Única', sheetId: 'SHEETLIGAX00000000000000', zona: 'unica', laboratorio: ['pbp'] } },
  },
  boca: {
    nombre: 'Boca', liga: 'liga-x', equipoPropio: 'BOCA', plan: 'PLATA',
    categorias: {
      'boca-lnb': { label: 'LNB', sheetId: 'SHEETLIGAX00000000000000', torneo: 'liga-x', zona: 'unica', laboratorio: ['pbp'] },
      /* Sin el campo: HEREDA la capa de la zona (punto 101). */
      'boca-sin': { label: 'LNB sin capa propia', sheetId: 'SHEETLIGAX00000000000000', torneo: 'liga-x', zona: 'unica' },
      /* Lista vacía: apagada a propósito para este cliente. */
      'boca-off': { label: 'LNB apagada', sheetId: 'SHEETLIGAX00000000000000', torneo: 'liga-x', zona: 'unica', laboratorio: [] },
    },
  },
  pausado: {
    nombre: 'Pausado', liga: 'liga-argentina', equipoPropio: 'PAUSADO', plan: 'ORO', estado: 'pausado',
    categorias: { 'pausado-primera': { label: 'Primera', sheetId: 'SHEETPAUSADO000000000000', laboratorio: ['pbp'] } },
  },
};
const sembrar = () => { store[catalogo.CLAVE_KV] = JSON.stringify(CAT); catalogo.limpiarCache(); };

const tokAdmin = auth.firmarToken({ email: 'freytesgn@gmail.com' }, { expiraEn: '1h' });
const tokJujuy = auth.firmarToken({ email: 'dt@jujuy.com', club: 'jujuy', equipoAsignado: 'JUJUY BASQUET', plan: 'ORO' }, { expiraEn: '1h' });
const tokDep = auth.firmarToken({ email: 'dt@deportivo.com', club: 'deportivo', equipoAsignado: 'DEPORTIVO LA PLATA', plan: 'ORO' }, { expiraEn: '1h' });
const tokPausado = auth.firmarToken({ email: 'dt@pausado.com', club: 'pausado', equipoAsignado: 'PAUSADO', plan: 'ORO' }, { expiraEn: '1h' });

const pedido = (tok, params, query) => ({ headers: tok ? { authorization: 'Bearer ' + tok } : {}, params: params || {}, body: {}, query: query || {} });

/* Un paquete con la forma de `motorstats-ingestion/exportar-web.js`. Los
   nombres traen markup a propósito: salen de un sitio de terceros. */
function paquete(equipo) {
  const J = { 1: { n: 'STEHLI, RAMIRO', d: '7' }, 2: { n: 'IBARRA, SANTIAGO', d: '5' }, 3: { n: 'MARINI, <script>X</script>', d: '9' },
    4: { n: 'TARNOWYK, FRANCISCO', d: '11' }, 5: { n: 'GRYTSAK, ANDRIY', d: '14' }, 6: { n: 'CONTI, BRUNO', d: '10' } };
  const combo = (ids, min, ok) => ({ ids, min, pj: 20, mm: 42, mm40: 7.7, pf: 439, pc: 397, off: 90.9, def: 92.2, net: -1.4,
    ortg: 109.4, drtg: 100.9, netPos: 8.5, efg: 48.7, efgC: 53.2, ok });
  return {
    esquema: 'motorstats-ingestion/analitica-pbp-web@1', generadoEl: '2026-09-14T18:00:00Z', equipo, idEquipo: '89190',
    competencia: 'Liga Argentina 2025/26 · Conferencia Norte · Fase regular',
    partidos: { jugados: 32, validados: 31, excluidos: [{ fecha: '2025-12-18', rival: 'COLON <b>(SF)</b>', motivo: 'el marcador oficial no coincide con el play-by-play' }] },
    jugadores: J,
    iniciales: [{ ids: ['1', '2', '3', '4', '5'], veces: 15, g: 8, p: 7, min: 90.2 }],
    cierre: { alFinal: [{ ids: ['1', '2', '3', '4', '6'], veces: 6, g: 3, p: 3, min: 0 }], ultimos5: [{ ids: ['1', '2', '3', '4', '5'], veces: 6, g: 3, p: 3, min: 20 }] },
    quintetos: [combo(['1', '2', '3', '4', '5'], 218.8, true), combo(['1', '2', '3', '4', '6'], 7.2, false)],
    trios: [combo(['1', '2', '3'], 300, true)], duos: [combo(['1', '2'], 600, true)],
    umbrales: { 2: 60, 3: 40, 5: 15 },
    clutch: { definicion: {}, equipo: { partidos: 29, ganados: 15, perdidos: 14, minutos: 98.5, masMenos: -6, efgPct: 44.1, perdidas: 30 },
      jugadores: [{ id: '1', pj: 20, min: 60, mm: -7, pts: 40, tc: '13/45', t3: '4/20', tl: '13/26', efg: 33, ts: 40, usos: 65.4, porc: 27.6, pp: 9, ast: 5, reb: 8,
        def: { tiros: 5, convertidos: 2, puntos: 5, perdidas: 1 } }] },
    tiros: { calibracion: { triplesMasAllaDeLaLinea: 99.9 },
      celdas: [{ x: 1, y: 7, i: 400, c: 250, t: 0 }, { x: 8, y: 7, i: 80, c: 25, t: 80 }, { x: 5, y: 2, i: 30, c: 14, t: 0 }],
      zonas: [{ zona: 'Z1', v: 2, i: 1000, c: 560, pct: 56 }], jugadores: [] },
  };
}

(async () => {
  /* =================================================================== */
  titulo('1 · EL VOCABULARIO · capas cerradas, por categoría');
  check('la única capa hoy es `pbp`', JSON.stringify(Object.keys(A.CAPAS_LABORATORIO)) === '["pbp"]');
  check('capasDeCategoria lee la de la categoría, normaliza y sin repetir',
    JSON.stringify(A.capasDeCategoria({ categorias: { a: { laboratorio: [' PBP ', 'pbp'] } } }, 'a')) === '["pbp"]');
  check('una capa que no existe se ignora al leer',
    JSON.stringify(A.capasDeCategoria({ categorias: { a: { laboratorio: ['pbp', 'inventada'] } } }, 'a')) === '["pbp"]');
  check('NO se hereda del club: un laboratorio en el club no habilita la categoría',
    A.capasDeCategoria({ laboratorio: ['pbp'], categorias: { a: {} } }, 'a').length === 0);
  check('una acción de laboratorio se aplica de a un cliente', JSON.stringify(A.alcancesDe('cambiar_laboratorio')) === '["club"]'
    && /UN cliente/.test(A.motivoSinAlcance('cambiar_laboratorio', 'todos')));
  const vendor = fs.readFileSync('./server/lib/compartido/sgadd-auth.js', 'utf8');
  check('la copia vendorizada del motor trae las capas y su motivo de alcance (la deriva byte a byte la mide test-backend)',
    /CAPAS_LABORATORIO/.test(vendor) && /cambiar_laboratorio/.test(vendor) && /leerPbp/.test(fs.readFileSync('./server/lib/compartido/sgadd-data.js', 'utf8')));

  /* =================================================================== */
  titulo('2 · EL CATÁLOGO · validar, resolver, publicar y cambiar');
  check('un catálogo con laboratorio bien formado valida', catalogo.validar(CAT) === null);
  check('`laboratorio` que no es una lista se rechaza con su nombre',
    /laboratorio/.test(catalogo.validar({ x: { nombre: 'X', categorias: { y: { label: 'Y', laboratorio: 'pbp' } } } }) || ''));
  const r = catalogo.resolver(CAT, 'jujuy', 'jujuy-primera');
  check('resolver trae las capas de la categoría', JSON.stringify(r.laboratorio) === '["pbp"]');
  check('y una categoría sin el campo, lista vacía', JSON.stringify(catalogo.resolver(CAT, 'deportivo', 'deportivo-primera').laboratorio) === '[]');
  const pubJujuy = catalogo.publico(CAT, { club: 'jujuy', origen: 'kv' });
  const catJ = pubJujuy.find(c => c.id === 'jujuy').categorias[0];
  const catD = pubJujuy.find(c => c.id === 'deportivo').categorias[0];
  check('publico: el club del token ve SUS capas', JSON.stringify(catJ.laboratorio) === '["pbp"]');
  check('publico: las de OTRO club no viajan', catD.laboratorio === undefined);
  const pubAdmin = catalogo.publico(CAT, { admin: true, origen: 'kv' });
  check('publico: el admin las ve', JSON.stringify(pubAdmin.find(c => c.id === 'jujuy').categorias[0].laboratorio) === '["pbp"]');

  const m1 = mutar.aplicar(CAT, 'cambiar_laboratorio', { club: 'deportivo', categoria: 'deportivo-primera', capas: 'pbp' }, catalogo.validar);
  check('cambiar_laboratorio habilita en UNA categoría', m1.ok && JSON.stringify(m1.catalogo.deportivo.categorias['deportivo-primera'].laboratorio) === '["pbp"]');
  check('y no toca nada más del catálogo',
    JSON.stringify(Object.assign({}, m1.catalogo, { deportivo: CAT.deportivo })) === JSON.stringify(CAT)
    && m1.catalogo.deportivo.plan === 'ORO' && m1.catalogo.deportivo.categorias['deportivo-primera'].sheetId === CAT.deportivo.categorias['deportivo-primera'].sheetId);
  const m2 = mutar.aplicar(m1.catalogo, 'cambiar_laboratorio', { club: 'deportivo', categoria: 'deportivo-primera', capas: '' }, catalogo.validar);
  check('vacío BORRA el campo: la categoría queda exactamente como antes',
    m2.ok && !('laboratorio' in m2.catalogo.deportivo.categorias['deportivo-primera']));
  const m3 = mutar.aplicar(CAT, 'cambiar_laboratorio', { club: 'deportivo', categoria: 'deportivo-primera', capas: 'pbp,quinteto' }, catalogo.validar);
  check('una capa desconocida se RECHAZA (un typo no puede dejar la prueba apagada en silencio)', !m3.ok && /quinteto/.test(m3.motivo));
  const m4 = mutar.aplicar(CAT, 'cambiar_laboratorio', { club: 'deportivo', capas: 'pbp' }, catalogo.validar);
  check('sin categoría se rechaza: no se habilita un club entero', !m4.ok && /categoría/.test(m4.motivo));
  const m5 = mutar.aplicar(CAT, 'cambiar_laboratorio', { club: 'deportivo', categoria: 'deportivo-primera', capas: 'pbp', alcance: 'todos' }, catalogo.validar);
  check('y no se propaga a todos los clientes', !m5.ok);

  /* =================================================================== */
  titulo('3 · EL ENDPOINT · /api/v1/pbp, contra el handler de verdad');
  sembrar();
  const HASH = PBP.claveKV('jujuy', 'jujuy-primera');
  hashes[HASH] = {
    [PBP.CAMPO_INDICE]: JSON.stringify({ competencia: 'Conferencia Norte', equipos: [{ equipo: 'JUJUY BASQUET' }, { equipo: 'AMANCAY (LR)' }] }),
    [PBP.campoDeEquipo('JUJUY BASQUET')]: JSON.stringify(paquete('JUJUY BASQUET')),
    [PBP.campoDeEquipo('AMANCAY (LR)')]: JSON.stringify(paquete('AMANCAY (LR)')),
  };
  const get = (tok, club, cat, q) => { catalogo.limpiarCache(); return PBP.manejarPbp(pedido(tok, { clubId: club, categoria: cat }, q)); };

  let x = await get(null, 'jujuy', 'jujuy-primera');
  check('sin token: 401', x.status === 401);
  x = await get(tokJujuy, 'jujuy', 'jujuy-primera');
  check('el cliente con la capa lee el índice', x.status === 200 && x.body.indice.equipos.length === 2 && x.body.capaHabilitada === true);
  x = await get(tokJujuy, 'jujuy', 'jujuy-primera', { equipo: 'JUJUY BASQUET' });
  check('y el paquete de SU equipo', x.status === 200 && x.body.paquete.equipo === 'JUJUY BASQUET');
  x = await get(tokJujuy, 'jujuy', 'jujuy-primera', { equipo: 'AMANCAY (LR)' });
  check('y el de un RIVAL de su categoría: es el scouting que prueba la capa', x.status === 200 && x.body.paquete.equipo === 'AMANCAY (LR)');
  x = await get(tokJujuy, 'jujuy', 'jujuy-primera', { equipo: 'jujuy basquet - mm' });
  check('el equipo se resuelve con claveEquipo, no con el texto crudo', x.status === 200 && x.body.paquete.equipo === 'JUJUY BASQUET');
  x = await get(tokJujuy, 'deportivo', 'deportivo-primera');
  check('otro club: 403', x.status === 403 && x.body.codigo === 'OTRO_CLUB');
  x = await get(tokDep, 'deportivo', 'deportivo-primera');
  check('un cliente SIN la capa: 403 SIN_CAPA, aunque sea ORO', x.status === 403 && x.body.codigo === 'SIN_CAPA');
  x = await get(tokPausado, 'pausado', 'pausado-primera');
  check('una categoría pausada no recibe el servicio aunque tenga la capa', x.status === 403 && x.body.codigo === 'SUSCRIPCION');
  x = await get(tokAdmin, 'deportivo', 'deportivo-primera');
  check('el admin pasa sin la capa, para revisar ANTES de habilitar (y ahí no hay datos: 404)', x.status === 404 && x.body.codigo === 'SIN_DATOS');
  x = await get(tokAdmin, 'jujuy', 'jujuy-primera', { equipo: 'EQUIPO QUE NO EXISTE' });
  check('un equipo sin paquete: 404 con su nombre', x.status === 404 && /EQUIPO QUE NO EXISTE/.test(x.body.mensaje));
  x = await get(tokJujuy, 'jujuy', 'categoria-inventada');
  check('una categoría que no existe: 404', x.status === 404);
  falla.hash = true;
  x = await get(tokJujuy, 'jujuy', 'jujuy-primera', { equipo: 'JUJUY BASQUET' });
  falla.hash = false;
  check('Upstash que no contesta: 503, nunca un «no hay datos»', x.status === 503 && x.body.codigo === 'KV_ILEGIBLE');
  check('el endpoint pide UN campo (HMGET) y no escribe nunca', ops.every(o => !/^(SET|DEL|HSET)/.test(o)) && ops.some(o => o.startsWith('HMGET ')));
  check('está ruteado en la app', /app\.get\('\/api\/v1\/pbp\/:clubId\/:categoria'/.test(fs.readFileSync('./server/app.js', 'utf8')));

  /* EL CLIENTE ENGANCHADO A UNA ZONA DE TORNEO lee los tiros del torneo (2026-10-09). */
  const tokBoca = auth.firmarToken({ email: 'dt@boca.com', club: 'boca', equipoAsignado: 'BOCA', plan: 'PLATA' }, { expiraEn: '1h' });
  hashes[PBP.claveKV('liga-x', 'liga-x-unica')] = { [PBP.campoDeEquipo('BOCA')]: JSON.stringify(paquete('BOCA')),
    [PBP.CAMPO_INDICE]: JSON.stringify({ competencia: 'Liga X', equipos: [{ equipo: 'BOCA' }] }) };
  x = await get(tokBoca, 'boca', 'boca-lnb', { equipo: 'BOCA' });
  check('cliente enganchado a una zona: lee el paquete que la ingesta subió AL TORNEO', x.status === 200 && x.body.paquete.equipo === 'BOCA', x.body);
  x = await get(tokBoca, 'boca', 'boca-lnb');
  check('  y el índice', x.status === 200 && x.body.indice.competencia === 'Liga X');
  hashes[PBP.claveKV('boca', 'boca-lnb')] = { [PBP.campoDeEquipo('BOCA')]: JSON.stringify(Object.assign(paquete('BOCA'), { propio: true })) };
  x = await get(tokBoca, 'boca', 'boca-lnb', { equipo: 'BOCA' });
  check('si la categoría tiene SU hash, manda el suyo: el del torneo es el respaldo', x.status === 200 && x.body.paquete.propio === true);
  delete hashes[PBP.claveKV('boca', 'boca-lnb')];
  /* LA HERENCIA (punto 101): la categoría enganchada que no declara capas
     recibe las de su zona, sin `catalogo.js laboratorio`. */
  x = await get(tokBoca, 'boca', 'boca-sin', { equipo: 'BOCA' });
  check('enganchada y sin capas propias: HEREDA la de la zona y lee el paquete', x.status === 200 && x.body.paquete.equipo === 'BOCA' && x.body.capaHabilitada === true, x.body);
  x = await get(tokBoca, 'boca', 'boca-off', { equipo: 'BOCA' });
  check('con la lista vacía está apagada a propósito: 403 SIN_CAPA aunque la zona la tenga', x.status === 403 && x.body.codigo === 'SIN_CAPA');
  check('resolver dice las que rigen: heredada, apagada y propia',
    JSON.stringify(catalogo.resolver(CAT, 'boca', 'boca-sin').laboratorio) === '["pbp"]'
    && JSON.stringify(catalogo.resolver(CAT, 'boca', 'boca-off').laboratorio) === '[]'
    && JSON.stringify(catalogo.resolver(CAT, 'boca', 'boca-lnb').laboratorio) === '["pbp"]');
  const pubBoca = catalogo.publico(CAT, { club: 'boca', origen: 'kv' }).find(c => c.id === 'boca').categorias;
  const deBoca = (slug) => pubBoca.find(k => k.slug === slug);
  check('publico: el cliente recibe la capa heredada y de dónde sale',
    JSON.stringify(deBoca('boca-sin').laboratorio) === '["pbp"]' && deBoca('boca-sin').laboratorioDe === 'torneo'
    && deBoca('boca-lnb').laboratorioDe === 'categoria' && JSON.stringify(deBoca('boca-off').laboratorio) === '[]', pubBoca);

  /* EL ALTA DE UN CLIENTE NUEVO, de punta a punta: se da de alta con el
     libro de la zona y lee los tiros sin un solo comando más. */
  const altaRiver = mutar.aplicar(CAT, 'alta', { club: 'river', nombre: 'River', liga: 'liga-x', equipoPropio: 'RIVER',
    categoria: 'river-lnb', label: 'LNB', libroDe: 'liga-x/liga-x-unica', plan: 'PLATA' }, catalogo.validar);
  const kRiver = altaRiver.ok ? altaRiver.catalogo.river.categorias['river-lnb'] : {};
  check('alta con el libro de una zona: queda enganchada y NO se le copia la capa', altaRiver.ok
    && kRiver.torneo === 'liga-x' && kRiver.zona === 'unica' && !('laboratorio' in kRiver), altaRiver.motivo || kRiver);
  const tokRiver = auth.firmarToken({ email: 'dt@river.com', club: 'river', equipoAsignado: 'RIVER', plan: 'PLATA' }, { expiraEn: '1h' });
  const conCatalogo = (c) => { store[catalogo.CLAVE_KV] = JSON.stringify(c); catalogo.limpiarCache(); };
  conCatalogo(altaRiver.catalogo);
  x = await PBP.manejarPbp(pedido(tokRiver, { clubId: 'river', categoria: 'river-lnb' }, { equipo: 'BOCA' }));
  check('  y el cliente recién dado de alta ya lee los tiros de su zona', x.status === 200 && x.body.paquete.equipo === 'BOCA' && x.body.capaHabilitada === true, x.body);
  catalogo.limpiarCache();
  const eqR = await H.manejarEquipos(pedido(tokRiver, { clubId: 'river' }, { categoria: 'river-lnb' }));
  check('  y /equipos le declara la capa en `alcance.capas`: el panel le ofrece las pestañas',
    eqR.status === 200 && JSON.stringify(eqR.body.alcance.capas) === '["pbp"]', eqR.body.alcance || eqR.body);

  /* La zona manda: apagarla ahí les llega a todos los que heredan, y no a
     quien declaró la suya. */
  const zonaOff = mutar.aplicar(altaRiver.catalogo, 'cambiar_laboratorio', { club: 'liga-x', categoria: 'liga-x-unica', capas: '' }, catalogo.validar);
  conCatalogo(zonaOff.catalogo);
  x = await PBP.manejarPbp(pedido(tokRiver, { clubId: 'river', categoria: 'river-lnb' }, { equipo: 'BOCA' }));
  check('apagar la capa en la ZONA se la saca a los que heredan', zonaOff.ok && x.status === 403 && x.body.codigo === 'SIN_CAPA');
  catalogo.limpiarCache();
  x = await PBP.manejarPbp(pedido(tokBoca, { clubId: 'boca', categoria: 'boca-lnb' }, { equipo: 'BOCA' }));
  check('  y no a la categoría que declaró la suya', x.status === 200);

  /* Apagarla para UN cliente enganchado, y devolverlo a heredar. */
  const riverOff = mutar.aplicar(altaRiver.catalogo, 'cambiar_laboratorio', { club: 'river', categoria: 'river-lnb', capas: '' }, catalogo.validar);
  check('vacío en una enganchada guarda la lista vacía: borrar el campo la haría heredar de nuevo',
    riverOff.ok && JSON.stringify(riverOff.catalogo.river.categorias['river-lnb'].laboratorio) === '[]'
    && catalogo.resolver(riverOff.catalogo, 'river', 'river-lnb').laboratorio.length === 0);
  const riverVuelve = mutar.aplicar(riverOff.catalogo, 'cambiar_laboratorio', { club: 'river', categoria: 'river-lnb', capas: 'heredar' }, catalogo.validar);
  check('`heredar` borra el campo y vuelve a regir la zona',
    riverVuelve.ok && !('laboratorio' in riverVuelve.catalogo.river.categorias['river-lnb'])
    && JSON.stringify(catalogo.resolver(riverVuelve.catalogo, 'river', 'river-lnb').laboratorio) === '["pbp"]');
  sembrar();
  catalogo.limpiarCache();
  const cascadaX = await catalogo.cargar();
  check('claveDeDatos: una categoría sin enganche lee la suya; una enganchada, la suya y la del torneo',
    PBP.claveDeDatos(cascadaX.catalogo, 'jujuy', 'jujuy-primera') === PBP.claveKV('jujuy', 'jujuy-primera')
      && JSON.stringify(PBP.claveDeDatos(cascadaX.catalogo, 'boca', 'boca-lnb')) === JSON.stringify({ propia: PBP.claveKV('boca', 'boca-lnb'), torneo: PBP.claveKV('liga-x', 'liga-x-unica') }));

  catalogo.limpiarCache();
  const eqJ = await H.manejarEquipos(pedido(tokJujuy, { clubId: 'jujuy' }, { categoria: 'jujuy-primera' }));
  catalogo.limpiarCache();
  const eqD = await H.manejarEquipos(pedido(tokDep, { clubId: 'deportivo' }, { categoria: 'deportivo-primera' }));
  check('/equipos declara las capas de la categoría en `alcance.capas`',
    eqJ.status === 200 && JSON.stringify(eqJ.body.alcance.capas) === '["pbp"]', eqJ.body.alcance && eqJ.body.alcance.capas);
  check('y una categoría sin la capa declara lista vacía', eqD.status === 200 && JSON.stringify(eqD.body.alcance.capas) === '[]');

  /* =================================================================== */
  titulo('4 · LA PANTALLA · se pinta, escapa y no aparece sin la capa');
  const P = require('./js/sgadd-pbp.js');
  const h = P.html(paquete('JUJUY BASQUET'));
  check('el bloque dice que es LABORATORIO y sobre cuántos partidos se mide', /Laboratorio/.test(h) && /31\/32/.test(h));
  check('nombra el partido excluido y por qué', /2025-12-18/.test(h) && /marcador oficial/.test(h));
  check('escapa lo que viene de afuera: ningún <script> ni <b> del paquete llega crudo', !/<script>X/.test(h) && !/<b>\(SF\)/.test(h) && /&lt;b&gt;/.test(h));
  check('los quintetos van por apellido, con el nombre completo en el title', /Stehli · Ibarra/.test(h) && /title="STEHLI, RAMIRO/.test(h));
  const iNetPos = h.indexOf('NET/pos'); const iNetPlays = h.indexOf('NET/plays');
  /* La columna por PLAYS se FUE (punto 66): ninguna vista del panel muestra
     un rating por play, y el NET por posesión de al lado es el mismo dato
     en la unidad de la casa. */
  check('el NET de los quintetos va por POSESIÓN', iNetPos > 0);
  check('y la columna por PLAYS ya no existe', iNetPlays === -1);
  check('la muestra corta se marca con ~ y atenuada, no se borra', /~7,2/.test(h) && /opacity-50 fila-tenue/.test(h));
  check('+8,5 por posesión en verde de +/-', /mm-pos">\+8,5/.test(h));
  check('clutch: partidos, récord y la línea del jugador con sus usos', /29<\/b> partidos/.test(h) && /15-14/.test(h) && /65,4/.test(h) && /27,6 %/.test(h));
  const hMapa1 = P.mapaCard(paquete('JUJUY BASQUET'));
  check('mapa @1: una celda por celda del paquete, sobre la media cancha, en su propia card', (hMapa1.match(/<rect x="\d+" y="\d+" width="10" height="10"/g) || []).length === 3 && /<svg class="pbp-mapa/.test(hMapa1) && !/<svg class="pbp-mapa/.test(h));
  check('sin paquete no revienta', /Sin análisis/.test(P.html(null)));
  check('apellido(): «GRYTSAK, ANDRIY» → «Grytsak»', P.apellido('GRYTSAK, ANDRIY') === 'Grytsak');

  const ctxBase = (capas) => {
    const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const ctx = {
      console, JSON, Object, Array, Math, Number, String, Date, isFinite, Map, Set, Promise, require, module: { exports: {} },
      document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
      escapeHtml: esc, escapeAttr: esc,
      SGADD: Object.assign({}, global.SGADD, { CATALOGO: { planillas: [{ id: 'jujuy-apertura-2025', slug: 'jujuy-primera' }] } }),
      CLUB: { estado: { id: 'jujuy' } },
      SGADD_AUTH: A,
      SGADD_UI: { cargando: () => '<div>cargando</div>', escJs: esc, pedirPlan: () => '' },
      SGADD_APP: { estado: { planillaId: 'jujuy-apertura-2025', alcance: capas === null ? null : { capas: capas } } },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('./js/sgadd-pbp.js', 'utf8'), ctx);
    return ctx;
  };
  const conCapa = ctxBase(['pbp']);
  const sinCapa = ctxBase([]);
  const sinAlcance = ctxBase(null);
  check('SGADD_PBP.activa(): con la capa declarada por el servidor, sí', vm.runInContext('SGADD_PBP.activa()', conCapa) === true);
  check('sin la capa, no', vm.runInContext('SGADD_PBP.activa()', sinCapa) === false);
  check('sin alcance (GViz, la demo), no', vm.runInContext('SGADD_PBP.activa()', sinAlcance) === false);

  const cargarEquipos = (ctx) => { vm.runInContext(fs.readFileSync('./js/sgadd-equipos.js', 'utf8'), ctx); return ctx; };
  cargarEquipos(conCapa); cargarEquipos(sinCapa);
  const ids = (ctx) => JSON.stringify(vm.runInContext('equiposTabsOfrecidas().map(t => t.id)', ctx));
  check('Equipos: con la capa se ofrece la pestaña Quintetos', /"pbp"/.test(ids(conCapa)));
  check('Equipos: SIN la capa la pestaña se ve igual y dice qué le falta (2026-10-26)', /"pbp"/.test(ids(sinCapa)) && /"partidos"/.test(ids(sinCapa))
    && /data-pbp-sin-capa="1"/.test(vm.runInContext('equiposTab(null, { nombre: "JUJUY BASQUET" }, "pbp")', sinCapa)));
  check('la pestaña pinta el lugar del equipo y la sección lo monta después de pintar',
    /data-pbp-equipo="JUJUY BASQUET"/.test(vm.runInContext('equiposTab(null, { nombre: "JUJUY BASQUET" }, "pbp")', conCapa))
    && /SGADD_PBP\.montarPendientes\(root\)/.test(fs.readFileSync('./js/sgadd-equipos.js', 'utf8')));

  const cargarScout = (ctx) => { vm.runInContext(fs.readFileSync('./js/sgadd-scouting.js', 'utf8'), ctx); return ctx; };
  cargarScout(conCapa); cargarScout(sinCapa);
  const cards = (ctx) => JSON.stringify(vm.runInContext('scoutCardsVisibles().map(c => c.id)', ctx));
  check('Scouting: con la capa, la card del rival se ofrece en el modal', /"pbp"/.test(cards(conCapa)));
  check('Scouting: sin la capa, ni en el modal ni en el informe', !/"pbp"/.test(cards(sinCapa))
    && vm.runInContext('scoutBloquePbp({ claveRival: "A", local: { clave: "A", nombre: "AMANCAY (LR)" }, visitante: { clave: "J", nombre: "JUJUY BASQUET" } })', sinCapa) === '');
  const cardRival = vm.runInContext('scoutBloquePbp({ claveRival: "A", local: { clave: "A", nombre: "AMANCAY (LR)" }, visitante: { clave: "J", nombre: "JUJUY BASQUET" } })', conCapa);
  check('la card pide el análisis del RIVAL, no el del equipo propio', /data-pbp-equipo="AMANCAY \(LR\)"/.test(cardRival) && !/data-pbp-equipo="JUJUY/.test(cardRival));

  const D = require('./js/sgadd-data.js');
  D.configurar('https://api.test');
  const vistas = [];
  const fetchFalso = async (url, o) => { vistas.push({ url, auth: o.headers.Authorization }); return { ok: true, status: 200, json: async () => ({ ok: true, paquete: { equipo: 'X' } }) }; };
  global.SGADD_AUTH = A;
  A.establecerToken && A.establecerToken(tokJujuy);
  try {
    await D.leerPbp('jujuy', 'jujuy-primera', 'AMANCAY (LR)', { fetch: fetchFalso });
    check('leerPbp: el equipo va codificado y el token en el header, nunca en la URL',
      vistas[0] && vistas[0].url === 'https://api.test/api/v1/pbp/jujuy/jujuy-primera?equipo=AMANCAY%20(LR)' && /^Bearer /.test(vistas[0].auth) && !/token/.test(vistas[0].url));
  } catch (e) {
    check('leerPbp arma el pedido', false, e.message);
  }
  const fetch403 = async () => ({ ok: false, status: 403, json: async () => ({ ok: false, codigo: 'SIN_CAPA', mensaje: 'no habilitado' }) });
  let err = null;
  try { await D.leerPbp('jujuy', 'jujuy-primera', 'X', { fetch: fetch403 }); } catch (e) { err = e; }
  check('leerPbp LANZA con el motivo del servidor tal cual', err && err.codigo === 'SIN_CAPA' && err.message === 'no habilitado');

  check('index.html carga sgadd-pbp.js con la versión de assets del resto',
    /<script src="js\/sgadd-pbp\.js\?v=(\d+)"><\/script>/.test(fs.readFileSync('./index.html', 'utf8'))
    && fs.readFileSync('./index.html', 'utf8').match(/sgadd-pbp\.js\?v=(\d+)/)[1] === fs.readFileSync('./index.html', 'utf8').match(/sgadd-core\.js\?v=(\d+)/)[1]);

  /* =================================================================== */
  titulo('5 · EL PAQUETE @3 · quintetos, mapa de tiro propio, geometría y diagnósticos');
  const zona = (z, i, c, ppt) => ({ zona: z, i, c, pct: Math.round(1000 * c / i) / 10, ppt });
  const fam = (i, c, ppt) => ({ i, c, pct: Math.round(1000 * c / i) / 10, ppt });
  /* Números elegidos para que cada regla tenga UN caso claro:
     favor  Z12 rinde muy sobre la liga (explotar), Z1 y Z14 suben el PPT
            del equipo (mejora), Z3 cuesta con volumen (corregir), Z6 es un
            1/8 (evitar) y Z5 es un 0/3 (NO se marca: poca muestra).
     contra Z1, Z11 y Z3 conceden por encima de la liga; Z14 también, pero
            menos puntos: queda cuarta y afuera.
     jugador 2 · Z11 pico, Z3 a explotar, Z1 ajuste, Z12 fuga. */
  function paquete3(equipo, opciones) {
    const o = opciones || {};
    const p = paquete(equipo);
    p.esquema = 'motorstats-ingestion/analitica-pbp-web@3';
    const q = (ids, netPos, ortg, drtg) => ({ ids, min: 30, pj: 6, mm: -10, netPos, ortg, drtg });
    p.quintetos[0].ortg = 110; p.quintetos[0].drtg = 100;
    p.tacticas = {
      quintetosCriticos: [q(['1', '2', '3', '4', '6'], -20, 100, 120), q(['2', '3', '4', '5', '6'], -15, 80, 95)],
      quintetosMejores: [q(['1', '2', '3', '4', '5'], 12, 112, 100)],
      triosMejores: [q(['1', '2', '3'], 9, 110, 101)], duosMejores: [q(['1', '5'], 14, 115, 101), q(['2', '6'], -3, 99, 102)], triosCriticos: [],
    };
    p.rotaciones = { partidos: 31, jugadores: [{ id: '1', minutos: 30.4, minuto: new Array(40).fill(90) }, { id: '6', minutos: 1, minuto: new Array(40).fill(2) }] };
    p.ultimos5 = [{ fecha: '2026-03-05', rival: 'SP. <i>SUARDI</i>', resultado: 'P', marcador: '84-87',
      inicial: { ids: ['1', '2', '3', '4', '5'], mm: 9, min: 11.5 }, cierre: { ids: ['1', '2', '3', '4', '6'], mm: -7, min: 2.6 } }];
    p.cuartos = [{ periodo: '1', partidos: 31, favor: 20.5, contra: 21.3, dif: -0.8, ganados: 11, perdidos: 19, empatados: 1, difUltimos5: 2.2 },
      { periodo: 'OT', partidos: 3, favor: 8, contra: 6, dif: 2, ganados: 2, perdidos: 1, empatados: 0, difUltimos5: null }];
    p.momentum = { partidos: 31, corridaMaxFavor: 10.1, corridaMaxContra: 10, corridas8Favor: 45, corridas8Contra: 38, ventana3Mejor: 10.3, ventana3Peor: -9.7,
      topFavor: [{ pts: 18, fecha: '2026-01-18', rival: 'COMUNICACIONES', periodo: 3, periodoFin: 4, desde: '02:08', hasta: '05:39' }], topContra: [] };
    p.tiros.detalle = {
      favor: { zonas: o.favor || [zona('Z1', 400, 240, 1.2), zona('Z12', 200, 80, 1.2), zona('Z3', 100, 30, 0.6), zona('Z11', 150, 50, 1.0),
        zona('Z5', 3, 0, 0), zona('Z6', 8, 1, 0.25), zona('Z14', 40, 16, 1.2)], familias: {},
        hex: [[0, 1, 50, 30, 60], [1, 1, 10, 2, 4], [9, 9, 1, 0, 0]] },
      contra: { zonas: o.contra || [zona('Z1', 300, 200, 1.333), zona('Z11', 100, 40, 1.2), zona('Z3', 50, 25, 1.0), zona('Z12', 30, 9, 0.9), zona('Z14', 25, 11, 1.32)],
        familias: {}, hex: [[0, 1, 40, 20, 40]] },
      jugadores: [{ id: '2', pj: 20, i: 120, c: 56, ppt: 1.05, dist: 4, familias: {}, hex: [[0, 1, 80, 44, 88]],
        zonas: [zona('Z1', 50, 30, 1.2), zona('Z11', 40, 18, 1.35), zona('Z12', 25, 5, 0.6), zona('Z3', 5, 3, 1.2)] }],
      puntos: { zonas: ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7', 'Z8', 'Z9', 'Z10', 'Z11', 'Z12', 'Z13', 'Z14'], ids: ['2'], sinUbicar: 0,
        favor: [[75, 95, 1, 11, 0], [70, 96, 0, 11, 0], [75, 20, 1, 0, -1]], contra: [[75, 95, 0, 11]] },
    };
    p.liga = { total: fam(30000, 13700, 1.05),
      zonas: [zona('Z1', 10000, 6000, 1.2), zona('Z12', 4000, 1300, 0.975), zona('Z3', 1000, 400, 0.8), zona('Z11', 1000, 330, 1.0),
        zona('Z5', 500, 200, 0.8), zona('Z6', 500, 200, 0.8), zona('Z14', 500, 175, 1.05)],
      familias: { aro: fam(13000, 7900, 1.215), tripleFrontal: fam(4000, 1300, 1.0) },
      hex: [[0, 1, 900, 540, 1.2, 'aro'], [1, 1, 12, 5, 0.8, 'tripleFrontal']] };
    return p;
  }
  const p3 = paquete3('JUJUY BASQUET');
  const h3 = P.html(p3);
  const secciones = (h3.match(/data-pbp-seccion="([^"]+)"/g) || []).map(x => x.slice(18, -1));
  check('la card de quintetos: clave, quintetos, rotaciones, cuartos, clutch y el MOTOR TÁCTICO AL FINAL',
    JSON.stringify(secciones) === '["clave","quintetos","rotaciones","cuartos","clutch","tactico"]', secciones);
  check('el mapa de tiro YA NO está en la card de quintetos', !/pbp-mapa/.test(h3));
  check('las secciones son sub-cards <details> y TODAS arrancan cerradas (el DT abre la que quiere)',
    (h3.match(/<details class="pbp-detalle mt-3"/g) || []).length === 6 && !/<details[^>]*\sopen[\s>]/.test(h3) && /<summary class="pbp-resumen/.test(h3));
  check('la columna TC del clutch dice «Tiros de Campo», no «Tapones cometidos» del glosario',
    /data-glosa="Tiros de Campo \(Convertidos \/ Intentados\)">TC</.test(h3));
  const hScout = P.html(p3, { contexto: 'scouting' });
  const secScout = (hScout.match(/data-pbp-seccion="([^"]+)"/g) || []).map(x => x.slice(18, -1));
  check('en Scouting la card de quintetos muestra últimos 5 y quién decide los finales, SIN el sub-card «Clutch» (pedido del club 2026-10-02)',
    JSON.stringify(secScout) === '["ultimos5","decide"]' && />Quién decide los finales</.test(hScout) && !/data-pbp-seccion="clutch"/.test(hScout), secScout);
  check('y también arrancan cerradas', !/<details[^>]*\sopen[\s>]/.test(hScout) && /data-pbp-seccion="decide"/.test(hScout));
  check('G-P y MIN no se parten: toda celda numérica lleva whitespace-nowrap', /whitespace-nowrap">8-7</.test(h3) && !/<td class="px-2 py-1 font-mono text-xs">/.test(h3));
  check('sin undefined ni NaN, y escapa lo del paquete nuevo', !/undefined|NaN/.test(h3) && !/<i>SUARDI/.test(h3) && /&lt;i&gt;SUARDI/.test(h3));
  const lt = P.lecturaTactica(p3);
  check('táctico: el problema se decide contra SUS quintetos, y sugiere dúos y tríos que suman',
    lt.criticos[0].problema === 'defensa' && lt.criticos[1].problema === 'ataque' && JSON.stringify(lt.probar.map(x => x.ids.join(''))) === '["15","123"]');

  /* ---- geometría */
  const Z = P.zonaGeometrica;
  check('zonas geométricas: línea FIBA al frente (6,75) y en la esquina (6,60), el aro es Z1',
    Z(1.575 + 6.8, 7.5) === 'Z12' && Z(1.575 + 6.7, 7.5) === 'Z7' && Z(1, 0.8) === 'Z14' && Z(1, 14.2) === 'Z10' && Z(1, 1) === 'Z9' && Z(1.575, 7.5) === 'Z1');
  check('los rayos: corta frontal hasta ±31°, frontal hasta ±18°, fondo de media desde 53°, esquina de triple desde 71°',
    Z(1.575 + 3.5 * Math.cos(Math.PI / 6), 7.5 + 3.5 * Math.sin(Math.PI / 6)) === 'Z3' && Z(1.575 + 3.5 * Math.cos(0.56), 7.5 + 3.5 * Math.sin(0.56)) === 'Z2'
      && Z(1.575 + 6 * Math.cos(0.3), 7.5 - 6 * Math.sin(0.3)) === 'Z7' && Z(1.575 + 6 * Math.cos(0.33), 7.5 - 6 * Math.sin(0.33)) === 'Z8'
      && Z(1.575 + 8 * Math.cos(1.25), 7.5 + 8 * Math.sin(1.25)) === 'Z10');
  const geo = P.geometriaZonas();
  check('las 14 zonas tienen polígono y su etiqueta cae ADENTRO de su propia zona',
    P.ZONAS.every(z => geo[z].poligono.length > 5 && geo[z].etiqueta && Z(geo[z].etiqueta[0], geo[z].etiqueta[1]) === z));
  const xDe = (z) => (15 - geo[z].etiqueta[1]) * 10;
  check('la izquierda del ATACANTE queda a la izquierda del dibujo (Z10 < Z1 = 75 < Z14)', xDe('Z10') < 30 && xDe('Z14') > 120 && Math.abs(xDe('Z1') - 75) < 1);
  check('la geometría del paquete manda sobre el respaldo', P.geometriaZonas({ r1: 3 }).Z1.poligono.some(p => Math.abs(p[0] - (1.575 + 3)) < 1e-9));

  /* ---- la card del mapa */
  const mapa3 = P.mapaCard(p3);
  check('card propia: perspectiva «Lo que tira / Lo que le tiran», abre en zonas y con diagnóstico',
    /aria-pressed="true">Lo que tira/.test(mapa3) && /data-pbp-accion="sujeto:contra"/.test(mapa3) && /data-pbp-vista="zonas"/.test(mapa3) && /data-pbp-diag="1"/.test(mapa3));
  check('14 zonas dibujadas, recortadas por un clipPath de la media cancha', (mapa3.match(/<polygon class="pbp-zona"/g) || []).length === 14
    && /<clipPath id="pbp-cancha-\d+"><rect x="0" y="0" width="150" height="140"\/>/.test(mapa3) && /<g clip-path="url\(#pbp-cancha-\d+\)">/.test(mapa3));
  check('el C/I va IMPRESO dentro de cada zona con tiros', (mapa3.match(/class="pbp-etiqueta-ci">/g) || []).length === 7 && /pbp-etiqueta-ci">80\/200</.test(mapa3));
  const dosMapas = (P.mapaCard(p3) + P.mapaCard(p3)).match(/id="pbp-cancha-(\d+)"/g);
  check('dos mapas en la misma página no comparten id de recorte', dosMapas.length === 2 && new Set(dosMapas).size === 2);
  const mh = P.mapa(p3, { vista: 'hex' });
  check('hexágonos: solo los de centro dentro de la cancha, y adentro del recorte', (mh.match(/class="pbp-hex"/g) || []).length === 2 && mh.indexOf('pbp-hex') > mh.indexOf('clip-path='));
  check('el color compara PUNTOS POR TIRO, no %: 60 pts en 50 tiros (1,20) contra 1,20 sale gris',
    /class="pbp-hex"[^>]*style="fill:#6b7280"[^>]*data-pbp-tip="30\/50/.test(mh));
  check('vs liga por zona en la tabla: Z12 1,20 contra 0,975 → +0,22', /data-pbp-zona="Z12"[\s\S]*?\+0,22/.test(mapa3));
  check('colorDelta: igual a la liga es gris, +0,3 verde pleno, −0,3 rojo pleno, sin dato gris',
    P.colorDelta(0) === '#6b7280' && P.colorDelta(0.3) === '#16a34a' && P.colorDelta(-0.5) === '#dc2626' && P.colorDelta(null) === '#6b7280');
  const vHex = P.varaHex(p3, 0, 1), vFam = P.varaHex(p3, 1, 1), vTot = P.varaHex(p3, 7, 7);
  check('la vara del hexágono: la liga ahí con 15+, su familia con menos, la total sin hexágono',
    vHex.ppt === 1.2 && /900 tiros/.test(vHex.fuente) && vFam.ppt === 1.0 && /triple frontal/.test(vFam.fuente) && vTot.ppt === 1.05);

  /* ---- diagnóstico del equipo */
  const dz = P.diagnosticoZonas(p3, 'equipo');
  check('ZONA A EXPLOTAR: la de mayor ventaja ajustada contra la liga (Z12)', dz.explotar && dz.explotar.zona === 'Z12');
  check('2 ZONAS DE MEJORA: las que más suben el PPT del equipo si reciben tiros (Z1 y Z14)', JSON.stringify(dz.mejora.map(f => f.zona)) === '["Z1","Z14"]');
  check('INEFICIENTES por puntos perdidos: Z3 con volumen se CORRIGE y el 1/8 de Z6 se EVITA',
    JSON.stringify(dz.evitar.map(f => f.zona + ':' + f.accion)) === '["Z3:corregir","Z6:evitar"]');
  check('volumen contra efectividad: un 0/3 (Z5) NO se marca y un 1/8 (Z6) sí', !dz.evitar.some(f => f.zona === 'Z5') && dz.evitar.some(f => f.zona === 'Z6'));
  const dc = P.diagnosticoZonas(p3, 'contra');
  check('RADAR DEFENSIVO: las 3 zonas críticas por puntos concedidos de más (Z1, Z11, Z3), la cuarta afuera',
    JSON.stringify(dc.criticas.map(f => f.zona)) === '["Z1","Z11","Z3"]');
  check('el diagnóstico se dibuja SOBRE la cancha: contorno e insignia por zona, y en la tabla',
    /pbp-contorno pbp-diag-explotar/.test(mapa3) && /pbp-contorno pbp-diag-mejora/.test(mapa3) && /pbp-contorno pbp-diag-evitar/.test(mapa3)
      && /pbp-insignia pbp-diag-explotar/.test(mapa3) && /pbp-chip pbp-diag-explotar/.test(mapa3) && /Zona a explotar/.test(mapa3));
  const mc = P.mapa(p3, { sujeto: 'contra' });
  check('en «Lo que le tiran» se marcan las críticas 1-2-3', (mc.match(/pbp-contorno pbp-diag-critica/g) || []).length === 3 && /Radar defensivo/.test(mc));
  const sinDiag = P.mapa(p3, { diag: false });
  check('el diagnóstico se puede ocultar', !/pbp-contorno/.test(sinDiag) && !/pbp-diagnostico/.test(sinDiag) && /data-pbp-accion="diag:1"/.test(sinDiag));

  /* ---- el soporte de decisión del rival (v313) */
  const dr = P.diagnosticoRival(p3);
  check('rival: sin paquete no hay diagnóstico ni piezas (modo degradado)', P.diagnosticoRival(null) === null && P.rivalFriasHtml(null) === '');
  check('rival: las zonas frías piden 20 tiros y estar bajo la liga', dr.frias.every(f => f.i >= 20 && f.delta <= -0.03));
  check('rival: la pieza de concesiones por zona se fue con el mal menor (v314)', dr.concesiones === undefined && P.rivalConcesionesHtml === undefined);
  check('rival: el lugar del montaje trae su tipo y degrada vacío', /data-pbp-tipo="rival-frias"/.test(P.espacioRival('X', 'frias')) && /data-pbp-tipo="rival-foda"/.test(P.espacioRival('X', 'foda')));
  check('rival: el montaje sabe pintar zonas frías, FODA y cuartos, y refinar la filosofía', /tipo === 'rival-frias'/.test(fs.readFileSync('js/sgadd-pbp.js', 'utf8'))
    && /tipo === 'rival-foda'/.test(fs.readFileSync('js/sgadd-pbp.js', 'utf8')) && /tipo === 'rival-cuartos'/.test(fs.readFileSync('js/sgadd-pbp.js', 'utf8'))
    && /refinarFilosofia\(fil, paq\)/.test(fs.readFileSync('js/sgadd-pbp.js', 'utf8')));

  /* ---- v314 · FODA y rendimiento por cuarto */
  const vacioFoda = P.fodaPbp(null);
  check('FODA: sin paquete, las cuatro casillas vacías (modo degradado)', ['F', 'O', 'D', 'A'].every(k => Array.isArray(vacioFoda[k]) && !vacioFoda[k].length));
  const f3 = P.fodaPbp(p3);
  check('FODA: con un paquete real devuelve las cuatro casillas, con texto y sin undefined/NaN', ['F', 'O', 'D', 'A'].every(k => Array.isArray(f3[k]) && f3[k].every(t => typeof t === 'string' && !/undefined|NaN/.test(t))));
  const cq = (periodo, dif, partidos) => ({ periodo, favor: 20, contra: 20 - dif, dif, partidos: partidos === undefined ? 12 : partidos });
  const pat = (c) => P.cuartosPatrones(c).map(x => x.id).join();
  check('cuartos: arranca arrollador y colapsa (+1,5 o más en el 1.º y −1,5 o menos en el 4.º)', pat([cq('1', 2), cq('2', 0), cq('3', 0), cq('4', -2)]) === 'colapsa');
  check('cuartos: arranca lento y cierra fuerte', pat([cq('1', -2), cq('2', 0), cq('3', 0), cq('4', 2)]) === 'remonta');
  check('cuartos: se apaga en el último sin haber arrancado fuerte', pat([cq('1', 0), cq('2', 0), cq('3', 0), cq('4', -2)]) === 'se-apaga');
  check('cuartos: un cuarto débil que no es el último se nombra', pat([cq('1', 1), cq('2', 1), cq('3', -2.5), cq('4', 0)]) === 'cuarto-debil');
  check('cuartos: dentro de ±1,5 no se afirma ningún patrón', pat([cq('1', 1), cq('2', -1), cq('3', 0.5), cq('4', 1)]) === '');
  check('cuartos: con menos de 5 partidos no se afirma nada', pat([cq('1', 3, 4), cq('2', 0, 4), cq('3', 0, 4), cq('4', -3, 4)]) === '');
  const matriz = P.cuartosCruzadoHtml({ cuartos: [cq('1', 2), cq('2', 0), cq('3', 0), cq('4', -2)] }, { cuartos: [cq('1', 0), cq('2', 1), cq('3', 0), cq('4', 1)] }, 'RIVAL', 'NUESTRO');
  check('cuartos: la matriz muestra a los dos, con Hace / Cede / Dif. por cuarto y los patrones', /RIVAL/.test(matriz) && /NUESTRO/.test(matriz) && /Hace/.test(matriz) && /Cede/.test(matriz) && /1\.º/.test(matriz) && /Arranca arrollador/.test(matriz));
  /* v315 · el juego de cada cuarto (tiro, pérdidas, ritmo y faltas) */
  const jg = (efgF, efgC, ppF, ppC, fcF, fcC) => ({ n: 12, efgF, efgC, tciF: 16, tciC: 16, ortg: 105, drtg: 100, ppF, ppC, ritmo: 72, fcF, fcC });
  const cj = (periodo, juego) => Object.assign(cq(periodo, 0), { juego });
  const base = (q4) => [cj('1', jg(0.52, 0.50, 3, 3, 4, 4)), cj('2', jg(0.52, 0.50, 3, 3, 4, 4)), cj('3', jg(0.52, 0.50, 3, 3, 4, 4)), cj('4', q4)];
  const idsJ = (c) => P.cuartosPatrones(c).map(x => x.id).join();
  check('juego: su tiro se cae al final, neto del rival (−0,05 de eFG% contra los tres primeros)', idsJ(base(jg(0.47, 0.50, 3, 3, 4, 4))) === 'tiro-cae');
  check('juego: tira mejor al final (+0,05 neto)', idsJ(base(jg(0.57, 0.50, 3, 3, 4, 4))) === 'tiro-sube');
  check('juego: si el rival también tira peor al final no hay patrón (la fatiga común se resta)', idsJ(base(jg(0.47, 0.45, 3, 3, 4, 4))) === '');
  check('juego: regala pelotas al final (+0,6 neto) y cuida la pelota (−0,6 neto)', idsJ(base(jg(0.52, 0.50, 3.6, 3, 4, 4))) === 'pierde-tarde' && idsJ(base(jg(0.52, 0.50, 2.4, 3, 4, 4))) === 'cuida-tarde');
  check('juego: carga faltas al final (+0,7 neto) y avisa que el bonus lo mira el cuerpo técnico', idsJ(base(jg(0.52, 0.50, 3, 3, 4.7, 4))) === 'faltas-tarde'
    && /bonus lo mira el cuerpo técnico/.test(P.cuartosPatrones(base(jg(0.52, 0.50, 3, 3, 4.7, 4)))[0].texto));
  check('juego: bajo el corte no se afirma nada (0,03 de eFG%, 0,4 pérdidas, 0,5 faltas)', idsJ(base(jg(0.49, 0.50, 3.4, 3, 4.5, 4))) === '');
  check('juego: puede haber varios patrones a la vez y cada uno trae su tono', idsJ(base(jg(0.47, 0.50, 3.6, 3, 4.7, 4))) === 'tiro-cae,pierde-tarde,faltas-tarde'
    && P.cuartosPatrones(base(jg(0.57, 0.50, 2.4, 3, 4, 4))).every(x => x.tono === 'alto'));
  check('juego: sin el juego en algún cuarto, o con menos de 5 partidos, no se afirma nada', idsJ(base(jg(0.40, 0.50, 5, 3, 7, 4)).map((c, i) => (i === 1 ? Object.assign({}, c, { juego: undefined }) : c))) === ''
    && idsJ(base(jg(0.40, 0.50, 5, 3, 7, 4)).map(c => Object.assign({}, c, { partidos: 4 }))) === '');
  const tabJ = P.juegoPorCuartoHtml('RIVAL', base(jg(0.47, 0.50, 3, 3, 4, 4)));
  check('juego: la tabla por cuarto trae eFG%, rating, pérdidas, ritmo y faltas, los cuatro cuartos y nada en NaN', /eFG %/.test(tabJ) && /Pos\.\/40/.test(tabJ) && /Faltas/.test(tabJ) && (tabJ.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr /g) || []).length === 4 && !/NaN|undefined/.test(tabJ) && /47,0/.test(tabJ));
  check('juego: sin el detalle en el paquete la tabla no se dibuja y la card dice que llega con la próxima subida', P.juegoPorCuartoHtml('R', [cq('1', 2)]) === ''
    && /próxima subida/.test(P.cuartosCruzadoHtml({ cuartos: [cq('1', 2)] }, null, 'R', 'N')));
  const conTabla = P.cuartosCruzadoHtml({ cuartos: base(jg(0.47, 0.50, 3, 3, 4, 4)) }, { cuartos: base(jg(0.52, 0.50, 3, 3, 4, 4)) }, 'RIVAL', 'NUESTRO');
  check('juego: la card muestra la tabla de los dos equipos y la nota de cómo se mide', (conTabla.match(/· el juego de cada cuarto/g) || []).length === 2 && /neto del rival/.test(conTabla) && /cada 40 minutos/.test(conTabla));
  check('cuartos: sin nuestro paquete sale solo el rival, y sin datos lo dice', !/NUESTRO/.test(P.cuartosCruzadoHtml({ cuartos: [cq('1', 2)] }, null, 'RIVAL', 'NUESTRO')) && /Sin datos por cuarto/.test(P.cuartosCruzadoHtml({}, null, 'R', 'N')));
  check('cuartos: el lugar del montaje pide el paquete del rival y el nuestro', /data-pbp-tipo="rival-cuartos"/.test(P.espacioCuartos('R', 'N')) && /data-pbp-propio="N"/.test(P.espacioCuartos('R', 'N')) && !/data-pbp-propio/.test(P.espacioCuartos('R', null)));
  check('mapa: el gráfico y la tabla van en una grilla que el papel mantiene en dos columnas (la tabla a la derecha)', /pbp-mapa-grid grid grid-cols-1 lg:grid-cols-2/.test(fs.readFileSync('js/sgadd-pbp.js', 'utf8'))
    && /\.pbp-mapa-grid \{ display: grid !important; grid-template-columns: minmax\(0, 44%\) minmax\(0, 56%\)/.test(fs.readFileSync('index.html', 'utf8')));

  /* ---- jugador */
  const dj = P.diagnosticoJugador(p3, '2');
  check('jugador: picos, puntos a explotar, criterio de ajuste y puntos de fuga por zona',
    dj.picos.map(f => f.zona).join() === 'Z11' && dj.explotar.map(f => f.zona).join() === 'Z3' && dj.ajuste.map(f => f.zona).join() === 'Z1' && dj.fuga.map(f => f.zona).join() === 'Z12', dj);
  check('con volumen por partido (intentos / PJ) y acierto contra la liga', dj.pj === 20 && dj.picos[0].vol === 2 && Math.abs(dj.picos[0].dCrudo - (0.45 - 0.33)) < 1e-9);
  const hj = P.jugador(p3, 'ibarra,  santiágo');
  check('ficha: se encuentra por nombre normalizado, dibuja SUS tiros sin perspectiva y trae el diagnóstico',
    /data-pbp-sujeto="2"/.test(hj) && !/Lo que le tiran/.test(hj) && /Picos de rendimiento/.test(hj) && /Puntos de fuga/.test(hj) && /data-diag="neg"/.test(hj) && /data-diag="pos"/.test(hj) && /<details class="rend-detalle/.test(hj) && /intentos x PJ/.test(hj) && /20 PJ con minutos/.test(hj));
  /* MENOS DE 15 TIROS (2026-10-08): el mapa se dibuja SIEMPRE; lo que se
     calla es el diagnóstico. */
  check('sin tiros ubicados lo dice, y un paquete sin detalle también',
    /Sin tiros de campo ubicados/.test(P.jugador(p3, 'CONTI, BRUNO')) && /todavía no está cargado/.test(P.jugador(paquete('X'), 'A')));
  const p3chico = paquete3('JUJUY BASQUET');
  p3chico.tiros.detalle.jugadores.push({ id: '6', pj: 3, i: 7, c: 3, ppt: 0.9, dist: 5, familias: {}, hex: [[0, 1, 7, 3, 6]],
    zonas: [zona('Z1', 4, 2, 1.0), zona('Z11', 3, 1, 1.0)] });
  const hChico = P.jugador(p3chico, 'CONTI, BRUNO');
  check('con 7 tiros: dibuja el mapa, avisa la muestra chica y no diagnostica',
    /class="pbp-mapa/.test(hChico) && /Muestra chica/.test(hChico) && !/pbp-diagnostico/.test(hChico) && !/pbp-contorno/.test(hChico)
      && P.diagnosticoJugador(p3chico, '6') === null);
  const p3viejo = paquete3('JUJUY BASQUET');
  p3viejo.tiros.detalle.puntos.ids.push('6');
  p3viejo.tiros.detalle.puntos.favor.push([60, 50, 1, 6, 1], [65, 40, 0, 6, 1]);
  const hViejo = P.jugador(p3viejo, 'CONTI, BRUNO');
  check('un paquete viejo (sin el jugador en el detalle) dibuja igual sus tiros sueltos',
    /pbp-mapa/.test(hViejo) && (hViejo.match(/pbp-tiro-c/g) || []).length === 1 && (hViejo.match(/pbp-tiro-e/g) || []).length === 1 && /1\/2 tiros/.test(hViejo));

  /* ---- partido a partido: momentum y mapa del post-partido (2026-10-08) */
  const pPart = paquete3('BOCA');
  pPart.partidosPbp = [{ id: '2026-10-07T2105_114735-113652', fecha: '2026-10-07', rival: 'OBERÁ', condicion: 'LOCAL', final: [10, 8],
    linea: [[0, 0, 0], [60, 2, 0], [700, 2, 3], [1300, 5, 3], [1900, 5, 5], [2300, 10, 5], [2390, 10, 8]], periodos: [[1, 0], [2, 600]],
    tiros: { favor: [[75, 95, 1, 11], [70, 20, 0, 0]], contra: [[75, 30, 1, 0]] } }];
  check('partidoDe: por id de la fuente y, si no, por fecha + rival sin acentos',
    P.partidoDe(pPart, '2026-10-07T2105_114735-113652') === pPart.partidosPbp[0]
      && P.partidoDe(pPart, '', '2026-10-07', 'Obera') === pPart.partidosPbp[0] && P.partidoDe(pPart, 'x', '2026-10-08', 'OBERA') === null);
  const mo = P.momentumPartido(pPart, pPart.partidosPbp[0]);
  check('momentum: SVG con los cuatro cuartos, cambios de líder, empates y máximas',
    /momentum-svg/.test(mo) && (mo.match(/class="mo-cuarto"/g) || []).length === 3 && /4\.º/.test(mo)
      && /cambios de líder <b class="font-mono">2<\/b>/.test(mo) && /empates <b class="font-mono">1<\/b>/.test(mo)
      && /máxima ventaja <b class="font-mono mm-pos">\+5<\/b>/.test(mo) && /máxima desventaja <b class="font-mono mm-neg">−1<\/b>/.test(mo), mo.slice(-400));
  check('momentum y mapa sin el partido lo dicen en una línea',
    /no hay evolución del marcador/.test(P.momentumPartido(pPart, null)) && /no hay mapa de tiro/.test(P.mapaPartido(pPart, null)));
  const mp = P.mapaPartido(pPart, pPart.partidosPbp[0]);
  check('mapa del partido: las dos canchas, cada una con sus tiros',
    (mp.match(/<svg class="pbp-mapa/g) || []).length === 2 && (mp.match(/pbp-tiro-c/g) || []).length === 2
      && (mp.match(/pbp-tiro-e/g) || []).length === 1 && /OBERÁ/.test(mp) && /1\/2 tiros/.test(mp));
  const esp = P.espacioPartido('BOCA', { id: 'ID"X', fecha: '2026-10-07', rival: 'OBERÁ' }, 'partido-mapa');
  check('el lugar del partido lleva id, fecha y rival escapados', /data-pbp-tipo="partido-mapa"/.test(esp) && /data-pbp-partido="ID&quot;X"/.test(esp));
  /* ---- quintetos del post-partido (punto 97) */
  pPart.partidosPbp[0].nombres = { 1: ['PEREZ, JUAN', '7'], 2: ['GOMEZ, LUIS', '10'], 3: ['A, B', '4'], 4: ['C, D', '5'], 5: ['E, F', '6'],
    6: ['G, H', '8'], 11: ['RIVAL, UNO', '0'], 12: ['R, 2', '1'], 13: ['R, 3', '2'], 14: ['R, 4', '3'], 15: ['R, 5', '9'] };
  const q5 = (ids, mm, min) => ({ ids: ids.map(String), mm: mm, min: min });
  pPart.partidosPbp[0].quintetos = {
    favor: { inicial: q5([1, 2, 3, 4, 5], 4, 12.5), cierre: q5([1, 2, 3, 4, 6], -2, 3.1),
      clutch: { min: 4.2, favor: 9, contra: 7, quinteto: q5([1, 2, 3, 4, 6], 2, 3.1), jugadores: [{ id: '1', pts: 5, tc: '2/3', tl: '1/2', pp: 1, usos: 4.9 }] } },
    contra: { inicial: q5([11, 12, 13, 14, 15], -4, 12.5), cierre: q5([15, 14, 13, 12, 11], -4, 12.5), clutch: null } };
  const qp = P.quintetosPartido(pPart, pPart.partidosPbp[0]);
  check('quintetos: los dos equipos, cada uno con inicial, cierre y clutch, nombres con dorsal',
    (qp.match(/Quinteto inicial/g) || []).length === 2 && (qp.match(/Quinteto de cierre/g) || []).length === 2
      && /#7 Perez/.test(qp) && /#0 Rival/.test(qp), qp.slice(0, 300));
  check('quintetos: +/- y minutos juntos; si el cierre es el mismo que arrancó, lo dice',
    qp.indexOf("+4</span> · 12,5' juntos") !== -1 && /el mismo que arrancó/.test(qp));
  check('quintetos: el clutch con su parcial y quién decidió; sin clutch, lo dice',
    qp.indexOf('Parcial <b class="font-mono mm-pos">9-7</b>') !== -1 && qp.indexOf('5 pts · TC 2/3 · TL 1/2 · 1 PP') !== -1
      && /No hubo: el partido no llegó/.test(qp));
  check('quintetos: un paquete sin quintetos lo dice en una línea',
    /no hay quintetos/.test(P.quintetosPartido(pPart, { id: 'x' })) && /partido-quintetos/.test(P.espacioPartido('BOCA', {}, 'partido-quintetos')));
  /* ---- validación en dos niveles (punto 125): el partido PARCIAL */
  check('un partido parcial (quintetos: null) explica que el play-by-play pierde un cambio',
    /pierde un cambio/.test(P.quintetosPartido(pPart, { id: 'x', quintetos: null })) &&
    !/pierde un cambio/.test(P.quintetosPartido(pPart, { id: 'x' })));
  {
    const conParc = Object.assign({}, pPart, { partidos: { jugados: 1, validados: 0, conTiros: 1,
      parciales: [{ fecha: '2026-10-15', rival: 'QUILMES (MDP)', motivo: 'hay tramos sin cinco jugadores en cancha (cambio mal cargado)' }], excluidos: [] } });
    const h = P.html(conParc);
    check('la nota del laboratorio nombra el partido parcial y para qué sirve',
      /Solo para tiros, reloj, momentum y cuartos/.test(h) && /2026-10-15 vs QUILMES \(MDP\)/.test(h));
    const sinParc = P.html(Object.assign({}, pPart, { partidos: { jugados: 1, validados: 1, excluidos: [] } }));
    check('sin parciales la nota queda como antes', !/Solo para tiros/.test(sinParc));
  }

  /* ---- tiros individuales */
  const t12 = P.capaTiros(p3, 'equipo', 'Z12');
  check('capa de tiros: círculos convertidos y cruces erradas de la zona', t12.convertidos === 1 && t12.errados === 1 && /pbp-tiro-c/.test(t12.svg) && /pbp-tiro-e/.test(t12.svg)
    && /cx="75" cy="95"/.test(t12.svg));
  check('capa de tiros: el jugador ve SOLO los suyos y la defensa los del rival',
    P.capaTiros(p3, '2', 'Z12').convertidos + P.capaTiros(p3, '2', 'Z12').errados === 2 && P.capaTiros(p3, '2', 'Z1').convertidos === 0
      && P.capaTiros(p3, 'contra', 'Z12').errados === 1 && P.capaTiros(p3, 'contra', 'Z12').convertidos === 0);
  const pViejo = paquete3('X'); delete pViejo.tiros.detalle.puntos;
  check('un paquete sin tiros ubicados (@2) no inventa la capa', P.capaTiros(pViejo, 'equipo', 'Z12').disponible === false && !/convertido ·/.test(P.mapa(pViejo)));

  /* ---- scouting */
  const rival = paquete3('AMANCAY (LR)', { contra: [zona('Z12', 60, 30, 1.5), zona('Z1', 300, 180, 1.2)] });
  const cz = P.cruceZonas(rival, p3);
  check('cruce por zona: ATACAR donde lo nuestro rinde y el rival concede (Z12)', cz.atacar.map(x => x.zona).join() === 'Z12');
  check('cruce: CERRAR donde el rival rinde Y nosotros concedemos: Z14 sí, Z12 no (ahí no concedemos) y Z1 no (ahí rinden de liga)', cz.cerrar.map(x => x.zona).join() === 'Z14', cz.cerrar);
  const hs = P.mapaCard(rival, { propio: p3 });
  check('en scouting la card del mapa suma el cruce nombrando a los dos equipos', /Atacar ahí · JUJUY BASQUET rinde y AMANCAY \(LR\) concede/.test(hs));
  const hsFijo = P.mapaCard(rival, { propio: p3, fijo: true });
  check('en Scouting el mapa queda FIJO en Lo que tira · Zonas · Eficiencia vs liga, sin conmutadores',
    /data-pbp-sujeto="equipo" data-pbp-vista="zonas" data-pbp-metrica="eficiencia" data-pbp-diag="1"/.test(hsFijo) && /data-pbp-fijo="1"/.test(hsFijo)
    && !/data-pbp-accion=/.test(hsFijo) && !/class="pbp-hex"/.test(hsFijo) && /Atacar ahí/.test(hsFijo));
  check('y aunque un llamador pida otra vista, fijo gana',
    /data-pbp-sujeto="equipo" data-pbp-vista="zonas" data-pbp-metrica="eficiencia"/.test(P.mapa(rival, { fijo: true, vista: 'hex', metrica: 'frecuencia', sujeto: 'contra' })));
  check('el diagnóstico del rival explica cómo lo lee el DT: explotar = cerrar, ineficientes = flotar',
    /data-pbp-lectura="explotar">Áreas de máxima eficiencia ofensiva del rival\. Lectura para el DT: zonas donde nuestra defensa debe priorizar ajustes/.test(hsFijo)
    && /data-pbp-lectura="evitar">Áreas de bajo rendimiento del rival\. Lectura para el DT: zonas que nuestra defensa puede flotar o liberar/.test(hsFijo)
    && /title="Áreas de máxima eficiencia/.test(hsFijo));
  check('en Equipos el mapa sigue con sus conmutadores y sin la lectura del rival',
    /data-pbp-accion="sujeto:contra"/.test(mapa3) && !/data-pbp-lectura/.test(mapa3));

  /* La interactividad, sobre un DOM mínimo: la fila y el polígono se
     encienden juntos, un toque fija la zona y pinta sus tiros. */
  const hand = {};
  const clases = { Z1: new Set(), Z12: new Set() };
  const el = (z) => ({ classList: { toggle: (c, on) => (on ? clases[z].add(c) : clases[z].delete(c)) } });
  const capa = { innerHTML: '' }, ley = { textContent: '' };
  const caja = { attrs: { 'data-pbp-sujeto': 'equipo' }, getAttribute(k) { return this.attrs[k] || null; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    querySelector: (sel) => (sel === '.pbp-capa-tiros' ? capa : sel === '.pbp-capa-leyenda' ? ley : null),
    querySelectorAll: (sel) => { const z = sel.match(/"(Z\d+)"/)[1]; return [el(z), el(z)]; } };
  const fila = (z) => ({ getAttribute: () => z, closest: (sel) => (sel === '.pbp-mapa-caja' ? caja : fila(z)) });
  const nodo = { attrs: {}, getAttribute(k) { return this.attrs[k] || null; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener: (t, f) => { hand[t] = f; } };
  const ev = (z) => ({ target: { closest: (sel) => (sel === '[data-pbp-zona]' ? fila(z) : null) } });
  P.activar(nodo, p3);
  hand.mouseover(ev('Z1'));
  check('hover en una zona la enciende en la tabla Y en la cancha, y dibuja sus tiros', clases.Z1.has('pbp-activa') && /pbp-tiro-c/.test(capa.innerHTML));
  hand.mouseout(ev('Z1'));
  check('y al salir se apaga y limpia la capa', !clases.Z1.has('pbp-activa') && capa.innerHTML === '');
  hand.click(ev('Z12'));
  hand.mouseout(ev('Z12'));
  check('un toque la FIJA: salir no la apaga y la capa dice cuántos', clases.Z12.has('pbp-activa') && caja.attrs['data-pbp-fija'] === 'Z12' && /1 convertidos · ✕ 1 errados/.test(ley.textContent));
  hand.mouseover(ev('Z1')); hand.mouseout(ev('Z1'));
  check('pasar por otra zona y salir vuelve a la fijada', clases.Z12.has('pbp-activa') && !clases.Z1.has('pbp-activa') && /Z12/.test(ley.textContent));
  hand.click(ev('Z12'));
  check('y tocar la misma lo suelta', !caja.attrs['data-pbp-fija'] && capa.innerHTML === '');
  P.activar(nodo, p3);
  check('activar() engancha una sola vez por bloque', nodo.attrs['data-pbp-activo'] === '1');

  /* ---- integración */
  const idsTiro = (ctx) => JSON.stringify(vm.runInContext('equiposTabsOfrecidas().map(t => t.id)', ctx));
  check('Equipos: «Mapa de tiro» es su propia pestaña, siempre (sin la capa, con el aviso)', /"pbp-tiro"/.test(idsTiro(conCapa)) && /"pbp-tiro"/.test(idsTiro(sinCapa))
    && /data-pbp-sin-capa="1"/.test(vm.runInContext('equiposTab(null, { nombre: "JUJUY BASQUET" }, "pbp-tiro")', sinCapa))
    && /data-pbp-tipo="mapa"/.test(vm.runInContext('equiposTab(null, { nombre: "JUJUY BASQUET" }, "pbp-tiro")', conCapa)));
  check('Scouting: el mapa del rival es otra card del modal, solo con la capa', /"pbp-tiro"/.test(cards(conCapa)) && !/"pbp-tiro"/.test(cards(sinCapa)));
  check('«juego coral» ya no está en ningún módulo: es «juego colectivo»',
    fs.readdirSync('./js').every(f => !/coral/i.test(fs.readFileSync('./js/' + f, 'utf8'))) && /Juego colectivo/.test(fs.readFileSync('./js/sgadd-personalidad.js', 'utf8')));
  const cardRival2 = vm.runInContext('scoutBloquePbp({ claveRival: "A", local: { clave: "A", nombre: "AMANCAY (LR)" }, visitante: { clave: "J", nombre: "JUJUY BASQUET" } })', conCapa);
  check('la card del mapa del rival pasa el OTRO lado del cruce, y la de quintetos no lo necesita', /data-bloque="pbp-tiro"[\s\S]*data-pbp-tipo="mapa" data-pbp-propio="JUJUY BASQUET"/.test(cardRival2) && /data-bloque="pbp"[\s\S]*data-pbp-tipo="quintetos">/.test(cardRival2));
  const srcJug = fs.readFileSync('./js/sgadd-jugadores.js', 'utf8');
  check('Jugadores · Tiro: el mapa del jugador se pide con la capa y se monta después de pintar',
    /function jugadoresTabTiro[\s\S]*?jugadoresBloqueMapaPbp\(j\)/.test(srcJug) && /SGADD_PBP\.activa\(\)[\s\S]{0,80}SGADD_PBP\.espacioJugador|espacioJugador\(j\['NOMBRES'\], j\['EQUIPO'\]\)/.test(srcJug)
    && /function jugadoresPintar[\s\S]*?SGADD_PBP\.montarPendientes\(root\)/.test(srcJug));
  const srcPbp = fs.readFileSync('./js/sgadd-pbp.js', 'utf8');
  check('el montaje pasa el contexto: Scouting pide la card acotada y el mapa fijo',
    /mapaCard\(paq, \{ propio: paqPropio, fijo: contexto === 'scouting', identidad: leerIdentidad\(nodo\) \}\)/.test(srcPbp) && /html\(paq, \{ contexto: contexto \}\)/.test(srcPbp));
  const ordenTabs = JSON.parse(vm.runInContext('JSON.stringify(equiposTabsOfrecidas().map(t => t.id))', conCapa));
  check('Equipos: cierra igual que Jugadores · Partidos · Quintetos · Mapa de tiro · Diagnóstico',
    ordenTabs.slice(-4).join() === 'partidos,pbp,pbp-tiro,diagnostico', ordenTabs);
  check('al imprimir se abren las secciones cerradas y después se devuelven', /beforeprint[\s\S]*details:not\(\[open\]\)/.test(srcPbp) && /afterprint/.test(srcPbp));
  const css = fs.readFileSync('./index.html', 'utf8');
  check('el resaltado vive en el <style> (nodos inyectados) y el hover solo en pantalla',
    /\.pbp-zona\.pbp-activa\s*\{/.test(css) && /\.pbp-etiqueta-ci\s*\{/.test(css) && /\.pbp-tiro-e\s*\{/.test(css) && /\.pbp-contorno\.pbp-diag-critica/.test(css) && /tr\.pbp-fila-zona\.pbp-activa > td\s*\{/.test(css) && /@media screen \{\s*\.pbp-toggle:hover/.test(css)
    && /\.pbp-detalle:not\(\.pbp-sub\) \{ border: 1px solid/.test(css));
  const cli = fs.readFileSync('./server/bin/pbp.js', 'utf8');
  check('el CLI de subida acepta @1, @2 y @3, y no los mezcla', /analitica-pbp-web@2', 'motorstats-ingestion\/analitica-pbp-web@3'/.test(cli) && /esquema distinto del índice/.test(cli));

  {
  titulo('6 · SECCIONES · el bloque opcional del paquete @3 (2026-10-02)');
  /* La forma que arma motorstats-ingestion (`secciones-web@1`). Desde el
     pedido del club del 2026-10-02 el panel ya NO pinta «Estadísticas del
     equipo» (sec-equipo) ni «Estadísticas de jugadores» (sec-jugadores):
     quedan los líderes y, en Equipos, la tabla de posiciones. Los campos
     `liga`/`jugadores` siguen en el paquete pero el panel no los lee. */
  function conSecciones(equipo) {
    const p = paquete3(equipo);
    p.idEquipo = '89190';
    p.secciones = {
      esquema: 'motorstats-ingestion/secciones-web@1', fuente: 'ficha del equipo en el sitio de la competencia · 37 PJ', zonas: [],
      equipo: { pj: 37, total: { pts: 2962 }, porPartido: { pts: 80, rt: 38.3, pp: 11.5 }, pct: { t1: 63, t2: 49, t3: 31 } },
      liga: { equipos: 17, metricas: [{ b: 'pp', k: 'pts', v: 80, med: 80.2, puesto: 10, de: 17, mejor: 'mas' }] },
      jugadores: [{ id: '379619', n: 'STEHLI, RAMIRO', pj: 37, t: { pts: 522 }, p: { pts: 14.1 }, pct: {} }],
      lideres: [{ tipo: 'puntos_media', t: 'Puntos por partido', top: [{ id: '379619', n: 'STEHLI, <b>R</b>', v: 14.1 }, { id: '379620', n: 'IBARRA, S', v: 13 }] }],
      clasificacion: { fase: 'SERIE REGULAR', zona: 'CONFERENCIA NORTE', filas: [
        { pos: 1, id: '11', n: 'SALTA BASKET', pj: 32, g: 24, p: 8, pf: 2600, pc: 2400, pts: 56 },
        { pos: 5, id: '89190', n: 'JUJUY BASQUET', pj: 32, g: 18, p: 14, pf: 2560, pc: 2500, pts: 50 }] },
      ultimo: { fecha: '2026-03-27', rival: 'COMUNICACIONES', condicion: 'V', propios: 68, rivales: 84,
        destacados: [{ k: 'pts', t: 'Puntos', id: '379626', n: 'ROCA, T.', v: 13 }] },
      avisos: [{ id: 'secciones.jugadores-vs-equipo', d: 'suma de jugadores / equipo: pts 2964/2962' }],
    };
    return p;
  }
  const paqSin = paquete3('JUJUY BASQUET');
  const paqCon = conSecciones('JUJUY BASQUET');
  const hSin = P.html(paqSin);
  const hCon = P.html(paqCon);
  check('SIN el bloque, la card es idéntica a la de antes: nada de secciones en el HTML',
    !/data-pbp-secciones|data-pbp-seccion="sec-/.test(hSin) && P.bloqueSecciones(paqSin, 'equipo') === '' && !P.tieneSecciones(paqSin));
  check('CON el bloque, lo único que cambia es el bloque: sacándolo queda la card de siempre',
    hCon.replace(P.bloqueSecciones(paqCon, 'equipo'), '') === hSin);
  const idsSec = (h) => (h.match(/data-pbp-seccion="(sec-[a-z]+)"/g) || []).map(x => x.slice(18, -1)).join();
  check('Equipos: SOLO líderes y tabla de posiciones (sin tablero ni jugadores)', idsSec(hCon) === 'sec-lideres,sec-tabla', idsSec(hCon));
  const hScout = P.html(paqCon, { contexto: 'scouting' });
  check('Scouting: SOLO líderes (sin tablero, jugadores ni tabla)', idsSec(hScout) === 'sec-lideres', idsSec(hScout));
  check('las «Estadísticas del equipo» y «de jugadores» ya no se pintan en ningún contexto',
    !/sec-equipo|sec-jugadores|Estadísticas del equipo · contra la competencia|pbp-sec-jug/.test(hCon + hScout)
    && P.tablaJugadoresSec === undefined);
  check('y Scouting sin el bloque no cambia', P.html(paqSin, { contexto: 'scouting' }) === hScout.replace(P.bloqueSecciones(paqCon, 'scouting'), ''));
  check('Scouting ya no tiene el sub-card «Clutch» (pedido del club): queda «Quién decide los finales»',
    !/data-pbp-seccion="clutch"/.test(hScout) && /data-pbp-seccion="decide"/.test(hScout));
  check('las secciones arrancan CERRADAS, como el resto de la card', !/data-pbp-seccion="sec-[a-z]+" open/.test(hCon));
  check('lo que viene de afuera se escapa (nombre de un líder con markup)', !/<b>R<\/b>/.test(hCon) && /&lt;b&gt;R&lt;\/b&gt;/.test(hCon));
  check('el equipo propio en la tabla va marcado con texto, no solo color', /fila-destacada[\s\S]{0,200}JUJUY BASQUET ◀/.test(hCon));
  check('el último partido: fecha, «en» de visitante y el marcador', /Último partido · 2026-03-27 · en COMUNICACIONES · 68-84/.test(hCon));
  check('los avisos de la ficha se dicen, con el detalle al pasar el mouse', /1 control de la ficha/.test(hCon) && /pts 2964\/2962/.test(hCon));

  /* Resiliencia: el bloque roto o a medias no tira ni pinta cards vacías. */
  const rotosSec = [
    { liga: 'x', jugadores: 'y', lideres: [null, { top: 'z' }], clasificacion: [], ultimo: 5, avisos: {} },
    { liga: { metricas: [{ k: 'pts' }] }, equipo: { porPartido: null } },
    [], 'texto', 42,
  ];
  let ningunoTira = true;
  let siguenLosQuintetos = true;
  rotosSec.forEach((r) => {
    const p = paquete3('JUJUY BASQUET');
    p.secciones = r;
    try {
      const h = P.html(p);
      if (!/data-pbp-seccion="quintetos"/.test(h)) siguenLosQuintetos = false;
      if (/data-pbp-secciones/.test(h)) ningunoTira = false;
    } catch (e) { ningunoTira = false; }
  });
  check('un bloque roto (tipos equivocados, vacío, un array, un texto) no tira ni pinta cards vacías', ningunoTira);
  check('y los quintetos siguen saliendo', siguenLosQuintetos);
  const trampaSec = paquete3('JUJUY BASQUET');
  trampaSec.secciones = { get lideres() { throw new Error('boom'); } };
  let tiroSec = null;
  const avisoViejo = console.warn;
  console.warn = () => {};
  try { P.html(trampaSec); } catch (e) { tiroSec = e; }
  const vacioTrampa = P.bloqueSecciones(trampaSec, 'equipo');
  console.warn = avisoViejo;
  check('una excepción adentro del bloque se contiene: la card sale igual', tiroSec === null && vacioTrampa === '');

  }

  titulo('7 · RELOJ DE POSESIÓN · tres franjas, en el Mapa de tiro (puntos 115-120 y 2026-10-18)');
  {
    const corte = (p25, p50, p75, p90, n) => ({ n: n, p25: p25, p50: p50, p75: p75, p90: p90 });
    /* La liga, en las TRES franjas de hoy: 0-7 · 8-17 · 18-24.
       Pts/tiro 1,30 · 1,05 · 0,84 · reparto de finales 16,5 · 66,7 · 16,8 %. */
    const ligaReloj = () => ({
      f: [[400, 260, 520, 120, 130, 100], [1700, 800, 1790, 750, 420, 320], [450, 170, 380, 200, 85, 60]],
      ro: [300, 160, 345], fa: [270, 110, 260], sr: 200, tolerancia: 3,
      minimos: { finalesEquipo: 150, tirosJugador: 30, canastasFranja: 5 },
      cortes: {
        equipo: { temprana: corte(16, 18, 19, 20, 17), media: corte(52, 58, 68, 69, 17), tardia: corte(14, 15.5, 19.7, 22, 17) },
        jugador: { temprana: corte(13, 17, 20.5, 23, 172), media: corte(50, 58, 66, 70, 172), tardia: corte(12.6, 17.2, 21.7, 25.3, 172) },
        partido: { temprana: corte(12.7, 17.2, 22.2, 26.6, 532), tardia: corte(11.9, 16.3, 21.5, 26.4, 532) },
      },
    });
    /* finales por franja: 60 · 120 · 40 = 220 → 27,3 % · 54,5 % · 18,2 % */
    const favor = () => ({ f: [[50, 30, 65, 10, 12, 10], [100, 48, 106, 43, 24, 20], [30, 10, 22, 14, 5, 10]], ro: [20, 12, 26], fa: [10, 4, 9], sr: 7 });
    const reloj3 = (f) => ({ f: f, ro: [0, 0, 0], fa: [0, 0, 0], sr: 0 });
    const conReloj = (cambios) => {
      const p = paquete3('BOCA');
      p.liga = Object.assign({}, p.liga, { reloj: ligaReloj() });
      p.reloj = Object.assign({ partidos: 4, sinZona: 1, favor: favor(), contra: favor(),
        origen: { ROBO: [40, 52, 6.7], RD: [60, 63, 11.2], SAQUE: [70, 68, 16.5] },
        fam: { aro: [30, 20, 10], tripleFrontal: [10, 20, 10] },
        jugadores: {
          /* 40 tiros: 50 % tempranos con 10 de 12 canastas asistidas; 25 % tardíos con 1 de 6 */
          1: reloj3([[20, 12, 26, 2, 10, 1], [10, 4, 8, 1, 2, 0], [10, 6, 13, 3, 1, 2]]),
          /* 40 tiros: temprano con 1 de 6 asistidas (y el 50 % en la media); tardío con 4 de 5 */
          2: reloj3([[10, 6, 12, 0, 1, 0], [20, 8, 16, 0, 4, 0], [10, 5, 12, 2, 4, 0]]),
          3: reloj3([[6, 3, 6, 0, 1, 0], [4, 2, 4, 0, 0, 0], [2, 1, 2, 0, 0, 0]]),
          4: reloj3([[4, 2, 4, 0, 1, 0], [32, 16, 32, 0, 8, 0], [4, 2, 4, 0, 1, 0]]),
          /* tardío con solo 3 canastas: no se lee si se las crean */
          5: reloj3([[4, 2, 4, 0, 1, 0], [26, 16, 32, 0, 8, 0], [10, 3, 7, 0, 3, 0]]),
        } }, cambios || {});
      return p;
    };
    const pR = conReloj();
    const rasgos = (x) => x.rasgos.map(r => r.id).join();

    /* ---- las franjas ---- */
    check('son TRES franjas: 0-7, 8-17 y 18-24 s, y la metodología dice lo mismo',
      P.FRANJAS_RELOJ.join() === '0-7 s,8-17 s,18-24 s' && P.METODOLOGIA_RELOJ.franjas.map(x => x.label).join() === P.FRANJAS_RELOJ.join()
        && P.METODOLOGIA_RELOJ.franjas.every(x => x.nombre && x.lectura));
    /* ---- RETROCOMPATIBILIDAD · un paquete de CUATRO franjas se convierte al vuelo ----
       0-7 ← 0-6 + un octavo de 7-14 · 8-17 ← el resto de 7-14 + la mitad de 15-20 · 18-24 ← 21-24 + la otra mitad */
    const acc4 = (o) => Object.assign({ f: [[40, 24, 52, 8, 10, 8], [80, 40, 88, 32, 20, 16], [64, 30, 64, 28, 15, 12], [36, 12, 26, 16, 6, 8]],
      ro: [20, 12, 26], fa: [10, 4, 9], sr: 5 }, o || {});
    const viejo = (() => {
      const p = conReloj({ favor: acc4(), contra: acc4(), fam: { aro: [16, 24, 8, 4], tripleFrontal: [8, 16, 10, 6] },
        jugadores: { 1: { f: [[16, 9, 20, 2, 7, 1], [8, 4, 8, 0, 2, 0], [8, 4, 9, 2, 2, 0], [8, 3, 7, 3, 1, 1]], ro: [0, 0, 0], fa: [0, 0, 0], sr: 0 } } });
      p.liga.reloj = { f: [[400, 260, 520, 120, 130, 100], [800, 380, 840, 350, 200, 160], [900, 420, 950, 400, 220, 160], [450, 170, 380, 200, 85, 60]],
        ro: [300, 160, 345], fa: [270, 110, 260], sr: 200, tolerancia: 3, minimos: { finalesEquipo: 150, tirosJugador: 30, canastasFranja: 5 },
        fam: { aro: [300, 300, 250, 100] },
        cortes: { equipo: { temprana: corte(16, 18, 19, 20, 17), medio: corte(63, 65, 68, 69, 17), tardia: corte(14, 15.5, 19.7, 22, 17) },
          jugador: { temprana: corte(13, 17, 20.5, 23, 172), tardia: corte(12.6, 17.2, 21.7, 25.3, 172) },
          partido: { temprana: corte(12.7, 17.2, 22.2, 26.6, 532), tardia: corte(11.9, 16.3, 21.5, 26.4, 532) } } };
      p.partidosPbp = [{ id: 'v1', fecha: '2026-03-01', rival: 'R', reloj: { favor: acc4(), contra: acc4() } }];
      return p;
    })();
    const nv = P.normalizarReloj(viejo);
    check('se reconoce un paquete de cuatro franjas, y uno de tres vuelve INTACTO (el mismo objeto)',
      P.relojFormaVieja(viejo) && !P.relojFormaVieja(pR) && P.normalizarReloj(pR) === pR && P.normalizarReloj(nv) === nv && P.normalizarReloj(null) === null);
    /* 0-6 [40,24,52,8,10,8] + octavo de 7-14 [10,5,11,4,3,2] · 7-14 − octavo + mitad de 15-20 [32,15,32,14,8,6] · 21-24 + la otra mitad */
    check('la conversión: 0-7 suma el segundo 7, 8-17 y 18-24 se reparten 15-20 por mitades, por CUENTA y sin decimales',
      JSON.stringify(nv.reloj.favor.f) === JSON.stringify([[50, 29, 63, 12, 13, 10], [102, 50, 109, 42, 25, 20], [68, 27, 58, 30, 13, 14]]), nv.reloj.favor.f);
    const suma = (acc) => acc.f.reduce((a, c) => a.map((x, i) => x + c[i]), [0, 0, 0, 0, 0, 0]);
    check('ninguna cuenta se pierde ni se inventa: las sumas de las seis columnas son las mismas',
      JSON.stringify(suma(viejo.reloj.favor)) === JSON.stringify(suma(nv.reloj.favor)) && JSON.stringify(nv.reloj.favor.ro) === JSON.stringify(viejo.reloj.favor.ro)
        && nv.reloj.favor.sr === 5 && nv.reloj.favor.f.every(c => c[1] <= c[0] && c.every(x => Number.isInteger(x) && x >= 0)));
    check('también la defensa, cada jugador, las familias de zona, la liga y cada partido',
      nv.reloj.contra.f.length === 3 && nv.reloj.jugadores[1].f.length === 3 && JSON.stringify(nv.reloj.fam.aro) === JSON.stringify([19, 25, 8])
        && nv.liga.reloj.f.length === 3 && JSON.stringify(nv.liga.reloj.fam.aro) === JSON.stringify([338, 387, 225]) && nv.partidosPbp[0].reloj.favor.f.length === 3,
      [nv.reloj.fam.aro, nv.liga.reloj.fam.aro]);
    const cv = nv.liga.reloj.cortes;
    check('los cortes de la competencia se escalan por el cambio de reparto de la liga, y lo que no existía queda sin evaluar',
      cv.equipo.temprana.n === 17 && cv.equipo.temprana.p75 > 19 && cv.equipo.media && cv.equipo.media.p75 < 68 && cv.equipo.tardia.p75 > 19.7
        && cv.jugador.media === null && cv.partido.tardia.p90 > 26.4 && nv.liga.reloj.aproximado === true, cv);
    check('el original no se toca', viejo.reloj.favor.f.length === 4 && viejo.liga.reloj.f.length === 4);
    const salidas = [P.relojMapaTiro(viejo), P.mapaCard(viejo), P.relojEquipo(viejo), P.relojJugador(viejo, '1'), P.relojPartido(viejo, viejo.partidosPbp[0]),
      P.relojPartido(pR, { id: 'x', rival: 'R', reloj: { favor: acc4(), contra: acc4() } }), P.relojMapaTiro(viejo, { fijo: true })];
    check('NINGÚN partido viejo queda vacío: todas las superficies dibujan su reloj', salidas.every(h => h && h.length > 200)
      && /data-reloj-franja="2"/.test(salidas[0]) && !/data-reloj-franja="3"/.test(salidas[0]) && (salidas[4].match(/<table/g) || []).length === 2);
    check('y dicen que es una conversión aproximada, con su criterio', salidas.every(h => /data-reloj-convertido/.test(h))
      && /un octavo de 7-14/.test(P.AVISO_CONVERTIDO) && /mitad y mitad/.test(P.AVISO_CONVERTIDO) && !/data-reloj-convertido/.test(P.relojMapaTiro(pR)));
    check('la conversión no deja un NaN ni un undefined', !/undefined|NaN/.test(salidas.join('')));
    check('las etiquetas y la síntesis se calculan sobre lo convertido',
      P.relojIdentidad(viejo).finales === 264 && P.relojSintesis(viejo).bloques.length === 3 && P.relojArquetipos(viejo) !== null,
      P.relojIdentidad(viejo));

    /* ---- identidad del equipo ---- */
    const idn = P.relojIdentidad(pR);
    check('identidad: 27,3 % de finales en 0-7 s contra un corte de 19 % → «Ataca temprano», y solo eso',
      idn.finales === 220 && idn.muestra && idn.comparable && rasgos(idn) === 'temprana' && /27,3 % de sus finales en los primeros 7 segundos/.test(idn.rasgos[0].detalle), idn);
    check('y aclara que su mayor volumen está en otra franja (54,5 % en 8-17 s)',
      /aunque el 54,5 % de sus finales ocurre en la ventana media de 8 a 17 s\./.test(idn.rasgos[0].detalle), idn.rasgos[0].detalle);
    /* 30 · 130 · 50 = 210 → tardía 23,8 % */
    const tardio = conReloj({ favor: reloj3([[25, 10, 20, 5, 5, 5], [110, 40, 80, 10, 10, 20], [45, 20, 40, 5, 5, 5]]) });
    check('identidad: 23,8 % de finales después del segundo 17 → «Llega tarde al tiro»', rasgos(P.relojIdentidad(tardio)) === 'tardia'
      && /después del segundo 17/.test(P.relojIdentidad(tardio).rasgos[0].detalle));
    /* 30 · 160 · 30 = 220 → media 72,7 %, tardía 13,6 % */
    const armada = conReloj({ favor: reloj3([[25, 10, 20, 5, 5, 5], [140, 60, 120, 10, 10, 20], [25, 20, 40, 5, 5, 5]]) });
    check('identidad: 72,7 % entre los 8 y los 17 s y pocos tardíos → «Ofensiva armada»', rasgos(P.relojIdentidad(armada)) === 'armada');
    /* 34 · 132 · 34 = 200 → 17 · 66 · 17 */
    const medioLiga = conReloj({ favor: reloj3([[30, 10, 20, 5, 5, 4], [120, 40, 80, 10, 10, 12], [30, 20, 40, 5, 5, 4]]) });
    check('NINGUNA etiqueta sale de un número fijo: 17 % de finales tardíos no marca a nadie si el cuarto alto arranca en 19,7 %',
      P.relojIdentidad(medioLiga).reparto[2] === 17 && rasgos(P.relojIdentidad(medioLiga)) === '' && /Reparto de liga/.test(P.relojEquipo(medioLiga)));
    const armadaTardia = conReloj({ favor: reloj3([[24, 10, 20, 5, 5, 4], [120, 40, 80, 10, 10, 20], [28, 20, 40, 5, 5, 4]]) });
    check('«Ofensiva armada» exige además pocos finales tardíos: con 16 % (sobre la mediana) no se dice', rasgos(P.relojIdentidad(armadaTardia)) === '');
    const dosRasgos = conReloj({ favor: reloj3([[45, 10, 20, 5, 5, 5], [80, 20, 40, 5, 5, 20], [45, 20, 40, 5, 5, 5]]) });
    check('los rasgos no son excluyentes: puede atacar temprano Y llegar tarde', rasgos(P.relojIdentidad(dosRasgos)) === 'temprana,tardia');
    const chico = conReloj({ favor: reloj3([[25, 10, 20, 5, 5, 5], [40, 20, 40, 10, 10, 0], [20, 10, 20, 5, 5, 0]]) });
    check('con menos de 150 finales con reloj no hay etiqueta, y la pantalla lo dice con ~',
      P.relojIdentidad(chico).finales === 90 && !P.relojIdentidad(chico).muestra && /~ Muestra chica: 90 finales/.test(P.relojEquipo(chico)));
    const pocosEquipos = conReloj();
    ['temprana', 'media', 'tardia'].forEach((k) => { pocosEquipos.liga.reloj.cortes.equipo[k].n = 6; });
    check('con menos de 8 equipos con muestra no se compara contra la competencia',
      P.relojIdentidad(pocosEquipos).comparable === false && /Todavía no hay equipos suficientes/.test(P.relojEquipo(pocosEquipos)));

    /* ---- perfil del jugador ---- */
    const j1 = P.relojPerfilJugador(pR, '1'), j2 = P.relojPerfilJugador(pR, '2');
    check('jugador: temprano y asistido → «Finalizador temprano»; tardío y creado → «Resuelve con el reloj encima»',
      j1.tiros === 40 && j1.reparto[0] === 50 && j1.reparto[2] === 25 && rasgos(j1) === 'temprana-asistido,tardia-creado', j1);
    check('jugador: temprano y creado → «Creador de transición»; tardío y asistido → «Válvula de escape»',
      rasgos(j2) === 'temprana-creado,tardia-asistido' && j2.rasgos[1].label === 'Válvula de escape'
        && /en los primeros 7 segundos/.test(j2.rasgos[0].detalle) && /aunque el 50,0 % de sus tiros ocurre en la ventana media de 8 a 17 s/.test(j2.rasgos[0].detalle), j2);
    check('jugador con 12 tiros con reloj: sin perfil, y el bloque lo dice', !P.relojPerfilJugador(pR, '3').muestra && /~ Muestra chica: 12 tiros con reloj/.test(P.relojJugador(pR, '3')));
    /* 80 % de sus tiros entre los 8 y los 17 s (el cuarto alto de un jugador arranca en 66 %), con 8 de 16 asistidas
       contra 52,5 % de la competencia en esa franja → creadas por él */
    const j4 = P.relojPerfilJugador(pR, '4');
    check('la franja MEDIA también perfila: mucho juego armado y canastas propias → «Creador en el juego armado»',
      rasgos(j4) === 'media-creado' && j4.rasgos[0].label === 'Creador en el juego armado' && /entre los 8 y los 17 segundos/.test(j4.rasgos[0].detalle), j4);
    const pJ6 = conReloj();
    pJ6.reloj.jugadores[6] = reloj3([[6, 3, 6, 0, 1, 0], [28, 12, 24, 0, 10, 0], [6, 3, 6, 0, 1, 0]]);
    check('con el sistema buscándolo (10 de 12 asistidas) es «Ejecutor del juego armado»; quien reparte como la liga, nada',
      rasgos(P.relojPerfilJugador(pJ6, '6')) === 'media-asistido' && rasgos(P.relojPerfilJugador(pR, '1')) === 'temprana-asistido,tardia-creado');
    check('la franja media no entra en las listas de quién tira temprano y tarde', !P.relojQuienes(pR).tempranos.concat(P.relojQuienes(pR).tardios).some(x => x.id === '4'));
    const j5 = P.relojPerfilJugador(pR, '5');
    check('con menos de 5 canastas en la franja no se decide si se las crean', rasgos(j5) === 'tardia' && j5.rasgos[0].label === 'Tira con el reloj encima');
    check('un jugador que no está en el paquete no tiene perfil ni bloque', P.relojPerfilJugador(pR, '99') === null && P.relojJugador(pR, '99') === '');

    /* ---- la tabla ---- */
    const tabla = P.relojTabla(pR.reloj.favor, pR.liga.reloj);
    check('la tabla trae las tres franjas con su C/I y el reparto contra la competencia',
      P.FRANJAS_RELOJ.every(f => tabla.indexOf(f) !== -1) && tabla.indexOf('>30/50<') !== -1 && tabla.indexOf('27,3 % <span class="dato-sec">(16,5)</span>') !== -1);
    check('Pts/tiro con la competencia entre paréntesis, y el tinte acompaña al número',
      tabla.indexOf('1,30 <span class="dato-sec">(1,30)</span>') !== -1 && /mm-neg">0,73 <span class="dato-sec">\(0,84\)<\/span>/.test(tabla));
    check('la 2da oportunidad y el reinicio van aparte, con su nombre y su tooltip',
      /2da oportunidad · tras rebote ofensivo[\s\S]*12\/20[\s\S]*Reinicio · tras falta recibida[\s\S]*4\/10/.test(tabla)
        && tabla.indexOf('title="' + P.FUERA_DE_FRANJA.ro.glosa + '">2da oportunidad') !== -1);
    const soloFuera = { f: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], ro: [20, 12, 26], fa: [10, 4, 9], sr: 0 };
    check('la 2da oportunidad y el reinicio no contaminan las franjas',
      JSON.stringify(P.relojReparto(pR.reloj.favor)) === JSON.stringify(P.relojReparto(Object.assign({}, pR.reloj.favor, { ro: [0, 0, 0], fa: [0, 0, 0] })))
        && P.relojReparto(soloFuera).every(x => x === null) && (P.relojTabla(soloFuera, null).match(/>0\/0</g) || []).length === 3);
    check('los tiros sin reloj se cuentan a la vista', /7 tiros sin reloj atribuible/.test(tabla) && /No cuenta los libres: no es puntos por jugada/.test(tabla));

    /* ---- dónde vive: la card de Mapa de tiro, ya no Quintetos ni Personalidad ---- */
    const hR = P.html(pR), hSc = P.html(pR, { contexto: 'scouting' });
    check('la card de Quintetos (Equipos y Scouting) ya NO trae el reloj', !/Reloj de posesión/.test(hR) && !/Reloj de posesión/.test(hSc)
      && !/data-pbp-seccion="reloj"/.test(hSc));
    const mC = P.mapaCard(pR, { identidad: { PACE: { f: '78,4', p: 85 } } }), mS = P.mapaCard(pR, { fijo: true });
    check('la card de Mapa de tiro trae el reloj abajo del mapa principal', /data-reloj-mapa-tiro/.test(mC)
      && mC.indexOf('pbp-mapa-caja') < mC.indexOf('data-reloj-mapa-tiro') && /Reloj de posesión · cuándo tira y cuándo le tiran/.test(mC));
    check('en Scouting (fijo) suma la lectura para defenderlo y quién tira temprano y tarde',
      /data-reloj-lectura/.test(mS) && /balance defensivo/.test(mS) && /data-reloj-quienes/.test(mS) && /Quién tira en los primeros 7 segundos/.test(mS)
        && /decide el cuerpo técnico/.test(mS) && !/data-reloj-lectura/.test(mC));
    check('sin «reloj» en el paquete la card de Mapa de tiro es la de antes', !/data-reloj-mapa-tiro/.test(P.mapaCard(paquete3('BOCA')))
      && P.relojMapaTiro(paquete3('BOCA')) === '');
    const qn = P.relojQuienes(pR);
    check('quién tira temprano y quién tarde, de más a menos tiros', qn.tempranos.map(x => x.id).join() === '1,2' && qn.tardios.length === 3
      && qn.tempranos[0].conv === 12 && qn.tempranos[0].porcion === 50);
    check('la lectura del que llega tarde cita la competencia en 18-24 s (0,84)', /la competencia rinde 0,84 por tiro/.test(P.relojLecturaScouting(tardio)));
    check('un «reloj» con otra forma no pinta nada y no tumba la card',
      P.relojEquipo(conReloj({ favor: { f: [[1, 2, 3], [1, 2, 3]], ro: [0, 0, 0], fa: [0, 0, 0], sr: 0 } })) === ''
        && P.relojEquipo(conReloj({ favor: reloj3([['a', 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]]) })) === '');

    /* ---- el post-partido ---- */
    /* 10 · 30 · 20 = 60 finales → 33,3 % tardíos, sobre el p90 de un partido (26,4 %) */
    const noche = (t) => ({ f: [[8, 4, 9, 2, 2, 2], [24, 11, 24, 8, 5, 6], [t - 2, 4, 9, 6, 2, 2]], ro: [5, 3, 6], fa: [3, 1, 2], sr: 2 });
    const pp = { id: 'x', rival: 'OBERÁ <b>', reloj: { favor: noche(20), contra: noche(8) } };
    const hp = P.relojPartido(pR, pp);
    check('post-partido: los dos equipos con su tabla y su porción de finales tardíos', (hp.match(/<table/g) || []).length === 2 && /33,3 %/.test(hp));
    check('post-partido: el aviso de reloj tardío solo del lado que pasa el corte, sin afirmar la causa',
      (hp.match(/data-reloj-aviso/g) || []).length === 1 && /después del segundo 17/.test(hp) && /el dato no los separa/.test(hp));
    const corta = { id: 'x', rival: 'R', reloj: { favor: reloj3([[4, 2, 4, 0, 0, 1], [12, 6, 12, 0, 0, 2], [9, 3, 6, 0, 0, 1]]), contra: noche(8) } };
    check('post-partido: con menos de 30 finales no hay aviso', !/data-reloj-aviso/.test(P.relojPartido(pR, corta)) && /34,5 %/.test(P.relojPartido(pR, corta)));
    check('post-partido: el rival va escapado y sin reloj lo dice', hp.indexOf('OBERÁ &lt;b&gt;') !== -1 && /Sin reloj de posesión de este partido/.test(P.relojPartido(pR, { id: 'x' })));

    /* ---- la síntesis ----
       18-24: 10/30 (0,73) → −0,066 ajustado: grieta en ataque, ARMA en defensa.
       2da oportunidad: 12/20 (1,30) → +0,075: arma en ataque, GRIETA en defensa. */
    const sR = P.relojSintesis(pR);
    const ids = (l) => l.map(x => x.lado + ':' + x.k).join();
    check('síntesis: armas y grietas de los desvíos AJUSTADOS, de los dos lados, por puntos de diferencia',
      sR.muestra && ids(sR.armas) === 'contra:2,favor:ro' && ids(sR.grietas) === 'favor:2,contra:ro', [ids(sR.armas), ids(sR.grietas)]);
    check('cada arma y grieta dice la cifra, la de la competencia y su muestra',
      sR.grietas[0].label === 'Tira · 18-24 s (tardía)' && /Saca 0,73 por tiro contra 0,84 de la competencia \(10\/30/.test(sR.grietas[0].detalle));
    check('«para explotarle» sale de sus grietas y «para anularle» de sus armas',
      sR.explotar.length === 2 && /^Defender los 24 segundos: con el reloj encima saca 0,73 por tiro \(0,84\)/.test(sR.explotar[0].texto)
        && /^Cargar el rebote ofensivo/.test(sR.explotar[1].texto) && /^Evitar el final del reloj/.test(sR.anular[0].texto) && /^Box-out en cada tiro/.test(sR.anular[1].texto), sR);
    check('el insight se arma por bloque: temprano, medio y tardío, cada uno con ataque y defensa',
      sR.bloques.map(b => b.id).join() === 'temprano,medio,tardio' && sR.bloques.every(b => b.ataque && b.defensa)
        && /^Vive del primer golpe: 27,3 % de sus finales salen en los primeros 7 segundos/.test(sR.bloques[0].ataque) && /^Le corren/.test(sR.bloques[0].defensa));
    check('un bloque en el rango de la competencia también se dice, con su rendimiento',
      /^Reparte como la competencia: 18,2 % de sus finales \(la competencia, 16,8 %\), pero ahí rinde por debajo de la competencia \(0,73 contra 0,84 por tiro\)\.$/.test(sR.bloques[2].ataque)
        && !sR.bloques[2].distinto && sR.insight.length === 2, sR.bloques[2]);
    const comoLiga = { f: [[40, 26, 52, 12, 13, 10], [170, 80, 179, 75, 42, 32], [45, 17, 38, 20, 8, 6]], ro: [30, 16, 35], fa: [27, 11, 26], sr: 0 };
    const neutro = P.relojSintesis(conReloj({ favor: comoLiga, contra: comoLiga }));
    check('sin desvíos no se fuerza un texto', neutro.neutro && neutro.insight.length === 1 && /no es un rasgo de este equipo/.test(neutro.insight[0])
      && !neutro.armas.length && !neutro.explotar.length);
    check('con menos de 150 finales no hay síntesis', !P.relojSintesis(conReloj({ favor: chico.reloj.favor, contra: chico.reloj.favor })).insight.length);

    /* ---- los arquetipos (tres franjas) ---- */
    const conVara = (p) => {
      p.liga.reloj.origen = { ROBO: [400, 520, 7.5], RD: [600, 640, 11.7], SAQUE: [1000, 1000, 16.9] };
      p.liga.reloj.fam = { aro: [300, 300, 100], tripleFrontal: [100, 600, 200] };
      return p;
    };
    const aIds = (a, l) => a[l].map(x => x.id).join();
    const fav = (f0, extra) => Object.assign({ f: [f0, [100, 48, 106, 43, 24, 20], [30, 10, 22, 14, 5, 10]], ro: [20, 12, 26], fa: [10, 4, 9], sr: 0 }, extra || {});
    check('los arquetipos son 9 (6 de ataque y 3 de defensa) y cada uno está en la metodología, el Glosario y el manual',
      P.ARQUETIPOS_RELOJ.ofensivos.length === 6 && P.ARQUETIPOS_RELOJ.defensivos.length === 3
        && P.ARQUETIPOS_RELOJ.ofensivos.concat(P.ARQUETIPOS_RELOJ.defensivos).every(a => P.METODOLOGIA_RELOJ.arquetipos.some(x => x.label === a.label)
          && P.relojMetodologiaHtml().indexOf(a.label) !== -1 && fs.readFileSync(path.join(__dirname, 'MANUAL_ETIQUETADO_SGADD.html'), 'utf8').indexOf(a.label) !== -1));
    check('un equipo que rinde como la liga en cada franja no calza en ninguno', aIds(P.relojArquetipos(pR), 'ofensivos') === '' && !P.relojArquetipos(pR).sinVara.length);
    const vertigo = conVara(conReloj({ favor: fav([80, 55, 130, 10, 30, 10]) }));
    check('«Vértigo en transición»: volumen en el cuarto alto de 0-7 Y rendimiento por encima',
      aIds(P.relojArquetipos(vertigo), 'ofensivos') === 'vertigo'
        && /36,0 % de sus finales en 0-7 s \(la competencia, 16,5 %; el cuarto más alto arranca en 19,0 %\) y 1,63 por tiro contra 1,30/.test(P.relojArquetipos(vertigo).ofensivos[0].detalle)
        && /^Ritmo vertiginoso en transición: finaliza 36,0 % de sus jugadas en los primeros 7 segundos/.test(P.relojSintesis(vertigo).insight[0]));
    const desord = conVara(conReloj({ favor: fav([80, 25, 52, 10, 5, 10]) }));
    const tD = (s) => (s.explotar.filter(x => x.k === '0')[0] || {}).texto || '';
    check('«Transición desordenada»; con PACE sobre el percentil 70 se suma la falsa transición',
      aIds(P.relojArquetipos(desord), 'ofensivos') === 'transicion-desordenada' && !/falsa transición/.test(tD(P.relojSintesis(desord)))
        && /falsa transición/.test(tD(P.relojSintesis(desord, { PACE: { f: '78,4', p: 85 } }))) && /antes del segundo 7/.test(tD(P.relojSintesis(desord, { PACE: { f: '78,4', p: 85 } }))));
    const inerte = conVara(conReloj({ favor: fav([25, 8, 15, 5, 3, 2]) }));
    check('ofensiva inerte a campo abierto: replegar, no presionar toda la cancha',
      /^Ofensiva inerte a campo abierto/.test(P.relojSintesis(inerte).insight[0]) && P.relojSintesis(inerte).explotar.some(x => /no presionar toda la cancha/.test(x.texto)));
    const planA = conVara(conReloj({ favor: reloj3([[30, 15, 39, 5, 5, 5], [160, 90, 200, 40, 30, 10], [20, 8, 16, 5, 2, 5]]) }));
    check('«Sistemático · eficacia en el juego armado» contra el cuartil de 8-17, con su ataque de control',
      aIds(P.relojArquetipos(planA), 'ofensivos') === 'plan-a' && P.relojSintesis(planA).insight.some(t => /^Ataque de control: la paciencia colectiva concentra 73,9 % de sus finales entre los 8 y los 17 segundos/.test(t))
        && P.relojSintesis(planA).anular.some(x => x.k === '1' && /cortinas indirectas/.test(x.texto)));
    const esteril = conVara(conReloj({ favor: reloj3([[30, 15, 39, 5, 5, 5], [160, 50, 100, 40, 30, 10], [20, 8, 16, 5, 2, 5]]) }));
    check('«Juego armado estéril»: mucho 8-17 y rinde por debajo', aIds(P.relojArquetipos(esteril), 'ofensivos') === 'plan-a-esteril'
      && P.relojSintesis(esteril).insight.some(t => /metódica pero estéril/.test(t)));
    const frio = conVara(conReloj({ favor: reloj3([[25, 10, 20, 5, 5, 5], [110, 40, 80, 10, 10, 20], [45, 25, 60, 5, 5, 5]]) }));
    check('«Sangre fría al final del reloj»: mucho 18-24 y rinde por encima', aIds(P.relojArquetipos(frio), 'ofensivos') === 'sangre-fria');
    const soga = conVara(conReloj({ favor: reloj3([[25, 10, 20, 5, 5, 5], [110, 40, 80, 10, 10, 20], [45, 10, 20, 5, 5, 5]]) }));
    check('«Soga al cuello» y su insight de colapso al final del reloj', aIds(P.relojArquetipos(soga), 'ofensivos') === 'soga'
      && P.relojSintesis(soga).insight.join(' ').indexOf('Colapso al final del reloj: resuelve bajo presión en 23,8 % de sus finales (la competencia, 16,8 %) y saca apenas 0,44 por tiro (0,84).') !== -1);
    const dos = conVara(conReloj({ favor: reloj3([[45, 30, 72, 10, 15, 5], [165, 90, 200, 40, 30, 10], [20, 8, 16, 5, 2, 5]]) }));
    check('si calza en varios arquetipos se muestran TODOS, en el orden del pedido', aIds(P.relojArquetipos(dos), 'ofensivos') === 'vertigo,plan-a');
    const muralla = conVara(conReloj({ contra: { f: [[50, 40, 95, 10, 12, 10], [100, 48, 106, 43, 24, 20], [40, 8, 18, 14, 5, 10]], ro: [20, 12, 26], fa: [10, 4, 9], sr: 0 } }));
    check('defensa: le sacan poco en 18-24 → «Muralla»; le sacan mucho en 0-7 → «Balance vulnerable»',
      aIds(P.relojArquetipos(muralla), 'defensivos') === 'balance-vulnerable,muralla' && /^En 18-24 s le sacan 0,45 por tiro contra 0,84 \(8\/40\)/.test(P.relojArquetipos(muralla).defensivos[1].detalle));
    const especial = conVara(conReloj({ favor: fav([50, 30, 65, 10, 12, 10], { ro: [40, 28, 70], fa: [40, 10, 20] }) }));
    const sE = P.relojSintesis(especial, { 'RO%': { f: '38,2 %', p: 95 } });
    check('situaciones especiales: reinicio inerte y 2da oportunidad letal, con el cruce de RO%',
      sE.insight.some(t => /^Ataque inerte tras congelar el juego/.test(t)) && sE.anular.some(x => x.k === 'ro' && /RO% 38,2 %, percentil 95/.test(x.texto)));
    const t3 = (p) => P.relojSintesis(pR, { 'PT3%': { f: '42,0 %', p: p } }).insight.some(t => /^Dependencia del tiro externo en el juego armado: 43,0 % de sus tiros entre los 8 y los 17 segundos son triples/.test(t));
    check('dependencia del triple en el juego armado solo con el uso del triple sobre el percentil 80', t3(85) && !t3(70));
    const orig = P.relojOrigenBarras(vertigo.reloj, vertigo.liga.reloj);
    check('«Cómo nace la posesión» en barras con el trazo de la competencia', (orig.match(/reloj-barra-liga/g) || []).length === 3 && /23,5 %/.test(orig) && /\(20,0\)/.test(orig));

    /* ---- el bloque del Mapa de tiro ---- */
    const hM = P.relojMapaTiro(pR);
    check('el bloque trae barras de tres franjas por lado, las tablas, el insight, armas y grietas y las recomendaciones',
      (hM.match(/data-reloj-franja=/g) || []).length === 6 && (hM.match(/reloj-barra-liga/g) || []).length >= 6 && /data-reloj-tablas/.test(hM)
        && (hM.match(/data-reloj-bloque="/g) || []).length === 3 && /Sus armas del reloj/.test(hM) && /Para explotarle/.test(hM) && /Para anularle/.test(hM));
    const hF = P.relojMapaTiro(pR, { fijo: true });
    check('en Scouting (fijo) no van insight, armas, grietas ni recomendaciones, y el resto del reloj sigue',
      !/Insight del reloj|Sus armas del reloj|Sus grietas del reloj|Para explotarle|Para anularle|data-reloj-bloque=/.test(hF) && /data-reloj-tablas/.test(hF) && /data-reloj-lugar/.test(hF));
    check('el rendimiento no se comunica solo con color: ▼ en 18-24 de ataque, ▲ en la misma franja de defensa', /0,73 ▼/.test(hM) && /0,73 ▲/.test(hM));
    check('con un paquete sin la franja de cada tiro, los mapas por franja lo dicen', /llega con la próxima subida/.test(hM) && !/data-reloj-mapa-franja/.test(hM));
    check('ninguna salida trae un undefined ni un NaN', !/undefined|NaN/.test(mC + mS + hM + hp + P.relojMapaTiro(vertigo, { identidad: { PACE: { f: '78,4', p: 85 } } })
      + P.relojMapaTiro(muralla) + P.relojMapaTiro(conReloj({ favor: chico.reloj.favor, contra: chico.reloj.favor })) + P.relojJugador(pR, '1')));

    /* ---- MAPAS COMPLETOS POR FRANJA (2026-10-18) ----
       Cada punto trae su código de reloj: 0-2 franja, 3 tras rebote ofensivo,
       4 tras falta, −1 sin reloj. Jugadores: índice 0 = '2', 1 = '5'. */
    const conPuntos = () => {
      const p = conReloj();
      const v = (n, c, lat, fondo, zi, j, cod) => Array.from({ length: n }, (_, i) => [lat, fondo, i < c ? 1 : 0, zi, j, cod]);
      p.tiros.detalle.puntos = Object.assign({}, p.tiros.detalle.puntos, { ids: ['2', '5'],
        favor: [].concat(v(15, 11, 75, 12, 0, 0, 0), v(5, 3, 75, 12, 0, 1, 0),   // 0-7: 20 en el aro, 14 adentro
          v(30, 8, 30, 50, 10, 1, 1),                                              // 8-17: 30 triples laterales, 8 adentro
          v(20, 4, 75, 80, 11, 0, 2),                                              // 18-24: 20 triples frontales, 4 adentro
          v(3, 1, 75, 12, 0, 0, 3), v(2, 1, 75, 12, 0, 0, 4), v(4, 2, 75, 12, 0, 0, -1)),
        contra: [].concat(v(6, 3, 75, 12, 0, -1, 0), v(4, 1, 30, 50, 10, -1, 2)) });
      p.liga.familias = Object.assign({}, p.liga.familias, { tripleLateral: { i: 3000, c: 1050, ppt: 1.05 } });
      return p;
    };
    const pP = conPuntos();
    const f0 = P.paqFranja(pP, 0), f1 = P.paqFranja(pP, 1), f2 = P.paqFranja(pP, 2);
    check('el paquete por franja re-agrega las zonas desde los tiros de esa franja',
      JSON.stringify(f0.tiros.detalle.favor.zonas) === JSON.stringify([{ zona: 'Z1', i: 20, c: 14, pct: 70, ppt: 1.4 }])
        && f1.tiros.detalle.favor.zonas[0].zona === 'Z11' && f1.tiros.detalle.favor.zonas[0].i === 30 && f1.tiros.detalle.favor.zonas[0].ppt === 0.8
        && f2.tiros.detalle.contra.zonas[0].i === 4, [f0.tiros.detalle.favor.zonas, f1.tiros.detalle.favor.zonas]);
    check('y los hexágonos, con la misma fórmula que la ingesta', P.hexDePunto(7.5, 1.2).join() === '5,1'
      && JSON.stringify(f0.tiros.detalle.favor.hex) === JSON.stringify([[5, 1, 20, 14, 28]]), f0.tiros.detalle.favor.hex);
    check('la 2da oportunidad, el reinicio y lo sin reloj no entran en ninguna franja',
      f0.tiros.detalle.puntos.favor.length + f1.tiros.detalle.puntos.favor.length + f2.tiros.detalle.puntos.favor.length === 70);
    check('el paquete por franja se guarda: pedirlo dos veces da el mismo objeto, y sin códigos da null',
      P.paqFranja(pP, 1) === f1 && P.paqFranja(paquete3('BOCA'), 0) === null && !P.conCodigoReloj(paquete3('BOCA')) && P.conCodigoReloj(pP));
    const cap = P.capaTiros(f1, 'equipo', 'Z11');
    check('la capa de círculos y cruces de una franja dibuja SOLO sus tiros', cap.convertidos === 8 && cap.errados === 22
      && P.capaTiros(pP, 'equipo', 'Z1').convertidos + P.capaTiros(pP, 'equipo', 'Z1').errados === 29);
    const mp = P.relojMapas(pP);
    check('tres mapas COMPLETOS, uno por franja: zonas, tabla enlazada, diagnóstico y la caja marcada con su franja',
      (mp.match(/data-reloj-mapa-franja="/g) || []).length === 3 && ['0', '1', '2'].every(k => mp.indexOf('data-pbp-franja="' + k + '"') !== -1)
        && (mp.match(/class="pbp-mapa w-full/g) || []).length === 3 && (mp.match(/pbp-fila-zona/g) || []).length >= 3 && /Lo que le tiran/.test(mp));
    check('cada franja resume sus tiros, su conversión y su parte', /20 tiros · 14\/20 · 1,40 por tiro · 28,6 % de sus tiros con reloj/.test(mp)
      && /9 tiros \(2da oportunidad, reinicio o sin reloj atribuible\) no entran en ninguna franja/.test(mp), mp.slice(0, 600));
    check('en Scouting los mapas por franja quedan en la vista fija', (P.relojMapas(pP, { fijo: true }).match(/data-pbp-fijo="1"/g) || []).length === 3
      && /Lo que tira en 8-17 s · Zonas/.test(P.relojMapas(pP, { fijo: true })));
    const mpf = P.mapa(f1, { sujeto: 'equipo', perspectiva: true, franja: 1 });
    check('el mapa de una franja usa el MISMO mapa principal (conmutadores incluidos) y marca su franja', /data-pbp-franja="1"/.test(mpf)
      && /data-pbp-accion="vista:hex"/.test(mpf) && !/data-pbp-franja/.test(P.mapa(pP, { sujeto: 'equipo' })));

    /* ---- la card TIRO del jugador: cuándo y desde dónde tira, por franja ---- */
    const jf = P.relojJugadorFranjas(pP, '2');
    check('card Tiro: el volumen de cada franja (% de sus tiros, C/I, Pts/tiro con la liga, asistidas y pérdidas)',
      (jf.match(/data-reloj-jugador-franja="/g) || []).length === 3 && /Cuándo y desde dónde tira · por franja del reloj/.test(jf) && /liga 1,30/.test(jf) && /rend-card/.test(jf) && /rend-pista/.test(jf) && /[▲●▼]/.test(jf));
    check('card Tiro: el mapa COMPLETO del jugador en cada franja, con su sujeto y su franja',
      (jf.match(/data-reloj-jugador-mapa="/g) || []).length === 3 && /data-pbp-sujeto="2" [^>]*data-pbp-franja="0"/.test(jf)
        && /Desde dónde tira en 0-7 s <span[^>]*>· 11\/15/.test(jf) && /Desde dónde tira en 8-17 s <span[^>]*>· sin tiros/.test(jf), jf.slice(0, 300));
    const pj0 = P.paqFranja(pP, 0).tiros.detalle.jugadores;
    check('el paquete por franja trae a cada jugador con sus tiros de esa franja', pj0.find(j => j.id === '2').i === 15 && pj0.find(j => j.id === '5').i === 5
      && P.capaTiros(P.paqFranja(pP, 0), '2', 'Z1').convertidos === 11);
    check('sin la franja de cada tiro, la card Tiro muestra los volúmenes y dice cuándo llega el mapa',
      /data-reloj-jugador-franja="2"/.test(P.relojJugadorFranjas(pR, '1')) && /llega con la próxima subida/.test(P.relojJugadorFranjas(pR, '1'))
        && /data-reloj-jugador-franjas/.test(P.relojJugador(pR, '1')) && P.relojJugadorFranjas(pR, '99') === '');

    /* ---- las tarjetas de tendencias ---- */
    const tt = P.relojTendencias(pP);
    check('PUNTOS ALTOS: franja y zona que rinden por encima con volumen (0-7 · aro, 1,40 contra 1,22)',
      tt.altos.length === 1 && tt.altos[0].k === 0 && tt.altos[0].fam === 'aro' && tt.altos[0].i === 20, tt.altos);
    check('PUNTOS DE FUGA: ordenados por puntos perdidos y separando el volumen alto del bajo',
      tt.fuga.map(x => x.k + ':' + x.fam).join() === '1:tripleLateral,2:tripleFrontal' && tt.fuga.every(x => x.volumen === 'alto'), tt.fuga);
    check('TOP 3 POR ZONA Y FRANJA: quién tira más en cada franja, con su conversión y su zona',
      tt.top[0].map(j => j.id + ':' + j.i).join() === '2:15,5:5' && tt.top[1][0].id === '5' && tt.top[1][0].c === 8 && tt.top[2][0].familia === 'tripleFrontal'
        && Math.round(tt.top[0][0].parte) === 43, tt.top);
    const th = P.relojTendenciasHtml(pP);
    check('las tres tarjetas al pie, con ▲ y ▼ (no solo color) y la lectura del volumen',
      (th.match(/data-reloj-tendencia="/g) || []).length === 3 && /Puntos altos/.test(th) && /Puntos de fuga/.test(th) && /Top 3 por zona y franja/.test(th)
        && /▲ <b/.test(th) && /▼ <b/.test(th) && /Mucho volumen con baja conversión/.test(th) && !/undefined|NaN/.test(th));
    const hMP = P.relojMapaTiro(pP);
    check('el bloque del Mapa de tiro cierra con las tendencias, después de los mapas por franja',
      hMP.indexOf('data-reloj-mapa-franja') !== -1 && hMP.indexOf('data-reloj-mapa-franja') < hMP.indexOf('data-reloj-tendencias') && !/undefined|NaN/.test(hMP));
    check('sin la franja de cada tiro no hay tendencias', P.relojTendencias(pR) === null && P.relojTendenciasHtml(pR) === '');

    /* ---- metodología, Glosario, manual ---- */
    const M = P.METODOLOGIA_RELOJ;
    const crit = (id) => (M.criterios.filter(x => x.id === id)[0] || {}).texto || '';
    check('los criterios: la liga y no umbrales fijos, Pts/tiro sin libres, el reinicio en fila propia',
      /No hay umbrales fijos/.test(crit('liga')) && /tiros libres no se cronometran/.test(crit('tiro')) && /fuera de las franjas/.test(crit('reinicio')));
    const dichas = M.equipo.concat(M.jugador).map(x => x.label);
    const emitidas = [pR, tardio, armada, dosRasgos].map(x => P.relojIdentidad(x).rasgos.map(y => y.label))
      .concat(['1', '2', '5'].map(id => P.relojPerfilJugador(pR, id).rasgos.map(y => y.label))).reduce((a, b) => a.concat(b), []);
    check('toda etiqueta que el motor emite está definida en la metodología', emitidas.length >= 8 && emitidas.every(l => dichas.indexOf(l) !== -1), emitidas);
    check('el aviso de reloj tardío habla del segundo 17 y no afirma una causa', /segundo 17/.test(M.alerta) && /Describe, no juzga/.test(M.alerta));
    check('«Cómo se lee» va en las superficies del reloj, plegado y fuera del papel',
      [P.relojEquipo(pR), P.relojJugador(pR, '1'), hp, hM].every(h => (h.match(/data-reloj-ayuda/g) || []).length === 1 && /no-imprimir" data-reloj-ayuda="1"/.test(h))
        && /el cuarto más alto arranca en 19,0 % de finales tempranos y en 19,7 % de tardíos/.test(P.relojAyuda(pR.liga.reloj)));
    const mh = P.relojMetodologiaHtml();
    check('el texto del Glosario: tres franjas, criterios, familias, etiquetas, arquetipos y el aviso',
      /Las tres franjas del reloj/.test(mh) && (mh.match(/<li /g) || []).length === 3 + M.criterios.length + 7 + 4 + 9 + 9 + 20 && M.criterios.length === 10, (mh.match(/<li /g) || []).length);
    const GUIr = require('./js/sgadd-glosarioui.js');
    const uiPrevia = global.SGADD_UI;
    if (!uiPrevia) global.SGADD_UI = { escJs: (v) => String(v) };
    const sinPbp = GUIr.html();
    global.SGADD_PBP = P;
    const conPbp = GUIr.html();
    delete global.SGADD_PBP;
    if (!uiPrevia) delete global.SGADD_UI;
    check('el Glosario muestra la metodología, y sin el módulo no pinta nada', /id="glosarioReloj"/.test(conPbp) && !/glosarioReloj/.test(sinPbp));
    const manual = fs.readFileSync(path.join(__dirname, 'MANUAL_ETIQUETADO_SGADD.html'), 'utf8');
    check('el manual vincula los perfiles por franja: las etiquetas de la franja media, la card Tiro y la conversión',
      ['Ejecutor del juego armado', 'Creador en el juego armado', 'Tira en el juego armado', 'La card Tiro de cada jugador', 'Paquetes de cuatro franjas']
        .every(x => fs.readFileSync(path.join(__dirname, 'MANUAL_ETIQUETADO_SGADD.html'), 'utf8').indexOf(x) !== -1));
    check('el manual de etiquetado se regeneró con las tres franjas', /5 · Reloj de posesión/.test(manual) && M.franjas.every(x => manual.indexOf(x.lectura) !== -1)
      && manual.indexOf('0-7 s') !== -1 && !/Su porción de finales en (15-20|21-24) s/.test(manual));

    /* ---- fuentes: dónde se monta ---- */
    const fuenteEq = fs.readFileSync(path.join(__dirname, 'js', 'sgadd-equipos.js'), 'utf8');
    const fuentePbp = fs.readFileSync(path.join(__dirname, 'js', 'sgadd-pbp.js'), 'utf8');
    check('la Personalidad ya no monta el reloj; la pestaña Mapa de tiro le pasa la identidad para sus cruces',
      !/equiposRelojPersonalidad/.test(fuenteEq) && /SGADD_PBP\.espacio\(e\.nombre, 'equipo', null, 'mapa', equiposIdentidadReloj\(idx, e\)\)/.test(fuenteEq)
        && /tipo === 'mapa' \? mapaCard\(paq, \{ propio: paqPropio, fijo: contexto === 'scouting', identidad: leerIdentidad\(nodo\) \}\)/.test(fuentePbp));
    const esp = P.espacio('BOCA', 'equipo', null, 'mapa', { PACE: { f: '78,4', p: 85 } });
    check('el lugar del mapa lleva la identidad escapada; el de quintetos no', /data-pbp-identidad="\{&quot;PACE&quot;/.test(esp)
      && !/data-pbp-identidad/.test(P.espacio('BOCA', 'equipo', null, 'quintetos', { PACE: {} })));
    check('al cambiar de vista o al pintar los tiros, un mapa de franja sigue en su franja',
      /const fr = caja\.getAttribute\('data-pbp-franja'\);[\s\S]{0,200}paqFranja\(entrada, op\.franja\)/.test(fuentePbp)
        && /paqFranja\(paq, Number\(fr\)\) \|\| paq/.test(fuentePbp));
    const cssIdx = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    check('las piezas del reloj no se parten en el papel y las barras tienen su variante de papel',
      /@media print \{ \.pbp-reloj-pieza \{ break-inside: avoid; page-break-inside: avoid; \} \}/.test(cssIdx)
        && /body \.reloj-barra-relleno \{ background: var\(--acento-papel/.test(cssIdx));

    /* ---- EL PERFIL TÁCTICO POR TRAMO (2026-10-19) · 1x1 / 5x5, rebote, pérdida y defensa ----
       Los cortes son los MEDIDOS en la Conferencia Norte 25/26 (punto 130). */
    const cT = (min, p25, p50, p75, p90, max, n) => ({ n, min, p25, p50, p75, p90, max });
    const tramosNorte = (n) => ({
      temprana: { pps: cT(0.5, 1.07, 1.25, 1.42, 1.55, 2, n), ast: cT(0, 36.4, 50, 66.7, 78.6, 100, n), freq: cT(5, 16.3, 21.6, 25, 28.2, 60, n),
        prod: cT(0, 0.32, 0.68, 1.16, 1.67, 4, n), ro: cT(0, 0, 0.07, 0.13, 0.23, 1, n), rd: cT(0, 0.11, 0.22, 0.35, 0.5, 2, n),
        rec: cT(0, 0.06, 0.13, 0.21, 0.32, 1, n), tap: cT(0, 0, 0, 0, 0.03, 1, n), per: cT(0, 0.1, 0.2, 0.36, 0.48, 2, n) },
      media: { pps: cT(0.4, 0.95, 1.07, 1.18, 1.3, 2, n), ast: cT(0, 40, 53, 71.6, 83.3, 100, n), freq: cT(20, 41, 46.5, 51.6, 56.5, 80, n),
        prod: cT(0, 0.67, 1.39, 2.06, 2.83, 6, n), ro: cT(0, 0.09, 0.17, 0.32, 0.53, 2, n), rd: cT(0, 0.45, 0.72, 1.17, 1.47, 4, n),
        rec: cT(0, 0.11, 0.23, 0.38, 0.52, 2, n), tap: cT(0, 0, 0, 0, 0.03, 1, n), per: cT(0, 0.21, 0.39, 0.6, 0.8, 3, n) },
      tardia: { pps: cT(0.3, 0.79, 0.91, 1.04, 1.17, 2, n), ast: cT(0, 40, 53.6, 66.7, 80, 100, n), freq: cT(5, 26.3, 31.7, 37.6, 43.9, 70, n),
        prod: cT(0, 0.4, 0.81, 1.25, 1.52, 4, n), ro: cT(0, 0.07, 0.16, 0.28, 0.45, 2, n), rd: cT(0, 0.29, 0.63, 0.91, 1.19, 3, n),
        rec: cT(0, 0.03, 0.13, 0.19, 0.28, 1, n), tap: cT(0, 0, 0, 0, 0.03, 1, n), per: cT(0, 0.07, 0.17, 0.28, 0.45, 2, n) },
    });
    const conTramos = (n, eJ1, pj) => {
      const p = conReloj();
      p.liga.reloj = Object.assign({}, p.liga.reloj, { cortes: Object.assign({}, p.liga.reloj.cortes, { tramos: tramosNorte(n) }) });
      /* J1: temprano 12 canastas y 2 asistencias (1x1, 1,50 por tiro → verde); medio 4 canastas y 9 asistencias
         en 10 tiros a 0,80 (5x5, rojo); tardío 6 canastas a 1,30 (1x1, verde) y 6 rebotes defensivos sobre el
         reloj del rival. */
      p.reloj.jugadores['1'] = Object.assign(reloj3([[20, 12, 30, 6, 10, 1], [10, 4, 8, 1, 2, 0], [10, 6, 13, 3, 1, 2]]),
        { e: eJ1 || [[2, 1, 3, 4, 0], [9, 0, 2, 1, 0], [0, 0, 6, 0, 0]], pj: pj == null ? 4 : pj });
      return p;
    };
    const pT = conTramos(159);
    const rT = P.relojTramosJugador(pT, '1');
    const idsT = rT.etiquetas.map(x => x.id).join();
    check('las etiquetas por tramo: 1x1 temprano, 5x5 en el set, 1x1 y reboteador defensivo al final del reloj', idsT === 'temprana-1x1,media-5x5,tardia-1x1,tardia-rd', rT.etiquetas);
    check('con la taxonomía pedida', rT.etiquetas.map(x => x.label).join(' | ') === 'Ataque Rápido · Finalizador 1x1 | Set Ofensivo · Facilitador 5x5 | Clutch · Definidor 1x1 | Clutch Defensivo · Reboteador Defensivo');
    check('el semáforo es su puntos por tiro contra los percentiles de la franja: verde > P75, rojo < P25, defensa neutra',
      rT.etiquetas.map(x => x.tono).join() === 'verde,rojo,verde,neutro' && rT.filas[2].tono === 'verde', rT.etiquetas.map(x => x.tono));
    check('con 4 recuperos (menos de 5 acciones) no hay recuperador, aunque la tasa sea alta', !/rec/.test(idsT));
    check('sin muestra chica en la competencia no lleva ~', rT.chica === false && rT.etiquetas.every(x => !x.chica));
    const dosPj = P.relojTramosJugador(conTramos(159, null, 2), '1');
    check('con menos de 3 partidos no hay etiquetas, pero sí la tabla', dosPj.etiquetas.length === 0 && dosPj.filas.length === 3);
    const chicaT = P.relojTramosJugador(conTramos(12), '1');
    check('con menos de 20 jugadores con muestra en la competencia, todas salen con ~ y sin semáforo',
      chicaT.chica && chicaT.etiquetas.length > 0 && chicaT.etiquetas.every(x => x.chica && x.tono === 'neutro')
        && /~ Ataque Rápido/.test(P.relojTramosChips(chicaT.etiquetas)), chicaT.etiquetas);
    /* CAMBIAR DE COMPETENCIA cambia la lectura: el mismo jugador, otra vara. */
    const otraLiga = conTramos(159);
    otraLiga.liga.reloj.cortes.tramos.temprana.prod = cT(0, 2, 3, 4, 5, 9, 159);
    otraLiga.liga.reloj.cortes.tramos.temprana.pps = cT(0.8, 1.6, 1.7, 1.8, 1.9, 2.5, 159);
    const rO = P.relojTramosJugador(otraLiga, '1');
    check('en otra competencia, el mismo jugador pierde el 1x1 temprano y su puntos por tiro pasa a rojo',
      !rO.etiquetas.some(x => x.id === 'temprana-1x1') && rO.filas[0].tono === 'rojo' && rT.filas[0].tono === 'verde');
    check('fuga por pérdida: solo en ataque rápido y en el set, nunca en clutch',
      P.ACCIONES_TRAMO.find(a => a.m === 'per').soloConFuga && P.TRAMOS_JUGADOR.map(t => t.fuga).join() === 'true,true,false');
    const hT = P.relojTramosHtml(pT, '1');
    check('la card del perfil por tramo: marca data-subcard, tabla por tramo y chips con su semáforo',
      /data-subcard="mapa\.reloj-tramos"/.test(hT) && (hT.match(/<tr>/g) || []).length === 4 && /tramo-chip tramo-verde/.test(hT) && /tramo-chip tramo-rojo/.test(hT));
    check('y va dentro del bloque del jugador, como sub-card hermana', /data-reloj-tramos="1"/.test(P.relojJugador(pT, '1')));
    const sinE = conReloj();
    check('un paquete sin las acciones por franja lo dice y no inventa etiquetas',
      P.relojTramosJugador(sinE, '1').disponible === false && /próxima subida/.test(P.relojTramosHtml(sinE, '1')));
    const nom = pT.jugadores && pT.jugadores['1'] ? pT.jugadores['1'].n : null;
    const adnT = nom ? P.relojTramosAdn(pT, nom) : '';
    check('las etiquetas se inyectan en el ADN del jugador', /Función por tramo del reloj/.test(adnT) && /Finalizador 1x1/.test(adnT) && /Reboteador Defensivo/.test(adnT), adnT);
    check('el ADN deja su lugar solo con la capa, y la carga fallida no deja cartel',
      /SGADD_PBP\.espacioTramos\(j\['NOMBRES'\], j\['EQUIPO'\]\)/.test(fs.readFileSync(path.join(__dirname, 'js/sgadd-jugadores.js'), 'utf8'))
        && /if \(nombreTramos(?: \|\| tipo === '[a-z-]+')*\) \{ nodo\.innerHTML = ''; return; \}/.test(fuentePbp));
    check('el semáforo tiene su variante de papel', /\.tramo-verde \{/.test(cssIdx) && /body \.tramo-verde/.test(cssIdx));
    const MT = P.METODOLOGIA_RELOJ.tramos;
    check('la metodología lista las 20 etiquetas por tramo con su regla', MT.reduce((a, t) => a + t.etiquetas.length, 0) === 20
      && MT.every(t => t.etiquetas.every(e => e.regla)) && P.METODOLOGIA_RELOJ.criterios.some(c => c.id === 'tramos'));
    const manualT = fs.readFileSync(path.join(__dirname, 'MANUAL_ETIQUETADO_SGADD.html'), 'utf8');
    check('y el manual de etiquetado también', /El perfil táctico por tramo del jugador/.test(manualT) && /Set Ofensivo · Facilitador 5x5/.test(manualT) && /Clutch Defensivo · Taponador/.test(manualT));
  }

  console.log('\n' + '═'.repeat(70) + '\n' + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
