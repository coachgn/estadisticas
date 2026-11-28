'use strict';
/* =====================================================================
   La Mesa de control (pestaña «Mesa»). Usa $, esc y api() de la página.
   Tablero de un golpe de vista: KPIs arriba, filas de una línea y el
   detalle bajo demanda. Es de SOLO LECTURA: pide /api/mesa por GET y pinta.
   «Preparar» abre un panel que MUESTRA los comandos para copiar; ningún
   botón ejecuta nada ni hay ninguna llamada que escriba.
   ===================================================================== */
const MS = { m: null, filtro: null, filtroOrigen: null, verTodas: false, ops: [], pasos: [], abridor: null };
const MS_TOPE = 8;

(function estilos() {
  const s = document.createElement('style');
  s.textContent = `
  .ms-barra { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin:0 0 10px; font-size:14px; }
  .ms-barra .sep { flex:1; }
  .ms-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:10px; margin:0 0 14px; }
  @media (max-width: 700px) { .ms-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); } }
  .ms-kpi { text-align:left; border:1px solid var(--borde); border-radius:10px; padding:8px 12px; background:#0b1c35; min-height:56px; min-width:0; font-weight:500; }
  .ms-kpi b { display:block; font-size:24px; line-height:1.1; }
  .ms-kpi span { font-size:12px; color:var(--tenue); letter-spacing:.5px; text-transform:uppercase; }
  .ms-kpi.rompe b { color:var(--roj); } .ms-kpi.riesgo b { color:var(--nar); } .ms-kpi.info b { color:var(--cel); }
  .ms-kpi[aria-pressed=true] { outline:2px solid var(--cel); }
  .ms-kpi.fijo { cursor:default; }
  .ms-grilla { display:grid; grid-template-columns:1fr; gap:14px; align-items:start; }
  @media (min-width: 1000px) { .ms-grilla { grid-template-columns:2fr 1fr; } }
  .ms-lado { display:grid; gap:14px; }
  .ms-card h3 { margin:0 0 8px; font-size:15px; letter-spacing:.5px; }
  .ms-chips { display:flex; gap:6px; flex-wrap:wrap; margin:0 0 8px; }
  .ms-chips button { min-height:40px; padding:2px 10px; font-size:13px; font-weight:500; border-radius:20px; }
  .ms-chips button[aria-pressed=true] { background:var(--cel); color:#08162b; border-color:var(--cel); }
  .ms-fila { border-bottom:1px solid var(--borde); min-width:0; }
  #ms-raiz .ms-card { min-width:0; }
  #ms-raiz .ms-chico, #ms-drawer .ms-chico { min-height:40px; padding:4px 12px; font-size:13px; font-weight:500; }
  .ms-fila:last-child { border-bottom:0; }
  .ms-linea { display:flex; align-items:center; gap:8px; min-height:40px; min-width:0; }
  .ms-tog { flex:1 1 0; min-width:0; overflow:hidden; display:flex; align-items:center; gap:8px; text-align:left; background:transparent; border:0; padding:4px 2px; font-weight:500; }
  .ms-tit { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:1 1 0; display:block; }
  .ms-punto { width:10px; height:10px; border-radius:50%; flex:none; background:var(--tenue); display:inline-block; }
  .ms-punto.rompe, .ms-punto.roj { background:var(--roj); } .ms-punto.riesgo, .ms-punto.nar { background:var(--nar); }
  .ms-punto.info, .ms-punto.ver { background:var(--ver); }
  .ms-linea .chip { margin:0; flex:none; }
  .ms-tog > * { min-width:0; }
  .ms-tog .ms-punto, .ms-tog .chip { min-width:auto; }
  .ms-prep { flex:none; min-height:40px; padding:4px 12px; font-size:13px; }
  .ms-det { padding:2px 4px 10px 22px; color:var(--tenue); font-size:14px; }
  .ms-tabla td, .ms-tabla th { text-align:left; white-space:normal; padding:5px 6px; font-size:13px; }
  .ms-tabla td.chica { color:var(--tenue); font-size:12px; }
  details.ms-grupo { border-bottom:1px solid var(--borde); }
  details.ms-grupo > summary { min-height:40px; display:flex; align-items:center; }
  .ms-fuentes { cursor:help; }
  #ms-fondo { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:20; }
  #ms-drawer { position:fixed; top:0; right:0; bottom:0; width:min(520px, 100%); background:var(--card); border-left:1px solid var(--borde); z-index:21; overflow:auto; padding:16px 18px 24px; }
  @media (max-width: 700px) { #ms-drawer { top:auto; left:0; width:100%; max-height:88vh; border-left:0; border-top:1px solid var(--borde); border-radius:14px 14px 0 0; } }
  #ms-drawer h3 { margin:0 0 4px; padding-right:48px; }
  #ms-cerrar { position:absolute; top:10px; right:12px; min-width:40px; }
  .ms-aviso { border-left:3px solid var(--cel); background:rgba(116,172,223,.08); padding:8px 12px; border-radius:0 6px 6px 0; margin:10px 0; font-size:14px; }
  .ms-paso { border:1px solid var(--borde); border-radius:10px; padding:10px 12px; margin:10px 0; background:#0b1c35; }
  .ms-paso.atenuado { opacity:.5; }
  .ms-paso code { display:block; margin:6px 0; padding:6px 8px; background:#06101f; border-radius:6px; overflow-wrap:anywhere; user-select:all; }
  .ms-paso p { margin:4px 0 0; color:var(--tenue); font-size:13px; }
  .chip.ens { color:var(--ver); border-color:var(--ver); } .chip.esc { color:var(--roj); border-color:var(--roj); }
  ul.ms-guardas { list-style:none; padding:0; margin:6px 0; } ul.ms-guardas li { padding:3px 0; font-size:14px; }
  `;
  document.head.appendChild(s);
})();

