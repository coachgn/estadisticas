'use strict';
/* =====================================================================
   El tablero de la agencia (pestaña «Agencia»). Usa $, esc y api() de la
   página. Todo lo que muestra sale de /api/agencia; las acciones van a
   /api/agencia/*. Nada se publica desde acá.
   ===================================================================== */
const AG = { est: null, abiertas: new Set(), pleg: new Set(), vista: 'hoy', verTodas: false, verDec: false, desdeElegido: {}, filtro: 'todos', temporizador: null, dlg: null };

(function estilos() {
  const s = document.createElement('style');
  s.textContent = `
  .ag-fila { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  .ag-decide { border:2px solid var(--nar); background:rgba(245,166,35,.07); }
  a.btn { display:inline-flex; align-items:center; padding:8px 10px; min-height:40px; border:1px solid var(--borde); border-radius:6px; background:#0b1c35; color:var(--tinta); font-weight:600; text-decoration:none; margin:2px 4px 2px 0; }
  a.btn.pri { background: var(--cel); color:#08162b; border-color: var(--cel); }
  .ag-rank { font-size:22px; font-weight:800; color:var(--cel); min-width:38px; }
  .ag-prob { font-weight:700; min-width:48px; }
  .ag-btns { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
  .ag-btns button, #ag-raiz button.chico, #ag-raiz select { min-height:40px; padding:4px 12px; font-size:14px; }
  .ag-det { margin-top:8px; display:grid; gap:8px; }
  .ag-det p { margin:0; } .ag-det b { color:var(--tenue); font-size:12px; text-transform:uppercase; letter-spacing:.5px; display:block; }
  .ag-puertas { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0; }
  .ag-pt { border:1px solid var(--borde); border-radius:8px; padding:3px 9px; font-size:13px; cursor:help; }
  .ag-pt.ok { color:var(--ver); border-color:var(--ver); } .ag-pt.frena { color:var(--roj); border-color:var(--roj); font-weight:700; } .ag-pt.sin { color:var(--tenue); }
  .ag-nota { border-left:3px solid var(--cel); padding:6px 10px; margin:6px 0; background:rgba(116,172,223,.07); border-radius:0 6px 6px 0; font-size:14px; }
  .ag-nota small { color:var(--tenue); display:block; }
  .ag-trab { font-size:13px; padding:4px 0; border-bottom:1px solid var(--borde); }
  .ag-barra1 { display:flex; gap:10px; align-items:center; margin:0 0 10px; min-width:0; }
  @media (max-width: 700px) { .ag-barra1 { flex-wrap:wrap; } .ag-resumen { order:3; flex-basis:100%; } .ag-prin .ag-txt { display:none; } .ag-prin button, .ag-prin a.btn { min-width:40px; padding:4px 8px; } .ag-desp { padding-left:6px; } }
  .ag-resumen { flex:1 1 0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--tenue); font-size:14px; }
  .ag-chico { min-height:40px; padding:4px 12px; font-size:13px; font-weight:500; flex:none; }
  .ag-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:10px; margin:0 0 14px; }
  @media (max-width: 700px) { .ag-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); } }
  .ag-kpi { text-align:left; border:1px solid var(--borde); border-radius:10px; padding:8px 12px; background:#0b1c35; min-height:56px; min-width:0; font-weight:500; }
  .ag-kpi b { display:block; font-size:24px; line-height:1.1; } .ag-kpi.hay b { color:var(--nar); }
  .ag-kpi span { font-size:12px; color:var(--tenue); letter-spacing:.5px; text-transform:uppercase; } .ag-kpi small { display:block; color:var(--roj); font-size:12px; }
  .ag-kpi[aria-pressed=true] { outline:2px solid var(--cel); }
  .ag-grilla { display:grid; grid-template-columns:minmax(0,1fr); gap:14px; align-items:start; }
  @media (min-width: 1000px) { .ag-grilla { grid-template-columns:2fr 1fr; } }
  .ag-lado, .ag-abajo { display:grid; grid-template-columns:minmax(0,1fr); gap:14px; min-width:0; } #ag-raiz label, #ag-raiz textarea, #ag-raiz select { min-width:0; max-width:100%; } #ag-raiz .grilla > * { min-width:0; } .ag-abajo { margin-top:14px; }
  .ag-card { min-width:0; } .ag-card h3 { margin:0 0 8px; font-size:15px; letter-spacing:.5px; }
  .ag-chips { display:flex; gap:6px; flex-wrap:wrap; margin:0 0 8px; }
  .ag-chips button { min-height:40px; padding:2px 10px; font-size:13px; font-weight:500; border-radius:20px; }
  .ag-chips button[aria-pressed=true] { background:var(--cel); color:#08162b; border-color:var(--cel); }
  .ag-fila1 { border-bottom:1px solid var(--borde); min-width:0; } .ag-fila1:last-child { border-bottom:0; }
  .ag-lin { display:flex; align-items:center; gap:8px; min-height:40px; min-width:0; }
  .ag-tog { flex:1 1 0; min-width:0; overflow:hidden; display:flex; align-items:center; gap:8px; text-align:left; background:transparent; border:0; padding:4px 2px; min-height:40px; font-weight:500; }
  .ag-tog:focus-visible, .ag-kpi:focus-visible, .ag-chips button:focus-visible { outline:2px solid var(--cel); outline-offset:2px; }
  .ag-tit { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:1 1 0; display:block; }
  .ag-mini { width:48px; height:6px; border-radius:6px; background:#06101f; overflow:hidden; flex:none; } .ag-mini i { display:block; height:100%; }
  .ag-prin { flex:none; display:flex; gap:6px; } .ag-prin a.btn { justify-content:center; } .ag-prin button, .ag-prin a.btn { min-height:40px; padding:4px 12px; font-size:13px; margin:0; }
  .ag-desp { padding:2px 4px 10px 22px; } .ag-tog .chip { margin:0; flex:none; }
  .ag-tabla td { text-align:left; white-space:normal; padding:5px 6px; font-size:13px; } .ag-tabla td.chica { color:var(--tenue); font-size:12px; }
  details.ag-pleg > summary { min-height:40px; display:flex; align-items:center; cursor:pointer; }
  #ag-dlg { border:1px solid var(--borde); border-radius:12px; background:var(--card); color:var(--tinta); max-width:720px; width:92%; }
  #ag-dlg::backdrop { background:rgba(0,0,0,.6); }
  #ag-dlg label { margin:8px 0; }
  `;
  document.head.appendChild(s);
})();

