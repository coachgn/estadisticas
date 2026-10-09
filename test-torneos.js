/* =====================================================================
   test-torneos.js · los torneos sin cliente y la estructura multizona
   (punto 67): la Liga Argentina 2026-27 con dos conferencias, la Zona C de
   La Plata, el enganche de un cliente a su zona y que nada de esto rompa
   a los clientes de una sola zona.

     node test-torneos.js
   ===================================================================== */
'use strict';

const fs = require('fs');
const vm = require('vm');
const TORNEOS = require('./server/lib/torneos.js');
const mutar = require('./server/lib/catalogo-mutar.js');
const catalogo = require('./server/lib/catalogo.js');
const CORE = require('./js/sgadd-core.js');
const UI = require('./js/sgadd-torneos.js');

let ok = 0, mal = 0;
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (detalle !== undefined ? '  → ' + JSON.stringify(detalle) : '')); }
}
function seccion(t) { console.log('\n' + t); }

const LA = JSON.parse(fs.readFileSync('torneos/liga-argentina-2026-27.json', 'utf8'));
const ZC = JSON.parse(fs.readFileSync('torneos/zona-c-la-plata-2026.json', 'utf8'));
const LIBRO_A = 'A'.repeat(30) + 'libroNorte1';
const LIBRO_B = 'B'.repeat(30) + 'libroSur222';
const LIBRO_ZC = 'C'.repeat(30) + 'libroZonaC3';
const LIBRO_DEP = 'D'.repeat(30) + 'libroDep444';

/* Un catálogo con dos clientes reales de forma (Jujuy y DEPORTIVO). */
function base() {
  return {
    jujuy: { nombre: 'Jujuy Basquet', liga: 'liga-argentina', equipoPropio: 'JUJUY BASQUET', plan: 'ORO', estado: 'prueba',
      categorias: { 'jujuy-primera': { label: 'Conferencia Norte', sheetId: 'J'.repeat(40) } } },
    deportivo: { nombre: 'Deportivo La Plata', liga: 'la-plata', equipoPropio: 'DEPORTIVO LA PLATA', plan: 'PLATA',
      categorias: { 'deportivo-primera': { label: 'Primera 2026', sheetId: LIBRO_DEP } } },
  };
}
const ap = (cat, accion, d) => mutar.aplicar(cat, accion, d, catalogo.validar);

/* =====================================================================
   1 · El archivo del torneo · lo que dicen las notas oficiales
   ===================================================================== */
seccion('1 · Liga Argentina 2026-27 · el archivo');
{
  const n = LA.zonas.norte.equipos, s = LA.zonas.sur.equipos;
  check('dos conferencias de 17', n.length === 17 && s.length === 17);
  check('Jujuy en la Norte', n.some(e => e.nombre === 'JUJUY BASQUET'));
  check('Barrio Jardín en la Norte (nota 52708)', n.some(e => e.nombre === 'BARRIO JARDIN (T)'));
  check('Gimnasia LP y River en la Sur', ['GIMNASIA (LP)', 'RIVER'].every(x => s.some(e => e.nombre === x)));
  /* Los 34 con id desde el 2026-10-09: UNION (SF) y RACING (A) eran
     provisorios hasta que el fixture los listó. La ingesta filtra la
     conferencia por estos ids (motorstats-ingestion/src/conferencia.js):
     uno sin id deja sus partidos afuera. */
  check('los 34 equipos con id de Gesdeportiva', n.concat(s).filter(e => Number.isInteger(e.id)).length === 34);
  check('ninguno queda provisorio', n.concat(s).every(e => e.id && !e.provisorio));
  check('ningún id repetido', new Set(n.concat(s).filter(e => e.id).map(e => e.id)).size === 34);
  const claves = n.concat(s).map(e => CORE.claveEquipo(e.nombre));
  check('ninguna clave repetida entre zonas', new Set(claves).size === 34);
  check('EL SHEETID NO VA EN EL ARCHIVO: el repo es público',
    [LA, ZC].every(d => !/"sheetId"\s*:|docs\.google\.com\/spreadsheets|[A-Za-z0-9_-]{40,}/.test(JSON.stringify(Object.assign({}, d, { fuente: null })))));

  /* El calendario anunciado: todo partido es DENTRO de su conferencia, que
     es lo que permitió inferir las zonas antes de que se publicaran. */
  const zonaDe = {};
  Object.keys(LA.zonas).forEach(z => LA.zonas[z].equipos.forEach(e => { zonaDe[e.nombre] = z; }));
  const cal = LA.calendario.partidos;
  check('el calendario anunciado nombra solo equipos del torneo', cal.every(p => zonaDe[p.local] && zonaDe[p.visitante]), cal.find(p => !zonaDe[p.local] || !zonaDe[p.visitante]));
  check('y todos sus partidos son intra-conferencia', cal.every(p => zonaDe[p.local] === zonaDe[p.visitante] && zonaDe[p.local] === p.zona));
  check('el calendario dice que es PARCIAL', LA.calendario.parcial === true);
  check('la marca es la del manual LAB (Zafiro)', LA.marca.acento === '#094aa8');
  check('ningún alias apunta a dos equipos', (() => {
    const v = {}; let dup = false;
    n.concat(s).forEach(e => (e.alias || []).forEach(a => { if (v[a]) dup = true; v[a] = 1; }));
    return !dup;
  })());
}