const MS_ROTULO = { rompe: 'Rompe', riesgo: 'Riesgo', info: 'Para decidir' };
const msCorto = (n) => String(n || '').replace(/^MotorStats\s*/, '');

/* Se registra la operación del ítem y el botón la busca por número: los comandos no viajan por atributos del HTML. */
function msFila(it, detalleAbierto) {
  const id = 'ms-d' + (MS.ops.length + MS.pasos.length) + '-' + Math.random().toString(36).slice(2, 7);
  let prep = '';
  if (it.operacion) { MS.ops.push(it.operacion); prep = '<button class="ms-prep" data-prep="' + (MS.ops.length - 1) + '" aria-label="Preparar: ' + esc(it.titulo) + '">Preparar</button>'; }
  return '<div class="ms-fila"><div class="ms-linea">' +
    '<button class="ms-tog" data-tog="' + id + '" aria-expanded="false" aria-controls="' + id + '" title="' + esc(it.titulo) + '">' +
      '<span class="ms-punto ' + esc(it.gravedad) + '" aria-hidden="true"></span><span class="ms-tit">' + esc(it.titulo) + '</span>' +
      '<span class="chip">' + esc(it.origen) + '</span></button>' + prep + '</div>' +
    '<div class="ms-det" id="' + id + '" hidden>' + (it.detalle ? esc(it.detalle) : '<span class="tenue">Sin más detalle.</span>') + '</div></div>';
}

function msKpi(clave, rotulo, n) {
  return '<button class="ms-kpi ' + clave + '" data-kpi="' + clave + '" aria-pressed="' + (MS.filtro === clave) + '"><b>' + esc(n) + '</b><span>' + esc(rotulo) + '</span></button>';
}

function msDecidi(m) {
  const lista = m.decidiHoy.filter((i) => (!MS.filtro || i.gravedad === MS.filtro) && (!MS.filtroOrigen || i.origen === MS.filtroOrigen));
  const cuentas = {};
  m.decidiHoy.forEach((i) => { cuentas[i.origen] = (cuentas[i.origen] || 0) + 1; });
  const chips = Object.keys(cuentas).length > 1
    ? '<div class="ms-chips" role="group" aria-label="Filtrar por origen">' + Object.keys(cuentas).map((o) => '<button data-origen="' + esc(o) + '" aria-pressed="' + (MS.filtroOrigen === o) + '">' + esc(o) + ' · ' + esc(cuentas[o]) + '</button>').join('') + '</div>' : '';
  const vis = MS.verTodas ? lista : lista.slice(0, MS_TOPE);
  return '<div class="card ms-card"><h3>Decidí hoy <span class="chip">' + esc(lista.length) + '</span></h3>' + chips +
    (vis.length ? vis.map((i) => msFila(i)).join('') : '<p class="tenue">' + (m.decidiHoy.length ? 'Nada con ese filtro.' : 'Nada espera una decisión.') + '</p>') +
    (lista.length > vis.length ? '<button class="ms-chico" data-vermas="1" style="margin-top:8px">Ver ' + esc(lista.length - vis.length) + ' más</button>' : '') + '</div>';
}

