/* =====================================================================
   /api/v1/ciclos/:clubId/:categoria · los ciclos SELLADOS (Fase 4)

     GET   ?equipo=<nombre>        los ciclos sellados del equipo (o de toda la categoría)
     POST  /sellar                 ADMIN · { equipo, criterio } congela un ciclo cerrado

   Un ciclo cerrado de 4 partidos se SELLA: su informe queda fijo aunque la
   ingesta se regenere o el paquete de laboratorio solo conserve los últimos
   partidos. Es la historia del equipo: se compara, no se reescribe.

   REGLAS
   - El servidor RECALCULA el ciclo desde el paquete que tiene en KV; no
     acepta el que arma el navegador. Quien sella no decide los números.
   - Solo se sella un ciclo cerrado y apto (`SGADD_CICLOS.sellar`).
   - Se escribe con HSETNX: un ciclo sellado NO se reemplaza ni se borra. Si
     el paquete cambió y el ciclo ya no da lo mismo, la lectura lo dice
     (`verificar`) pero lo sellado queda como estaba.
   - Lee: el admin, o un cliente de ESE club con el plan ORO efectivo en la
     categoría. Escribe: solo el admin.

   Hash propio `sgadd:ciclos:<club>:<categoría>`, un campo por
   `<claveEquipo>|<claveCiclo>`. Fuera del catálogo, como los estados (punto 57).
   ===================================================================== */
'use strict';

const kv = require('../lib/kv.js');
const catalogo = require('../lib/catalogo.js');
const mutar = require('../lib/catalogo-mutar.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');
const CICLOS = require('../lib/compartido/sgadd-ciclos.js');
const PBP = require('./pbp.js');
const CLIENTES = require('../lib/clientes.js');
const INFORME = require('../lib/ciclos-informe.js');
const PDF = require('../lib/ciclos-pdf.js');
const ENVIO = require('../lib/mail-envio.js');
const { mailCiclo, numerosCiclo } = require('../lib/mail-ciclo.js');
/** El resumen va en el mail solo si el cuerpo de análisis lo EDITÓ: el automático ya lo dicen las fichas. */
function lecturaEditada(ciclo, lecturas) {
  const base = CICLOS.lecturasBase(ciclo).resumen;
  const r = String((lecturas && lecturas.resumen) || '').trim();
  return r && r !== String(base || '').trim() ? r : '';
}
const FOTO = require('../lib/ciclos-foto.js');

const PREFIJO = 'sgadd:ciclos:';
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

const claveKV = (clubId, slug) => PREFIJO + clubId + ':' + slug;
const error = (status, codigo, mensaje, extra) => ({ status, body: Object.assign({ ok: false, codigo, mensaje }, extra || {}) });

async function autorizar(peticion, deps, soloAdmin) {
  const v = verificarToken(tokenDeLaPeticion(peticion));
  if (!v.ok) return { error: error(401, v.motivo, 'El token de acceso no es válido.') };
  const params = (peticion && peticion.params) || {};
  const clubId = String(params.clubId || '').toLowerCase();
  const slug = String(params.categoria || '').toLowerCase();
  if (!SLUG.test(clubId) || !SLUG.test(slug)) return { error: error(400, 'RUTA_INVALIDA', 'Falta el club o la categoría.') };

  const esAdmin = v.rol === AUTH.ROLES.ADMIN;
  if (soloAdmin && !esAdmin) return { error: error(403, 'SOLO_ADMIN', 'Sellar un ciclo es de administración.') };
  if (!esAdmin && v.club !== clubId) return { error: error(403, 'OTRO_CLUB', 'Los ciclos de otro club no se pueden ver.') };

  const cascada = await catalogo.cargar(deps);
  const club = cascada.catalogo && cascada.catalogo[clubId];
  if (!club || !club.categorias || !club.categorias[slug]) return { error: error(404, 'SIN_CATEGORIA', 'Esa categoría no existe.') };
  const cat = catalogo.resolver(cascada.catalogo, clubId, slug);
  if (!esAdmin) {
    if (!AUTH.tieneAcceso(mutar.estadoEfectivo(cat.suscripcion))) return { error: error(403, 'SUSCRIPCION', 'El acceso a esta categoría no está activo.') };
    /* El plan EFECTIVO de la categoría (punto 60), no el del link firmado. */
    if (!AUTH.alcanzaPlan('ORO', { rol: AUTH.ROLES.CLIENTE, plan: cat.suscripcion && cat.suscripcion.plan, email: 'x@x', equipoAsignado: 'x' })) {
      return { error: error(403, 'REQUIERE_PLAN', 'Los ciclos son del plan ORO.') };
    }
  }
  return { clubId, slug, esAdmin, catalogo: cascada.catalogo };
}

