/* =====================================================================
   Los inscriptos del torneo · sgadd-inscriptos.js (punto 93)

   Lo que hay que amarrar:
     · los 18 de la LNB salen del archivo del torneo y cruzan con los
       nombres del libro («ARGENTINO J» ↔ «ARGENTINO (J)»);
     · un equipo del libro que el torneo no reconoce APAGA el completado
       (alias incompletos → riesgo de mostrar dos veces al mismo);
     · la tabla los pone al pie, en 0, sin zona, y no mueve a nadie más;
     · ningún número entra al índice.
   ===================================================================== */
const fs = require('fs');
const INS = require('./js/sgadd-inscriptos.js');
const CL = require('./js/sgadd-clasificacion.js');
const CFG = require('./js/sgadd-config.js');
global.SGADD_CONFIG = CFG;

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

const LNB = JSON.parse(fs.readFileSync('./torneos/liga-nacional-2026-27.json', 'utf8'));
/* Los 11 equipos con box score en el libro piloto, escritos como los
   escribe el motor (sin paréntesis ni tildes). */
const DEL_LIBRO = ['ARGENTINO J', 'ATENAS C', 'FERRO', 'GIMNASIA CR', 'INSTITUTO', 'LA UNION FSA',
  'LANUS', 'PENAROL MDP', 'PLATENSE', 'QUIMSA', 'REGATAS C'];

function idxFalso(equipos) {
  const lista = equipos.map((e) => ({
    clave: INS.clave(e.nombre), nombre: e.nombre,
    record: { ganados: e.pg, perdidos: e.pp, pj: e.pg + e.pp },
    totales: { propio: { PTS: e.pf }, rival: { PTS: e.pc } },
    split: { LOCAL: { ganados: e.pg, perdidos: 0 }, VISITANTE: { ganados: 0, perdidos: e.pp } },
  }));
  return { lista: () => lista };
}

titulo('Los inscriptos de la LNB');
const ins = INS.delTorneo(LNB, 'unica');
check('el torneo declara 18 equipos', ins.length === 18, ins.length);
check('cada uno con su clave y sus alias', ins.every(i => i.clave && i.claves.length >= 1));
const r = INS.faltantes(ins, DEL_LIBRO);
check('los 11 del libro cruzan todos', r.sueltos.length === 0, r.sueltos.join(','));
check('faltan exactamente 7', r.lista.length === 7, r.lista.map(f => f.nombre).join(', '));
check('ninguno de los faltantes es del libro',
  r.lista.every(f => !DEL_LIBRO.map(INS.clave).includes(f.clave)));
check('BOCA y OBERÁ están entre los que faltan',
  ['BOCA', 'OBERÁ'].every(n => r.lista.some(f => f.nombre === n)));
check('marcados sinDatos', r.lista.every(f => f.sinDatos === true));
check('una zona inexistente cae a todas', INS.delTorneo(LNB, 'no-existe').length === 18);

titulo('La guarda de los alias');
const conSuelto = INS.faltantes(ins, DEL_LIBRO.concat(['UN EQUIPO RARO']));
check('un equipo del libro sin alias apaga el completado', conSuelto.lista.length === 0);
check('y lo nombra', conSuelto.sueltos[0] === 'UN EQUIPO RARO', conSuelto.sueltos.join(','));
const porAlias = INS.faltantes(ins, ['BOCA C.A.B.A.']);
check('un nombre del libro que solo cruza por alias cuenta como presente',
  porAlias.sueltos.length === 0 && !porAlias.lista.some(f => f.nombre === 'BOCA'));
check('pretemporada: libro vacío → los 18 faltan', INS.faltantes(ins, []).lista.length === 18);
check('sin documento no hay inscriptos', INS.delTorneo(null).length === 0);

titulo('Próximos partidos del calendario');
const prox = INS.proximos(LNB, 'unica', 'BOCA', '2026-10-01', 3);
check('BOCA tiene próximos partidos', prox.length > 0, prox.length);
check('ordenados por fecha', prox.every((p, i) => !i || prox[i - 1].fecha <= p.fecha));
check('ninguno antes de hoy', prox.every(p => p.fecha >= '2026-10-01'));
check('el cruce del 7/10 contra OBERÁ es de local',
  prox.some(p => p.fecha === '2026-10-07' && p.local && p.rival === 'OBERÁ'), JSON.stringify(prox[0]));
