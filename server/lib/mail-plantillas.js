/* =====================================================================
   LAS PLANTILLAS DE LOS MAILS INSTITUCIONALES · PURO

   Cuatro mails: la BIENVENIDA al dar de alta una categoría y los tres
   RECORDATORIOS de vencimiento (5, 3 y 1 día antes). Cada uno sale en
   HTML y en texto plano: el HTML es lo que se ve en Gmail y en el
   teléfono; el texto es lo que lee un cliente de correo que no dibuja
   HTML, y lo que cuenta el filtro de spam para decidir si el mail es
   honesto.

   HTML DE MAIL, NO DE PÁGINA. Tablas, estilos en línea y un ancho de
   600 px: Gmail borra el `<style>` en muchos casos y Outlook no entiende
   flex ni grid. Nada de imágenes externas —se bloquean por defecto y el
   mail quedaría con huecos—: la marca va en texto.

   {{VARIABLE}} Y NUNCA UN HUECO. `rellenar()` reemplaza y, si queda una
   sola llave sin resolver, LANZA: un mail con «Hola {{CONTACTO}}» que
   llega a un cliente es peor que un mail que no sale, y el error se ve en
   el reporte del cron en vez de en la bandeja del club. Todo valor se
   escapa antes de entrar al HTML: los nombres los escribe un admin y
   pueden traer un `<`.
   ===================================================================== */
'use strict';

const REMITENTE = 'motorstats.ar@gmail.com';
const NOMBRE_REMITENTE = 'MotorStats AR';
/* El número comercial, el mismo de la demo y la landing (js/sgadd-demo.js,
   `WHATSAPP`). Hay un test que los ata: si cambia uno y no el otro, los
   clientes escribirían a un teléfono que nadie atiende. */
const WHATSAPP = '5492216143994';
const INSTAGRAM = 'motorstats.ar';
const PANEL_URL = 'https://coachgn.github.io/estadisticas/';

/* Los metales de cada plan, los mismos del panel (punto 25). En el mail el
   badge lleva texto oscuro sobre el metal: plata y oro son claros. */
const PLANES = {
  BRONCE: { nombre: 'Bronce', fondo: '#CD7F32', texto: '#1f1206' },
  PLATA:  { nombre: 'Plata',  fondo: '#C0C0C0', texto: '#111827' },
  ORO:    { nombre: 'Oro',    fondo: '#FFD700', texto: '#1f1a00' },
};