function msCorreSolo(m) {
  /* La tabla Rutina / Última / Próxima es solo de las tareas de Windows. Los ítems de ciclos y candado no tienen esas
     columnas: van debajo como filas compactas, para no quedar bajo encabezados que no les corresponden. */
  const tareas = m.correSolo.filter((i) => i.origen === 'tareas');
  const otros = m.correSolo.filter((i) => i.origen !== 'tareas');
  const punto = (i) => (i.gravedad === 'info' ? 'ver' : 'roj');
  const filas = tareas.map((i) => {
    const mt = String(i.detalle || '').match(/última corrida (.+?) · próxima (.+?) · resultado/);
    return '<tr><td><span class="ms-punto ' + punto(i) + '" aria-hidden="true"></span> <span title="' + esc(i.detalle) + '">' + esc(msCorto(i.titulo)) + '</span></td>' +
      (mt ? '<td class="chica">' + esc(mt[1]) + '</td><td class="chica">' + esc(mt[2]) + '</td>' : '<td class="chica" colspan="2">' + esc(i.detalle) + '</td>') + '</tr>';
  }).join('');
  const resto = otros.map((i) => '<div class="ms-fila"><div class="ms-linea"><span class="ms-punto ' + punto(i) + '" aria-hidden="true"></span><span class="ms-tit" title="' + esc(i.titulo + ' · ' + (i.detalle || '')) + '">' + esc(i.titulo) + '</span></div><div class="ms-det" style="padding-left:18px">' + esc(i.detalle) + '</div></div>').join('');
  return '<div class="card ms-card"><h3>Corre solo <span class="chip">' + esc(m.correSolo.length) + '</span></h3>' +
    (filas ? '<div class="scroll"><table class="ms-tabla"><thead><tr><th>Rutina</th><th>Última</th><th>Próxima</th></tr></thead><tbody>' + filas + '</tbody></table></div>' : '') + resto +
    (!filas && !resto ? '<p class="tenue">Sin rutinas a la vista.</p>' : '') + '</div>';
}

const MS_GRUPO = { cerebro: 'Pendientes del cerebro', banco: 'Banco de ideas', auditor: 'Auditor', tareas: 'Tareas', ciclos: 'Ciclos', manuales: 'Partidos manuales', cola: 'Cola de Canva', candado: 'Ingesta' };
function msDatos(m) {
  const por = {};
  m.datos.forEach((i) => { (por[i.origen] = por[i.origen] || []).push(i); });
  const grupos = Object.keys(por).map((o) => '<details class="ms-grupo"><summary>' + esc(MS_GRUPO[o] || o) + ' · ' + esc(por[o].length) + '</summary>' + por[o].map((i) => msFila(i)).join('') + '</details>').join('');
  return '<div class="card ms-card"><h3>Datos <span class="chip">' + esc(m.datos.length) + '</span></h3>' + (grupos || '<p class="tenue">Sin datos de contexto.</p>') + '</div>';
}

