/* =====================================================================
   La gestión de ciclos (Ciclos, fase 5): la máquina de estados, las lecturas
   editables, los handlers de ADMIN contra un KV de mentira y la pantalla.
   ===================================================================== */
'use strict';
require('./server/lib/env.js').cargar();

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

const CI = require('./js/sgadd-ciclos.js');
global.SGADD_CICLOS = CI;

const z14 = (f) => Array.from({ length: 14 }, (_, i) => f(i));
const partido = (i, fecha) => ({
  id: 'p' + i, fecha, rival: 'R' + i, condicion: i % 2 ? 'LOCAL' : 'VISITANTE', final: [80 + i, 70],
  parciales: [[20, 18], [20, 17], [20, 17], [20 + i, 18]],
  trans: { propio: {}, rival: { RD: [2, 1, 2 + i, 0] } },
  cuartos: { favor: [[5, 2, 5, 5], [5, 2, 5, 5], [5, 2, 5, 5], [5, 2, 5, 5]], contra: [[5, 2, 5, 5], [5, 2, 5, 5], [5, 2, 5, 5], [5, 2, 5, 5]] },
  zonas: { favor: z14(k => (k < 4 ? [5, 2] : [0, 0])), contra: z14(k => (k === 12 ? [4, 3] : [1, 1])) },
  causas: { perd: { PEREZ: [1, 2] }, fall: { '2P': [1, 2], '3P': [0, 0] }, nRD: 1, nROBO: 0 },
});
const paquete = (n) => ({
  equipo: 'JUJUY', etiqueta: 'LAB',
  ciclos: { version: 1, partidos: Array.from({ length: n }, (_, i) => partido(i, '2026-10-' + String(10 + i).padStart(2, '0'))) },
  liga: { ciclos: { lados: 10, trans: { RD: [10, 5, 10, 0] } }, zonas: CI.ZONAS.map(zn => ({ zona: zn, ppt: 1 })) },
  partidosPbp: [],
});

titulo('1 · las lecturas');
{
  const c = CI.armarVentana(paquete(6), { tipo: 'ciclo', numero: 0, n: 4 });
  const b = CI.lecturasBase(c);
  check('hay una lectura base por cada una declarada', CI.LECTURAS.every(l => typeof b[l.id] === 'string'));
  check('el resumen trae los números del ciclo', /4 partidos: 4 ganados y 0 perdidos/.test(b.resumen) && /2026-10-10/.test(b.resumen), b.resumen);
  check('la lectura de zonas nombra la fuga', /Z13/.test(b.zonas), b.zonas);
  const l = CI.limpiarLecturas({ resumen: '  hola\u0007  ', zonas: 'x'.repeat(5000), inventada: 'no', cierre: 5, cuartos: '   ' });
  check('limpiar: solo ids declarados, sin control, con tope', l.resumen === 'hola' && l.zonas.length === CI.MAX_LECTURA && !('inventada' in l) && !('cierre' in l) && !('cuartos' in l));
}