async function manejarCiclos(peticion, deps) {
  const ctx = await autorizar(peticion, deps, false);
  if (ctx.error) return ctx.error;
  const almacen = (deps && deps.kv) || kv;
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'El servidor no tiene dónde leer los ciclos.');
  const q = (peticion && peticion.query) || {};
  const eq = q.equipo ? PBP.campoDeEquipo(q.equipo) : '';
  let hash;
  try { hash = await almacen.leerHash(claveKV(ctx.clubId, ctx.slug)); }
  catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudieron leer los ciclos sellados.'); }
  let sellados = Object.keys(hash).filter(k => !eq || k.split('|')[0] === eq).sort().map(k => hash[k]);
  /* Un cliente ve solo los sellos de ciclos PUBLICADOS (2026-11-06). */
  if (!ctx.esAdmin) {
    let g = {};
    try { g = await almacen.leerHash(claveGestion(ctx.clubId, ctx.slug)); } catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudieron leer los ciclos.'); }
    const pub = new Set(Object.keys(g).filter(k => g[k] && g[k].estado === 'publicado'));
    sellados = Object.keys(hash).filter(k => (!eq || k.split('|')[0] === eq) && pub.has(k)).sort().map(k => hash[k]);
  }
  return { status: 200, body: { ok: true, sellados } };
}

async function manejarSellar(peticion, deps) {
  const ctx = await autorizar(peticion, deps, true);
  if (ctx.error) return ctx.error;
  const almacen = (deps && deps.kv) || kv;
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'El servidor no tiene dónde guardar el sello.');
  const body = (peticion && peticion.body) || {};
  const campoEq = PBP.campoDeEquipo(body.equipo);
  if (!campoEq) return error(400, 'EQUIPO_INVALIDO', 'Falta el equipo.');

  /* El paquete: la MISMA elección que /paquete (paqueteDe), así el sello es el ciclo que se ve. */
  let paq = null;
  try { paq = await paqueteDe(ctx, almacen, campoEq); } catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudo leer el análisis del equipo.'); }
  if (!paq) return error(404, 'SIN_DATOS', 'Todavía no hay análisis de play-by-play de ese equipo.');

  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const r = CICLOS.sellar(paq, body.criterio, { hoy });
  if (!r.ok) return error(422, r.motivo, r.mensaje, { auditoria: r.auditoria || null });

  const campo = campoEq + '|' + r.clave;
  const clave = claveKV(ctx.clubId, ctx.slug);
  let escrito;
  try { escrito = await almacen.comando(['HSETNX', clave, campo, JSON.stringify(r.registro)]); }
  catch (e) { return error(503, 'KV_ESCRITURA', 'No se pudo guardar el sello.'); }
  if (!Number(escrito)) {
    const previo = (await almacen.leerCampos(clave, [campo]))[campo] || null;
    return error(409, 'YA_SELLADO', 'Ese ciclo ya está sellado y no se reemplaza.', {
      sellado: previo ? { huella: previo.huella, fecha: previo.sellado } : null,
      igual: !!(previo && previo.huella === r.registro.huella),
    });
  }
  return { status: 200, body: { ok: true, sellado: r.registro } };
}

/* =====================================================================
   GESTIÓN (Fase 5) · solo ADMIN

     GET   /gestion?equipo=      los documentos de gestión (estado, lecturas, historial)
     POST  /gestion              { equipo, criterio, accion, lecturas?, nota? }
                                 accion: guardar | auditar | reabrir | publicar

   El servidor recalcula el ciclo desde el paquete y aplica la máquina de
   estados de `SGADD_CICLOS.transicionarGestion`: el navegador solo manda el
   criterio y las LECTURAS (texto). Los números no se editan. Hash propio
   `sgadd:ciclos-gestion:<club>:<categoría>`, campo `<equipo>|<clave del ciclo>`.
   ===================================================================== */
const PREFIJO_GESTION = 'sgadd:ciclos-gestion:';
const claveGestion = (clubId, slug) => PREFIJO_GESTION + clubId + ':' + slug;

/* El paquete del equipo. Una categoría enganchada a una zona de torneo tiene
   DOS fuentes posibles: su propio hash (lo que el club subió aparte) y el de la
   zona (lo que carga la ingesta automática). Con las dos, gana la que trae el
   partido de ciclo MÁS RECIENTE: medido el 2026-11-06, la categoría LAB 2026-27
   de Jujuy guardaba el paquete de 2025-26 y tapaba los 5 partidos de 2026. */
const ultimaFecha = (paq) => {
  const l = (paq && paq.ciclos && Array.isArray(paq.ciclos.partidos)) ? paq.ciclos.partidos : [];
  return l.reduce((m, x) => (x && x.fecha && x.fecha > m ? x.fecha : m), '');
};
async function paqueteDe(ctx, almacen, campoEq) {
  const claves = PBP.claveDeDatos(ctx.catalogo, ctx.clubId, ctx.slug);
  const lista = typeof claves === 'string' ? [claves] : [claves.propia, claves.torneo];
  let mejor = null;
  for (const k of lista) {
    const l = await almacen.leerCampos(k, [campoEq]);
    const p = l && l[campoEq];
    if (p && (!mejor || ultimaFecha(p) > ultimaFecha(mejor))) mejor = p;
  }
  return mejor;
}

