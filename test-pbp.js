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
  check('NET por posesión se muestra ANTES que NET por PLAYS', iNetPos > 0 && iNetPlays > iNetPos);
  check('la muestra corta se marca con ~ y atenuada, no se borra', /~7,2/.test(h) && /opacity-50 fila-tenue/.test(h));
  check('+8,5 por posesión en verde de +/-', /mm-pos">\+8,5/.test(h));
  check('clutch: partidos, récord y la línea del jugador con sus usos', /29<\/b> partidos/.test(h) && /15-14/.test(h) && /65,4/.test(h) && /27,6 %/.test(h));
  check('mapa: una celda por celda del paquete, sobre la media cancha', (h.match(/<rect x="\d+" y="\d+" width="10" height="10"/g) || []).length === 3 && /<svg class="pbp-mapa/.test(h));
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

  console.log('\n' + '═'.repeat(70) + '\n' + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
