/* =====================================================================
   GENERA LA DEMO PÚBLICA · `demo/datos-demo.json`

   Se corre A MANO, igual que `generar-css.js`, `generar-glosario.js` y
   `generar-manual-etiquetas.js`:

       node generar-demo.js

   POR QUÉ UN SNAPSHOT CONGELADO Y NO DATOS EN VIVO
   ------------------------------------------------
   La demo es PÚBLICA: entra cualquiera, sin login. Y desde que el
   catálogo dejó de traer `sheetId` —"EL CATÁLOGO YA NO TIENE sheetId, Y
   ESE ES EL PUNTO", `sgadd-core.js`— la app no puede leer un libro sin
   pasar por el backend, que pide token.

   Poner el `sheetId` de Jujuy en un `clubes/demo.json` para que la demo
   leyera en vivo desharía esa decisión: el archivo es público y el id
   volvería al repo. Así que el libro se lee UNA vez desde acá, con el
   `SHEET_JUJUY_PRIMERA` de `server/.env`, se anonimiza, y **lo único que
   se commitea es el resultado anonimizado**. El id no viaja.

   De paso, la demo gana tres cosas que un vivo no tiene: no se rompe
   cuando MotorStats recalcula el libro, no depende de la red de Google
   para el que la está probando, y muestra siempre los mismos números —
   que en una demo comercial es exactamente lo que se quiere.

   QUÉ SE ANONIMIZA Y QUÉ NO
   -------------------------
   Se reescriben SOLO los nombres: equipos, jugadores y el texto del
   partido. **Los números no se tocan, ni uno**: el valor de la demo es
   que el dashboard se vea real —percentiles, eFG%, PACE, arquetipos—, y
   con datos inventados las etiquetas dirían cualquier cosa.

   LAS TRES TRAMPAS
   ----------------
   1. `PARTIDO` es el texto "LOCAL vs VISITANTE" y de ahí sale el RIVAL
      (`equiposRival` parte por /\s+vs\s+/i). Si se renombra `EQUIPO` y no
      `PARTIDO`, todos los rivales de la app quedan en blanco.
   2. Las filas TIPO son centinelas: `EQUIPO TIPO` y `JUGADOR TIPO`. Si se
      renombran, el núcleo pierde la mediana de la liga y el umbral de
      minutos sale mal. Se detectan mirando TODAS las columnas, porque el
      centinela puede estar en `EQUIPO` o en `NOMBRES`.
   3. El equipo propio tiene que quedar PRIMERO (`EQUIPO 1`): es el que la
      demo abre, y `patronEquipoPropio` del JSON lo busca por ese nombre.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const SALIDA = path.join(__dirname, 'demo', 'datos-demo.json');
const HOJAS = ['PROMEDIOS E', 'ACUMULADO E', 'Base Datos E', 'PROMEDIOS 4F',
  'ACUMULADO 4F', '4 FACTORES', 'PROMEDIOS J', 'ACUMULADO J', 'Base Datos J'];
const CENTINELAS = ['EQUIPO TIPO', 'JUGADOR TIPO'];
const PATRON_PROPIO = /JUJUY/i;

/* --------------------------------------------------------------------
   El sheetId sale de `server/.env` y NO se imprime ni se guarda.
   -------------------------------------------------------------------- */
