/* =====================================================================
   EL INFORME DE CICLO EN HTML AUTÓNOMO · lo que se compila a PDF (Ciclos, fase 6)

   PURO: entra el ciclo que arma `SGADD_CICLOS` y las lecturas que revisó el
   analista, sale un documento A4 completo con su propio CSS. No depende de
   Tailwind ni de nada del panel: lo abre Chromium en el servidor sin red, y
   el mismo HTML sirve para mirarlo en un navegador.

   Cada número sale del ciclo (que el servidor recalcula desde el paquete); lo
   único que viaja de la edición humana son las LECTURAS, que se escapan y se
   muestran como texto. Las zonas citadas ({{Z13}}) se dibujan como etiqueta,
   no como botón.
   ===================================================================== */
'use strict';

const CI = require('./compartido/sgadd-ciclos.js');
const CA = require('./compartido/sgadd-cancha.js');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
const f1 = (v) => (v === null || v === undefined || !isFinite(v)) ? '—' : String(Math.round(v * 10) / 10).replace('.', ',');
const f2 = (v) => (v === null || v === undefined || !isFinite(v)) ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
const signo = (v, d) => (v === null || v === undefined || !isFinite(v)) ? '—' : (v > 0 ? '+' : '') + (d === 2 ? f2(v) : f1(v));
const dia = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] : esc(iso); };
const diaLargo = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : esc(iso); };

const NOMBRE_ORIGEN = { RD: 'Tras rebote defensivo', ROBO: 'Tras robo', SAQUE: 'Tras saque', MUERTA: 'Pelota muerta', PERIODO: 'Inicio de período' };

const CSS = `
@page { size: A4; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #111827; background: #fff; font: 10.5pt/1.42 'Barlow', 'Segoe UI', Arial, sans-serif; }
h1, h2, h3, .cond { font-family: 'Barlow Condensed', 'Arial Narrow', 'Segoe UI', Arial, sans-serif; text-transform: uppercase; letter-spacing: .03em; }
.marca { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid #f7941e; padding-bottom: 6px; margin-bottom: 10px; }
.marca b { font-size: 15pt; font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: .06em; }
.marca span { font-size: 9pt; color: #475569; }
h1 { font-size: 24pt; margin: 4px 0 2px; line-height: 1.05; }
.sub { color: #475569; font-size: 10pt; margin: 0 0 10px; }
h2 { font-size: 12pt; margin: 0 0 5px; border-left: 4px solid #f7941e; padding-left: 7px; }
.card { border: 1.2px solid #94a3b8; border-radius: 6px; padding: 9px 11px; margin: 0 0 9px; break-inside: avoid; }
.lectura { margin: 0 0 6px; white-space: pre-wrap; }
.lectura.ed { background: #f1f5f9; border-radius: 4px; padding: 5px 8px; }
.nota { font-size: 8.5pt; color: #475569; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th, td { padding: 3px 6px; text-align: center; border-bottom: 1px solid #e2e8f0; }
th { color: #475569; font-weight: 600; font-size: 8.5pt; text-transform: uppercase; }
td:nth-child(2), th:nth-child(2) { text-align: left; }
.g { color: #15803d; font-weight: 700; } .p { color: #b91c1c; font-weight: 700; }
.fila { margin: 0 0 6px; break-inside: avoid; }
.fila .t { display: flex; justify-content: space-between; font-size: 9pt; }
.barra { position: relative; height: 8px; background: #e2e8f0; border-radius: 4px; }
.barra i { position: absolute; top: 0; bottom: 0; border-radius: 4px; }
.liga { position: absolute; top: -2px; width: 2px; height: 12px; background: #334155; }
.mapas { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mapas h3 { font-size: 10pt; text-align: center; margin: 0 0 3px; }
.cancha-svg { max-width: 100% !important; }
.pie { margin-top: 10px; padding-top: 6px; border-top: 1px solid #cbd5e1; font-size: 8.5pt; color: #475569; display: flex; justify-content: space-between; gap: 10px; }
.zona-ref { font-weight: 700; border-bottom: 1.5px solid #f7941e; padding: 0 2px; }
`;

/** Texto de una lectura: escapado, con las zonas citadas como etiqueta. */
function textoLectura(t) {
  return esc(t).replace(/\{\{\s*(Z(?:1[0-4]|[1-9]))\s*\}\}/g, '<span class="zona-ref">$1</span>');
}