async function manejarGestion(peticion, deps) {
  const ctx = await autorizar(peticion, deps, true);
  if (ctx.error) return ctx.error;
  const almacen = (deps && deps.kv) || kv;
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'El servidor no tiene dónde leer la gestión.');
  const q = (peticion && peticion.query) || {};
  const eq = q.equipo ? PBP.campoDeEquipo(q.equipo) : '';
  let hash;
  try { hash = await almacen.leerHash(claveGestion(ctx.clubId, ctx.slug)); }
  catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudo leer la gestión de ciclos.'); }
  const docs = Object.keys(hash).filter(k => !eq || k.split('|')[0] === eq).sort().map(k => Object.assign({ campo: k }, hash[k]));
  return { status: 200, body: { ok: true, docs } };
}

async function manejarGestionGuardar(peticion, deps) {
  const ctx = await autorizar(peticion, deps, true);
  if (ctx.error) return ctx.error;
  const almacen = (deps && deps.kv) || kv;
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'El servidor no tiene dónde guardar la gestión.');
  const body = (peticion && peticion.body) || {};
  const campoEq = PBP.campoDeEquipo(body.equipo);
  if (!campoEq) return error(400, 'EQUIPO_INVALIDO', 'Falta el equipo.');
  let paq;
  try { paq = await paqueteDe(ctx, almacen, campoEq); }
  catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudo leer el análisis del equipo.'); }
  if (!paq) return error(404, 'SIN_DATOS', 'Todavía no hay análisis de play-by-play de ese equipo.');

  const ahoraD = new Date();
  const hoy = new Date(ahoraD.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const ciclo = CICLOS.armarVentana(paq, body.criterio, { hoy });
  if (!ciclo) return error(422, 'NO_EXISTE', 'Esa ventana no existe en el paquete del equipo.');
  const auditoria = CICLOS.auditar(ciclo, paq);
  const campo = campoEq + '|' + CICLOS.claveSello(ciclo.meta);
  const clave = claveGestion(ctx.clubId, ctx.slug);
  let previo = null;
  try { previo = (await almacen.leerCampos(clave, [campo]))[campo] || null; }
  catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudo leer la gestión del ciclo.'); }

  const r = CICLOS.transicionarGestion(previo, String(body.accion || ''), { lecturas: body.lecturas, nota: body.nota },
    { ahora: ahoraD.toISOString(), por: 'admin', ciclo, auditoria });
  if (!r.ok) return error(r.motivo === 'PUBLICADO' ? 409 : 422, r.motivo, r.mensaje, { auditoria });
  r.doc.criterio = ciclo.meta.criterio || { tipo: ciclo.meta.tipo, numero: ciclo.meta.numero, n: ciclo.meta.n };
  r.doc.equipo = body.equipo;
  try { await almacen.escribirCampos(clave, { [campo]: r.doc }); }
  catch (e) { return error(503, 'KV_ESCRITURA', 'No se pudo guardar la gestión del ciclo.'); }
  return { status: 200, body: { ok: true, doc: Object.assign({ campo }, r.doc), auditoria } };
}

/* =====================================================================
   EL PAQUETE DE CICLOS · para el cliente ORO, sin la capa de laboratorio

     GET   /paquete?equipo=<nombre>    solo lo que el motor de ciclos necesita

   /api/v1/pbp exige la capa `pbp` del laboratorio y entrega TODO el análisis
   (quintetos, rotaciones, mapa del equipo, reloj…). La sección Ciclos es del
   plan ORO y no debe depender de esa capa ni abrirla: acá sale una PROYECCIÓN
   del paquete con lo que `SGADD_CICLOS` lee y nada más:
     equipo, etiqueta, ciclos, liga.ciclos, liga.zonas y, de cada partido,
     solo el id y los tiros del propio partido (el mapa del ciclo).
   Un cliente pide únicamente SU equipo (el de la categoría o, si no declara,
   el del club); el admin, cualquiera.
   ===================================================================== */
function proyectarPaquete(paq, completo) {
  const p = paq || {};
  const liga = p.liga || {};
  /* El ADMIN ve el informe completo (las 6 secciones: reloj, rendimiento, tablero de la competencia).
     Al cliente ORO le sigue llegando solo la proyección: la capa de laboratorio no se abre por esta ruta. */
  if (completo) {
    return Object.assign(proyectarPaquete(paq, false), {
      liga: liga, reloj: p.reloj || null, rendimiento: p.rendimiento || null, secciones: p.secciones || null,
      partidosPbp: p.partidosPbp || [],
      /* El informe de ciclo (SGADD_CICLOINFORME) también lee el detalle de tiros
         por jugador, el plantel, el cierre y el conteo de partidos. */
      tiros: p.tiros || null, jugadores: p.jugadores || [], clutch: p.clutch || null, partidos: p.partidos || null,
    });
  }
  return {
    equipo: p.equipo || null,
    etiqueta: p.etiqueta || null,
    ciclos: p.ciclos || null,
    liga: { ciclos: liga.ciclos || null, zonas: liga.zonas || [] },
    partidosPbp: (p.partidosPbp || []).filter(x => x && x.tiros).map(x => ({ id: x.id, tiros: { favor: x.tiros.favor || [], contra: x.tiros.contra || [] } })),
  };
}

