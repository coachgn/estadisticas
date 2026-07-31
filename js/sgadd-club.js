/* =====================================================================
   SGADD · Configuración por club

   Un solo deploy para todos los clientes. Lo único que cambia entre uno y
   otro es un JSON en `clubes/`. El código nunca se toca.

   Selección por URL:  index.html?club=reconquista
   Cada cliente recibe su link y no ve que existen los demás.

   Este módulo se carga ANTES que el resto: define el tema, el catálogo de
   planillas y la ruta de escudos que van a usar todos los otros módulos.
   ===================================================================== */

const CLUB = (function () {
  'use strict';

  const POR_DEFECTO = 'reconquista';

  /* El tema vive acá y no en constantes sueltas: los gráficos leen de este
     objeto en tiempo de dibujo, así el color de marca sale del JSON. */
  const TEMA = {
    acento: '#f7941e',
    acentoOscuro: '#d97706',
    paleta: ['#f7941e', '#4ade80', '#60a5fa', '#f472b6'],
  };

  const estado = { id: null, cfg: null, error: null, cargado: false };
  let aplicado = false;
  let yaHuboRender = false;

  /* Base del sitio deducida del propio <script>, no de la URL de la pagina.
     Con fetch('clubes/x.json') relativo, si la URL viene sin barra final
     (.../estadisticas?club=x) el navegador resuelve contra la raiz del
     dominio y da 404. Desde el src del script siempre da bien. */
  const BASE = (function () {
    try {
      const sc = document.currentScript ||
        Array.prototype.slice.call(document.getElementsByTagName('script'))
          .filter(x => /sgadd-club\.js/.test(x.src || '')).pop();
      if (sc && sc.src) return sc.src.replace(/js\/sgadd-club\.js.*$/, '');
    } catch (e) {}
    return '';
  })();

  function idDesdeUrl() {
    try {
      const p = new URLSearchParams(window.location.search).get('club');
      return (p && /^[a-z0-9-]+$/i.test(p)) ? p.toLowerCase() : POR_DEFECTO;
    } catch (e) { return POR_DEFECTO; }
  }

  let promesa = null;

  /* Idempotente: si alguien la llama dos veces, comparten la misma promesa. */
  function cargar() {
    if (promesa) return promesa;
    promesa = _cargar();
    return promesa;
  }

  async function _cargar() {
    const id = idDesdeUrl();
    estado.id = id;
    const url = BASE + 'clubes/' + encodeURIComponent(id) + '.json';
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      estado.cfg = await r.json();
      console.log('[CLUB] cargado:', estado.cfg.nombre, '·', url);
    } catch (e) {
      estado.error = e.message || String(e);
      estado.url = url;
      console.error('[CLUB] NO se pudo cargar ' + url + ' → ' + estado.error);
      estado.cfg = null;
    }
    aplicarSeguro();
    estado.cargado = true;
    return estado.cfg;
  }

  /** Si la config no carga, el dashboard queda con los defaults y NO se nota.
      Mejor un cartel visible que un tablero mostrando datos del club equivocado. */
  function cartelError() {
    if (!estado.error) return;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:60;background:#7f1d1d;color:#fff;' +
      'font:12px/1.4 system-ui,sans-serif;padding:8px 14px;display:flex;gap:10px;align-items:center';
    d.innerHTML = '<b>Configuracion del club no encontrada</b>' +
      '<span style="opacity:.85">' + estado.url + ' → ' + estado.error +
      '. El panel esta usando los valores por defecto.</span>' +
      '<button style="margin-left:auto;background:none;border:1px solid #fff6;color:#fff;border-radius:4px;' +
      'padding:2px 8px;cursor:pointer" onclick="this.parentNode.remove()">Cerrar</button>';
    document.body.appendChild(d);
  }

  function aplicar() {
    const c = estado.cfg;
    if (!c) { cartelError(); return; }

    /* Si el <script> corre antes de que exista el header, reintentamos al
       DOMContentLoaded. Sin esto, la config carga bien pero no se ve. */
    if (!document.getElementById('clubNombre')) {
      document.addEventListener('DOMContentLoaded', aplicarSeguro, { once: true });
      return;
    }

    /* --- Marca visible: es la del CLUB, no la del producto --- */
    if (c.nombre) {
      document.title = c.nombre + ' · Panel de Scouting';
      const t = document.getElementById('clubNombre');
      if (t) t.textContent = c.nombreCorto || c.nombre;
    }
    if (c.bajada) {
      const b = document.getElementById('clubBajada');
      if (b) b.textContent = c.bajada;
    }
    ponerEscudo(c);

    /* --- Color de marca por variable CSS.
       Antes estaba escrito a mano en 13 lugares; ahora se cambia en un JSON. */
    if (c.acento) {
      TEMA.acento = c.acento;
      TEMA.acentoOscuro = c.acentoOscuro || c.acento;
      TEMA.paleta = [TEMA.acento].concat(TEMA.paleta.slice(1));
      const raiz = document.documentElement;
      raiz.style.setProperty('--acento', TEMA.acento);
      raiz.style.setProperty('--acento-oscuro', TEMA.acentoOscuro);
    }

    /* --- Catálogo de planillas --- */
    if (typeof SGADD !== 'undefined') {
      if (c.patronEquipoPropio) {
        SGADD.CATALOGO.patronEquipoPropio = new RegExp(c.patronEquipoPropio, 'i');
      }
      if (Array.isArray(c.planillas) && c.planillas.length) {
        SGADD.CATALOGO.planillas = c.planillas.map(p => Object.assign({
          anio: c.anio || new Date().getFullYear(),
          torneo: c.torneo || '',
          modulo: 'sgadd',
          activo: !!p.sheetId,
        }, p));
      }
    }

    /* --- Escudos: pozo compartido + override por liga.
       Dos ciudades tienen rivales distintos, y hay nombres que se repiten
       (hay un Atenas en media Argentina). El de la liga pisa al genérico. --- */
    if (typeof LOGOS !== 'undefined' && c.liga) {
      LOGOS.CFG.basePaths = ['logos/' + c.liga + '/', 'logos/'];
    }

    aplicado = true;
  }

  /* Cada paso va en su propio try: si uno falla (un JSON a medias, un id de
     elemento que cambió), los demás se aplican igual. Antes un error tiraba
     abajo toda la personalización. */
  function aplicarSeguro() {
    try { aplicar(); }
    catch (e) { console.error('[CLUB] error aplicando la config:', e); }
    repintar();
  }

  /* Si la config llega después del primer render, hay que repintar: si no,
     el panel queda con los datos del catálogo por defecto. */
  function repintar() {
    try {
      if (typeof LOGOS !== 'undefined' && LOGOS.CFG.basePaths) {
        // Los 404 anteriores quedaron cacheados: hay que reintentar.
        if (typeof equiposPintar === 'function' && typeof currentSection !== 'undefined' && currentSection === 'equipos') equiposPintar();
      }
      if (typeof renderSection === 'function' && typeof currentSection !== 'undefined' && aplicado && yaHuboRender) {
        renderSection(currentSection);
      }
    } catch (e) { console.warn('[CLUB] repintado omitido:', e); }
  }

  /* El escudo del club se resuelve en cascada:
       1. `escudo` del JSON, si existe el archivo
       2. el logo del PROPIO equipo, que ya está en logos/<liga>/
       3. nada (se oculta)
     Así no hay que subir un archivo extra: el club ya tiene su escudo
     cargado como equipo de la liga. */
  function ponerEscudo(c) {
    const img = document.getElementById('clubEscudo');
    if (!img) return;

    const candidatos = [];
    if (c.escudo) candidatos.push(c.escudo);

    // El logo del equipo propio, si LOGOS ya lo resolvió.
    if (typeof LOGOS !== 'undefined' && c.patronEquipoPropio) {
      const propio = (c.nombreCorto || c.patronEquipoPropio);
      const url = LOGOS.getUrl(propio) || LOGOS.getUrl(c.patronEquipoPropio + " 'A'");
      if (url) candidatos.push(url);
    }

    (function probar(i) {
      if (i >= candidatos.length) { img.classList.add('hidden'); return; }
      img.onload = () => img.classList.remove('hidden');
      img.onerror = () => probar(i + 1);
      img.src = candidatos[i];
    })(0);
  }

  /* LOGOS resuelve los escudos después de que carga la config, así que
     reintentamos cuando ya estén disponibles. */
  function reintentarEscudo() {
    if (estado.cfg) ponerEscudo(estado.cfg);
  }

  /** Para el pie de página: quién hizo esto. */
  function credito() {
    const c = estado.cfg;
    return (c && c.credito) || 'SGADD · Sistema de Gestión y Análisis de Datos Deportivos';
  }

  /* Auto-arranque. La config del club NO puede depender de que otro modulo
     se acuerde de llamarla: si init() falla o cambia, el dashboard quedaria
     mostrando la marca equivocada. Arranca sola y `cargar()` es idempotente,
     asi que el await de init() se engancha a la misma promesa. */
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => cargar(), { once: true });
    } else {
      cargar();
    }
  }

  /** Diagnostico rapido desde la consola: CLUB.debug() */
  function debug() {
    const r = {
      id: estado.id, base: BASE, url: estado.url || (BASE + 'clubes/' + estado.id + '.json'),
      cargado: estado.cargado, error: estado.error,
      nombre: estado.cfg ? estado.cfg.nombre : null,
      acento: TEMA.acento,
      planillas: (typeof SGADD !== 'undefined') ? SGADD.CATALOGO.planillas.length : null,
      patron: (typeof SGADD !== 'undefined') ? String(SGADD.CATALOGO.patronEquipoPropio) : null,
      logos: (typeof LOGOS !== 'undefined') ? (LOGOS.CFG.basePaths || []).join(', ') : null,
      headerEnDom: !!document.getElementById('clubNombre'),
    };
    console.table(r);
    return r;
  }

  /** El index avisa cuando ya pintó una vez, para saber si hay que repintar. */
  function marcarRender() { yaHuboRender = true; }

  return { TEMA, estado, cargar, aplicar: aplicarSeguro, credito, idDesdeUrl, debug, marcarRender,
           reintentarEscudo,
           get cfg() { return estado.cfg; }, get aplicado() { return aplicado; } };
})();