const colorProb = (p) => (p >= 70 ? 'var(--ver)' : p >= 50 ? 'var(--cel)' : p >= 35 ? 'var(--nar)' : 'var(--roj)');
const fechaCorta = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); };
const diaLindo = (d) => (d ? d.split('-').reverse().join('/') : '');

async function cargarAgencia() {
  try { AG.est = await api('/api/agencia'); try { AG.consumo = (await api('/api/agencia/consumo')).consumo; } catch (_) {} } catch (e) { $('ag-raiz').innerHTML = '<div class="aviso error">No pude leer la agencia: ' + esc(e.message) + '</div>'; return; }
  pintarAgencia();
  const corre = AG.est.trabajos.some((t) => t.estado === 'corriendo');
  clearTimeout(AG.temporizador);
  if (corre) AG.temporizador = setTimeout(() => { if (TAB === 'agencia') cargarAgencia(); }, 4000);
}

/* Desde qué puerta correr: solo se ofrecen las que tienen todas las anteriores en «ok» (el servidor lo vuelve a exigir). */
function selectorDesde(i) {
  const pt = i.puertas || {}, ops = [];
  for (const k of AG.est.puertas) { ops.push(k); if (!pt[k] || pt[k].estado !== 'ok') break; }
  const sug = ops[ops.length - 1];
  return '<label class="tenue" style="font-size:12px">desde <select data-ag-desde="' + esc(i.id) + '">' + ops.map((k) => '<option' + (k === sug ? ' selected' : '') + '>' + k + '</option>').join('') + '</select></label>' +
    (i.ultimaCorrida ? '<span class="tenue" style="font-size:12px"> · última corrida: ' + esc(i.ultimaCorrida.turnos || '?') + ' turnos, leyó ' + i.ultimaCorrida.leidos.length + ' de ' + (i.ultimaCorrida.leidos.length + i.ultimaCorrida.faltan.length) + ' archivos</span>' : '');
}

function chipsPuertas(i) {
  const pt = i.puertas || {};
  if (!Object.keys(pt).length) return '';
  return '<div class="ag-puertas">' + AG.est.puertas.map((k) => {
    const x = pt[k]; if (!x) return '<span class="ag-pt sin" title="No se revisó">○ ' + k + '</span>';
    const c = x.estado === 'ok' ? 'ok' : x.estado === 'frena' ? 'frena' : 'sin';
    const ic = x.estado === 'ok' ? '✓' : x.estado === 'frena' ? '✋' : '○';
    return '<span class="ag-pt ' + c + '" title="' + esc((x.veredicto || '') + (x.correccion ? ' · Corregir: ' + x.correccion : '')) + '">' + ic + ' ' + k + '</span>';
  }).join('') + '</div>' + (i.frenaEn ? '<div class="aviso error">Frena en ' + esc(i.frenaEn) + ': ' + esc(((pt[i.frenaEn] || {}).veredicto || '') + ((pt[i.frenaEn] || {}).correccion ? ' · Corregir: ' + pt[i.frenaEn].correccion : '')) + '</div>' : '');
}

function notasDe(i) {
  return (i.notas || []).map((n, k) => '<div class="ag-nota"><small>' + esc(n.quien) + ' · ' + fechaCorta(n.cuando) + '</small>' + esc(n.texto) +
    (n.necesitaDecision ? '<div class="aviso">❓ ' + esc(n.necesitaDecision) + '</div>' : '') +
    (n.cambios && !n.aplicado ? '<div class="ag-btns"><button class="chico" data-ag="aplicar" data-id="' + esc(i.id) + '" data-k="' + k + '">Aplicar el cambio propuesto</button></div>' : '') +
    (n.aplicado ? '<small>Cambio aplicado</small>' : '') + '</div>').join('');
}

