#!/usr/bin/env node
/* =====================================================================
   CLI · analítica de play-by-play en Upstash (capa de laboratorio, punto 62)

     node server/bin/pbp.js estado --club jujuy --categoria jujuy-primera
     node server/bin/pbp.js subir  --club jujuy --categoria jujuy-primera \
       --dir C:/Users/Pc/Documents/motorstats-ingestion/salida/conferencia-norte/web [--confirmar]

   `subir` lee los paquetes que dejó `motorstats-ingestion/exportar-web.js`
   —un JSON por equipo más `indice.json`— y los escribe en el hash
   `sgadd:pbp:<club>:<categoría>`, un campo por equipo.

   SIN `--confirmar` NO ESCRIBE: muestra qué subiría. Escribir en KV de
   producción es un gesto que se hace a propósito.

   LO QUE NO HACE, a propósito:
   · no borra campos: un equipo que ya no viene en la carpeta queda como
     estaba (se avisa). Borrar es otra decisión y no se toma de pasada;
   · no toca el catálogo: habilitar la capa es `catalogo.js laboratorio`;
   · no sube un paquete con otro esquema, ni uno cuyo equipo no esté en el
     libro de esa categoría, cuando se puede verificar (`--sin-verificar`
     lo saltea si el libro no se puede leer).
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
require('../lib/env.js').cargar();
const kv = require('../lib/kv.js');
const catalogo = require('../lib/catalogo.js');
const { claveKV, campoDeEquipo, CAMPO_INDICE } = require('../api/pbp.js');

const ESQUEMA = 'motorstats-ingestion/analitica-pbp-web@1';
/* Un paquete de hoy pesa ~23 KB. Un techo holgado frena el error de subir
   el `analitica-pbp.json` completo, o partidos crudos, por equivocación. */
const MAX_KB = 200;

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else o._.push(argv[i]);
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  const cmd = o._[0];
  const club = String(o.club || '').toLowerCase();
  const slug = String(o.categoria || '').toLowerCase();
  if (!cmd || !club || !slug) {
    console.log('Uso: pbp.js estado|subir --club <slug> --categoria <slug> [--dir <carpeta web>] [--confirmar]');
    process.exit(1);
  }
  const cascada = await catalogo.cargar();
  const cat = catalogo.resolver(cascada.catalogo, club, slug);
  if (!cat || cat.slug !== slug) { console.error('  Esa categoría no está en el catálogo: ' + club + '/' + slug); process.exit(1); }
  if (!kv.configurado()) { console.error('  Upstash no está configurado.'); process.exit(1); }
  const clave = claveKV(club, slug);

  if (cmd === 'estado') {
    const campos = await kv.comando(['HKEYS', clave], { soloLectura: true });
    const lista = Array.isArray(campos) ? campos : [];
    console.log('\n  ' + clave + ' · ' + lista.length + ' campos');
    const ind = (await kv.leerCampos(clave, [CAMPO_INDICE]))[CAMPO_INDICE];
    if (ind) console.log('  índice: ' + (ind.competencia || '') + ' · generado ' + ind.generadoEl + ' · ' + (ind.equipos || []).length + ' equipos');
    lista.filter(c => c !== CAMPO_INDICE).sort().forEach(c => console.log('    ' + c));
    console.log('  capa habilitada en la categoría: ' + ((cat.laboratorio || []).indexOf('pbp') !== -1 ? 'SÍ' : 'no'));
    return;
  }

  if (cmd !== 'subir') { console.error('  Comando desconocido: ' + cmd); process.exit(1); }
  const dir = o.dir && o.dir !== true ? path.resolve(String(o.dir)) : null;
  if (!dir || !fs.existsSync(path.join(dir, 'indice.json'))) { console.error('  Falta --dir con un indice.json de exportar-web.js'); process.exit(1); }
  const indice = JSON.parse(fs.readFileSync(path.join(dir, 'indice.json'), 'utf8'));
  if (indice.esquema !== ESQUEMA) { console.error('  El índice no es ' + ESQUEMA); process.exit(1); }

  /* Los equipos del LIBRO de la categoría, para no subir el análisis de
     un torneo equivocado a una categoría que no lo juega. */
  let delLibro = null;
  if (!o['sin-verificar']) {
    try {
      const gs = require('../lib/google-sheets.js');
      const libro = await gs.obtenerLibro(cat.sheetId);
      const bde = (libro.hojas || {})['Base Datos E'] || [];
      const iE = (bde[0] || []).indexOf('EQUIPO');
      delLibro = new Set(bde.slice(1).map(f => campoDeEquipo(f[iE])).filter(Boolean));
    } catch (e) {
      console.error('  No se pudo leer el libro para verificar los equipos (' + e.message + '). Usá --sin-verificar si hace falta.');
      process.exit(1);
    }
  }

  const escribir = {};
  const resumen = [];
  for (const e of indice.equipos || []) {
    const txt = fs.readFileSync(path.join(dir, e.archivo), 'utf8');
    const kb = Buffer.byteLength(txt) / 1024;
    const p = JSON.parse(txt);
    if (p.esquema !== ESQUEMA) { console.error('  ' + e.archivo + ': esquema distinto'); process.exit(1); }
    if (kb > MAX_KB) { console.error('  ' + e.archivo + ': ' + kb.toFixed(0) + ' KB, más que el techo de ' + MAX_KB); process.exit(1); }
    const campo = campoDeEquipo(p.equipo);
    if (delLibro && !delLibro.has(campo)) { console.error('  ' + p.equipo + ' no juega en el libro de ' + club + '/' + slug + '.'); process.exit(1); }
    escribir[campo] = p;
    resumen.push({ campo, equipo: p.equipo, kb: kb.toFixed(0), validados: p.partidos.validados, jugados: p.partidos.jugados });
  }
  if (delLibro) {
    const faltan = [...delLibro].filter(c => !escribir[c]);
    if (faltan.length) console.log('  Aviso: equipos del libro sin paquete: ' + faltan.join(', '));
  }
  const indicePublico = {
    esquema: ESQUEMA, competencia: indice.competencia, generadoEl: indice.generadoEl,
    partidos: indice.partidos, validados: indice.validados,
    equipos: resumen.map(r => ({ equipo: r.equipo, campo: r.campo, validados: r.validados, jugados: r.jugados })),
  };

  console.log('\n  destino: ' + clave + (o.confirmar ? '' : '   (SIN --confirmar: no se escribe nada)'));
  resumen.forEach(r => console.log('    ' + r.campo.padEnd(22) + String(r.validados).padStart(3) + '/' + r.jugados + ' partidos · ' + r.kb + ' KB'));
  if (!o.confirmar) return;

  /* De a un equipo por pedido: cada HSET queda chico y un corte a la mitad
     deja escritos los que llegaron, sin mezclar ningún campo. El índice va
     ÚLTIMO: nombra solo equipos que ya están arriba. */
  for (const r of resumen) await kv.escribirCampos(clave, { [r.campo]: escribir[r.campo] });
  await kv.escribirCampos(clave, { [CAMPO_INDICE]: indicePublico });
  const n = await kv.tamanoHash(clave);
  console.log('\n  Escrito. El hash tiene ' + n + ' campos.');
}

main().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