function pintarMesa(m, foco) {
  MS.m = m; MS.ops = []; MS.pasos = [];
  const caidas = Object.keys(m.fuentes).filter((k) => !m.fuentes[k].ok);
  const hora = new Date(m.generado);
  const cuenta = (g) => m.decidiHoy.filter((i) => i.gravedad === g).length;
  const tareas = m.correSolo.filter((i) => i.origen === 'tareas');
  const okT = tareas.filter((i) => i.gravedad === 'info').length;
  const colorT = !tareas.length ? '' : okT === tareas.length ? 'ver' : okT === 0 ? 'roj' : 'nar';
  $('ms-raiz').innerHTML =
    '<div class="ms-barra"><span>Generado a las <b>' + esc(isNaN(hora) ? '' : hora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })) + '</b></span>' +
      (m.deCache ? '<span class="chip">de caché (5 min)</span>' : '') +
      (caidas.length ? '<span class="chip ms-fuentes" title="' + esc(caidas.map((k) => k + ': ' + m.fuentes[k].error).join(' · ')) + '">' + esc(caidas.length) + (caidas.length === 1 ? ' fuente caída' : ' fuentes caídas') + '</span>' : '') +
      '<span class="sep"></span><button id="ms-actualizar" class="ms-chico" title="Vuelve a leer todas las fuentes. Es una lectura: no cambia nada.">Actualizar</button></div>' +
    '<div class="ms-kpis">' + msKpi('rompe', 'Rompe', cuenta('rompe')) + msKpi('riesgo', 'Riesgo', cuenta('riesgo')) + msKpi('info', 'Para decidir', cuenta('info')) +
      '<div class="ms-kpi fijo" title="Rutinas de Windows que terminaron bien"><b>' + (tareas.length ? esc(okT + '/' + tareas.length) : '—') + (colorT ? ' <span class="ms-punto ' + colorT + '" aria-hidden="true"></span>' : '') + '</b><span>Rutinas</span></div></div>' +
    '<div class="ms-grilla">' + msDecidi(m) + '<div class="ms-lado">' + msCorreSolo(m) + msDatos(m) + '</div></div>';
  $('ms-actualizar').onclick = () => cargarMesa(true);
  /* Repintar destruye el botón que se apretó: el foco vuelve al equivalente (o a la primera fila nueva) en vez de caer en el body. */
  if (foco) {
    let el = null;
    if (foco.actualizar) el = $('ms-actualizar');
    else if (foco.kpi) el =document.querySelector('#ms-raiz [data-kpi="' + foco.kpi + '"]');
    else if (foco.origen) el = Array.from(document.querySelectorAll('#ms-raiz [data-origen]')).find((b) => b.dataset.origen === foco.origen);
    else if (foco.nueva != null) { const fs = document.querySelectorAll('#ms-raiz .ms-card .ms-fila .ms-tog'); el = fs[foco.nueva] || null; }
    if (el && el.focus) el.focus();
  }
}
/* Tras «Actualizar» un filtro puede haber quedado sin nada: sin esta limpieza el chip no existe y no hay cómo quitarlo. */
function msSanear(m) {
  if (MS.filtroOrigen && !m.decidiHoy.some((i) => i.origen === MS.filtroOrigen)) MS.filtroOrigen = null;
  if (MS.filtro && !m.decidiHoy.some((i) => i.gravedad === MS.filtro)) MS.filtro = null;
}

