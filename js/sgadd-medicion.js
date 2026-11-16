/* =====================================================================
   SGADD_MEDICION · la medición después del clic (punto 180)

   Carga ANTES que sgadd-club.js: tiene que leer los UTM de la URL antes
   de que cualquier otro script reescriba la barra.

   Qué hace:
   · guarda los UTM de la primera página de la VISITA en sessionStorage
     (`sgadd.utm`). Una visita sin UTM queda «(directo)»;
   · manda cuatro eventos, cada uno UNA vez por visita: landing,
     demo_abierta, tour_fin y pedido_demo;
   · al servidor van solo el evento y los UTM. Ni un dato de la persona,
     ni cookies, ni identificadores. Con «No rastrear» del navegador
     encendido no se manda nada.

   Nunca rompe nada: todo va con try/catch y un fallo de red se ignora.
   ===================================================================== */
(function (raiz) {
  'use strict';

  const EVENTOS = ['landing', 'demo_abierta', 'tour_fin', 'pedido_demo'];
  const CAMPOS = ['source', 'medium', 'campaign', 'content'];
  const CLAVE_UTM = 'sgadd.utm';
  const CLAVE_ENVIADOS = 'sgadd.medicion.enviados';

  function ss() { try { return raiz.sessionStorage || null; } catch (e) { return null; } }

  /** Los UTM de una búsqueda («?a=b»). PURO. */
  function utmDe(busqueda) {
    let q;
    try { q = new URLSearchParams(busqueda || ''); } catch (e) { return null; }
    const out = {};
    let alguno = false;
    CAMPOS.forEach(k => {
      const v = q.get('utm_' + k);
      if (v) { out[k] = String(v).slice(0, 80); alguno = true; }
    });
    return alguno ? out : null;
  }

  /* LA PRIMERA PÁGINA DE LA VISITA MANDA: si después navega con otro UTM
     (un link interno), la visita sigue atribuida a la pieza que la trajo. */
  function capturar() {
    const s = ss();
    if (!s) return;
    try {
      const u = utmDe(raiz.location && raiz.location.search);
      const previo = JSON.parse(s.getItem(CLAVE_UTM) || 'null');
      /* Una visita que arrancó sin UTM y después llega por un link
         etiquetado sí toma la pieza: lo vacío no es una atribución. */
      if (previo && Object.keys(previo).length) return;
      if (previo && !u) return;
      s.setItem(CLAVE_UTM, JSON.stringify(u || {}));
    } catch (e) { /* sin storage: la visita queda directa */ }
  }

  function utm() {
    const s = ss();
    try { return (s && JSON.parse(s.getItem(CLAVE_UTM) || '{}')) || {}; } catch (e) { return {}; }
  }

  function noRastrear() {
    try {
      const n = raiz.navigator || {};
      return n.doNotTrack === '1' || raiz.doNotTrack === '1' || n.globalPrivacyControl === true;
    } catch (e) { return false; }
  }

  function base() {
    try {
      const q = new URLSearchParams(raiz.location.search);
      return String(q.get('api') || raiz.SGADD_API || '').replace(/\/+$/, '');
    } catch (e) { return String(raiz.SGADD_API || '').replace(/\/+$/, ''); }
  }

  function enviados() {
    const s = ss();
    try { return (s && JSON.parse(s.getItem(CLAVE_ENVIADOS) || '[]')) || []; } catch (e) { return []; }
  }

  /** Registra un evento, una vez por visita. Devuelve si salió. */
  function registrar(evento) {
    try {
      if (EVENTOS.indexOf(evento) === -1 || noRastrear()) return false;
      const ya = enviados();
      if (ya.indexOf(evento) !== -1) return false;
      const url = base();
      if (!url) return false;
      const s = ss();
      if (s) { try { s.setItem(CLAVE_ENVIADOS, JSON.stringify(ya.concat(evento))); } catch (e) { /* nada */ } }
      const cuerpo = JSON.stringify({ eventos: [{ evento: evento, utm: utm() }] });
      const destino = url + '/api/v1/medicion';
      /* sendBeacon sobrevive a que la página se vaya (el pedido abre
         WhatsApp); fetch con keepalive es el respaldo. */
      const n = raiz.navigator;
      if (n && typeof n.sendBeacon === 'function' && typeof raiz.Blob === 'function') {
        if (n.sendBeacon(destino, new raiz.Blob([cuerpo], { type: 'text/plain' }))) return true;
      }
      if (typeof raiz.fetch === 'function') {
        raiz.fetch(destino, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo, keepalive: true }).catch(() => null);
        return true;
      }
    } catch (e) { /* nunca rompe */ }
    return false;
  }

  /* LOS DOS EVENTOS DEL ARRANQUE salen solos: la demo o la landing. Los
     otros dos los disparan sgadd-tour.js (tour_fin) y sgadd-demo.js
     (pedido_demo). */
  function alArrancar() {
    try {
      /* CLUB es un `const` global: no cuelga de window. */
      const c = (typeof CLUB !== 'undefined') ? CLUB : raiz.CLUB;
      if (c && typeof c.enDemo === 'function' && c.enDemo()) return registrar('demo_abierta');
      if (c && typeof c.esLanding === 'function' && c.esLanding()) return registrar('landing');
    } catch (e) { /* nada */ }
    return false;
  }

  capturar();
  if (raiz.document && raiz.document.addEventListener) {
    raiz.document.addEventListener('DOMContentLoaded', alArrancar);
  }

  const api = { EVENTOS, CAMPOS, utmDe, utm, registrar, alArrancar, noRastrear };
  raiz.SGADD_MEDICION = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
