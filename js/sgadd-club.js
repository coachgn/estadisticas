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

  async function cargar() {
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
    aplicar();
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
    if (c.escudo) {
      const img = document.getElementById('clubEscudo');
      if (img) { img.src = c.escudo; img.classList.remove('hidden'); }
    }

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
  }

  /** Para el pie de página: quién hizo esto. */
  function credito() {
    const c = estado.cfg;
    return (c && c.credito) || 'SGADD · Sistema de Gestión y Análisis de Datos Deportivos';
  }

  return { TEMA, estado, cargar, aplicar, credito, idDesdeUrl, get cfg() { return estado.cfg; } };
})();