seccion('1 bis · Zona C · el archivo');
{
  const e = ZC.zonas.c.equipos;
  check('11 equipos, los del libro', e.length === 11);
  check("RECONQUISTA 'B'- MM (sin espacio) normaliza igual", CORE.claveEquipo("RECONQUISTA 'B'- MM") === CORE.claveEquipo("RECONQUISTA 'B' - MM"));
  check('sin zonas de tabla inventadas: el formato no declara puestos',
    TORNEOS.competenciaDesdeFormato(ZC.formato, null) === null);
}

/* =====================================================================
   2 · Alta de un torneo
   ===================================================================== */
seccion('2 · alta del torneo');
let cat;
{
  const r = ap(base(), 'torneo', TORNEOS.intencionDesdeArchivo(LA));
  check('la Liga Argentina se da de alta SIN libro todavía', r.ok, r.motivo);
  cat = r.catalogo;
  const t = cat['liga-argentina-2026-27'];
  check('es una entrada tipo torneo, sin plan ni equipo propio', t.tipo === 'torneo' && !t.plan && !t.equipoPropio);
  check('una categoría por zona', Object.keys(t.categorias).length === 2
    && t.categorias['lab-2026-27-norte'].zona === 'norte' && t.categorias['lab-2026-27-sur'].zona === 'sur');
  check('cada zona con sus 17 equipos normalizados con clave',
    t.categorias['lab-2026-27-norte'].equipos.length === 17
    && t.categorias['lab-2026-27-norte'].equipos.every(e => e.clave === CORE.claveEquipo(e.nombre)));
  check('las zonas nacen sin libro', !t.categorias['lab-2026-27-norte'].sheetId);
  const comp = t.competencia && t.competencia.formatos && t.competencia.formatos['regular-17'];
  check('las zonas de tabla salen del formato: 1-4 directos y 5-12 reclasificación',
    comp && comp.zonas.length === 2 && comp.zonas[0].desde === 1 && comp.zonas[0].hasta === 4
    && comp.zonas[1].desde === 5 && comp.zonas[1].hasta === 12, comp);
  check('SIN descenso: el reglamento no lo publicó', comp && !comp.zonas.some(z => z.tono === 'peligro'));
  check('equiposEsperados = 17 por conferencia', comp && comp.equiposEsperados === 17);
  check('los clientes no se tocaron', JSON.stringify(cat.jujuy) === JSON.stringify(base().jujuy));

  const r2 = ap(cat, 'torneo', TORNEOS.intencionDesdeArchivo(ZC, { c: LIBRO_ZC }));
  check('la Zona C se da de alta con su libro', r2.ok, r2.motivo);
  cat = r2.catalogo;
  check('una zona única, con libro', cat['zona-c-la-plata-2026'].categorias['zona-c-primera'].sheetId === LIBRO_ZC);
  check('y sin zonas de tabla inventadas', !cat['zona-c-la-plata-2026'].competencia);
}

seccion('2 bis · guards del alta');
{
  const d = TORNEOS.intencionDesdeArchivo(LA);
  const choca = ap(base(), 'torneo', Object.assign({}, d, { club: 'jujuy' }));
  check('un torneo no puede tomar el id de un cliente', !choca.ok && /ya es un cliente/.test(choca.motivo), choca.motivo);

  const dup = JSON.parse(JSON.stringify(d));
  dup.zonas.sur.equipos.push({ id: null, nombre: 'JUJUY BASQUET' });
  const rd = ap(base(), 'torneo', dup);
  check('un equipo en dos zonas se RECHAZA', !rd.ok && /repetidos entre zonas/.test(rd.motivo), rd.motivo);

  const idDup = JSON.parse(JSON.stringify(d));
  idDup.zonas.sur.equipos[0].id = 112674;   // el id de Jujuy
  const ri = ap(base(), 'torneo', idDup);
  check('un id de Gesdeportiva repetido también', !ri.ok && /112674/.test(ri.motivo), ri.motivo);

  const url = JSON.parse(JSON.stringify(d));
  url.zonas.norte.sheetId = 'https://docs.google.com/spreadsheets/d/x/edit';
  const ru = ap(base(), 'torneo', url);
  check('una URL entera en lugar del id se rechaza', !ru.ok && /forma de id/.test(ru.motivo), ru.motivo);

  const sinZonas = ap(base(), 'torneo', { club: 'vacio', nombre: 'Vacío' });
  check('un torneo nuevo sin zonas no se da de alta', !sinZonas.ok);

  ['pausar', 'cambiar_plan', 'cambiar_equipo', 'renovar', 'alta', 'informe_entregado'].forEach((a) => {
    const r = ap(cat, a, { club: 'liga-argentina-2026-27', categoria: 'lab-2026-27-norte', plan: 'ORO',
      equipoPropio: 'X', vence: '2099-01-01', label: 'x', sheetId: LIBRO_A, capas: 'pbp' });
    check('«' + a + '» sobre un torneo se rechaza: es una acción de clientes', !r.ok && /es un torneo/.test(r.motivo), r.motivo);
  });

  /* LA CAPA DE LABORATORIO SÍ va sobre un torneo (punto 94): es un dato
     habilitado, no un campo comercial, y un torneo sin clientes la necesita
     para que el panel muestre sus tiros. Solo toca SU zona. */
  const lab = ap(cat, 'cambiar_laboratorio', { club: 'liga-argentina-2026-27', categoria: 'lab-2026-27-norte', capas: 'pbp' });
  const zl = lab.ok ? lab.catalogo['liga-argentina-2026-27'].categorias : {};
  check('«cambiar_laboratorio» sobre un torneo se acepta', lab.ok, lab.motivo);
  check('y habilita la capa solo en esa zona', lab.ok && JSON.stringify(zl['lab-2026-27-norte'].laboratorio) === '["pbp"]'
    && Object.keys(zl).filter(s => s !== 'lab-2026-27-norte').every(s => !zl[s].laboratorio));
  check('sin dejar campos comerciales en el torneo', lab.ok
    && ['plan', 'estado', 'vence', 'equipoPropio'].every(c => zl['lab-2026-27-norte'][c] === undefined));
  const apagar = lab.ok ? ap(lab.catalogo, 'cambiar_laboratorio', { club: 'liga-argentina-2026-27', categoria: 'lab-2026-27-norte', capas: '' }) : { ok: false };
  check('vacío la apaga y la zona vuelve a ser la de antes', apagar.ok
    && JSON.stringify(apagar.catalogo['liga-argentina-2026-27'].categorias['lab-2026-27-norte'])
      === JSON.stringify(cat['liga-argentina-2026-27'].categorias['lab-2026-27-norte']));
}

