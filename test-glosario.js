/* =====================================================================
   EL GLOSARIO · sin la columna ni la card de HOJAS, y PPP por JUGADA

   Pedido del club (2026-09-13):

     1 · sacar la columna «Hoja» de las tablas de definiciones y la card
         «Hojas» entera: el DT no abre la planilla, así que decir en qué
         hoja vive cada columna contesta una pregunta que en el panel
         nadie se hace;
     2 · `PPP OF` y `PPP DEF` son puntos por JUGADA, no por posesión: la
         fórmula es sobre PLAYS, y en este proyecto una posesión con
         rebote ofensivo son dos jugadas (punto 3).

   El glosario se GENERA del manual del motor (`generar-glosario.js`), así
   que las dos cosas se fijan en los dos lados: el archivo generado y el
   generador, que es el que tiene que seguir produciéndolo así la próxima
   vez que se corra. Ver el punto 20 de CLAUDE.md.
   ===================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

/* La vista usa `SGADD_UI.esc`/`escJs` al pintar el índice: se cargan los de
   verdad para que el HTML que se mide sea el que ve el DT. */
global.SGADD_UI = require('./js/sgadd-ui.js');
const G = require('./js/sgadd-glosario.js');
const GUI = require('./js/sgadd-glosarioui.js');
const NUC = require('./js/sgadd-core.js');
const UI = fs.readFileSync('./js/sgadd-glosarioui.js', 'utf8');
const GEN = fs.readFileSync('./generar-glosario.js', 'utf8');

titulo('1 · SIN HOJAS · ni la columna ni la card');

check('ninguna entrada trae el campo `hoja`', G.ENTRADAS.every(e => e.hoja === undefined),
  G.ENTRADAS.filter(e => e.hoja !== undefined).map(e => e.sigla).join(', '));
check('no hay familia de hojas', G.grupos().every(f => !/hojas/i.test(f)), G.grupos().join(' | '));
['4F', 'AC', 'BD', 'E / J'].forEach(s => check('  la abreviatura de hoja «' + s + '» no está', G.buscar(s) === null));
check('el buscador tampoco las devuelve', G.filtrar('Base Datos E / Base Datos J').length === 0);
/* Una métrica que se llama como una hoja NO se va con ellas: el corte es
   por sigla exacta, no por palabra. */
const metricas = Object.keys(NUC.METRICAS || {});
check('todas las métricas del panel siguen teniendo definición',
  metricas.every(k => !!G.buscar(k)), metricas.filter(k => !G.buscar(k)).join(', '));

const THS = UI.match(/<th class="[^"]*"[^>]*>[^<]*<\/th>/g) || [];
check('la tabla declara CUATRO encabezados', THS.length === 4, THS.length);
check('y ninguno es «Hoja»', THS.every(t => !/>\s*Hojas?\s*</i.test(t)), THS.join(' | '));
check('la fila no pinta `e.hoja`', !/e\.hoja/.test(UI));