function mismoEquipo(a, b) {
  const x = PBP.campoDeEquipo(a), y = PBP.campoDeEquipo(b);
  if (!x || !y) return false;
  return x === y || x.indexOf(y + ' ') === 0 || y.indexOf(x + ' ') === 0;
}

async function manejarPaquete(peticion, deps) {
  const ctx = await autorizar(peticion, deps, false);
  if (ctx.error) return ctx.error;
  const almacen = (deps && deps.kv) || kv;
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'El servidor no tiene dónde leer los ciclos.');
  const q = (peticion && peticion.query) || {};
  const campoEq = PBP.campoDeEquipo(q.equipo);
  if (!campoEq) return error(400, 'EQUIPO_INVALIDO', 'Falta el equipo.');
  /* El cuerpo técnico NO lee el paquete: con él armaría el ciclo en curso, que no se
     muestra hasta que se publica (2026-11-06). Lee /publicados y /foto. */
  if (!ctx.esAdmin) return error(403, 'SOLO_PUBLICADOS', 'El cuerpo técnico ve los ciclos publicados.');
  let paq;
  try { paq = await paqueteDe(ctx, almacen, campoEq); }
  catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudo leer el análisis del equipo.'); }
  if (!paq || !paq.ciclos) return error(404, 'SIN_DATOS', 'Todavía no hay ciclos de ese equipo.');
  return { status: 200, body: { ok: true, paquete: proyectarPaquete(paq, ctx.esAdmin) } };
}

/* =====================================================================
   PUBLICAR Y ENVIAR (Fase 6) · solo ADMIN

     POST  /publicar   { equipo, criterio, ensayo?, reintentar? }

   Compila el informe a PDF y lo manda, como adjunto, a cada mail del padrón de
   acceso del club. Solo se publica un ciclo AUDITADO, cerrado y apto, con el
   mismo dato que se auditó (si cambió, `CAMBIO`).

   - `ensayo: true` hace todo menos mandar y menos cambiar el estado: devuelve
     los destinatarios y el tamaño del PDF. Es el paso previo al botón.
   - IDEMPOTENCIA: el envío se reclama con HSETNX en `sgadd:ciclos-envio:<club>:<cat>`
     antes de mandar nada. Dos clics a la vez mandan UNA vez.
   - Si ningún mail salió, el reclamo se libera y el ciclo NO pasa a publicado.
     Si salieron algunos, queda publicado con los fallidos anotados y
     `reintentar: true` manda solo a esos.
   - Si el PDF no se puede compilar acá (Chromium en Vercel), 503 `PDF_*`: el
     plan B es `node server/bin/ciclos.js publicar`, que usa el Chrome local.
   ===================================================================== */
const PREFIJO_ENVIO = 'sgadd:ciclos-envio:';
const claveEnvio = (clubId, slug) => PREFIJO_ENVIO + clubId + ':' + slug;

