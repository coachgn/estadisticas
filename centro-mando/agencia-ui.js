'use strict';
/* =====================================================================
   El tablero de la agencia (pestaña «Agencia»). Usa $, esc y api() de la
   página. Todo lo que muestra sale de /api/agencia; las acciones van a
   /api/agencia/*. Nada se publica desde acá.
   ===================================================================== */
const AG = { est: null, abiertas: new Set(), filtro: 'todos', temporizador: null, dlg: null };

(function estilos() {
  const s = document.createElement('style');
  s.textContent = `
  .ag-fila { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  .ag-decide { border:2px solid var(--nar); background:rgba(245,166,35,.07); }
  .ag-cont { display:flex; gap:10px; flex-wrap:wrap; margin:6px 0 12px; }
  .ag-num { border:1px solid var(--borde); border-radius:10px; padding:8px 14px; min-width:150px; background:#0b1c35; }
  .ag-num b { font-size:26px; display:block; line-height:1.1; }
  .ag-num.hay { border-color:var(--nar); } .ag-num.hay b { color:var(--nar); }
  .ag-idea { border:1px solid var(--borde); border-radius:10px; padding:12px 14px; margin:10px 0; background:#0b1c35; }
  a.btn { display:inline-flex; align-items:center; padding:8px 10px; min-height:40px; border:1px solid var(--borde); border-radius:6px; background:#0b1c35; color:var(--tinta); font-weight:600; text-decoration:none; margin:2px 4px 2px 0; }
  a.btn.pri { background: var(--cel); color:#08162b; border-color: var(--cel); }
  .ag-idea.top { border-color:var(--cel); }
  .ag-rank { font-size:22px; font-weight:800; color:var(--cel); min-width:38px; }
  .ag-barra { height:8px; border-radius:6px; background:#06101f; overflow:hidden; min-width:120px; flex:1; max-width:260px; }
  .ag-barra i { display:block; height:100%; }
  .ag-prob { font-weight:700; min-width:48px; }
  .ag-btns { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
  .ag-btns button { min-height:34px; padding:4px 12px; font-size:14px; }
  .ag-det { margin-top:8px; display:grid; gap:8px; }
  .ag-det p { margin:0; } .ag-det b { color:var(--tenue); font-size:12px; text-transform:uppercase; letter-spacing:.5px; display:block; }
  .ag-puertas { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0; }
  .ag-pt { border:1px solid var(--borde); border-radius:8px; padding:3px 9px; font-size:13px; cursor:help; }
  .ag-pt.ok { color:var(--ver); border-color:var(--ver); } .ag-pt.frena { color:var(--roj); border-color:var(--roj); font-weight:700; } .ag-pt.sin { color:var(--tenue); }
  .ag-nota { border-left:3px solid var(--cel); padding:6px 10px; margin:6px 0; background:rgba(116,172,223,.07); border-radius:0 6px 6px 0; font-size:14px; }
  .ag-nota small { color:var(--tenue); display:block; }
  .ag-hall { border:1px solid var(--borde); border-radius:10px; padding:10px 12px; background:#0b1c35; }
  .ag-hall.alta { border-color:var(--nar); }
  .ag-hall h4 { margin:0 0 4px; text-transform:none; letter-spacing:0; font-size:15px; color:var(--tinta); }
  .ag-dec { border:1px solid var(--nar); border-radius:10px; padding:10px 12px; margin:8px 0; background:#0b1c35; }
  .ag-trab { font-size:13px; padding:4px 0; border-bottom:1px solid var(--borde); }
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

function tarjetaIdea(i, modo) {
  const d = i.datos || {}, p = Number(d.probabilidad);
  const abierta = AG.abiertas.has(i.id) ? ' open' : '';
  let botones = '';
  if (modo === 'nueva') botones = '<button class="pri" data-ag="puertas" data-id="' + esc(i.id) + '">✅ Elegir y pasar por las puertas</button><button data-ag="editar" data-id="' + esc(i.id) + '">✏️ Modificar</button><button data-ag="hablar" data-id="' + esc(i.id) + '">💬 Pedir algo a un agente</button><button data-ag="descartar" data-id="' + esc(i.id) + '">🗑 Descartar (al banco)</button>';
  else if (modo === 'curso') botones = '<button class="pri" data-ag="aprobar" data-id="' + esc(i.id) + '">✅ Aprobar (P11 · no publica)</button><button data-ag="puertas" data-id="' + esc(i.id) + '">🔁 Volver a pasar por las puertas</button>' + selectorDesde(i) + '<button data-ag="editar" data-id="' + esc(i.id) + '">✏️ Modificar</button><button data-ag="hablar" data-id="' + esc(i.id) + '">💬 Pedir algo a un agente</button><button data-ag="descartar" data-id="' + esc(i.id) + '">🗑 Descartar</button>';
  else if (modo === 'banco') botones = '<button data-ag="restaurar" data-id="' + esc(i.id) + '">↩️ Restaurar</button><button data-ag="hablar" data-id="' + esc(i.id) + '">💬 Pedir algo a un agente</button>';
  else if (modo === 'aprobada') botones = (i.pieza && i.pieza.archivos && i.pieza.archivos.length ? ((i.pieza.archivos.includes('carrusel.html') ? '<a class="btn pri" target="_blank" href="/agencia/piezas/' + esc(i.id) + '/carrusel.html">👁 Ver la pieza (carrusel)</a>' : '') + (i.pieza.archivos.includes('copy.md') ? '<a class="btn" target="_blank" href="/agencia/piezas/' + esc(i.id) + '/copy.md">📝 Copy</a>' : '') + (i.pieza.archivos.includes('notas.md') ? '<a class="btn" target="_blank" href="/agencia/piezas/' + esc(i.id) + '/notas.md">🔎 Cómo se validó</a>' : '') + '<button data-ag="producir" data-id="' + esc(i.id) + '">🔁 Producir de nuevo</button>') : '<button class="pri" data-ag="producir" data-id="' + esc(i.id) + '">▶ Producir la pieza</button>') + '<button data-ag="devolver" data-id="' + esc(i.id) + '">↩️ Devolver a trabajo</button>';
  const corre = AG.est.trabajos.some((t) => t.estado === 'corriendo' && t.idea === i.id);
  return '<div class="ag-idea' + (i.rank === 1 && modo === 'nueva' ? ' top' : '') + '">' +
    '<div class="ag-fila"><span class="ag-rank">#' + esc(i.rank) + '</span>' +
    '<div style="flex:1;min-width:220px"><strong style="font-size:17px">' + esc(d.titulo) + '</strong>' +
    '<div class="tenue" style="font-size:13px">' + diaLindo(i.dia) + ' · ' + esc(d.formato || '') + ' · ' + esc((d.ejercicio || {}).formato || '') + '</div></div>' +
    (isFinite(p) ? '<span class="ag-prob" style="color:' + colorProb(p) + '" title="Probabilidad estimada de que funcione">' + p + ' %</span><div class="ag-barra" title="Probabilidad estimada de que funcione"><i style="width:' + Math.max(2, Math.min(100, p)) + '%;background:' + colorProb(p) + '"></i></div>' : '') + '</div>' +
    '<p style="margin:8px 0 0">' + esc(d.dolor || '') + '</p>' +
    chipsPuertas(i) + notasDe(i) +
    (corre ? '<div class="aviso">⏳ Los agentes están trabajando en esta idea…</div>' : '') +
    '<details data-id="' + esc(i.id) + '"' + abierta + '><summary>Ver el detalle completo</summary>' + detalle(i) + '</details>' +
    '<div class="ag-btns">' + botones + '</div></div>';
}

function pintarAgencia() {
  const e = AG.est, nd = e.necesitaTuDecision;
  const numero = (n, t) => '<div class="ag-num' + (n ? ' hay' : '') + '"><b>' + n + '</b>' + t + '</div>';
  let h = '<div class="card"><div class="ag-fila"><div style="flex:1;min-width:240px"><h2 style="margin:0">Tablero de la agencia' + (e.dia ? ' · ' + diaLindo(e.dia) : '') + '</h2>' +
    '<p style="margin:4px 0 0">' + esc(e.resumen || (e.dia ? '' : 'Todavía no hay un informe estructurado. Corré la rutina para generar las primeras 5 ideas.')) + '</p></div>' +
    '<button data-ag="recargar">↻ Recargar</button><button class="pri" data-ag="correr" title="Corre la rutina completa ahora (tarda unos 15 a 25 minutos). Sola corre todos los días a las 8:06.">▶ Correr la rutina ahora</button></div></div>';

  h += '<div class="card ag-decide"><h2>Lo que necesita tu decisión</h2><div class="ag-cont">' +
    numero(nd.ideas, 'ideas de hoy por elegir') + numero(nd.decisiones, 'decisiones (sí / no)') + numero(nd.p11, 'piezas esperando tu aprobación') + '</div>';
  if (e.decisiones.length) {
    h += '<h4>Decisiones para vos</h4>' + e.decisiones.map((d) => '<div class="ag-dec"><span class="chip">' + esc(d.tipo) + '</span> <strong>' + esc(d.texto) + '</strong>' +
      (d.recomendacion ? '<div class="tenue" style="margin-top:4px">Recomendación de los agentes: ' + esc(d.recomendacion) + '</div>' : '') +
      '<div class="ag-btns"><button class="pri" data-ag="decidir" data-id="' + esc(d.id) + '" data-r="si">Sí</button><button data-ag="decidir" data-id="' + esc(d.id) + '" data-r="no">No</button><button data-ag="decidir" data-id="' + esc(d.id) + '" data-r="despues">Después</button></div></div>').join('');
  } else h += '<p class="tenue">No hay decisiones pendientes.</p>';
  h += '</div>';

  const hoy = e.ideasHoy.filter((i) => i.estado === 'nueva');
  h += '<div class="card"><h2>5 ideas de hoy · de más a menos probable</h2>' +
    (hoy.length ? hoy.map((i) => tarjetaIdea(i, 'nueva')).join('') : '<p class="tenue">' + (e.ideasHoy.length ? 'Ya resolviste todas las ideas de hoy.' : 'Sin ideas todavía.') + ' Las de mañana llegan solas.</p>') +
    (e.anteriores.length ? '<details><summary>Ideas de días anteriores que quedaron sin resolver (' + e.anteriores.length + ')</summary>' + e.anteriores.map((i) => tarjetaIdea(i, 'nueva')).join('') + '</details>' : '') + '</div>';

  h += '<div class="card"><h2>En trabajo · pasando por las puertas</h2>' + (e.enCurso.length ? e.enCurso.map((i) => tarjetaIdea(i, 'curso')).join('') : '<p class="tenue">Ninguna idea en curso. Elegí una arriba y los agentes la revisan puerta por puerta.</p>') + '</div>';
  if (e.aprobadas.length) h += '<div class="card"><h2>Aprobadas por vos (P11)</h2><p class="tenue">Al aprobar, los agentes producen la pieza solos (tarda unos minutos). No se publica ni se programa nada: la revisás acá y la publicás vos.</p>' + e.aprobadas.map((i) => tarjetaIdea(i, 'aprobada')).join('') + '</div>';

  const hall = e.hallazgos.filter((x) => AG.filtro === 'todos' || x.tipo === AG.filtro || (AG.filtro === 'alta' && x.relevancia === 'alta'));
  h += '<div class="card"><div class="ag-fila"><h2 style="margin:0;flex:1">Qué encontraron hoy los agentes</h2><label class="fila">Ver <select id="ag-filtro">' +
    ['todos|Todo', 'alta|Solo lo importante', 'competencia|Competencia', 'fuente|Fuentes y bibliografía', 'plataforma|Nuestra plataforma', 'mercado|Mercado'].map((o) => { const [v, t] = o.split('|'); return '<option value="' + v + '"' + (AG.filtro === v ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label></div>' +
    '<div class="tres" style="margin-top:12px">' + (hall.length ? hall.map((x) => '<div class="ag-hall ' + esc(x.relevancia) + '"><span class="chip ' + (x.relevancia === 'alta' ? 'id' : '') + '">' + esc(x.tipo) + ' · ' + esc(x.relevancia) + '</span><h4>' + esc(x.titulo) + '</h4><div style="font-size:14px">' + esc(x.detalle) + '</div>' +
      (x.accionSugerida ? '<div class="aviso" style="font-size:13px">➜ ' + esc(x.accionSugerida) + '</div>' : '') +
      '<div class="tenue" style="font-size:12px">' + esc(x.fuente || '') + (x.fecha ? ' · ' + esc(x.fecha) : '') + (x.url ? ' · <a href="' + esc(x.url) + '" target="_blank" rel="noopener" style="color:var(--cel)">abrir</a>' : '') + '</div></div>').join('') : '<p class="tenue">Nada para mostrar con este filtro.</p>') + '</div>' +
    (e.noPudeVer.length ? '<details><summary>Lo que no pudieron ver (' + e.noPudeVer.length + ')</summary><ul>' + e.noPudeVer.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></details>' : '') + '</div>';

  h += '<div class="card"><h2>Hablar con los agentes</h2><p class="tenue" style="margin-top:0">Pedile, recomendá o corregí. El agente responde con criterio de su rol y, si propone un cambio, vos decidís si lo aplicás. No publican nada.</p>' +
    '<div class="grilla"><label>Agente<select id="ag-agente">' + Object.keys(e.agentes).map((k) => '<option value="' + k + '">' + esc(e.agentes[k]) + '</option>').join('') + '</select></label>' +
    '<label>Sobre qué idea<select id="ag-sobre"><option value="">Ninguna en particular</option>' + e.ideasHoy.concat(e.enCurso, e.anteriores, e.banco).filter((v, k, a) => a.findIndex((z) => z.id === v.id) === k).map((i) => '<option value="' + esc(i.id) + '">#' + i.rank + ' · ' + esc((i.datos || {}).titulo || '').slice(0, 70) + '</option>').join('') + '</select></label></div>' +
    '<label style="margin-top:8px">Qué querés<textarea id="ag-texto" maxlength="1500" placeholder="Ej.: Revisá si esta idea no expone a ningún club cliente. / Proponé otro juego reducido. / Recomiendo que la serie arranque con el reloj de posesión."></textarea></label>' +
    '<div class="ag-btns"><button class="pri" data-ag="enviar">Enviar al agente</button><button data-ag="instruccion" title="Queda guardada y la rutina diaria la lee antes de proponer las ideas de mañana">📌 Dejar como criterio para las próximas ideas</button></div>' +
    (e.trabajos.length ? '<h4 style="margin-top:14px">Trabajos de los agentes</h4>' + e.trabajos.map((t) => '<div class="ag-trab">' + (t.estado === 'corriendo' ? '⏳' : t.estado === 'listo' ? '✅' : '⚠️') + ' <b>' + esc(t.tipo === 'puertas' ? 'Puertas' : t.tipo === 'rutina' ? 'Rutina diaria' : (e.agentes[t.agente] || 'Agente')) + '</b> · ' + fechaCorta(t.inicio) + ' · ' + esc(t.estado === 'corriendo' ? 'trabajando…' : (t.error || t.resumen || 'listo')) + '</div>').join('') : '') +
    (e.instrucciones.length ? '<h4 style="margin-top:14px">Criterios y decisiones recientes</h4>' + e.instrucciones.map((x) => '<div class="ag-trab"><span class="tenue">' + fechaCorta(x.cuando) + ' · ' + esc(x.de) + '</span> — ' + esc(x.texto) + '</div>').join('') : '') + '</div>';

  h += '<div class="card"><h2>Banco de ideas · ' + e.banco.length + ' de reserva</h2><p class="tenue" style="margin-top:0">Lo que descartás no se pierde: queda acá para cuando las ideas nuevas no funcionen.</p>' +
    (e.banco.length ? e.banco.map((i) => tarjetaIdea(i, 'banco')).join('') : '<p class="tenue">El banco está vacío.</p>') + '</div>';
  if (e.informes.length) h += '<p class="tenue" style="font-size:12px">Informes completos en contenido/vigilancia/: ' + e.informes.map(esc).join(' · ') + '</p>';
  const cs = AG.consumo || [];
  h += '<div class="card"><h2>Consumo de la rutina (plan de Claude)</h2>' + (cs.length ? '<div class="ag-cont">' + cs.map((c) => '<div class="ag-fila"><b>' + esc(c.fecha) + '</b> · ' + esc(c.tipo) + ' · ' + esc(c.modelo || '') + ' · ' + Math.round((Number(c.entrada || 0) + Number(c.cacheLeido || 0) + Number(c.cacheEscrito || 0) + Number(c.salida || 0)) / 1000) + ' mil tokens · ' + Math.round(Number(c.segundos || 0) / 60) + ' min</div>').join('') + '</div>' : '<p>Todavía no hay corridas registradas con el ejecutor nuevo.</p>') + '<p style="margin:6px 0 0">Sola corre una vez por día (la semanal, los lunes). Repetirla el mismo día pide confirmación.</p></div>';
  $('ag-raiz').innerHTML = h;
  const f = $('ag-filtro'); if (f) f.onchange = () => { AG.filtro = f.value; pintarAgencia(); };
  document.querySelectorAll('#ag-raiz details[data-id]').forEach((d) => d.addEventListener('toggle', () => { d.open ? AG.abiertas.add(d.dataset.id) : AG.abiertas.delete(d.dataset.id); }));
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
    if (a === 'puertas') { const sel = document.querySelector('[data-ag-desde="' + id + '"]'); const desde = sel ? sel.value : 'P1'; try { await api('/api/agencia/puertas', { id, desde }); } catch (err) { alert(err.message); } return cargarAgencia(); }
    if (a === 'descartar') { const m = prompt('¿Por qué la descartás? (opcional, queda anotado en el banco)', ''); if (m === null) return; AG.est = await api('/api/agencia/accion', { id, accion: 'descartar', texto: m }); return pintarAgencia(); }
    if (a === 'restaurar' || a === 'devolver') { AG.est = await api('/api/agencia/accion', { id, accion: a }); return pintarAgencia(); }
    if (a === 'aprobar') { if (!confirm('Vas a aprobar esta pieza (puerta P11). Eso NO la publica ni la programa: solo deja constancia de tu aprobación. ¿Aprobar?')) return; AG.est = await api('/api/agencia/accion', { id, accion: 'aprobar' }); return pintarAgencia(); }
    if (a === 'editar') return dialogoEdicion(ideaPorId(id));
    if (a === 'hablar') { $('ag-sobre').value = id; $('ag-texto').focus(); $('ag-texto').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (a === 'decidir') { AG.est = await api('/api/agencia/decision', { id, respuesta: b.dataset.r }); return pintarAgencia(); }
    if (a === 'aplicar') { AG.est = await api('/api/agencia/aplicar', { idea: id, indice: b.dataset.k }); return pintarAgencia(); }
    if (a === 'enviar') { const t = $('ag-texto').value.trim(); if (!t) return alert('Escribí qué querés pedirle al agente.'); await api('/api/agencia/agente', { agente: $('ag-agente').value, idea: $('ag-sobre').value || null, texto: t }); $('ag-texto').value = ''; return cargarAgencia(); }
    if (a === 'instruccion') { const t = $('ag-texto').value.trim(); if (!t) return alert('Escribí el criterio.'); AG.est = await api('/api/agencia/instruccion', { texto: t }); $('ag-texto').value = ''; return pintarAgencia(); }
  } catch (err) { alert(err.message); }
});
