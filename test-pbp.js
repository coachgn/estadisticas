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
      'boca-sin': { label: 'LNB sin capa', sheetId: 'SHEETLIGAX00000000000000', torneo: 'liga-x', zona: 'unica' },
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
  x = await get(tokBoca, 'boca', 'boca-sin', { equipo: 'BOCA' });
  check('el permiso no cambia: sin la capa en SU categoría, 403 SIN_CAPA', x.status === 403 && x.body.codigo === 'SIN_CAPA');
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
  check('Equipos: SIN la capa la pestaña no existe (ni gris)', !/"pbp"/.test(ids(sinCapa)) && /"partidos"/.test(ids(sinCapa)));
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

  /* ---- jugador */
  const dj = P.diagnosticoJugador(p3, '2');
  check('jugador: picos, puntos a explotar, criterio de ajuste y puntos de fuga por zona',
    dj.picos.map(f => f.zona).join() === 'Z11' && dj.explotar.map(f => f.zona).join() === 'Z3' && dj.ajuste.map(f => f.zona).join() === 'Z1' && dj.fuga.map(f => f.zona).join() === 'Z12', dj);
  check('con volumen por partido (intentos / PJ) y acierto contra la liga', dj.pj === 20 && dj.picos[0].vol === 2 && Math.abs(dj.picos[0].dCrudo - (0.45 - 0.33)) < 1e-9);
  const hj = P.jugador(p3, 'ibarra,  santiágo');
  check('ficha: se encuentra por nombre normalizado, dibuja SUS tiros sin perspectiva y trae el diagnóstico',
    /data-pbp-sujeto="2"/.test(hj) && !/Lo que le tiran/.test(hj) && /Picos de rendimiento/.test(hj) && /Puntos de fuga/.test(hj) && /intentos x PJ/.test(hj) && /20 PJ con minutos/.test(hj));
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
  check('Equipos: «Mapa de tiro» es su propia pestaña, solo con la capa', /"pbp-tiro"/.test(idsTiro(conCapa)) && !/"pbp-tiro"/.test(idsTiro(sinCapa))
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
    /mapaCard\(paq, \{ propio: paqPropio, fijo: contexto === 'scouting' \}\)/.test(srcPbp) && /html\(paq, \{ contexto: contexto \}\)/.test(srcPbp));
  const ordenTabs = JSON.parse(vm.runInContext('JSON.stringify(equiposTabsOfrecidas().map(t => t.id))', conCapa));
  check('Equipos: Partidos es la ÚLTIMA pestaña, después del Mapa de tiro',
    ordenTabs[ordenTabs.length - 1] === 'partidos' && ordenTabs[ordenTabs.length - 2] === 'pbp-tiro', ordenTabs);
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

  console.log('\n' + '═'.repeat(70) + '\n' + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
