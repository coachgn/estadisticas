/* SGADD · PWA: registro del service worker y botón «Instalar app».

   El botón NO existe hasta que el navegador dice que se puede instalar
   (`beforeinstallprompt`, Chrome/Edge/Android). En iOS Safari ese evento no
   existe: ahí el botón aparece igual y explica el gesto manual (Compartir →
   Agregar a inicio). Ya instalada (modo standalone) no se muestra nada.
   Todo lo que toca el navegador va con try/catch: la PWA es una mejora y no
   puede tumbar el panel. */
const SGADD_PWA = (function () {
  'use strict';

  let evento = null;

  /** ¿Corre ya como app instalada? */
  function esInstalada(win) {
    try {
      win = win || (typeof window !== 'undefined' ? window : null);
      if (!win) return false;
      if (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) return true;
      return !!(win.navigator && win.navigator.standalone);
    } catch (e) { return false; }
  }

  /** iPhone / iPad: no hay `beforeinstallprompt`. */
  function esIos(ua) {
    ua = ua || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    return /iPad|iPhone|iPod/.test(ua);
  }

  /** El service worker solo en https o localhost (en file:// no existe). */
  function swPosible(win) {
    try {
      if (!win || !('serviceWorker' in win.navigator)) return false;
      const h = win.location.hostname;
      return win.location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    } catch (e) { return false; }
  }

  function registrar() {
    if (typeof window === 'undefined' || !swPosible(window)) return;
    window.addEventListener('load', function () {
      try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) { /* sin SW */ }
    });
  }

  function boton() { return typeof document !== 'undefined' ? document.getElementById('pwaInstalar') : null; }
  function nota() { return typeof document !== 'undefined' ? document.getElementById('pwaNota') : null; }

  function mostrar() {
    const b = boton();
    if (b && !esInstalada()) b.hidden = false;
  }
  function ocultar() {
    const b = boton(), n = nota();
    if (b) b.hidden = true;
    if (n) n.hidden = true;
  }

  function instalar() {
    if (evento) {
      const ev = evento;
      evento = null;
      try {
        ev.prompt();
        ev.userChoice.then(function (r) { if (r && r.outcome === 'accepted') ocultar(); else mostrar(); }).catch(function () {});
      } catch (e) { /* el navegador ya no deja */ }
      return;
    }
    const n = nota();
    if (n) {
      n.textContent = esIos()
        ? 'En iPhone o iPad: tocá Compartir y elegí «Agregar a inicio».'
        : 'Abrí el menú del navegador y elegí «Instalar app» o «Agregar a inicio».';
      n.hidden = false;
    }
  }

  function iniciar() {
    if (typeof window === 'undefined') return;
    registrar();
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      evento = e;
      mostrar();
    });
    window.addEventListener('appinstalled', function () { evento = null; ocultar(); });
    const b = boton();
    if (b) b.addEventListener('click', instalar);
    // iOS: sin evento, pero se puede instalar a mano. Solo si no está instalada.
    if (esIos() && !esInstalada()) mostrar();
  }

  const api = { esInstalada, esIos, swPosible, instalar, iniciar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
  }
  return api;
})();
