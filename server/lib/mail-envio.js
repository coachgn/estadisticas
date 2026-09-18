/* =====================================================================
   EL ENVÍO · SMTP de Gmail, sin dependencias

   El proyecto no suma dependencias (punto 12), y lo que hace falta para
   mandar un mail es chico: una conexión TLS a smtp.gmail.com:465, seis
   comandos y un mensaje MIME con dos partes. Son ~150 líneas contra un
   paquete entero con su árbol de dependencias corriendo en el servidor.

   EL REMITENTE ES UNO Y NO SE CONFIGURA: motorstats.ar@gmail.com. Gmail
   solo deja mandar como la cuenta que se autentica, así que la cuenta
   de SMTP tiene que ser esa. Si alguien pone otra en `SMTP_USER`, se
   RECHAZA antes de conectar: un mail institucional que sale desde una
   casilla personal es el error que no se ve hasta que el cliente contesta.

   LA CREDENCIAL es una «contraseña de aplicación» de esa cuenta (Google
   pide tener la verificación en dos pasos). Se aceptan tres nombres de
   variable, por la misma razón que el token de Upstash acepta varios:
   exigir uno exacto es mandar a copiar valores a mano para nada.

   Sin credencial NO se manda nada y se dice por qué (`SIN_CREDENCIAL`):
   el cron lo reporta y el hito NO se registra, así sale en la corrida
   siguiente, cuando la credencial ya esté.
   ===================================================================== */
'use strict';

const tls = require('tls');
const crypto = require('crypto');
const { REMITENTE, NOMBRE_REMITENTE } = require('./mail-plantillas.js');

const HOST = 'smtp.gmail.com';
const PUERTO = 465;
const TIMEOUT_MS = 20000;
const EMAIL = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[a-z]{2,}$/i;

function credencial(env) {
  const e = env || process.env;
  const clave = (e.SMTP_PASS || e.MAIL_APP_PASSWORD || e.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const usuario = (e.SMTP_USER || REMITENTE).trim().toLowerCase();
  return { usuario: usuario, clave: clave };
}

/** ¿Se puede mandar? Devuelve el motivo si no. */
function estadoEnvio(env) {
  const c = credencial(env);
  if (c.usuario !== REMITENTE) {
    return { ok: false, codigo: 'REMITENTE_INVALIDO',
      mensaje: 'SMTP_USER es ' + c.usuario + ': los mails institucionales salen SOLO de ' + REMITENTE + '.' };
  }
  if (!c.clave) {
    return { ok: false, codigo: 'SIN_CREDENCIAL',
      mensaje: 'Falta la contraseña de aplicación de ' + REMITENTE + ' (SMTP_PASS): no se mandó nada.' };
  }
  return { ok: true };
}

function validarDestino(para) {
  const p = String(para || '').trim();
  if (!EMAIL.test(p) || /[\r\n]/.test(p)) {
    const e = new Error('El destinatario no es un mail válido: ' + p);
    e.codigo = 'DESTINO_INVALIDO';
    throw e;
  }
  return p;
}

/* --------------------------------------------------------------- MIME */

/** Encabezado con acentos (RFC 2047). */
function codificarEncabezado(t) {
  const s = String(t || '').replace(/[\r\n]+/g, ' ');
  return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
}

function base64Lineas(t) {
  return Buffer.from(String(t), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
}

/**
 * El mensaje entero, listo para el DATA. PURO salvo el id y la fecha,
 * que se pueden pasar para los tests.
 */
function construirMensaje(m, opciones) {
  const o = opciones || {};
  const para = validarDestino(m.para);
  const limite = 'ms_' + (o.limite || crypto.randomBytes(12).toString('hex'));
  const id = '<' + (o.id || crypto.randomBytes(16).toString('hex')) + '@motorstats.ar>';
  const fecha = (o.fecha || new Date()).toUTCString().replace('GMT', '+0000');
  const encabezados = [
    'From: ' + codificarEncabezado(NOMBRE_REMITENTE) + ' <' + REMITENTE + '>',
    'To: <' + para + '>',
    'Reply-To: <' + REMITENTE + '>',
    'Subject: ' + codificarEncabezado(m.asunto),
    'Date: ' + fecha,
    'Message-ID: ' + id,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + limite + '"',
  ];
  return encabezados.join('\r\n') + '\r\n\r\n'
    + '--' + limite + '\r\n'
    + 'Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'
    + base64Lineas(m.texto || '')
    + '--' + limite + '\r\n'
    + 'Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'
    + base64Lineas(m.html || '')
    + '--' + limite + '--\r\n';
}

/* --------------------------------------------------------------- SMTP */

/** Una conversación SMTP sobre un socket ya abierto. */
function conversar(socket, pasos) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let i = -1;
    const fin = (err, val) => {
      socket.removeAllListeners('data');
      clearTimeout(reloj);
      try { socket.end(); } catch (e) { /* ya cerrado */ }
      if (err) reject(err); else resolve(val);
    };
    const reloj = setTimeout(() => fin(Object.assign(new Error('Gmail no contestó a tiempo.'), { codigo: 'SMTP_TIMEOUT' })), TIMEOUT_MS);
    const siguiente = (respuesta) => {
      const paso = pasos[i];
      if (paso && paso.espera && paso.espera.indexOf(Number(respuesta.slice(0, 3))) === -1) {
        const auth = /^53[45]/.test(respuesta);
        return fin(Object.assign(new Error(auth
          ? 'Gmail rechazó la contraseña de aplicación de ' + REMITENTE + '.'
          : 'Gmail respondió: ' + respuesta.trim()), { codigo: auth ? 'SMTP_AUTH' : 'SMTP_' + respuesta.slice(0, 3) }));
      }
      i++;
      if (i >= pasos.length) return fin(null, respuesta);
      socket.write(pasos[i].enviar + '\r\n');
    };
    socket.on('data', (d) => {
      buffer += d.toString('utf8');
      /* Una respuesta termina en la línea «NNN texto» (con espacio): las
         intermedias son «NNN-texto». */
      const lineas = buffer.split('\r\n');
      const completa = lineas.some(l => /^\d{3} /.test(l));
      if (!completa) return;
      const respuesta = buffer;
      buffer = '';
      if (i === -1) {
        /* El saludo del servidor. */
        if (!/^220/.test(respuesta)) return fin(Object.assign(new Error('Gmail no saludó: ' + respuesta.trim()), { codigo: 'SMTP_SALUDO' }));
        i = 0;
        return socket.write(pasos[0].enviar + '\r\n');
      }
      siguiente(respuesta);
    });
    socket.on('error', (e) => fin(Object.assign(e, { codigo: e.codigo || 'SMTP_RED' })));
  });
}

