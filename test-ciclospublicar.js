/* =====================================================================
   Publicar y enviar el ciclo (Ciclos, fase 6): el mail con adjunto PDF, el
   informe en HTML, el mail del ciclo y el handler /publicar contra un KV de
   mentira, con un transporte de memoria y un render inyectado.
   ===================================================================== */
'use strict';
require('./server/lib/env.js').cargar();

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

const CI = require('./js/sgadd-ciclos.js');
global.SGADD_CICLOS = CI;
const z14 = (f) => Array.from({ length: 14 }, (_, i) => f(i));
const partido = (i, fecha) => ({
  id: 'p' + i, fecha, rival: 'R' + i, condicion: i % 2 ? 'LOCAL' : 'VISITANTE', final: [80 + i, 70],
  parciales: [[20, 18], [20, 17], [20, 17], [20 + i, 18]],
  trans: { propio: {}, rival: { RD: [2, 1, 2 + i, 0] } },
  cuartos: { favor: [[5, 2, 5, 5], [5, 2, 5, 5], [5, 2, 5, 5], [5, 2, 5, 5]], contra: [[5, 2, 5, 5], [5, 2, 5, 5], [5, 2, 5, 5], [5, 2, 5, 5]] },
  zonas: { favor: z14(k => (k < 4 ? [5, 2] : [0, 0])), contra: z14(k => (k === 12 ? [4, 3] : [1, 1])) },
  causas: { perd: { PEREZ: [1, 2] }, fall: { '2P': [1, 2], '3P': [0, 0] }, nRD: 1, nROBO: 0 },
});
const paquete = (n) => ({
  equipo: 'JUJUY', etiqueta: 'LAB',
  ciclos: { version: 1, partidos: Array.from({ length: n }, (_, i) => partido(i, '2026-10-' + String(10 + i).padStart(2, '0'))) },
  liga: { ciclos: { lados: 10, trans: { RD: [10, 5, 10, 0] } }, zonas: CI.ZONAS.map(zn => ({ zona: zn, ppt: 1 })) },
  partidosPbp: [],
});

titulo('1 · el mensaje MIME con adjunto');
const ENVIO = require('./server/lib/mail-envio.js');
{
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 7) % 256))]);
  const base = { para: 'dt@jujuy.com', asunto: 'Informe', texto: 'hola', html: '<p>hola</p>' };
  const sin = ENVIO.construirMensaje(base, { limite: 'x', id: 'i', fecha: new Date(0) });
  check('sin adjuntos sigue siendo multipart/alternative', /Content-Type: multipart\/alternative/.test(sin) && !/multipart\/mixed/.test(sin) && !/application\/pdf/.test(sin));
  const con = ENVIO.construirMensaje(Object.assign({}, base, { adjuntos: [{ nombre: 'Ciclo 0 - JUJUY.pdf', tipo: 'application/pdf', contenido: pdf }] }), { limite: 'x', id: 'i', fecha: new Date(0) });
  check('con adjunto es multipart/mixed con la alternativa adentro', /Content-Type: multipart\/mixed; boundary="ms_mx_x"/.test(con) && /Content-Type: multipart\/alternative; boundary="ms_x"/.test(con));
  check('el PDF va como parte application/pdf, en base64 y como attachment', /Content-Type: application\/pdf; name="Ciclo 0 - JUJUY.pdf"/.test(con) && /Content-Disposition: attachment; filename="Ciclo 0 - JUJUY.pdf"/.test(con));
  const parte = con.split('Content-Disposition: attachment')[1].split('\r\n\r\n')[1].split('--ms_mx_x--')[0];
  check('el adjunto vuelve a ser el mismo archivo', Buffer.from(parte.replace(/\s+/g, ''), 'base64').equals(pdf));
  check('termina cerrando los dos límites', con.trim().endsWith('--ms_mx_x--') && con.indexOf('--ms_x--') !== -1);
  const raro = ENVIO.construirMensaje(Object.assign({}, base, { adjuntos: [{ nombre: 'a"\r\nBcc: x@y.com.pdf', tipo: 'application/pdf', contenido: pdf }] }), { limite: 'x' });
  check('un nombre de archivo con saltos de línea no inyecta encabezados', !/\r\nBcc:/.test(raro));
  check('las líneas del adjunto miden a lo sumo 76', con.split('\r\n').every(l => l.length <= 120));
}