/* =====================================================================
   3 · Enganchar a Jujuy a su zona
   ===================================================================== */
seccion('3 · vincular');
{
  const v = { club: 'jujuy', categoria: 'jujuy-lab-2026-27', torneo: 'liga-argentina-2026-27', zona: 'norte' };
  const r = ap(cat, 'vincular_torneo', v);
  check('Jujuy se engancha a la Norte con el equipo del club', r.ok && r.equipo.nombre === 'JUJUY BASQUET' && r.equipo.id === 112674, r.motivo);
  const k = r.catalogo.jujuy.categorias['jujuy-lab-2026-27'];
  check('su categoría declara torneo y zona', k.torneo === 'liga-argentina-2026-27' && k.zona === 'norte');
  check('queda sin libro (la zona todavía no tiene) y no rompe nada', r.ok && !k.sheetId && r.sinLibro);
  check('su equipo HEREDA del club (igual), no se duplica', !k.equipoPropio);
  check('la categoría vieja de Jujuy sigue intacta',
    JSON.stringify(r.catalogo.jujuy.categorias['jujuy-primera']) === JSON.stringify(cat.jujuy.categorias['jujuy-primera']));
  check('el nivel de la categoría es el del torneo', k.nivel === 'LIGA_ARGENTINA');

  const sur = ap(cat, 'vincular_torneo', Object.assign({}, v, { zona: 'sur' }));
  check('engancharlo a la Sur se RECHAZA y dice en qué zona juega', !sur.ok && /juega en la zona norte/.test(sur.motivo), sur.motivo);

  const porId = ap(cat, 'vincular_torneo', Object.assign({}, v, { equipo: '112674' }));
  check('el equipo se puede elegir por id de Gesdeportiva', porId.ok && porId.equipo.nombre === 'JUJUY BASQUET');
  const porAlias = ap(cat, 'vincular_torneo', Object.assign({}, v, { equipo: 'Jujuy Básquet' }));
  check('o por el nombre largo de la nota oficial', porAlias.ok);

  const aTorneo = ap(cat, 'vincular_torneo', Object.assign({}, v, { club: 'zona-c-la-plata-2026' }));
  check('un torneo no se engancha a otro torneo', !aTorneo.ok);

  cat = r.catalogo;
}

seccion('3 bis · la propagación del libro');
{
  const d = TORNEOS.intencionDesdeArchivo(LA, { norte: LIBRO_A });
  const r = ap(cat, 'torneo', d);
  check('la Norte estrena libro', r.ok && r.catalogo['liga-argentina-2026-27'].categorias['lab-2026-27-norte'].sheetId === LIBRO_A, r.motivo);
  check('y se PROPAGA a Jujuy, enganchado a esa zona',
    r.catalogo.jujuy.categorias['jujuy-lab-2026-27'].sheetId === LIBRO_A);
  check('la respuesta dice a quién llegó', r.aplicadoA.some(x => x.club === 'jujuy' && x.categoria === 'jujuy-lab-2026-27'));
  check('la Sur sigue sin libro', !r.catalogo['liga-argentina-2026-27'].categorias['lab-2026-27-sur'].sheetId);
  check('la otra categoría de Jujuy no recibe nada',
    r.catalogo.jujuy.categorias['jujuy-primera'].sheetId === 'J'.repeat(40));

  /* Editar los equipos sin mandar libro NO desconecta la zona. */
  const sinLibro = ap(r.catalogo, 'torneo', TORNEOS.intencionDesdeArchivo(LA));
  check('editar sin libro conserva el que la zona tiene', sinLibro.ok
    && sinLibro.catalogo['liga-argentina-2026-27'].categorias['lab-2026-27-norte'].sheetId === LIBRO_A);

  const baja = ap(r.catalogo, 'baja', { club: 'liga-argentina-2026-27', categoria: 'lab-2026-27-norte' });
  check('una zona con clientes enganchados no se da de baja', !baja.ok && /enganchados/.test(baja.motivo), baja.motivo);
  const bajaSur = ap(r.catalogo, 'baja', { club: 'liga-argentina-2026-27', categoria: 'lab-2026-27-sur' });
  check('una sin clientes sí', bajaSur.ok, bajaSur.motivo);

  /* Un cliente que se suma por `libroDe` a la zona queda enganchado igual. */
  const alta = ap(r.catalogo, 'alta', { club: 'salta', nombre: 'Salta Basket', equipoPropio: 'SALTA BASKET',
    categoria: 'salta-lab', label: 'LAB Norte', libroDe: 'liga-argentina-2026-27/lab-2026-27-norte' });
  check('un alta por libroDe de una zona deja declarado el enganche', alta.ok
    && alta.catalogo.salta.categorias['salta-lab'].torneo === 'liga-argentina-2026-27'
    && alta.catalogo.salta.categorias['salta-lab'].zona === 'norte', alta.motivo);
  check('y hereda las zonas de tabla del torneo', alta.ok && !!alta.catalogo.salta.competencia);
  cat = r.catalogo;
}

