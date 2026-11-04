/* =====================================================================
   Los ciclos SELLADOS (Ciclos, fase 4): el motor (ventana libre, huella,
   sellar, verificar, historial) y los handlers reales con un KV de mentira.
   ===================================================================== */
'use strict';
require('./server/lib/env.js').cargar();

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

const CI = require('./js/sgadd-ciclos.js');
const CORE = require('./js/sgadd-core.js');

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

titulo('1 · ventana libre');
{
  const p = paquete(6);
  check('por calendario trae solo los partidos del rango', CI.armarVentana(p, { tipo: 'calendario', desde: '2026-10-11', hasta: '2026-10-13' }).meta.partidos === 3);
  check('por cantidad: los últimos 2', CI.armarVentana(p, { tipo: 'partidos', ultimos: 2 }).meta.desde === '2026-10-14');
  check('por posición: 3 desde el segundo', CI.armarVentana(p, { tipo: 'partidos', desde: 1, cantidad: 3 }).meta.desde === '2026-10-11');
  check('por ids exactos', CI.armarVentana(p, { tipo: 'partidos', ids: ['p0', 'p5'] }).meta.partidos === 2);
  check('un rango sin partidos no existe', CI.armarVentana(p, { tipo: 'calendario', desde: '2027-01-01', hasta: '2027-01-02' }) === null);
  check('un rango al revés no existe', CI.armarVentana(p, { tipo: 'calendario', desde: '2026-10-13', hasta: '2026-10-11' }) === null);
  check('el ciclo estándar sigue igual', CI.armarVentana(p, { tipo: 'ciclo', numero: 0, n: 4 }).meta.cerrado === true);
  check('un calendario que termina en el futuro está abierto',
    CI.armarVentana(p, { tipo: 'calendario', desde: '2026-10-10', hasta: '2026-12-31' }, { hoy: '2026-11-01' }).meta.cerrado === false);
}

titulo('2 · sellar y verificar');
{
  const p = paquete(6);
  const r = CI.sellar(p, { tipo: 'ciclo', numero: 0, n: 4 }, { ahora: new Date('2026-11-03T12:00:00Z') });
  check('un ciclo cerrado y apto se sella', r.ok && r.clave === 'c0n4' && /^[0-9a-f]{8}$/.test(r.registro.huella));
  check('guarda el ciclo entero y cuándo se selló', r.registro.ciclo.meta.partidos === 4 && r.registro.sellado === '2026-11-03T12:00:00.000Z');
  check('el ciclo abierto NO se sella', CI.sellar(p, { tipo: 'ciclo', numero: 1, n: 4 }).motivo === 'ABIERTO');
  check('uno que no existe, tampoco', CI.sellar(p, { tipo: 'ciclo', numero: 9, n: 4 }).motivo === 'NO_EXISTE');
  const roto = paquete(4); roto.ciclos.partidos.forEach(x => { x.parciales = [[0, 0], [0, 0], [0, 0], [0, 0]]; });
  check('con la auditoría en error no se sella', CI.sellar(roto, { tipo: 'ciclo', numero: 0, n: 4 }).motivo === 'NO_APTO');
  check('la huella es la misma recalculada', CI.huella(CI.armarVentana(p, r.registro.criterio)) === r.registro.huella);
  check('verificar: intacto con el mismo paquete', CI.verificar(r.registro, p) === 'INTACTO');
  const corregido = paquete(6); corregido.ciclos.partidos[2].final = [99, 70];
  check('verificar: divergente si el dato de origen cambió', CI.verificar(r.registro, corregido) === 'DIVERGENTE');
  check('verificar: no verificable si el paquete perdió los partidos', CI.verificar(r.registro, paquete(0)) === 'NO_VERIFICABLE');
  check('la clave de un rango por fecha', CI.claveSello({ tipo: 'calendario', desde: '2026-10-10', hasta: '2026-10-20', n: 3 }) === 'f2026-10-10_2026-10-20');
}

titulo('3 · el historial · valores y diferencias, sin juicio');
{
  const p = paquete(8);
  const regs = [0, 1].map(n => CI.sellar(p, { tipo: 'ciclo', numero: n, n: 4 }).registro);
  const h = CI.historial([regs[1], regs[0]]);
  check('ordena por fecha sin importar cómo lleguen', h.columnas[0].rotulo === 'Ciclo 0' && h.columnas[1].rotulo === 'Ciclo 1');
  const pf = h.filas.find(f => f.id === 'pf');
  check('la diferencia es contra el ciclo anterior', pf.deltas[0] === null && pf.deltas[1] === Math.round((pf.valores[1] - pf.valores[0]) * 10) / 10);
  check('no emite tendencia ni juicio', !JSON.stringify(h).match(/mejora|empeora|sube|baja/i));
}

titulo('4 · los handlers contra un KV de mentira');
const kv = require('./server/lib/kv.js');
const store = {}, hashes = {}, ops = [];
kv.configurado = () => true;
kv.leer = async (k) => ({ valor: store[k] !== undefined ? JSON.parse(store[k]) : null, error: null });
kv.escribir = async (k, v) => { ops.push('SET'); store[k] = JSON.stringify(v); };
kv.borrar = async () => { ops.push('DEL'); };
kv.leerHash = async (k) => { const o = {}; Object.keys(hashes[k] || {}).forEach(c => { o[c] = JSON.parse(hashes[k][c]); }); return o; };
kv.leerCampos = async (k, campos) => { const o = {}; campos.forEach(c => { if ((hashes[k] || {})[c] !== undefined) o[c] = JSON.parse(hashes[k][c]); }); return o; };
kv.comando = async (partes) => {
  ops.push(partes[0]);
  const [cmd, k, c, v] = partes;
  if (cmd === 'HSETNX') { hashes[k] = hashes[k] || {}; if (c in hashes[k]) return 0; hashes[k][c] = v; return 1; }
  throw new Error('comando no esperado ' + cmd);
};

