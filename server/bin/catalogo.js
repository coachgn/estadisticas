#!/usr/bin/env node
/* =====================================================================
   CLI de administración del catálogo

   Da de alta, baja y lista clubes y categorías SIN tocar código y SIN
   redeplegar: escribe en Upstash KV, que el servidor lee en runtime.

     node server/bin/catalogo.js listar
     node server/bin/catalogo.js alta   --club X --categoria Y --sheet <id> …
     node server/bin/catalogo.js baja   --club X [--categoria Y]
     node server/bin/catalogo.js exportar
     node server/bin/catalogo.js sembrar

   ---------------------------------------------------------------------
   LEE LA CASCADA, ESCRIBE SOLO EN KV

   `alta` toma el catálogo VIGENTE —venga de donde venga— le aplica el
   cambio y guarda el resultado completo en KV. Así la primera alta
   promueve el catálogo del código a KV sin perder nada, y a partir de ahí
   KV manda.

   Escribir solo en KV es a propósito: si además tocara el código haría
   falta un commit, que es justo lo que esto viene a evitar.
   ===================================================================== */
'use strict';

require('../lib/env.js').cargar();
const kv = require('../lib/kv.js');
const catalogo = require('../lib/catalogo.js');

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.indexOf('--') !== 0) { o._.push(a); continue; }
    const clave = a.slice(2), sig = argv[i + 1];
    if (sig === undefined || sig.indexOf('--') === 0) o[clave] = true;
    else { o[clave] = sig; i++; }
  }
  return o;
}

/* Un `sheetId` NO se imprime entero, ni siquiera en la terminal del
   administrador: la salida de un comando termina pegada en un chat más
   seguido de lo que uno quiere. Con las primeras y últimas letras alcanza
   para reconocerlo. */
function enmascarar(id) {
  const s = String(id || '');
  if (!s) return '(sin libro)';
  return s.length <= 12 ? '···' : s.slice(0, 6) + '…' + s.slice(-4);
}

const AYUDA = `
CLI del catálogo · da de alta clubes sin redeplegar

  listar                    muestra el catálogo vigente y de dónde sale
  alta                      agrega o actualiza un club / una categoría
    --club       <slug>       obligatorio · ej: reconquista
    --nombre     <texto>      nombre visible del club
    --liga       <slug>       carpeta de escudos · ej: la-plata
    --equipo     <EQUIPO>     el equipo propio, como lo escribe la planilla
    --categoria  <slug>       ej: reconquista-primera
    --label      <texto>      nombre visible de la categoría
    --sheet      <id>         el id del libro de Google
  baja                      saca una categoría, o el club entero
    --club       <slug>       obligatorio
    --categoria  <slug>       si se omite, se borra el CLUB completo
  exportar                  el catálogo en JSON, para SGADD_CATALOGO
  sembrar                   copia el catálogo vigente a KV, sin cambios

OJO con --equipo: se compara con claveEquipo(), así que la LETRA importa.
"RECONQUISTA" no reconoce a "RECONQUISTA 'A'" y ese cliente se queda sin
ver ningún equipo (punto 19 de CLAUDE.md).
`;

/* EL GUARD QUE EVITA ROMPER PRODUCCIÓN.

   Va en `guardar()` y no en un comando: `alta`, `baja` y `sembrar`
   escriben el catálogo ENTERO, así que los tres pueden pisar los
   `sheetId` — la primera versión solo cuidaba `sembrar` y `alta` volvió
   a armar la bomba a los dos minutos.

   El catálogo del CÓDIGO resuelve cada `sheetId` desde una variable de
   entorno (`SHEET_DEPORTIVO_PRIMERA` y compañía). Esas viven en Vercel,
   no en la máquina de quien administra: escribir desde acá guarda un
   catálogo con los sheetId VACÍOS.

   Y KV le gana al código, así que apenas el servidor lo lea, esa
   categoría queda `activo: false` y su carga devuelve 502. Un club que
   hoy funciona se rompe sin que nadie haya tocado su planilla.

   La señal que lo distingue de un catálogo legítimamente incompleto: si
   esta máquina no tiene NINGUNA `SHEET_*` definida, los vacíos no son una
   decisión — son el síntoma de estar escribiendo desde el lugar
   equivocado. */