async function manejarPublicar(peticion, deps) {
  const d = deps || {};
  const ctx = await autorizar(peticion, d, true);
  if (ctx.error) return ctx.error;
  const almacen = d.kv || kv;
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'El servidor no tiene dónde guardar la publicación.');
  const body = (peticion && peticion.body) || {};
  const campoEq = PBP.campoDeEquipo(body.equipo);
  if (!campoEq) return error(400, 'EQUIPO_INVALIDO', 'Falta el equipo.');

  let paq;
  try { paq = await paqueteDe(ctx, almacen, campoEq); }
  catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudo leer el análisis del equipo.'); }
  if (!paq) return error(404, 'SIN_DATOS', 'Todavía no hay análisis de play-by-play de ese equipo.');

  const ahoraD = d.ahora ? new Date(d.ahora) : new Date();
  const hoy = new Date(ahoraD.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const ciclo = CICLOS.armarVentana(paq, body.criterio, { hoy });
  if (!ciclo) return error(422, 'NO_EXISTE', 'Esa ventana no existe en el paquete del equipo.');
  const auditoria = CICLOS.auditar(ciclo, paq);
  const campo = campoEq + '|' + CICLOS.claveSello(ciclo.meta);
  const clave = claveGestion(ctx.clubId, ctx.slug);
  let previo = null;
  try { previo = (await almacen.leerCampos(clave, [campo]))[campo] || null; }
  catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudo leer la gestión del ciclo.'); }
  if (!previo) return error(409, 'SIN_GESTION', 'Primero hay que guardarlo y auditarlo.');

  const reintento = !!body.reintentar;
  let nuevoDoc = null;
  if (previo.estado === 'publicado') {
    const fall = (previo.envio && previo.envio.fallidos) || [];
    if (!reintento) return error(409, 'YA_PUBLICADO', 'Ese ciclo ya está publicado.', { envio: previo.envio || null });
    if (!fall.length) return error(409, 'SIN_PENDIENTES', 'No quedan envíos pendientes.', { envio: previo.envio || null });
  } else {
    if (reintento) return error(409, 'NO_PUBLICADO', 'Solo se reintenta un ciclo ya publicado.');
    const t = CICLOS.transicionarGestion(previo, 'publicar', {}, { ahora: ahoraD.toISOString(), por: 'admin', ciclo, auditoria });
    if (!t.ok) return error(422, t.motivo, t.mensaje, { auditoria });
    nuevoDoc = t.doc;
  }

  /* Los destinatarios: el padrón de acceso del club (sin repetir). */
  let padron;
  try { padron = d.padron || await CLIENTES.cargar(d.kvOpciones); }
  catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudo leer el padrón de accesos.'); }
  let destinos = CLIENTES.delClub(padron, ctx.clubId).map(x => ({ email: x.email, nombre: x.nombre }));
  if (reintento) {
    const pend = new Set(((previo.envio && previo.envio.fallidos) || []).map(f => f.email));
    destinos = destinos.filter(x => pend.has(x.email));
  }
  if (!destinos.length) return error(422, 'SIN_DESTINATARIOS', 'El club no tiene mails dados de alta en el padrón de acceso.');

  const lecturas = Object.assign({}, CICLOS.lecturasBase(ciclo), previo.lecturas || {});
  const informe = INFORME.construir(ciclo, { lecturas, equipo: ciclo.meta.equipo || body.equipo, huella: CICLOS.huella(ciclo) });
  let pdf;
  try { pdf = await (d.render || PDF.aPdf)(informe.html); }
  catch (e) {
    return error(503, (e && e.codigo) || 'PDF_FALLO', (e && e.message) || 'No se pudo compilar el PDF.', {
      alternativa: 'Publicalo desde tu máquina: node server/bin/ciclos.js publicar --club ' + ctx.clubId + ' --categoria ' + ctx.slug + ' --equipo "' + body.equipo + '"' });
  }
  if (body.ensayo) {
    return { status: 200, body: { ok: true, ensayo: true, destinatarios: destinos.map(x => x.email), pdfBytes: pdf.length, archivo: informe.archivo, titulo: informe.titulo } };
  }

  /* Mientras el club prueba el informe, nada sale a los entrenadores (2026-11-06). */
  if (!envioClientesHabilitado(d.env)) {
    return error(403, 'ENVIO_EN_PRUEBA', 'El envío a los entrenadores está apagado en el servidor (modo prueba). Se habilita con CICLOS_ENVIO_CLIENTES=si.');
  }
  /* Se reclama el envío ANTES de mandar. */
  const envioKey = claveEnvio(ctx.clubId, ctx.slug);
  if (!reintento) {
    let reclamado;
    try { reclamado = await almacen.comando(['HSETNX', envioKey, campo, JSON.stringify({ inicio: ahoraD.toISOString() })]); }
    catch (e) { return error(503, 'KV_ESCRITURA', 'No se pudo reservar el envío.'); }
    if (!Number(reclamado)) return error(409, 'EN_CURSO', 'Ese ciclo ya se está enviando o ya se envió.');
  }

  const transporte = d.transporte || ENVIO.transporteSmtp({ env: d.env });
  const estadoMail = ENVIO.estadoEnvio(d.env);
  if (!estadoMail.ok && !d.transporte) {
    if (!reintento) { try { await almacen.comando(['HDEL', envioKey, campo]); } catch (e) { /* queda el reclamo */ } }
    return error(503, estadoMail.codigo, estadoMail.mensaje);
  }
  const ok = [], fallidos = [];
  const etiquetaCiclo = ciclo.meta.tipo === 'ciclo' && ciclo.meta.numero !== null ? 'Ciclo ' + ciclo.meta.numero : 'Ventana libre';
  for (const x of destinos) {
    const mail = mailCiclo({ nombre: x.nombre, equipo: ciclo.meta.equipo || body.equipo, club: ctx.clubId, ciclo: etiquetaCiclo,
      desde: ciclo.meta.desde, hasta: ciclo.meta.hasta, record: ciclo.resultados.record.g + '-' + ciclo.resultados.record.p, numeros: numerosCiclo(ciclo),
      lectura: lecturaEditada(ciclo, lecturas) });
    try {
      await transporte.enviar({ para: x.email, asunto: mail.asunto, html: mail.html, texto: mail.texto,
        adjuntos: [{ nombre: informe.archivo, tipo: 'application/pdf', contenido: pdf }] });
      ok.push(x.email);
    } catch (e) { fallidos.push({ email: x.email, error: (e && e.codigo) || 'ENVIO', mensaje: (e && e.message) || '' }); }
  }
  if (!ok.length) {
    if (!reintento) { try { await almacen.comando(['HDEL', envioKey, campo]); } catch (e) { /* queda el reclamo */ } }
    return error(502, 'ENVIO', 'No salió ningún mail.', { fallidos });
  }

  const envio = { fecha: ahoraD.toISOString(), archivo: informe.archivo, a: (reintento ? ((previo.envio && previo.envio.a) || []) : []).concat(ok), fallidos };
  const doc = Object.assign({}, nuevoDoc || previo, { envio });
  if (!nuevoDoc) doc.actualizado = ahoraD.toISOString();
  doc.criterio = ciclo.meta.criterio || { tipo: ciclo.meta.tipo, numero: ciclo.meta.numero, n: ciclo.meta.n };
  doc.equipo = body.equipo;
  try { await almacen.escribirCampos(clave, { [campo]: doc }); }
  catch (e) { return error(503, 'KV_ESCRITURA', 'Los mails salieron pero no se pudo registrar la publicación.', { enviados: ok, fallidos }); }
  return { status: 200, body: { ok: true, doc: Object.assign({ campo }, doc), enviados: ok, fallidos } };
}