/* =====================================================================
   4 · Lo que ve el navegador
   ===================================================================== */
seccion('4 · publico()');
{
  const adm = catalogo.publico(cat, { admin: true, origen: 'kv' });
  const cli = catalogo.publico(cat, { club: 'jujuy', origen: 'kv' });
  check('el cliente NO recibe los torneos', !cli.some(c => c.tipo === 'torneo') && cli.length === 2);
  check('el admin sí, marcados como torneo', adm.filter(c => c.tipo === 'torneo').length === 2);
  check('los clientes van marcados como cliente', adm.find(c => c.id === 'jujuy').tipo === 'cliente');
  const t = adm.find(c => c.id === 'liga-argentina-2026-27');
  const norte = t.categorias.find(k => k.slug === 'lab-2026-27-norte');
  check('la zona trae su id y sus equipos con id y clave', norte.zona === 'norte' && norte.equipos.length === 17
    && norte.equipos.every(e => 'id' in e && e.clave));
  check('NINGÚN sheetId viaja', !/AAAAAAAAAAAAAAAAAAAA|JJJJJJJJJJJJJJJJJJJJ|DDDDDDDDDDDDDDDDDDDD/.test(JSON.stringify(adm)));
  check('el enganche de Jujuy viaja al admin', adm.find(c => c.id === 'jujuy').categorias.find(k => k.slug === 'jujuy-lab-2026-27').torneo === 'liga-argentina-2026-27');
  check('una zona no declara plan (no es un cliente que paga)', norte.planEfectivo === null);
  check('el formato del torneo viaja al admin', t.formato && t.formato.fases.length === 6);
  check('la validación del catálogo acepta el resultado', catalogo.validar(cat) === null);
  check('y rechaza equipos sin nombre', catalogo.validar({ x: { nombre: 'x', categorias: { y: { label: 'y', equipos: [{}] } } } }) !== null);
  check('y un formato que no es objeto', catalogo.validar({ x: { nombre: 'x', formato: 'a', categorias: { y: { label: 'y' } } } }) !== null);
  const r = catalogo.resolver(cat, 'jujuy', 'jujuy-lab-2026-27');
  check('resolver da el libro de la zona a la categoría del cliente', r.sheetId === LIBRO_A);
}

seccion('4 bis · un catálogo SIN torneos sigue igual');
{
  const b = base();
  const p = catalogo.publico(b, { admin: true, origen: 'kv' });
  check('los clientes se publican igual (más `tipo`)', p.length === 2 && p.every(c => c.tipo === 'cliente'));
  const alta = ap(b, 'alta', { club: 'nuevo', nombre: 'Nuevo', equipoPropio: 'NUEVO', categoria: 'nuevo-pri',
    label: 'Primera', libroDe: 'deportivo/deportivo-primera' });
  check('un alta por libroDe de un CLIENTE no inventa torneo ni zona', alta.ok
    && !alta.catalogo.nuevo.categorias['nuevo-pri'].torneo && !alta.catalogo.nuevo.categorias['nuevo-pri'].zona);
}

/* =====================================================================
   5 · El padrón: un torneo no tiene accesos
   ===================================================================== */
seccion('5 · accesos');
{
  const src = fs.readFileSync('server/api/handlers.js', 'utf8');
  const i = src.indexOf("if (accion === 'alta') {", src.indexOf('async function manejarClientesEscribir'));
  const cuerpo = src.slice(i, src.indexOf('clientes.alta(padron', i));
  check('el alta de un mail sobre un torneo se rechaza ANTES de tocar el padrón', /club\.tipo === 'torneo'/.test(cuerpo));
}

/* =====================================================================
   6 · El Panel Master
   ===================================================================== */
