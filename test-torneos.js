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
  check('32 equipos con id de Gesdeportiva', n.concat(s).filter(e => Number.isInteger(e.id)).length === 32);
  check('los dos sin id son los que el sitio todavía no lista, y lo dicen',
    n.concat(s).filter(e => !e.id).every(e => e.provisorio) && n.concat(s).filter(e => !e.id).length === 2);
  check('ningún id repetido', new Set(n.concat(s).filter(e => e.id).map(e => e.id)).size === 32);
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

  ['pausar', 'cambiar_plan', 'cambiar_equipo', 'renovar', 'alta', 'informe_entregado', 'cambiar_laboratorio'].forEach((a) => {
    const r = ap(cat, a, { club: 'liga-argentina-2026-27', categoria: 'lab-2026-27-norte', plan: 'ORO',
      equipoPropio: 'X', vence: '2099-01-01', label: 'x', sheetId: LIBRO_A, capas: 'pbp' });
    check('«' + a + '» sobre un torneo se rechaza: es una acción de clientes', !r.ok && /es un torneo/.test(r.motivo), r.motivo);
  });
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

console.log('\n' + (mal ? '✗ HAY FALLAS · ' : '✓ TODO OK · ') + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
