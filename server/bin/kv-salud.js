#!/usr/bin/env node
/* =====================================================================
   SGADD · Healthcheck de Upstash · antes y después de rotar el token

       node server/bin/kv-salud.js            solo lee
       node server/bin/kv-salud.js --escribir  prueba también escribir

   PARA QUÉ EXISTE. Rotar una credencial de un servicio que está sirviendo
   tiene un modo de fallar silencioso: el token nuevo entra con permisos
   distintos —solo lectura, o sin acceso a una de las bases— y no se nota
   hasta que alguien intenta dar de alta un cliente y el alta se pierde.

   Esto lo prueba de verdad: lee las DOS claves que sostienen el producto
   y, con `--escribir`, hace un ida y vuelta completo sobre una clave de
   prueba propia. NUNCA escribe sobre el padrón ni sobre el catálogo: una
   verificación que puede romper lo que verifica no sirve.
   ===================================================================== */
'use strict';

require('../lib/env.js').cargar();
const kv = require('../lib/kv.js');
const catalogo = require('../lib/catalogo.js');
const admins = require('../lib/admins.js');
const clientes = require('../lib/clientes.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');

const CLAVE_PRUEBA = 'sgadd:salud';

const args = process.argv.slice(2);
const conEscritura = args.indexOf('--escribir') !== -1;

let fallos = 0;
const ok = (t, d) => console.log('  ✓ ' + t + (d ? '   ' + d : ''));
const mal = (t, d) => { fallos++; console.log('  ✗ ' + t + (d ? '   ' + d : '')); };
const linea = (t) => console.log('\n' + t + '\n' + '─'.repeat(66));

(async () => {
  console.log('');

  /* ================================================ 1 · qué hay configurado */
  linea('CREDENCIALES');

  const c = kv.credenciales();
  if (!c.url) { mal('falta la URL de Upstash'); }
  else ok('URL', c.url.replace(/^https:\/\//, '').slice(0, 28) + '…');

  const huella = (t) => t ? (t.slice(0, 6) + '…' + t.slice(-4) + '  (' + t.length + ' chars)') : '—';
  ok('token completo', huella(c.token));
  ok('token de lectura', huella(c.tokenLectura));
  ok('token LEGACY', huella(c.tokenLegacy));

  if (!c.token && !c.tokenLectura && !c.tokenLegacy) {
    mal('no hay ningún token: no se puede probar nada');
    process.exit(1);
  }

  /* EL LEGACY ES DE TRANSICIÓN. Si queda puesto, el token que se quiso
     revocar sigue vivo y la rotación no rotó nada. */
  if (c.tokenLegacy || c.tokenLecturaLegacy) {
    console.log('');
    console.log('  ⚠  Hay un token LEGACY configurado. Es de transición:');
    console.log('     mientras esté, el token viejo sigue sirviendo.');
    console.log('     Cuando el nuevo ande, borralo y revocá el viejo en Upstash.');
  }

  /* ================================================ 2 · leer lo que importa */
  linea('LECTURA · las dos claves que sostienen el producto');

  let padronC = null;
  try {
    padronC = await clientes.cargar();
    const clubes = {};
    Object.keys(padronC).forEach(m => {
      const k = padronC[m].club || '(sin club)';
      clubes[k] = (clubes[k] || 0) + 1;
    });
    ok('padrón de CLIENTES', Object.keys(padronC).length + ' mails · '
      + (Object.keys(clubes).map(k => k + ':' + clubes[k]).join(' ') || 'vacío'));
  } catch (e) {
    mal('padrón de CLIENTES', e.codigo || e.message);
  }

  try {
    const padronA = await admins.cargar();
    const conClave = Object.keys(padronA).filter(m => padronA[m].clave).length;
    ok('padrón de ADMINS', conClave + ' de ' + AUTH.ADMINS.length + ' con clave');
  } catch (e) {
    mal('padrón de ADMINS', e.codigo || e.message);
  }

  try {
    const cat = await catalogo.cargar({ forzar: true });
    const ids = Object.keys(cat.catalogo || {});
    const conZonas = ids.filter(id => cat.catalogo[id].competencia);
    ok('catálogo', ids.length + ' clubes · origen ' + cat.origen);
    ok('zonas publicadas', conZonas.length
      ? conZonas.join(', ')
      : 'ninguna todavía (los clubes usan el JSON del repo)');
    if (cat.origen !== 'kv') {
      mal('el catálogo NO viene de KV', 'viene de «' + cat.origen + '»: '
        + (cat.aviso || 'la clave no existe o no se pudo leer'));
    }
  } catch (e) {
    mal('catálogo', e.codigo || e.message);
  }

  /* LOS CUPOS son la tabla que el servidor hace cumplir al dar de alta.
     Se verifica que el motor compartido esté al alcance del servidor: sin
     él, `clientes.alta()` no sabría cuántos mails admite un plan. */
  const cupos = AUTH.CUPO_MAILS;
  if (cupos && cupos.BRONCE && cupos.PLATA && cupos.ORO) {
    ok('tabla de cupos', 'BRONCE ' + cupos.BRONCE + ' · PLATA ' + cupos.PLATA
      + ' · ORO ' + cupos.ORO);
  } else {
    mal('tabla de cupos', 'el motor compartido no la trae');
  }

  console.log('\n  token que respondió: ' + (kv.tokenEnUso() || '(ninguno)'));

  /* ================================================ 3 · escribir de verdad */
  if (!conEscritura) {
    console.log('\n  (para probar la ESCRITURA: node server/bin/kv-salud.js --escribir)');
  } else {
    linea('ESCRITURA · ida y vuelta sobre una clave de prueba');

    /* SOBRE UNA CLAVE PROPIA, nunca sobre el padrón ni el catálogo: una
       verificación que puede romper lo que verifica no sirve de nada. */
    const marca = { probado: new Date().toISOString(), por: 'kv-salud' };
    try {
      await kv.escribir(CLAVE_PRUEBA, marca);
      ok('escribe', CLAVE_PRUEBA);
    } catch (e) {
      mal('escribe', e.codigo === 'KV_SOLO_LECTURA'
        ? 'este entorno solo tiene el token de LECTURA'
        : (e.codigo || e.message));
    }

    try {
      const r = await kv.leer(CLAVE_PRUEBA);
      if (r.valor && r.valor.probado === marca.probado) ok('y lee lo que escribió');
      else mal('lee otra cosa de la que escribió', JSON.stringify(r.valor));
    } catch (e) {
      mal('relee', e.codigo || e.message);
    }

    try {
      await kv.borrar(CLAVE_PRUEBA);
      ok('y limpia la clave de prueba');
    } catch (e) {
      mal('no pudo borrar la clave de prueba', e.codigo || e.message);
    }

    console.log('\n  token que respondió: ' + (kv.tokenEnUso() || '(ninguno)'));
  }

  /* ================================================ el veredicto */
  console.log('');
  if (fallos) {
    console.log('  ' + fallos + (fallos === 1 ? ' problema' : ' problemas') + '. NO borres el token legacy.');
    process.exit(1);
  }
  console.log('  Todo en orden.');
  if (c.tokenLegacy || c.tokenLecturaLegacy) {
    console.log('  Si esto dio verde con el token NUEVO, ya podés borrar el legacy');
    console.log('  y revocar el viejo en la consola de Upstash.');
  }
  console.log('');
})().catch((e) => {
  console.error('\n  Falló: ' + (e && e.stack ? e.stack : e) + '\n');
  process.exit(1);
});