seccion('6 · sgadd-torneos.js (motor)');
{
  const p = UI.parsearEquipos('112674 · JUJUY BASQUET\n\nUNION (SF)\n  114142 | BARRIO JARDIN (T)\n999');
  check('equipos: id · nombre, nombre solo y renglones vacíos', p.equipos.length === 3
    && p.equipos[0].id === 112674 && p.equipos[1].id === null && p.equipos[2].nombre === 'BARRIO JARDIN (T)');
  check('un número sin nombre es un error con su renglón', p.errores.length === 1 && /renglón 5/.test(p.errores[0]));
  check('ida y vuelta: textoEquipos → parsearEquipos', UI.parsearEquipos(UI.textoEquipos(p.equipos)).equipos.length === 3);

  const b = { id: 'x-torneo', nombre: 'X', zonas: [{ zona: 'a', label: 'A', libro: '', equiposTexto: 'UNO\nDOS' },
    { zona: 'a', label: '', libro: 'https://docs.google.com/spreadsheets/d/' + 'Z'.repeat(40) + '/edit', equiposTexto: '' }] };
  const f = UI.faltantesTorneo(b);
  check('faltantes: zona repetida y etiqueta vacía', f.some(x => /repetido/.test(x)) && f.some(x => /etiqueta/.test(x)), f);
  const i = UI.intencionTorneo({ id: 'x', nombre: 'X', zonas: [{ zona: 'a', label: 'A', libro: 'https://docs.google.com/spreadsheets/d/' + 'Z'.repeat(40) + '/edit', equiposTexto: 'UNO' }] });
  check('el link pegado se manda como id, no como URL', i.zonas.a.sheetId === 'Z'.repeat(40));
  const i2 = UI.intencionTorneo({ id: 'x', nombre: 'X', zonas: [{ zona: 'a', label: 'A', libro: '', equiposTexto: 'UNO' }] });
  check('sin libro no se manda sheetId (conserva el que tenga)', !('sheetId' in i2.zonas.a));
  check('la intención de la pantalla la acepta el servidor',
    ap(base(), 'torneo', Object.assign({}, UI.intencionTorneo({ id: 'prueba-t', nombre: 'P', zonas: [{ zona: 'a', label: 'A', equiposTexto: 'UNO\nDOS' }] }))).ok);

  const adm = catalogo.publico(cat, { admin: true, origen: 'kv' });
  check('torneosDe / clientesDe parten la lista', UI.torneosDe(adm).length === 2 && UI.clientesDe(adm).length === 2);
  const eng = UI.enganchados(adm, 'liga-argentina-2026-27', 'norte');
  check('enganchados: Jujuy en la Norte con su equipo', eng.length === 1 && eng[0].club === 'jujuy' && eng[0].equipo === 'JUJUY BASQUET', eng);
  check('el id de categoría sugerido', UI.idVinculoSugerido('jujuy', 'liga-argentina-2026-27') === 'jujuy-lab-2026-27');
  const h = UI.html(adm);
  check('la pantalla lista los dos torneos y sus zonas', /Liga Argentina 2026-27/.test(h) && /Conferencia Norte/.test(h) && /Zona C/.test(h));
  check('cada zona dice si tiene libro', /✓ conectado/.test(h) && /— sin libro/.test(h));
  check('la pantalla no ofrece pausar ni plan en un torneo', !/pausar|cambiar_plan/i.test(h));
}

seccion('6 bis · el hub no pinta un torneo como cliente');
{
  const src = fs.readFileSync('js/sgadd-hub.js', 'utf8');
  const h = src.slice(src.indexOf('  function html() {'), src.indexOf('/** La intención que se manda.'));
  check('el hub separa los torneos antes de pintar las tarjetas de cliente',
    /c\.tipo !== 'torneo'/.test(h) && h.indexOf("c.tipo !== 'torneo'") < h.indexOf('tarjetaClub'));
  check('y los pinta en su bloque', /SGADD_TORNEOS\.html/.test(h));
  const idx = fs.readFileSync('index.html', 'utf8');
  check('sgadd-torneos.js carga antes que sgadd-hub.js', idx.indexOf('js/sgadd-torneos.js') > 0
    && idx.indexOf('js/sgadd-torneos.js') < idx.indexOf('js/sgadd-hub.js'));
}

seccion('6 ter · el selector y el equipo propio del torneo');
{
  const CL = require('./js/sgadd-clientes.js');
  const ops = CL.opciones([{ id: 'b', nombre: 'Beta', categorias: [{ activo: true }] },
    { id: 't', nombre: 'Alfa torneo', tipo: 'torneo', categorias: [{ activo: true }] }], 'b');
  check('el selector nombra al torneo como tal y lo manda al final', ops[1].id === 't' && /🏆/.test(ops[1].etiqueta));

  /* sgadd-club.js se auto-arranca: se carga en un vm con lo mínimo. */
  const ctx = { console, window: {}, document: { documentElement: { style: { setProperty() {} } }, addEventListener() {},
    querySelector() { return null; }, getElementById() { return null; } }, location: { search: '', hash: '', href: '' },
    URLSearchParams, fetch: () => Promise.reject(new Error('sin red')), setTimeout, clearTimeout,
    localStorage: { getItem() { return null; }, setItem() {} }, sessionStorage: { getItem() { return null; }, setItem() {} } };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/sgadd-club.js', 'utf8') + '\nthis.__CLUB = CLUB;', ctx);
  const cfg = ctx.__CLUB.reconciliarConfig(null, { id: 'zona-c-la-plata-2026', nombre: 'Zona C', tipo: 'torneo',
    categorias: [{ slug: 'zona-c-primera', label: 'Zona C', activo: true }] });
  const re = new RegExp(cfg.patronEquipoPropio, 'i');
  check("un torneo no trata a RECONQUISTA B como equipo propio", !re.test(CORE.claveEquipo("RECONQUISTA 'B'- MM")) && !re.test('RECONQUISTA'), cfg.patronEquipoPropio);
  const cfgCli = ctx.__CLUB.reconciliarConfig(null, { id: 'x', nombre: 'X', equipoPropio: 'JUJUY BASQUET',
    categorias: [{ slug: 's', label: 'S', activo: true }] });
  check('un cliente sigue derivando su patrón anclado', cfgCli.patronEquipoPropio === '^JUJUY BASQUET$');
}