/* =====================================================================
   CERRAR UN CICLO (2026-11-06) · solo ADMIN · un paso, con opciones

     POST  /cerrar   { equipo, criterio, huella, foto, publicar, enviar }
       enviar: 'no' | 'prueba' | 'equipo'

   Lo que pidió el club: al sellar, elegir si se PUBLICA en la plataforma y si
   se MANDA por mail. Mientras el ciclo siguiente está en curso, el cuerpo
   técnico no lo ve: solo ve los publicados (ver `manejarPublicados`).

   - El servidor recalcula el ciclo; la `huella` que manda el navegador tiene
     que coincidir con la suya (si no, 409 CAMBIO: la foto describe otro dato).
   - 'prueba' sin publicar: manda el informe SOLO al mail del admin que lo
     pide, sin sellar ni publicar nada. Es el ensayo de punta a punta.
   - Publicar: sella (HSETNX, igual que /sellar; si ya estaba sellado con la
     misma huella sigue), guarda la foto y deja la gestión en 'publicado'.
     Un ciclo publicado no se vuelve a publicar; sí se puede volver a mandar.
   - 'equipo' manda al padrón del club SOLO si el servidor tiene
     CICLOS_ENVIO_CLIENTES=si. Hasta que el club lo pruebe, el envío a los
     entrenadores queda apagado en el servidor, no solo en la pantalla.
   ===================================================================== */
const PREFIJO_FOTO = 'sgadd:ciclos-foto:';
const claveFoto = (clubId, slug) => PREFIJO_FOTO + clubId + ':' + slug;
const envioClientesHabilitado = (env) => String(((env || process.env).CICLOS_ENVIO_CLIENTES) || '').toLowerCase() === 'si';