function bloqueLectura(texto, editada) {
  const t = String(texto || '').trim();
  return t ? `<p class="lectura${editada ? ' ed' : ''}">${textoLectura(t)}</p>` : '';
}

function resultados(c, lec) {
  const r = c.resultados;
  return `<section class="card"><h2>Los ${c.meta.partidos} partidos</h2>${bloqueLectura(lec.resumen, true)}
    <table><thead><tr><th>Fecha</th><th>Rival</th><th>Cond.</th><th>Marcador</th><th>Res.</th></tr></thead><tbody>
    ${r.partidos.map(p => `<tr><td>${dia(p.fecha)}</td><td>${esc(p.rival)}</td><td>${p.condicion === 'LOCAL' ? 'L' : 'V'}</td>
      <td>${p.final[0]} - ${p.final[1]}</td><td class="${p.resultado === 'G' ? 'g' : 'p'}">${p.resultado === 'G' ? '✓ G' : '✗ P'}</td></tr>`).join('')}
    </tbody></table>
    <p class="nota">${r.record.g}-${r.record.p} · ${f1(r.puntos.favorPP)} a favor y ${f1(r.puntos.contraPP)} en contra por partido (${signo(r.puntos.dif)} en el ciclo).</p></section>`;
}

function transicion(c, lec) {
  const t = c.transicion;
  const max = Math.max(0.01, ...CI.ORIGENES.map(o => Math.max(t.porOrigen[o].ptsPP, (t.porOrigen[o].liga || {}).ptsPP || 0)));
  const filas = CI.ORIGENES.filter(o => t.porOrigen[o].tiros || t.porOrigen[o].perd).map((o) => {
    const x = t.porOrigen[o];
    const w = Math.round(100 * x.ptsPP / max), wl = x.liga ? Math.round(100 * x.liga.ptsPP / max) : null;
    const sobre = x.exceso === undefined ? '' : ` · ${signo(x.exceso, 2)} vs liga ${x.exceso > 0.15 ? '▲' : x.exceso < -0.15 ? '▼' : '●'}`;
    return `<div class="fila"><div class="t"><span>${NOMBRE_ORIGEN[o]}</span><span>${f2(x.ptsPP)} pts/partido${sobre}</span></div>
      <div class="barra"><i style="left:0;width:${w}%;background:#f7941e"></i>${wl === null ? '' : `<span class="liga" style="left:${wl}%"></span>`}</div>
      <div class="nota">${x.tiros} tiros (${x.conv} convertidos) · ${x.perd} pérdidas propias del rival</div></div>`;
  }).join('');
  return `<section class="card"><h2>Lo que el rival hace en los primeros 7 segundos</h2>${bloqueLectura(lec.transicion, true)}
    <p class="nota">Puntos por partido del rival según cómo nació su posesión; el trazo oscuro es la media de la liga.</p>
    ${filas || '<p class="nota">Sin finales en 0-7 s en el ciclo.</p>'}
    ${t.sinVara ? '<p class="nota">Este análisis no trae la vara de la liga: no se compara.</p>' : ''}
    <p class="nota">Total: <b>${f2(t.ptsPP)}</b> pts por partido.</p></section>`;
}

function cuartos(c, lec) {
  const mx = Math.max(1, ...c.cuartos.map(q => Math.abs(q.parcial.dif)));
  return `<section class="card"><h2>Cuarto a cuarto</h2>${bloqueLectura(lec.cuartos, true)}
    ${c.cuartos.map((q) => {
      const d = q.parcial.dif, w = Math.round(50 * Math.abs(d) / mx);
      const color = d > 0 ? '#16a34a' : d < 0 ? '#dc2626' : '#94a3b8';
      return `<div class="fila"><div class="t"><span>Q${q.cuarto}${q.cuarto === 4 ? ' (con suplementario)' : ''}</span>
        <span>${q.parcial.favor}-${q.parcial.contra} · <b>${signo(d)}</b> ${d > 0 ? '▲' : d < 0 ? '▼' : '●'}</span></div>
        <div class="barra"><i style="${d >= 0 ? 'left:50%' : 'right:50%'};width:${w}%;background:${color}"></i><span class="liga" style="left:50%;width:1px"></span></div>
        <div class="nota">Ataque: ${q.favor.pts} pts de tiro de campo, esperados ${f1(q.favor.esperados)} (${signo(q.favor.dif)}) · Defensa: concede ${q.contra.pts}, esperados ${f1(q.contra.esperados)} (${signo(q.contra.dif)})</div></div>`;
    }).join('')}</section>`;
}

