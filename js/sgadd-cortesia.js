/* =====================================================================
   EL PASE DE CORTESÍA EN EL PANEL (punto 179)

   Tres piezas, todas en este archivo:

   1 · LA PUERTA. El link `?club=<torneo>&pase=<código>` abre el formulario
       del pase: el DT confirma su nombre y su WhatsApp —obligatorio— y
       recibe el token de la muestra. `sgadd-club.js` ya sacó el código de
       la barra.
   2 · LA BARRA. Mientras dura la muestra, arriba de todo: el equipo, los
       días que quedan y el botón para reservar la licencia por WhatsApp.
   3 · LOS RIVALES DE MUESTRA del Scouting híbrido. El informe pre-partido
       se arma con los datos REALES del equipo del pase contra un rival que
       sale del snapshot anónimo de la demo (`demo/datos-demo.json`, ya
       público): el DT ve el informe funcionando sin que se exponga el
       análisis de ningún rival de su liga. El rival se injerta en la copia
       del índice que usa solo Scouting (punto 79), medido contra SU liga.

   Lo que decide qué datos salen es el SERVIDOR (`server/rutas/cortesias.js`):
   esto es la vidriera. Un rival de la liga elegido a mano por el hash no
   pasa: `scoutPintar` lo suelta.
   ===================================================================== */