function detalle(i) {
  const d = i.datos || {}, e = d.ejercicio || {};
  return '<div class="ag-det">' +
    '<p><b>Por qué esta probabilidad</b>' + esc(d.porQue || '') + '</p>' +
    '<p><b>Dolor del entrenador</b>' + esc(d.dolor || '') + '</p>' +
    '<p><b>Dato de MotorStats</b>' + esc(d.dato || '') + '</p>' +
    '<p><b>Lectura táctica</b>' + esc(d.lectura || '') + '</p>' +
    '<p><b>Ejercicio sugerido · ' + esc(e.formato || '') + '</b>' + esc(e.descripcion || '') + (e.variable ? ' <span class="tenue">(variable: ' + esc(e.variable) + ')</span>' : '') + '</p>' +
    '<p><b>Límite del dato</b>' + esc(d.limite || '') + '</p>' +
    '<p><b>Fuentes</b>' + esc((d.fuentes || []).join(' · ')) + '</p>' +
    '<p><b>Puertas que debería pasar</b>' + esc((d.puertas || []).join(' → ')) + '</p></div>';
}

/* ------------------------- filas de una línea (patrón de la Mesa) -------------------------
   Antes eran ~10 tarjetas apiladas con 4 botones por idea. Ahora cada idea es UNA línea (rank, título, %, puertas,
   botón principal) y el resto vive al desplegar: se lee el tablero entero de un vistazo y se baja solo por lo que importa. */
const AG_TOPE = 8;
const AG_VISTAS = [['hoy', 'Hoy'], ['curso', 'En trabajo'], ['aprobadas', 'Aprobadas'], ['anteriores', 'Anteriores'], ['banco', 'Banco']];
const AG_FILTROS = [['todos', 'Todo'], ['alta', 'Importante'], ['competencia', 'Competencia'], ['fuente', 'Fuentes'], ['plataforma', 'Plataforma'], ['mercado', 'Mercado']];
const abiertoSi = (k) => (AG.pleg.has(k) ? ' open' : '');

function listaDeVista(e, v) {
  if (v === 'curso') return { lista: e.enCurso, modo: 'curso' };
  if (v === 'aprobadas') return { lista: e.aprobadas, modo: 'aprobada' };
  if (v === 'anteriores') return { lista: e.anteriores, modo: 'nueva' };
  if (v === 'banco') return { lista: e.banco, modo: 'banco' };
  return { lista: e.ideasHoy.filter((i) => i.estado === 'nueva'), modo: 'nueva' };
}

function chipPuertasCorto(i) {
  const pt = i.puertas || {};
  if (!Object.keys(pt).length) return '';
  if (i.frenaEn) return '<span class="ag-pt frena" title="Frena en ' + esc(i.frenaEn) + '">' + esc(i.frenaEn) + ' ✋</span>';
  const ok = AG.est.puertas.filter((k) => pt[k] && pt[k].estado === 'ok').length;
  return '<span class="ag-pt ok" title="Puertas aprobadas">' + ok + '/' + AG.est.puertas.length + ' ✓</span>';
}

function botonesDe(i, modo) {
  const id = esc(i.id), b = (a, t, pri) => '<button' + (pri ? ' class="pri"' : '') + ' data-ag="' + a + '" data-id="' + id + '">' + t + '</button>';
  /* El principal va en la fila: a 375 px el texto se oculta (queda el ícono) y el nombre accesible vive en aria-label y title. */
  const bp = (a, ico, t) => '<button class="pri" data-ag="' + a + '" data-id="' + id + '" aria-label="' + esc(t) + '" title="' + esc(t) + '">' + ico + '<span class="ag-txt"> ' + esc(t) + '</span></button>';
  const arch = (i.pieza && i.pieza.archivos) || [];
  const enl = (f, t, pri) => '<a class="btn' + (pri ? ' pri' : '') + '" target="_blank" href="/agencia/piezas/' + id + '/' + f + '">' + t + '</a>';
  const enlp = (f, ico, t) => '<a class="btn pri" target="_blank" href="/agencia/piezas/' + id + '/' + f + '" aria-label="' + esc(t) + '" title="' + esc(t) + '">' + ico + '<span class="ag-txt"> ' + esc(t) + '</span></a>';
  let principal = '', resto = '';
  if (modo === 'nueva') { principal = bp('puertas', '✅', 'Elegir y pasar por las puertas'); resto = b('editar', '✏️ Modificar') + b('hablar', '💬 Pedir algo a un agente') + b('descartar', '🗑 Descartar (al banco)'); }
  else if (modo === 'curso') { principal = bp('aprobar', '✅', 'Aprobar (P11 · no publica)'); resto = b('puertas', '🔁 Volver a pasar por las puertas') + selectorDesde(i) + b('editar', '✏️ Modificar') + b('hablar', '💬 Pedir algo a un agente') + b('descartar', '🗑 Descartar'); }
  else if (modo === 'banco') { principal = bp('restaurar', '↩️', 'Restaurar'); resto = b('hablar', '💬 Pedir algo a un agente'); }
  else if (modo === 'aprobada') {
    if (arch.length) {
      principal = arch.includes('carrusel.html') ? enlp('carrusel.html', '👁', 'Ver la pieza') : bp('producir', '▶', 'Producir de nuevo');
      resto = (arch.includes('copy.md') ? enl('copy.md', '📝 Copy') : '') + (arch.includes('notas.md') ? enl('notas.md', '🔎 Cómo se validó') : '') + (arch.includes('carrusel.html') ? b('producir', '🔁 Producir de nuevo') : '');
    } else principal = bp('producir', '▶', 'Producir la pieza');
    resto += b('devolver', '↩️ Devolver a trabajo');
  }
  return { principal, resto };
}

