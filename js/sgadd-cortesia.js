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


  /* ===================================================================
     FASE 2 · LA TELEMETRÍA, LA PANTALLA DE CIERRE Y LA FIRMA DEL PDF
     =================================================================== */

  /* Nombres de las secciones para el resumen de cierre. Una que no esté
     acá sale con su id capitalizado: no se esconde lo que se miró. */
  const NOMBRES = { principal: 'Principal', equipos: 'Equipos', jugadores: 'Jugadores', clasificacion: 'Clasificación',
    fixture: 'Fixture', scouting: 'Scouting', glosario: 'Glosario', simulador: 'Simulador', ciclos: 'Ciclos' };
  const FIN = ['CORTESIA_VENCIDO', 'CORTESIA_REVOCADO', 'CORTESIA_CONVERTIDO', 'CORTESIA_INEXISTENTE'];

  function paseId() {
    try { const p = SGADD_AUTH.leerPayload(SGADD_AUTH.token()); return (p && p.cortesia) || null; } catch (e) { return null; }
  }
  function claveLog() { const id = paseId(); return id ? 'sgadd.paseLog.' + id : null; }
  function almacen() { try { return window.localStorage; } catch (e) { return null; } }
  /** Lo explorado en ESTE navegador: lo lee la pantalla de cierre. */
  function log() {
    const k = claveLog(), a = almacen();
    let l = null;
    try { l = (k && a) ? JSON.parse(a.getItem(k) || 'null') : null; } catch (e) { l = null; }
    return Object.assign({ ingresos: 0, secciones: {}, exportes: {} }, l || {});
  }
  function guardarLog(l) {
    const k = claveLog(), a = almacen();
    try { if (k && a) a.setItem(k, JSON.stringify(l)); } catch (e) { /* sin storage: el cierre sale sin resumen */ }
  }

  /* Una vista por sección y por sesión, un ingreso por sesión: la
     telemetría cuenta interés, no clics. */
  const enviado = {};
  function yaContado(k) {
    try {
      if (window.sessionStorage.getItem('sgadd.paseVisto.' + k)) return true;
      window.sessionStorage.setItem('sgadd.paseVisto.' + k, '1');
      return false;
    } catch (e) { if (enviado[k]) return true; enviado[k] = 1; return false; }
  }

  let cola = [];
  let reloj = null;
  /**
   * Registra un evento de la muestra: 'ingreso', 'vista' (con la sección)
   * o 'export' (con el nombre del informe). Lo suma al log local y lo manda
   * al servidor en lote, sin esperar. Fuera de un pase no hace nada.
   */
  function registrar(tipo, dato) {
    if (!activa()) return false;
    const id = paseId();
    if (tipo === 'vista') {
      dato = String(dato || '').toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,29}$/.test(dato)) return false;
      if (yaContado(id + '.v.' + dato)) return false;
    } else if (tipo === 'ingreso') {
      if (yaContado(id + '.ingreso')) return false;
    } else if (tipo === 'export') {
      dato = String(dato || 'Informe').slice(0, 60);
    } else return false;
    const l = log();
    if (tipo === 'ingreso') l.ingresos += 1;
    else if (tipo === 'vista') l.secciones[dato] = (l.secciones[dato] || 0) + 1;
    else l.exportes[dato] = (l.exportes[dato] || 0) + 1;
    guardarLog(l);
    cola.push(tipo === 'ingreso' ? { tipo: tipo } : { tipo: tipo, dato: dato });
    if (!reloj) reloj = setTimeout(vaciar, 1500);
    return true;
  }
  function vaciar() {
    reloj = null;
    const lote = cola.splice(0, 20);
    if (!lote.length || typeof SGADD_DATA === 'undefined' || !SGADD_DATA.paseActividad) return null;
    return SGADD_DATA.paseActividad(lote).catch((e) => { if (e && FIN.indexOf(e.codigo) !== -1) terminar(e.codigo); });
  }

  /** ¿La muestra ya venció? Lo dice la fecha que vino con el canje. */
  function vencida(ahora) {
    const i = info();
    return !!(i && i.vence && new Date(i.vence).getTime() <= (ahora || Date.now()));
  }

  /** El resumen de lo explorado, PURO: lo pinta el cierre y se testea. */
  function resumen(l) {
    const x = l || log();
    const secs = Object.keys(x.secciones || {}).sort((a, b) => (x.secciones[b] - x.secciones[a]) || a.localeCompare(b))
      .map(k => ({ id: k, nombre: NOMBRES[k] || (k.charAt(0).toUpperCase() + k.slice(1)), veces: x.secciones[k] }));
    const exps = Object.keys(x.exportes || {}).map(k => ({ nombre: k, veces: x.exportes[k] }));
    return { ingresos: x.ingresos || 0, secciones: secs, exportes: exps,
      totalExportes: exps.reduce((t, e) => t + e.veces, 0) };
  }

  function finHtml(motivo) {
    const i = info() || {};
    const r = resumen();
    const eq = legible(i.equipo || '');
    const convertido = motivo === 'CORTESIA_CONVERTIDO';
    const titulo = convertido ? 'Tu muestra se convirtió en tu licencia' : 'Tu muestra terminó';
    const bajada = convertido ? 'Ya sos cliente: entrá con tu usuario y tu clave para ver el panel completo.'
      : (motivo === 'CORTESIA_REVOCADO' ? 'La muestra de ' + esc(eq) + ' ya no está disponible.'
        : 'La muestra de <strong>' + esc(eq) + '</strong>' + (i.vence ? ' terminó el ' + esc(fechaCorta(i.vence)) : ' terminó') + '.');
    const lista = r.secciones.length
      ? '<ul class="list-disc pl-5 text-sm text-ink">' + r.secciones.map(x => '<li>' + esc(x.nombre) + (x.veces > 1 ? ' <span class="text-muted">· ' + x.veces + ' sesiones</span>' : '') + '</li>').join('') + '</ul>'
      : '<p class="text-sm text-muted">No quedó registro de lo que miraste en este navegador.</p>';
    const exp = r.totalExportes ? '<p class="text-sm text-ink mt-2">Exportaste ' + r.totalExportes + ' informe' + (r.totalExportes === 1 ? '' : 's') + ' en PDF.</p>' : '';
    return `<div class="login-fondo" id="cortesiaFin" role="dialog" aria-modal="true" aria-labelledby="cortesiaFinTitulo">
      <div class="login-caja card rounded-xl p-5 border border-hairline">
        <div class="flex items-center gap-2 mb-3"><img src="logos/motorlogo-64.png" alt="" width="28" height="28" class="rounded-full" onerror="this.style.display='none'">
          <span class="font-display uppercase tracking-wide text-[11px] text-muted">Muestra de cortesía · MotorStats AR</span></div>
        <h2 id="cortesiaFinTitulo" class="font-display uppercase tracking-wide text-base text-ink mb-1">${titulo}</h2>
        <p class="text-sm text-ink mb-3">${bajada}</p>
        ${convertido ? '' : `<p class="text-[10px] uppercase tracking-wider text-muted font-display mb-1">Lo que exploraste${r.ingresos ? ' · ' + r.ingresos + ' ingreso' + (r.ingresos === 1 ? '' : 's') : ''}</p>
        ${lista}${exp}
        <p class="text-sm text-ink mt-3">Con la licencia tenés todo esto con tus rivales reales, cargado solo después de cada fecha.</p>`}
        <div class="modal-acciones flex flex-wrap items-center gap-3 mt-4">
          ${convertido ? '' : `<a href="${esc(urlReserva())}" target="_blank" rel="noopener" class="font-semibold text-sm rounded-md px-4 py-2" style="background:#25d366;color:#052e16">Reservar tu licencia por WhatsApp</a>`}
          <button type="button" onclick="SGADD_CORTESIA.salir()" class="text-xs border border-hairline rounded px-3 py-2 hover:bg-surface2">${convertido ? 'Ingresar' : 'Volver al inicio'}</button>
        </div>
      </div></div>`;
  }

  let terminada = false;
  /** Muestra el cierre. No se cierra con Esc ni con un clic afuera: la
      muestra terminó y el panel atrás ya no trae datos. */
  function terminar(motivo) {
    if (terminada || typeof document === 'undefined') return false;
    terminada = true;
    const s = slot();
    s.innerHTML = finHtml(motivo || 'CORTESIA_VENCIDO');
    const b = document.getElementById('cortesiaBarra');
    if (b) b.remove();
    return true;
  }
  function salir() {
    if (typeof SGADD_LOGIN !== 'undefined' && SGADD_LOGIN.salir) return SGADD_LOGIN.salir();
    try { SGADD_AUTH.limpiarToken(); SGADD_AUTH.limpiarSesion(); window.localStorage.removeItem('sgadd.token'); } catch (e) {}
    window.location.href = 'index.html';
    return null;
  }

  /** Al arrancar con el token de un pase: el cierre si ya venció; si no,
      el ingreso, la barra y una mirada cada 5 minutos por si vence con la
      pestaña abierta. */
  function iniciarMuestra() {
    if (!activa()) return false;
    if (vencida()) return terminar('CORTESIA_VENCIDO');
    registrar('ingreso');
    montarBarra();
    try { setInterval(() => { if (vencida()) terminar('CORTESIA_VENCIDO'); }, 5 * 60 * 1000); } catch (e) {}
    return true;
  }

  /** La firma de las exportaciones mientras dura la muestra. */
  function firmaPdf() {
    if (!activa()) return '';
    const i = info() || {};
    return 'Muestra de cortesía · MotorStats AR' + (i.vence ? ' · vence ' + fechaCorta(i.vence) : '');
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
  const adm = { abierto: false, cargado: false, cargando: false, error: '', pases: [], solicitudes: [], envio: null, yendo: false, aviso: '', conv: null, convResultado: null,
    f: { torneo: '', zona: '', equipo: '', dias: 7, diasLibre: '', nombre: '', whatsapp: '', email: '', nota: '', pbp: true, solicitudId: '' } };
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
    return SGADD_DATA.cortesias().then((r) => { adm.pases = r.pases || []; adm.solicitudes = r.solicitudes || []; adm.cargado = true; adm.cargando = false; repintarAdmin(); })
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
      ${adm.aviso ? `<p class="text-[12px] mt-3 zona-texto zona-aviso" role="status">${esc(adm.aviso)}</p>` : ''}
      <p id="cortesiaAdmFalta" class="text-[11px] text-muted mt-3">${falta.length ? 'Falta ' + esc(falta.join(', ')) + '.' : esc(AYUDA)}</p>
      <div class="flex flex-wrap items-center gap-3 mt-2">
        <button id="cortesiaAdmCrear" type="button" onclick="SGADD_CORTESIA.adminCrear()" ${falta.length || adm.yendo ? 'disabled' : ''}
          class="bg-accent text-base font-semibold text-sm rounded-md px-4 py-2 disabled:opacity-50">${adm.yendo ? 'Guardando…' : (f.solicitudId ? 'Aprobar y emitir el pase' : 'Crear el pase')}</button>
        ${f.solicitudId ? '<button type="button" onclick="SGADD_CORTESIA.adminSoltarSolicitud()" class="text-xs text-muted hover:text-ink">Cancelar la aprobación</button>' : ''}
      </div>`;
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
      <thead><tr><th>Equipo</th><th>Torneo · zona</th><th>Entrenador</th><th>Estado</th><th>Ingresos</th><th>Actividad</th><th></th></tr></thead>
      <tbody>${adm.pases.map(p => {
        const c = p.contactos || [];
        const inv = p.invitado || {};
        if (p.estado === 'convertido') return filaConvertida(p, inv);
        return `<tr>
          <td>${esc(legible(p.equipo))}</td>
          <td>${esc(p.torneoNombre)} · ${esc(p.zonaLabel)}</td>
          <td>${esc(inv.nombre || '')}<br><a class="text-muted" href="https://wa.me/${esc(inv.whatsapp || '')}" target="_blank" rel="noopener">+${esc(inv.whatsapp || '')}</a></td>
          <td>${chipEstado(p)}<br><span class="text-muted">hasta ${esc(fechaCorta(p.vence))}</span></td>
          <td title="${esc(c.map(x => x.nombre + ' · +' + x.whatsapp + (x.rol ? ' · ' + x.rol : '')).join(' | '))}">${p.usos || 0}<br><span class="text-muted">${c.length} contacto${c.length === 1 ? '' : 's'}${p.ultimoUso ? ' · ' + esc(fechaCorta(p.ultimoUso)) : ''}</span></td>
          <td>${actividadHtml(p.actividad)}</td>
          <td class="whitespace-nowrap">
            <button type="button" onclick="SGADD_CORTESIA.adminAccion('regenerar','${esc(p.id)}')" class="border border-hairline rounded px-2 py-1 hover:bg-surface2">Reenviar</button>
            <button type="button" onclick="SGADD_CORTESIA.adminAccion('extender','${esc(p.id)}')" class="border border-hairline rounded px-2 py-1 hover:bg-surface2">+${diasElegidos() || 7} d</button>
            ${p.estado === 'activo' ? `<button type="button" onclick="SGADD_CORTESIA.adminAccion('revocar','${esc(p.id)}')" class="border border-hairline rounded px-2 py-1 hover:bg-surface2" style="color:#f87171">Revocar</button>` : ''}
            <button type="button" onclick="SGADD_CORTESIA.adminConvertir('${esc(p.id)}')" class="bg-accent text-base font-semibold rounded px-2 py-1">Convertir en cliente</button>
          </td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  /* Un pase convertido ya no tiene acciones de pase: dice en qué cliente
     terminó, con qué plan y si la bienvenida salió. */
  function filaConvertida(p, inv) {
    const cv = p.convertido || {};
    const mail = cv.bienvenida === 'enviado' ? 'bienvenida enviada' : (cv.bienvenida ? 'bienvenida: ' + cv.bienvenida : '');
    return `<tr>
      <td>${esc(legible(p.equipo))}</td>
      <td>${esc(p.torneoNombre)} · ${esc(p.zonaLabel)}</td>
      <td>${esc(inv.nombre || '')}<br><span class="text-muted">${esc(cv.email || '')}</span></td>
      <td>${chipEstado(p)}<br><span class="text-muted">${esc(fechaCorta(cv.fecha))}</span></td>
      <td>${p.usos || 0}</td>
      <td>${actividadHtml(p.actividad)}</td>
      <td class="text-muted">→ ${esc((cv.club || '') + ' / ' + (cv.categoria || ''))}<br>${esc((cv.plan || '') + (mail ? ' · ' + mail : ''))}</td></tr>`;
  }

  /* =====================================================================
     FASE 3 · CONVERTIR EN CLIENTE

     Un panel debajo de la lista con lo que se va a dar de alta, todo
     precargado desde el pase: plan (PLATA por defecto), el mail del DT
     (OBLIGATORIO: es a donde va la bienvenida con sus credenciales; si el
     pase no lo tenía, se escribe acá), el id del club y su nombre. Tipear
     no repinta (punto 13): solo habilita el botón. El alta en sí pasa por
     el modal de confirmación, que enumera lo que se crea.
     ===================================================================== */
  const PLANES_CONV = ['BRONCE', 'PLATA', 'ORO'];
  const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function emailDe(p) {
    const inv = String(((p && p.invitado) || {}).email || '').trim().toLowerCase();
    if (inv) return inv;
    const c = ((p && p.contactos) || []).slice()
      .sort((a, b) => String((b && b.ultimoIngreso) || '').localeCompare(String((a && a.ultimoIngreso) || '')))
      .find(x => x && x.email);
    return c ? String(c.email).trim().toLowerCase() : '';
  }
  function idClub(equipo) {
    return legible(equipo).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }
  function faltanConversion(cv) {
    const out = [];
    if (!cv) return ['el pase'];
    if (!MAIL.test(String(cv.email || '').trim())) out.push('el mail del entrenador');
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(cv.club || ''))) out.push('el id del club (minúsculas y guiones)');
    if (!String(cv.nombreClub || '').trim()) out.push('el nombre del club');
    if (PLANES_CONV.indexOf(cv.plan) === -1) out.push('el plan');
    return out;
  }
  /* Un id que ya es un cliente no se pisa: el alta le SUMA la categoría.
     Se dice antes de confirmar, para que no sea una sorpresa. */
  function textoConv(cv) {
    const falta = faltanConversion(cv);
    if (falta.length) return 'Falta ' + falta.join(', ') + '.';
    const ya = (clubesAdmin || []).find(c => c && c.id === cv.club);
    if (ya && ya.tipo === 'torneo') return 'Ese id es de un torneo: elegí otro.';
    if (ya) return 'Ese club ya existe (' + (ya.nombre || ya.id) + '): se le suma esta categoría.';
    return 'Listo para dar de alta.';
  }
  function adminConvertir(id) {
    const p = adm.pases.find(x => x.id === id);
    if (!p || p.estado === 'convertido') return null;
    const club = idClub(p.equipo);
    adm.conv = { id: id, plan: 'PLATA', email: emailDe(p), mailDelPase: !!emailDe(p),
      club: club, nombreClub: legible(p.equipo), categoria: club + '-' + p.zona };
    adm.convResultado = null;
    repintarAdmin();
    const n = typeof document !== 'undefined' && document.getElementById('cortesiaConv');
    if (n && n.scrollIntoView) n.scrollIntoView({ block: 'center' });
    return adm.conv;
  }
  function adminConvCampo(campo, v) {
    if (!adm.conv || ['plan', 'email', 'club', 'nombreClub'].indexOf(campo) === -1) return;
    adm.conv[campo] = campo === 'club' ? String(v || '').trim().toLowerCase() : String(v == null ? '' : v);
    if (campo === 'club') adm.conv.categoria = adm.conv.club + '-' + ((adm.pases.find(x => x.id === adm.conv.id) || {}).zona || '');
    const falta = faltanConversion(adm.conv);
    const b = typeof document !== 'undefined' && document.getElementById('cortesiaConvOk');
    if (b) b.disabled = !!falta.length || adm.yendo;
    const t = typeof document !== 'undefined' && document.getElementById('cortesiaConvFalta');
    if (t) t.textContent = textoConv(adm.conv);
  }
  function adminConvCancelar() { adm.conv = null; adm.convResultado = null; repintarAdmin(); }

  function adminConvHtml() {
    const cv = adm.conv;
    if (adm.convResultado) {
      const r = adm.convResultado;
      const ok = r.bienvenida && r.bienvenida.resultado === 'enviado';
      return `<div class="mt-4 rounded-lg border p-3 text-xs" role="status" data-cortesia-conv-ok="1" style="border-color:${ok ? '#1f5c43' : '#8a5206'}">
        <p class="text-ink font-semibold">✓ Cliente dado de alta: ${esc(r.club)} / ${esc(r.categoria)} · Plan ${esc(r.plan)}</p>
        <p class="mt-1 ${ok ? 'text-muted' : ''}" style="${ok ? '' : 'color:#fbbf24'}">${ok ? 'Bienvenida con sus credenciales enviada a ' + esc(r.email) + '.'
          : 'La bienvenida no salió (' + esc((r.bienvenida && (r.bienvenida.mensaje || r.bienvenida.resultado)) || 'sin detalle') + '). El alta quedó hecha: reenviala desde la ficha del cliente.'}</p>
        ${r.acceso && r.acceso.codigo && !ok ? `<p class="mt-1">Código de invitación de respaldo: <code>${esc(r.acceso.codigo)}</code></p>` : ''}
        <button type="button" onclick="SGADD_CORTESIA.adminConvCancelar()" class="mt-2 border border-hairline rounded px-2 py-1 hover:bg-surface2">Cerrar</button></div>`;
    }
    if (!cv) return '';
    const p = adm.pases.find(x => x.id === cv.id) || {};
    const falta = faltanConversion(cv);
    const inp = 'bg-base border border-hairline rounded px-2 py-2 text-xs text-ink w-full';
    return `<div id="cortesiaConv" class="mt-4 rounded-lg border border-hairline p-3" data-cortesia-conv="1">
      <p class="text-sm text-ink font-semibold">Convertir en cliente · ${esc(legible(p.equipo))}</p>
      <p class="text-[11px] text-muted mt-1">Se da de alta en ${esc(p.torneoNombre || '')} · ${esc(p.zonaLabel || '')}, leyendo el libro de esa zona, con ${esc(legible(p.equipo))} como equipo propio. Sale la bienvenida institucional con su código para elegir la clave.</p>
      <div class="grid sm:grid-cols-2 gap-3 mt-3">
        <label class="text-[11px] text-muted">Plan contratado
          <select class="${inp}" onchange="SGADD_CORTESIA.adminConvCampo('plan', this.value)">${PLANES_CONV.map(x => `<option value="${x}" ${x === cv.plan ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="text-[11px] text-muted">Mail del entrenador (obligatorio)${cv.mailDelPase ? '' : ' · el pase no lo tenía'}
          <input id="cortesiaConvEmail" type="email" class="${inp}" value="${esc(cv.email)}" placeholder="dt@club.com" autocomplete="off"
            oninput="SGADD_CORTESIA.adminConvCampo('email', this.value)" aria-required="true"></label>
        <label class="text-[11px] text-muted">Id del club
          <input class="${inp}" value="${esc(cv.club)}" autocomplete="off" oninput="SGADD_CORTESIA.adminConvCampo('club', this.value)"></label>
        <label class="text-[11px] text-muted">Nombre del club
          <input class="${inp}" value="${esc(cv.nombreClub)}" autocomplete="off" oninput="SGADD_CORTESIA.adminConvCampo('nombreClub', this.value)"></label>
      </div>
      <p id="cortesiaConvFalta" class="text-[11px] text-muted mt-2">${esc(textoConv(cv))}</p>
      <div class="flex flex-wrap gap-2 mt-2">
        <button id="cortesiaConvOk" type="button" onclick="SGADD_CORTESIA.adminConvConfirmar()" ${falta.length || adm.yendo ? 'disabled' : ''}
          class="bg-accent text-base font-semibold rounded px-3 py-2 text-xs">Dar de alta y mandar la bienvenida</button>
        <button type="button" onclick="SGADD_CORTESIA.adminConvCancelar()" class="text-xs text-muted hover:text-ink">Cancelar</button>
      </div></div>`;
  }

  function adminConvConfirmar() {
    const cv = adm.conv;
    if (!cv || faltanConversion(cv).length) return null;
    const p = adm.pases.find(x => x.id === cv.id) || {};
    const pedido = { accion: 'convertir', id: cv.id, plan: cv.plan, email: cv.email.trim().toLowerCase(),
      club: cv.club, categoria: cv.categoria, nombreClub: cv.nombreClub.trim() };
    const correr = () => {
      adm.yendo = true; adm.error = ''; repintarAdmin();
      return SGADD_DATA.guardarCortesia(pedido).then((r) => {
        adm.yendo = false; adm.conv = null;
        adm.convResultado = { club: r.club, categoria: r.categoria, plan: r.plan, email: r.email, bienvenida: r.bienvenida, acceso: r.acceso };
        return cargarPases();
      }).catch((e) => { adm.yendo = false; adm.error = (e && e.message) || 'No se pudo convertir.'; repintarAdmin(); });
    };
    const cambios = [
      { label: 'Cliente', antes: '—', despues: cv.nombreClub + ' (' + cv.club + ')' },
      { label: 'Categoría', antes: '—', despues: cv.categoria + ' · ' + (p.torneoNombre || '') + ' · ' + (p.zonaLabel || '') },
      { label: 'Equipo propio', antes: '—', despues: legible(p.equipo) },
      { label: 'Plan', antes: 'cortesía PLATA', despues: cv.plan },
      { label: 'Acceso', antes: '—', despues: cv.email + ' (bienvenida con código)' },
      { label: 'Pase', antes: p.estadoEfectivo || 'activo', despues: 'convertido' },
    ];
    if (typeof SGADD_CONFIRMAR !== 'undefined') {
      SGADD_CONFIRMAR.abrir({ titulo: 'Convertir el pase en cliente', confirmar: 'Dar de alta', cambios: cambios, alConfirmar: correr });
      return null;
    }
    return correr();
  }

  /* La actividad de un pase en una celda: ingresos, secciones y PDF. Las
     secciones van de la más mirada a la menos, con el detalle en el title. */
  function actividadHtml(a) {
    if (!a) return '<span class="text-muted">sin registro</span>';
    const r = resumen(a);
    const top = r.secciones.slice(0, 3).map(x => x.nombre).join(', ');
    const detalle = r.secciones.map(x => x.nombre + ' ×' + x.veces).concat(r.exportes.map(x => 'PDF ' + x.nombre + ' ×' + x.veces)).join(' | ');
    return `<span title="${esc(detalle)}">${a.ingresos || 0} ingreso${a.ingresos === 1 ? '' : 's'} · ${r.totalExportes} PDF`
      + `<br><span class="text-muted">${esc(top || 'sin secciones')}${r.secciones.length > 3 ? '…' : ''}</span></span>`;
  }

  /* ¿Qué equipo del catálogo es el club que escribió? PURA. Cruza las
     palabras del club con los equipos de los torneos (sin las que no
     distinguen: «club», «atlético»…), y si la solicitud dice la liga, solo
     mira los torneos de esa liga. Con empate no propone. */
  const NO_DISTINGUEN = ['club', 'atletico', 'social', 'y', 'de', 'del', 'la', 'el', 'los', 'las', 'asociacion',
    'sociedad', 'cultural', 'biblioteca', 'basquet', 'basket', 'mm', 'cab', 'ca'];
  const LIGA_A_TORNEO = { 'Liga Nacional': /nacional|lnb/i, 'Liga Argentina': /liga argentina|lab/i,
    'APdeB · La Plata': /apb|apdeb|la plata/i, 'ABB · Bahía Blanca': /bah[ií]a/i };
  function palabras(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/['".()-]/g, ' ').split(/\s+/).filter(w => w.length > 1 && NO_DISTINGUEN.indexOf(w) === -1);
  }
  function sugerirEquipo(sol, cs) {
    const d = (sol && sol.datos) || {};
    const pc = palabras(d.club);
    if (!pc.length) return null;
    const filtro = LIGA_A_TORNEO[d.liga] || null;
    const cand = [];
    torneosDe(cs).forEach(t => {
      if (filtro && !filtro.test((t.nombre || '') + ' ' + t.id)) return;
      zonasDe(t).forEach(z => (z.equipos || []).forEach(e => {
        const pe = palabras(e.nombre);
        const comunes = pc.filter(w => pe.indexOf(w) !== -1).length;
        if (comunes) cand.push({ torneo: t.id, zona: z.slug, equipo: e.nombre, puntaje: comunes / Math.max(pc.length, pe.length) });
      }));
    });
    cand.sort((a, b) => b.puntaje - a.puntaje);
    if (!cand.length || (cand[1] && cand[1].puntaje === cand[0].puntaje)) return null;
    return cand[0];
  }

  function adminSolicitudesHtml() {
    const pend = (adm.solicitudes || []).filter(x => x.estado === 'pendiente');
    const cerradas = (adm.solicitudes || []).filter(x => x.estado !== 'pendiente').length;
    if (!adm.cargado) return '';
    const fila = (x) => {
      const d = x.datos || {};
      const sug = sugerirEquipo(x, clubesAdmin);
      const motivo = d.motivo === 'plan' ? 'plan ' + (d.plan || '') : (d.motivo === 'servicio' ? d.servicio : 'demo con sus datos');
      return `<tr>
        <td><strong>${esc(d.club)}</strong><br><span class="text-muted">${esc([d.ciudad, d.pais].filter(Boolean).join(', '))}</span></td>
        <td>${esc(d.nombre || '—')}${d.rol ? '<br><span class="text-muted">' + esc(d.rol) + '</span>' : ''}</td>
        <td><a href="https://wa.me/${esc(d.whatsapp)}" target="_blank" rel="noopener">+${esc(d.whatsapp)}</a></td>
        <td>${esc(d.liga || '—')}<br><span class="text-muted">${esc(motivo)}</span></td>
        <td>${esc(fechaCorta(x.ultima || x.creada))}${x.veces > 1 ? '<br><span class="text-muted">' + x.veces + ' veces</span>' : ''}</td>
        <td>${sug ? esc(sug.equipo) : '<span class="text-muted">elegir</span>'}</td>
        <td class="whitespace-nowrap">
          <button type="button" onclick="SGADD_CORTESIA.adminAprobar('${esc(x.id)}')" class="bg-accent text-base font-semibold rounded px-2 py-1">Aprobar</button>
          <button type="button" onclick="SGADD_CORTESIA.adminDescartar('${esc(x.id)}')" class="border border-hairline rounded px-2 py-1 hover:bg-surface2">Descartar</button>
        </td></tr>`;
    };
    return `<div class="mt-5" data-cortesia-solicitudes="1">
      <p class="font-display uppercase tracking-wide text-xs text-ink mb-1">Solicitudes de demo · ${pend.length} pendiente${pend.length === 1 ? '' : 's'}${cerradas ? ' <span class="text-muted normal-case">(' + cerradas + ' cerradas)</span>' : ''}</p>
      ${pend.length ? `<p class="text-[11px] text-muted mb-2">Llegan desde «Agendar demo con mis datos». «Aprobar» completa el pase con sus datos y el equipo propuesto: revisalo antes de confirmar.</p>
      <div class="scrollbox"><table class="w-full text-xs"><thead><tr><th>Club</th><th>Quién</th><th>WhatsApp</th><th>Liga · motivo</th><th>Cuándo</th><th>Equipo propuesto</th><th></th></tr></thead>
      <tbody>${pend.map(fila).join('')}</tbody></table></div>` : '<p class="text-xs text-muted">No hay solicitudes pendientes.</p>'}
    </div>`;
  }

  function adminHtml(cs) {
    if (cs) clubesAdmin = cs;
    if (adm.abierto && !adm.cargado && !adm.cargando) setTimeout(cargarPases, 0);
    return `<details class="card hub-plegable rounded-xl border border-hairline" ${adm.abierto ? 'open' : ''}
      ontoggle="SGADD_CORTESIA.adminToggle(this.open)">
      <summary class="cursor-pointer p-4 sm:p-5"><span class="font-display uppercase tracking-wide text-sm text-ink">🎟 Pases de cortesía</span>
        <span class="text-[11px] text-muted ml-2">una muestra con datos reales, sin dar de alta un cliente</span></summary>
      <div class="px-4 sm:px-5 pb-4 sm:pb-5">${adm.abierto ? adminSolicitudesHtml() + '<div id="cortesiaAdmForm" class="mt-5">' + adminFormHtml(clubesAdmin) + '</div>' + adminEnvioHtml() + adminListaHtml() + adminConvHtml() : ''}</div>
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
        if (intencion.accion === 'aprobar') { adm.f.solicitudId = ''; adm.aviso = ''; }
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
    const aprobando = !!f.solicitudId;
    return hacer({ accion: aprobando ? 'aprobar' : 'crear', solicitudId: f.solicitudId || undefined,
      torneo: f.torneo, zona: f.zona, equipo: f.equipo, dias: d, pbp: f.pbp, nota: f.nota,
      invitado: { nombre: f.nombre, whatsapp: f.whatsapp, email: f.email } }, [
      { label: 'Equipo', antes: '—', despues: f.equipo },
      { label: 'Zona', antes: '—', despues: (t.nombre || f.torneo) + ' · ' + (z.label || f.zona) },
      { label: 'Vigencia', antes: '—', despues: d + ' días · Plan PLATA' + (f.pbp ? ' + play-by-play' : '') },
      { label: 'Entrenador', antes: '—', despues: f.nombre + ' · ' + f.whatsapp },
    ].concat(aprobando ? [{ label: 'Solicitud', antes: 'pendiente', despues: 'aprobada con este pase' }] : []),
    aprobando ? 'Aprobar la solicitud y emitir el pase' : 'Crear el pase de cortesía', aprobando ? 'Aprobar y emitir' : 'Crear el pase');
  }

  /* APROBAR CON UN CLIC: completa el formulario con los datos de la
     solicitud y el equipo propuesto. Si no falta nada, abre directo el
     modal de confirmación; si falta (el equipo no se pudo proponer), lo
     dice y deja el formulario a la vista para elegirlo. */
  function adminAprobar(id) {
    const x = (adm.solicitudes || []).find(y => y.id === id);
    if (!x) return null;
    const d = x.datos || {};
    const sug = sugerirEquipo(x, clubesAdmin);
    Object.assign(adm.f, { solicitudId: id, nombre: d.nombre || d.club || '', whatsapp: d.whatsapp || '', email: d.email || '',
      nota: 'Solicitud de la landing · ' + (d.club || '') + (d.liga ? ' · ' + d.liga : ''),
      torneo: sug ? sug.torneo : '', zona: sug ? sug.zona : '', equipo: sug ? sug.equipo : '' });
    adm.aviso = sug ? '' : 'No encontré el equipo de «' + (d.club || '') + '» en el catálogo: elegí el torneo, la zona y el equipo, y aprobá.';
    repintarAdmin();
    if (!faltanAdmin().length) return adminCrear();
    const n = typeof document !== 'undefined' && document.getElementById('cortesiaAdmForm');
    if (n && n.scrollIntoView) n.scrollIntoView({ block: 'start' });
    return null;
  }
  function adminSoltarSolicitud() { adm.f.solicitudId = ''; adm.aviso = ''; repintarAdmin(); }
  function adminDescartar(id) {
    const x = (adm.solicitudes || []).find(y => y.id === id) || {};
    return hacer({ accion: 'descartar', solicitudId: id }, [{ label: 'Solicitud', antes: 'pendiente · ' + ((x.datos && x.datos.club) || ''), despues: 'descartada (no se emite un pase)' }],
      'Descartar la solicitud', 'Descartar');
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
    registrar, vaciar, log, resumen, vencida, terminar, finHtml, salir, iniciarMuestra, firmaPdf, FIN,
    barra, montarBarra, urlReserva, cargarRivales, rivales, esRivalDeMuestra, serial, diasRestantes, ROLES,
    adminHtml, adminToggle, adminCampo, adminElegir, adminDias, adminCrear, adminAccion, adminCopiar, faltanAdmin,
    adminAprobar, adminDescartar, adminSoltarSolicitud, sugerirEquipo, actividadHtml,
    adminConvertir, adminConvCampo, adminConvCancelar, adminConvConfirmar, adminConvHtml, faltanConversion, textoConv, emailDe, idClub,
    _adm: adm };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CORTESIA;
