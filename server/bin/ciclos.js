#!/usr/bin/env node
/* =====================================================================
   SGADD · Informes de ciclo desde la máquina del analista (Opción B)

     node server/bin/ciclos.js informe  --club X --categoria Y --equipo "N" --ciclo 0 [--salida carpeta]
         arma el HTML y el PDF del informe (con el Chrome local) y los deja en
         una carpeta: para revisarlo antes de publicar. NO toca KV.

     node server/bin/ciclos.js publicar --club X --categoria Y --equipo "N" --ciclo 0
         ENSAYO: compila el PDF y dice a quién se mandaría. No manda ni cambia nada.

     node server/bin/ciclos.js publicar ... --enviar [--reintentar]
         publica de verdad: manda el PDF a los mails del padrón y pasa el
         ciclo a «publicado».

   Criterio de la ventana: --ciclo N (estándar de 4 partidos), --ultimos N,
   o --desde AAAA-MM-DD --hasta AAAA-MM-DD.

   Corre EL MISMO handler que el botón del panel, con las credenciales de
   server/.env (KV, padrón y la contraseña de aplicación de Gmail) y el Chrome
   instalado en esta máquina. Es el plan B si la función de Vercel no puede
   levantar Chromium.
   ===================================================================== */
'use strict';

require('../lib/env.js').cargar();
const fs = require('fs');
const path = require('path');
const { firmarToken } = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');
const ciclos = require('../rutas/ciclos.js');
const PDF = require('../lib/ciclos-pdf.js');
const INFORME = require('../lib/ciclos-informe.js');
const CICLOS = require('../lib/compartido/sgadd-ciclos.js');
const PBP = require('../rutas/pbp.js');
const kv = require('../lib/kv.js');
const catalogo = require('../lib/catalogo.js');

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.indexOf('--') !== 0) { o._.push(a); continue; }
    const sig = argv[i + 1];
    if (sig === undefined || sig.indexOf('--') === 0) o[a.slice(2)] = true; else { o[a.slice(2)] = sig; i++; }
  }
  return o;
}

function criterioDe(o) {
  if (o.ultimos) return { tipo: 'partidos', ultimos: Number(o.ultimos) };
  if (o.desde || o.hasta) return { tipo: 'calendario', desde: o.desde, hasta: o.hasta };
  return { tipo: 'ciclo', numero: Number(o.ciclo === undefined ? 0 : o.ciclo), n: CICLOS.PARTIDOS_POR_CICLO };
}

(async () => {
  const o = args(process.argv.slice(2));
  const accion = o._[0];
  if (['informe', 'publicar'].indexOf(accion) === -1 || !o.club || !o.categoria || !o.equipo) {
    console.error('Uso: node server/bin/ciclos.js informe|publicar --club X --categoria Y --equipo "NOMBRE" [--ciclo N | --ultimos N | --desde F --hasta F] [--enviar] [--reintentar] [--salida carpeta]');
    process.exit(2);
  }
  const criterio = criterioDe(o);
  const token = firmarToken({ email: AUTH.ADMINS[0], plan: 'ORO' }, { expiraEn: '10m' });
  const peticion = { headers: { authorization: 'Bearer ' + token }, params: { clubId: o.club, categoria: o.categoria }, body: { equipo: o.equipo, criterio } };

  if (accion === 'informe') {
    const cascada = await catalogo.cargar({});
    const campoEq = PBP.campoDeEquipo(o.equipo);
    const claves = PBP.claveDeDatos(cascada.catalogo, o.club, o.categoria);
    const lista = typeof claves === 'string' ? [claves] : [claves.propia, claves.torneo];
    let paq = null;
    for (const k of lista) { const l = await kv.leerCampos(k, [campoEq]); if (l && l[campoEq]) { paq = l[campoEq]; break; } }
    if (!paq) { console.error('No hay análisis de ese equipo en KV.'); process.exit(1); }
    const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const c = CICLOS.armarVentana(paq, criterio, { hoy });
    if (!c) { console.error('Esa ventana no existe en el paquete.'); process.exit(1); }
    const g = (await kv.leerCampos(ciclos.claveGestion(o.club, o.categoria), [campoEq + '|' + CICLOS.claveSello(c.meta)]))[campoEq + '|' + CICLOS.claveSello(c.meta)] || {};
    const informe = INFORME.construir(c, { lecturas: Object.assign({}, CICLOS.lecturasBase(c), g.lecturas || {}), equipo: c.meta.equipo || o.equipo, huella: CICLOS.huella(c) });
    const salida = path.resolve(o.salida || '.');
    fs.mkdirSync(salida, { recursive: true });
    fs.writeFileSync(path.join(salida, informe.archivo.replace(/\.pdf$/, '.html')), informe.html, 'utf8');
    const pdf = await PDF.aPdf(informe.html);
    fs.writeFileSync(path.join(salida, informe.archivo), pdf);
    console.log('Listo en ' + salida + ': ' + informe.archivo + ' (' + Math.round(pdf.length / 1024) + ' KB)');
    process.exit(0);
  }

  peticion.body.ensayo = !o.enviar;
  peticion.body.reintentar = !!o.reintentar;
  const r = await ciclos.manejarPublicar(peticion, {});
  console.log(JSON.stringify(r.body, null, 2));
  if (!o.enviar && r.status === 200) console.log('\n(Ensayo: no se mandó nada. Agregá --enviar para publicar.)');
  process.exit(r.status >= 400 ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