titulo('2 · la máquina de estados');
{
  const p = paquete(6);
  const c = CI.armarVentana(p, { tipo: 'ciclo', numero: 0, n: 4 });
  const au = CI.auditar(c, p);
  const ctx = { ahora: '2026-11-03T12:00:00.000Z', por: 'admin', ciclo: c, auditoria: au };
  let r = CI.transicionarGestion(null, 'guardar', { lecturas: { resumen: 'Texto del analista' } }, ctx);
  check('guardar desde cero deja un borrador con la lectura', r.ok && r.doc.estado === 'borrador' && r.doc.lecturas.resumen === 'Texto del analista');
  check('y anota el historial', r.doc.historial.length === 1 && r.doc.historial[0].accion === 'guardar');
  const borr = r.doc;
  check('publicar un borrador no se puede', CI.transicionarGestion(borr, 'publicar', {}, ctx).motivo === 'ESTADO');
  r = CI.transicionarGestion(borr, 'auditar', {}, ctx);
  check('un borrador apto pasa a auditado y guarda la huella', r.ok && r.doc.estado === 'auditado' && r.doc.huellaAuditada === CI.huella(c));
  const audit = r.doc;
  const roto = Object.assign({}, au, { apto: false });
  check('con la auditoría en error no pasa a auditado', CI.transicionarGestion(borr, 'auditar', {}, Object.assign({}, ctx, { auditoria: roto })).motivo === 'NO_APTO');
  check('auditar dos veces no se puede', CI.transicionarGestion(audit, 'auditar', {}, ctx).motivo === 'ESTADO');
  r = CI.transicionarGestion(audit, 'guardar', { lecturas: { cierre: 'Cambio' } }, ctx);
  check('editar un auditado lo devuelve a borrador (y conserva lo anterior)', r.ok && r.doc.estado === 'borrador' && r.doc.lecturas.resumen === 'Texto del analista' && r.doc.lecturas.cierre === 'Cambio');
  check('reabrir un auditado lo pasa a borrador', CI.transicionarGestion(audit, 'reabrir', {}, ctx).doc.estado === 'borrador');
  check('reabrir un borrador no tiene sentido', CI.transicionarGestion(borr, 'reabrir', {}, ctx).motivo === 'ESTADO');
  r = CI.transicionarGestion(audit, 'publicar', {}, ctx);
  check('un auditado cerrado y apto se publica con su huella', r.ok && r.doc.estado === 'publicado' && r.doc.huella === CI.huella(c) && r.doc.publicado === ctx.ahora);
  const pub = r.doc;
  check('un publicado no admite nada', ['guardar', 'auditar', 'reabrir', 'publicar'].every(a => CI.transicionarGestion(pub, a, { lecturas: { resumen: 'x' } }, ctx).motivo === 'PUBLICADO'));
  const cambiado = paquete(6); cambiado.ciclos.partidos[1].final = [99, 70];
  const c2 = CI.armarVentana(cambiado, { tipo: 'ciclo', numero: 0, n: 4 });
  check('si el dato cambió desde la auditoría no se publica', CI.transicionarGestion(audit, 'publicar', {}, Object.assign({}, ctx, { ciclo: c2, auditoria: CI.auditar(c2, cambiado) })).motivo === 'CAMBIO');
  const abierto = CI.armarVentana(p, { tipo: 'ciclo', numero: 1, n: 4 });
  check('un ciclo abierto no se publica', CI.transicionarGestion(audit, 'publicar', {}, Object.assign({}, ctx, { ciclo: abierto, auditoria: CI.auditar(abierto, p) })).motivo === 'ABIERTO');
  check('una acción desconocida se rechaza', CI.transicionarGestion(null, 'borrar', {}, ctx).motivo === 'ACCION');
}

titulo('3 · los handlers de ADMIN contra un KV de mentira');
const kv = require('./server/lib/kv.js');
const store = {}, hashes = {}, ops = [];
kv.configurado = () => true;
kv.leer = async (k) => ({ valor: store[k] !== undefined ? JSON.parse(store[k]) : null, error: null });
kv.escribir = async (k, v) => { ops.push('SET'); store[k] = JSON.stringify(v); };
kv.borrar = async () => { ops.push('DEL'); };
kv.leerHash = async (k) => { const o = {}; Object.keys(hashes[k] || {}).forEach(c => { o[c] = JSON.parse(hashes[k][c]); }); return o; };
kv.leerCampos = async (k, campos) => { const o = {}; campos.forEach(c => { if ((hashes[k] || {})[c] !== undefined) o[c] = JSON.parse(hashes[k][c]); }); return o; };
kv.escribirCampos = async (k, mapa) => { ops.push('HSET'); hashes[k] = hashes[k] || {}; Object.keys(mapa).forEach(c => { hashes[k][c] = JSON.stringify(mapa[c]); }); };
kv.comando = async () => { throw new Error('la gestión no usa comando'); };

const auth = require('./server/lib/auth.js');
const catalogo = require('./server/lib/catalogo.js');
const CIC = require('./server/rutas/ciclos.js');
const PBP = require('./server/rutas/pbp.js');
const CAT = {
  jujuy: { nombre: 'Jujuy', liga: 'liga-argentina', equipoPropio: 'JUJUY', estado: 'activo', plan: 'ORO', categorias: { 'jujuy-norte': { label: 'Norte', sheetId: 'Y' } } },
};
store[catalogo.CLAVE_KV] = JSON.stringify(CAT); catalogo.limpiarCache();
hashes[PBP.claveKV('jujuy', 'jujuy-norte')] = { [PBP.campoDeEquipo('JUJUY')]: JSON.stringify(paquete(6)) };
const tok = (d) => auth.firmarToken(d, { expiraEn: '1h' });
const tokAdmin = tok({ email: 'freytesgn@gmail.com' });
const tokJujuy = tok({ email: 'dt@jujuy.com', club: 'jujuy', equipoAsignado: 'JUJUY', plan: 'ORO' });
const ped = (t, body, query) => ({ headers: t ? { authorization: 'Bearer ' + t } : {}, params: { clubId: 'jujuy', categoria: 'jujuy-norte' }, body: body || {}, query: query || {} });
const crit0 = { tipo: 'ciclo', numero: 0, n: 4 };