const SGADD_CORTESIA = (function () {
  'use strict';

  const INFO = 'sgadd.paseInfo';
  const WHATSAPP_MS = '5492216143994';
  const ROLES = ['Entrenador/a', 'Asistente', 'Preparador/a físico/a', 'Coordinador/a', 'Dirigente', 'Otro'];
  const estado = { abierto: false, cargando: false, yendo: false, error: '', info: null, codigo: null,
    campos: { nombre: '', whatsapp: '', email: '', rol: 'Entrenador/a', club: '' } };

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fechaCorta(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }
  function legible(n) {
    const s = (typeof SGADD !== 'undefined' && SGADD.limpiarNombre) ? SGADD.limpiarNombre(n) : String(n || '');
    return String(s || n || '').toLowerCase().replace(/(^|[\s(.'-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
  }

  /* --------------------------------------------------------------- estado */

  /** ¿La sesión abierta es la de un pase? Lo dice el token (sin verificar:
      solo decide qué se pinta; el servidor decide qué sale). */
  function activa() {
    try {
      if (typeof SGADD_AUTH === 'undefined' || !SGADD_AUTH.token()) return false;
      const p = SGADD_AUTH.leerPayload(SGADD_AUTH.token());
      return !!(p && p.cortesia);
    } catch (e) { return false; }
  }
  function info() {
    try { return JSON.parse(window.sessionStorage.getItem(INFO) || 'null'); } catch (e) { return null; }
  }
  /* Días de calendario de Argentina hasta el vencimiento (el mismo cálculo
     que el servidor): 0 si ya pasó, 1 el último día. */
  function diasRestantes(vence, ahora) {
    const t = ahora || Date.now();
    if (new Date(vence).getTime() <= t) return 0;
    const hoy = new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const fin = String(vence || '').slice(0, 10);
    return Math.max(1, Math.round((Date.parse(fin + 'T00:00:00Z') - Date.parse(hoy + 'T00:00:00Z')) / 86400000));
  }

  function urlReserva() {
    const i = info() || {};
    const t = 'Hola MotorStats, estuve viendo la muestra de ' + legible(i.equipo || 'mi equipo')
      + (i.torneo ? ' en ' + i.torneo : '') + ' y quiero reservar la licencia para el próximo torneo.';
    return 'https://wa.me/' + WHATSAPP_MS + '?text=' + encodeURIComponent(t);
  }

  /* ---------------------------------------------------------------- puerta */

  function slot() {
    let s = document.getElementById('cortesiaSlot');
    if (!s) { s = document.createElement('div'); s.id = 'cortesiaSlot'; document.body.appendChild(s); }
    return s;
  }

  function faltantes() {
    const c = estado.campos, f = [];
    if (!c.nombre.trim()) f.push('tu nombre');
    if (String(c.whatsapp).replace(/\D/g, '').length < 10) f.push('tu WhatsApp');
    if (c.email.trim() && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(c.email.trim())) f.push('un mail válido');
    return f;
  }

  function html() {
    const i = estado.info;
    const cab = `<div class="flex items-center gap-2 mb-3"><img src="logos/motorlogo-64.png" alt="" width="28" height="28" class="rounded-full" onerror="this.style.display='none'">
      <span class="font-display uppercase tracking-wide text-sm text-ink">Muestra de MotorStats</span></div>`;
    if (estado.cargando) return cab + '<p class="text-sm text-muted" role="status">Buscando tu muestra…</p>';
    if (!i) {
      return cab + `<p class="text-sm text-ink mb-3">${esc(estado.error || 'Este link no es válido o ya no está disponible.')}</p>
        <a class="inline-block bg-accent text-base font-semibold text-sm rounded-md px-4 py-2" href="https://wa.me/${WHATSAPP_MS}" target="_blank" rel="noopener">Escribinos por WhatsApp</a>`;
    }
    const c = estado.campos;
    const f = faltantes();
    const vencida = i.estado !== 'activo';
    const campo = (id, etiqueta, tipo, extra) => `<label class="block mb-3">
      <span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">${esc(etiqueta)}</span>
      <input id="cortesia_${id}" type="${tipo}" value="${esc(c[id])}" ${extra || ''}
        oninput="SGADD_CORTESIA.campo('${id}', this.value)"
        class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none"></label>`;
    if (vencida) {
      return cab + `<p class="text-sm text-ink mb-1">La muestra de <strong>${esc(legible(i.equipo))}</strong> terminó el ${esc(fechaCorta(i.vence))}.</p>
        <p class="text-sm text-muted mb-3">Escribinos y la seguimos, o reservá tu licencia para el torneo.</p>
        <a class="inline-block bg-accent text-base font-semibold text-sm rounded-md px-4 py-2" href="https://wa.me/${WHATSAPP_MS}" target="_blank" rel="noopener">Escribir por WhatsApp</a>`;
    }
    return cab + `
      <p class="text-sm text-ink mb-1">Te armamos el panel con los datos reales de <strong>${esc(legible(i.equipo))}</strong>
        en ${esc(i.torneo)}.</p>
      <p class="text-[12px] text-muted mb-4">Disponible hasta el ${esc(fechaCorta(i.vence))} · te quedan ${i.diasRestantes} día${i.diasRestantes === 1 ? '' : 's'}.
        Confirmá tus datos y entrás, sin crear usuario.</p>
      ${campo('nombre', 'Nombre y apellido', 'text', 'autocomplete="name"')}
      ${campo('whatsapp', 'WhatsApp' + (i.whatsappPista ? ' · el que nos pasaste termina en ' + i.whatsappPista.slice(-4) : ''), 'tel', 'autocomplete="tel" inputmode="tel" placeholder="221 555 1234"')}
      ${campo('email', 'Mail (opcional)', 'email', 'autocomplete="email"')}
      <label class="block mb-3"><span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Rol</span>
        <select onchange="SGADD_CORTESIA.campo('rol', this.value)" class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm">
          ${ROLES.map(r => `<option ${r === c.rol ? 'selected' : ''}>${esc(r)}</option>`).join('')}
        </select></label>
      ${estado.error ? `<p class="text-sm mb-3" style="color:#f87171" role="alert">${esc(estado.error)}</p>` : ''}
      <p id="cortesiaFaltan" class="text-[11px] text-muted mb-2">${f.length ? 'Falta ' + esc(f.join(', ')) + '.' : ''}</p>
      <button id="cortesiaEntrar" type="button" onclick="SGADD_CORTESIA.enviar()" ${f.length || estado.yendo ? 'disabled' : ''}
        class="w-full bg-accent text-base font-semibold text-sm rounded-md px-4 py-2.5 disabled:opacity-50">${estado.yendo ? 'Entrando…' : 'Ver la muestra'}</button>
      <p class="text-[11px] text-muted mt-3">Tus datos los usamos solo para contactarte por la muestra.</p>`;
  }

  function pintar() {
    const s = slot();
    s.innerHTML = estado.abierto ? `<div class="login-fondo" role="dialog" aria-modal="true" aria-label="Muestra de MotorStats">
      <div class="login-caja card rounded-xl p-5 border border-hairline">${html()}</div></div>` : '';
  }

  /* Tipear NO repinta (le sacaría el foco al input): solo actualiza el
     aviso de lo que falta y el botón. */
  function campo(id, v) {
    if (!(id in estado.campos)) return;
    estado.campos[id] = String(v == null ? '' : v);
    const f = faltantes();
    const b = document.getElementById('cortesiaEntrar');
    if (b) b.disabled = !!f.length || estado.yendo;
    const t = document.getElementById('cortesiaFaltan');
    if (t) t.textContent = f.length ? 'Falta ' + f.join(', ') + '.' : '';
  }

  function abrir(codigo) {
    estado.abierto = true; estado.cargando = true; estado.error = ''; estado.codigo = codigo;
    pintar();
    return SGADD_DATA.paseConsultar(codigo).then((r) => {
      estado.cargando = false;
      estado.info = r;
      if (r.nombre && !estado.campos.nombre) estado.campos.nombre = r.nombre;
      if (!estado.campos.club) estado.campos.club = legible(r.equipo);
      pintar();
      const p = document.getElementById(estado.campos.nombre ? 'cortesia_whatsapp' : 'cortesia_nombre');
      if (p) p.focus();
    }).catch((e) => {
      estado.cargando = false; estado.info = null; estado.error = (e && e.message) || '';
      pintar();
    });
  }

  function enviar() {
    if (estado.yendo || faltantes().length) return;
    estado.yendo = true; estado.error = '';
    pintar();
    const c = estado.campos;
    return SGADD_DATA.paseCanjear(estado.codigo, { nombre: c.nombre, whatsapp: c.whatsapp, email: c.email, rol: c.rol, club: c.club })
      .then((r) => {
        try {
          window.sessionStorage.setItem(INFO, JSON.stringify({ equipo: r.equipo, vence: r.vence,
            torneo: (estado.info && estado.info.torneo) || '', zona: (estado.info && estado.info.zona) || '' }));
        } catch (e) { /* sin storage: la barra queda sin los días */ }
        SGADD_AUTH.establecerToken(r.token);
        if (typeof CLUB !== 'undefined' && CLUB.consumirPase) CLUB.consumirPase();
        const u = new URL(window.location.href);
        u.searchParams.set('club', r.club);
        u.hash = '#principal';
        /* Con el mismo `?club=` cambiar solo el hash NO recarga, y el
           arranque fue el de la puerta (sin datos): hay que recargar. */
        const destino = u.toString();
        if (destino.split('#')[0] === window.location.href.split('#')[0]) {
          window.history.replaceState(window.history.state, '', destino);
          window.location.reload();
        } else window.location.href = destino;
      }).catch((e) => {
        estado.yendo = false; estado.error = (e && e.message) || 'No se pudo entrar.';
        pintar();
      });
  }

  /* ----------------------------------------------------------------- barra */

  function barra() {
    if (!activa()) return '';
    const i = info() || {};
    let eq = i.equipo;
    try { if (!eq) eq = SGADD_AUTH.leerPayload(SGADD_AUTH.token()).equipoAsignado; } catch (e) {}
    const d = i.vence ? diasRestantes(i.vence) : null;
    const cuando = d === null ? '' : d === 0 ? ' · la muestra terminó'
      : ' · te quedan ' + d + ' día' + (d === 1 ? '' : 's') + ' (hasta el ' + fechaCorta(i.vence) + ')';
    return `<div id="cortesiaBarra" class="no-imprimir" role="region" aria-label="Muestra de cortesía"
      style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.5rem 1rem;padding:.5rem 1rem;background:#0f2a1f;border-bottom:1px solid #1f5c43;font-size:13px;color:#d1fae5;">
      <span>🎟 <strong>Muestra de cortesía</strong> · ${esc(legible(eq || ''))}${esc(cuando)}</span>
      <a href="${esc(urlReserva())}" target="_blank" rel="noopener"
        style="background:#4ade80;color:#052e16;font-weight:700;border-radius:6px;padding:.35rem .8rem;text-decoration:none;">Reservar tu licencia</a>
    </div>`;
  }
  function montarBarra() {
    if (typeof document === 'undefined' || document.getElementById('cortesiaBarra')) return;
    const h = barra();
    if (h) document.body.insertAdjacentHTML('afterbegin', h);
  }

  /* -------------------------------------------- los rivales de la muestra */

  const DEMO = { promesa: null, lista: [], seriales: {} };

  /** Tres rivales del snapshot de la demo: el de arriba, uno del medio y el
      de abajo de su tabla, así el informe se ve con rivales distintos. */
  function cargarRivales() {
    if (DEMO.promesa) return DEMO.promesa;
    const datos = (typeof SGADD_DEMO !== 'undefined' && SGADD_DEMO.DATOS) || 'demo/datos-demo.json';
    DEMO.promesa = fetch(datos).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((crudo) => {
        const hojas = SGADD_DEMO.rehidratar(crudo);
        const idx = SGADD.construirIndice(hojas, { fase: 'REGULAR', torneo: 'GENERAL' });
        const eqs = idx.lista().filter(e => e.clave !== 'EQUIPO 1')
          .map(e => ({ e: e, net: (idx.leer(e.clave, 'NET RTNG') || {}).valor }))
          .filter(x => typeof x.net === 'number').sort((a, b) => b.net - a.net);
        const elegidos = eqs.length >= 3 ? [eqs[0], eqs[Math.floor(eqs.length / 2)], eqs[eqs.length - 1]] : eqs;
        DEMO.lista = elegidos.map((x, i) => {
          const s = idx.exportarEquipo(x.e.clave);
          if (s && s.equipo && s.equipo.__ligaOrigen) s.equipo.__ligaOrigen.label = 'Liga de muestra';
          DEMO.seriales[x.e.clave] = s;
          return { clave: x.e.clave, nombre: 'Rival de muestra ' + 'ABC'[i], zonaLabel: 'datos anonimizados', cruce: x.e.nombre, estado: '' };
        });
        return DEMO.lista;
      });
    return DEMO.promesa;
  }
  function rivales() { return DEMO.lista.slice(); }
  function esRivalDeMuestra(clave) { return DEMO.lista.some(r => r.clave === clave); }
  function serial(clave) {
    return cargarRivales().then(() => DEMO.seriales[clave] || null);
  }

  /* =====================================================================
     EL PANEL MASTER · «🎟 Pases de cortesía»

     Crear un pase (torneo, zona, equipo, vigencia y el DT con su WhatsApp
     obligatorio), abrir WhatsApp con el mensaje prearmado y llevar la lista
     con sus contactos. Va plegado y en su propio contenedor (`#hubCortesias`):
     sus acciones repintan solo eso, y tipear no repinta nada.
     ===================================================================== */
  const DIAS = [3, 5, 7, 10, 15];
  const AYUDA = 'El pase da el Plan PLATA sobre su equipo: Scouting con rivales de muestra anonimizados.';
  const adm = { abierto: false, cargado: false, cargando: false, error: '', pases: [], envio: null, yendo: false,
    f: { torneo: '', zona: '', equipo: '', dias: 7, diasLibre: '', nombre: '', whatsapp: '', email: '', nota: '', pbp: true } };
  let clubesAdmin = [];

  function torneosDe(cs) { return (cs || []).filter(c => c.tipo === 'torneo'); }
  function zonasDe(t) { return ((t && t.categorias) || []).filter(k => !k.interzonal && k.activo); }
  function diasElegidos() {
    return adm.f.diasLibre !== '' ? parseInt(adm.f.diasLibre, 10) : adm.f.dias;
  }
  function faltanAdmin() {
    const f = adm.f, out = [];
    if (!f.torneo || !f.zona) out.push('la zona');
    if (!f.equipo) out.push('el equipo');
    const d = diasElegidos();
    if (!(Number.isInteger(d) && d >= 1 && d <= 60)) out.push('la vigencia (1 a 60 días)');
    if (!f.nombre.trim()) out.push('el nombre del entrenador');
    if (String(f.whatsapp).replace(/[^0-9]/g, '').length < 10) out.push('su WhatsApp');
    return out;
  }

  function cargarPases() {
    adm.cargando = true; adm.error = '';
    return SGADD_DATA.cortesias().then((r) => { adm.pases = r.pases || []; adm.cargado = true; adm.cargando = false; repintarAdmin(); })
      .catch((e) => { adm.cargando = false; adm.cargado = true; adm.error = (e && e.message) || 'No se pudieron leer los pases.'; repintarAdmin(); });
  }

  function chipEstado(p) {
    const t = { activo: ['#4ade80', 'activo · ' + p.diasRestantes + ' d'], vencido: ['#fbbf24', 'vencido'],
      revocado: ['#f87171', 'revocado'], convertido: ['#5eead4', 'convertido'] }[p.estadoEfectivo] || ['#94a3b8', p.estadoEfectivo];
    return `<span style="color:${t[0]};border:1px solid currentColor;border-radius:999px;padding:0 .45rem;font-size:11px;white-space:nowrap">${esc(t[1])}</span>`;
  }

  function adminFormHtml(cs) {
    const f = adm.f;
    const ts = torneosDe(cs);
    const t = ts.find(x => x.id === f.torneo);
    const zs = zonasDe(t);
    const z = zs.find(k => k.slug === f.zona);
    const eqs = ((z && z.equipos) || []).slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
    const sel = 'w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm';
    const lab = (txt, cuerpo) => `<label class="block"><span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">${esc(txt)}</span>${cuerpo}</label>`;
    const inp = (id, tipo, ph) => `<input type="${tipo}" value="${esc(f[id])}" placeholder="${esc(ph || '')}" oninput="SGADD_CORTESIA.adminCampo('${id}', this.value)" class="${sel}">`;
    const falta = faltanAdmin();
    return `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${lab('Torneo', `<select class="${sel}" onchange="SGADD_CORTESIA.adminElegir('torneo', this.value)"><option value="">Elegir…</option>
          ${ts.map(x => `<option value="${esc(x.id)}" ${x.id === f.torneo ? 'selected' : ''}>${esc(x.nombre || x.id)}</option>`).join('')}</select>`)}
        ${lab('Zona', `<select class="${sel}" onchange="SGADD_CORTESIA.adminElegir('zona', this.value)" ${t ? '' : 'disabled'}><option value="">Elegir…</option>
          ${zs.map(k => `<option value="${esc(k.slug)}" ${k.slug === f.zona ? 'selected' : ''}>${esc(k.label || k.slug)}</option>`).join('')}</select>`)}
        ${lab('Equipo', `<select class="${sel}" onchange="SGADD_CORTESIA.adminElegir('equipo', this.value)" ${z ? '' : 'disabled'}><option value="">Elegir…</option>
          ${eqs.map(e => `<option value="${esc(e.nombre)}" ${e.nombre === f.equipo ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select>`)}
      </div>
      <div class="mt-3">
        <span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Vigencia</span>
        <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Vigencia del pase">
          ${DIAS.map(d => `<button type="button" aria-pressed="${f.diasLibre === '' && f.dias === d}" onclick="SGADD_CORTESIA.adminDias(${d})"
            class="text-xs font-semibold rounded border px-3 py-2 ${f.diasLibre === '' && f.dias === d ? 'bg-accent text-base border-transparent' : 'border-hairline hover:bg-surface2'}">${d} días</button>`).join('')}
          <span class="text-xs text-muted">o</span>
          <input type="number" min="1" max="60" step="1" value="${esc(f.diasLibre)}" placeholder="otro" aria-label="Días personalizados"
            oninput="SGADD_CORTESIA.adminCampo('diasLibre', this.value)" class="w-24 bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm">
          <span class="text-xs text-muted">días</span>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        ${lab('Entrenador · nombre', inp('nombre', 'text', 'Nombre y apellido'))}
        ${lab('WhatsApp (obligatorio)', inp('whatsapp', 'tel', '221 555 1234'))}
        ${lab('Mail (opcional)', inp('email', 'email', ''))}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mt-3 items-end">
        ${lab('Nota interna (opcional)', inp('nota', 'text', 'De dónde vino, qué le interesa…'))}
        <label class="flex items-center gap-2 text-xs text-ink py-2"><input type="checkbox" ${f.pbp ? 'checked' : ''} onchange="SGADD_CORTESIA.adminCampo('pbp', this.checked)"> Incluir el play-by-play de su equipo</label>
      </div>
      <p id="cortesiaAdmFalta" class="text-[11px] text-muted mt-3">${falta.length ? 'Falta ' + esc(falta.join(', ')) + '.' : esc(AYUDA)}</p>
      <button id="cortesiaAdmCrear" type="button" onclick="SGADD_CORTESIA.adminCrear()" ${falta.length || adm.yendo ? 'disabled' : ''}
        class="mt-2 bg-accent text-base font-semibold text-sm rounded-md px-4 py-2 disabled:opacity-50">${adm.yendo ? 'Guardando…' : 'Crear el pase'}</button>`;
  }

  function adminEnvioHtml() {
    const e = adm.envio;
    if (!e) return '';
    return `<div class="mt-4 rounded-lg border p-3" data-cortesia-envio="1" style="border-color:#1f5c43;background:rgba(74,222,128,.06)">
      <p class="text-xs text-ink mb-2"><strong>Pase listo para ${esc(legible(e.pase.equipo))}</strong> · vence el ${esc(fechaCorta(e.pase.vence))}.
        El link se muestra solo ahora: para volver a mandarlo, «Reenviar» genera uno nuevo.</p>
      <div class="flex flex-wrap gap-2 items-center mb-2">
        <a href="${esc(e.whatsappUrl)}" target="_blank" rel="noopener" class="font-semibold text-sm rounded-md px-4 py-2" style="background:#25d366;color:#052e16">Enviar por WhatsApp</a>
        <button type="button" onclick="SGADD_CORTESIA.adminCopiar()" class="text-xs border border-hairline rounded px-3 py-2 hover:bg-surface2">Copiar link</button>
      </div>
      <textarea readonly rows="8" class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-xs" aria-label="Mensaje de invitación">${esc(e.mensaje)}</textarea>
    </div>`;
  }

  function adminListaHtml() {
    if (adm.cargando && !adm.cargado) return '<p class="text-xs text-muted mt-4" role="status">Leyendo los pases…</p>';
    if (adm.error) return `<p class="text-xs mt-4" style="color:#f87171" role="alert">${esc(adm.error)}</p>`;
    if (!adm.pases.length) return '<p class="text-xs text-muted mt-4">Todavía no hay pases.</p>';
    return `<div class="scrollbox mt-4"><table class="w-full text-xs">
      <thead><tr><th>Equipo</th><th>Torneo · zona</th><th>Entrenador</th><th>Estado</th><th>Ingresos</th><th></th></tr></thead>
      <tbody>${adm.pases.map(p => {
        const c = p.contactos || [];
        const inv = p.invitado || {};
        return `<tr>
          <td>${esc(legible(p.equipo))}</td>
          <td>${esc(p.torneoNombre)} · ${esc(p.zonaLabel)}</td>
          <td>${esc(inv.nombre || '')}<br><a class="text-muted" href="https://wa.me/${esc(inv.whatsapp || '')}" target="_blank" rel="noopener">+${esc(inv.whatsapp || '')}</a></td>
          <td>${chipEstado(p)}<br><span class="text-muted">hasta ${esc(fechaCorta(p.vence))}</span></td>
          <td title="${esc(c.map(x => x.nombre + ' · +' + x.whatsapp + (x.rol ? ' · ' + x.rol : '')).join(' | '))}">${p.usos || 0}<br><span class="text-muted">${c.length} contacto${c.length === 1 ? '' : 's'}${p.ultimoUso ? ' · ' + esc(fechaCorta(p.ultimoUso)) : ''}</span></td>
          <td class="whitespace-nowrap">
            <button type="button" onclick="SGADD_CORTESIA.adminAccion('regenerar','${esc(p.id)}')" class="border border-hairline rounded px-2 py-1 hover:bg-surface2">Reenviar</button>
            <button type="button" onclick="SGADD_CORTESIA.adminAccion('extender','${esc(p.id)}')" class="border border-hairline rounded px-2 py-1 hover:bg-surface2">+${diasElegidos() || 7} d</button>
            ${p.estado === 'activo' ? `<button type="button" onclick="SGADD_CORTESIA.adminAccion('revocar','${esc(p.id)}')" class="border border-hairline rounded px-2 py-1 hover:bg-surface2" style="color:#f87171">Revocar</button>` : ''}
          </td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function adminHtml(cs) {
    if (cs) clubesAdmin = cs;
    if (adm.abierto && !adm.cargado && !adm.cargando) setTimeout(cargarPases, 0);
    return `<details class="card hub-plegable rounded-xl border border-hairline" ${adm.abierto ? 'open' : ''}
      ontoggle="SGADD_CORTESIA.adminToggle(this.open)">
      <summary class="cursor-pointer p-4 sm:p-5"><span class="font-display uppercase tracking-wide text-sm text-ink">🎟 Pases de cortesía</span>
        <span class="text-[11px] text-muted ml-2">una muestra con datos reales, sin dar de alta un cliente</span></summary>
      <div class="px-4 sm:px-5 pb-4 sm:pb-5">${adm.abierto ? adminFormHtml(clubesAdmin) + adminEnvioHtml() + adminListaHtml() : ''}</div>
    </details>`;
  }
  function repintarAdmin() {
    const r = typeof document !== 'undefined' && document.getElementById('hubCortesias');
    if (r) r.innerHTML = adminHtml();
  }
  /* El plegado vive en el módulo, no en el DOM (punto 13): la pestaña se
     repinta entera y un `open` en el nodo se perdería. */
  function adminToggle(abierto) {
    if (adm.abierto === !!abierto) return;
    adm.abierto = !!abierto;
    repintarAdmin();
  }
  function adminCampo(id, v) {
    if (!(id in adm.f)) return;
    adm.f[id] = id === 'pbp' ? !!v : String(v == null ? '' : v);
    const falta = faltanAdmin();
    const b = typeof document !== 'undefined' && document.getElementById('cortesiaAdmCrear');
    if (b) b.disabled = !!falta.length || adm.yendo;
    const t = typeof document !== 'undefined' && document.getElementById('cortesiaAdmFalta');
    if (t) t.textContent = falta.length ? 'Falta ' + falta.join(', ') + '.' : AYUDA;
  }
  function adminElegir(id, v) {
    adm.f[id] = v || '';
    if (id === 'torneo') { adm.f.zona = ''; adm.f.equipo = ''; }
    if (id === 'zona') adm.f.equipo = '';
    repintarAdmin();
  }
  function adminDias(d) { adm.f.dias = d; adm.f.diasLibre = ''; repintarAdmin(); }

  /* Nada se aplica en silencio (punto 30): cada acción pasa por el modal. */
  function hacer(intencion, cambios, titulo, confirmar) {
    const correr = () => {
      adm.yendo = true; adm.error = ''; repintarAdmin();
      return SGADD_DATA.guardarCortesia(intencion).then((r) => {
        adm.yendo = false;
        if (r.link) adm.envio = { pase: r.pase, link: r.link, mensaje: r.mensaje, whatsappUrl: r.whatsappUrl };
        return cargarPases();
      }).catch((e) => { adm.yendo = false; adm.error = (e && e.message) || 'No se pudo guardar.'; repintarAdmin(); });
    };
    if (typeof SGADD_CONFIRMAR !== 'undefined') {
      SGADD_CONFIRMAR.abrir({ titulo: titulo, confirmar: confirmar, cambios: cambios, alConfirmar: correr });
      return null;
    }
    return correr();
  }
  function adminCrear() {
    if (faltanAdmin().length) return null;
    const f = adm.f, d = diasElegidos();
    const t = torneosDe(clubesAdmin).find(x => x.id === f.torneo) || {};
    const z = zonasDe(t).find(k => k.slug === f.zona) || {};
    return hacer({ accion: 'crear', torneo: f.torneo, zona: f.zona, equipo: f.equipo, dias: d, pbp: f.pbp, nota: f.nota,
      invitado: { nombre: f.nombre, whatsapp: f.whatsapp, email: f.email } }, [
      { label: 'Equipo', antes: '—', despues: f.equipo },
      { label: 'Zona', antes: '—', despues: (t.nombre || f.torneo) + ' · ' + (z.label || f.zona) },
      { label: 'Vigencia', antes: '—', despues: d + ' días · Plan PLATA' + (f.pbp ? ' + play-by-play' : '') },
      { label: 'Entrenador', antes: '—', despues: f.nombre + ' · ' + f.whatsapp },
    ], 'Crear el pase de cortesía', 'Crear el pase');
  }
  function adminAccion(accion, id) {
    const p = adm.pases.find(x => x.id === id) || {};
    const d = diasElegidos() || 7;
    const textos = {
      regenerar: ['Reenviar el pase', 'Generar un link nuevo', [{ label: 'Link', antes: 'el actual', despues: 'uno nuevo (el actual deja de servir)' }]],
      extender: ['Extender el pase', 'Extender', [{ label: 'Vence', antes: fechaCorta(p.vence), despues: d + ' días desde hoy' }]],
      revocar: ['Revocar el pase', 'Revocar', [{ label: 'Estado', antes: 'activo', despues: 'revocado (la muestra se corta ya)' }]],
    }[accion];
    if (!textos) return null;
    return hacer({ accion: accion, id: id, dias: d }, [{ label: 'Pase', antes: '—', despues: legible(p.equipo) }].concat(textos[2]), textos[0], textos[1]);
  }
  function adminCopiar() {
    const l = adm.envio && adm.envio.link;
    if (!l) return;
    try { navigator.clipboard.writeText(l); } catch (e) { /* sin portapapeles: el link está en el mensaje */ }
  }

  return { activa, info, abrir, cerrar: () => { estado.abierto = false; pintar(); }, campo, enviar,
    barra, montarBarra, urlReserva, cargarRivales, rivales, esRivalDeMuestra, serial, diasRestantes, ROLES,
    adminHtml, adminToggle, adminCampo, adminElegir, adminDias, adminCrear, adminAccion, adminCopiar, faltanAdmin,
    _adm: adm };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CORTESIA;