function mapas(c, lec) {
  const contra = CA.svg({ tiros: c.mapa.contra, resaltar: c.resaltar, interactivo: false, rotulo: 'Tiros que concede el equipo' });
  const favor = CA.svg({ tiros: c.mapa.favor, resaltar: (c.zonas.propiasBajas || []).slice(0, 2).map(z => ({ id: z.zona, punteado: z.i < CI.MIN_TIROS_ZONA })), interactivo: false, rotulo: 'Tiros del equipo' });
  return `<section class="card"><h2>Mapa de tiro del ciclo</h2>${bloqueLectura(lec.zonas, true)}
    <div class="mapas"><div><h3>Lo que concede</h3>${contra.svg}</div><div><h3>Lo que tira</h3>${favor.svg}</div></div>
    ${CA.leyenda()}
    ${c.mapa.completo ? '' : `<p class="nota">El mapa con círculos y cruces usa ${c.mapa.conPuntos} de ${c.mapa.de} partidos: el análisis conserva solo los últimos.</p>`}</section>`;
}

function causas(c) {
  const k = c.causas, top = k.jugadores.slice(0, 3);
  return `<section class="card"><h2>Qué las genera</h2>
    <p style="margin:0">${k.nROBO} salidas tras robo y ${k.nRD} tras rebote rival que terminaron en tiro.</p>
    ${top.length ? `<ul style="margin:4px 0 0 16px;padding:0">${top.map(j => `<li>${esc(j.nombre)}: <b>${j.perdidas}</b> pérdidas que valieron <b>${j.puntosRival}</b> pts al rival</li>`).join('')}</ul>` : ''}
    <p class="nota">Tiros errados previos al rebote rival: ${k.falladosPrevios.dobles.n} dobles (${k.falladosPrevios.dobles.pts} pts) y ${k.falladosPrevios.triples.n} triples (${k.falladosPrevios.triples.pts} pts).</p></section>`;
}

/**
 * El documento completo.
 * @param {object} c       el ciclo (`SGADD_CICLOS.armarVentana`)
 * @param {object} o       { lecturas, equipo, huella, publicado, auditado }
 * @returns {{html:string, titulo:string, archivo:string}}
 */
function construir(c, o) {
  const op = o || {};
  const lec = CI.limpiarLecturas(op.lecturas || {});
  const equipo = op.equipo || c.meta.equipo || 'Equipo';
  const ciclo = c.meta.tipo === 'ciclo' && c.meta.numero !== null ? 'Ciclo ' + c.meta.numero : 'Ventana libre';
  const titulo = `${equipo} · ${ciclo} · ${diaLargo(c.meta.desde)} al ${diaLargo(c.meta.hasta)}`;
  const cierre = lec.cierre
    ? `<section class="card"><h2>${esc((CI.LECTURAS.find(l => l.id === 'cierre') || {}).titulo || 'Cierre')}</h2>${bloqueLectura(lec.cierre, true)}</section>` : '';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS}</style></head><body>
    <div class="marca"><b>MotorStats AR</b><span>Informe de ciclo de ${c.meta.n} partidos${c.meta.competencia ? ' · ' + esc(c.meta.competencia) : ''}</span></div>
    <h1>${esc(equipo)}</h1>
    <p class="sub">${esc(ciclo)} · ${diaLargo(c.meta.desde)} al ${diaLargo(c.meta.hasta)} · ${c.resultados.record.g} ganados y ${c.resultados.record.p} perdidos</p>
    ${resultados(c, lec)}${transicion(c, lec)}
    ${cuartos(c, lec)}${mapas(c, lec)}${causas(c)}${cierre}
    <div class="pie"><span>Generado por MotorStats AR · los números salen del análisis del play-by-play; las lecturas las revisó el cuerpo de análisis.</span>
      <span>${op.huella ? 'Huella ' + esc(op.huella) : ''}</span></div>
  </body></html>`;
  const archivo = ('Ciclo ' + (c.meta.numero === null ? 'libre' : c.meta.numero) + ' - ' + equipo + '.pdf').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { html, titulo, archivo };
}

module.exports = { construir, textoLectura, CSS };