(async () => {
  const G = (t, body) => CIC.manejarGestionGuardar(ped(t, body));
  let r = await G(tokAdmin, { equipo: 'JUJUY', criterio: crit0, accion: 'guardar', lecturas: { resumen: 'Lectura propia', inventada: 'x' } });
  check('el admin guarda un borrador', r.status === 200 && r.body.doc.estado === 'borrador' && r.body.doc.lecturas.resumen === 'Lectura propia', JSON.stringify(r.body).slice(0, 150));
  check('una lectura que no existe no se guarda', !('inventada' in r.body.doc.lecturas));
  check('el documento no guarda números editables: solo el criterio y las lecturas', !('ciclo' in r.body.doc) && r.body.doc.criterio.numero === 0);
  r = await G(tokAdmin, { equipo: 'JUJUY', criterio: crit0, accion: 'publicar' });
  check('publicar sin auditar da 422', r.status === 422 && r.body.codigo === 'ESTADO');
  r = await G(tokAdmin, { equipo: 'JUJUY', criterio: crit0, accion: 'auditar' });
  check('auditar lo pasa a auditado', r.status === 200 && r.body.doc.estado === 'auditado' && r.body.auditoria.apto === true);
  r = await G(tokAdmin, { equipo: 'JUJUY', criterio: crit0, accion: 'publicar', nota: 'va al staff' });
  check('publicar lo congela', r.status === 200 && r.body.doc.estado === 'publicado' && /^[0-9a-f]{8}$/.test(r.body.doc.huella));
  r = await G(tokAdmin, { equipo: 'JUJUY', criterio: crit0, accion: 'guardar', lecturas: { resumen: 'otra' } });
  check('un publicado no se edita: 409', r.status === 409 && r.body.codigo === 'PUBLICADO');
  r = await G(tokAdmin, { equipo: 'JUJUY', criterio: { tipo: 'ciclo', numero: 1, n: 4 }, accion: 'auditar' });
  check('un ciclo abierto no se audita (el servidor recalcula)', r.status === 422 && /NO_APTO|ESTADO/.test(r.body.codigo), JSON.stringify(r.body).slice(0, 100));
  r = await G(tokAdmin, { equipo: 'JUJUY', criterio: { tipo: 'calendario', desde: '2026-10-10', hasta: '2026-10-12' }, accion: 'guardar', lecturas: { cierre: 'rango libre' } });
  check('una ventana libre también se gestiona, con su propia clave', r.status === 200 && /\|f2026-10-10_2026-10-12$/.test(r.body.doc.campo));
  r = await G(tokAdmin, { equipo: 'JUJUY', criterio: { tipo: 'calendario', desde: '2030-01-01', hasta: '2030-01-02' }, accion: 'guardar' });
  check('una ventana sin partidos da 422', r.status === 422 && r.body.codigo === 'NO_EXISTE');
  r = await G(tokAdmin, { equipo: 'JUJUY', criterio: { tipo: 'calendario', desde: '2026-10-10', hasta: '2026-10-12' }, accion: 'borrar' });
  check('una acción desconocida se rechaza', r.status === 422 && r.body.codigo === 'ACCION');
  r = await G(tokJujuy, { equipo: 'JUJUY', criterio: crit0, accion: 'guardar' });
  check('un cliente ORO NO gestiona', r.status === 403 && r.body.codigo === 'SOLO_ADMIN');
  r = await G(null, { equipo: 'JUJUY' });
  check('sin token, 401', r.status === 401);
  r = await G(tokAdmin, { equipo: 'NO EXISTE', criterio: crit0, accion: 'guardar' });
  check('un equipo sin análisis da 404', r.status === 404);

  r = await CIC.manejarGestion(ped(tokAdmin, null, { equipo: 'JUJUY' }));
  check('el admin lista los documentos', r.status === 200 && r.body.docs.length === 2 && r.body.docs.some(d => d.estado === 'publicado'));
  r = await CIC.manejarGestion(ped(tokJujuy, null, {}));
  check('un cliente no los lista', r.status === 403);
  check('nada se borra, solo se escriben campos', !ops.some(o => o === 'DEL' || o === 'SET' || o === 'HDEL'), ops.join());

  titulo('4 · la pantalla');
  const UI = require('./js/sgadd-ciclosadmin.js');
  const E = UI.estado;
  const idx = { liga: {}, lista: () => [{ nombre: 'JUJUY', clave: 'JUJUY' }, { nombre: 'HINDU', clave: 'HINDU' }] };
  let h = UI.html(idx);
  check('sin equipo pide elegir uno', /Elegí un equipo para armar/.test(h));
  E.equipo = 'JUJUY'; E.paqDe = 'JUJUY'; E.paq = paquete(6); E.docs = [];
  h = UI.html(idx);
  check('muestra los cinco modos de elegir la ventana', UI.MODOS.length === 5 && UI.MODOS.every(m => h.indexOf(m[1]) !== -1));
  check('el ciclo estándar ofrece Ciclo 0 y Ciclo 1', /Ciclo 0/.test(h) && /Ciclo 1/.test(h));
  check('trae la auditoría, el estado y las cinco lecturas editables', /Auditoría del corte · apto/.test(h) && /Borrador/.test(h) && (h.match(/<textarea/g) || []).length === 5);
  check('la lectura base viene con los números del ciclo', /4 ganados y 0 perdidos/.test(h));
  const plano = (s) => s.replace(/\s+/g, ' ');
  const btnPublicar = (s) => (plano(s).match(/<button[^>]*accion\('publicar'\)[^>]*>/) || [''])[0];
  const deshab = (s) => / disabled[ >]/.test(s);
  check('publicar está deshabilitado en un borrador', deshab(btnPublicar(h)), btnPublicar(h));
  UI.editar('resumen', 'Texto nuevo <b>x</b>');
  check('tipear guarda en el borrador local sin repintar', UI.textoDe(UI.vista(), 'resumen') === 'Texto nuevo <b>x</b>' && UI.sucio(UI.vista()));
  check('el texto de un analista sale escapado', !/<b>x<\/b>/.test(UI.html(idx)) && /&lt;b&gt;x&lt;\/b&gt;/.test(UI.html(idx)));
  UI.editar('inventada', 'no'); check('un id inexistente se ignora', !('inventada' in E.draft));
  UI.modo('ultimos'); check('cambiar de modo descarta el borrador local', Object.keys(E.draft).length === 0 && UI.criterio().ultimos === 4);
  UI.fijar('ultimos', 2); check('últimos N arma el criterio', UI.criterio().ultimos === 2 && /2 partidos/.test(UI.html(idx)));
  UI.modo('posicion'); UI.fijar('desde', 1); UI.fijar('cantidad', 3); check('N desde una posición', UI.criterio().desde === 1 && UI.criterio().cantidad === 3 && /3 partidos/.test(UI.html(idx)));
  UI.modo('calendario'); UI.fijar('fdesde', '2026-10-11'); UI.fijar('fhasta', '2026-10-13');
  check('rango de fechas', UI.criterio().tipo === 'calendario' && /3 partidos/.test(UI.html(idx)));
  UI.fijar('fhasta', '2026-10-01'); check('un rango al revés lo dice', /Esa ventana no tiene partidos/.test(UI.html(idx)));
  UI.modo('ids'); UI.alternarPartido('p0'); UI.alternarPartido('p5');
  check('partidos puntuales', UI.criterio().ids.length === 2 && /2 partidos/.test(UI.html(idx)));
  UI.modo('ciclo'); UI.fijar('ciclo', 0);
  E.docs = [{ campo: 'jujuy|c0n4', estado: 'publicado', lecturas: { resumen: 'Publicado así' }, historial: [{ accion: 'publicar', estado: 'publicado', en: '2026-11-03T12:00:00Z' }] }];
  h = UI.html(idx);
  check('un publicado muestra su texto, bloqueado', /Publicado así/.test(h) && (h.match(/<textarea[^>]*disabled/g) || []).length === 5 && /🔒/.test(h));
  check('el historial del documento se lista', /publicar → publicado/.test(h));
  E.docs = [{ campo: 'jujuy|c0n4', estado: 'auditado', lecturas: {}, historial: [] }];
  h = UI.html(idx);
  check('un auditado habilita Publicar', !deshab(btnPublicar(h)) && /Auditado/.test(h), btnPublicar(h));
  E.paq = paquete(0); delete E.paq.ciclos;
  check('un paquete sin ciclos lo dice', /no trae el bloque/.test(UI.html(idx)));
  E.error = 'Sin conexión'; E.paq = null; check('un fallo se dice', /No se pudo leer: Sin conexión/.test(UI.html(idx)));

  titulo('5 · el cableado');
  const fs = require('fs');
  const cu = fs.readFileSync(__dirname + '/js/sgadd-comparativaui.js', 'utf8');
  const ix = fs.readFileSync(__dirname + '/index.html', 'utf8');
  check('Comparativa tiene la pestaña «Ciclos · gestión»', /id: 'ciclos', label: 'Ciclos · gestión'/.test(cu) && /SGADD_CICLOSADMIN\.montar\(\)/.test(cu));
  check('el módulo se carga en el index', /sgadd-ciclosadmin\.js\?v=\d+/.test(ix));
  const A = require('./js/sgadd-auth.js');
  check('Comparativa sigue siendo solo del admin', !!A.MODULOS.comparativa && A.MODULOS.comparativa.soloAdmin === true);

  console.log(`\n${ok} pasan · ${fail} fallan`);
  process.exit(fail ? 1 : 0);
})();