const cuerpo = GUI.cuerpo();
check('el cuerpo pintado no tiene ninguna card de hojas', !/id="glos_K_Hojas"/.test(cuerpo) && !/>\s*Hojas\s*</.test(cuerpo));
const filasHtml = cuerpo.match(/<tr class="border-t[\s\S]*?<\/tr>/g) || [];
check('cada fila tiene cuatro celdas, igual que su encabezado',
  filasHtml.length === G.ENTRADAS.length && filasHtml.every(f => (f.match(/<td/g) || []).length === 4),
  filasHtml.length + ' filas');

titulo('2 · PPP · puntos por JUGADA');

const of = G.buscar('PPP OF');
const def = G.buscar('PPP DEF');
check('PPP OF se llama «Puntos por jugada ofensivos»', of && of.nombre === 'Puntos por jugada ofensivos', of && of.nombre);
check('con su fórmula sobre PLAYS', of && of.formula === 'PTS / PLAYS', of && of.formula);
check('y dice cuánto anotás por jugada', of && /^Cuánto anotás por jugada/.test(of.lectura), of && of.lectura);
check('PPP DEF se llama «Puntos por jugada defensivos»', def && def.nombre === 'Puntos por jugada defensivos', def && def.nombre);
check('con su fórmula sobre las PLAYS del rival', def && def.formula === 'PTS_opp / PLAYS_opp', def && def.formula);
check('y dice cuánto te anotan por jugada', def && def.lectura === 'Cuánto te anotan por jugada');
check('ninguna de las dos dice «posesión»',
  [of, def].every(e => e && !/posesi[oó]n/i.test([e.nombre, e.formula, e.lectura].join(' '))));
check('el tooltip de PPP OF dice lo mismo', G.corta('PPP OF') === of.lectura, G.corta('PPP OF'));

/* --- LOS RATINGS, AL REVÉS: el manual los NOMBRA bien y su FÓRMULA está
   por play (`PPP OF × 100`). Desde el punto 66 el panel los calcula sobre
   posesiones, así que lo que se corrige es la fórmula. Una entrada que se
   contradice a sí misma es peor que ninguna. --- */
const rof = G.buscar('RTNG OFF'), rdef = G.buscar('RTNG DEF'), rnet = G.buscar('NET RTNG');
check('RTNG OFF trae la sigla ORTG en el nombre', rof && /ORTG/.test(rof.nombre), rof && rof.nombre);
check('y su fórmula dice POS, no PPP × 100', rof && /POS/.test(rof.formula) && !/PPP OF × 100/.test(rof.formula), rof && rof.formula);
check('RTNG DEF trae DRTG y también va por posesiones', rdef && /DRTG/.test(rdef.nombre) && /POS/.test(rdef.formula), rdef && rdef.formula);
check('NET RTNG trae NET y dice que las dos puntas van por 100 posesiones',
  rnet && /NET/.test(rnet.nombre) && /100 posesiones/.test(rnet.formula), rnet && rnet.formula);
check('los tres dicen «cada 100 posesiones» en su lectura',
  [rof, rdef].every(e => e && /100 posesiones/.test(e.lectura)));
check('y ninguno dice PLAYS en la fórmula del rating',
  [rof, rdef].every(e => e && !/PLAYS(?!\s*−)/.test(e.formula.replace('PLAYS − RO', 'POS'))), rof && rof.formula);

/* NET PPP era el simétrico: «Diferencial por posesión» sobre una fórmula
   por jugada. Se corrige el nombre, no la fórmula. */
const npp = G.buscar('NET PPP');
check('NET PPP se llama «Diferencial por jugada»', npp && npp.nombre === 'Diferencial por jugada', npp && npp.nombre);
check('y no dice «posesión» en ninguna parte',
  npp && !/posesi[oó]n/i.test([npp.nombre, npp.formula, npp.lectura].join(' ')));

titulo('3 · EL GENERADOR · lo va a volver a producir así');

check('el generador descarta las abreviaturas de hoja', /SIGLAS_DE_HOJA/.test(GEN) && /splice\(i, 1\)/.test(GEN));
check('ya no les inventa una familia', !/'K · Hojas'/.test(GEN));
check('no escribe el campo `hoja`', !/\['sigla', 'nombre', 'formula', 'lectura', 'uso', 'hoja', 'familia'\]/.test(GEN));
check('declara la corrección de PPP OF y PPP DEF', /CORRECCIONES/.test(GEN)
  && /'Puntos por jugada ofensivos'/.test(GEN) && /'Puntos por jugada defensivos'/.test(GEN));

/* LA PRUEBA FUERTE: correr el generador de verdad contra el manual y
   exigir que produzca EXACTAMENTE el archivo commiteado. Solo donde el
   manual existe —vive en el repo del motor, en la máquina de quien
   administra—: en otro lado se dice que se saltea, no se da por bueno. */
const MANUAL = (GEN.match(/const MANUAL = '([^']+)'/) || [])[1];
const rutaManual = MANUAL ? MANUAL.replace(/\\\\/g, '\\') : null;
if (rutaManual && fs.existsSync(rutaManual)) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glosario-'));
  const destino = path.join(tmpDir, 'sgadd-glosario.js');
  const gen = GEN.replace("path.join(__dirname, 'js', 'sgadd-glosario.js')", JSON.stringify(destino));
  const script = path.join(tmpDir, 'generar.js');
  fs.writeFileSync(script, gen);
  try {
    execFileSync(process.execPath, [script], { stdio: 'pipe' });
    const nuevo = fs.readFileSync(destino, 'utf8').replace(/\r\n/g, '\n');
    const actual = fs.readFileSync('./js/sgadd-glosario.js', 'utf8').replace(/\r\n/g, '\n');
    check('regenerar desde el manual da el MISMO glosario commiteado', nuevo === actual);
  } catch (e) {
    check('el generador corre', false, e.message.slice(0, 200));
  }
} else {
  console.log('  · (el manual del motor no está en esta máquina: no se regenera)');
}

console.log('\n' + '═'.repeat(70));
if (fail === 0) console.log('✓ TODO OK   ' + ok + ' pasaron, 0 fallaron');
else { console.log('✗ HAY FALLAS   ' + ok + ' pasaron, ' + fail + ' fallaron'); process.exit(1); }
