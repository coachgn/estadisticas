'use strict';
/* =====================================================================
   LA MESA DE CONTROL · solo lectura (punto 183)

   Junta en un JSON lo que hoy está desparramado: el informe del auditor,
   las tareas de Windows, el candado de la ingesta, la cola de Canva, el
   banco de ideas, los ciclos listos para cerrar, los partidos manuales
   por cargar y los pendientes del cerebro. Tres columnas: lo que hay que
   decidir hoy, lo que corre solo y los datos de contexto.

   NADA ESCRIBE. Los comandos de arreglo viajan como TEXTO para que la
   persona los copie: la mesa no ejecuta ninguno. Por eso este archivo no
   tiene escrituras ni rutas POST, y un test lo vigila sobre el fuente.

   Estructura: funciones PURAS arriba (datos crudos → ítems, testeables sin
   red ni PowerShell), recolectores con dependencias inyectables al medio,
   y `mesa(deps)` + `montar()` abajo. Una fuente que falla se declara en
   `fuentes[nombre]` y las demás siguen: la mesa nunca lanza.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const DIAS_INFORME_VIEJO = 7;
const MIN_CANDADO_COLGADO = 70;
const TTL_CACHE_MS = 5 * 60 * 1000;
const FUENTES = ['auditor', 'tareas', 'candado', 'cola', 'banco', 'ciclos', 'manuales', 'cerebro'];
const GRAVEDAD = { rompe: 0, riesgo: 1, info: 2 };

const item = (origen, titulo, detalle, gravedad, comando) =>
  Object.assign({ origen, titulo, detalle: detalle || '', gravedad }, comando ? { comando } : {});
const dia = (d) => new Date(d).toISOString().slice(0, 10);
const diaLindo = (iso) => String(iso || '').split('-').reverse().join('/');
const ordenar = (lista) => lista.map((x, i) => [x, i]).sort((a, b) => (GRAVEDAD[a[0].gravedad] - GRAVEDAD[b[0].gravedad]) || (a[1] - b[1])).map((p) => p[0]);

/* ============================ FUNCIONES PURAS ============================ */

/** A · El informe del auditor. `fecha` es AAAA-MM-DD (sale del nombre del archivo). */
function itemsAuditor(informe, fecha, ahora) {
  const out = { decidiHoy: [], correSolo: [], datos: [] };
  const lista = Array.isArray(informe) ? informe : [];
  const cuando = fecha ? ' (informe del ' + diaLindo(fecha) + ')' : '';
  const edad = fecha ? (new Date(dia(ahora)) - new Date(fecha)) / 86400000 : Infinity;
  const viejo = edad > DIAS_INFORME_VIEJO;
  /* Un informe viejo no puede hacerse pasar por un incendio de hoy: la fecha va en el
     TÍTULO (lo primero que se lee) y sus ERROR bajan a riesgo y a «Datos». */
  const marca = viejo && fecha ? '[' + diaLindo(fecha).slice(0, 5) + '] ' : '';
  lista.forEach((x) => {
    if (!x) return;
    const esError = String(x.nivel).toUpperCase() === 'ERROR';
    const rompe = esError && !viejo;
    const it = item('auditor', marca + (x.area ? x.area + ' · ' : '') + (x.sujeto || 'sin sujeto'), String(x.texto || '') + cuando, rompe ? 'rompe' : 'riesgo', x.arreglo || undefined);
    (rompe ? out.decidiHoy : out.datos).push(it);
  });
  if (viejo) {
    out.decidiHoy.unshift(item('auditor', 'El último informe del auditor es del ' + (fecha ? diaLindo(fecha) : 'pasado'),
      'Tiene más de ' + DIAS_INFORME_VIEJO + ' días: lo que figura puede haber cambiado. Correrlo tarda cerca de un minuto y sale a la red.', 'riesgo', 'npm run auditar'));
  }
  return out;
}