function filaIdea(i, modo) {
  const d = i.datos || {}, p = Number(d.probabilidad);
  const abierta = AG.abiertas.has(i.id);
  const corre = AG.est.trabajos.some((t) => t.estado === 'corriendo' && t.idea === i.id);
  const bt = botonesDe(i, modo);
  const titulo = d.titulo || '';
  return '<div class="ag-fila1">' +
    '<div class="ag-lin"><button class="ag-tog" data-ag="tog" data-id="' + esc(i.id) + '" aria-expanded="' + abierta + '" aria-controls="ag-desp-' + esc(i.id) + '" title="' + esc(titulo) + '">' +
    '<span class="ag-rank">#' + esc(i.rank) + '</span><span class="ag-tit">' + esc(titulo) + '</span>' +
    (d.probabilidad != null && isFinite(p) ? '<span class="ag-prob" style="color:' + colorProb(p) + '" title="Probabilidad estimada de que funcione">' + p + ' %</span><span class="ag-mini" aria-hidden="true"><i style="width:' + Math.max(2, Math.min(100, p)) + '%;background:' + colorProb(p) + '"></i></span>' : '') +
    chipPuertasCorto(i) + (corre ? '<span title="Un agente trabaja en esta idea">⏳</span>' : '') + '</button>' +
    '<span class="ag-prin">' + bt.principal + '</span></div>' +
    (abierta ? '<div class="ag-desp" id="ag-desp-' + esc(i.id) + '"><p style="margin:0 0 6px">' + esc(d.dolor || '') + '</p>' + chipsPuertas(i) + notasDe(i) +
      (corre ? '<div class="aviso">⏳ Los agentes están trabajando en esta idea…</div>' : '') +
      '<div class="tenue" style="font-size:13px">' + diaLindo(i.dia) + ' · ' + esc(d.formato || '') + ' · ' + esc((d.ejercicio || {}).formato || '') + '</div>' +
      detalle(i) + '<div class="ag-btns">' + bt.resto + '</div></div>' : '') + '</div>';
}

function panelIdeas(e) {
  const cuentas = {}; AG_VISTAS.forEach(([v]) => { cuentas[v] = listaDeVista(e, v).lista.length; });
  if (AG.vista !== 'hoy' && !cuentas[AG.vista]) AG.vista = 'hoy';
  const tabs = AG_VISTAS.filter(([v]) => v === 'hoy' || cuentas[v]).map(([v, t]) => '<button data-ag="vista" data-v="' + v + '" aria-pressed="' + (AG.vista === v) + '">' + t + ' · ' + cuentas[v] + '</button>').join('');
  const { lista, modo } = listaDeVista(e, AG.vista);
  const vis = AG.verTodas ? lista : lista.slice(0, AG_TOPE);
  const intro = AG.vista === 'aprobadas' ? '<p class="tenue" style="margin:0 0 8px">Al aprobar, los agentes producen la pieza solos (tarda unos minutos). No se publica ni se programa nada: la revisás acá y la publicás vos.</p>' : AG.vista === 'banco' ? '<p class="tenue" style="margin:0 0 8px">Lo que descartás no se pierde: queda acá para cuando las ideas nuevas no funcionen.</p>' : '';
  const vacio = AG.vista === 'hoy' ? (e.ideasHoy.length ? 'Ya resolviste todas las ideas de hoy.' : 'Sin ideas todavía.') + ' Las de mañana llegan solas.' : 'Nada en esta lista.';
  return '<div class="card ag-card" id="ag-ideas"><h3>Ideas</h3><div class="ag-chips" role="group" aria-label="Qué ideas ver">' + tabs + '</div>' + intro +
    (vis.length ? vis.map((i) => filaIdea(i, modo)).join('') : '<p class="tenue">' + vacio + '</p>') +
    (lista.length > vis.length ? '<button class="ag-chico" data-ag="vermas" style="margin-top:8px">Ver ' + (lista.length - vis.length) + ' más</button>' : '') + '</div>';
}

/* UNA fila por decisión: chip + título con ellipsis. La recomendación y los botones Sí / No / Después viven al desplegar:
   con 23 decisiones, mostrar todo junto era una cascada y el título quedaba cortado a diez letras por los botones. */
const AG_TOPE_DEC = 5;
function panelDecisiones(e) {
  const vis = AG.verDec ? e.decisiones : e.decisiones.slice(0, AG_TOPE_DEC);
  const fila = (d) => {
    const clave = 'd' + d.id, ab = AG.abiertas.has(clave), idd = esc(d.id);
    return '<div class="ag-fila1"><div class="ag-lin"><button class="ag-tog" data-ag="tog" data-id="' + esc(clave) + '" aria-expanded="' + ab + '" aria-controls="ag-desp-' + esc(clave) + '" title="' + esc(d.texto) + '"><span class="chip">' + esc(d.tipo) + '</span><span class="ag-tit">' + esc(d.texto) + '</span></button></div>' +
      (ab ? '<div class="ag-desp" id="ag-desp-' + esc(clave) + '">' + (d.recomendacion ? '<div class="tenue">Recomendación de los agentes: ' + esc(d.recomendacion) + '</div>' : '') +
        '<div class="ag-btns"><button class="pri" data-ag="decidir" data-id="' + idd + '" data-r="si">Sí</button><button data-ag="decidir" data-id="' + idd + '" data-r="no">No</button><button data-ag="decidir" data-id="' + idd + '" data-r="despues">Después</button></div></div>' : '') + '</div>';
  };
  return '<div class="card ag-card ag-decide" id="ag-decisiones"><h3>Decisiones para vos <span class="chip">' + e.decisiones.length + '</span></h3>' +
    (vis.length ? vis.map(fila).join('') : '<p class="tenue">No hay decisiones pendientes.</p>') +
    (e.decisiones.length > vis.length ? '<button class="ag-chico" data-ag="vermasdec" style="margin-top:8px">Ver ' + (e.decisiones.length - vis.length) + ' más</button>' : '') + '</div>';
}