/* ------------------------- el panel «Preparar» ------------------------- */
const MS_ICONO = { ok: '✓', mirar: '⚠', bloquea: '⛔' };
function msCerrarPanel() {
  const f = $('ms-fondo'), d = $('ms-drawer');
  if (f) f.remove(); if (d) d.remove();
  document.removeEventListener('keydown', msTeclas);
  if (MS.abridor && MS.abridor.focus) MS.abridor.focus();
  MS.abridor = null;
}
function msTeclas(e) {
  if (e.key === 'Escape') { e.preventDefault(); msCerrarPanel(); return; }
  if (e.key !== 'Tab') return;
  const f = Array.from($('ms-drawer').querySelectorAll('button')); if (!f.length) return;
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
}
function msAbrirPanel(op, abridor) {
  msCerrarPanel();
  MS.abridor = abridor;
  const bloq = (op.guardas || []).find((g) => g.estado === 'bloquea');
  MS.pasos = [];
  const pasos = (op.pasos || []).map((p, n) => {
    const atenuado = p.escribe && bloq;
    if (p.comando) MS.pasos.push(p.comando);
    return '<div class="ms-paso' + (atenuado ? ' atenuado' : '') + '"><b>' + esc(n + 1) + '. ' + esc(p.etiqueta) + '</b> ' +
      (p.escribe ? '<span class="chip esc">Escribe · espera tu OK</span>' : '<span class="chip ens">Ensayo · no escribe</span>') +
      (atenuado ? '<p><b>Bloqueado: ' + esc(bloq.texto) + '</b></p>' : '') +
      (p.comando ? '<code>' + esc(p.comando) + '</code><button class="ms-chico" data-copiar="' + (MS.pasos.length - 1) + '">Copiar</button>' : '') +
      (p.nota ? '<p>' + esc(p.nota) + '</p>' : '') + '</div>';
  }).join('');
  const aLas = MS.m && MS.m.guardasA && new Date(MS.m.guardasA);
  const cuando = aLas && !isNaN(aLas) ? ' <span class="tenue">Guardas calculadas a las ' + esc(aLas.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })) + '</span>' : '';
  const guardas = (op.guardas || []).length ? '<h4>Guardas' + cuando + '</h4><ul class="ms-guardas">' + op.guardas.map((g) => '<li>' + esc(MS_ICONO[g.estado] || '·') + ' ' + esc(g.texto) + '</li>').join('') + '</ul>' : '';
  const fondo = document.createElement('div'); fondo.id = 'ms-fondo'; fondo.onclick = msCerrarPanel;
  const dr = document.createElement('div'); dr.id = 'ms-drawer'; dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-modal', 'true'); dr.setAttribute('aria-labelledby', 'ms-dr-tit');
  dr.innerHTML = '<button id="ms-cerrar" aria-label="Cerrar">✕</button><h3 id="ms-dr-tit">' + esc(op.titulo) + '</h3><p class="tenue">' + esc(op.queHace) + '</p>' +
    '<div class="ms-aviso">Este panel no ejecuta nada. Copiá el comando y corrélo vos; los pasos que escriben esperan tu OK.</div>' +
    pasos + guardas + (op.skill ? '<p class="tenue">O pedíselo a Claude: <code>' + esc(op.skill) + '</code></p>' : '');
  document.body.appendChild(fondo); document.body.appendChild(dr);
  $('ms-cerrar').onclick = msCerrarPanel;
  document.addEventListener('keydown', msTeclas);
  $('ms-cerrar').focus();
}
function msCopiar(texto, boton) {
  const respaldo = () => {
    const c = Array.from(document.querySelectorAll('#ms-drawer code')).find((x) => x.textContent === texto);
    if (c) { const r = document.createRange(); r.selectNodeContents(c); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    boton.textContent = 'Seleccionado: Ctrl+C';
  };
  try { navigator.clipboard.writeText(texto).then(() => { boton.textContent = 'Copiado ✓'; }, respaldo); } catch (e) { respaldo(); }
}

/* Un solo oyente para toda la mesa: las filas se repintan y los botones no guardan datos propios. */
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('#tab-mesa button, #ms-drawer button'); if (!b) return;
  if (b.dataset.tog) { const d = $(b.dataset.tog), ab = b.getAttribute('aria-expanded') === 'true'; b.setAttribute('aria-expanded', String(!ab)); d.hidden = ab; }
  else if (b.dataset.prep != null) msAbrirPanel(MS.ops[Number(b.dataset.prep)], b);
  else if (b.dataset.copiar != null) msCopiar(MS.pasos[Number(b.dataset.copiar)], b);
  else if (b.dataset.kpi) { MS.filtro = MS.filtro === b.dataset.kpi ? null : b.dataset.kpi; MS.verTodas = false; pintarMesa(MS.m, { kpi: b.dataset.kpi }); }
  else if (b.dataset.origen) { MS.filtroOrigen = MS.filtroOrigen === b.dataset.origen ? null : b.dataset.origen; MS.verTodas = false; pintarMesa(MS.m, { origen: b.dataset.origen }); }
  else if (b.dataset.vermas) { MS.verTodas = true; pintarMesa(MS.m, { nueva: MS_TOPE }); }
});

async function cargarMesa(fresco) {
  $('ms-raiz').innerHTML = '<p class="tenue">Leyendo las fuentes… puede tardar hasta un minuto y medio.</p>';
  try { const m = await api('/api/mesa' + (fresco ? '?fresco=1' : '')); msSanear(m); pintarMesa(m, fresco ? { actualizar: true } : undefined); }
  catch (e) { $('ms-raiz').innerHTML = '<div class="aviso error">No pude leer la mesa: ' + esc(e.message) + '</div>'; }
}