check('se cruza por clave: «Boca» encuentra lo mismo',
  INS.proximos(LNB, 'unica', 'Boca', '2026-10-01', 3).length === prox.length);
check('después del calendario no queda nada', INS.proximos(LNB, 'unica', 'BOCA', '2099-01-01').length === 0);
check('el aviso nombra la temporada',
  INS.textoSinDatos(LNB) === 'Sin datos estadísticos registrados aún (Temporada 2026-27)');
check('sin temporada, el aviso sin paréntesis', INS.textoSinDatos({}) === 'Sin datos estadísticos registrados aún');

titulo('La tabla con los inscriptos al pie');
const idx = idxFalso([
  { nombre: 'QUIMSA', pg: 2, pp: 0, pf: 180, pc: 150 },
  { nombre: 'FERRO', pg: 0, pp: 3, pf: 210, pc: 260 },
  { nombre: 'INSTITUTO', pg: 1, pp: 1, pf: 160, pc: 158 },
]);
const sin = INS.faltantes(ins, idx.lista().map(e => e.nombre)).lista;
const formato = { zonas: [{ desde: 1, hasta: 1, tono: 'verde', label: 'Clasifica' },
  { desde: -1, hasta: -1, tono: 'rojo', label: 'Descenso' }] };
const base = CL.tabla(idx, {});
const t = CL.tabla(idx, { inscriptos: sin });
check('sin inscriptos la tabla es la de siempre', base.length === 3);
check('con inscriptos están los 18', t.length === 18, t.length);
check('los que jugaron conservan su orden y su puesto',
  t.slice(0, 3).map(f => f.nombre + f.puesto).join() === base.map(f => f.nombre + f.puesto).join());
check('FERRO (0-3) queda arriba de los que no jugaron', t[2].nombre === 'FERRO' && !t[2].sinPartidos);
check('los 15 de abajo están marcados y en 0',
  t.slice(3).every(f => f.sinPartidos && f.pj === 0 && f.pg === 0 && f.pp === 0 && f.puntos === 0));
check('al pie van en orden alfabético',
  t.slice(3).every((f, i, a) => !i || String(a[i - 1].nombre).localeCompare(f.nombre) <= 0));
check('puestos correlativos después de los que jugaron', t[3].puesto === 4 && t[17].puesto === 18);
const tz = CL.tabla(idx, { inscriptos: sin, formato: formato });
check('ninguno sin partidos lleva zona', tz.filter(f => f.sinPartidos).every(f => f.zona === null));
check('el descenso se calcula sobre los que jugaron (cae en FERRO)',
  tz[2].zona && tz[2].zona.tono === 'rojo', JSON.stringify(tz[2].zona));
check('un inscripto que ya está en la tabla no se duplica',
  CL.tabla(idx, { inscriptos: [{ clave: 'QUIMSA', nombre: 'QUIMSA' }] }).length === 3);
const conManual = CL.tabla(idx, {
  manuales: [{ local: 'BOCA', visitante: 'QUIMSA', puntosLocal: 80, puntosVisitante: 70 }],
  inscriptos: sin,
});
check('un equipo con partido manual no aparece también como «sin partidos»',
  conManual.filter(f => INS.clave(f.nombre) === 'BOCA').length === 1
  && !conManual.find(f => INS.clave(f.nombre) === 'BOCA').sinPartidos);

