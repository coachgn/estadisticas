/* Lector mínimo de `.env`. Sin `dotenv`: son doce líneas.

   NO pisa lo que ya está en el entorno — en Vercel las variables vienen
   de la plataforma y un `.env` olvidado en el repo no puede ganarles. */
'use strict';
const fs = require('fs');
const path = require('path');

function cargar(archivo) {
  const p = archivo || path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return false;
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((linea) => {
    const l = linea.trim();
    if (!l || l[0] === '#') return;
    const i = l.indexOf('=');
    if (i === -1) return;
    const clave = l.slice(0, i).trim();
    let valor = l.slice(i + 1).trim();
    /* Las comillas se sacan pero el contenido NO se desescapa: la clave
       privada trae `\n` literales que `config.js` convierte después. */
    if ((valor[0] === '"' && valor.slice(-1) === '"') ||
        (valor[0] === "'" && valor.slice(-1) === "'")) valor = valor.slice(1, -1);
    if (process.env[clave] === undefined) process.env[clave] = valor;
  });
  return true;
}

module.exports = { cargar };
