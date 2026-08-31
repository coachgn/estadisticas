#!/usr/bin/env node
/* =====================================================================
   SGADD · Administración de los accesos de admin

     node server/bin/admins.js estado
     node server/bin/admins.js invitar --email <mail> [--dias 7]
     node server/bin/admins.js revocar --email <mail>

   POR QUÉ EXISTE ESTA CLI Y NO UNA PANTALLA. El código de invitación es lo
   único que permite fijar la primera clave, así que emitirlo desde el
   panel exigiría estar ya adentro — y el primer administrador no lo está.
   Es el problema del huevo y la gallina que toda autenticación tiene en su
   arranque, y se resuelve donde ya hay confianza: la máquina de quien
   administra, con las credenciales de KV en la mano.

   Y HAY OTRO MOTIVO, más importante: el código se imprime ACÁ, en esta
   terminal. Nunca pasa por un chat, ni por un log de servidor, ni por la
   cabeza de nadie más que quien lo genera y quien lo usa.
   ===================================================================== */
'use strict';

require('../lib/env.js').cargar();
const admins = require('../lib/admins.js');
const kv = require('../lib/kv.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].indexOf('--') !== 0) { o._ = o._ || argv[i]; continue; }
    const c = argv[i].slice(2), s = argv[i + 1];
    if (s === undefined || s.indexOf('--') === 0) o[c] = true; else { o[c] = s; i++; }
  }
  return o;
}

function ayuda() {
  console.log(`
Accesos de administrador · SGADD

  node server/bin/admins.js estado
      Quién tiene clave, quién una invitación pendiente y quién nada.

  node server/bin/admins.js invitar --email <mail> [--dias 7]
      Emite un código de UN SOLO USO para que ese mail fije su clave.
      El código se imprime una vez y NO se puede recuperar después: se
      guarda hasheado, igual que una clave.

  node server/bin/admins.js revocar --email <mail>
      Le saca la clave y la invitación. Deja de poder entrar hasta que se
      lo invite de nuevo. Los tokens que ya tenga siguen válidos hasta
      vencer: un JWT no se puede desandar (vencen a las 12 h).

LA LISTA DE ADMINISTRADORES NO SE EDITA ACÁ: vive en \`ADMINS\`, en el
código, y se cambia con un commit. Esto administra sus CLAVES, no quién
es admin — que es lo que hace que un KV comprometido no alcance para
crear un administrador nuevo.
`);
}

(async () => {
  const o = args(process.argv.slice(2));
  const cmd = o._;

  if (!cmd || o.help || o.h) { ayuda(); process.exit(cmd ? 0 : 1); }

  if (!kv.configurado()) {
    console.error('\n  Upstash no está configurado en esta máquina.');
    console.error('  Las claves viven en KV: sin credenciales no hay padrón que leer.\n');
    process.exit(1);
  }

  const padron = await admins.cargar();

  if (cmd === 'estado') {
    console.log('');
    admins.estado(padron).forEach((a) => {
      const que = a.tieneClave ? 'CON CLAVE'
        : a.invitacionPendiente ? 'invitación pendiente (vence ' + a.invitacionVence.slice(0, 10) + ')'
        : 'sin acceso · falta invitarlo';
      console.log('  ' + a.email.padEnd(26) + que
        + (a.bloqueado ? '   ← BLOQUEADO por intentos' : '')
        + (a.ultimoIngreso ? '   último ingreso ' + a.ultimoIngreso.slice(0, 16).replace('T', ' ') : ''));
    });
    console.log('');
    return;
  }

  if (cmd === 'invitar') {
    if (!o.email) { console.error('\n  Falta --email\n'); process.exit(1); }
    const r = admins.invitar(padron, o.email, Number(o.dias) || 7);
    if (!r.ok) {
      console.error('\n  ' + r.motivo);
      console.error('  Los administradores son: ' + AUTH.ADMINS.join(', ') + '\n');
      process.exit(1);
    }
    await admins.guardar(r.padron);
    console.log('');
    console.log('  Invitación para ' + AUTH.normalizarEmail(o.email));
    console.log('  Vence: ' + new Date(r.venceEn).toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
    console.log('');
    console.log('  CÓDIGO (se muestra UNA sola vez):');
    console.log('');
    console.log('      ' + r.codigo);
    console.log('');
    console.log('  Mandáselo por un canal privado. Con ese código elige SU clave');
    console.log('  en la pantalla de ingreso; el código muere al usarse y vos');
    console.log('  nunca vas a conocer su clave.');
    console.log('');
    return;
  }

  if (cmd === 'revocar') {
    if (!o.email) { console.error('\n  Falta --email\n'); process.exit(1); }
    const e = AUTH.normalizarEmail(o.email);
    if (!padron[e]) { console.error('\n  Ese mail no tiene nada guardado.\n'); process.exit(1); }
    const p = Object.assign({}, padron);
    delete p[e];
    await admins.guardar(p);
    console.log('\n  Listo: ' + e + ' se quedó sin clave ni invitación.');
    /* Se dice explícito porque es la limitación que más sorprende: revocar
       no cierra la sesión que ya está abierta. */
    console.log('  OJO: los tokens que ya tenga siguen válidos hasta vencer (12 h).');
    console.log('  Para cortar TODO ahora mismo hay que rotar JWT_SECRET, que');
    console.log('  invalida también los links de los clubes.\n');
    return;
  }

  console.error('\n  Comando desconocido: ' + cmd);
  ayuda();
  process.exit(1);
})().catch((e) => {
  console.error('\n  Falló: ' + (e && e.message ? e.message : e) + '\n');
  process.exit(1);
});