function sheetIdDelEntorno() {
  const p = path.join(__dirname, 'server', '.env');
  let txt;
  try { txt = fs.readFileSync(p, 'utf8'); } catch (e) {
    throw new Error('No se pudo leer server/.env: ' + e.message);
  }
  const m = txt.match(/^\s*SHEET_JUJUY_PRIMERA\s*=\s*(.+)$/m);
  if (!m) throw new Error('server/.env no declara SHEET_JUJUY_PRIMERA');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

/* --------------------------------------------------------------------
   GViz, con el mismo parseo que usa el panel.

   La respuesta viene envuelta en `…setResponse({...});` — hay que
   recortar el envoltorio antes de parsear.
   -------------------------------------------------------------------- */
async function bajarHoja(sheetId, nombre) {
  const url = 'https://docs.google.com/spreadsheets/d/' + sheetId
    + '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(nombre);
  const r = await fetch(url);
  if (!r.ok) throw new Error(nombre + ': HTTP ' + r.status);
  const txt = await r.text();
  const ini = txt.indexOf('{');
  const fin = txt.lastIndexOf('}');
  if (ini < 0 || fin < 0) throw new Error(nombre + ': respuesta sin JSON');
  const j = JSON.parse(txt.slice(ini, fin + 1));
  if (!j.table) throw new Error(nombre + ': sin tabla');
  const cols = (j.table.cols || []).map(c => String(c.label || c.id || '').trim());
  const filas = (j.table.rows || []).map(fila => {
    const o = {};
    (fila.c || []).forEach((celda, i) => {
      const nom = cols[i];
      if (!nom) return;
      o[nom] = (celda && celda.v !== undefined && celda.v !== null) ? celda.v : '';
    });
    return o;
  });
  return { cols: cols, filas: filas };
}

/* -------------------------------------------------------------------- */
const texto = (v) => (v === undefined || v === null ? '' : String(v)).trim();

function esCentinela(v) {
  return CENTINELAS.indexOf(texto(v).toUpperCase()) !== -1;
}

/** ¿La fila es una TIPO? Se mira en TODAS las columnas, como el núcleo. */
function esFilaTipo(fila) {
  return Object.keys(fila).some(k => esCentinela(fila[k]));
}

/**
 * El equipo propio primero y el resto alfabético.
 *
 * El orden tiene que ser ESTABLE entre corridas: si cambiara, el mismo
 * jugador saldría con otro número cada vez que se regenera la demo y las
 * capturas de pantalla dejarían de coincidir con lo que se ve.
 */
function ordenarEquipos(nombres) {
  const propios = nombres.filter(n => PATRON_PROPIO.test(n));
  const resto = nombres.filter(n => !PATRON_PROPIO.test(n))
    .sort((a, b) => a.localeCompare(b, 'es'));
  return propios.sort((a, b) => a.localeCompare(b, 'es')).concat(resto);
}

function construirMapas(hojas) {
  const equipos = new Set();
  const jugadores = new Set();

  HOJAS.forEach(h => {
    const hoja = hojas[h];
    if (!hoja) return;
    hoja.filas.forEach(f => {
      const eq = texto(f['EQUIPO']);
      if (eq && !esCentinela(eq)) equipos.add(eq);
      const ju = texto(f['NOMBRES']);
      if (ju && !esCentinela(ju)) jugadores.add(ju);
      /* Del texto del partido salen equipos que pueden no estar en
         ninguna columna EQUIPO —pasa con un rival sin filas propias—. */
      const par = texto(f['PARTIDO']);
      if (par) {
        par.split(/\s+vs\s+/i).forEach(lado => {
          const l = texto(lado);
          if (l && !esCentinela(l)) equipos.add(l);
        });
      }
    });
  });

  const mapaEquipos = {};
  ordenarEquipos([...equipos]).forEach((n, i) => {
    mapaEquipos[n] = 'EQUIPO ' + (i + 1);
  });

  /* Los jugadores se numeran POR EQUIPO y en el orden del equipo, así el
     plantel de EQUIPO 1 son JUGADOR 1..N seguidos. Un numerado global
     daría planteles con números salteados, que se lee como si faltara
     gente. */
  const porEquipo = {};
  HOJAS.forEach(h => {
    const hoja = hojas[h];
    if (!hoja) return;
    hoja.filas.forEach(f => {
      const ju = texto(f['NOMBRES']);
      const eq = texto(f['EQUIPO']);
      if (!ju || esCentinela(ju) || !eq || esCentinela(eq)) return;
      (porEquipo[eq] = porEquipo[eq] || new Set()).add(ju);
    });
  });

  const mapaJugadores = {};
  let n = 0;
  Object.keys(mapaEquipos)
    .sort((a, b) => Number(mapaEquipos[a].split(' ')[1]) - Number(mapaEquipos[b].split(' ')[1]))
    .forEach(eq => {
      const lista = [...(porEquipo[eq] || [])].sort((a, b) => a.localeCompare(b, 'es'));
      lista.forEach(j => { if (!mapaJugadores[j]) mapaJugadores[j] = 'JUGADOR ' + (++n); });
    });
  /* Los que no quedaron atados a ningún equipo, al final. */
  [...jugadores].sort((a, b) => a.localeCompare(b, 'es'))
    .forEach(j => { if (!mapaJugadores[j]) mapaJugadores[j] = 'JUGADOR ' + (++n); });

  return { equipos: mapaEquipos, jugadores: mapaJugadores };
}

function anonimizar(hojas, mapas) {
  const salida = {};
  let celdas = 0;
  HOJAS.forEach(h => {
    const hoja = hojas[h];
    if (!hoja) return;
    salida[h] = {
      cols: hoja.cols.slice(),
      filas: hoja.filas.map(f => {
        const o = {};
        Object.keys(f).forEach(k => { o[k] = f[k]; });
        const tipo = esFilaTipo(f);
        const eq = texto(o['EQUIPO']);
        if (eq && !esCentinela(eq) && mapas.equipos[eq]) { o['EQUIPO'] = mapas.equipos[eq]; celdas++; }
        const ju = texto(o['NOMBRES']);
        if (ju && !esCentinela(ju) && mapas.jugadores[ju]) { o['NOMBRES'] = mapas.jugadores[ju]; celdas++; }
        const par = texto(o['PARTIDO']);
        if (par && !tipo) {
          const lados = par.split(/(\s+vs\s+)/i);
          o['PARTIDO'] = lados.map(t =>
            (/^\s+vs\s+$/i.test(t) ? t : (mapas.equipos[texto(t)] || t))).join('');
          celdas++;
        }
        return o;
      }),
    };
  });
  return { hojas: salida, celdas: celdas };
}

/* -------------------------------------------------------------------- */
(async () => {
  const sheetId = sheetIdDelEntorno();
  console.log('Bajando las 9 hojas del libro de origen…');
  const hojas = {};
  for (const h of HOJAS) {
    hojas[h] = await bajarHoja(sheetId, h);
    console.log('  ' + h.padEnd(14) + hojas[h].filas.length + ' filas');
  }

  const mapas = construirMapas(hojas);
  const nEq = Object.keys(mapas.equipos).length;
  const nJu = Object.keys(mapas.jugadores).length;
  console.log('\nMapeados ' + nEq + ' equipos y ' + nJu + ' jugadores.');

  const { hojas: anon, celdas } = anonimizar(hojas, mapas);
  console.log('Reescritas ' + celdas + ' celdas de nombre.');

  /* LAS FILAS VAN COMO ARRAYS, NO COMO OBJETOS.
   *
   * Un objeto por fila repite los ~53 nombres de columna en cada una de
   * las 7.558 filas del libro. Medido: 5.549 KB así contra 1.7 MB con
   * arrays — y esto es un archivo que baja CUALQUIERA que abra la demo,
   * sin login y probablemente desde el teléfono.
   *
   * El orden de `cols` es el contrato: `sgadd-demo.js` rehidrata cada
   * fila con esos nombres. Es la única parte del formato que no se puede
   * tocar de un lado sin tocar el otro, y hay un test que lo fija. */
  const compacto = {};
  Object.keys(anon).forEach(h => {
    const cols = anon[h].cols;
    compacto[h] = {
      cols: cols,
      filas: anon[h].filas.map(f => cols.map(c => (f[c] === undefined ? '' : f[c]))),
    };
  });

  /* LA GUARDA QUE NO SE NEGOCIA: nada del libro original puede quedar en
     el archivo que se commitea. Se busca cada nombre real en el JSON ya
     serializado — si aparece uno solo, no se escribe nada. */
  const txt = JSON.stringify({
    generado: new Date().toISOString().slice(0, 10),
    equipos: nEq,
    jugadores: nJu,
    hojas: compacto,
  });
  const fugas = [];
  Object.keys(mapas.equipos).forEach(n => { if (txt.indexOf(n) !== -1) fugas.push('equipo: ' + n); });
  Object.keys(mapas.jugadores).forEach(n => { if (txt.indexOf(n) !== -1) fugas.push('jugador: ' + n); });
  if (txt.indexOf(sheetId) !== -1) fugas.push('el sheetId');
  if (fugas.length) {
    console.error('\n✗ NO SE ESCRIBIÓ NADA · quedaron ' + fugas.length + ' nombres reales:');
    fugas.slice(0, 10).forEach(f => console.error('   ' + f));
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, txt);
  const kb = Math.round(fs.statSync(SALIDA).size / 1024);
  console.log('\n✓ ' + path.relative(__dirname, SALIDA) + ' · ' + kb + ' KB');
  console.log('  Sin un solo nombre real y sin el sheetId.');
})().catch(e => { console.error('ERROR: ' + e.message); process.exitCode = 1; });