/** B · Una tarea de Windows según su último resultado. */
function interpretarResultado(r) {
  const n = Number(r);
  if (n === 0) return 'ok';
  if (n === 267009) return 'corriendo';
  if (n === 3221225786) return 'cerrada-con-la-sesion'; // 0xC000013A: la ventana se cerró
  if (n === 267011) return 'sin-correr';                 // 0x41303: nunca corrió
  return 'error';
}
/** Dónde mirar el log de una tarea que falló; null si no se sabe (no se inventa). */
function logDeTarea(t, rutas) {
  const r = rutas || {};
  const nom = String(t.nombre || '');
  const f = t.ultima ? String(t.ultima).slice(0, 10) : '';
  const m = nom.match(/Agencia\s+(Semanal|Diaria)/i);
  if (m && f) return path.join(r.agencia || '<AGENCIA_DATOS>', 'logs', f + '_' + m[1].toLowerCase() + '.log');
  if (/Vig[ií]a/i.test(nom) && f) return path.join(r.ingesta || '<INGESTA>', 'salida', 'vigia', f + '.log');
  if (/Ingest/i.test(nom)) return path.join(r.ingesta || '<INGESTA>', 'salida', '<id>', 'logs') + path.sep;
  return null;
}
function itemsTareas(tareas, ahora, rutas) {
  const out = { decidiHoy: [], correSolo: [], datos: [] };
  (Array.isArray(tareas) ? tareas : []).forEach((t) => {
    if (!t) return;
    const est = interpretarResultado(t.resultado);
    const ult = t.ultima ? String(t.ultima).slice(0, 16).replace('T', ' ') : 'nunca';
    const prox = t.proxima ? String(t.proxima).slice(0, 16).replace('T', ' ') : 'sin programar';
    const cuerpo = 'Estado ' + (t.estado || '?') + ' · última corrida ' + ult + ' · próxima ' + prox + ' · resultado ' + t.resultado;
    out.correSolo.push(item('tareas', t.nombre, cuerpo, est === 'error' ? 'riesgo' : 'info'));
    if (est === 'error') {
      out.decidiHoy.push(item('tareas', String(t.nombre).replace(/^MotorStats\s*/, '') + ' terminó con error el ' + ult,
        'Código ' + t.resultado + '.' + (logDeTarea(t, rutas) ? ' Mirá el log (' + logDeTarea(t, rutas) + ') antes de volver a correrla.' : ' Mirá el log de la rutina antes de volver a correrla.'), 'riesgo'));
    } else if (est === 'cerrada-con-la-sesion') {
      out.datos.push(item('tareas', String(t.nombre) + ' se cerró con la sesión', 'No es un error de la rutina: la ventana se cerró mientras corría. Código ' + t.resultado + '.', 'info'));
    }
  });
  return out;
}

/** C · El candado de la ingesta. `mtimeMs` null = no existe. */
function itemsCandado(mtimeMs, ahora) {
  const out = { decidiHoy: [], correSolo: [], datos: [] };
  if (mtimeMs == null) { out.correSolo.push(item('candado', 'Sin corrida de ingesta en curso', 'No hay candado: se puede lanzar una corrida.', 'info')); return out; }
  const min = Math.round((new Date(ahora).getTime() - mtimeMs) / 60000);
  const desde = new Date(mtimeMs).toISOString().slice(0, 16).replace('T', ' ');
  if (min < MIN_CANDADO_COLGADO) out.correSolo.push(item('candado', 'Corrida de ingesta en curso desde ' + desde + ' (UTC)', 'Lleva ' + min + ' min. No subir paquetes a mano mientras dure.', 'info'));
  else out.decidiHoy.push(item('candado', 'Candado de la ingesta colgado', 'Tiene ' + min + ' min (más de ' + MIN_CANDADO_COLGADO + '). La mesa no lo borra: verificá que no haya una corrida viva y recién ahí sacalo a mano.', 'riesgo'));
  return out;
}

/** D · La cola de Canva. */
function itemsCola(pendientes) {
  const out = { decidiHoy: [], correSolo: [], datos: [] };
  (Array.isArray(pendientes) ? pendientes : []).filter((p) => p && p.estado === 'pendiente').forEach((p) => {
    out.decidiHoy.push(item('cola', 'Pieza por pasar a Canva: ' + (p.titulo || p.id || 'sin nombre'), 'Está pendiente en la cola de Canva.', 'info', '/agencia canva'));
  });
  return out;
}

