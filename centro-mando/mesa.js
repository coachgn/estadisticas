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

/* ============================ LAS OPERACIONES (Fase 2) ============================ */
/* «Preparar» NO ejecuta: arma el texto de un ensayo (no escribe) y de un paso real (espera el OK de
   una persona) con sus guardas. Este bloque es lo único de mesa.js que nombra banderas de escritura:
   el test del fuente lo recorta por estas marcas y vigila todo lo demás. */
/* <operaciones> */

/** Equipo, club y categoría salen de KV y terminan pegados en una consola: solo se acepta lo que no
 *  necesita escape (nunca se escapa a mano: un nombre raro se rechaza y el comando se arma a mano). */
const NOMBRE_SEGURO = /^[\p{L}\p{N} .\-_'()]{1,60}$/u;
/** NFC antes de testear (un «Martín» en NFD es el mismo nombre) y sin guion inicial: «--enviar» o «-x» serían banderas del script, no un nombre. */
const nfc = (s) => (typeof s === 'string' ? s.normalize('NFC') : s);
const nombreSeguro = (s) => { if (typeof s !== 'string') return false; const n = nfc(s); return !n.startsWith('-') && NOMBRE_SEGURO.test(n); };
/** Club y categoría van SIN comillas en el comando (en PowerShell un «(…)» suelto se evalúa): solo el slug del catálogo. */
const SLUG_SEGURO = /^[a-z0-9][a-z0-9-]{0,59}$/;
const slugSeguro = (s) => typeof s === 'string' && SLUG_SEGURO.test(s);

/** Guardas de la ingesta: el candado de la corrida y la ventana de las 02:00 / 10:00 (hora de Argentina,
 *  UTC-3 sin horario de verano). `candado` = { mtimeMs } | null. */
const N_GUARDAS_INGESTA = 2; // candado + ventana: las que mesa() recalcula en cada lectura
function guardasIngesta(candado, ahora) {
  const out = [];
  const t = new Date(ahora || Date.now()).getTime();
  if (candado && candado.desconocido) out.push({ texto: 'No encontré la carpeta de la ingesta (' + candado.ruta + '): no puedo saber si hay una corrida.', estado: 'mirar' });
  else if (!candado || candado.mtimeMs == null) out.push({ texto: 'No hay una corrida de ingesta en curso.', estado: 'ok' });
  else {
    const min = Math.round((t - candado.mtimeMs) / 60000);
    out.push(min < MIN_CANDADO_COLGADO
      ? { texto: 'Hay una corrida de ingesta en curso (' + min + ' min): el paquete puede estar cambiando. Esperá a que termine.', estado: 'bloquea' }
      : { texto: 'El candado de la ingesta tiene ' + min + ' min (colgado): verificá que no haya una corrida viva antes de seguir.', estado: 'mirar' });
  }
  const ar = new Date(t - 3 * 3600 * 1000);
  const minDia = ar.getUTCHours() * 60 + ar.getUTCMinutes();
  const cerca = [2 * 60, 10 * 60].some((m) => Math.abs(minDia - m) <= 15);
  out.push(cerca
    ? { texto: 'Estás a menos de 15 min de la ingesta de las 02:00 / 10:00 (hora de Argentina): conviene esperar a que pase.', estado: 'mirar' }
    : { texto: 'Fuera de la ventana de la ingesta (02:00 / 10:00, hora de Argentina).', estado: 'ok' });
  return out;
}

const paso = (etiqueta, comando, escribe, nota) => ({ etiqueta, comando: comando || '', escribe: !!escribe, nota: nota || '' });
const SIN_NOMBRE_SEGURO = { texto: 'El nombre tiene caracteres raros: armá el comando a mano.', estado: 'bloquea' };

/** Una operación = qué hace, los pasos (ensayo primero, real después) y las guardas. PURA. `contexto` = { candado, ahora }. */
function operacion(tipo, datos, contexto) {
  const d = datos || {}, c = contexto || {};
  if (tipo === 'ciclo') {
    const n = d.ciclo;
    const equipo = nfc(d.equipo);
    const base = { id: 'ciclo', titulo: 'Cerrar el ciclo ' + n, queHace: 'Revisa el informe del ciclo, ensaya la publicación (cuenta destinatarios sin mandar nada) y deja el sellado y el envío para el panel.', skill: '/cerrar-ciclo ' + d.club + ' ' + d.categoria + ' "' + equipo + '" ' + n };
    if (!slugSeguro(d.club) || !slugSeguro(d.categoria) || !nombreSeguro(d.equipo) || !Number.isInteger(n) || n < 0) return Object.assign(base, { skill: '', pasos: [], guardas: [SIN_NOMBRE_SEGURO] });
    const args = ' --club ' + d.club + ' --categoria ' + d.categoria + ' --equipo "' + equipo + '" --ciclo ' + n;
    return Object.assign(base, {
      pasos: [
        paso('Ver el informe del ciclo', 'node server/bin/ciclos.js informe' + args + ' --salida contenido/ciclos-informes', false, 'No toca KV ni manda nada: deja el HTML y el PDF en contenido/ciclos-informes, una carpeta que git ignora (no se commitea).'),
        paso('Ensayo de la publicación', 'node server/bin/ciclos.js publicar' + args, false, 'Sin la bandera de envío: compila el PDF y cuenta los destinatarios, no manda nada. Si responde SIN_GESTION, primero guardalo y auditalo en Comparativa → Ciclos · gestión. Imprime los mails de los destinatarios: no los compartas ni los pegues en un chat.'),
        paso('Sellar, publicar y enviar', '', true, 'Se hace desde el panel, en el modal «Sellar, publicar y enviar…» (camino A de /cerrar-ciclo): no tiene comando de shell. Sellar NO se deshace.'),
      ],
      guardas: guardasIngesta(c.candado, c.ahora).concat([{ texto: 'El OK para sellar no es el OK para mandar: son dos decisiones.', estado: 'mirar' }]),
    });
  }
  if (tipo === 'manuales') {
    return {
      id: 'manuales', titulo: 'Cargar los partidos manuales', queHace: 'Muestra qué partidos faltan (simulación), se cargan desde el Panel Master y recién ahí se activa la alerta real.', skill: '/fecha-manual',
      pasos: [
        paso('Control en simulación', 'node server/bin/carga-manual.js control', false, 'Es lo mismo que lee la mesa: no escribe en el calendario.'),
        paso('Publicar los partidos del tramo', '', true, 'Desde el Panel Master (Configuración → partidos manuales del tramo). Se publica la lista ENTERA del tramo: lo de antes más lo nuevo.'),
        paso('Alerta real de carga', 'node server/bin/carga-manual.js control --real', true, 'Escribe en Google Calendar.'),
      ],
      guardas: [{ texto: 'Publicar reemplaza la lista entera del tramo: no mandes solo lo nuevo.', estado: 'mirar' }, { texto: 'Sin empates y con los nombres idénticos a los de la tabla.', estado: 'mirar' }],
    };
  }
  if (tipo === 'cola') {
    return {
      id: 'cola', titulo: 'Pasar las piezas pendientes a Canva', queHace: 'Ensaya la importación y, con tu OK, la hace.', skill: '/agencia canva',
      pasos: [paso('Ensayo de la importación', 'node centro-mando/canva.js importar --ensayo', false, 'No toca nada.'), paso('Importar a Canva', 'npm run canva', true, 'Hace commit y push de placas-tmp.')],
      guardas: [{ texto: 'Hace commit y push de placas-tmp al repo público: siempre con tu OK.', estado: 'mirar' }],
    };
  }
  if (tipo === 'auditor-viejo') {
    return { id: 'auditor', titulo: 'Volver a correr el auditor', queHace: 'El informe tiene más de una semana: se vuelve a generar.', skill: '/auditar', pasos: [paso('Correr el auditor', 'npm run auditar', false, 'Lee y sale a la red; tarda cerca de un minuto.')], guardas: [] };
  }
  if (tipo === 'arreglo') {
    if (!d.comando) return null;
    return { id: 'arreglo', titulo: 'Aplicar el arreglo del auditor', queHace: 'Es el arreglo tal cual lo propone el informe del auditor.', skill: '', pasos: [paso('Arreglo propuesto', String(d.comando), true, 'Escribe: esperá tu OK.')], guardas: [{ texto: 'Revisá que el comando sea el de OPERACION_ECOSISTEMA.md, punto 3.', estado: 'mirar' }] };
  }
  return null;
}
/* </operaciones> */

/** El pedido de operación queda ATADO al ítem sin ser parte de su JSON; `armarOperaciones` lo resuelve ya con el candado leído. */
function conOp(it, tipo, datos) {
  Object.defineProperty(it, '_op', { value: { tipo, datos }, enumerable: false, configurable: true });
  return it;
}
function armarOperaciones(items, contexto) {
  items.forEach((it) => {
    if (!it || !it._op) return;
    const op = operacion(it._op.tipo, it._op.datos, contexto);
    if (op) it.operacion = op;
    delete it._op;
  });
}
const textoFallaron = (fall) => fall.map((f) => (typeof f === 'string' ? f : ((f && (f.zona || f.torneo || f.error)) || '?') + (f && f.mensaje ? ': ' + f.mensaje : ''))).join(' · ');

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
    if (x.arreglo) conOp(it, 'arreglo', { comando: x.arreglo });
    (rompe ? out.decidiHoy : out.datos).push(it);
  });
  if (viejo) {
    out.decidiHoy.unshift(conOp(item('auditor', 'El último informe del auditor es del ' + (fecha ? diaLindo(fecha) : 'pasado'),
      'Tiene más de ' + DIAS_INFORME_VIEJO + ' días: lo que figura puede haber cambiado. Correrlo tarda cerca de un minuto y sale a la red.', 'riesgo', 'npm run auditar'), 'auditor-viejo', {}));
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
  if (mtimeMs && typeof mtimeMs === 'object') { out.decidiHoy.push(item('candado', 'No puedo saber si hay una corrida de ingesta', 'No encontré la carpeta de la ingesta (' + mtimeMs.ruta + ') o no pude leerla: no sé si hay una corrida en curso.', 'riesgo')); return out; }
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
    out.decidiHoy.push(conOp(item('cola', 'Pieza por pasar a Canva: ' + (p.titulo || p.id || 'sin nombre'), 'Está pendiente en la cola de Canva.', 'info', '/agencia canva'), 'cola', {}));
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
/** Los campos del hash de sellos que importan: uno por ciclo CERRADO de ese equipo (`<campo>|<claveSello>`), para leerlos con HMGET en vez de bajar el hash entero. */
function camposSellos(CICLOS, paq, campo, ahora) {
  ahora = ahora || new Date();
  const hoy = new Date(ahora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const out = [];
  CICLOS.ventanas(paq, 4).filter((v) => v.cerrado).forEach((v) => {
    const ciclo = CICLOS.armarVentana(paq, { tipo: 'ciclo', numero: v.numero, n: 4 }, { hoy });
    if (ciclo) out.push(campo + '|' + CICLOS.claveSello(ciclo.meta));
  });
  return out;
}
function itemsCiclosEquipo(CICLOS, paq, sellos, campo, club, cat, nombre, ahora) {
  ahora = ahora || new Date();
  const out = { decidiHoy: [], correSolo: [], datos: [] };
  const hoy = new Date(ahora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const listos = [], noAptos = [];
  CICLOS.ventanas(paq, 4).filter((v) => v.cerrado).forEach((v) => {
    const crit = { tipo: 'ciclo', numero: v.numero, n: 4 };
    const ciclo = CICLOS.armarVentana(paq, crit, { hoy });
    if (!ciclo) return;
    if (sellos && sellos[campo + '|' + CICLOS.claveSello(ciclo.meta)]) return; // ya sellado: nada que decidir
    const aud = CICLOS.auditar(ciclo, paq);
    if (aud.apto) {
      listos.push(v);
    } else {
      noAptos.push(v.numero);
      const motivo = aud.items.filter((i) => i.nivel === 'error').map((i) => i.texto).join(' ') || 'La auditoría no lo da por apto.';
      out.datos.push(item('ciclos', 'Ciclo ' + v.numero + ' de ' + nombre + ' cerrado pero NO apto', motivo, 'riesgo'));
    }
  });
  /* UNA fila por equipo: diez ciclos sin sello no son diez decisiones. La operación es la del MÁS VIEJO apto y sin sello. */
  if (listos.length) {
    listos.sort((a, b) => a.numero - b.numero);
    const p = listos[0], u = listos[listos.length - 1];
    const nums = listos.map((x) => x.numero);
    const seguidos = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    const lista = seguidos ? p.numero + ' a ' + u.numero
      : nums.slice(0, -1).join(', ') + ' y ' + u.numero;
    const titulo = listos.length === 1 ? 'Ciclo ' + p.numero + ' de ' + nombre + ' listo para cerrar'
      : nombre + ' · ' + listos.length + ' ciclos listos para cerrar (' + lista + ')';
    const abierto = noAptos.filter((n) => n < p.numero).sort((a, b) => a - b)[0];
    const aviso = abierto != null ? ' El ciclo ' + abierto + ' sigue abierto y no es apto: ver Datos.' : '';
    const detalle = listos.length === 1
      ? 'Cerrado (4 partidos, ' + diaLindo(p.desde) + ' al ' + diaLindo(p.hasta) + '), apto y sin sello.' + aviso
      : 'Ciclos ' + nums.join(', ') + ', todos aptos y sin sello. Se prepara el más viejo, el ' + p.numero + ' (4 partidos, ' + diaLindo(p.desde) + ' al ' + diaLindo(p.hasta) + ').' + aviso;
    out.decidiHoy.push(conOp(item('ciclos', titulo, detalle, 'info', '/cerrar-ciclo ' + club + ' ' + cat + ' "' + nombre + '" ' + p.numero),
      'ciclo', { club, categoria: cat, equipo: nombre, ciclo: p.numero }));
  }
  return out;
}

/** G · La salida (ya parseada) de `carga-manual.js control` en simulación. */
function itemsManuales(salida) {
  const out = { decidiHoy: [], correSolo: [], datos: [] };
  const s = salida || {};
  const cant = Number(s.cantidad) || 0;
  if (cant > 0) out.decidiHoy.push(conOp(item('manuales', cant + (cant === 1 ? ' partido' : ' partidos') + ' del ' + diaLindo(s.fechaRevisada) + ' por cargar', 'Torneos sin box score: hay que cargar el resultado a mano.', 'info', '/fecha-manual'), 'manuales', {}));
  const fall = Array.isArray(s.fallaron) ? s.fallaron : [];
  if (fall.length) out.datos.push(item('manuales', fall.length + (fall.length === 1 ? ' zona no se pudo leer' : ' zonas no se pudieron leer'), textoFallaron(fall), 'riesgo'));
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

/** Se lee UNA vez por lectura de la mesa: la fuente «candado» y las guardas de las operaciones comparten el dato. */
function leerCandado(D) {
  if (!D.candadoP) {
    D.candadoP = Promise.resolve().then(() => {
      const dir = path.join(D.ingesta, 'salida');
      const f = path.join(dir, '.corrida.lock');
      try { return D.fs.statSync(f).mtimeMs; } catch (e) {
        /* Falla CERRADA: «sin corrida» solo si el lock no existe Y la carpeta de la ingesta sí. Carpeta ausente o cualquier otro error = no sé. */
        if (e && e.code === 'ENOENT') {
          try { if (D.fs.statSync(dir).isDirectory()) return null; } catch (e2) { /* cae al desconocido */ }
        }
        return { desconocido: true, ruta: String(D.ingesta) };
      }
    });
  }
  return D.candadoP;
}
/** Lo que leyó leerCandado → lo que esperan guardasIngesta (objeto|null) e itemsCandado. */
const candadoDe = (m) => (m == null ? null : typeof m === 'object' ? m : { mtimeMs: m });
async function fuenteCandado(D) {
  return { items: itemsCandado(await leerCandado(D), D.ahora()) };
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
      /* Solo los sellos de los ciclos cerrados de ESTE equipo (HMGET): leerHash bajaba cada sello con el ciclo entero adentro. */
      const camposS = camposSellos(CICLOS, paq, campo, D.ahora());
      const sellos = camposS.length ? ((await kv.leerCampos('sgadd:ciclos:' + club + ':' + slug, camposS)) || {}) : {};
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
    if (j && j.codigo && j.mensaje) {
      /* Un 502 del fixture trae `fallaron` junto al aviso: si se descarta, la lista de zonas caídas desaparece y el ítem parece inocuo. */
      const fall = Array.isArray(j.fallaron) ? j.fallaron : [];
      return { items: { decidiHoy: [], correSolo: [], datos: [item('manuales', 'El control de partidos manuales avisó: ' + j.codigo,
        String(j.mensaje) + (fall.length ? ' · No se pudieron leer: ' + textoFallaron(fall) : ''), fall.length ? 'riesgo' : 'info')] } };
    }
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
  if (!fresco && !(deps && deps.sinCache) && CACHE && ahoraMs - CACHE.en < TTL_CACHE_MS) {
    /* Lo único que no se congela son las guardas de ingesta: una corrida manual que arranca dentro de los 5 min tiene que bloquear. Un statSync es barato. */
    let cand = null, mCand = null;
    try { mCand = await leerCandado(D); cand = candadoDe(mCand); } catch (e) { mCand = { desconocido: true, ruta: String(D.ingesta) }; cand = mCand; }
    const ahoraD = D.ahora();
    /* El ítem «candado» de Corre solo también se recalcula: si no, contradice a las guardas. Se arma sobre la COPIA. */
    const ic = itemsCandado(mCand, ahoraD);
    const colCand = (c, orig) => orig.filter((it) => it.origen !== 'candado').concat(ic[c]);
    const re = (it) => (it.operacion && it.operacion.id === 'ciclo' && (it.operacion.guardas || []).length >= N_GUARDAS_INGESTA)
      ? Object.assign({}, it, { operacion: Object.assign({}, it.operacion, { guardas: guardasIngesta(cand, ahoraD).concat(it.operacion.guardas.slice(N_GUARDAS_INGESTA)) }) }) : it;
    const v = CACHE.valor;
    return Object.assign({}, v, { deCache: true, guardasA: ahoraD.toISOString(), decidiHoy: ordenar(colCand('decidiHoy', v.decidiHoy)).map(re), correSolo: ordenar(colCand('correSolo', v.correSolo)).map(re), datos: v.datos.map(re) });
  }
  const fuentes = {}, col = { decidiHoy: [], correSolo: [], datos: [] };
  await Promise.all(FUENTES.map(async (nombre) => {
    try {
      const [f, tope] = RECOLECTORES[nombre];
      const r = await conTope(f(D), tope, nombre);
      fuentes[nombre] = Object.assign({ ok: true }, r.actualizado ? { actualizado: r.actualizado } : {});
      ['decidiHoy', 'correSolo', 'datos'].forEach((c) => col[c].push(...(r.items[c] || [])));
    } catch (e) { fuentes[nombre] = { ok: false, error: String((e && e.message) || e).slice(0, 300) }; }
  }));
  /* Las operaciones se arman al final: sus guardas necesitan el candado, que no es de una fuente sino de todas. */
  let candado = null;
  try { candado = candadoDe(await leerCandado(D)); } catch (e) { candado = { desconocido: true, ruta: String(D.ingesta) }; }
  armarOperaciones([].concat(col.decidiHoy, col.correSolo, col.datos), { candado, ahora: D.ahora() });
  const valor = { generado: D.ahora().toISOString(), guardasA: D.ahora().toISOString(), deCache: false, decidiHoy: ordenar(col.decidiHoy), correSolo: ordenar(col.correSolo), datos: ordenar(col.datos), fuentes };
  if (!(deps && deps.sinCache)) CACHE = { en: ahoraMs, valor };
  return valor;
}
const vaciarCache = () => { CACHE = null; };

/** Solo GETs: la mesa es de lectura. */
function montar(a, ruta) {
  a.get('/mesa-ui.js', (req, res) => res.sendFile(path.join(__dirname, 'mesa-ui.js')));
  a.get('/api/mesa', ruta((req) => mesa(null, { fresco: req.query && req.query.fresco === '1' })));
}

module.exports = { montar, mesa, vaciarCache, logDeTarea, itemsAuditor, itemsTareas, interpretarResultado, itemsCandado, itemsCola, itemsBanco, itemsCiclosEquipo, camposSellos, itemsManuales, itemsCerebro, ordenar, operacion, nombreSeguro, slugSeguro, guardasIngesta, armarOperaciones, ARGS_MANUALES, PS_TAREAS, TTL_CACHE_MS };
