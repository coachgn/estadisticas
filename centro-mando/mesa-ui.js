'use strict';
/* =====================================================================
   La Mesa de control (pestaña «Mesa»). Usa $, esc y api() de la página.
   Es de SOLO LECTURA: pide /api/mesa y pinta. El comando de arreglo se
   muestra como texto para copiar; ningún botón ejecuta nada.
   ===================================================================== */
(function estilos() {
  const s = document.createElement('style');
  s.textContent = `
  .ms-cols { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:14px; align-items:start; }
  @media (max-width: 900px) { .ms-cols { grid-template-columns:1fr; } }
  .ms-col h3 { margin:0 0 8px; }
  .ms-item { border:1px solid var(--borde); border-radius:10px; padding:10px 12px; margin:8px 0; background:#0b1c35; }
  .ms-item.rompe { border-color:var(--roj); } .ms-item.riesgo { border-color:var(--nar); }
  .ms-item b { display:block; }
  .ms-item p { margin:4px 0; color:var(--tenue); font-size:14px; }
  .ms-item code { display:block; margin-top:6px; padding:4px 8px; background:#06101f; border-radius:6px; user-select:all; overflow-wrap:anywhere; }
  .ms-fuentes { display:flex; gap:8px; flex-wrap:wrap; margin:6px 0; }
  `;
  document.head.appendChild(s);
})();

const MS_ROTULO = { rompe: 'Rompe', riesgo: 'Riesgo', info: 'Info' };
function itemMesa(it) {
  return '<div class="ms-item ' + esc(it.gravedad) + '"><span class="chip">' + esc(MS_ROTULO[it.gravedad] || it.gravedad) + ' · ' + esc(it.origen) + '</span>' +
    '<b>' + esc(it.titulo) + '</b>' + (it.detalle ? '<p>' + esc(it.detalle) + '</p>' : '') +
    (it.comando ? '<code>' + esc(it.comando) + '</code>' : '') + '</div>';
}
function columnaMesa(titulo, lista, vacio) {
  return '<div class="ms-col"><h3>' + esc(titulo) + ' <span class="chip">' + esc(lista.length) + '</span></h3>' +
    (lista.length ? lista.map(itemMesa).join('') : '<p class="tenue">' + esc(vacio) + '</p>') + '</div>';
}
function pintarMesa(m) {
  const caidas = Object.keys(m.fuentes).filter((k) => !m.fuentes[k].ok);
  const hora = new Date(m.generado);
  $('ms-raiz').innerHTML =
    '<div class="card"><div class="ag-fila">' +
      '<span>Generado a las <b>' + esc(isNaN(hora) ? '' : hora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })) + '</b>' + (m.deCache ? ' <span class="chip">de caché (5 min)</span>' : '') + '</span>' +
      '<button id="ms-actualizar" class="chico" title="Vuelve a leer todas las fuentes. Es una lectura: no cambia nada.">Actualizar</button></div>' +
      (caidas.length ? '<div class="ms-fuentes">' + caidas.map((k) => '<span class="chip" title="' + esc(m.fuentes[k].error) + '">' + esc(k) + ' · ' + esc(m.fuentes[k].error) + '</span>').join('') + '</div>' : '') +
    '</div>' +
    '<div class="ms-cols">' + columnaMesa('Decidí hoy', m.decidiHoy, 'Nada espera una decisión.') +
      columnaMesa('Corre solo', m.correSolo, 'Sin rutinas a la vista.') + columnaMesa('Datos', m.datos, 'Sin datos de contexto.') + '</div>';
  $('ms-actualizar').onclick = () => cargarMesa(true);
}
async function cargarMesa(fresco) {
  $('ms-raiz').innerHTML = '<p class="tenue">Leyendo las fuentes… puede tardar hasta un minuto y medio.</p>';
  try { pintarMesa(await api('/api/mesa' + (fresco ? '?fresco=1' : ''))); }
  catch (e) { $('ms-raiz').innerHTML = '<div class="aviso error">No pude leer la mesa: ' + esc(e.message) + '</div>'; }
}