/** E · El banco de ideas y las ideas nuevas del último día. */
function itemsBanco(banco, ideasUltimoDia, diaUltimo) {
  const out = { decidiHoy: [], correSolo: [], datos: [] };
  const ideas = (banco && Array.isArray(banco.ideas)) ? banco.ideas : [];
  ['nueva', 'elegida', 'en-curso'].forEach((e) => {
    const n = ideas.filter((i) => i && i.estado === e).length;
    if (n) out.datos.push(item('banco', n + (n === 1 ? ' idea ' : ' ideas ') + (e === 'nueva' ? 'nueva' + (n === 1 ? '' : 's') : e === 'elegida' ? (n === 1 ? 'elegida' : 'elegidas') : 'en curso'), 'En el banco de ideas de la agencia.', 'info'));
  });
  const norm = (s) => String(s || '').trim().toLowerCase();
  const yaDecididas = new Set(ideas.filter((i) => i && i.estado !== 'nueva').map((i) => norm(i.datos && i.datos.titulo)));
  (Array.isArray(ideasUltimoDia) ? ideasUltimoDia : []).filter((x) => x && x.titulo && !yaDecididas.has(norm(x.titulo))).forEach((x) => {
    out.decidiHoy.push(item('banco', 'Idea nueva: ' + x.titulo, 'Del ' + diaLindo(diaUltimo) + (x.rank ? ' · puesto ' + x.rank : '') + '. Falta elegirla o descartarla.', 'info'));
  });
  return out;
}

/**
 * F · Los ciclos de UN equipo. `paq` es el paquete de laboratorio; `sellos` el hash de
 * sellados de la categoría. Mismo criterio que server/rutas/ciclos.js: el ciclo se arma
 * con armarVentana, se audita con auditar y el sello vive en `<campo>|<claveSello>`.
 */
function itemsCiclosEquipo(CICLOS, paq, sellos, campo, club, cat, nombre, ahora) {
  ahora = ahora || new Date();
  const out = { decidiHoy: [], correSolo: [], datos: [] };
  const hoy = new Date(ahora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  CICLOS.ventanas(paq, 4).filter((v) => v.cerrado).forEach((v) => {
    const crit = { tipo: 'ciclo', numero: v.numero, n: 4 };
    const ciclo = CICLOS.armarVentana(paq, crit, { hoy });
    if (!ciclo) return;
    if (sellos && sellos[campo + '|' + CICLOS.claveSello(ciclo.meta)]) return; // ya sellado: nada que decidir
    const aud = CICLOS.auditar(ciclo, paq);
    if (aud.apto) {
      out.decidiHoy.push(item('ciclos', 'Ciclo ' + v.numero + ' de ' + nombre + ' listo para cerrar', 'Cerrado (4 partidos, ' + diaLindo(v.desde) + ' al ' + diaLindo(v.hasta) + '), apto y sin sello.', 'info', '/cerrar-ciclo ' + club + ' ' + cat + ' "' + nombre + '" ' + v.numero));
    } else {
      const motivo = aud.items.filter((i) => i.nivel === 'error').map((i) => i.texto).join(' ') || 'La auditoría no lo da por apto.';
      out.datos.push(item('ciclos', 'Ciclo ' + v.numero + ' de ' + nombre + ' cerrado pero NO apto', motivo, 'riesgo'));
    }
  });
  return out;
}

/** G · La salida (ya parseada) de `carga-manual.js control` en simulación. */
function itemsManuales(salida) {
  const out = { decidiHoy: [], correSolo: [], datos: [] };
  const s = salida || {};
  const cant = Number(s.cantidad) || 0;
  if (cant > 0) out.decidiHoy.push(item('manuales', cant + (cant === 1 ? ' partido' : ' partidos') + ' del ' + diaLindo(s.fechaRevisada) + ' por cargar', 'Torneos sin box score: hay que cargar el resultado a mano.', 'info', '/fecha-manual'));
  const fall = Array.isArray(s.fallaron) ? s.fallaron : [];
  if (fall.length) out.datos.push(item('manuales', fall.length + (fall.length === 1 ? ' zona no se pudo leer' : ' zonas no se pudieron leer'), fall.map((f) => (typeof f === 'string' ? f : ((f && (f.zona || f.torneo || f.error)) || '?') + (f && f.mensaje ? ': ' + f.mensaje : ''))).join(' · '), 'riesgo'));
  return out;
}

/** H · Las filas de la tabla `| Qué | De quién depende | Desde |` de pendientes.md. */
function itemsCerebro(texto) {
  const out = { decidiHoy: [], correSolo: [], datos: [] };
  String(texto || '').split(/\r?\n/).forEach((l) => {
    if (!/^\s*\|/.test(l)) return;
    const celdas = l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (celdas.length < 2 || celdas.every((c) => /^:?-{2,}:?$/.test(c))) return; // separador
    if (/^qu[eé]$/i.test(celdas[0])) return; // encabezado
    out.datos.push(item('cerebro', celdas[0], 'Depende de ' + (celdas[1] || '?') + (celdas[2] ? ' · desde ' + celdas[2] : ''), 'info'));
  });
  return out;
}

/* ============================ RECOLECTORES ============================ */

const conTope = (promesa, ms, nombre) => new Promise((ok, no) => {
  const t = setTimeout(() => no(new Error('la fuente «' + nombre + '» no contestó en ' + Math.round(ms / 1000) + ' s')), ms);
  Promise.resolve(promesa).then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); no(e); });
});