/* =====================================================================
   10 · LA JERARQUÍA DEL PANEL · Torneo → Zona → Cliente (punto 73)
   ===================================================================== */
seccion('10 · el árbol Torneo → Zona → Cliente');
{
  /* El catálogo de prueba tiene la forma del real: un torneo con una zona
     con libro y otra sin, dos clientes enganchados y uno suelto. */
  const cat = [
    { id: 'rq', nombre: 'Reconquista', categorias: [
      { slug: 'rq-primera', label: 'Primera', activo: true, torneo: 'apb', zona: 'a' },
      { slug: 'rq-u23', label: 'U23', activo: true, torneo: 'form', zona: 'u23' }] },
    { id: 'dep', nombre: 'Deportivo', equipoPropio: 'DEPORTIVO', categorias: [
      { slug: 'dep-primera', label: 'Primera', activo: true, torneo: 'apb', zona: 'b' }] },
    { id: 'jujuy', nombre: 'Jujuy', categorias: [
      { slug: 'jujuy-primera', label: 'Conferencia Norte', activo: true }] },
    { id: 'apb', nombre: 'APB 2026', tipo: 'torneo', liga: 'la-plata', categorias: [
      { slug: 'apb-a', label: 'Zona A', activo: true, zona: 'a', equipos: [{ nombre: 'RECONQUISTA A' }] },
      { slug: 'apb-b', label: 'Zona B', activo: true, zona: 'b', equipos: [] },
      { slug: 'apb-c', label: 'Zona C', activo: false, zona: 'c', equipos: [] }] },
    { id: 'form', nombre: 'Formativas', tipo: 'torneo', categorias: [
      { slug: 'form-u23', label: 'Sub-23', activo: true, zona: 'u23', equipos: [] }] },
  ];
  const a = UI.arbol(cat);

  check('lista los torneos, no los clientes', a.torneos.length === 2, a.torneos.map(t => t.id));
  check('y en orden alfabético', a.torneos[0].id === 'apb' && a.torneos[1].id === 'form');
  const apb = a.torneos[0];
  check('cada torneo trae TODAS sus zonas', apb.zonas.length === 3, apb.zonas.map(z => z.slug));
  /* UNA ZONA SIN CLIENTES NO SE ESCONDE: es justo donde hay que poder dar
     de alta el primero, así que tiene que estar en la lista. */
  const zc = apb.zonas.find(z => z.slug === 'apb-c');
  check('una zona sin clientes ni libro sigue en la lista', !!zc && zc.clientes.length === 0 && !zc.activo);
  check('los clientes cuelgan de SU zona',
    apb.zonas.find(z => z.zona === 'a').clientes.map(c => c.club).join() === 'rq'
      && apb.zonas.find(z => z.zona === 'b').clientes.map(c => c.club).join() === 'dep',
    apb.zonas.map(z => z.zona + ':' + z.clientes.map(c => c.club).join('+')));
  check('y el cliente trae el equipo que el DT ve',
    apb.zonas.find(z => z.zona === 'b').clientes[0].equipo === 'DEPORTIVO');
  check('el torneo cuenta sus clientes y sus zonas sin libro',
    apb.clientes === 2 && apb.zonasSinLibro === 1, [apb.clientes, apb.zonasSinLibro]);
  check('un cliente NO puede contarse en dos zonas del mismo torneo',
    apb.zonas.reduce((n, z) => n + z.clientes.length, 0) === apb.clientes);

  /* LOS HUÉRFANOS · el axioma se hace cumplir hacia adelante, pero lo que
     ya existe no se rompe: se lista para poder resolverlo. */
  check('la categoría sin torneo queda como huérfana', a.huerfanos.length === 1
    && a.huerfanos[0].club === 'jujuy' && a.huerfanos[0].slug === 'jujuy-primera', a.huerfanos);
  check('y no se la inventa un torneo', !a.huerfanos[0].torneoFantasma);
  /* Un torneo que YA NO ESTÁ en el catálogo no cuenta como enganche: se
     vería enganchada y no llevaría a ninguna parte. */
  const conFantasma = UI.arbol(cat.concat([{ id: 'x', nombre: 'X', categorias:
    [{ slug: 'x-p', label: 'P', activo: true, torneo: 'torneo-borrado', zona: 'z' }] }]));
  check('una categoría que apunta a un torneo que no existe es huérfana',
    conFantasma.huerfanos.length === 2, conFantasma.huerfanos.map(h => h.slug));
  check('y se dice a cuál apuntaba, que es otro problema',
    (conFantasma.huerfanos.find(h => h.club === 'x') || {}).torneoFantasma === 'torneo-borrado',
    conFantasma.huerfanos);
  /* Un torneo NO es un huérfano: no es un cliente. */
  check('un torneo sin clientes no aparece como huérfano',
    !a.huerfanos.some(h => h.club === 'apb' || h.club === 'form'));

  /* Sin nada, no revienta y no inventa. */
  const vacio = UI.arbol([]);
  check('sin catálogo devuelve las dos listas vacías',
    vacio.torneos.length === 0 && vacio.huerfanos.length === 0);
}

/* =====================================================================
   11 · LA PANTALLA · una sola hoja de ruta
   ===================================================================== */
