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

  /* =================================================================== */
  titulo('5 · EL PAQUETE @2 · secciones, mapa vs liga, táctico y cruce de scouting');
  const zona = (z, i, c, ppt) => ({ zona: z, i, c, pct: Math.round(1000 * c / i) / 10, ppt });
  const fam = (i, c, ppt) => ({ i, c, pct: Math.round(1000 * c / i) / 10, ppt });
  function paquete2(equipo, tiro) {
    const p = paquete(equipo);
    p.esquema = 'motorstats-ingestion/analitica-pbp-web@2';
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
    const t = tiro || {};
    p.tiros.detalle = {
      favor: { zonas: [zona('Z1', 800, 459, 1.148), zona('Z12', 300, 110, 1.10)],
        familias: { aro: fam(800, 459, t.favorAro || 1.148), tripleFrontal: fam(300, 110, t.favorTF || 1.10) },
        hex: [[0, 1, 50, 30, 60], [1, 1, 10, 2, 4], [9, 9, 1, 0, 0]] },
      contra: { zonas: [zona('Z1', 700, 400, 1.143)],
        familias: { aro: fam(700, 400, t.contraAro || 1.143), tripleFrontal: fam(250, 80, t.contraTF || 0.96) },
        hex: [[0, 1, 40, 20, 40]] },
      jugadores: [{ id: '2', i: 120, c: 60, ppt: 1.1, dist: 4, zonas: [zona('Z1', 100, 55, 1.1)], familias: {}, hex: [[0, 1, 80, 44, 88]] }],
    };
    p.liga = { total: fam(30000, 13700, 1.05), zonas: [zona('Z1', 13000, 7900, 1.215), zona('Z12', 4000, 1300, 0.975)],
      familias: { aro: fam(13000, 7900, 1.215), tripleFrontal: fam(4000, 1300, 1.0) },
      hex: [[0, 1, 900, 540, 1.2, 'aro'], [1, 1, 12, 5, 0.8, 'tripleFrontal']] };
    return p;
  }
  const p2 = paquete2('JUJUY BASQUET');
  const h2 = P.html(p2);
  check('las secciones son <details> colapsables, y Quintetos y Clutch están entre ellas',
    /<details class="pbp-detalle mt-3" data-pbp-seccion="quintetos" open>/.test(h2) && /data-pbp-seccion="clutch" open/.test(h2) && /<summary class="pbp-resumen/.test(h2));
  check('las secciones nuevas arrancan cerradas (táctico, rotaciones, cuartos): la card no se vuelve un scroll de 4 m',
    /data-pbp-seccion="tactico">/.test(h2) && /data-pbp-seccion="rotaciones">/.test(h2) && /data-pbp-seccion="cuartos">/.test(h2));
  check('G-P y MIN no se parten: toda celda numérica lleva whitespace-nowrap', /whitespace-nowrap">8-7</.test(h2) && !/<td class="px-2 py-1 font-mono text-xs">/.test(h2));
  check('sin undefined ni NaN en el HTML', !/undefined|NaN/.test(h2));
  check('escapa lo del paquete nuevo también (rival de los últimos 5)', !/<i>SUARDI/.test(h2) && /&lt;i&gt;SUARDI/.test(h2));

  check('colorDelta: igual a la liga es gris, +0,3 verde pleno, −0,3 rojo pleno, sin dato gris',
    P.colorDelta(0) === '#6b7280' && P.colorDelta(0.3) === '#16a34a' && P.colorDelta(-0.5) === '#dc2626' && P.colorDelta(null) === '#6b7280');
  const vHex = P.varaHex(p2, 0, 1), vFam = P.varaHex(p2, 1, 1), vTot = P.varaHex(p2, 7, 7);
  check('la vara del hexágono es la liga EN ESE LUGAR si tiró 15 o más', vHex.ppt === 1.2 && /900 tiros/.test(vHex.fuente));
  check('con menos de 15, su familia de tiro dominante (y lo dice)', vFam.ppt === 1.0 && /triple frontal/.test(vFam.fuente));
  check('y sin hexágono en la liga, la liga total', vTot.ppt === 1.05);
  check('el color compara PUNTOS POR TIRO, no %: 60 pts en 50 tiros (1,20) contra 1,20 sale gris',
    /class="pbp-hex"[^>]*style="fill:#6b7280"[^>]*data-pbp-tip="30\/50/.test(P.mapa(p2)));
  check('un hexágono fuera de la media cancha no se dibuja', (P.mapa(p2).match(/class="pbp-hex"/g) || []).length === 2);

  const mapa2 = P.mapa(p2);
  const filasZona = (mapa2.match(/<tr class="pbp-fila-zona[^>]*data-pbp-zona="(Z\d+)"[^>]*tabindex="0"/g) || []).length;
  check('cada fila de zona se puede enfocar y apunta a su polígono en la cancha',
    filasZona === 2 && /<polygon class="pbp-zona"[^>]*data-pbp-zona="Z1"/.test(mapa2) && /<polygon class="pbp-zona"[^>]*data-pbp-zona="Z12"/.test(mapa2));
  check('las 14 zonas de la plataforma están embebidas', Object.keys(P.ZONAS_GEO).length === 14);
  const cx = (z) => P.ZONAS_GEO[z].reduce((a, pt) => a + (15 - pt[1]) * 10, 0) / P.ZONAS_GEO[z].length;
  check('la izquierda del ATACANTE queda a la izquierda del dibujo (Z10 esquina izq. < 75 < Z14 esquina der.)', cx('Z10') < 40 && cx('Z14') > 110 && Math.abs(cx('Z1') - 75) < 5);
  check('vs liga por zona: Z12 1,10 contra 0,975 → +0,13', /data-pbp-zona="Z12"[\s\S]*?\+0,13/.test(mapa2));
  const mz = P.mapa(p2, { vista: 'zonas', metrica: 'frecuencia' });
  check('vista zonas + frecuencia: sin hexágonos, zonas pintadas con el acento del club', !/pbp-hex/.test(mz) && /data-pbp-zona="Z1" style="fill:var\(--acento/.test(mz)
    && /data-pbp-vista="zonas" data-pbp-metrica="frecuencia"/.test(mz) && /aria-pressed="true">Zonas/.test(mz));
  check('lo que le tiran (contra) es otro mapa', /data-pbp-sujeto="contra"/.test(h2) && /data-pbp-seccion="mapa-contra"/.test(h2));

  const lt = P.lecturaTactica(p2);
  check('táctico: el problema se decide contra SUS quintetos (110 de ORTG, 100 de DRTG)',
    lt.criticos[0].problema === 'defensa' && lt.criticos[1].problema === 'ataque');
  check('y sugiere dúos y tríos solo con diferencial positivo, del mejor al peor',
    JSON.stringify(lt.probar.map(x => x.ids.join(''))) === '["15","123"]');
  const hRot = P.html(p2).match(/<svg class="pbp-rotaciones[\s\S]*?<\/svg>/)[0];
  check('rotaciones: 40 minutos por jugador y afuera el que casi no juega', (hRot.match(/<rect /g) || []).length === 40 && /data-pbp-fila="Stehli"/.test(hRot));
  check('cuartos: el suplementario se rotula y un dato ausente sale como raya', /Supl\./.test(h2) && /18-0/.test(h2) && /3\.º 02:08 → 4\.º 05:39/.test(h2));

  const d2 = P.diagnostico(p2);
  check('diagnóstico: ataque y defensa son puntos por tiro sobre la liga, por familia',
    Math.abs(d2.ejes.find(e => e.id === 'tripleFrontal').ataque - 1.10) < 1e-9 && Math.abs(d2.ejes.find(e => e.id === 'aro').defensa - 1.143 / 1.215) < 1e-9);
  check('zonas a explotar exigen volumen y 5 % sobre la liga', d2.explotar.map(e => e.id).join() === 'tripleFrontal' && d2.liberadas.length === 0);
  const rival = paquete2('AMANCAY (LR)', { contraTF: 1.2, favorAro: 1.3 });
  const cz = P.cruceZonas(rival, p2);
  check('cruce: ATACAR donde lo nuestro rinde y el rival concede', cz.atacar.map(x => x.id).join() === 'tripleFrontal' && cz.atacar[0].propio === 1.1 && cz.atacar[0].rival === 1.2);
  check('cruce: CERRAR donde el rival rinde y nosotros concedemos (y no donde no concedemos)', cz.cerrar.length === 0);
  const rival2 = paquete2('AMANCAY (LR)', { favorAro: 1.3 });
  const p2b = paquete2('JUJUY BASQUET', { contraAro: 1.25 });
  check('…y sí cuando las dos cosas coinciden', P.cruceZonas(rival2, p2b).cerrar.map(x => x.id).join() === 'aro');
  const hScout = P.html(rival, { contexto: 'scouting', propio: p2 });
  check('en scouting el diagnóstico sale abierto y con el cruce nombrando a los dos equipos',
    /data-pbp-seccion="diagnostico" open/.test(hScout) && /Atacar ahí · JUJUY BASQUET rinde y AMANCAY \(LR\) concede/.test(hScout));

  const hj = P.jugador(p2, 'ibarra,  santiágo');
  check('mapa del jugador: se encuentra por nombre normalizado y dibuja SUS tiros', /data-pbp-sujeto="2"/.test(hj) && /60\/120/.test(hj));
  check('menos de 15 tiros no se dibuja y lo dice', /Menos de 15 tiros/.test(P.jugador(p2, 'CONTI, BRUNO')) && /todavía no está cargado/.test(P.jugador(paquete('X'), 'A')));
  check('un paquete @1 sigue pintándose, sin las secciones que no tiene', !/data-pbp-seccion="tactico"/.test(h) && /data-pbp-seccion="clutch"/.test(h));

  /* La interactividad, sobre un DOM mínimo: la fila y el polígono se
     encienden juntos, y un toque fija el resaltado hasta el siguiente. */
  const hand = {};
  const clases = { Z1: new Set(), Z12: new Set() };
  const el = (z) => ({ classList: { toggle: (c, on) => (on ? clases[z].add(c) : clases[z].delete(c)) } });
  const caja = { attrs: {}, getAttribute(k) { return this.attrs[k] || null; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    querySelectorAll: (sel) => { const z = sel.match(/"(Z\d+)"/)[1]; return [el(z), el(z)]; } };
  const fila = (z) => ({ getAttribute: () => z, closest: (s) => (s === '.pbp-mapa-caja' ? caja : fila(z)) });
  const nodo = { attrs: {}, getAttribute(k) { return this.attrs[k] || null; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener: (t, f) => { hand[t] = f; } };
  const ev = (z) => ({ target: { closest: (s) => (s === '[data-pbp-zona]' ? fila(z) : null) } });
  P.activar(nodo);
  hand.mouseover(ev('Z1'));
  check('hover en una zona la enciende en la tabla Y en la cancha', clases.Z1.has('pbp-activa'));
  hand.mouseout(ev('Z1'));
  check('y al salir se apaga', !clases.Z1.has('pbp-activa'));
  hand.click(ev('Z12'));
  hand.mouseout(ev('Z12'));
  check('un toque la FIJA: salir con el mouse no la apaga', clases.Z12.has('pbp-activa') && caja.attrs['data-pbp-fija'] === 'Z12');
  hand.click(ev('Z1'));
  check('tocar otra mueve el resaltado fijo', clases.Z1.has('pbp-activa') && !clases.Z12.has('pbp-activa'));
  hand.click(ev('Z1'));
  check('y tocar la misma lo suelta', !caja.attrs['data-pbp-fija']);
  P.activar(nodo);
  check('activar() engancha una sola vez por bloque', nodo.attrs['data-pbp-activo'] === '1');

  const cardRival2 = vm.runInContext('scoutBloquePbp({ claveRival: "A", local: { clave: "A", nombre: "AMANCAY (LR)" }, visitante: { clave: "J", nombre: "JUJUY BASQUET" } })', conCapa);
  check('la card de scouting pasa el OTRO lado del cruce para el diagnóstico', /data-pbp-propio="JUJUY BASQUET"/.test(cardRival2));
  const srcJug = fs.readFileSync('./js/sgadd-jugadores.js', 'utf8');
  check('Jugadores · Tiro: el mapa del jugador se pide con la capa y se monta después de pintar',
    /function jugadoresTabTiro[\s\S]*?jugadoresBloqueMapaPbp\(j\)/.test(srcJug) && /SGADD_PBP\.activa\(\)[\s\S]{0,80}SGADD_PBP\.espacioJugador|espacioJugador\(j\['NOMBRES'\], j\['EQUIPO'\]\)/.test(srcJug)
    && /function jugadoresPintar[\s\S]*?SGADD_PBP\.montarPendientes\(root\)/.test(srcJug));
  const srcPbp = fs.readFileSync('./js/sgadd-pbp.js', 'utf8');
  check('al imprimir se abren las secciones cerradas y después se devuelven', /beforeprint[\s\S]*details:not\(\[open\]\)/.test(srcPbp) && /afterprint/.test(srcPbp));
  const css = fs.readFileSync('./index.html', 'utf8');
  check('el resaltado vive en el <style> (nodos inyectados) y el hover solo en pantalla',
    /\.pbp-zona\.pbp-activa\s*\{/.test(css) && /tr\.pbp-fila-zona\.pbp-activa > td\s*\{/.test(css) && /@media screen \{\s*\.pbp-toggle:hover/.test(css));
  const cli = fs.readFileSync('./server/bin/pbp.js', 'utf8');
  check('el CLI de subida acepta @1 y @2, y no los mezcla', /analitica-pbp-web@1', 'motorstats-ingestion\/analitica-pbp-web@2'/.test(cli) && /esquema distinto del índice/.test(cli));

  console.log('\n' + '═'.repeat(70) + '\n' + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
