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

  function idDesdeUrl() {
    try {
      const p = new URLSearchParams(window.location.search).get('club');
      return (p && /^[a-z0-9-]+$/i.test(p)) ? p.toLowerCase() : POR_DEFECTO;
    } catch (e) { return POR_DEFECTO; }
  }

  async function cargar() {
    const id = idDesdeUrl();
    estado.id = id;
    try {
      const r = await fetch('clubes/' + encodeURIComponent(id) + '.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      estado.cfg = await r.json();
    } catch (e) {
      estado.error = e.message || String(e);
      console.warn('[CLUB] no se pudo cargar clubes/' + id + '.json (' + estado.error + '). Sigo con los valores por defecto.');
      estado.cfg = null;
    }
    aplicar();
    estado.cargado = true;
    return estado.cfg;
  }

  function aplicar() {
    const c = estado.cfg;
    if (!c) return;

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