const RENOVACIONES = {
  mensual: 'mensual',
  trimestral: 'trimestral',
  semestral: 'semestral',
  temporada: 'por temporada',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «viernes 2 de octubre de 2026». Sin Intl: tiene que dar lo mismo en
    cualquier servidor, con cualquier locale instalado. */
function fechaLarga(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return DIAS[d.getUTCDay()] + ' ' + (+m[3]) + ' de ' + MESES[+m[2] - 1] + ' de ' + m[1];
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Reemplaza {{CLAVE}} por su valor. `crudo` son las claves que ya vienen
 * como HTML armado acá (el badge, los bloques): el resto se escapa.
 * LANZA si queda una llave sin resolver.
 */
function rellenar(plantilla, vars, crudo) {
  const seguras = crudo || {};
  const out = String(plantilla).replace(/\{\{([A-Z0-9_]+)\}\}/g, (todo, k) => {
    if (Object.prototype.hasOwnProperty.call(seguras, k)) return String(seguras[k]);
    if (Object.prototype.hasOwnProperty.call(vars, k) && vars[k] !== undefined && vars[k] !== null) return esc(vars[k]);
    return todo;
  });
  const suelta = /\{\{[A-Z0-9_]+\}\}/.exec(out);
  if (suelta) {
    const e = new Error('La plantilla quedó con ' + suelta[0] + ' sin completar.');
    e.codigo = 'PLANTILLA_INCOMPLETA';
    throw e;
  }
  return out;
}

/** Lo mismo para el texto plano: sin escapar, porque no es HTML. */
function rellenarTexto(plantilla, vars) {
  const out = String(plantilla).replace(/\{\{([A-Z0-9_]+)\}\}/g, (todo, k) =>
    (vars[k] !== undefined && vars[k] !== null) ? String(vars[k]) : todo);
  const suelta = /\{\{[A-Z0-9_]+\}\}/.exec(out);
  if (suelta) {
    const e = new Error('El texto quedó con ' + suelta[0] + ' sin completar.');
    e.codigo = 'PLANTILLA_INCOMPLETA';
    throw e;
  }
  return out;
}

function urlWhatsApp(mensaje) {
  return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(mensaje);
}

/* ------------------------------------------------------------ piezas */

function badgePlan(plan) {
  const p = PLANES[plan] || PLANES.BRONCE;
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${p.fondo};color:${p.texto};font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase;">${esc(p.nombre)}</span>`;
}

function boton(url, texto, fondo) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 4px;">
  <tr><td style="border-radius:8px;background:${fondo || '#f7941e'};">
    <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#111111;text-decoration:none;border-radius:8px;">${esc(texto)}</a>
  </td></tr></table>`;
}

function filaResumen(etiqueta, valorHtml) {
  return `<tr>
    <td style="padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:42%;">${esc(etiqueta)}</td>
    <td style="padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;font-weight:600;">${valorHtml}</td>
  </tr>`;
}

/** El esqueleto común: encabezado con la marca, cuerpo y pie de soporte. */
function marco(o) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{{ASUNTO}}</title></head>
<body style="margin:0;padding:0;background:#eef0f3;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{PREHEADER}}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef0f3;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
    <tr><td style="background:#0B1121;padding:22px 28px;border-bottom:4px solid ${o.franja || '#f7941e'};">
      <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:.02em;">MotorStats<sup style="font-size:11px;color:#f7941e;">AR</sup></div>
      <div style="font-size:12px;color:#cbd5e1;margin-top:4px;letter-spacing:.08em;text-transform:uppercase;">${o.rotulo}</div>
    </td></tr>
    <tr><td style="padding:28px 28px 8px;color:#111827;font-size:15px;line-height:1.55;">
${o.cuerpo}
    </td></tr>
    <tr><td style="padding:8px 28px 26px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;">
        <tr><td style="padding:14px 18px;font-size:13px;color:#374151;line-height:1.6;">
          <strong style="color:#111827;">¿Necesitás ayuda?</strong><br>
          WhatsApp de atención: <a href="{{URL_WHATSAPP_SOPORTE}}" style="color:#b45309;">+54 9 221 614-3994</a><br>
          Consultas: <a href="mailto:${REMITENTE}" style="color:#b45309;">${REMITENTE}</a> ·
          Instagram <a href="https://instagram.com/${INSTAGRAM}" style="color:#b45309;">@${INSTAGRAM}</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="background:#0B1121;padding:14px 28px;font-size:11px;color:#94a3b8;line-height:1.5;">
      MotorStats<sup>AR</sup> · Panel de scouting y estadísticas de básquet.<br>
      Recibís este mail porque {{CLUB}} tiene una categoría activa en MotorStats.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function pieTexto() {
  return `
¿Necesitás ayuda?
WhatsApp de atención: +54 9 221 614-3994 · {{URL_WHATSAPP_SOPORTE}}
Consultas: ${REMITENTE} · Instagram @${INSTAGRAM}

MotorStats AR · Panel de scouting y estadísticas de básquet.
Recibís este mail porque {{CLUB}} tiene una categoría activa en MotorStats.`;
}

/* -------------------------------------------------------- las variables */

/**
 * Las variables de un mail, a partir de lo que se sabe del cliente. Lo que
 * no está se RESUELVE a un texto honesto («—» o un saludo sin nombre), no
 * se deja vacío: la plantilla nunca queda con un hueco.
 * @param {{club, categoria, contacto, plan, vence, url, renovacion, dias, balance}} d
 */
function variables(d) {
  const plan = PLANES[String(d.plan || '').toUpperCase()] ? String(d.plan).toUpperCase() : 'BRONCE';
  const renov = RENOVACIONES[d.renovacion] || RENOVACIONES.mensual;
  const venceLarga = fechaLarga(d.vence);
  const saludo = d.contacto ? 'Hola, ' + String(d.contacto).split(/\s+/)[0] : 'Hola';
  const club = d.club || 'tu club';
  const categoria = d.categoria || 'tu categoría';
  return {
    CLUB: club,
    CATEGORIA: categoria,
    SALUDO: saludo,
    PLAN: plan,
    PLAN_NOMBRE: PLANES[plan].nombre,
    VENCE: venceLarga || 'sin fecha de vencimiento',
    VENCE_ISO: d.vence || '',
    RENOVACION: renov,
    URL_PANEL: d.url || PANEL_URL,
    DIAS: d.dias === undefined ? '' : String(d.dias),
    URL_WHATSAPP_SOPORTE: urlWhatsApp('Hola MotorStats, soy de ' + club + ' (' + categoria + ') y tengo una consulta.'),
    URL_WHATSAPP_RENOVAR: urlWhatsApp('Hola MotorStats, quiero renovar el plan ' + PLANES[plan].nombre
      + ' de ' + club + ' · ' + categoria + (d.vence ? ' (vence el ' + venceLarga + ')' : '') + '.'),
  };
}

/** La política de servicio, dicha igual en los cuatro mails. */
function politicaHtml() {
  return `<p style="margin:18px 0 6px;font-size:13px;color:#374151;line-height:1.6;">
  <strong style="color:#111827;">Renovación y corte.</strong> Tu plan tiene renovación <strong>{{RENOVACION}}</strong>.
  Si la renovación no está registrada, el acceso al panel se suspende en forma automática a las
  <strong>23:59 hs (hora de Argentina) del {{VENCE}}</strong>. Tus datos y tu configuración se conservan:
  al renovar, el panel vuelve a estar disponible en el acto.</p>`;
}
function politicaTexto() {
  return `Renovación y corte: tu plan tiene renovación {{RENOVACION}}. Si la renovación no está registrada, el acceso al panel se suspende en forma automática a las 23:59 hs (hora de Argentina) del {{VENCE}}. Tus datos y tu configuración se conservan: al renovar, el panel vuelve a estar disponible en el acto.`;
}

function resumenHtml(plan) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:14px 0 18px;">
  ${filaResumen('Club', '{{CLUB}}')}
  ${filaResumen('Categoría', '{{CATEGORIA}}')}
  ${filaResumen('Plan activo', badgePlan(plan))}
  ${filaResumen('Vencimiento', '{{VENCE}}')}
</table>`;
}

/* ------------------------------------------------------------- BIENVENIDA */

function bienvenida(datos) {
  const v = variables(datos);
  const asunto = 'Bienvenidos a MotorStats · ' + v.CLUB + ' · ' + v.CATEGORIA;
  v.ASUNTO = asunto;
  v.PREHEADER = 'Tu panel de ' + v.CATEGORIA + ' ya está activo. Acá tenés el acceso y el resumen de tu plan.';
  const cuerpo = `<p style="margin:0 0 12px;font-size:17px;font-weight:700;">{{SALUDO}}:</p>
<p style="margin:0 0 12px;">Te damos la bienvenida a <strong>MotorStats</strong>. El panel de <strong>{{CLUB}} · {{CATEGORIA}}</strong>
ya está activo: estadísticas avanzadas, perfiles de jugadores e informes con los datos de tu torneo, actualizados partido a partido.</p>
{{RESUMEN}}
<p style="margin:0 0 6px;"><strong>Tu acceso.</strong> Ingresá con este mismo mail. Si todavía no elegiste tu clave,
usá el código de invitación que te pasamos junto con el alta; la clave la elegís vos en el primer ingreso.</p>
{{BOTON}}
<p style="margin:6px 0 0;font-size:12px;color:#6b7280;">Si el botón no abre, copiá este link: <a href="{{URL_PANEL}}" style="color:#b45309;word-break:break-all;">{{URL_PANEL}}</a></p>
{{POLITICA}}`;
  const html = rellenar(marco({ rotulo: 'Bienvenida y configuración de tu cuenta', cuerpo: cuerpo }), v, {
    RESUMEN: rellenar(resumenHtml(v.PLAN), v),
    BOTON: boton(v.URL_PANEL, 'Ingresar a mi Panel'),
    POLITICA: rellenar(politicaHtml(), v),
  });
  const texto = rellenarTexto(`{{SALUDO}}:

Te damos la bienvenida a MotorStats. El panel de {{CLUB}} · {{CATEGORIA}} ya está activo.

RESUMEN DE TU CUENTA
Club: {{CLUB}}
Categoría: {{CATEGORIA}}
Plan activo: {{PLAN_NOMBRE}}
Vencimiento: {{VENCE}}

TU ACCESO
Ingresá con este mismo mail en {{URL_PANEL}}
Si todavía no elegiste tu clave, usá el código de invitación que te pasamos junto con el alta.

${politicaTexto()}
${pieTexto()}`, v);
  return { tipo: 'bienvenida', asunto: asunto, html: html, texto: texto };
}

/* ---------------------------------------------------------- RECORDATORIOS */

/** Qué dice cada aviso. El tono sube con la urgencia; los datos son los mismos. */
const AVISOS = {
  5: {
    rotulo: 'Aviso de renovación · faltan 5 días',
    asunto: (v) => 'Tu plan ' + v.PLAN_NOMBRE + ' de ' + v.CATEGORIA + ' vence en 5 días',
    pre: (v) => 'El ' + v.VENCE + ' vence el plan de ' + v.CLUB + '. Te contamos cómo renovarlo.',
    franja: '#f7941e',
    intro: `<p style="margin:0 0 12px;">Te escribimos con tiempo: el plan de <strong>{{CLUB}} · {{CATEGORIA}}</strong>
vence en <strong>5 días</strong>, el <strong>{{VENCE}}</strong>. Así podés coordinar la renovación sin cortes en el medio de la competencia.</p>`,
    cta: 'Coordinar la renovación',
  },
  3: {
    rotulo: 'Recordatorio · faltan 3 días',
    asunto: (v) => 'Quedan 3 días: renovemos el plan de ' + v.CLUB,
    pre: (v) => 'El plan ' + v.PLAN_NOMBRE + ' de ' + v.CATEGORIA + ' vence el ' + v.VENCE + '. Escribinos y lo dejamos listo.',
    franja: '#f59e0b',
    intro: `<p style="margin:0 0 12px;">Quedan <strong>3 días</strong> para el vencimiento del plan de <strong>{{CLUB}} · {{CATEGORIA}}</strong>
(<strong>{{VENCE}}</strong>). Escribinos por WhatsApp y coordinamos la renovación en un minuto.</p>`,
    cta: 'Renovar por WhatsApp',
  },
  1: {
    rotulo: 'Último aviso · el acceso se suspende mañana',
    asunto: (v) => 'Último aviso: el panel de ' + v.CLUB + ' se suspende mañana a las 23:59',
    pre: (v) => 'Si la renovación no está registrada, el acceso se suspende el ' + v.VENCE + ' a las 23:59 hs.',
    franja: '#dc2626',
    intro: `<p style="margin:0 0 12px;">Este es el <strong>último aviso</strong>: mañana, <strong>{{VENCE}}, a las 23:59 hs</strong>,
vence el plan de <strong>{{CLUB}} · {{CATEGORIA}}</strong>. Si la renovación no está registrada para ese momento,
<strong>el acceso al panel se suspende en forma automática</strong>.</p>
<p style="margin:0 0 12px;">No se pierde nada: tus datos y tu configuración quedan guardados y el panel vuelve a estar disponible en cuanto se registra la renovación.</p>`,
    cta: 'Renovar ahora por WhatsApp',
  },
};
const DIAS_AVISO = Object.keys(AVISOS).map(Number).sort((a, b) => b - a);

/** El balance de uso, del aviso de 5 días. Solo lo que el servidor SABE. */
function balanceHtml(b) {
  if (!b) return '';
  const filas = [];
  if (b.diasDeServicio !== undefined && b.diasDeServicio !== null) filas.push(filaResumen('Días de servicio', esc(b.diasDeServicio)));
  if (b.accesos !== undefined && b.accesos !== null) filas.push(filaResumen('Accesos habilitados', esc(b.accesos + (b.cupo ? ' de ' + b.cupo : ''))));
  if (b.ultimoIngreso) filas.push(filaResumen('Último ingreso al panel', esc(fechaLarga(b.ultimoIngreso))));
  if (b.informesEntregados !== undefined && b.informesEntregados !== null) filas.push(filaResumen('Informes de scouting entregados', esc(b.informesEntregados)));
  if (!filas.length) return '';
  return `<p style="margin:16px 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Tu balance de uso</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 14px;">${filas.join('')}</table>`;
}
function balanceTexto(b) {
  if (!b) return '';
  const l = [];
  if (b.diasDeServicio !== undefined && b.diasDeServicio !== null) l.push('Días de servicio: ' + b.diasDeServicio);
  if (b.accesos !== undefined && b.accesos !== null) l.push('Accesos habilitados: ' + b.accesos + (b.cupo ? ' de ' + b.cupo : ''));
  if (b.ultimoIngreso) l.push('Último ingreso al panel: ' + fechaLarga(b.ultimoIngreso));
  if (b.informesEntregados !== undefined && b.informesEntregados !== null) l.push('Informes de scouting entregados: ' + b.informesEntregados);
  return l.length ? '\nTU BALANCE DE USO\n' + l.join('\n') + '\n' : '';
}

function recordatorio(datos, dias) {
  const aviso = AVISOS[dias];
  if (!aviso) {
    const e = new Error('No hay un recordatorio para ' + dias + ' días (solo 5, 3 y 1).');
    e.codigo = 'SIN_AVISO';
    throw e;
  }
  const v = variables(Object.assign({}, datos, { dias: dias }));
  const asunto = aviso.asunto(v);
  v.ASUNTO = asunto;
  v.PREHEADER = aviso.pre(v);
  const cuerpo = `<p style="margin:0 0 12px;font-size:17px;font-weight:700;">{{SALUDO}}:</p>
${aviso.intro}
{{RESUMEN}}
{{BALANCE}}
{{BOTON}}
<p style="margin:6px 0 0;font-size:12px;color:#6b7280;">Tu panel: <a href="{{URL_PANEL}}" style="color:#b45309;word-break:break-all;">{{URL_PANEL}}</a></p>
{{POLITICA}}`;
  const html = rellenar(marco({ rotulo: aviso.rotulo, franja: aviso.franja, cuerpo: cuerpo }), v, {
    RESUMEN: rellenar(resumenHtml(v.PLAN), v),
    BALANCE: dias === 5 ? balanceHtml(datos.balance) : '',
    BOTON: boton(v.URL_WHATSAPP_RENOVAR, aviso.cta, dias === 1 ? '#f87171' : '#f7941e'),
    POLITICA: rellenar(politicaHtml(), v),
  });
  const introTexto = aviso.intro.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const texto = rellenarTexto(`{{SALUDO}}:

${introTexto}

RESUMEN DE TU CUENTA
Club: {{CLUB}}
Categoría: {{CATEGORIA}}
Plan activo: {{PLAN_NOMBRE}}
Vencimiento: {{VENCE}}
${dias === 5 ? balanceTexto(datos.balance) : ''}
${aviso.cta}: {{URL_WHATSAPP_RENOVAR}}
Tu panel: {{URL_PANEL}}

${politicaTexto()}
${pieTexto()}`, v);
  return { tipo: 'recordatorio_' + dias + 'd', asunto: asunto, html: html, texto: texto };
}

module.exports = {
  REMITENTE, NOMBRE_REMITENTE, WHATSAPP, INSTAGRAM, PANEL_URL, PLANES, RENOVACIONES, DIAS_AVISO,
  bienvenida, recordatorio, rellenar, rellenarTexto, variables, fechaLarga, esc,
};
