#!/usr/bin/env node
/* =====================================================================
   PROBAR LOS MAILS INSTITUCIONALES SIN ESPERAR AL CRON

   Vista previa (no manda nada; escribe el HTML y el texto para mirarlos):
     node server/bin/probar-mails.js --tipo bienvenida
     node server/bin/probar-mails.js --tipo recordatorio --dias 3

   Mandar uno de prueba a una casilla (hace falta SMTP_PASS en server/.env):
     node server/bin/probar-mails.js --tipo bienvenida --email tu@mail.com --enviar
     node server/bin/probar-mails.js --tipo recordatorio --dias 1 --email tu@mail.com --enviar

   Simular la corrida del cron con clientes FICTICIOS a 5, 3 y 1 día
   (Upstash y Gmail de mentira: no toca producción ni manda nada):
     node server/bin/probar-mails.js --tipo cron

   Qué mandaría HOY el cron de verdad, leyendo producción (solo LEE):
     node server/bin/probar-mails.js --tipo cron --real

   Opciones: --salida <carpeta> (dónde escribir la vista previa),
             --club / --categoria / --plan / --vence para la vista previa.

   LOS DATOS DE LA VISTA PREVIA SON FICTICIOS a propósito: una prueba no
   puede mandarle a una casilla de prueba el mail real de un cliente.
   ===================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
require('../lib/env.js').cargar();

const P = require('../lib/mail-plantillas.js');
const envio = require('../lib/mail-envio.js');
const cron = require('../lib/cron-vencimientos.js');
const fichas = require('../lib/fichas.js');
const { kvMemoria } = require('../lib/kv-memoria.js');

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const sig = argv[i + 1];
    if (sig === undefined || sig.startsWith('--')) out[k] = true;
    else { out[k] = sig; i++; }
  }
  return out;
}

function sumarDias(iso, n) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

function datosDePrueba(a, dias) {
  const hoy = cron.hoyAR();
  return {
    club: a.club || 'Club Ejemplo', categoria: a.categoria || 'Primera 2026',
    contacto: 'Martina Ejemplo', plan: String(a.plan || 'PLATA').toUpperCase(),
    vence: a.vence || sumarDias(hoy, dias || 30), renovacion: 'mensual',
    url: cron.urlPanel('club-ejemplo'),
    balance: { diasDeServicio: 128, accesos: 2, cupo: 3, ultimoIngreso: sumarDias(hoy, -2) },
  };
}

function escribirVista(mail, salida) {
  fs.mkdirSync(salida, { recursive: true });
  const base = path.join(salida, mail.tipo);
  fs.writeFileSync(base + '.html', mail.html);
  fs.writeFileSync(base + '.txt', 'Asunto: ' + mail.asunto + '\n\n' + mail.texto);
  return base;
}

async function mandar(mail, email) {
  const estado = envio.estadoEnvio();
  if (!estado.ok) {
    console.error('✗ ' + estado.mensaje);
    console.error('  Generá una «contraseña de aplicación» de ' + P.REMITENTE + ' y ponela en server/.env como SMTP_PASS.');
    process.exit(2);
  }
  const r = await envio.transporteSmtp().enviar({ para: email, asunto: mail.asunto, html: mail.html, texto: mail.texto });
  console.log('✓ Enviado a ' + email + ' desde ' + P.REMITENTE + ' · ' + r.respuesta);
}

async function simularCron() {
  const almacen = kvMemoria();
  const transporte = envio.transporteMemoria();
  const hoy = cron.hoyAR();
  const catalogo = {};
  const casos = [
    { id: 'club-cinco', dias: 5, plan: 'ORO' },
    { id: 'club-tres', dias: 3, plan: 'PLATA' },
    { id: 'club-uno', dias: 1, plan: 'BRONCE' },
    { id: 'club-diez', dias: 10, plan: 'PLATA' },
    { id: 'club-sin-mail', dias: 3, plan: 'PLATA', sinMail: true },
    { id: 'club-pausado', dias: 1, plan: 'ORO', estado: 'pausado' },
  ];
  for (const c of casos) {
    catalogo[c.id] = { nombre: c.id.replace('club-', 'Club ').toUpperCase(), estado: c.estado || 'activo',
      categorias: { primera: { label: 'Primera', plan: c.plan, vence: sumarDias(hoy, c.dias) } } };
    await fichas.guardar(c.id, 'primera', { contacto: 'Contacto ' + c.id,
      email: c.sinMail ? null : c.id + '@ejemplo.com', fechaAlta: sumarDias(hoy, -90), renovacion: 'mensual' }, { kv: almacen });
  }
  const deps = { kv: almacen, transporte: transporte, catalogo: catalogo, padron: {} };
  console.log('Hoy en Argentina: ' + hoy + '\n\nPRIMERA CORRIDA');
  const r1 = await cron.ejecutar(deps);
  r1.resultados.forEach(r => console.log('  ✉ ' + r.clubId + ' · ' + r.hito + ' → ' + r.para + ' · ' + r.resultado + (r.asunto ? ' · «' + r.asunto + '»' : '')));
  r1.omitidos.forEach(o => console.log('  · ' + o.clubId + ' omitido: ' + o.motivo));
  console.log('\nSEGUNDA CORRIDA, el mismo día (tiene que no mandar nada)');
  const r2 = await cron.ejecutar(deps);
  console.log('  enviados: ' + r2.enviados + ' · ya enviados: ' + r2.omitidos.filter(o => o.motivo === 'ya enviado').length);
  console.log('\nTotal en la bandeja de mentira: ' + transporte.enviados.length + ' mails, todos desde ' + P.REMITENTE + '.');
  return r2.enviados === 0 ? 0 : 1;
}

async function cronReal() {
  const catalogo = (await require('../lib/catalogo.js').cargarParaEscribir()).catalogo;
  const todas = await fichas.leerTodas();
  const hoy = cron.hoyAR();
  const plan = cron.planificar(catalogo, todas, hoy);
  console.log('Hoy en Argentina: ' + hoy + ' · SOLO LECTURA: no se manda nada.\n');
  if (!plan.avisos.length) console.log('Hoy el cron no mandaría ningún aviso.');
  plan.avisos.forEach(a => console.log('  ✉ ' + a.clubId + '/' + a.slug + ' · ' + a.hito + ' → ' + a.para + ' (vence ' + a.vence + ')'));
  plan.omitidos.forEach(o => console.log('  · ' + o.clubId + '/' + o.slug + ' omitido: ' + o.motivo));
  console.log('\nFichas con mail: ' + Object.keys(todas).filter(k => todas[k] && todas[k].email).length + ' · envío: '
    + (envio.estadoEnvio().ok ? 'listo' : envio.estadoEnvio().mensaje));
}

async function main() {
  const a = args(process.argv.slice(2));
  const tipo = a.tipo || 'bienvenida';
  const salida = a.salida || path.join(os.tmpdir(), 'motorstats-mails');

  if (tipo === 'cron') {
    if (a.real) return cronReal();
    process.exitCode = await simularCron();
    return;
  }
  let mail;
  if (tipo === 'bienvenida') mail = P.bienvenida(datosDePrueba(a));
  else if (tipo === 'recordatorio') {
    const dias = Number(a.dias || 5);
    mail = P.recordatorio(datosDePrueba(a, dias), dias);
  } else {
    console.error('Tipo desconocido: ' + tipo + ' (bienvenida, recordatorio o cron).');
    process.exit(1);
  }
  const base = escribirVista(mail, salida);
  console.log('Asunto: ' + mail.asunto);
  console.log('Vista previa: ' + base + '.html y .txt');
  if (a.enviar) {
    if (!a.email || a.email === true) { console.error('Para mandarlo falta --email <casilla>.'); process.exit(1); }
    await mandar(mail, a.email);
  } else if (a.email) {
    console.log('(No se mandó: agregá --enviar para mandarlo a ' + a.email + '.)');
  }
}

main().catch((e) => { console.error('✗ ' + (e.codigo ? e.codigo + ': ' : '') + e.message); process.exit(1); });
