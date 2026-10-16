#!/usr/bin/env node
/* =====================================================================
   LA CORRIDA COMPLETA · un solo comando, sin IA y sin conectores
     npm run auto-process                    todo
     npm run auto-process -- --ensayo        muestra los pasos y no corre nada
     npm run auto-process -- --sin-ingesta   saltea el paso 1 (no toca los sitios)
     npm run auto-process -- --solo auditar  un solo paso (ingesta, auditar, contenido, render)

   Los pasos, en orden:
     1 · INGESTA    motorstats-ingestion/herramientas/correr-lnb.js
                    sitio → .xlsx → Drive → motor → libro, y los paquetes de
                    play-by-play al KV del panel (LNB, LAB Norte, LAB Sur).
     2 · AUDITAR    server/bin/ecosistema.js auditar --json
                    catálogo, libros, tokens de los scripts, ingesta, torneos
                    y escudos. El informe queda en contenido/auto-process/.
     3 · CONTENIDO  generar-contenido.js por cada liga de CONTENIDO (abajo):
                    el Top 3 y las diez recetas, con los números del libro.
     4 · RENDER     centro-mando/renderizar.js --pendientes
                    las placas aprobadas en el Centro de Mando → PNG y PDF.

   NINGÚN PASO LLAMA A UN MODELO: los hijos corren con
   CENTRO_MANDO_MOTOR=no, que apaga la redacción con IA del Centro de Mando
   (punto 108). Aprobar una pieza sigue siendo una decisión editorial: este
   comando renderiza lo aprobado, no aprueba.

   Un paso que falla NO frena a los siguientes (el auditor y el render no
   dependen de que la ingesta de hoy haya salido). El código de salida es 1
   si alguno falló, para que la tarea programada lo registre.

   Log: contenido/auto-process/AAAA-MM-DD_HHMM.log
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = __dirname;
const INGESTA = process.env.ECOSISTEMA_INGESTA || path.join(RAIZ, '..', 'motorstats-ingestion');
const SALIDA = path.join(process.env.CENTRO_MANDO_DATOS || path.join(RAIZ, 'contenido'), 'auto-process');

/* Las ligas a las que se les arma contenido en cada corrida. Las Stories
   (Nivel 1) solo salen con nombres en APdeB; el resto va anónimo (punto 103). */
const CONTENIDO = [
  ['--liga', 'apb', '--zona', 'a'], ['--liga', 'apb', '--zona', 'a', '--nivel2'],
  ['--liga', 'apb', '--zona', 'b'], ['--liga', 'apb', '--zona', 'b', '--nivel2'],
  ['--liga', 'apb', '--zona', 'c'], ['--liga', 'apb', '--zona', 'c', '--nivel2'],
  ['--liga', 'lnb', '--nivel2'],
];

const a = process.argv.slice(2);
const ENSAYO = a.includes('--ensayo');
const SIN_INGESTA = a.includes('--sin-ingesta');
const iSolo = a.indexOf('--solo');
const SOLO = iSolo !== -1 ? a[iSolo + 1] : null;

const ahora = new Date(Date.now() - 3 * 3600 * 1000);   // hora de Argentina
const sello = ahora.toISOString().slice(0, 16).replace('T', '_').replace(':', '');
fs.mkdirSync(SALIDA, { recursive: true });
const LOG = path.join(SALIDA, sello + '.log');
function log(t) { console.log(t); fs.appendFileSync(LOG, t + '\n'); }

const ENV = Object.assign({}, process.env, { CENTRO_MANDO_MOTOR: 'no' });

function correr(titulo, cwd, args, opciones) {
  log('\n▶ ' + titulo + '\n  ' + path.relative(RAIZ, cwd || RAIZ) + '> node ' + args.join(' '));
  if (ENSAYO) return { ok: true, salida: '' };
  const r = spawnSync(process.execPath, args, { cwd: cwd || RAIZ, env: ENV, encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024, timeout: (opciones && opciones.techo) || 60 * 60 * 1000 });
  const salida = (r.stdout || '') + (r.stderr || '');
  if (!(opciones && opciones.silencio)) fs.appendFileSync(LOG, salida);
  const ok = r.status === 0 || (opciones && opciones.aceptar && opciones.aceptar.includes(r.status));
  log('  ' + (ok ? '✓' : '✖') + ' salió con ' + r.status + (r.error ? ' · ' + r.error.message : ''));
  return { ok, salida, codigo: r.status };
}

const pasos = {
  ingesta() {
    if (SIN_INGESTA) { log('\n▶ INGESTA · salteada (--sin-ingesta)'); return true; }
    const f = path.join(INGESTA, 'herramientas', 'correr-lnb.js');
    if (!fs.existsSync(f)) { log('\n▶ INGESTA · no está ' + f + ': salteada'); return true; }
    return correr('INGESTA · sitios → libros → paquetes', INGESTA, [f]).ok;
  },
  auditar() {
    /* Sale con 1 si hay errores: eso es un resultado, no una falla del paso. */
    const r = correr('AUDITAR · el ecosistema', RAIZ, ['server/bin/ecosistema.js', 'auditar', '--json'], { aceptar: [1], silencio: true });
    if (ENSAYO) return true;
    let h = [];
    try { h = JSON.parse(r.salida.slice(r.salida.indexOf('['))); } catch (_) { log('  ✖ el informe no es JSON'); return false; }
    fs.writeFileSync(path.join(SALIDA, sello + '_auditoria.json'), JSON.stringify(h, null, 2));
    const errores = h.filter((x) => x.nivel === 'ERROR');
    log('  ' + errores.length + ' errores · ' + (h.length - errores.length) + ' avisos');
    errores.forEach((x) => log('    ✖ ' + x.area + ' · ' + x.sujeto + ' · ' + x.texto + (x.arreglo ? '\n      → ' + x.arreglo : '')));
    return errores.length === 0;
  },
  contenido() {
    let ok = true;
    for (const args of CONTENIDO) {
      ok = correr('CONTENIDO · ' + args.join(' '), RAIZ, ['generar-contenido.js'].concat(args), { techo: 10 * 60 * 1000 }).ok && ok;
    }
    return ok;
  },
  render() {
    return correr('RENDER · placas aprobadas → PNG y PDF', RAIZ, ['centro-mando/renderizar.js', '--pendientes'], { techo: 20 * 60 * 1000 }).ok;
  },
};

const orden = ['ingesta', 'auditar', 'contenido', 'render'];
if (SOLO && !orden.includes(SOLO)) { console.error('--solo tiene que ser uno de: ' + orden.join(', ')); process.exit(2); }

log('MotorStats · corrida completa · ' + sello + (ENSAYO ? ' · ENSAYO' : ''));
const resultado = {};
for (const p of orden) {
  if (SOLO && p !== SOLO) continue;
  try { resultado[p] = pasos[p](); }
  catch (e) { log('  ✖ ' + p + ': ' + e.message); resultado[p] = false; }
}
log('\nResumen · ' + Object.entries(resultado).map(([k, v]) => k + ' ' + (v ? '✓' : '✖')).join(' · '));
log('Log: ' + path.relative(RAIZ, LOG));
process.exit(Object.values(resultado).every(Boolean) ? 0 : 1);