seccion('11 · la pantalla no deja dudar qué formulario usar');
{
  const cat = [
    { id: 'rq', nombre: 'Reconquista', categorias: [
      { slug: 'rq-primera', label: 'Primera', activo: true, torneo: 'apb', zona: 'a' }] },
    { id: 'jujuy', nombre: 'Jujuy', categorias: [{ slug: 'jujuy-primera', label: 'Norte', activo: true }] },
    { id: 'apb', nombre: 'APB 2026', tipo: 'torneo', categorias: [
      { slug: 'apb-a', label: 'Zona A', activo: true, zona: 'a', equipos: [] },
      { slug: 'apb-c', label: 'Zona C', activo: false, zona: 'c', equipos: [] }] },
  ];
  const h = UI.html(cat);

  /* CADA ZONA TIENE SU «+ cliente», y ese botón lleva el torneo y la zona:
     es lo que hace que el Caso 3 —sumar un cliente a un torneo que ya
     existe— no pase por elegir un libro en una lista. */
  const botones = (h.match(/altaEnZona\('([^']+)','([^']+)'\)/g) || []);
  check('hay un «+ cliente» por zona', botones.length === 2, botones);
  check('y cada uno lleva SU torneo y SU zona',
    /altaEnZona\('apb','apb-a'\)/.test(h) && /altaEnZona\('apb','apb-c'\)/.test(h));
  check('la zona sin clientes lo dice, en vez de salir vacía', /sin clientes/.test(h));
  check('el encabezado declara la regla de negocio',
    /Un cliente siempre pertenece a un torneo/.test(h));

  /* LOS HUÉRFANOS SE VEN, y su botón preselecciona la categoría: hacerla
     buscar de nuevo en un desplegable es pedir dos veces el mismo dato. */
  check('los huérfanos tienen su bloque', /data-huerfanos="1"/.test(h));
  check('y su botón ya trae el cliente elegido',
    /empezarVinculo\('', 'jujuy', 'jujuy-primera'\)/.test(h), (h.match(/empezarVinculo\([^)]*\)/g) || []));
  check('el bloque dice que NO los corta', /Se sirven igual que siempre/.test(h));
  /* Sin huérfanos NO se pinta: una card diciendo «no hay» es ruido. */
  const sinH = UI.html(cat.filter(c => c.id !== 'jujuy'));
  check('sin huérfanos, el bloque no existe', !/data-huerfanos/.test(sinH));

  /* LOS FORMULARIOS NO INVADEN LA PANTALLA: van plegados. */
  const abiertos = (h.match(/<details[^>]*\sopen/g) || []).length;
  check('los formularios arrancan plegados', abiertos === 0, abiertos);
  check('y son <details>, no cards siempre abiertas',
    (h.match(/<details/g) || []).length >= 2);

  /* Sin ningún torneo la pantalla no queda muda: dice por dónde empezar. */
  const sinT = UI.html([{ id: 'rq', nombre: 'Reconquista', categorias: [] }]);
  check('sin torneos dice por dónde se empieza', /Empezá por/.test(sinT) && /Nuevo torneo/.test(sinT));
}

/* =====================================================================
   12 · EL ENGANCHE EXPLÍCITO · la zona que todavía no tiene libro
   ===================================================================== */
seccion('12 · el primer cliente de una zona sin libro');
{
  const base = {
    apb: { nombre: 'APB', tipo: 'torneo', categorias: {
      'apb-a': { label: 'Zona A', sheetId: LIBRO_A, zona: 'a' },
      'apb-c': { label: 'Zona C', zona: 'c' } } },
  };
  /* Con libro en la zona, el enganche lo deduce el servidor del `libroDe`
     (punto 67) y no hace falta mandarlo: es el camino normal. */
  const r1 = ap(base, 'alta', { club: 'nuevo1', nombre: 'Nuevo 1',
    categoria: 'n1-primera', label: 'Primera', libroDe: 'apb/apb-a', equipoPropio: 'NUEVO 1' });
  check('el alta por el libro de una zona engancha sola', r1.ok
    && r1.catalogo.nuevo1.categorias['n1-primera'].torneo === 'apb'
    && r1.catalogo.nuevo1.categorias['n1-primera'].zona === 'a',
    r1.ok ? r1.catalogo.nuevo1.categorias['n1-primera'] : r1);

  /* SIN libro no hay `libroDe` del que deducirlo, y ahí el enganche viaja
     explícito: sin esto el primer cliente de una zona nueva quedaba
     huérfano justo cuando el admin acababa de decir a qué zona va. */
  const r2 = ap(base, 'alta', { club: 'nuevo2', nombre: 'Nuevo 2',
    categoria: 'n2-primera', label: 'Primera', sheetId: 'Z'.repeat(30) + 'libroPropio',
    equipoPropio: 'NUEVO 2', torneo: 'apb', zona: 'c' });
  check('una zona sin libro igual deja el cliente enganchado', r2.ok
    && r2.catalogo.nuevo2.categorias['n2-primera'].torneo === 'apb'
    && r2.catalogo.nuevo2.categorias['n2-primera'].zona === 'c',
    r2.ok ? r2.catalogo.nuevo2.categorias['n2-primera'] : r2);
  check('y conserva SU libro, no el de la zona',
    r2.ok && r2.catalogo.nuevo2.categorias['n2-primera'].sheetId !== LIBRO_A);

  /* UNA ZONA QUE NO EXISTE SE RECHAZA: un enganche a la nada se ve igual
     de enganchado que uno bueno, y es peor que no tener ninguno. */
  const r3 = ap(base, 'alta', { club: 'nuevo3', nombre: 'Nuevo 3',
    categoria: 'n3-primera', label: 'Primera', sheetId: 'Y'.repeat(30) + 'libroPropio',
    equipoPropio: 'NUEVO 3', torneo: 'apb', zona: 'zona-que-no-existe' });
  check('una zona que no existe se rechaza', !r3.ok && r3.codigo === 'ZONA', r3);
  const r4 = ap(base, 'alta', { club: 'nuevo4', nombre: 'Nuevo 4',
    categoria: 'n4-primera', label: 'Primera', sheetId: 'X'.repeat(30) + 'libroPropio',
    equipoPropio: 'NUEVO 4', torneo: 'no-soy-un-torneo', zona: 'a' });
  check('y un torneo que no existe, también', !r4.ok && r4.codigo === 'ZONA', r4);

  /* NO SE TOCA lo que no se manda: editar la etiqueta de una categoría
     desde una pantalla vieja no puede borrarle el enganche. */
  const conEnganche = JSON.parse(JSON.stringify(base));
  conEnganche.cli = { nombre: 'Cli', categorias: { 'cli-p': { label: 'P', sheetId: LIBRO_A, torneo: 'apb', zona: 'a' } } };
  const r5 = ap(conEnganche, 'alta', { club: 'cli', categoria: 'cli-p', label: 'Primera 2027' });
  check('editar sin mandar torneo NO borra el enganche', r5.ok
    && r5.catalogo.cli.categorias['cli-p'].torneo === 'apb'
    && r5.catalogo.cli.categorias['cli-p'].label === 'Primera 2027',
    r5.ok ? r5.catalogo.cli.categorias['cli-p'] : r5);
}

