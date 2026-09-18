#!/usr/bin/env node
/* =====================================================================
   CARGAR LA CONTRASEÑA DE APLICACIÓN DE GMAIL · un solo comando

     node server/bin/configurar-smtp.js

   Pide la contraseña de aplicación de motorstats.ar@gmail.com SIN
   mostrarla en pantalla y hace las tres cosas:
     1. prueba que Gmail la acepta (se conecta y se autentica, no manda nada)
     2. la guarda en server/.env como SMTP_PASS (reemplaza la anterior)
     3. la carga en Vercel, producción, como SMTP_PASS (reemplaza la anterior)

   La corre QUIEN TIENE LA CLAVE, en su terminal: la clave no se escribe
   en ningún comando, no queda en el historial de la consola y no pasa por
   nadie más. Si Gmail la rechaza, no se guarda en ningún lado.

   Después hay que volver a desplegar el backend para que Vercel la tome.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const tls = require('tls');
const readline = require('readline');
const { spawnSync } = require('child_process');
const envio = require('../lib/mail-envio.js');
const { REMITENTE } = require('../lib/mail-plantillas.js');

const ENV = path.join(__dirname, '..', '.env');
const SERVER = path.join(__dirname, '..');

/** Pregunta sin mostrar lo que se tipea. */
function preguntarOculto(pregunta) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = function (s) {
      if (s.indexOf(pregunta) !== -1 || s === '\r\n' || s === '\n') rl.output.write(s);
      else rl.output.write('*'.repeat(s.length));
    };
    rl.question(pregunta, (r) => { rl.close(); process.stdout.write('\n'); resolve(r); });
  });
}

/** Se conecta a Gmail y se autentica. No manda ningún mail. */
async function probarLogin(clave) {
  const socket = tls.connect({ host: envio.HOST, port: envio.PUERTO, servername: envio.HOST });
  const plano = Buffer.from('\u0000' + REMITENTE + '\u0000' + clave, 'utf8').toString('base64');
  return envio.conversar(socket, [
    { enviar: 'EHLO motorstats.ar', espera: [250] },
    { enviar: 'AUTH PLAIN ' + plano, espera: [235] },
    { enviar: 'QUIT', espera: [221] },
  ]);
}

function guardarEnEnv(clave) {
  let texto = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
  const nl = texto.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  const lineas = texto.split(/\r?\n/).filter(l => !/^\s*SMTP_PASS\s*=/.test(l));
  while (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();
  lineas.push('SMTP_PASS=' + clave);
  fs.writeFileSync(ENV, lineas.join(nl) + nl);
}

function cargarEnVercel(clave) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  /* La anterior se borra primero: `env add` no reemplaza una que ya existe. */
  spawnSync(npx, ['vercel', 'env', 'rm', 'SMTP_PASS', 'production', '--yes'],
    { cwd: SERVER, stdio: ['ignore', 'ignore', 'ignore'], shell: process.platform === 'win32' });
  const r = spawnSync(npx, ['vercel', 'env', 'add', 'SMTP_PASS', 'production'],
    { cwd: SERVER, input: clave, encoding: 'utf8', shell: process.platform === 'win32' });
  const salida = (r.stdout || '') + (r.stderr || '');
  return { ok: r.status === 0 && /Added/i.test(salida), salida: salida.replace(clave, '****') };
}

(async () => {
  console.log('Contraseña de aplicación de ' + REMITENTE + ' (16 letras; los espacios no importan).');
  const clave = String(await preguntarOculto('Pegala acá y apretá Enter: ')).replace(/\s+/g, '');
  if (!/^[a-z]{16}$/i.test(clave)) {
    console.error('✗ No parece una contraseña de aplicación (son 16 letras). No se guardó nada.');
    process.exit(1);
  }

  process.stdout.write('1/3 · Probando la clave contra Gmail… ');
  try { await probarLogin(clave); console.log('✓ Gmail la aceptó.'); }
  catch (e) {
    console.log('✗');
    console.error('  ' + e.message + ' No se guardó nada.');
    process.exit(1);
  }

  guardarEnEnv(clave);
  console.log('2/3 · ✓ Guardada en server/.env como SMTP_PASS.');

  process.stdout.write('3/3 · Cargándola en Vercel (producción)… ');
  const v = cargarEnVercel(clave);
  if (v.ok) console.log('✓ SMTP_PASS cargada.');
  else {
    console.log('✗');
    console.error(v.salida.trim().split('\n').slice(-4).join('\n'));
    console.error('  Quedó guardada en server/.env; la de Vercel se puede cargar con: npx vercel env add SMTP_PASS production');
    process.exit(1);
  }
  console.log('\nListo. Falta volver a desplegar el backend para que producción la tome.');
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