function filaTrabajo(t) {
  const e = AG.est;
  return '<tr><td>' + (t.estado === 'corriendo' ? '⏳' : t.estado === 'listo' ? '✅' : '⚠️') + ' <b>' + esc(t.tipo === 'puertas' ? 'Puertas' : t.tipo === 'rutina' ? 'Rutina diaria' : (e.agentes[t.agente] || 'Agente')) + '</b></td><td class="chica">' + fechaCorta(t.inicio) + '</td><td class="chica">' + esc(t.estado === 'corriendo' ? 'trabajando…' : (t.error || t.resumen || 'listo')) + '</td></tr>';
}
function panelTrabajos(e) {
  const todos = e.trabajos.slice().reverse(); // el servidor los entrega del más viejo al más nuevo
  const tabla = (xs) => '<div class="scroll"><table class="ag-tabla"><tbody>' + xs.map(filaTrabajo).join('') + '</tbody></table></div>';
  return '<div class="card ag-card"><h3>Trabajos de los agentes <span class="chip">' + todos.length + '</span></h3>' +
    (todos.length ? tabla(todos.slice(0, 5)) + (todos.length > 5 ? '<details class="ag-pleg" data-pleg="trab-resto"' + abiertoSi('trab-resto') + '><summary>Ver los otros ' + (todos.length - 5) + '</summary>' + tabla(todos.slice(5)) + '</details>' : '') : '<p class="tenue">Ningún agente trabajó todavía.</p>') + '</div>';
}

