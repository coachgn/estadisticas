/* =====================================================================
   EL MAIL DEL INFORME DE CICLO (Ciclos, fase 6) · PURO

   Un cuerpo corto con el resumen y el PDF adjunto (lo arma mail-envio). Va
   a cada mail del padrón del club por separado: nadie ve a los demás
   destinatarios. HTML de mail (tablas, estilos en línea) y texto plano.
   ===================================================================== */
'use strict';

const { REMITENTE, PANEL_URL, INSTAGRAM, esc } = require('./mail-plantillas.js');

/**
 * @param {{equipo, club, ciclo, desde, hasta, record, lectura, panel}} d
 *   `lectura`: el resumen revisado (texto plano, opcional).
 */
function mailCiclo(d) {
  const equipo = d.equipo || 'tu equipo';
  const asunto = `Informe ${d.ciclo || 'de ciclo'} · ${equipo} · ${d.desde} al ${d.hasta}`;
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
<p style="margin:0 0 12px;font-size:14px;line-height:1.5;">Te enviamos el informe de <b>${esc(d.ciclo || 'ciclo')}</b> de <b>${esc(equipo)}</b>, ${esc(d.desde)} al ${esc(d.hasta)}${d.record ? ` (${esc(d.record)})` : ''}. Está adjunto en PDF.</p>
${resumen ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;padding:10px 12px;background:#f1f5f9;border-left:4px solid #f7941e;border-radius:4px;">${esc(resumen)}</p>` : ''}
<p style="margin:0 0 6px;font-size:13px;color:#475569;">Los números salen del análisis del play-by-play; las lecturas las revisó el cuerpo de análisis de MotorStats. También lo ves en tu panel: <a href="${esc(url)}" style="color:#b45309;">${esc(url)}</a></p>
</td></tr>
<tr><td style="padding:14px 26px;background:#f8fafc;font-size:12px;color:#64748b;">Consultas: ${esc(REMITENTE)} · Instagram @${esc(INSTAGRAM)}<br>Recibís este mail porque ${esc(d.club || 'tu club')} tiene el plan Oro de MotorStats.</td></tr>
</table></td></tr></table></body></html>`;
  const texto = `${saludo}:

Te enviamos el informe de ${d.ciclo || 'ciclo'} de ${equipo}, ${d.desde} al ${d.hasta}${d.record ? ' (' + d.record + ')' : ''}. Está adjunto en PDF.
${resumen ? '\n' + resumen + '\n' : ''}
Los números salen del análisis del play-by-play; las lecturas las revisó el cuerpo de análisis de MotorStats.
Tu panel: ${url}

Consultas: ${REMITENTE} · Instagram @${INSTAGRAM}
Recibís este mail porque ${d.club || 'tu club'} tiene el plan Oro de MotorStats.`;
  return { tipo: 'ciclo', asunto, html, texto };
}

module.exports = { mailCiclo };