async function manejarCerrar(peticion, deps) {
  const d = deps || {};
  const ctx = await autorizar(peticion, d, true);
  if (ctx.error) return ctx.error;
  const almacen = d.kv || kv;
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'El servidor no tiene dónde guardar el ciclo.');
  const body = (peticion && peticion.body) || {};
  const campoEq = PBP.campoDeEquipo(body.equipo);
  if (!campoEq) return error(400, 'EQUIPO_INVALIDO', 'Falta el equipo.');
  const publicar = body.publicar === true;
  const enviar = ['no', 'prueba', 'equipo'].includes(body.enviar) ? body.enviar : 'no';
  if (!publicar && enviar === 'no') return error(400, 'SIN_ACCION', 'Elegí publicar, enviar o las dos.');
  if (enviar === 'equipo' && !envioClientesHabilitado(d.env)) {
    return error(403, 'ENVIO_EN_PRUEBA', 'El envío a los entrenadores está apagado en el servidor (modo prueba). Mandalo primero a tu mail; se habilita con CICLOS_ENVIO_CLIENTES=si.');
  }
  const v = verificarToken(tokenDeLaPeticion(peticion));
  const emailAdmin = v.ok && v.sesion ? v.sesion.email : null;

  let paq;
  try { paq = await paqueteDe(ctx, almacen, campoEq); }
  catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudo leer el análisis del equipo.'); }
  if (!paq) return error(404, 'SIN_DATOS', 'Todavía no hay análisis de play-by-play de ese equipo.');

  const ahoraD = d.ahora ? new Date(d.ahora) : new Date();
  const hoy = new Date(ahoraD.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const r = CICLOS.sellar(paq, body.criterio, { hoy, ahora: ahoraD });
  if (!r.ok) return error(422, r.motivo, r.mensaje, { auditoria: r.auditoria || null });
  const ciclo = r.registro.ciclo;
  if (body.huella !== r.registro.huella) return error(409, 'CAMBIO', 'El informe armado no coincide con el dato del servidor: recargá la página y volvé a intentar.', { huella: r.registro.huella });

  const campo = campoEq + '|' + r.clave;
  const claveG = claveGestion(ctx.clubId, ctx.slug), claveF = claveFoto(ctx.clubId, ctx.slug);
  let previo = null, fotoGuardada = null;
  try {
    previo = (await almacen.leerCampos(claveG, [campo]))[campo] || null;
    fotoGuardada = (await almacen.leerCampos(claveF, [campo]))[campo] || null;
  } catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudo leer la gestión del ciclo.'); }
  const yaPublicado = !!(previo && previo.estado === 'publicado');
  if (publicar && yaPublicado) return error(409, 'YA_PUBLICADO', 'Ese ciclo ya está publicado. Para volver a mandarlo, elegí solo el envío.');

  /* La foto: la que viene o, para reenviar uno ya publicado, la guardada. */
  let foto = null;
  if (body.foto) {
    const vf = FOTO.validar(body.foto);
    if (!vf.ok) return error(400, 'FOTO_INVALIDA', vf.motivo);
    foto = vf.foto;
  } else if (fotoGuardada) foto = FOTO.descomprimir(fotoGuardada.datos);
  if (!foto) return error(400, 'FOTO_INVALIDA', 'Falta el informe armado.');

  const meta = { equipo: ciclo.meta.equipo || body.equipo, numero: ciclo.meta.numero, n: ciclo.meta.n, desde: ciclo.meta.desde, hasta: ciclo.meta.hasta,
    record: ciclo.resultados.record.g + '-' + ciclo.resultados.record.p, tipo: ciclo.meta.tipo };
  const out = { ok: true, prueba: enviar === 'prueba' && !publicar, sellado: false, publicado: yaPublicado, envio: null };

  /* 1 · Sellar y publicar. */
  if (publicar) {
    let escrito;
    try { escrito = await almacen.comando(['HSETNX', claveKV(ctx.clubId, ctx.slug), campo, JSON.stringify(r.registro)]); }
    catch (e) { return error(503, 'KV_ESCRITURA', 'No se pudo guardar el sello.'); }
    if (!Number(escrito)) {
      const s0 = (await almacen.leerCampos(claveKV(ctx.clubId, ctx.slug), [campo]))[campo] || null;
      if (!s0 || s0.huella !== r.registro.huella) return error(409, 'YA_SELLADO', 'Ese ciclo ya está sellado con otro dato: no se reemplaza.', { sellado: s0 ? { huella: s0.huella, fecha: s0.sellado } : null });
    }
    out.sellado = true;
    const doc = Object.assign({ estado: 'borrador', lecturas: {}, historial: [] }, previo || {}, {
      estado: 'publicado', huella: r.registro.huella, publicado: ahoraD.toISOString(), actualizado: ahoraD.toISOString(),
      criterio: ciclo.meta.criterio || { tipo: ciclo.meta.tipo, numero: ciclo.meta.numero, n: ciclo.meta.n }, equipo: body.equipo, meta,
    });
    doc.historial = ((previo && previo.historial) || []).concat([{ estado: 'publicado', accion: 'cerrar', en: ahoraD.toISOString(), por: emailAdmin, nota: '' }]);
    try {
      await almacen.escribirCampos(claveF, { [campo]: { datos: FOTO.comprimir(foto), huella: r.registro.huella, guardado: ahoraD.toISOString() } });
      await almacen.escribirCampos(claveG, { [campo]: doc });
    } catch (e) { return error(503, 'KV_ESCRITURA', 'Se selló pero no se pudo publicar: volvé a intentar.'); }
    out.publicado = true; previo = doc;
  }

  /* 2 · El mail. */
  if (enviar !== 'no') {
    let destinos;
    if (enviar === 'prueba') {
      if (!emailAdmin) return error(400, 'SIN_MAIL', 'Tu sesión no tiene mail: no hay a dónde mandar la prueba.', out);
      destinos = [{ email: emailAdmin, nombre: null }];
    } else {
      let padron;
      try { padron = d.padron || await CLIENTES.cargar(d.kvOpciones); }
      catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudo leer el padrón de accesos.', out); }
      destinos = CLIENTES.delClub(padron, ctx.clubId).map(x => ({ email: x.email, nombre: x.nombre }));
      if (!destinos.length) return error(422, 'SIN_DESTINATARIOS', 'El club no tiene mails dados de alta en el padrón de acceso.', out);
    }
    let pdf;
    try { pdf = await (d.render || PDF.aPdf)(FOTO.documento(foto, meta)); }
    catch (e) { return error(503, (e && e.codigo) || 'PDF_FALLO', (e && e.message) || 'No se pudo compilar el PDF.', out); }
    const transporte = d.transporte || ENVIO.transporteSmtp({ env: d.env });
    const estadoMail = ENVIO.estadoEnvio(d.env);
    if (!estadoMail.ok && !d.transporte) return error(503, estadoMail.codigo, estadoMail.mensaje, out);
    const lecturas = Object.assign({}, CICLOS.lecturasBase(ciclo), (previo && previo.lecturas) || {});
    const etiqueta = ciclo.meta.tipo === 'ciclo' && ciclo.meta.numero !== null ? 'Ciclo ' + ciclo.meta.numero : 'Ventana libre';
    const archivo = ('Ciclo ' + (ciclo.meta.numero !== null ? ciclo.meta.numero : '') + ' ' + meta.equipo).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
    const ok = [], fallidos = [];
    for (const x of destinos) {
      const mail = mailCiclo({ nombre: x.nombre, equipo: meta.equipo, club: ctx.clubId, ciclo: etiqueta, desde: meta.desde, hasta: meta.hasta, record: meta.record, numeros: numerosCiclo(ciclo),
        lectura: lecturaEditada(ciclo, lecturas), panel: FOTO.BASE_PANEL + '?club=' + encodeURIComponent(ctx.clubId) });
      const asunto = (enviar === 'prueba' ? '[PRUEBA] ' : '') + mail.asunto;
      try {
        await transporte.enviar({ para: x.email, asunto, html: mail.html, texto: mail.texto, adjuntos: [{ nombre: archivo, tipo: 'application/pdf', contenido: pdf }] });
        ok.push(x.email);
      } catch (e) { fallidos.push({ email: x.email, error: (e && e.codigo) || 'ENVIO', mensaje: (e && e.message) || '' }); }
    }
    out.envio = { modo: enviar, a: ok, fallidos, pdfBytes: pdf.length, archivo };
    if (!ok.length) return error(502, 'ENVIO', 'No salió ningún mail.', out);
    if (enviar === 'equipo' && previo) {
      const doc = Object.assign({}, previo, { envio: { fecha: ahoraD.toISOString(), archivo, a: ((previo.envio && previo.envio.a) || []).concat(ok), fallidos } });
      try { await almacen.escribirCampos(claveG, { [campo]: doc }); } catch (e) { /* los mails salieron: el registro queda para la próxima */ }
    }
  }
  return { status: 200, body: out };
}