const execReal = (cmd, args, opts) => new Promise((ok, no) => {
  execFile(cmd, args, Object.assign({ windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, opts), (e, stdout, stderr) => (e ? no(Object.assign(new Error(String(stderr || e.message).slice(0, 300)), { stdout: String(stdout || '') })) : ok({ stdout: String(stdout) })));
});

function depsPorDefecto(d) {
  const x = Object.assign({}, d || {});
  x.exec = x.exec || execReal;
  x.fs = x.fs || fs;
  x.ahora = x.ahora || (() => new Date());
  x.env = x.env || process.env;
  x.plataforma = x.plataforma || process.platform;
  x.datos = x.datos || process.env.CENTRO_MANDO_DATOS || path.join(RAIZ, 'contenido');
  x.agencia = x.agencia || process.env.AGENCIA_DATOS || path.join(RAIZ, 'contenido', 'vigilancia');
  x.ingesta = x.ingesta || process.env.ECOSISTEMA_INGESTA || path.join(RAIZ, '..', 'motorstats-ingestion');
  x.raiz = x.raiz || RAIZ;
  return x;
}
const leerJson = (D, f) => JSON.parse(D.fs.readFileSync(f, 'utf8'));
const existe = (D, f) => { try { D.fs.statSync(f); return true; } catch (e) { return false; } };

async function fuenteAuditor(D) {
  const carpeta = path.join(D.datos, 'auto-process');
  let archivos = [];
  try { archivos = D.fs.readdirSync(carpeta).filter((f) => /_auditoria\.json$/.test(f)).sort(); } catch (e) { /* sin carpeta */ }
  if (!archivos.length) throw new Error('no hay ningún informe del auditor en auto-process/');
  const ult = archivos[archivos.length - 1];
  const fecha = (ult.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
  return { items: itemsAuditor(leerJson(D, path.join(carpeta, ult)), fecha, D.ahora()), actualizado: fecha };
}

/** El Get-ScheduledTask solo LEE; la fecha 1999 es el «nunca corrió» de Windows. */
const PS_TAREAS = "Get-ScheduledTask -TaskName 'MotorStats*' -ErrorAction SilentlyContinue | ForEach-Object { $i = $_ | Get-ScheduledTaskInfo; " +
  "[pscustomobject]@{ nombre = $_.TaskName; estado = [string]$_.State; " +
  "ultima = $(if ($i.LastRunTime -and $i.LastRunTime.Year -gt 2000) { $i.LastRunTime.ToString('s') } else { $null }); " +
  "resultado = $i.LastTaskResult; " +
  "proxima = $(if ($i.NextRunTime -and $i.NextRunTime.Year -gt 2000) { $i.NextRunTime.ToString('s') } else { $null }) } } | ConvertTo-Json -Compress";
async function fuenteTareas(D) {
  if (D.plataforma !== 'win32') throw new Error('solo Windows');
  const r = await D.exec('powershell', ['-NoProfile', '-Command', PS_TAREAS], { timeout: 15000 });
  const t = String(r.stdout || '').trim();
  const j = t ? JSON.parse(t) : [];
  return { items: itemsTareas(Array.isArray(j) ? j : [j], D.ahora(), { agencia: D.agencia, ingesta: D.ingesta }) };
}

async function fuenteCandado(D) {
  const f = path.join(D.ingesta, 'salida', '.corrida.lock');
  let m = null;
  try { m = D.fs.statSync(f).mtimeMs; } catch (e) { m = null; }
  return { items: itemsCandado(m, D.ahora()) };
}

async function fuenteCola(D) {
  const f = path.join(D.datos, 'centro-mando', 'cola-canva.json');
  let l = [];
  try { l = leerJson(D, f).pendientes; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  return { items: itemsCola(l) };
}

async function fuenteBanco(D) {
  const base = path.join(D.agencia, 'agencia');
  let banco = null;
  try { banco = leerJson(D, path.join(base, 'banco.json')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let ideas = [], diaUlt = '';
  try {
    const arch = D.fs.readdirSync(path.join(base, 'ideas')).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    if (arch.length) { diaUlt = arch[arch.length - 1].slice(0, 10); ideas = leerJson(D, path.join(base, 'ideas', arch[arch.length - 1])).ideas || []; }
  } catch (e) { /* sin ideas todavía */ }
  if (!banco && !ideas.length) throw new Error('no hay banco ni ideas todavía');
  return { items: itemsBanco(banco, ideas, diaUlt) };
}

async function fuenteCiclos(D) {
  const kv = D.kv || require('../server/lib/kv.js');
  if (!kv.configurado()) throw new Error('el KV no está configurado (¿se cargó server/.env? el servidor lo carga al arrancar)');
  const catalogo = D.catalogo || require('../server/lib/catalogo.js');
  const PBP = D.pbp || require('../server/rutas/pbp.js');
  const CICLOS = D.ciclos || require('../js/sgadd-ciclos.js');
  const cascada = await catalogo.cargar();
  const cat = cascada && cascada.catalogo;
  if (!cat) throw new Error('no se pudo leer el catálogo');
  const out = { decidiHoy: [], correSolo: [], datos: [] };
  const sinEquipo = [];
  /* Igual que paqueteDe de server/rutas/ciclos.js: UN campo (el equipo propio de la categoría), no el hash entero. */
  const ultima = (p) => ((p && p.ciclos && p.ciclos.partidos) || []).reduce((m, x) => (x && x.fecha && x.fecha > m ? x.fecha : m), '');
  for (const club of Object.keys(cat)) {
    if (cat[club] && cat[club].tipo === 'torneo') continue; // un torneo no es un cliente: no tiene equipo propio
    const cs = (cat[club] && cat[club].categorias) || {};
    for (const slug of Object.keys(cs)) {
      const res = catalogo.resolver(cat, club, slug);
      if (!res || !(res.laboratorio || []).includes('pbp')) continue;
      if (!res.equipoPropio) { sinEquipo.push(club + '/' + slug); continue; }
      const campo = PBP.campoDeEquipo(res.equipoPropio);
      const claves = PBP.claveDeDatos(cat, club, slug);
      const lista = typeof claves === 'string' ? [claves] : [claves.propia, claves.torneo];
      let paq = null;
      for (const k of lista) {
        const l = await kv.leerCampos(k, [campo]);
        const p = l && l[campo];
        if (p && (!paq || ultima(p) > ultima(paq))) paq = p;
      }
      if (!paq) continue;
      const sellos = (await kv.leerHash('sgadd:ciclos:' + club + ':' + slug)) || {};
      const r = itemsCiclosEquipo(CICLOS, paq, sellos, campo, club, slug, res.equipoPropio, D.ahora());
      ['decidiHoy', 'correSolo', 'datos'].forEach((c) => out[c].push(...r[c]));
    }
  }
  if (sinEquipo.length) out.datos.push(item('ciclos', sinEquipo.length + (sinEquipo.length === 1 ? ' categoría con laboratorio no tiene' : ' categorías con laboratorio no tienen') + ' equipo propio', 'No se revisaron sus ciclos: ' + sinEquipo.join(', ') + '.', 'info'));
  return { items: out };
}

/** El control corre en SIMULACIÓN (sin la bandera de escritura) y no toca el calendario. Este arreglo es lo único que se ejecuta. */
const ARGS_MANUALES = ['server/bin/carga-manual.js', 'control'];
async function fuenteManuales(D) {
  let r;
  try { r = await D.exec(process.execPath, ARGS_MANUALES, { cwd: D.raiz, timeout: 90000 }); }
  catch (e) {
    /* El control sale con error ante un aviso esperable (p. ej. sin torneos manuales): si trae {codigo, mensaje}, es un dato, no una fuente caída. */
    const t0 = String((e && e.stdout) || ''), i0 = t0.indexOf('{');
    let j = null;
    try { j = i0 >= 0 ? JSON.parse(t0.slice(i0)) : null; } catch (x) { j = null; }
    if (j && j.codigo && j.mensaje) return { items: { decidiHoy: [], correSolo: [], datos: [item('manuales', 'El control de partidos manuales avisó: ' + j.codigo, String(j.mensaje), 'info')] } };
    throw e;
  }
  const t = String(r.stdout || '');
  const i = t.indexOf('{');
  if (i < 0) throw new Error('el control de partidos manuales no devolvió un JSON');
  return { items: itemsManuales(JSON.parse(t.slice(i))) };
}

async function fuenteCerebro(D) {
  const c = D.env.MESA_CEREBRO;
  if (!c) throw new Error('MESA_CEREBRO sin configurar');
  const f = path.join(c, 'pendientes.md');
  return { items: itemsCerebro(D.fs.readFileSync(f, 'utf8')), actualizado: dia(D.fs.statSync(f).mtimeMs) };
}

const RECOLECTORES = {
  auditor: [fuenteAuditor, 10000], tareas: [fuenteTareas, 20000], candado: [fuenteCandado, 5000], cola: [fuenteCola, 5000],
  banco: [fuenteBanco, 5000], ciclos: [fuenteCiclos, 30000], manuales: [fuenteManuales, 95000], cerebro: [fuenteCerebro, 5000],
};

/* ============================ LA MESA ============================ */

let CACHE = null, EN_VUELO = null;
/** Una sola lectura a la vez: un segundo pedido (otro clic, otra pestaña) recibe la MISMA promesa en vez de disparar otra corrida de 95 s. */
function mesa(deps, opciones) {
  if (deps && deps.sinCache) return leerMesa(deps, opciones);
  if (EN_VUELO) return EN_VUELO;
  EN_VUELO = leerMesa(deps, opciones).finally(() => { EN_VUELO = null; });
  return EN_VUELO;
}
async function leerMesa(deps, opciones) {
  const D = depsPorDefecto(deps);
  const fresco = !!(opciones && opciones.fresco);
  const ahoraMs = D.ahora().getTime();
  if (!fresco && !(deps && deps.sinCache) && CACHE && ahoraMs - CACHE.en < TTL_CACHE_MS) return Object.assign({}, CACHE.valor, { deCache: true });
  const fuentes = {}, col = { decidiHoy: [], correSolo: [], datos: [] };
  await Promise.all(FUENTES.map(async (nombre) => {
    try {
      const [f, tope] = RECOLECTORES[nombre];
      const r = await conTope(f(D), tope, nombre);
      fuentes[nombre] = Object.assign({ ok: true }, r.actualizado ? { actualizado: r.actualizado } : {});
      ['decidiHoy', 'correSolo', 'datos'].forEach((c) => col[c].push(...(r.items[c] || [])));
    } catch (e) { fuentes[nombre] = { ok: false, error: String((e && e.message) || e).slice(0, 300) }; }
  }));
  const valor = { generado: D.ahora().toISOString(), deCache: false, decidiHoy: ordenar(col.decidiHoy), correSolo: ordenar(col.correSolo), datos: ordenar(col.datos), fuentes };
  if (!(deps && deps.sinCache)) CACHE = { en: ahoraMs, valor };
  return valor;
}
const vaciarCache = () => { CACHE = null; };

/** Solo GETs: la mesa es de lectura. */
function montar(a, ruta) {
  a.get('/mesa-ui.js', (req, res) => res.sendFile(path.join(__dirname, 'mesa-ui.js')));
  a.get('/api/mesa', ruta((req) => mesa(null, { fresco: req.query && req.query.fresco === '1' })));
}

module.exports = { montar, mesa, vaciarCache, logDeTarea, itemsAuditor, itemsTareas, interpretarResultado, itemsCandado, itemsCola, itemsBanco, itemsCiclosEquipo, itemsManuales, itemsCerebro, ordenar, ARGS_MANUALES, PS_TAREAS, TTL_CACHE_MS };
