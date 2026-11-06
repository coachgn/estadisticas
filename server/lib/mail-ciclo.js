/* =====================================================================
   EL MAIL DEL INFORME DE CICLO (Ciclos, fase 6) · PURO

   Un cuerpo corto con el resumen y el PDF adjunto (lo arma mail-envio). Va
   a cada mail del padrón del club por separado: nadie ve a los demás
   destinatarios. HTML de mail (tablas, estilos en línea) y texto plano.
   ===================================================================== */
'use strict';

const { REMITENTE, PANEL_URL, INSTAGRAM, esc } = require('./mail-plantillas.js');

/** AAAA-MM-DD → DD/MM/AAAA. Lo que no es una fecha ISO pasa tal cual. */
function fechaMail(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(v || '');
}
const coma = (n) => String(n).replace('.', ',');
const conSigno = (n) => (n > 0 ? '+' : '') + coma(Math.round(n * 10) / 10);

/** Los números del ciclo para las fichas del mail (2026-11-06). */
function numerosCiclo(ciclo) {
  if (!ciclo || !ciclo.resultados || !ciclo.meta) return null;
  const r = ciclo.resultados, pj = ciclo.meta.partidos || 0;
  return { pj, g: r.record.g, p: r.record.p, pf: r.puntos.favorPP, pc: r.puntos.contraPP, dif: r.puntos.dif,
    difPP: pj ? Math.round(10 * r.puntos.dif / pj) / 10 : null };
}

/* Bento del mail: tablas y estilos en línea (los clientes de correo no leen
   grid ni flex). Fichas oscuras como las del panel; el tono va con su glifo,
   nunca solo el color. Dos por fila para que entren en un teléfono. */
const TONO = { bien: '#4ade80', mal: '#f87171', neutro: '#f5f4f2' };
function ficha(f) {
  return `<td width="50%" valign="top" style="padding:5px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#141414;border:1px solid #282828;border-radius:10px;">
<tr><td style="padding:12px 14px;">
<div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">${esc(f.rotulo)}</div>
<div style="font-size:24px;font-weight:700;line-height:1.2;color:${TONO[f.tono] || TONO.neutro};margin-top:4px;">${esc(f.valor)}</div>
<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${esc(f.nota || '')}</div>
</td></tr></table></td>`;
}
function bentoHtml(n) {
  if (!n) return '';
  const tono = (x) => (x > 0 ? 'bien' : x < 0 ? 'mal' : 'neutro');
  const glifo = (x) => (x > 0 ? '▲' : x < 0 ? '▼' : '●');
  const fichas = [
    { rotulo: 'Récord', valor: n.g + '-' + n.p, nota: glifo(n.g - n.p) + ' en ' + n.pj + ' partidos', tono: tono(n.g - n.p) },
    { rotulo: 'Diferencia', valor: conSigno(n.dif), nota: glifo(n.dif) + ' en el ciclo' + (n.difPP === null ? '' : ' · ' + conSigno(n.difPP) + ' por partido'), tono: tono(n.dif) },
    { rotulo: 'Puntos a favor', valor: coma(n.pf), nota: 'por partido', tono: 'neutro' },
    { rotulo: 'Puntos en contra', valor: coma(n.pc), nota: 'por partido', tono: 'neutro' },
  ];
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;background:#0b1121;border-radius:12px;">
<tr><td style="padding:7px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>${ficha(fichas[0])}${ficha(fichas[1])}</tr><tr>${ficha(fichas[2])}${ficha(fichas[3])}</tr></table></td></tr></table>`;
}

/**
 * @param {{equipo, club, ciclo, desde, hasta, record, lectura, panel, numeros}} d
 *   `numeros`: lo de numerosCiclo(), va en fichas. `lectura`: el resumen
 *   EDITADO por el cuerpo de análisis (texto plano, opcional): el automático
 *   ya lo dicen las fichas.
 */
function mailCiclo(d) {
  const equipo = d.equipo || 'tu equipo';
  const desde = fechaMail(d.desde), hasta = fechaMail(d.hasta);
  const asunto = `Informe ${d.ciclo || 'de ciclo'} · ${equipo} · ${desde} al ${hasta}`;
  const url = d.panel || PANEL_URL;
  const saludo = d.nombre ? 'Hola, ' + d.nombre : 'Hola';
  const resumen = String(d.lectura || '').trim();
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:0;background:#eef0f3;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef0f3;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<tr><td style="background:#0b1121;padding:18px 26px;"><span style="font-size:18px;font-weight:700;letter-spacing:.08em;color:#f7941e;text-transform:uppercase;">MotorStats AR</span>
  <span style="font-size:12px;color:#94a3b8;margin-left:10px;">Informe de ciclo</span></td></tr>
<tr><td style="padding:24px 26px;">
<p style="margin:0 0 12px;font-size:16px;font-weight:700;">${esc(saludo)}:</p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5;">Te enviamos el informe de <b>${esc(d.ciclo || 'ciclo')}</b> de <b>${esc(equipo)}</b>, del ${esc(desde)} al ${esc(hasta)}${!d.numeros && d.record ? ` (${esc(d.record)})` : ''}. Está adjunto en PDF.</p>
${bentoHtml(d.numeros)}
${resumen ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;padding:10px 12px;background:#f1f5f9;border-left:4px solid #f7941e;border-radius:4px;">${esc(resumen)}</p>` : ''}
<p style="margin:0 0 6px;font-size:13px;color:#475569;">Los números salen del análisis del play-by-play; las lecturas las revisó el cuerpo de análisis de MotorStats. También lo ves en tu panel: <a href="${esc(url)}" style="color:#b45309;">${esc(url)}</a></p>
</td></tr>
<tr><td style="padding:14px 26px;background:#f8fafc;font-size:12px;color:#64748b;">Consultas: ${esc(REMITENTE)} · Instagram @${esc(INSTAGRAM)}<br>Recibís este mail porque ${esc(d.club || 'tu club')} tiene el plan Oro de MotorStats.</td></tr>
</table></td></tr></table></body></html>`;
  const texto = `${saludo}:

Te enviamos el informe de ${d.ciclo || 'ciclo'} de ${equipo}, del ${desde} al ${hasta}${d.record ? ' (' + d.record + ')' : ''}. Está adjunto en PDF.
${d.numeros ? `\nRécord ${d.numeros.g}-${d.numeros.p} en ${d.numeros.pj} partidos · Diferencia ${conSigno(d.numeros.dif)} · ${coma(d.numeros.pf)} a favor y ${coma(d.numeros.pc)} en contra por partido.\n` : ''}${resumen ? '\n' + resumen + '\n' : ''}
Los números salen del análisis del play-by-play; las lecturas las revisó el cuerpo de análisis de MotorStats.
Tu panel: ${url}

Consultas: ${REMITENTE} · Instagram @${INSTAGRAM}
Recibís este mail porque ${d.club || 'tu club'} tiene el plan Oro de MotorStats.`;
  return { tipo: 'ciclo', asunto, html, texto };
}

module.exports = { mailCiclo, numerosCiclo, fechaMail };
