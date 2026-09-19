#!/usr/bin/env node
/* =====================================================================
   Repara el catálogo de KV y siembra el bloque `competencia` del club.

     node server/bin/reparar-kv.js --respaldo <ruta.json> [--escribir]

   POR QUÉ EXISTE

   `kv.escribir(clave, valor)` YA hace `JSON.stringify` adentro. Pasarle un
   valor ya serializado guarda un JSON de un JSON: al releerlo sale un
   string y no un objeto, `validar()` lo rechaza, y la cascada degrada al
   literal del código. El panel sigue en pie —para eso está la cascada—
   pero se pierde lo que vive SOLO en KV: los planes.

   Este script vuelve a escribir el catálogo BIEN (objeto crudo) y, de
   paso, deja sembrado el bloque `competencia` a nivel club, que es la
   precondición que `catalogo-mutar.zonas()` exige para aceptar una
   publicación POR CATEGORÍA.

   ---------------------------------------------------------------------
   DE DÓNDE SALE EL CATÁLOGO QUE SE ESCRIBE

   Del respaldo, NO de la cascada. Si se leyera la cascada estando KV
   inválido, se leería el literal del código —que no tiene los planes— y
   se escribiría esa versión empobrecida encima. El respaldo es el único
   lugar donde el estado previo sobrevive.

   ---------------------------------------------------------------------
   SIN `--escribir` NO TOCA NADA

   Por defecto hace el ensayo completo y muestra el resultado. La
   escritura hay que pedirla.
   ===================================================================== */
'use strict';

require('../lib/env.js').cargar();
const fs = require('fs');
const kv = require('../lib/kv.js');
const catalogo = require('../lib/catalogo.js');
const mutar = require('../lib/catalogo-mutar.js');

const CLAVE = 'sgadd:catalogo';

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].indexOf('--') !== 0) continue;
    const c = argv[i].slice(2), s = argv[i + 1];
    if (s === undefined || s.indexOf('--') === 0) o[c] = true; else { o[c] = s; i++; }
  }
  return o;
}

/* El bloque a nivel club sale de `clubes/<club>.json`, pero SIN
   `porCategoria`: ese mapa está indexado por id de planilla
   (`primera-clausura-2026`) y el catálogo de KV usa slugs
   (`reconquista-primera`). Sembrar una clave que ninguna pantalla busca
   dejaría un override invisible que después nadie entiende por qué no se
   aplica. Las categorías las va a escribir el propio botón «Publicar»,
   con la clave que la UI realmente usa. */
function bloqueDeClub(clubId) {
  const ruta = require('path').join(__dirname, '..', '..', 'clubes', clubId + '.json');
  const json = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  if (!json.competencia) return null;
  return {
    ordenTabla: json.competencia.ordenTabla,
    formatos: json.competencia.formatos,
    porTramo: json.competencia.porTramo,
  };
}

(async () => {
  const o = args(process.argv.slice(2));
  const rutaResp = o.respaldo;
  const club = o.club || 'reconquista';

  if (!rutaResp) {
    console.log('Falta --respaldo <ruta.json>.');
    console.log('Es el archivo con el catálogo previo; sin él no se recuperan los planes.');
    process.exit(1);
  }

  /* --- 1. El estado previo, del respaldo ------------------------------ */
  const resp = JSON.parse(fs.readFileSync(rutaResp, 'utf8'));
  const original = resp.kvCrudo && resp.kvCrudo.valor;
  if (!original || typeof original !== 'object' || Array.isArray(original)) {
    console.log('El respaldo no trae un catálogo utilizable en `kvCrudo.valor`.');
    process.exit(1);
  }
  console.log('respaldo    : ' + rutaResp);
  console.log('tomado el   : ' + (resp.guardadoEl || '(sin fecha)'));
  console.log('clubes      : ' + Object.keys(original).join(', '));
  Object.keys(original).forEach((k) => {
    console.log('   ' + k.padEnd(14) + 'plan=' + (original[k].plan || '(sin plan)'));
  });

  /* --- 2. Se le agrega el bloque `competencia` del club --------------- */
  const bloque = bloqueDeClub(club);
  if (!bloque) {
    console.log('\nclubes/' + club + '.json no declara `competencia`; no hay nada que sembrar.');
    process.exit(1);
  }
  /* Se usa la MISMA función pura que ejecuta el botón «Publicar», ámbito
     club (`categoria: null`). Nada escrito a mano: si el guard rechazara
     esto, también rechazaría la publicación real. */
  const r = mutar.zonas(original, { club: club, categoria: null, competencia: bloque });
  if (!r.ok) {
    console.log('\nLa mutación fue rechazada: ' + r.error);
    process.exit(1);
  }
  console.log('\nbloque `competencia` para ' + club + ': '
    + Object.keys(bloque.formatos || {}).join(', '));

  if (!o.escribir) {
    console.log('\nENSAYO. No se escribió nada. Repetir con --escribir para aplicarlo.');
    return;
  }

  /* --- 3. Escritura: el OBJETO, sin stringify previo ------------------ */
  await kv.escribir(CLAVE, r.catalogo);
  console.log('\nescrito en KV.');

  /* --- 4. Verificación por la cascada real ---------------------------- */
  catalogo.limpiarCache();
  const post = await catalogo.cargar();
  const cp = post.catalogo || post.valor || post;

  console.log('\n=== VERIFICACIÓN ===');
  console.log('  origen : ' + post.origen + (post.aviso ? ('  aviso: ' + post.aviso) : ''));
  if (post.origen !== 'kv') {
    console.log('  ** KV sigue sin ser la fuente. Revisar antes de continuar. **');
    process.exitCode = 1;
  }
  Object.keys(cp).forEach((k) => {
    const c = cp[k];
    console.log('  ' + k.padEnd(14) + 'plan=' + (c.plan || '(sin plan)')
      + '  competencia=' + (c.competencia ? 'sí' : 'no')
      + '  categorias=' + Object.keys(c.categorias || {}).length);
  });

  /* --- 5. ¿Publicar por categoría deja de rebotar? -------------------- */
  console.log('\n=== el guard de `zonas` por categoría ===');
  const prueba = { formatos: { regular: { label: 'Fase regular', zonas: [] } } };
  Object.keys((cp[club] || {}).categorias || {}).forEach((slug) => {
    const p = mutar.zonas(cp, { club: club, categoria: slug, competencia: prueba });
    console.log('  ' + slug.padEnd(22) + (p.ok ? 'OK · pasa' : 'RECHAZA: ' + p.error));
  });
})().catch((e) => {
  console.log('ERROR: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