titulo('2 · el informe y el mail');
const INF = require('./server/lib/ciclos-informe.js');
const { mailCiclo } = require('./server/lib/mail-ciclo.js');
{
  const p = paquete(6);
  const c = CI.armarVentana(p, { tipo: 'ciclo', numero: 0, n: 4 });
  const inf = INF.construir(c, { lecturas: Object.assign({}, CI.lecturasBase(c), { cierre: 'Cerrar la {{Z13}} <script>alert(1)</script>' }), equipo: 'JUJUY <b>', huella: CI.huella(c) });
  check('es un documento completo y autónomo', /^<!doctype html>/i.test(inf.html) && !/<link |<script src|https?:\/\//i.test(inf.html.replace(/xmlns="[^"]*"/g, '')));
  check('trae los cuatro partidos, el cuarto a cuarto y los dos mapas', (inf.html.match(/>R\d</g) || []).length === 4 && /Cuarto a cuarto/.test(inf.html) && (inf.html.match(/<svg class="cancha-svg"/g) || []).length === 2);
  check('lo escrito por el analista se escapa', !/<script>alert/.test(inf.html) && /&lt;script&gt;/.test(inf.html) && !/<b>/.test(inf.html.split('<h1>')[1].split('</h1>')[0]));
  check('la zona citada sale como etiqueta, no como botón', /<span class="zona-ref">Z13<\/span>/.test(inf.html) && !/<button/.test(inf.html));
  check('lleva la huella y el nombre del archivo es seguro', /Huella [0-9a-f]{8}/.test(inf.html) && !/[\\/:*?"<>|]/.test(inf.archivo) && /\.pdf$/.test(inf.archivo));
  {
    const MC = require('./server/lib/mail-ciclo.js');
    const nums = MC.numerosCiclo({ meta: { partidos: 4 }, resultados: { record: { g: 0, p: 4 }, puntos: { favorPP: 78.3, contraPP: 89.5, dif: -45 } } });
    const mb = mailCiclo({ equipo: 'JUJUY', club: 'jujuy', ciclo: 'Ciclo 0', desde: '2026-10-18', hasta: '2026-11-02', record: '0-4', numeros: nums });
    check('el mail pone los números en fichas: récord, diferencia, a favor y en contra', /Récord[\s\S]*0-4[\s\S]*Diferencia[\s\S]*-45[\s\S]*Puntos a favor[\s\S]*78,3[\s\S]*Puntos en contra[\s\S]*89,5/.test(mb.html));
    check('las fichas llevan glifo además del color y la diferencia por partido', /▼ en 4 partidos/.test(mb.html) && /-11,2 por partido/.test(mb.html));
    check('las fechas del mail van en DD/MM/AAAA', /18\/10\/2026 al 02\/11\/2026/.test(mb.asunto) && /del 18\/10\/2026 al 02\/11\/2026/.test(mb.html) && !/2026-10-18/.test(mb.html));
    check('sin resumen editado no repite el párrafo', !/border-left:4px solid #f7941e/.test(mb.html));
    check('el texto plano dice los mismos números', /Récord 0-4 en 4 partidos · Diferencia -45 · 78,3 a favor y 89,5 en contra/.test(mb.texto));
  }
  const m = mailCiclo({ nombre: 'Ana <x>', equipo: 'JUJUY', club: 'jujuy', ciclo: 'Ciclo 0', desde: '10/10', hasta: '13/10', record: '4-0', lectura: 'Resumen <b>' });
  check('el mail dice equipo, ciclo y fechas en el asunto', /Ciclo 0/.test(m.asunto) && /JUJUY/.test(m.asunto));
  check('el mail escapa nombre y resumen', !/<b>Resumen|Ana <x>/.test(m.html) && /Ana &lt;x&gt;/.test(m.html));
  check('el texto plano no trae etiquetas', !/<table|<td/.test(m.texto) && /adjunto/.test(m.texto));
}

titulo('3 · /publicar contra un KV de mentira');
const kv = require('./server/lib/kv.js');
const store = {}, hashes = {}, ops = [];
kv.configurado = () => true;
kv.leer = async (k) => ({ valor: store[k] !== undefined ? JSON.parse(store[k]) : null, error: null });
kv.escribir = async (k, v) => { ops.push('SET'); store[k] = JSON.stringify(v); };
kv.leerHash = async (k) => { const o = {}; Object.keys(hashes[k] || {}).forEach(c => { o[c] = JSON.parse(hashes[k][c]); }); return o; };
kv.leerCampos = async (k, campos) => { const o = {}; campos.forEach(c => { if ((hashes[k] || {})[c] !== undefined) o[c] = JSON.parse(hashes[k][c]); }); return o; };
kv.escribirCampos = async (k, mapa) => { ops.push('HSET'); hashes[k] = hashes[k] || {}; Object.keys(mapa).forEach(c => { hashes[k][c] = JSON.stringify(mapa[c]); }); };
kv.comando = async (p) => {
  const [cmd, k, c, v] = p;
  if (cmd === 'HSETNX') { ops.push('HSETNX'); hashes[k] = hashes[k] || {}; if (hashes[k][c] !== undefined) return 0; hashes[k][c] = v; return 1; }
  if (cmd === 'HDEL') { ops.push('HDEL'); if (hashes[k]) delete hashes[k][c]; return 1; }
  throw new Error('comando no esperado ' + cmd);
};

const auth = require('./server/lib/auth.js');
const catalogo = require('./server/lib/catalogo.js');
const CIC = require('./server/rutas/ciclos.js');
const PBP = require('./server/rutas/pbp.js');
const CAT = { jujuy: { nombre: 'Jujuy', liga: 'liga-argentina', equipoPropio: 'JUJUY', estado: 'activo', plan: 'ORO', categorias: { 'jujuy-norte': { label: 'Norte', sheetId: 'Y' } } } };
store[catalogo.CLAVE_KV] = JSON.stringify(CAT); catalogo.limpiarCache();
hashes[PBP.claveKV('jujuy', 'jujuy-norte')] = { [PBP.campoDeEquipo('JUJUY')]: JSON.stringify(paquete(6)) };
const tok = (d) => auth.firmarToken(d, { expiraEn: '1h' });
const tokAdmin = tok({ email: 'freytesgn@gmail.com' });
const tokJujuy = tok({ email: 'dt@jujuy.com', club: 'jujuy', equipoAsignado: 'JUJUY', plan: 'ORO' });
const ped = (t, body) => ({ headers: t ? { authorization: 'Bearer ' + t } : {}, params: { clubId: 'jujuy', categoria: 'jujuy-norte' }, body: body || {}, query: {} });
const crit0 = { tipo: 'ciclo', numero: 0, n: 4 };
const PDF_FALSO = Buffer.from('%PDF-1.4 ' + 'x'.repeat(2000));
const render = async () => PDF_FALSO;
const padron = {
  'ana@jujuy.com': { club: 'jujuy', nombre: 'Ana', altaEl: '2026-10-01' },
  'beto@jujuy.com': { club: 'jujuy', nombre: 'Beto', altaEl: '2026-10-02' },
  'otro@otro.com': { club: 'otroclub', altaEl: '2026-10-01' },
};
const G = (body) => CIC.manejarGestionGuardar(ped(tokAdmin, body));
const P = (t, body, deps) => CIC.manejarPublicar(ped(t, body), Object.assign({ render, padron, transporte: ENVIO.transporteMemoria(), env: { CICLOS_ENVIO_CLIENTES: 'si' } }, deps || {}));
const estadoDoc = () => Object.values(hashes[CIC.claveGestion('jujuy', 'jujuy-norte')] || {}).map(x => JSON.parse(x))[0];

(async () => {
  let r = await P(tokJujuy, { equipo: 'JUJUY', criterio: crit0 });
  check('un cliente ORO NO publica', r.status === 403 && r.body.codigo === 'SOLO_ADMIN');
  r = await P(null, { equipo: 'JUJUY' });
  check('sin token, 401', r.status === 401);
  r = await P(tokAdmin, { equipo: 'JUJUY', criterio: crit0 });
  check('sin gestión previa, 409 SIN_GESTION', r.status === 409 && r.body.codigo === 'SIN_GESTION');
  await G({ equipo: 'JUJUY', criterio: crit0, accion: 'guardar', lecturas: { cierre: 'Para el staff' } });
  r = await P(tokAdmin, { equipo: 'JUJUY', criterio: crit0 });
  check('un borrador no se publica (hay que auditarlo)', r.status === 422 && r.body.codigo === 'ESTADO');
  await G({ equipo: 'JUJUY', criterio: crit0, accion: 'auditar' });

  const t0 = ENVIO.transporteMemoria();
  r = await P(tokAdmin, { equipo: 'JUJUY', criterio: crit0, ensayo: true }, { transporte: t0 });
  check('el ensayo lista los destinatarios del padrón del club (solo los de su club)', r.status === 200 && r.body.ensayo && r.body.destinatarios.join() === 'ana@jujuy.com,beto@jujuy.com', JSON.stringify(r.body));
  check('el ensayo no manda, no reclama y no cambia el estado', t0.enviados.length === 0 && !ops.includes('HSETNX') && estadoDoc().estado === 'auditado');
  check('el ensayo dice el tamaño y el nombre del PDF', r.body.pdfBytes === PDF_FALSO.length && /^Ciclo 0 - JUJUY\.pdf$/.test(r.body.archivo));

  r = await P(tokAdmin, { equipo: 'JUJUY', criterio: crit0 }, { env: {} });
  check('sin CICLOS_ENVIO_CLIENTES=si, /publicar tampoco manda a los entrenadores', r.status === 403 && r.body.codigo === 'ENVIO_EN_PRUEBA' && estadoDoc().estado === 'auditado');
  r = await P(tokAdmin, { equipo: 'JUJUY', criterio: crit0 }, { padron: { 'otro@otro.com': padron['otro@otro.com'] } });
  check('sin mails en el padrón del club no se publica', r.status === 422 && r.body.codigo === 'SIN_DESTINATARIOS' && estadoDoc().estado === 'auditado');

  r = await P(tokAdmin, { equipo: 'JUJUY', criterio: crit0 }, { render: async () => { throw Object.assign(new Error('sin chromium'), { codigo: 'PDF_SIN_CHROMIUM' }); } });
  check('si el PDF no compila: 503 con el plan B, y NO se publica ni se reclama', r.status === 503 && r.body.codigo === 'PDF_SIN_CHROMIUM' && /server\/bin\/ciclos\.js publicar/.test(r.body.alternativa) && estadoDoc().estado === 'auditado' && !ops.includes('HSETNX'));

  const caido = { nombre: 'caido', async enviar() { throw Object.assign(new Error('Gmail no contestó'), { codigo: 'SMTP_TIMEOUT' }); } };
  r = await P(tokAdmin, { equipo: 'JUJUY', criterio: crit0 }, { transporte: caido });
  check('si no sale ningún mail: 502, el reclamo se libera y sigue auditado', r.status === 502 && r.body.codigo === 'ENVIO' && r.body.fallidos.length === 2 && estadoDoc().estado === 'auditado' && ops.includes('HDEL'));

  const parcial = ENVIO.transporteMemoria();
  const raro = { nombre: 'parcial', async enviar(m) { if (m.para === 'beto@jujuy.com') throw Object.assign(new Error('rebotó'), { codigo: 'SMTP_550' }); return parcial.enviar(m); } };
  r = await P(tokAdmin, { equipo: 'JUJUY', criterio: crit0 }, { transporte: raro });
  const d1 = estadoDoc();
  check('si salen algunos: queda publicado, con los fallidos anotados', r.status === 200 && d1.estado === 'publicado' && d1.envio.a.join() === 'ana@jujuy.com' && d1.envio.fallidos.length === 1 && d1.envio.fallidos[0].email === 'beto@jujuy.com');
  const m1 = parcial.enviados[0];
  check('el mail lleva el PDF adjunto y el asunto del ciclo', m1.adjuntos.length === 1 && m1.adjuntos[0].tipo === 'application/pdf' && m1.adjuntos[0].contenido.equals(PDF_FALSO) && /Ciclo 0/.test(m1.asunto));
  check('cada mail va a UN destinatario (nadie ve a los demás)', parcial.enviados.every(m => m.para.indexOf(',') === -1));
  check('quedó la huella publicada', /^[0-9a-f]{8}$/.test(d1.huella) && !!d1.publicado);

  r = await P(tokAdmin, { equipo: 'JUJUY', criterio: crit0 });
  check('publicar de nuevo no manda otra vez: 409 YA_PUBLICADO', r.status === 409 && r.body.codigo === 'YA_PUBLICADO');
  const t2 = ENVIO.transporteMemoria();
  r = await P(tokAdmin, { equipo: 'JUJUY', criterio: crit0, reintentar: true }, { transporte: t2 });
  const d2 = estadoDoc();
  check('reintentar manda SOLO a los que fallaron', r.status === 200 && t2.enviados.length === 1 && t2.enviados[0].para === 'beto@jujuy.com');
  check('y deja el registro completo, sin fallidos', d2.envio.a.join() === 'ana@jujuy.com,beto@jujuy.com' && d2.envio.fallidos.length === 0);
  r = await P(tokAdmin, { equipo: 'JUJUY', criterio: crit0, reintentar: true });
  check('sin pendientes no hay nada que reintentar', r.status === 409 && r.body.codigo === 'SIN_PENDIENTES');
  r = await G({ equipo: 'JUJUY', criterio: crit0, accion: 'guardar', lecturas: { resumen: 'x' } });
  check('un publicado sigue sin editarse', r.status === 409 && r.body.codigo === 'PUBLICADO');

  titulo('4 · la idempotencia con dos clics a la vez');
  const crit1 = { tipo: 'calendario', desde: '2026-10-10', hasta: '2026-10-13' };
  await G({ equipo: 'JUJUY', criterio: crit1, accion: 'guardar' });
  await G({ equipo: 'JUJUY', criterio: crit1, accion: 'auditar' });
  const tA = ENVIO.transporteMemoria();
  const lento = { nombre: 'lento', async enviar(m) { await new Promise(res => setTimeout(res, 15)); return tA.enviar(m); } };
  const [a, b] = await Promise.all([
    P(tokAdmin, { equipo: 'JUJUY', criterio: crit1 }, { transporte: lento }),
    P(tokAdmin, { equipo: 'JUJUY', criterio: crit1 }, { transporte: lento }),
  ]);
  const estados = [a.status, b.status].sort();
  check('de dos publicaciones simultáneas sale UNA', estados.join() === '200,409' && tA.enviados.length === 2, estados.join() + ' · mails ' + tA.enviados.length);
  check('la perdedora dice que ya se está enviando', [a, b].some(x => x.body.codigo === 'EN_CURSO'));

  titulo('4 bis · el paquete de ciclos para el cliente ORO (sin la capa de laboratorio)');
  {
    /* El paquete de laboratorio trae de todo; el de ciclos, solo lo del motor. */
    const gordo = paquete(6);
    gordo.quintetos = [{ secreto: 'quinteto' }]; gordo.rotaciones = { x: 1 }; gordo.reloj = { y: 1 }; gordo.secciones = { z: 1 };
    gordo.liga.mapa = { hex: [1] }; gordo.liga.quintetosLiga = [1];
    gordo.partidosPbp = [{ id: 'p0', tiros: { favor: [[1, 2, 1, 3]], contra: [] }, quintetos: [{ s: 1 }], momentum: [1], tramos: [1] }];
    hashes[PBP.claveKV('jujuy', 'jujuy-norte')][PBP.campoDeEquipo('JUJUY')] = JSON.stringify(gordo);
    const Q = (t, eq) => CIC.manejarPaquete({ headers: t ? { authorization: 'Bearer ' + t } : {}, params: { clubId: 'jujuy', categoria: 'jujuy-norte' }, body: {}, query: { equipo: eq } });
    let r2 = await Q(tokJujuy, 'JUJUY');
    check('el cuerpo técnico NO recibe el paquete: con él armaría el ciclo en curso (2026-11-06)', r2.status === 403 && r2.body.codigo === 'SOLO_PUBLICADOS');
    const proy = CIC.proyectarPaquete(gordo, false);
    const js = JSON.stringify(proy);
    check('la proyección no trae quintetos, rotación, reloj, secciones ni mapa del equipo', !/quinteto|rotaciones|reloj|secciones|hex|momentum|tramos|secreto/.test(js), js.slice(0, 160));
    check('la proyección arma el mismo ciclo que el paquete completo', CI.huella(CI.armarVentana(proy, crit0)) === CI.huella(CI.armarVentana(gordo, crit0)));
    r2 = await Q(tokAdmin, 'JUJUY');
    check('el admin lo pide igual', r2.status === 200);
    r2 = await Q(tok({ email: 'x@otro.com', club: 'otroclub', equipoAsignado: 'JUJUY', plan: 'ORO' }), 'JUJUY');
    check('un cliente de otro club, 403', r2.status === 403 && r2.body.codigo === 'OTRO_CLUB');
    r2 = await Q(null, 'JUJUY');
    check('sin token, 401', r2.status === 401);
    const orig = CAT.jujuy.plan; CAT.jujuy.plan = 'PLATA'; store[catalogo.CLAVE_KV] = JSON.stringify(CAT); catalogo.limpiarCache();
    r2 = await Q(tokJujuy, 'JUJUY');
    check('un cliente PLATA tampoco (los ciclos son del plan ORO)', r2.status === 403 && r2.body.codigo === 'REQUIERE_PLAN');
    CAT.jujuy.plan = orig; store[catalogo.CLAVE_KV] = JSON.stringify(CAT); catalogo.limpiarCache();
    r2 = await Q(tokAdmin, 'NO EXISTE');
    check('un equipo sin ciclos da 404', r2.status === 404);
  }


  titulo('6 · cerrar un ciclo: sellar, publicar y mandar (2026-11-06)');
  {
    const FOTO = require('./server/lib/ciclos-foto.js');
    CAT.jujuy.categorias['jujuy-sur'] = { label: 'Sur', sheetId: 'Z' };
    store[catalogo.CLAVE_KV] = JSON.stringify(CAT); catalogo.limpiarCache();
    const paqSur = paquete(6);
    hashes[PBP.claveKV('jujuy', 'jujuy-sur')] = { [PBP.campoDeEquipo('JUJUY')]: JSON.stringify(paqSur) };
    const huella0 = CI.huella(CI.armarVentana(paqSur, crit0));
    const foto = { titulo: 'Ciclo 0 · JUJUY', estilo: '.ci{color:red}', secciones: { principal: '<div class="ci"><details><summary>x</summary>P</div>', equipos: '<div class="ci">E</div>' } };
    const pedS = (t, body, query) => ({ headers: t ? { authorization: 'Bearer ' + t } : {}, params: { clubId: 'jujuy', categoria: 'jujuy-sur' }, body: body || {}, query: query || {} });
    let html = '';
    const rend = async (h) => { html = h; return PDF_FALSO; };
    const C = (t, body, deps) => CIC.manejarCerrar(pedS(t, body), Object.assign({ render: rend, padron, env: {} }, deps || {}));
    const L = (t) => CIC.manejarPublicados(pedS(t, null, { equipo: 'JUJUY' }), { env: {} });
    const F = (t, clave) => CIC.manejarFoto(pedS(t, null, { equipo: 'JUJUY', clave }));
    const base = { equipo: 'JUJUY', criterio: crit0, huella: huella0, foto };

    let r = await C(tokJujuy, Object.assign({}, base, { publicar: true }));
    check('cerrar es solo del admin', r.status === 403 && r.body.codigo === 'SOLO_ADMIN');
    r = await C(tokAdmin, Object.assign({}, base, { publicar: false, enviar: 'no' }));
    check('sin publicar ni enviar no hace nada', r.status === 400 && r.body.codigo === 'SIN_ACCION');
    r = await C(tokAdmin, Object.assign({}, base, { huella: 'deadbeef', publicar: true }));
    check('una foto de otro dato (huella distinta) se rechaza', r.status === 409 && r.body.codigo === 'CAMBIO');
    r = await C(tokAdmin, Object.assign({}, base, { enviar: 'equipo' }));
    check('mandar a los entrenadores está apagado en el servidor', r.status === 403 && r.body.codigo === 'ENVIO_EN_PRUEBA');

    const tP = ENVIO.transporteMemoria();
    r = await C(tokAdmin, Object.assign({}, base, { publicar: false, enviar: 'prueba' }), { transporte: tP });
    check('la prueba manda SOLO al mail del admin', r.status === 200 && tP.enviados.length === 1 && tP.enviados[0].para === 'freytesgn@gmail.com' && /^\[PRUEBA\]/.test(tP.enviados[0].asunto));
    check('la prueba no sella ni publica', !r.body.sellado && !r.body.publicado && !(hashes[CIC.claveKV('jujuy', 'jujuy-sur')] || {})[PBP.campoDeEquipo('JUJUY') + '|c0n4']);
    check('el PDF sale de la foto: las secciones, el estilo y los detalles abiertos', /<h2 class="foto-h2">Principal<\/h2>/.test(html) && /\.ci\{color:red\}/.test(html) && /<details open>/.test(html) && /<base href="https:\/\/coachgn\.github\.io\/estadisticas\/">/.test(html));
    r = await L(tokJujuy);
    check('el cuerpo técnico no ve nada antes de publicar', r.status === 200 && r.body.publicados.length === 0 && r.body.envioClientes === undefined);

    const tQ = ENVIO.transporteMemoria();
    const metasN = { version: 1, ciclo: { numero: 99 }, resultado: { g: 9, p: 9, net: -6.5 }, metas: [
      { id: 't3r', secciones: ['principal', 'plan', 'inventada'], aspecto: 'Defensa', lado: 'Defensa', label: 'Triple <b>del rival', unidad: 'pct', dir: -1, base: 0.40, meta: 0.35, liga: 0.33, pts: 4.1 },
      { id: 'roto<script>', base: 1, meta: 2 }, { id: 'sin-numeros', base: 'x', meta: 1 }] };
    r = await C(tokAdmin, Object.assign({}, base, { publicar: true, enviar: 'prueba', metas: metasN }), { transporte: tQ });
    check('publicar sella, publica y manda la prueba', r.status === 200 && r.body.sellado && r.body.publicado && tQ.enviados.length === 1);
    check('el link del mail abre Ciclos en ese ciclo publicado', /club=jujuy&(amp;)?ciclo=c0n4#ciclos/.test(tQ.enviados[0].html) && CIC.linkDelCiclo('jujuy', 'c0n4') === 'https://coachgn.github.io/estadisticas/?club=jujuy&ciclo=c0n4#ciclos');
    r = await L(tokJujuy);
    const mt = r.body.publicados[0] && r.body.publicados[0].metas;
    check('las metas quedan congeladas con el ciclo publicado', mt && mt.metas.length === 1 && mt.metas[0].id === 't3r' && mt.metas[0].base === 0.40 && mt.metas[0].meta === 0.35);
    check('se acota la forma: sin HTML, sin secciones inventadas, sin ids raros', mt && !/</.test(mt.metas[0].label) && mt.metas[0].secciones.join() === 'principal,plan');
    check('el resultado congelado sale del dato del servidor, no del navegador', mt && mt.resultado.g === 4 && mt.resultado.p === 0 && mt.resultado.net === -6.5 && mt.ciclo.numero === 0 && !!mt.congeladas);
    r = await L(tokJujuy);
    check('el cuerpo técnico ve el ciclo publicado, con su meta', r.body.publicados.length === 1 && r.body.publicados[0].clave === 'c0n4' && r.body.publicados[0].meta.desde === '2026-10-10');
    r = await F(tokJujuy, 'c0n4');
    check('y lee el informe tal cual se publicó', r.status === 200 && r.body.foto.secciones.principal === foto.secciones.principal && r.body.foto.estilo === foto.estilo);
    r = await F(tokJujuy, 'c1n4');
    check('un ciclo no publicado no se lee', r.status === 404 && r.body.codigo === 'NO_PUBLICADO');
    const comp = Object.values(hashes[CIC.claveFoto('jujuy', 'jujuy-sur')])[0];
    check('la foto se guarda comprimida', JSON.parse(comp).datos.length < JSON.stringify(foto).length * 2 && FOTO.descomprimir(JSON.parse(comp).datos).titulo === 'Ciclo 0 · JUJUY');
    r = await C(tokAdmin, Object.assign({}, base, { publicar: true }));
    check('publicar dos veces: 409 YA_PUBLICADO', r.status === 409 && r.body.codigo === 'YA_PUBLICADO');
    const tR = ENVIO.transporteMemoria();
    r = await C(tokAdmin, { equipo: 'JUJUY', criterio: crit0, huella: huella0, enviar: 'prueba' }, { transporte: tR });
    check('uno publicado se puede volver a mandar con la foto guardada', r.status === 200 && tR.enviados.length === 1);
    r = await CIC.manejarCiclos(pedS(tokJujuy, null, { equipo: 'JUJUY' }));
    check('y su sello ya lo ve el cuerpo técnico', r.status === 200 && r.body.sellados.length === 1);

    const tE = ENVIO.transporteMemoria();
    r = await C(tokAdmin, { equipo: 'JUJUY', criterio: crit0, huella: huella0, enviar: 'equipo' }, { transporte: tE, env: { CICLOS_ENVIO_CLIENTES: 'si' } });
    check('con CICLOS_ENVIO_CLIENTES=si va a cada mail del padrón del club', r.status === 200 && tE.enviados.map(m => m.para).join() === 'ana@jujuy.com,beto@jujuy.com' && !/PRUEBA/.test(tE.enviados[0].asunto));
    r = await CIC.manejarPublicados(pedS(tokAdmin, null, { equipo: 'JUJUY' }), { env: { CICLOS_ENVIO_CLIENTES: 'si' } });
    check('el admin sabe si el envío a los entrenadores está habilitado', r.body.envioClientes === true);

    check('Evolución es la primera hoja del PDF', FOTO.SECCIONES[0] === 'evolucion' && /Evolución<\/h2>[\s\S]*Principal<\/h2>/.test(FOTO.documento({ estilo: '', secciones: { evolucion: 'E', principal: 'P' } }, {})));
    check('sin metas válidas no se congela nada', FOTO.validarMetas(null) === null && FOTO.validarMetas({ metas: 'x' }) === null && FOTO.validarMetas({ metas: [] }).metas.length === 0);
    check('la foto valida tamaño y la sección Principal', !FOTO.validar({ secciones: { equipos: 'x' } }).ok && !FOTO.validar({ secciones: { principal: 'x'.repeat(FOTO.MAX_BYTES + 1) } }).ok && FOTO.validar(foto).ok);
    const app2 = require('fs').readFileSync(__dirname + '/server/app.js', 'utf8');
    check('las rutas existen y solo /cerrar acepta un cuerpo grande', /\/cerrar', responder\(ciclos\.manejarCerrar\)/.test(app2) && /\/publicados', responder/.test(app2) && /\/foto', responder/.test(app2) && /jsonInforme = express\.json\(\{ limit: '4mb' \}\)/.test(app2));
  }

  titulo('5 · el cableado');
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/server/app.js', 'utf8');
  const data = fs.readFileSync(__dirname + '/js/sgadd-data.js', 'utf8');
  const adm = fs.readFileSync(__dirname + '/js/sgadd-ciclosadmin.js', 'utf8');
  check('la ruta POST /publicar existe', /post\('\/api\/v1\/ciclos\/:clubId\/:categoria\/publicar'/.test(app));
  check('la ruta GET /paquete existe y la sección Ciclos la usa en vez de /pbp', /get\('\/api\/v1\/ciclos\/:clubId\/:categoria\/paquete'/.test(app) && /ciclosPaquete/.test(fs.readFileSync(__dirname + '/js/sgadd-ciclosui.js', 'utf8')));
  check('el cliente de datos la expone', /ciclosPublicar/.test(data) && /\/publicar/.test(data));
  check('el panel dice «Publicar y Enviar Ciclo», hace un ensayo antes de confirmar y lista los destinatarios', /Publicar y Enviar Ciclo/.test(adm) && /ensayo: true/.test(adm) && /Se envía a/.test(adm));
  const vj = JSON.parse(fs.readFileSync(__dirname + '/server/vercel.json', 'utf8'));
  check('Vercel le da tiempo y los binarios de Chromium a la función', vj.functions['api/index.js'].maxDuration >= 30 && /chromium/.test(vj.functions['api/index.js'].includeFiles));
  const pk = JSON.parse(fs.readFileSync(__dirname + '/server/package.json', 'utf8'));
  check('las dos dependencias del PDF están declaradas', !!pk.dependencies['puppeteer-core'] && !!pk.dependencies['@sparticuz/chromium']);
  check('el CLI local existe y usa el mismo handler', /manejarPublicar/.test(fs.readFileSync(__dirname + '/server/bin/ciclos.js', 'utf8')));
  check('el handler nunca borra el estado de gestión (solo el reclamo del envío)', !ops.some(o => o === 'SET'));

  console.log(`\n${ok} pasan · ${fail} fallan`);
  process.exit(fail ? 1 : 0);
})();