/* =====================================================================
   9 · EL MARCADOR DE LOS PLEGABLES · la clase tiene que estar EN LOS DOS
   LADOS (punto 74)

   Las cuatro cards del Panel Master que se pliegan son `<details>`, y el
   marcador nativo se dibuja en su propia línea cuando el primer hijo del
   `<summary>` es un bloque — que es el caso de la tarjeta de torneo, cuyo
   título va en un `<span class="flex">`. Por eso el CSS apaga el nativo y
   dibuja el suyo, y por eso la clase tiene que viajar en el markup.

   Se EJERCE el markup real de los dos módulos, no se lee el fuente: un grep
   sobre el archivo queda verde si alguien deja la clase escrita en un
   comentario o en una rama muerta (la lección del punto 69).
   ===================================================================== */
seccion('9 · el marcador de los plegables (punto 74)');
{
  const HUB = require('./js/sgadd-hub.js');
  const fxT = [
    { id: 'apb', tipo: 'torneo', nombre: 'APB', liga: 'la-plata', temporada: '2026',
      categorias: [{ slug: 'apb-a', label: 'Zona A', zona: 'a', activo: true, equipos: ['ATENAS'] }] },
    { id: 'cli', tipo: 'cliente', nombre: 'Cli', liga: 'la-plata',
      categorias: [{ slug: 'cli-p', label: 'Primera', activo: true, torneo: 'apb', zona: 'a' }] },
  ];
  const markup = UI.html(fxT) + HUB.bloqueAlta(fxT);

  /* Toda card plegable y no un número fijo: una quinta que se agregue
     mañana sin la clase cae acá sola. */
  const cards = (markup.match(/<details[^>]*>/g) || [])
    .map(t => (t.match(/class="([^"]*)"/) || [])[1] || '')
    .filter(c => /\bcard\b/.test(c));
  check('las cards plegables del Panel Master existen en el markup', cards.length >= 4, cards.length);
  check('y TODAS llevan hub-plegable', cards.every(c => /\bhub-plegable\b/.test(c)),
    cards.filter(c => !/\bhub-plegable\b/.test(c)));

  /* El otro lado: sin el CSS la clase es inerte, que fue justamente el
     estado del que salió este punto — cinco ocurrencias en el `<style>` y
     cero en los `.js`. */
  const idx = fs.readFileSync('index.html', 'utf8');
  check('el CSS define .hub-plegable > summary',
    /\.hub-plegable\s*>\s*summary\s*\{/.test(idx));
  check('apaga el marcador nativo en los DOS motores',
    /\.hub-plegable\s*>\s*summary\s*\{[^}]*list-style:\s*none/.test(idx)
    && /\.hub-plegable\s*>\s*summary::-webkit-details-marker\s*\{[^}]*display:\s*none/.test(idx));
  /* El `::before` va absoluto, así que sin el hueco se monta sobre el
     título. Medido con el markup real en el navegador: padding-left 22,4px
     contra un glifo que arranca en 8,8px, o sea que no se tocan. */
  check('y reserva el hueco con padding-left',
    /\.hub-plegable\s*>\s*summary\s*\{[^}]*padding-left:/.test(idx));
  check('el giro respeta prefers-reduced-motion',
    /prefers-reduced-motion[\s\S]{0,200}?\.hub-plegable\s*>\s*summary::before\s*\{[^}]*transition:\s*none/.test(idx));
}

console.log('\n' + (mal ? '✗ HAY FALLAS · ' : '✓ TODO OK · ') + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
