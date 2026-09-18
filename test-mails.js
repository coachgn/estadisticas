/* =====================================================================
   test-mails.js · LOS MAILS INSTITUCIONALES (punto 63)

   Bienvenida y recordatorios de vencimiento (5, 3 y 1 día). Se prueba:
     1. las plantillas: ninguna llave suelta, todo escapado, remitente fijo
     2. las fechas: el día de Argentina, los días que faltan
     3. el planificador y la IDEMPOTENCIA (dos corridas, dos a la vez, un
        envío que falla, una renovación)
     4. la ficha: deepMerge, validación, aislamiento
     5. el SMTP contra un servidor de mentira
     6. las rutas: el secreto del cron, el gate de admin
     7. el Panel Master y el corte a las 23:59 de Argentina
     8. el acceso ADENTRO de la bienvenida: el alta genera el código y el
        mail lo lleva; y la puerta de ingreso de `?club=` sin sesión

   Nada de esto toca Upstash ni Gmail de verdad.
   ===================================================================== */
'use strict';

process.env.JWT_SECRET = 'secreto-de-prueba-de-mas-de-32-caracteres-1234567890';
delete process.env.SMTP_PASS; delete process.env.MAIL_APP_PASSWORD; delete process.env.GMAIL_APP_PASSWORD;
delete process.env.SMTP_USER; delete process.env.CRON_SECRET;

const fs = require('fs');
const vm = require('vm');
const P = require('./server/lib/mail-plantillas.js');
const envio = require('./server/lib/mail-envio.js');
const fichas = require('./server/lib/fichas.js');
const cron = require('./server/lib/cron-vencimientos.js');
const { kvMemoria } = require('./server/lib/kv-memoria.js');
const mails = require('./server/api/mails.js');
const auth = require('./server/lib/auth.js');
const invitacion = require('./server/lib/invitacion.js');
const clientes = require('./server/lib/clientes.js');

/* El padrón de accesos vive en una clave simple de Upstash (`kv.leer` /
   `kv.escribir`), no en un hash: se reemplazan esas dos, como hace
   test-clientes.js. Nada sale a la red. */
const kvReal = require('./server/lib/kv.js');
const KV_SIMPLE = {};
kvReal.leer = async (k) => ({ valor: KV_SIMPLE[k] !== undefined ? JSON.parse(KV_SIMPLE[k]) : null, error: null });
kvReal.escribir = async (k, v) => { KV_SIMPLE[k] = JSON.stringify(v); };

let ok = 0, fail = 0;
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { fail++; console.log('  ✗ ' + nombre + (detalle !== undefined ? '  → ' + detalle : '')); }
}
const sinCR = (t) => t.split(String.fromCharCode(13)).join('');
function titulo(t) { console.log('\n' + t + '\n' + '─'.repeat(70)); }

const HOY = '2026-09-18';
const AHORA = Date.parse('2026-09-18T15:00:00Z');   // 12:00 de Argentina
const sumar = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