/* Clave estable del hallazgo: tipo + título sin tildes ni signos. Por índice, un hallazgo nuevo corría la lista y abría otro. */
const claveHallazgo = (x) => 'h-' + String((x.tipo || '') + ' ' + (x.titulo || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/* El href sale de un texto que escribió un agente leyendo la web: solo http(s). Con «javascript:» el clic ejecutaría código en la página. */
const enlaceSeguro = (u) => (/^https?:\/\//i.test(String(u)) ? '<a href="' + esc(u) + '" target="_blank" rel="noopener" style="color:var(--cel)">abrir</a>' : '<span class="tenue" title="No es un enlace web">' + esc(u) + '</span>');

function panelHallazgos(e) {
  const pasa = (x, f) => f === 'todos' || x.tipo === f || (f === 'alta' && x.relevancia === 'alta');
  const chips = AG_FILTROS.map(([v, t]) => '<button data-ag="filtro" data-f="' + v + '" aria-pressed="' + (AG.filtro === v) + '">' + t + ' · ' + e.hallazgos.filter((x) => pasa(x, v)).length + '</button>').join('');
  const hall = e.hallazgos.map((x, k) => ({ x, k })).filter((o) => pasa(o.x, AG.filtro));
  const fila = (o) => {
    const x = o.x, clave = claveHallazgo(o.x), ab = AG.abiertas.has(clave);
    return '<div class="ag-fila1"><div class="ag-lin"><button class="ag-tog" data-ag="tog" data-id="' + clave + '" aria-expanded="' + ab + '" aria-controls="ag-desp-' + clave + '" title="' + esc(x.titulo) + '"><span class="chip ' + (x.relevancia === 'alta' ? 'id' : '') + '">' + esc(x.tipo) + '</span><span class="ag-tit">' + esc(x.titulo) + '</span></button></div>' +
      (ab ? '<div class="ag-desp" id="ag-desp-' + clave + '"><div style="font-size:14px">' + esc(x.detalle) + '</div>' + (x.accionSugerida ? '<div class="aviso" style="font-size:13px">➜ ' + esc(x.accionSugerida) + '</div>' : '') +
        '<div class="tenue" style="font-size:12px">' + esc(x.fuente || '') + (x.fecha ? ' · ' + esc(x.fecha) : '') + (x.url ? ' · ' + enlaceSeguro(x.url) : '') + '</div></div>' : '') + '</div>';
  };
  return '<div class="card ag-card"><h3>Qué encontraron hoy <span class="chip">' + e.hallazgos.length + '</span></h3><div class="ag-chips" role="group" aria-label="Filtrar hallazgos">' + chips + '</div>' +
    (hall.length ? hall.map(fila).join('') : '<p class="tenue">Nada para mostrar con este filtro.</p>') +
    (e.noPudeVer.length ? '<details class="ag-pleg" data-pleg="nopude"' + abiertoSi('nopude') + '><summary>Lo que no pudieron ver (' + e.noPudeVer.length + ')</summary><ul>' + e.noPudeVer.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></details>' : '') + '</div>';
}

/* Cerrados por defecto: son consulta, no decisión. Solo se abren si el usuario los abrió (AG.pleg) o si pidió hablar desde una fila. */
function plegables(e) {
  const todas = e.ideasHoy.concat(e.enCurso, e.anteriores, e.banco).filter((v, k, a) => a.findIndex((z) => z.id === v.id) === k);
  const cs = AG.consumo || [];
  return '<details class="ag-pleg ag-card card" id="ag-hablar" data-pleg="hablar"' + abiertoSi('hablar') + '><summary>Hablar con los agentes</summary><p class="tenue" style="margin-top:0">Pedile, recomendá o corregí. El agente responde con criterio de su rol y, si propone un cambio, vos decidís si lo aplicás. No publican nada.</p>' +
    '<div class="grilla"><label>Agente<select id="ag-agente">' + Object.keys(e.agentes).map((k) => '<option value="' + k + '">' + esc(e.agentes[k]) + '</option>').join('') + '</select></label>' +
    '<label>Sobre qué idea<select id="ag-sobre"><option value="">Ninguna en particular</option>' + todas.map((i) => '<option value="' + esc(i.id) + '">#' + i.rank + ' · ' + esc((i.datos || {}).titulo || '').slice(0, 70) + '</option>').join('') + '</select></label></div>' +
    '<label style="margin-top:8px">Qué querés<textarea id="ag-texto" maxlength="1500" placeholder="Ej.: Revisá si esta idea no expone a ningún club cliente. / Proponé otro juego reducido. / Recomiendo que la serie arranque con el reloj de posesión."></textarea></label>' +
    '<div class="ag-btns"><button class="pri" data-ag="enviar">Enviar al agente</button><button data-ag="instruccion" title="Queda guardada y la rutina diaria la lee antes de proponer las ideas de mañana">📌 Dejar como criterio para las próximas ideas</button></div></details>' +
    '<details class="ag-pleg ag-card card" data-pleg="criterios"' + abiertoSi('criterios') + '><summary>Criterios y decisiones recientes · ' + e.instrucciones.length + '</summary>' +
    (e.instrucciones.length ? e.instrucciones.map((x) => '<div class="ag-trab"><span class="tenue">' + fechaCorta(x.cuando) + ' · ' + esc(x.de) + '</span> — ' + esc(x.texto) + '</div>').join('') : '<p class="tenue">Todavía no dejaste criterios.</p>') + '</details>' +
    '<details class="ag-pleg ag-card card" data-pleg="consumo"' + abiertoSi('consumo') + '><summary>Consumo de la rutina (plan de Claude)</summary>' + (cs.length ? cs.map((c) => '<div class="ag-fila"><b>' + esc(c.fecha) + '</b> · ' + esc(c.tipo) + ' · ' + esc(c.modelo || '') + ' · ' + Math.round((Number(c.entrada || 0) + Number(c.cacheLeido || 0) + Number(c.cacheEscrito || 0) + Number(c.salida || 0)) / 1000) + ' mil tokens · ' + Math.round(Number(c.segundos || 0) / 60) + ' min</div>').join('') : '<p>Todavía no hay corridas registradas con el ejecutor nuevo.</p>') + '<p style="margin:6px 0 0">Sola corre una vez por día (la semanal, los lunes). Repetirla el mismo día pide confirmación.</p></details>' +
    '<details class="ag-pleg ag-card card" data-pleg="informes"' + abiertoSi('informes') + '><summary>Informes completos · ' + e.informes.length + '</summary>' + (e.informes.length ? '<p class="tenue" style="font-size:12px">En contenido/vigilancia/: ' + e.informes.map(esc).join(' · ') + '</p>' : '<p class="tenue">Sin informes todavía.</p>') + '</details>';
}

function kpiAg(v, titulo, n, extra, activo) {
  return '<button class="ag-kpi' + (n ? ' hay' : '') + '" data-ag="kpi" data-v="' + v + '" aria-pressed="' + activo + '"><b>' + n + '</b><span>' + titulo + '</span>' + (extra ? '<small>' + esc(extra) + '</small>' : '') + '</button>';
}

/* El polling de 4 s repinta con innerHTML: sin esto se perdía lo que el usuario estaba escribiendo, las selecciones y el foco.
   El «desde» de cada idea se guarda SOLO si el usuario lo eligió (AG.desdeElegido, por el evento change): si no, se congelaba la
   sugerencia vieja (P1) cuando las puertas avanzaban y la sugerida pasaba a P3. */
const escCss = (x) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(x) : String(x).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c));
function selectorDeFoco(el) {
  if (!el || !el.dataset) return '';
  if (el.id) return '#' + escCss(el.id);
  if (el.dataset.agDesde) return '[data-ag-desde="' + el.dataset.agDesde + '"]';
  if (!el.dataset.ag) return '';
  return '[data-ag="' + el.dataset.ag + '"]' + ['id', 'v', 'f', 'r'].filter((k) => el.dataset[k]).map((k) => '[data-' + k + '="' + el.dataset[k] + '"]').join('');
}
/* Un valor solo se restaura si la opción sigue existiendo: si no, el select quedaba en blanco y mandaba desde = ''. */
const tieneOpcion = (el, v) => !el.options || Array.prototype.some.call(el.options, (o) => o.value === v);
function guardarForm() {
  const act = document.activeElement;
  const g = { campos: {}, foco: selectorDeFoco(act), sel: null };
  ['ag-texto', 'ag-sobre', 'ag-agente'].forEach((id) => { const el = $(id); if (el) g.campos[id] = el.value; });
  if (act && act.id === 'ag-texto' && act.selectionStart != null) g.sel = [act.selectionStart, act.selectionEnd];
  return g;
}
function restaurarForm(g) {
  Object.keys(g.campos).forEach((id) => { const el = $(id); if (el && tieneOpcion(el, g.campos[id])) el.value = g.campos[id]; });
  document.querySelectorAll('select[data-ag-desde]').forEach((el) => { const v = AG.desdeElegido[el.dataset.agDesde]; if (v != null && tieneOpcion(el, v)) el.value = v; });
}

function pintarAgencia(foco) {
  const guardado = guardarForm();
  const e = AG.est, nd = e.necesitaTuDecision;
  const resumen = e.resumen || (e.dia ? '' : 'Todavía no hay un informe estructurado. Corré la rutina para generar las primeras 5 ideas.');
  const frenan = e.enCurso.filter((i) => i.frenaEn).length;
  const h = '<div class="ag-barra1"><b>Agencia' + (e.dia ? ' · ' + esc(diaLindo(e.dia).slice(0, 5)) : '') + '</b><span class="ag-resumen" title="' + esc(resumen) + '">' + esc(resumen) + '</span>' +
    '<button class="ag-chico" data-ag="recargar">↻ Recargar</button><button class="pri ag-chico" data-ag="correr" title="Corre la rutina completa ahora (tarda unos 15 a 25 minutos). Sola corre todos los días a las 8:06.">▶ Correr la rutina</button></div>' +
    '<div class="ag-kpis">' + kpiAg('hoy', 'Ideas por elegir', nd.ideas, '', AG.vista === 'hoy') + kpiAg('decisiones', 'Decisiones', nd.decisiones, '', false) +
      kpiAg('curso', 'En trabajo', e.enCurso.length, frenan ? frenan + (frenan === 1 ? ' frena en una puerta' : ' frenan en una puerta') : '', AG.vista === 'curso') + kpiAg('p11', 'Por aprobar (P11)', nd.p11, '', false) + '</div>' +
    '<div class="ag-grilla">' + panelIdeas(e) + '<div class="ag-lado">' + panelDecisiones(e) + panelTrabajos(e) + panelHallazgos(e) + '</div></div>' +
    '<div class="ag-abajo">' + plegables(e) + '</div>';
  $('ag-raiz').innerHTML = h;
  restaurarForm(guardado);
  document.querySelectorAll('#ag-raiz details[data-pleg]').forEach((d) => d.addEventListener('toggle', () => { d.open ? AG.pleg.add(d.dataset.pleg) : AG.pleg.delete(d.dataset.pleg); }));
  /* Repintar destruye el botón apretado: el foco vuelve al equivalente en vez de caer en el body. */
  const aFoco = foco || guardado.foco;
  if (aFoco) {
    try {
      const el = document.querySelector(aFoco);
      if (el) { el.focus(); if (!foco && guardado.sel && el.setSelectionRange) el.setSelectionRange(guardado.sel[0], guardado.sel[1]); }
    } catch (_) { /* un selector inválido no puede cortar el polling */ }
  }
}

function dialogoEdicion(i) {
  const d = i.datos || {}, e = d.ejercicio || {};
  if (!AG.dlg) { AG.dlg = document.createElement('dialog'); AG.dlg.id = 'ag-dlg'; document.body.appendChild(AG.dlg); }
  const campo = (k, t, grande) => '<label>' + t + (grande ? '<textarea id="ed-' + k + '">' : '<input id="ed-' + k + '" value="') + esc(d[k] || '') + (grande ? '</textarea>' : '">') + '</label>';
  AG.dlg.innerHTML = '<h3>Modificar la idea</h3>' + campo('titulo', 'Título') + campo('dolor', 'Dolor del entrenador', true) + campo('dato', 'Dato de MotorStats', true) + campo('lectura', 'Lectura táctica', true) + campo('limite', 'Límite del dato', true) +
    '<label>Ejercicio sugerido<select id="ed-ef"><option' + (/reducido/.test(e.formato || '') ? ' selected' : '') + '>juego reducido</option><option' + (e.formato === 'juego completo' ? ' selected' : '') + '>juego completo</option></select></label>' +
    '<label>Variable que se manipula<input id="ed-ev" value="' + esc(e.variable || '') + '"></label><label>Descripción del ejercicio<textarea id="ed-ed">' + esc(e.descripcion || '') + '</textarea></label>' +
    '<div class="ag-btns"><button class="pri" id="ed-ok">Guardar los cambios</button><button id="ed-no">Cancelar</button></div>';
  AG.dlg.showModal();
  $('ed-no').onclick = () => AG.dlg.close();
  $('ed-ok').onclick = async () => {
    const c = { titulo: $('ed-titulo').value, dolor: $('ed-dolor').value, dato: $('ed-dato').value, lectura: $('ed-lectura').value, limite: $('ed-limite').value, ejercicio: { formato: $('ed-ef').value, variable: $('ed-ev').value, descripcion: $('ed-ed').value } };
    try { AG.est = await api('/api/agencia/accion', { id: i.id, accion: 'editar', cambios: c }); AG.dlg.close(); pintarAgencia(); } catch (err) { alert(err.message); }
  };
}

const ideaPorId = (id) => [].concat(AG.est.ideasHoy, AG.est.enCurso, AG.est.anteriores, AG.est.banco, AG.est.aprobadas).find((i) => i.id === id);

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-ag]'); if (!b || !AG.est) return;
  const a = b.dataset.ag, id = b.dataset.id;
  try {
    if (a === 'recargar') return cargarAgencia();
    if (a === 'producir') { try { AG.est = await api('/api/agencia/producir', { id }); } catch (err) { alert(err.message); } return pintarAgencia(); }
    if (a === 'correr') { if (!confirm('Corre la rutina completa ahora: lee Instagram, YouTube y los sitios, y arma 5 ideas nuevas. Tarda entre 15 y 25 minutos. ¿Seguimos?')) return; try { await api('/api/agencia/correr', {}); } catch (err) { if (!/ya corri/.test(err.message)) { alert(err.message); return; } if (!confirm(err.message)) return; try { await api('/api/agencia/correr', { forzar: true }); } catch (e2) { alert(e2.message); return; } } return cargarAgencia(); }
    if (a === 'puertas') { const sel = document.querySelector('[data-ag-desde="' + id + '"]'); const desde = sel ? sel.value : 'P1'; delete AG.desdeElegido[id]; try { await api('/api/agencia/puertas', { id, desde }); } catch (err) { alert(err.message); } return cargarAgencia(); }
    if (a === 'descartar') { const m = prompt('¿Por qué la descartás? (opcional, queda anotado en el banco)', ''); if (m === null) return; AG.est = await api('/api/agencia/accion', { id, accion: 'descartar', texto: m }); return pintarAgencia(); }
    if (a === 'restaurar' || a === 'devolver') { AG.est = await api('/api/agencia/accion', { id, accion: a }); return pintarAgencia(); }
    if (a === 'aprobar') { if (!confirm('Vas a aprobar esta pieza (puerta P11). Eso NO la publica ni la programa: solo deja constancia de tu aprobación. ¿Aprobar?')) return; AG.est = await api('/api/agencia/accion', { id, accion: 'aprobar' }); return pintarAgencia(); }
    if (a === 'editar') return dialogoEdicion(ideaPorId(id));
    if (a === 'hablar') { const d = $('ag-hablar'); if (d) d.open = true; AG.pleg.add('hablar'); $('ag-sobre').value = id; $('ag-texto').focus(); $('ag-texto').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (a === 'tog') { AG.abiertas.has(id) ? AG.abiertas.delete(id) : AG.abiertas.add(id); return pintarAgencia('[data-ag="tog"][data-id="' + id + '"]'); }
    if (a === 'vista') { AG.vista = b.dataset.v; AG.verTodas = false; return pintarAgencia('[data-ag="vista"][data-v="' + b.dataset.v + '"]'); }
    if (a === 'vermas') { const l = listaDeVista(AG.est, AG.vista).lista; AG.verTodas = true; return pintarAgencia(l[AG_TOPE] ? '[data-ag="tog"][data-id="' + l[AG_TOPE].id + '"]' : ''); }
    if (a === 'vermasdec') { AG.verDec = true; const d = AG.est.decisiones[AG_TOPE_DEC]; return pintarAgencia(d ? '[data-ag="tog"][data-id="d' + d.id + '"]' : ''); }
    if (a === 'filtro') { AG.filtro = b.dataset.f; return pintarAgencia('[data-ag="filtro"][data-f="' + b.dataset.f + '"]'); }
    if (a === 'kpi') {
      if (b.dataset.v === 'decisiones') { const d = $('ag-decisiones'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      AG.vista = b.dataset.v === 'p11' ? 'curso' : b.dataset.v; AG.verTodas = false; return pintarAgencia('[data-ag="kpi"][data-v="' + b.dataset.v + '"]');
    }
    if (a === 'decidir') { AG.abiertas.delete('d' + id); AG.est = await api('/api/agencia/decision', { id, respuesta: b.dataset.r }); return pintarAgencia(); }
    if (a === 'aplicar') { AG.est = await api('/api/agencia/aplicar', { idea: id, indice: b.dataset.k }); return pintarAgencia(); }
    if (a === 'enviar') { const t = $('ag-texto').value.trim(); if (!t) return alert('Escribí qué querés pedirle al agente.'); await api('/api/agencia/agente', { agente: $('ag-agente').value, idea: $('ag-sobre').value || null, texto: t }); $('ag-texto').value = ''; return cargarAgencia(); }
    if (a === 'instruccion') { const t = $('ag-texto').value.trim(); if (!t) return alert('Escribí el criterio.'); AG.est = await api('/api/agencia/instruccion', { texto: t }); $('ag-texto').value = ''; return pintarAgencia(); }
  } catch (err) { alert(err.message); }
});

document.addEventListener('change', (ev) => { const t = ev.target; if (t && t.dataset && t.dataset.agDesde) AG.desdeElegido[t.dataset.agDesde] = t.value; });