function revisarLibros(cat, forzar) {
  const todas = [];
  Object.keys(cat).forEach(c => Object.keys(cat[c].categorias || {})
    .forEach(s => todas.push(c + '/' + s + (cat[c].categorias[s].sheetId ? '' : '  ← SIN LIBRO'))));
  const sinLibro = todas.filter(x => /SIN LIBRO/.test(x));
  if (!sinLibro.length) return;

  const hayVariables = Object.keys(process.env).some(k => k.indexOf('SHEET_') === 0);
  if (hayVariables || forzar) {
    console.log('  AVISO · quedan sin libro:');
    sinLibro.forEach(x => console.log('      ' + x.replace('  ← SIN LIBRO', '')));
    return;
  }

  console.error('');
  console.error('  NO se guardó nada, y es a propósito.');
  console.error('');
  console.error('  Estas categorías quedarían SIN sheetId:');
  sinLibro.forEach(x => console.error('      ' + x));
  console.error('');
  console.error('  Esta máquina no tiene ninguna variable SHEET_* definida, así que');
  console.error('  el catálogo del código no puede resolverlos: viven en Vercel.');
  console.error('');
  console.error('  KV le gana al código. Apenas el servidor lo leyera, esos clubes');
  console.error('  pasarían de funcionar a 502, sin que nadie tocara su planilla.');
  console.error('');
  console.error('  Dos salidas:');
  console.error('    a) poné las SHEET_* en server/.env y repetí el comando');
  console.error('    b) repetilo con --sin-libros si de verdad querés dejarlas vacías');
  console.error('');
  process.exit(1);
}

/* Escribe el catálogo entero en KV, validando ANTES. Un catálogo roto en
   KV se ignora al leer —la cascada baja sola— pero dejarlo escrito
   confunde al que después mire por qué su alta "no tomó". */
async function guardar(cat, opciones) {
  const mal = catalogo.validar(cat);
  if (mal) {
    console.error('  El catálogo quedaría inválido: ' + mal);
    console.error('  No se guardó nada.');
    process.exit(1);
  }
  revisarLibros(cat, opciones && opciones.forzar);
  await kv.escribir(catalogo.CLAVE_KV, cat);
  catalogo.limpiarCache();
}

function exigirKV() {
  if (kv.configurado()) return;
  console.error('');
  console.error('  Upstash no está configurado. Hacen falta dos variables en server/.env:');
  console.error('');
  console.error('    UPSTASH_REDIS_REST_URL=https://<algo>.upstash.io');
  console.error('    UPSTASH_REDIS_REST_TOKEN=<el token de escritura>');
  console.error('');
  console.error('  (o los nombres KV_REST_API_URL / KV_REST_API_TOKEN, que');
  console.error('   son los que inyecta la integración de Vercel)');
  console.error('');
  process.exit(1);
}