const auth = require('./server/lib/auth.js');
const catalogo = require('./server/lib/catalogo.js');
const CIC = require('./server/rutas/ciclos.js');
const PBP = require('./server/rutas/pbp.js');

const CAT = {
  jujuy: { nombre: 'Jujuy', liga: 'liga-argentina', equipoPropio: 'JUJUY', estado: 'activo', plan: 'ORO', categorias: { 'jujuy-norte': { label: 'Norte', sheetId: 'Y' } } },
  deportivo: { nombre: 'Deportivo', liga: 'la-plata', equipoPropio: 'DEPORTIVO LA PLATA', estado: 'activo', plan: 'PLATA', categorias: { 'deportivo-primera': { label: 'Primera', sheetId: 'X' } } },
};
store[catalogo.CLAVE_KV] = JSON.stringify(CAT); catalogo.limpiarCache();
hashes[PBP.claveKV('jujuy', 'jujuy-norte')] = { [PBP.campoDeEquipo('JUJUY')]: JSON.stringify(paquete(6)) };

const tok = (d) => auth.firmarToken(d, { expiraEn: '1h' });
const tokAdmin = tok({ email: 'freytesgn@gmail.com' });
const tokJujuy = tok({ email: 'dt@jujuy.com', club: 'jujuy', equipoAsignado: 'JUJUY', plan: 'ORO' });
const tokDep = tok({ email: 'dt@dep.com', club: 'deportivo', equipoAsignado: 'DEPORTIVO LA PLATA', plan: 'PLATA' });
const ped = (t, club, cat, body, query) => ({ headers: t ? { authorization: 'Bearer ' + t } : {}, params: { clubId: club, categoria: cat }, body: body || {}, query: query || {} });

(async () => {
  const sellar = (t, body) => CIC.manejarSellar(ped(t, 'jujuy', 'jujuy-norte', body));
  let r = await sellar(tokAdmin, { equipo: 'JUJUY', criterio: { tipo: 'ciclo', numero: 0, n: 4 } });
  check('el admin sella el ciclo 0', r.status === 200 && r.body.sellado.clave === 'c0n4', JSON.stringify(r.body).slice(0, 120));
  const huella = r.body.sellado && r.body.sellado.huella;
  r = await sellar(tokAdmin, { equipo: 'JUJUY', criterio: { tipo: 'ciclo', numero: 0, n: 4 } });
  check('sellar otra vez NO reemplaza: 409 y dice que es igual', r.status === 409 && r.body.codigo === 'YA_SELLADO' && r.body.igual === true);
  r = await sellar(tokAdmin, { equipo: 'JUJUY', criterio: { tipo: 'ciclo', numero: 1, n: 4 } });
  check('un ciclo abierto da 422', r.status === 422 && r.body.codigo === 'ABIERTO');
  r = await sellar(tokAdmin, { equipo: 'JUJUY', criterio: { tipo: 'calendario', desde: '2026-10-10', hasta: '2026-10-12' } });
  check('una ventana por calendario también se sella', r.status === 200 && /^f2026-10-10/.test(r.body.sellado.clave));
  r = await sellar(tokJujuy, { equipo: 'JUJUY', criterio: { tipo: 'ciclo', numero: 0, n: 4 } });
  check('un cliente NO puede sellar', r.status === 403 && r.body.codigo === 'SOLO_ADMIN');
  r = await sellar(null, { equipo: 'JUJUY' });
  check('sin token, 401', r.status === 401);
  r = await sellar(tokAdmin, { equipo: 'NO EXISTE', criterio: { tipo: 'ciclo', numero: 0, n: 4 } });
  check('un equipo sin análisis da 404', r.status === 404);

  r = await CIC.manejarCiclos(ped(tokJujuy, 'jujuy', 'jujuy-norte', null, { equipo: 'JUJUY' }));
  check('el cliente ORO lee sus sellados', r.status === 200 && r.body.sellados.length === 2 && r.body.sellados.some(s => s.huella === huella));
  r = await CIC.manejarCiclos(ped(tokDep, 'deportivo', 'deportivo-primera'));
  check('un cliente PLATA no los lee (403 de plan)', r.status === 403 && r.body.codigo === 'REQUIERE_PLAN');
  r = await CIC.manejarCiclos(ped(tokDep, 'jujuy', 'jujuy-norte'));
  check('ni los de otro club', r.status === 403 && r.body.codigo === 'OTRO_CLUB');
  r = await CIC.manejarCiclos(ped(tokAdmin, 'deportivo', 'deportivo-primera'));
  check('el admin lee aunque el plan no alcance', r.status === 200);
  check('NUNCA se borra ni se reemplaza: solo HSETNX', !ops.some(o => o === 'DEL' || o === 'SET' || o === 'HSET' || o === 'HDEL'), ops.join());
  check('el sello guarda el ciclo entero', (await CIC.manejarCiclos(ped(tokAdmin, 'jujuy', 'jujuy-norte'))).body.sellados[0].ciclo.meta.partidos >= 3);

  console.log(`\n${ok} pasan · ${fail} fallan`);
  process.exit(fail ? 1 : 0);
})();