/* =====================================================================
   LO QUE VE EL CUERPO TÉCNICO · solo los ciclos PUBLICADOS

     GET  /publicados?equipo=       la lista (meta, sin el informe)
     GET  /foto?equipo=&clave=      el informe de un ciclo publicado

   El cliente (plan ORO) ve un ciclo recién cuando el admin lo publica: el
   que está en curso no existe para él. Un cliente pide solo SU equipo.
   ===================================================================== */
async function contextoLectura(peticion, deps) {
  const ctx = await autorizar(peticion, deps, false);
  if (ctx.error) return ctx;
  const almacen = (deps && deps.kv) || kv;
  if (!almacen.configurado()) return { error: error(503, 'SIN_KV', 'El servidor no tiene dónde leer los ciclos.') };
  const q = (peticion && peticion.query) || {};
  const campoEq = PBP.campoDeEquipo(q.equipo);
  if (!campoEq) return { error: error(400, 'EQUIPO_INVALIDO', 'Falta el equipo.') };
  if (!ctx.esAdmin) {
    const propio = AUTH.equipoDeCategoria(ctx.catalogo[ctx.clubId], ctx.slug).equipo;
    if (!propio) return { error: error(403, 'SIN_EQUIPO', 'La categoría no tiene un equipo propio declarado.') };
    if (!mismoEquipo(q.equipo, propio)) return { error: error(403, 'OTRO_EQUIPO', 'Los ciclos son del equipo del club.') };
  }
  return Object.assign(ctx, { almacen, campoEq, q });
}

async function manejarPublicados(peticion, deps) {
  const ctx = await contextoLectura(peticion, deps);
  if (ctx.error) return ctx.error;
  let hash;
  try { hash = await ctx.almacen.leerHash(claveGestion(ctx.clubId, ctx.slug)); }
  catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudieron leer los ciclos publicados.'); }
  const publicados = Object.keys(hash).filter(k => k.split('|')[0] === ctx.campoEq && hash[k] && hash[k].estado === 'publicado')
    .map(k => ({ clave: k.split('|').slice(1).join('|'), publicado: hash[k].publicado || null, meta: hash[k].meta || null, criterio: hash[k].criterio || null }))
    .sort((a, b) => String((a.meta && a.meta.desde) || '').localeCompare(String((b.meta && b.meta.desde) || '')));
  const body = { ok: true, publicados };
  if (ctx.esAdmin) body.envioClientes = envioClientesHabilitado(deps && deps.env);
  return { status: 200, body };
}

async function manejarFoto(peticion, deps) {
  const ctx = await contextoLectura(peticion, deps);
  if (ctx.error) return ctx.error;
  const clave = String(ctx.q.clave || '');
  if (!/^[a-z0-9_.:-]{1,80}$/i.test(clave)) return error(400, 'CLAVE_INVALIDA', 'Falta el ciclo.');
  const campo = ctx.campoEq + '|' + clave;
  let doc, f;
  try {
    doc = (await ctx.almacen.leerCampos(claveGestion(ctx.clubId, ctx.slug), [campo]))[campo] || null;
    f = (await ctx.almacen.leerCampos(claveFoto(ctx.clubId, ctx.slug), [campo]))[campo] || null;
  } catch (e) { return error(503, 'KV_ILEGIBLE', 'No se pudo leer el informe.'); }
  if (!doc || doc.estado !== 'publicado' || !f) return error(404, 'NO_PUBLICADO', 'Ese ciclo no está publicado.');
  const foto = FOTO.descomprimir(f.datos);
  if (!foto) return error(500, 'FOTO_ROTA', 'El informe guardado no se pudo leer.');
  return { status: 200, body: { ok: true, foto, meta: doc.meta || null, publicado: doc.publicado || null } };
}

module.exports = { manejarCiclos, manejarSellar, manejarGestion, manejarGestionGuardar, manejarPublicar, manejarPaquete, manejarCerrar, manejarPublicados, manejarFoto,
  proyectarPaquete, envioClientesHabilitado, claveKV, claveGestion, claveEnvio, claveFoto, PREFIJO, PREFIJO_GESTION, PREFIJO_ENVIO, PREFIJO_FOTO };