/**
 * El transporte real. `enviar()` devuelve `{ok, id}` o lanza con `codigo`.
 * `conectar` se puede reemplazar en los tests por un socket de mentira.
 */
function transporteSmtp(opciones) {
  const o = opciones || {};
  return {
    nombre: 'smtp',
    async enviar(m) {
      const estado = estadoEnvio(o.env);
      if (!estado.ok) throw Object.assign(new Error(estado.mensaje), { codigo: estado.codigo });
      const c = credencial(o.env);
      const para = validarDestino(m.para);
      const cuerpo = construirMensaje(m)
        /* Una línea que empieza con punto se duplica (RFC 5321). */
        .replace(/\r\n\./g, '\r\n..');
      const socket = (o.conectar || ((cb) => tls.connect({ host: HOST, port: PUERTO, servername: HOST }, cb)))();
      const plano = Buffer.from('\u0000' + c.usuario + '\u0000' + c.clave, 'utf8').toString('base64');
      const respuesta = await conversar(socket, [
        { enviar: 'EHLO motorstats.ar', espera: [250] },
        { enviar: 'AUTH PLAIN ' + plano, espera: [235] },
        { enviar: 'MAIL FROM:<' + REMITENTE + '>', espera: [250] },
        { enviar: 'RCPT TO:<' + para + '>', espera: [250, 251] },
        { enviar: 'DATA', espera: [354] },
        { enviar: cuerpo + '\r\n.', espera: [250] },
        { enviar: 'QUIT', espera: [221] },
      ]);
      return { ok: true, respuesta: String(respuesta || '').trim() };
    },
  };
}

/** Para los tests y el simulador: guarda lo que se "manda" y no sale nada. */
function transporteMemoria() {
  const enviados = [];
  return {
    nombre: 'memoria',
    enviados: enviados,
    async enviar(m) {
      validarDestino(m.para);
      enviados.push(Object.assign({ de: REMITENTE }, m));
      return { ok: true, id: 'memoria-' + enviados.length };
    },
  };
}

module.exports = {
  HOST, PUERTO, credencial, estadoEnvio, validarDestino, construirMensaje, codificarEncabezado,
  transporteSmtp, transporteMemoria, conversar,
};