(async () => {
  /* ================================================================ 1 */
  titulo('1 · LAS PLANTILLAS · sin llaves sueltas, escapadas y con remitente fijo');
  const datos = { club: 'Club <Ejemplo> & Cía', categoria: 'Primera 2026', contacto: 'Martina Pérez',
    plan: 'ORO', vence: '2026-10-02', renovacion: 'trimestral', url: 'https://coachgn.github.io/estadisticas/?club=ejemplo',
    balance: { diasDeServicio: 128, accesos: 2, cupo: 4, ultimoIngreso: '2026-09-15', informesEntregados: 3 } };
  const todos = [P.bienvenida(datos), P.recordatorio(datos, 5), P.recordatorio(datos, 3), P.recordatorio(datos, 1)];
  const llave = /\{\{[A-Z0-9_]+\}\}/;
  check('ninguno de los cuatro mails deja un {{PLACEHOLDER}} en el HTML', todos.every(m => !llave.test(m.html)),
    todos.filter(m => llave.test(m.html)).map(m => m.tipo).join(','));
  check('ni en el texto plano', todos.every(m => !llave.test(m.texto)));
  check('ni en el asunto', todos.every(m => !llave.test(m.asunto)));
  check('los cuatro traen HTML y texto plano', todos.every(m => /<html/.test(m.html) && m.texto.length > 200));
  check('el texto plano no trae etiquetas HTML (con un club sin <)', [P.bienvenida(Object.assign({}, datos, { club: 'Club Ejemplo' })), P.recordatorio(Object.assign({}, datos, { club: 'Club Ejemplo' }), 5)].every(m => !/<[a-z][^>]*>/i.test(m.texto)));
  check('los tipos son los hitos del log', todos.map(m => m.tipo).join() === 'bienvenida,recordatorio_5d,recordatorio_3d,recordatorio_1d');
  check('el nombre del club se ESCAPA en el HTML (lo escribe un admin y puede traer un <)',
    todos.every(m => m.html.indexOf('Club <Ejemplo>') === -1 && m.html.indexOf('Club &lt;Ejemplo&gt; &amp; Cía') !== -1));
  check('rellenar() LANZA si queda una llave sin resolver: un mail con «Hola {{X}}» no sale',
    (() => { try { P.rellenar('Hola {{NADIE}}', {}); return false; } catch (e) { return e.codigo === 'PLANTILLA_INCOMPLETA'; } })());
  check('sin contacto, el saludo no queda con un hueco', /Hola:/.test(P.bienvenida(Object.assign({}, datos, { contacto: '' })).texto));
  check('sin vencimiento dice «sin fecha», no un hueco',
    /sin fecha de vencimiento/.test(P.bienvenida(Object.assign({}, datos, { vence: '' })).texto));
  const bien = todos[0];
  check('la bienvenida saluda por el nombre y nombra club, categoría, plan y vencimiento',
    /Hola, Martina/.test(bien.html) && /Primera 2026/.test(bien.html) && /viernes 2 de octubre de 2026/.test(bien.html) && />Oro</.test(bien.html));
  check('el badge del plan lleva el metal del plan (oro #FFD700)', /background:#FFD700/.test(bien.html));
  check('y cada plan el suyo', /background:#C0C0C0/.test(P.bienvenida(Object.assign({}, datos, { plan: 'PLATA' })).html)
    && /background:#CD7F32/.test(P.bienvenida(Object.assign({}, datos, { plan: 'BRONCE' })).html));
  check('un plan desconocido cae a Bronce, nunca a Oro', /background:#CD7F32/.test(P.bienvenida(Object.assign({}, datos, { plan: 'PLATINO' })).html));
  check('botón prominente «Ingresar a mi Panel» con el link al panel del club',
    /Ingresar a mi Panel/.test(bien.html) && bien.html.indexOf('href="https://coachgn.github.io/estadisticas/?club=ejemplo"') !== -1);
  check('la política de renovación y corte, con la modalidad y la hora',
    todos.every(m => /renovación <strong>trimestral<\/strong>/.test(m.html) && /23:59 hs \(hora de Argentina\)/.test(m.html)));
  check('soporte: WhatsApp de atención, mail y canal oficial',
    todos.every(m => m.html.indexOf('https://wa.me/' + P.WHATSAPP) !== -1 && m.html.indexOf('mailto:motorstats.ar@gmail.com') !== -1
      && /instagram\.com\/motorstats\.ar/.test(m.html)));
  const numeroDemo = (/WHATSAPP\s*=\s*'(\d+)'/.exec(fs.readFileSync('./js/sgadd-demo.js', 'utf8')) || [])[1];
  check('el WhatsApp es el MISMO número comercial de la demo y la landing', P.WHATSAPP === numeroDemo, P.WHATSAPP + ' / ' + numeroDemo);
  check('sin invitación, la bienvenida NO trae ningún código (y nunca una clave)', !/c[oó]digo[^:\n]*:\s*[A-Za-z0-9_-]{6,}/.test(bien.texto) && !/clave:\s*\S/.test(bien.texto));
  check('5 días: aviso preventivo con el balance de uso',
    /vence en <strong>5 días<\/strong>/.test(todos[1].html) && /Tu balance de uso/.test(todos[1].html) && /128/.test(todos[1].html) && /2 de 4/.test(todos[1].html));
  check('el balance va SOLO en el de 5 días', !/balance de uso/i.test(todos[2].html) && !/balance de uso/i.test(todos[3].html));
  check('3 días: link directo de WhatsApp para coordinar, con el mensaje escrito',
    /Renovar por WhatsApp/.test(todos[2].html) && todos[2].html.indexOf(encodeURIComponent('quiero renovar el plan Oro')) !== -1);
  check('1 día: último aviso con la suspensión a las 23:59 de mañana',
    /Último aviso/.test(todos[3].asunto) && /mañana, <strong>viernes 2 de octubre de 2026, a las 23:59 hs<\/strong>/.test(todos[3].html)
    && /se suspende en forma automática/.test(todos[3].html));
  check('no hay recordatorio para otros días', (() => { try { P.recordatorio(datos, 2); return false; } catch (e) { return e.codigo === 'SIN_AVISO'; } })());
  check('los días de aviso son exactamente 5, 3 y 1', P.DIAS_AVISO.join() === '5,3,1');
  check('ni una imagen externa: se bloquean por defecto y el mail quedaría con huecos', todos.every(m => !/<img/i.test(m.html)));
  check('HTML de mail: ancho de 600 px y estilos en línea, sin <style>', todos.every(m => /max-width:600px/.test(m.html) && !/<style/i.test(m.html)));

  /* ================================================================ 2 */
  titulo('2 · LAS FECHAS · el día de Argentina y los días que faltan');
  check('hoy es el día de ARGENTINA: a las 01:00 UTC acá todavía es ayer',
    cron.hoyAR(Date.parse('2026-09-19T01:00:00Z')) === '2026-09-18' && cron.hoyAR(Date.parse('2026-09-19T03:00:00Z')) === '2026-09-19');
  check('días entre dos fechas', cron.diasEntre('2026-09-18', '2026-09-23') === 5 && cron.diasEntre('2026-09-18', '2026-09-18') === 0
    && cron.diasEntre('2026-09-18', '2026-09-17') === -1);
  check('cruza meses y años sin errores', cron.diasEntre('2026-12-30', '2027-01-02') === 3 && cron.diasEntre('2026-02-27', '2026-03-02') === 3);
  check('una fecha rota da null, no un número', cron.diasEntre('2026-09-18', 'mañana') === null);
  check('fechaLarga en castellano, sin depender del locale del servidor', P.fechaLarga('2026-09-18') === 'viernes 18 de septiembre de 2026');

  /* ================================================================ 3 */
  titulo('3 · EL PLANIFICADOR Y LA IDEMPOTENCIA');
  const catalogo = {
    cinco: { nombre: 'Club Cinco', estado: 'activo', categorias: { primera: { label: 'Primera', plan: 'ORO', vence: sumar(HOY, 5) } } },
    tres: { nombre: 'Club Tres', estado: 'activo', categorias: { u23: { label: 'U23', plan: 'PLATA', vence: sumar(HOY, 3) } } },
    uno: { nombre: 'Club Uno', estado: 'activo', categorias: { primera: { label: 'Primera', vence: sumar(HOY, 1) } } },
    cuatro: { nombre: 'Club Cuatro', estado: 'activo', categorias: { primera: { label: 'Primera', vence: sumar(HOY, 4) } } },
    pausado: { nombre: 'Pausado', estado: 'pausado', categorias: { primera: { label: 'Primera', vence: sumar(HOY, 3) } } },
    sinmail: { nombre: 'Sin mail', estado: 'activo', categorias: { primera: { label: 'Primera', vence: sumar(HOY, 1) } } },
    heredado: { nombre: 'Heredado', estado: 'activo', vence: sumar(HOY, 3), categorias: { primera: { label: 'Primera' } } },
    prueba: { nombre: 'Prueba', estado: 'activo', categorias: { u19: { label: 'U19', estado: 'prueba', vence: sumar(HOY, 5) } } },
  };
  const almacen = kvMemoria();
  for (const c of Object.keys(catalogo)) {
    const slug = Object.keys(catalogo[c].categorias)[0];
    await fichas.guardar(c, slug, { contacto: 'Contacto ' + c, email: c === 'sinmail' ? null : c + '@club.com',
      fechaAlta: '2026-05-01', renovacion: 'mensual' }, { kv: almacen });
  }
  const todas = await fichas.leerTodas({ kv: almacen });
  const plan = cron.planificar(catalogo, todas, HOY, AHORA);
  const por = (c) => plan.avisos.find(a => a.clubId === c);
  check('a 5, 3 y 1 día sale el aviso que corresponde',
    por('cinco').hito === 'recordatorio_5d' && por('tres').hito === 'recordatorio_3d' && por('uno').hito === 'recordatorio_1d');
  check('a 4 días no sale nada (solo 5, 3 y 1, exactos)', !por('cuatro'));
  check('un club pausado no recibe recordatorios de algo que no tiene',
    !por('pausado') && plan.omitidos.some(o => o.clubId === 'pausado' && /sin acceso/.test(o.motivo)));
  check('sin mail en la ficha se OMITE con el motivo, no revienta',
    !por('sinmail') && plan.omitidos.some(o => o.clubId === 'sinmail' && /no tiene mail/.test(o.motivo)));
  check('rige la fecha del CLUB cuando la categoría no declara una', por('heredado') && por('heredado').hito === 'recordatorio_3d');
  check('una categoría en PRUEBA también recibe el aviso (tiene acceso)', por('prueba') && por('prueba').hito === 'recordatorio_5d');
  check('el id del reclamo lleva el vencimiento', por('tres').idHito === 'tres|u23|recordatorio_3d@' + sumar(HOY, 3));

  const transporte = envio.transporteMemoria();
  const deps = { kv: almacen, transporte: transporte, catalogo: catalogo, padron: {
    'a@cinco.com': { club: 'cinco', ultimoIngreso: '2026-09-10T12:00:00Z' }, 'b@cinco.com': { club: 'cinco' } }, ahora: AHORA };
  const r1 = await cron.ejecutar(deps);
  check('la primera corrida manda los 5 avisos del día', r1.enviados === 5 && transporte.enviados.length === 5, r1.enviados);
  check('todos salen desde motorstats.ar@gmail.com', transporte.enviados.every(m => m.de === 'motorstats.ar@gmail.com'));
  const cincoMail = transporte.enviados.find(m => m.para === 'cinco@club.com');
  check('el de 5 días lleva el balance real: accesos del padrón, cupo del plan y último ingreso',
    /2 de 4/.test(cincoMail.html) && /jueves 10 de septiembre de 2026/.test(cincoMail.html) && /Días de servicio/.test(cincoMail.html), cincoMail && cincoMail.texto.slice(0, 50));
  const fichaTres = await fichas.leer('tres', 'u23', { kv: almacen });
  check('el hito queda en notificacionesEnviadas de la ficha, con fecha, vencimiento y destinatario',
    fichaTres.notificacionesEnviadas.length === 1 && fichaTres.notificacionesEnviadas[0].hito === 'recordatorio_3d'
    && fichaTres.notificacionesEnviadas[0].vence === sumar(HOY, 3) && fichaTres.notificacionesEnviadas[0].para === 'tres@club.com');
  check('y la ficha conserva el resto de sus datos', fichaTres.contacto === 'Contacto tres' && fichaTres.renovacion === 'mensual');

  const r2 = await cron.ejecutar(deps);
  check('la SEGUNDA corrida del mismo día no reenvía nada', r2.enviados === 0 && transporte.enviados.length === 5, r2.enviados);
  check('y dice por qué: ya enviado', r2.omitidos.filter(o => o.motivo === 'ya enviado').length === 5);

  /* Dos corridas A LA VEZ (un reintento de Vercel): el reclamo atómico. */
  const almacen2 = kvMemoria();
  await fichas.guardar('tres', 'u23', { email: 'tres@club.com' }, { kv: almacen2 });
  const t2 = envio.transporteMemoria();
  const d2 = { kv: almacen2, transporte: t2, catalogo: { tres: catalogo.tres }, padron: {}, ahora: AHORA };
  const [a, b] = await Promise.all([cron.ejecutar(d2), cron.ejecutar(d2)]);
  check('dos corridas SIMULTÁNEAS mandan UN solo mail (HSETNX gana una sola)', t2.enviados.length === 1 && a.enviados + b.enviados === 1,
    t2.enviados.length);
  check('la otra dice que el aviso ya lo reclamó otra corrida',
    a.resultados.concat(b.resultados).some(r => /ya reclamado/.test(r.resultado)));

  /* Un envío que falla libera el reclamo. */
  const almacen3 = kvMemoria();
  await fichas.guardar('uno', 'primera', { email: 'uno@club.com' }, { kv: almacen3 });
  const roto = { enviar: async () => { throw Object.assign(new Error('Gmail caído'), { codigo: 'SMTP_TIMEOUT' }); } };
  const d3 = { kv: almacen3, transporte: roto, catalogo: { uno: catalogo.uno }, padron: {}, ahora: AHORA };
  const r3 = await cron.ejecutar(d3);
  check('si Gmail falla, el aviso NO queda registrado y se reporta el error',
    r3.errores === 1 && !(await fichas.leer('uno', 'primera', { kv: almacen3 })).notificacionesEnviadas.length);
  const t3 = envio.transporteMemoria();
  const r3b = await cron.ejecutar(Object.assign({}, d3, { transporte: t3 }));
  check('y sale en la corrida siguiente (el reclamo se liberó)', r3b.enviados === 1 && t3.enviados.length === 1);

  /* Renovar re-arma los avisos del período nuevo. */
  const renovado = JSON.parse(JSON.stringify({ tres: catalogo.tres }));
  renovado.tres.categorias.u23.vence = sumar(HOY, 3 + 30);
  const hoyMasTreinta = sumar(HOY, 30);
  const planRenov = cron.planificar(renovado, await fichas.leerTodas({ kv: almacen }), hoyMasTreinta);
  check('RENOVAR re-arma los avisos: el 3 días del período nuevo sale aunque el viejo ya se mandó',
    planRenov.avisos.length === 1 && planRenov.avisos[0].hito === 'recordatorio_3d' && planRenov.avisos[0].vence === sumar(HOY, 33));
  check('yaEnviado distingue el vencimiento', fichas.yaEnviado(fichaTres, 'recordatorio_3d', sumar(HOY, 3))
    && !fichas.yaEnviado(fichaTres, 'recordatorio_3d', sumar(HOY, 33)));

  /* La bienvenida: una sola vez, salvo reenvío. */
  const almacen4 = kvMemoria();
  const t4 = envio.transporteMemoria();
  await fichas.guardar('cinco', 'primera', { contacto: 'Ana', email: 'ana@cinco.com', renovacion: 'semestral' }, { kv: almacen4 });
  const dB = { kv: almacen4, transporte: t4, catalogo: catalogo, ahora: AHORA };
  const b1 = await cron.enviarBienvenida('cinco', 'primera', dB);
  const b2 = await cron.enviarBienvenida('cinco', 'primera', dB);
  check('la bienvenida sale una vez', b1.resultado === 'enviado' && b2.resultado === 'omitido' && t4.enviados.length === 1);
  check('y lee plan y vencimiento del CATÁLOGO, la renovación de la ficha',
    /background:#FFD700/.test(t4.enviados[0].html) && /renovación <strong>semestral/.test(t4.enviados[0].html));
  const b3 = await cron.enviarBienvenida('cinco', 'primera', Object.assign({}, dB, { forzar: true }));
  check('«Reenviar» la manda de nuevo y queda en el log', b3.resultado === 'enviado' && t4.enviados.length === 2
    && (await fichas.leer('cinco', 'primera', { kv: almacen4 })).notificacionesEnviadas.filter(r => r.hito === 'bienvenida').length === 2);

  /* ================================================================ 4 */
  titulo('4 · LA FICHA · deepMerge, validación y aislamiento');
  check('deepMerge: lo nuevo gana y lo que no vino se conserva',
    JSON.stringify(fichas.deepMerge({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 9 } })) === JSON.stringify({ a: 1, b: { c: 9, d: 3 } }));
  check('undefined no borra («no lo mandé» no es «borralo»)', fichas.deepMerge({ a: 1 }, { a: undefined }).a === 1);
  check('null sí borra el valor (el admin vació el campo)', fichas.deepMerge({ a: 1 }, { a: null }).a === null);
  check('los arrays se reemplazan, no se fusionan por posición',
    JSON.stringify(fichas.deepMerge({ l: [1, 2, 3] }, { l: [9] }).l) === '[9]');
  check('deepMerge no muta el original', (() => { const o = { a: { b: 1 } }; fichas.deepMerge(o, { a: { b: 2 } }); return o.a.b === 1; })());
  const antes = await fichas.leer('cinco', 'primera', { kv: almacen4 });
  await fichas.guardar('cinco', 'primera', { contacto: 'Ana María' }, { kv: almacen4 });
  const despues = await fichas.leer('cinco', 'primera', { kv: almacen4 });
  check('guardar el contacto NO borra el mail, la renovación ni el log (la integridad del cliente)',
    despues.contacto === 'Ana María' && despues.email === 'ana@cinco.com' && despues.renovacion === 'semestral'
    && despues.notificacionesEnviadas.length === antes.notificacionesEnviadas.length);
  await fichas.guardar('tres', 'u23', { contacto: 'Otro' }, { kv: almacen4 });
  check('guardar una ficha no toca las demás (un campo del hash por categoría)',
    (await fichas.leer('cinco', 'primera', { kv: almacen4 })).contacto === 'Ana María');
  check('ninguna escritura hace SET, DEL ni HDEL sobre las fichas',
    almacen4.ops.every(op => ['HGETALL', 'HMGET', 'HSET', 'HSETNX'].indexOf(op) !== -1), almacen4.ops.join(','));
  check('validación: mail inválido se rechaza', !fichas.normalizar({ email: 'no-es-mail' }).ok);
  check('validación: fecha y renovación', !fichas.normalizar({ fechaAlta: '18/09/2026' }).ok && !fichas.normalizar({ renovacion: 'bianual' }).ok);
  check('los campos desconocidos no entran a la ficha', Object.keys(fichas.normalizar({ contacto: 'x', plan: 'ORO', hack: 1 }).ficha).join() === 'contacto');
  check('un saldo de línea en el contacto no llega al encabezado del mail', fichas.normalizar({ contacto: 'Ana\r\nBcc: x@y.com' }).ficha.contacto === 'Ana Bcc: x@y.com');
  check('el mail se guarda en minúsculas', fichas.normalizar({ email: 'Prensa@Club.COM' }).ficha.email === 'prensa@club.com');

  /* ================================================================ 5 */
  titulo('5 · EL ENVÍO · remitente fijo y SMTP contra un servidor de mentira');
  check('sin credencial no se manda nada y se dice por qué', envio.estadoEnvio({}).codigo === 'SIN_CREDENCIAL');
  check('otra cuenta en SMTP_USER se RECHAZA: los mails salen solo de motorstats.ar@gmail.com',
    envio.estadoEnvio({ SMTP_USER: 'freytesgn@gmail.com', SMTP_PASS: 'x' }).codigo === 'REMITENTE_INVALIDO');
  check('con la contraseña de aplicación queda listo', envio.estadoEnvio({ SMTP_PASS: 'abcd efgh ijkl mnop' }).ok);
  const msj = envio.construirMensaje({ para: 'dt@club.com', asunto: 'Último aviso: ñandú', html: '<p>hola</p>', texto: 'hola' },
    { id: 'x', limite: 'L', fecha: new Date(AHORA) });
  check('From: MotorStats AR <motorstats.ar@gmail.com>, siempre', /^From: MotorStats AR <motorstats\.ar@gmail\.com>\r\n/.test(msj));
  check('el asunto con acentos va codificado (RFC 2047)', /Subject: =\?UTF-8\?B\?/.test(msj)
    && Buffer.from(/Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(msj)[1], 'base64').toString('utf8') === 'Último aviso: ñandú');
  check('multipart/alternative con texto y HTML en base64', /multipart\/alternative/.test(msj) && /text\/plain; charset=UTF-8/.test(msj) && /text\/html; charset=UTF-8/.test(msj));
  check('un destinatario con salto de línea (inyección de encabezados) se rechaza',
    (() => { try { envio.construirMensaje({ para: 'a@b.com\r\nBcc: c@d.com', asunto: 'x' }); return false; } catch (e) { return e.codigo === 'DESTINO_INVALIDO'; } })());

  /* Un servidor SMTP de mentira: contesta como Gmail y guarda lo que recibe. */
  function socketFalso(opciones) {
    const o = opciones || {};
    const oyentes = {};
    const recibido = [];
    let enData = false;
    const s = {
      recibido: recibido,
      on(ev, cb) { oyentes[ev] = cb; if (ev === 'data') setTimeout(() => cb(Buffer.from('220 smtp.gmail.com ESMTP\r\n')), 0); return s; },
      removeAllListeners() { Object.keys(oyentes).forEach(k => delete oyentes[k]); },
      end() {},
      write(t) {
        recibido.push(t);
        const r = (x) => setTimeout(() => oyentes.data && oyentes.data(Buffer.from(x)), 0);
        if (enData) { enData = false; return r('250 2.0.0 OK id\r\n'); }
        if (/^EHLO/.test(t)) return r('250-smtp.gmail.com\r\n250 AUTH LOGIN PLAIN\r\n');
        if (/^AUTH PLAIN/.test(t)) return r(o.claveMala ? '535 5.7.8 Username and Password not accepted\r\n' : '235 2.7.0 Accepted\r\n');
        if (/^MAIL FROM/.test(t) || /^RCPT TO/.test(t)) return r('250 OK\r\n');
        if (/^DATA/.test(t)) { enData = true; return r('354 Go ahead\r\n'); }
        if (/^QUIT/.test(t)) return r('221 bye\r\n');
        return r('500 que\r\n');
      },
    };
    return s;
  }
  const s1 = socketFalso();
  const tr = envio.transporteSmtp({ env: { SMTP_PASS: 'abcd efgh ijkl mnop' }, conectar: () => s1 });
  const env1 = await tr.enviar({ para: 'dt@club.com', asunto: 'Prueba', html: '<p>x</p>', texto: '.empieza con punto\nnormal' });
  check('la conversación SMTP completa termina bien', env1.ok && /221/.test(env1.respuesta));
  const auth64 = /AUTH PLAIN (\S+)/.exec(s1.recibido.join(''))[1];
  check('se autentica como motorstats.ar@gmail.com, con la contraseña sin espacios',
    Buffer.from(auth64, 'base64').toString('utf8') === '\u0000motorstats.ar@gmail.com\u0000abcdefghijklmnop');
  check('MAIL FROM es motorstats.ar@gmail.com', s1.recibido.some(t => t === 'MAIL FROM:<motorstats.ar@gmail.com>\r\n'));
  check('el cuerpo termina con la línea de un punto', /\r\n\.\r\n$/.test(s1.recibido.find(t => /^From:/.test(t)) || ''));
  const s2 = socketFalso({ claveMala: true });
  const falla = await envio.transporteSmtp({ env: { SMTP_PASS: 'mala' }, conectar: () => s2 })
    .enviar({ para: 'dt@club.com', asunto: 'x', html: 'x', texto: 'x' }).then(() => null, e => e);
  check('una contraseña rechazada (535) se reporta como SMTP_AUTH, con palabras', falla && falla.codigo === 'SMTP_AUTH' && /contraseña de aplicación/.test(falla.message));
  const sinCred = await envio.transporteSmtp({ env: {} }).enviar({ para: 'a@b.com', asunto: 'x' }).then(() => null, e => e);
  check('sin credencial el transporte ni siquiera conecta', sinCred && sinCred.codigo === 'SIN_CREDENCIAL');

  /* ================================================================ 6 */
  titulo('6 · LAS RUTAS · el secreto del cron y el gate de admin');
  const T_ADMIN = auth.firmarToken({ email: 'freytesgn@gmail.com' }, { expiraEn: '1h' });
  const T_CLIENTE = auth.firmarToken({ email: 'dt@club.com', club: 'cinco', plan: 'ORO' }, { expiraEn: '1h' });
  const pet = (token, extra) => Object.assign({ headers: token ? { authorization: 'Bearer ' + token } : {}, params: {}, body: {} }, extra || {});
  const baseDeps = { kv: kvMemoria(), transporte: envio.transporteMemoria(), catalogo: catalogo, padron: {}, ahora: AHORA };

  let rc = await mails.manejarCronVencimientos(pet(null), Object.assign({}, baseDeps, { env: {} }));
  check('SIN CRON_SECRET la ruta del cron NO corre (503), nunca queda abierta', rc.status === 503 && rc.body.codigo === 'SIN_CRON_SECRET');
  rc = await mails.manejarCronVencimientos(pet('otro-secreto'), Object.assign({}, baseDeps, { env: { CRON_SECRET: 'el-secreto-del-cron-123' } }));
  check('con un secreto equivocado, 401', rc.status === 401);
  rc = await mails.manejarCronVencimientos(pet('el-secreto-del-cron-123'), Object.assign({}, baseDeps, { env: { CRON_SECRET: 'el-secreto-del-cron-123' } }));
  check('con el secreto de Vercel corre y reporta', rc.status === 200 && rc.body.ok && rc.body.hoy === HOY, JSON.stringify(rc.body).slice(0, 120));
  rc = await mails.manejarCronVencimientos(pet(T_CLIENTE), Object.assign({}, baseDeps, { env: { CRON_SECRET: 's' } }));
  check('un cliente con su token NO puede disparar el cron', rc.status === 401);
  rc = await mails.manejarCronVencimientos(pet(T_ADMIN), Object.assign({}, baseDeps, { env: {} }));
  check('el admin sí, para probarlo', rc.status === 200);
  check('comparación del secreto en tiempo constante', mails.mismoSecreto('abc', 'abc') && !mails.mismoSecreto('abc', 'abd') && !mails.mismoSecreto('', ''));

  const rf = await mails.manejarFichas(pet(T_CLIENTE), baseDeps);
  check('las fichas son SOLO del admin: un cliente recibe 403', rf.status === 403);
  const rfa = await mails.manejarFichas(pet(T_ADMIN), baseDeps);
  check('el admin las lee, con el estado del envío', rfa.status === 200 && rfa.body.envio && rfa.body.envio.codigo === 'SIN_CREDENCIAL');
  const esc1 = await mails.manejarFichasEscribir(pet(T_ADMIN, { body: { club: 'cinco', categoria: 'primera',
    ficha: { contacto: 'Ana', email: 'ana@cinco.com', fechaAlta: '2026-09-18', renovacion: 'mensual' }, enviarBienvenida: true } }), baseDeps);
  check('guardar la ficha manda la bienvenida y devuelve el resultado', esc1.status === 200 && esc1.body.bienvenida.resultado === 'enviado'
    && esc1.body.ficha.notificacionesEnviadas.length === 1, JSON.stringify(esc1.body).slice(0, 160));
  const esc2 = await mails.manejarFichasEscribir(pet(T_ADMIN, { body: { club: 'nadie', categoria: 'primera', ficha: { contacto: 'x' } } }), baseDeps);
  check('una ficha para una categoría que no existe: 404', esc2.status === 404);
  const esc3 = await mails.manejarFichasEscribir(pet(T_ADMIN, { body: { club: 'cinco', categoria: 'primera', ficha: { email: 'mal' } } }), baseDeps);
  check('un mail inválido: 400 con el motivo', esc3.status === 400 && /no es válido/.test(esc3.body.mensaje));
  const esc4 = await mails.manejarFichasEscribir(pet(T_ADMIN, { body: { club: 'tres', categoria: 'u23',
    ficha: { email: 'tres@club.com' }, enviarBienvenida: true } }), Object.assign({}, baseDeps, { transporte: roto }));
  check('si Gmail falla, la ficha se guarda igual y la respuesta dice por qué no salió',
    esc4.status === 200 && esc4.body.ficha.email === 'tres@club.com' && esc4.body.bienvenida.resultado === 'error');

  const app = fs.readFileSync('./server/app.js', 'utf8');
  check('las rutas están registradas en app.js', /'\/api\/v1\/fichas'/.test(app) && /'\/api\/cron\/recordatorios-vencimiento'/.test(app));
  check('y NO viven en handlers.js (la única ruta que escribe el catálogo)', !/fichas|recordatorios/.test(fs.readFileSync('./server/api/handlers.js', 'utf8')));
  const vercel = JSON.parse(fs.readFileSync('./server/vercel.json', 'utf8'));
  check('Vercel Cron: todos los días a las 12:00 UTC (09:00 de Argentina)',
    (vercel.crons || []).some(c => c.path === '/api/cron/recordatorios-vencimiento' && c.schedule === '0 12 * * *'));
  check('el script de prueba existe y documenta los dos comandos del pedido',
    /--tipo bienvenida --email/.test(fs.readFileSync('./server/bin/probar-mails.js', 'utf8'))
    && /--tipo recordatorio --dias 3/.test(fs.readFileSync('./server/bin/probar-mails.js', 'utf8')));

  /* ================================================================ 7 */
  titulo('7 · EL PANEL MASTER Y EL CORTE A LAS 23:59 DE ARGENTINA');
  const AUTH = require('./js/sgadd-auth.js');
  check('el corte es a las 23:59 de Argentina: a las 02:00 UTC del día siguiente todavía entra',
    !AUTH.suscripcionVencida('2026-09-30', Date.parse('2026-10-01T02:00:00Z'))
    && AUTH.suscripcionVencida('2026-09-30', Date.parse('2026-10-01T03:00:00Z')));
  check('la copia del servidor es la misma (sincronizar-compartido: encabezado + el original)',
    sinCR(fs.readFileSync('./server/lib/compartido/sgadd-auth.js', 'utf8')).endsWith(sinCR(fs.readFileSync('./js/sgadd-auth.js', 'utf8'))));

  const HUB = (() => {
    const ctx = { console: console, SGADD_UI: { conservarFoco: (fn) => fn() }, location: { origin: 'https://coachgn.github.io', pathname: '/estadisticas/' } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('./js/sgadd-hub.js', 'utf8') + '\nthis.SGADD_HUB = SGADD_HUB;', ctx);
    return ctx.SGADD_HUB;
  })();
  HUB.reiniciarAlta();
  Object.assign(HUB.alta, { club: 'nuevo', nombre: 'Nuevo', categoria: 'nuevo-primera', label: 'Primera',
    contacto: 'Ana', email: 'ana@nuevo.com', vence: '2099-06-30' });
  const zona = HUB.zonaFicha();
  check('el bloque 4 tiene contacto, mail, alta, renovación y vencimiento',
    ['alta-contacto', 'alta-email', 'alta-fechaAlta', 'alta-renovacion', 'alta-vence'].every(id => zona.indexOf('id="' + id + '"') !== -1));
  check('y la URL directa del panel del cliente', zona.indexOf('https://coachgn.github.io/estadisticas/?club=nuevo') !== -1);
  check('la fecha de alta arranca en HOY (de Argentina)', HUB.alta.fechaAlta === '' || /^\d{4}-\d{2}-\d{2}$/.test(HUB.hoyAR()));
  check('el checkbox de la bienvenida arranca tildado y dice desde qué casilla sale',
    /id="alta-bienvenida" checked/.test(zona) && /motorstats\.ar@gmail\.com/.test(zona));
  const cf = HUB.cambiosFicha();
  check('el modal de confirmación enumera la ficha y el mail que va a salir (nada en silencio)',
    cf.some(c => c.label === 'Contacto' && c.despues === 'Ana') && cf.some(c => c.label === 'Mail de bienvenida' && /ana@nuevo\.com/.test(c.despues)));
  check('el vencimiento viaja en el alta de una categoría ACTIVA, no solo en prueba', HUB.intencionAlta().vence === '2099-06-30');
  HUB.elegirBienvenida(false);
  check('destildar la bienvenida la saca del modal', !HUB.cambiosFicha().some(c => c.campo === 'bienvenida'));
  check('un mail inválido bloquea el guardado', (() => { HUB.alta.email = 'no-es-mail'; return /El mail institucional no es válido/.test(HUB.estadoAlta()); })());

  /* ================================================================ 8 */
  titulo('8 · EL ACCESO ADENTRO DE LA BIENVENIDA y la puerta de ingreso');
  const COD = 'Xy7_abcDEF-0123456789ghijklmnopqrstuvwxyzAB';
  const VENCE_INV = Date.parse('2026-09-25T12:00:00Z');
  const conCod = P.bienvenida(Object.assign({}, datos, { para: 'dt@club.com',
    invitacion: { email: 'dt@club.com', codigo: COD, venceEn: VENCE_INV } }));
  check('con invitación, el código va en el HTML y en el texto', conCod.html.indexOf(COD) !== -1 && conCod.texto.indexOf(COD) !== -1);
  check('y el mail de ingreso', /dt@club\.com/.test(conCod.html) && /Mail de ingreso: dt@club\.com/.test(conCod.texto));
  check('con la fecha de vencimiento del código, en castellano', /vence el viernes 25 de septiembre de 2026/.test(conCod.html));
  check('el botón abre el panel directo en «Tengo un código» (?ingreso=codigo)',
    conCod.html.indexOf('href="https://coachgn.github.io/estadisticas/?club=ejemplo&amp;ingreso=codigo"') !== -1
    && /Elegir mi clave e ingresar/.test(conCod.html));
  check('EL CÓDIGO NO VA EN EL LINK: una URL con un secreto queda en historiales y registros',
    !/href="[^"]*Xy7_abc/.test(conCod.html) && conCod.texto.split('\n').filter(l => /https?:\/\//.test(l)).every(l => l.indexOf(COD) === -1));
  check('la clave NUNCA viaja: el mail dice que la elige el cliente', /elegís vos/.test(conCod.html) && !/clave:\s*\S/.test(conCod.texto));
  check('ninguna llave suelta ni con invitación', !/\{\{/.test(conCod.html + conCod.texto));
  const conClave = P.bienvenida(Object.assign({}, datos, { invitacion: { email: 'dt@club.com', conClave: true } }));
  check('con clave ya elegida: le dice con qué mail entra y NO trae código',
    /Ingresá con <strong>dt@club\.com<\/strong> y la clave que ya elegiste/.test(conClave.html) && !/Código de invitación/.test(conClave.html));
  const escCod = P.bienvenida(Object.assign({}, datos, { invitacion: { email: '<x>@y.com', codigo: '<b>', venceEn: VENCE_INV } }));
  check('el código y el mail se ESCAPAN en el HTML', escCod.html.indexOf('<b>') === -1 && escCod.html.indexOf('&lt;b&gt;') !== -1);

  /* --- asegurar(): quién necesita código --- */
  const CAT8 = {
    cinco: { nombre: 'Club Cinco', estado: 'activo', categorias: { primera: { label: 'Primera', plan: 'PLATA', vence: sumar(HOY, 30) } } },
    lleno: { nombre: 'Lleno', estado: 'activo', plan: 'BRONCE', categorias: { primera: { label: 'Primera' } } },
    pausa: { nombre: 'Pausa', estado: 'activo', categorias: { a: { label: 'A', estado: 'pausado' }, b: { label: 'B' } } },
  };
  Object.keys(KV_SIMPLE).forEach(k => delete KV_SIMPLE[k]);
  const a1 = await invitacion.asegurar('cinco', 'Nuevo@Club.com', CAT8, {});
  check('un mail que no estaba: ALTA con código', a1.estado === 'alta' && typeof a1.codigo === 'string' && a1.codigo.length > 20 && a1.email === 'nuevo@club.com');
  const pad1 = await clientes.cargar({});
  check('y queda en el padrón, con la HUELLA del código y no el código', pad1['nuevo@club.com'] && pad1['nuevo@club.com'].club === 'cinco'
    && JSON.stringify(pad1).indexOf(a1.codigo) === -1);
  const a2 = await invitacion.asegurar('cinco', 'nuevo@club.com', CAT8, {});
  check('invitado sin clave: código NUEVO (el viejo no se puede volver a leer)', a2.estado === 'reinvitado' && a2.codigo && a2.codigo !== a1.codigo);
  const pad2 = await clientes.cargar({});
  const fij = await clientes.fijarClave(pad2, 'nuevo@club.com', a2.codigo, 'una frase larga de prueba', Date.now());
  check('el código del mail sirve para fijar la clave', fij.ok, fij.motivo);
  await clientes.guardar(fij.padron, {});
  const a3 = await invitacion.asegurar('cinco', 'nuevo@club.com', CAT8, {});
  check('con clave: NO se genera código ni se toca su acceso', a3.estado === 'con-clave' && !a3.codigo
    && !(await clientes.cargar({}))['nuevo@club.com'].invitacion);
  const a4 = await invitacion.asegurar('lleno', 'nuevo@club.com', CAT8, {});
  check('un mail de OTRO club: sin código y con el motivo', a4.estado === 'sin-acceso' && /un solo club/.test(a4.motivo));
  const a5 = await invitacion.asegurar('cinco', 'freytesgn@gmail.com', CAT8, {});
  check('un admin no se da de alta como cliente', a5.estado === 'sin-acceso' && /administrador/.test(a5.motivo));
  await invitacion.asegurar('lleno', 'uno@lleno.com', CAT8, {});
  await invitacion.asegurar('lleno', 'dos@lleno.com', CAT8, {});
  const a6 = await invitacion.asegurar('lleno', 'tres@lleno.com', CAT8, {});
  check('el CUPO lo decide el mismo camino que «Quiénes pueden entrar» (Bronce: 2)', a6.estado === 'sin-acceso' && /admite 2/.test(a6.motivo), a6.motivo);
  check('paraElMail: código → invitación · con clave → conClave · sin acceso → nada',
    invitacion.paraElMail(a2).codigo === a2.codigo && invitacion.paraElMail(a3).conClave === true && invitacion.paraElMail(a6) === null);
  check('la categoría de la bienvenida: la pedida, si no la primera CON acceso',
    invitacion.categoriaDeBienvenida(CAT8.pausa, 'a') === 'a' && invitacion.categoriaDeBienvenida(CAT8.pausa, '') === 'b'
    && invitacion.categoriaDeBienvenida(CAT8.pausa, 'no-existe') === 'b');

  /* --- la ruta de accesos manda la bienvenida con el código --- */
  const d8 = { kv: kvMemoria(), transporte: envio.transporteMemoria(), catalogo: CAT8, ahora: AHORA };
  const baseFalsa = async (p) => ({ status: 200, body: { ok: true, club: p.body.club, mails: [], codigo: 'COD-DE-PRUEBA-123456', venceEn: VENCE_INV } });
  const rA = await mails.manejarClientesConBienvenida(pet(T_ADMIN, { body: { accion: 'alta', club: 'cinco', email: 'Otro@Club.com' } }), d8, baseFalsa);
  const envA = d8.transporte.enviados.slice(-1)[0];
  check('el alta desde «Quiénes pueden entrar» manda la bienvenida a ESE mail', rA.body.mail && rA.body.mail.resultado === 'enviado' && envA && envA.para === 'otro@club.com', JSON.stringify(rA.body.mail));
  check('con el código que generó el alta adentro', !!envA && envA.texto.indexOf('COD-DE-PRUEBA-123456') !== -1);
  check('y el código sigue en la respuesta, para el «Copiar» de respaldo', rA.body.codigo === 'COD-DE-PRUEBA-123456');
  const antes8 = d8.transporte.enviados.length;
  const rB = await mails.manejarClientesConBienvenida(pet(T_ADMIN, { body: { accion: 'alta', club: 'cinco', email: 'x@club.com', enviarMail: false } }), d8, baseFalsa);
  check('enviarMail: false no manda nada', d8.transporte.enviados.length === antes8 && rB.body.mail === null);
  await mails.manejarClientesConBienvenida(pet(T_ADMIN, { body: { accion: 'baja', club: 'cinco', email: 'x@club.com' } }), d8,
    async () => ({ status: 200, body: { ok: true, club: 'cinco', mails: [] } }));
  check('una BAJA no manda ningún mail', d8.transporte.enviados.length === antes8);
  const rC = await mails.manejarClientesConBienvenida(pet(T_ADMIN, { body: { accion: 'reinvitar', club: 'cinco', email: 'y@club.com' } }),
    Object.assign({}, d8, { transporte: roto }), baseFalsa);
  check('si Gmail falla, el acceso queda y la respuesta dice por qué no llegó', rC.status === 200 && rC.body.codigo && rC.body.mail.resultado === 'error');
  const rD = await mails.manejarClientesConBienvenida(pet(T_ADMIN, { body: { accion: 'alta', club: 'cinco', email: 'z@club.com' } }), d8,
    async () => ({ status: 400, body: { ok: false, mensaje: 'cupo' } }));
  check('si el alta falla (cupo, mail repetido), no sale ningún mail', rD.status === 400 && !rD.body.mail);
  check('la ruta real envuelve al handler de accesos sin tocar handlers.js',
    /manejarClientesConBienvenida\(p, d, h\.manejarClientesEscribir\)/.test(fs.readFileSync('./server/app.js', 'utf8')));

  /* --- la ficha con bienvenida da el acceso --- */
  Object.keys(KV_SIMPLE).forEach(k => delete KV_SIMPLE[k]);
  const d9 = { kv: kvMemoria(), transporte: envio.transporteMemoria(), catalogo: CAT8, ahora: AHORA };
  const rF = await mails.manejarFichasEscribir(pet(T_ADMIN, { body: { club: 'cinco', categoria: 'primera',
    ficha: { contacto: 'Ana', email: 'ana@cinco.com' }, enviarBienvenida: true } }), d9);
  const envF = d9.transporte.enviados.slice(-1)[0];
  check('guardar la ficha con bienvenida da de ALTA al mail y el mail lleva el código',
    rF.body.acceso && rF.body.acceso.estado === 'alta' && !!envF && envF.texto.indexOf(rF.body.acceso.codigo) !== -1, JSON.stringify(rF.body).slice(0, 200));
  check('el padrón quedó con ese mail en el club', ((await clientes.cargar({}))['ana@cinco.com'] || {}).club === 'cinco');

  /* --- la puerta de ingreso (`?club=` sin sesión) --- */
  let pidioJson = false;
  const puerta = (busqueda, storage, api) => {
    const alm = (m) => ({ getItem: (k) => (m && m[k]) || null, setItem() {}, removeItem() {} });
    const ctx = { console: { log() {}, error() {}, info() {}, warn() {} }, URLSearchParams: URLSearchParams,
      atob: (b) => Buffer.from(b, 'base64').toString('binary'),
      sessionStorage: alm(storage), localStorage: alm({}),
      fetch: () => { pidioJson = true; return Promise.reject(new Error('no')); },
      document: { readyState: 'complete', getElementById: () => null, documentElement: { style: { setProperty() {} } },
        addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), body: { appendChild() {} } },
      location: { search: busqueda, href: 'https://x/' + busqueda, pathname: '/' } };
    ctx.window = ctx; ctx.SGADD_API = api === undefined ? 'https://api' : api;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('./js/sgadd-club.js', 'utf8') + '\nthis.CLUB = CLUB;', ctx);
    return ctx.CLUB;
  };
  const jwt = (exp) => 'h.' + Buffer.from(JSON.stringify({ email: 'a@b.com', exp: exp })).toString('base64') + '.f';
  check('?club= sin sesión es la PUERTA: se comporta como la landing',
    puerta('?club=hogar-social').puertaDeIngreso() === true && puerta('?club=hogar-social').esLanding() === true);
  check('con un token vigente guardado NO es la puerta',
    puerta('?club=hogar-social', { 'sgadd.token': jwt(Math.floor(Date.now() / 1000) + 3600) }).puertaDeIngreso() === false);
  check('con un token VENCIDO sí (hay que volver a entrar)',
    puerta('?club=hogar-social', { 'sgadd.token': jwt(Math.floor(Date.now() / 1000) - 60) }).puertaDeIngreso() === true);
  check('un link firmado (?token=) no es la puerta: trae la sesión', puerta('?club=hogar-social&token=abc').puertaDeIngreso() === false);
  check('sin backend configurado tampoco (ahí no hay contra qué autenticar)', puerta('?club=hogar-social', null, '').puertaDeIngreso() === false);
  check('sin ?club= es la landing de siempre, no la puerta', puerta('').puertaDeIngreso() === false && puerta('?demo=1&club=x').puertaDeIngreso() === false);
  pidioJson = false;
  const cPuerta = puerta('?club=hogar-social');
  await new Promise(r => setTimeout(r, 20));
  check('en la puerta NO se pide clubes/<id>.json (era un 404 en consola) ni sale el cartel rojo',
    cPuerta.estado.puerta === true && !cPuerta.estado.error && !cPuerta.estado.cfg && !pidioJson);
  const LAND = fs.readFileSync('./js/sgadd-landing.js', 'utf8');
  check('cada sección muestra la tarjeta de ingreso, con «Ingresar» y «Tengo un código»',
    /function puerta\(slug\)/.test(LAND) && /SGADD_LOGIN\.abrir\('ingresar'\)/.test(LAND) && /SGADD_LOGIN\.abrir\('fijar'\)/.test(LAND));
  const LAND_M = require('./js/sgadd-landing.js');
  check('el nombre sale del slug del link', LAND_M.nombreDeSlug('hogar-social') === 'Hogar Social');
  const IDX = fs.readFileSync('./index.html', 'utf8');
  check('el arranque abre el login solo, y en «elegí tu clave» con ?ingreso=codigo',
    /CLUB\.puertaDeIngreso\(\)[\s\S]{0,300}SGADD_LOGIN\.abrir\(modo\)/.test(IDX) && /get\('ingreso'\) === 'codigo'/.test(IDX));
  const LOGIN = fs.readFileSync('./js/sgadd-login.js', 'utf8');
  check('después del login desde la puerta se RECARGA (el arranque fue el de la landing)',
    /CLUB\.estado\.puerta/.test(LOGIN) && /\(club && club !== enUrl\) \|\| enPuerta/.test(LOGIN) && /searchParams\.delete\('ingreso'\)/.test(LOGIN));
  const HUBSRC = fs.readFileSync('./js/sgadd-hub.js', 'utf8');
  check('el código queda como alternativa: plegado si el mail salió, a la vista si no',
    /verCodigo = !!\(r\.codigo && !\(r\.mail && r\.mail\.resultado === 'enviado'\)\)/.test(HUBSRC) && /Ver el código para pasarlo por otro canal \(opcional\)/.test(HUBSRC));

  console.log('\n' + '═'.repeat(70) + '\n' + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