titulo('El cableado');
const html = fs.readFileSync('./index.html', 'utf8');
check('index.html carga sgadd-inscriptos.js después del fixture',
  /sgadd-fixture\.js\?v=\d+"><\/script>\s*<script src="js\/sgadd-inscriptos\.js\?v=\d+">/.test(html));
const clasif = fs.readFileSync('./js/sgadd-clasificacion.js', 'utf8');
check('la tabla HTML resuelve los inscriptos', /inscriptosFaltantes\(idx\)/.test(clasif));
const eq = fs.readFileSync('./js/sgadd-equipos.js', 'utf8');
check('Equipos abre la ficha mínima', /inscriptosFichaMinima\(sinDatos\)/.test(eq));
const sc = fs.readFileSync('./js/sgadd-scouting.js', 'utf8');
check('Scouting ofrece los inscriptos y muestra su ficha', /Sin partidos todavía/.test(sc) && /scoutCruceSinDatos/.test(sc));
const ins_src = fs.readFileSync('./js/sgadd-inscriptos.js', 'utf8');
check('el módulo no toca el índice', !/construirIndice|reindexar/.test(ins_src.replace(/\/\*[\s\S]*?\*\//g, '')));

titulo('La UI en un contexto de navegador (escudos y fotos, puntos 93 y 95)');
{
  const vm = require('vm');
  const pedidosLogos = [];
  const ctx = {
    console: { warn() {}, log() {} },
    SGADD: require('./js/sgadd-core.js'),
    SGADD_UI: { esc: (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
      escJs: (v) => String(v).replace(/'/g, "\\'") },
    SGADD_APP: { estado: { fotos: { [require('./js/sgadd-core.js').clavePersona('BRUSSINO, JUAN IGNACIO') + '|LANUS']: '/fotos/428243',
      [require('./js/sgadd-core.js').clavePersona('MALO, X') + '|LANUS']: '/otra/cosa' } },
      planillaActual: () => ({ torneoId: 'liga-nacional-2026-27', zonaId: 'unica' }) },
    SGADD_FIXTURE: { estado: { torneo: 'liga-nacional-2026-27', doc: LNB }, cargarTorneo: () => Promise.resolve(LNB) },
    LOGOS: { resolver: (n) => { pedidosLogos.push(n); return Promise.resolve(); },
      getUrl: (n) => (n === 'LANUS' ? 'logos/liga-nacional/lanus.jpg' : null), iniciales: (n) => n.slice(0, 2) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('./js/sgadd-inscriptos.js', 'utf8') + ';this.F=inscriptosFaltantes;this.foto=torneoFotoJugador;this.img=torneoImagenJugador;', ctx);
  const idxUI = { lista: () => DEL_LIBRO.map(n => ({ nombre: n })) };
  const f1 = ctx.F(idxUI);
  check('los 7 faltantes salen en la UI', f1.length === 7, f1.length);
  check('y se piden sus escudos (precargarLogos solo pide los del índice)',
    pedidosLogos.length === 1 && pedidosLogos[0].length === 7, JSON.stringify(pedidosLogos));
  ctx.F(idxUI);
  check('una sola vez: repintar no vuelve a pedirlos', pedidosLogos.length === 1);
  check('la foto se arma con la base https del torneo',
    ctx.foto('BRUSSINO, JUAN IGNACIO', 'LANÚS') === 'https://www.laliganacional.com.ar/fotos/428243',
    ctx.foto('BRUSSINO, JUAN IGNACIO', 'LANÚS'));
  check('una ruta que no es /fotos/<id> no se arma', ctx.foto('MALO, X', 'LANUS') === null);
  check('un jugador sin foto no tiene', ctx.foto('NADIE', 'LANUS') === null);
  const conFoto = ctx.img('BRUSSINO, JUAN IGNACIO', 'LANUS', 'w-14 h-14');
  check('la ficha usa la foto, recortada en círculo', /src="https:\/\/www\.laliganacional\.com\.ar\/fotos\/428243"/.test(conFoto) && /rounded-full/.test(conFoto));
  check('y si no carga cae al escudo', /onerror="[^"]*lanus\.jpg/.test(conFoto));
  check('sin foto, el escudo como antes', /src="logos\/liga-nacional\/lanus\.jpg"/.test(ctx.img('NADIE', 'LANUS', 'w-14 h-14')));
  check('sin foto ni escudo, nada', ctx.img('NADIE', 'OTRO', 'w-14 h-14') === '');
}

console.log('\n' + '═'.repeat(68));
console.log(fail ? `✗ FALLARON ${fail}   (${ok} pasaron)` : `✓ TODO OK   ${ok} pasaron, 0 fallaron`);
process.exit(fail ? 1 : 0);