(async () => {
  const o = args(process.argv.slice(2));
  const cmd = o._[0];

  if (!cmd || o.help || cmd === 'ayuda') { console.log(AYUDA); process.exit(cmd ? 0 : 1); }

  const cascada = await catalogo.cargar({ forzar: true });
  const cat = JSON.parse(JSON.stringify(cascada.catalogo));

  /* -------------------------------------------------- listar */
  if (cmd === 'listar') {
    console.log('');
    console.log('  origen del catálogo:  ' + cascada.origen +
      (kv.configurado() ? '' : '   (Upstash sin configurar)'));
    if (cascada.aviso) console.log('  AVISO · ' + cascada.aviso);
    console.log('');
    Object.keys(cat).forEach(id => {
      const c = cat[id];
      console.log('  ' + id + '   ' + c.nombre + '   liga: ' + (c.liga || '—'));
      console.log('      equipo propio: ' + (c.equipoPropio || '(ninguno)'));
      Object.keys(c.categorias || {}).forEach(s => {
        const k = c.categorias[s];
        const estado = k.sheetId ? 'CONECTADA' : 'SIN LIBRO ';
        console.log('      ' + estado + '  ' + s.padEnd(24) + k.label +
          '   ' + enmascarar(k.sheetId));
      });
      console.log('');
    });
    return;
  }

  /* -------------------------------------------------- exportar */
  if (cmd === 'exportar') {
    console.log(JSON.stringify(cat, null, 2));
    console.error('');
    console.error('  Para usarlo sin Upstash, pegalo en la variable SGADD_CATALOGO.');
    console.error('  OJO: trae los sheetId en claro. Es un secreto.');
    console.error('');
    return;
  }

  /* -------------------------------------------------- sembrar */
  if (cmd === 'sembrar') {
    exigirKV();

    await guardar(cat, { forzar: !!o['sin-libros'] });
    console.log('  catálogo copiado a KV desde: ' + cascada.origen);
    console.log('  a partir de ahora manda KV, y los cambios NO piden redeploy.');
    return;
  }

  /* -------------------------------------------------- alta */
  if (cmd === 'alta') {
    exigirKV();
    const club = String(o.club || '').trim().toLowerCase();
    if (!club) { console.error('  Falta --club'); process.exit(1); }

    const existia = !!cat[club];
    if (!existia) {
      if (!o.nombre) {
        console.error('  Club nuevo: hace falta --nombre');
        process.exit(1);
      }
      cat[club] = { nombre: String(o.nombre), liga: String(o.liga || ''),
        equipoPropio: o.equipo ? String(o.equipo) : null, categorias: {} };
    } else {
      if (o.nombre) cat[club].nombre = String(o.nombre);
      if (o.liga) cat[club].liga = String(o.liga);
      if (o.equipo) cat[club].equipoPropio = String(o.equipo);
    }

    if (o.categoria) {
      const slug = String(o.categoria).trim().toLowerCase();
      const previa = cat[club].categorias[slug] || {};
      cat[club].categorias[slug] = {
        label: o.label ? String(o.label) : (previa.label || slug),
        /* Sin `--sheet` la categoría entra SIN libro, y eso es válido: es
           la que "viene en camino". Aparece en el selector deshabilitada
           en vez de dejar entrar a una sección vacía (punto 6). */
        sheetId: o.sheet ? String(o.sheet) : (previa.sheetId || ''),
      };
    }

    if (!Object.keys(cat[club].categorias).length) {
      console.error('  Un club sin categorías no se puede abrir. Agregá --categoria.');
      process.exit(1);
    }

    await guardar(cat, { forzar: !!o['sin-libros'] });
    console.log('');
    console.log('  ' + (existia ? 'actualizado' : 'ALTA') + ': ' + club + ' · ' + cat[club].nombre);
    Object.keys(cat[club].categorias).forEach(s => {
      const k = cat[club].categorias[s];
      console.log('    ' + (k.sheetId ? 'CONECTADA' : 'SIN LIBRO ') + '  ' + s + '   ' + k.label);
    });
    console.log('');
    console.log('  Ya está vigente: el servidor lo lee en runtime, sin redeploy.');
    if (!cat[club].equipoPropio) {
      console.log('  AVISO: sin equipo propio, sus clientes no van a ver ninguna ficha.');
    }
    console.log('  Falta compartir la planilla con la Service Account y emitir los links.');
    console.log('');
    return;
  }

  /* -------------------------------------------------- baja */
  if (cmd === 'baja') {
    exigirKV();
    const club = String(o.club || '').trim().toLowerCase();
    if (!club || !cat[club]) { console.error('  Ese club no está: ' + club); process.exit(1); }

    if (o.categoria) {
      const slug = String(o.categoria).trim().toLowerCase();
      if (!cat[club].categorias[slug]) {
        console.error('  Esa categoría no está: ' + slug); process.exit(1);
      }
      if (Object.keys(cat[club].categorias).length === 1) {
        console.error('  Es la única categoría del club: usá `baja --club ' + club + '`');
        process.exit(1);
      }
      delete cat[club].categorias[slug];
      await guardar(cat, { forzar: !!o['sin-libros'] });
      console.log('  baja de la categoría ' + slug + ' en ' + club);
    } else {
      delete cat[club];
      await guardar(cat, { forzar: !!o['sin-libros'] });
      console.log('  baja del club ' + club + ' entero');
    }
    /* Los tokens ya emitidos siguen siendo válidos hasta vencer: no hay
       revocación individual. Un cliente de un club dado de baja va a
       recibir 404, que es lo correcto, pero conviene saberlo. */
    console.log('  Los links ya emitidos siguen firmados: van a dar 404, no 401.');
    return;
  }

  console.error('  Comando desconocido: ' + cmd);
  console.log(AYUDA);
  process.exit(1);
})().catch(e => {
  console.error('');
  console.error('  ERROR: ' + (e && e.message ? e.message : e));
  if (e && e.codigo === 'KV_TOKEN') {
    console.error('  El token de Upstash no es válido, o es de solo lectura.');
  }
  console.error('');
  process.exit(1);
});
