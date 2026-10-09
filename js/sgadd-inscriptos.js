/* =====================================================================
   SGADD · LOS INSCRIPTOS DEL TORNEO (punto 93)

   El libro de la categoría solo trae a los equipos que YA JUGARON: un club
   sin box score no tiene ni una fila en `Base Datos E`. Con la LNB 2026-27
   eso dejaba 11 equipos a la vista de 18 inscriptos, y los 7 que todavía
   no debutaban no existían ni en la tabla, ni en Equipos, ni en Scouting.

   La regla (pedido del club, 2026-10-07): lo que el libro no tiene se
   completa con lo que publicó la liga —`torneos/<id>.json`, que arma el
   conector desde la web oficial— y recién si tampoco está ahí, no existe.

   QUÉ ENTRA Y QUÉ NO. De la liga entra la IDENTIDAD del equipo: nombre,
   ciudad, escudo y sus partidos por jugar del calendario. NO entra ningún
   número al índice: un equipo sin partidos que se sumara a
   `construirIndice()` movería medianas, percentiles y el grupo de pares
   (la misma razón por la que los partidos manuales viven aparte, punto
   44). Por eso este módulo no toca el índice: les da a las vistas una
   lista aparte y cada una decide cómo mostrarla.

   LA GUARDA DE LOS ALIAS. Un equipo «falta» cuando ni su nombre ni ninguno
   de sus alias cruzan con un equipo del libro. Si el libro tiene un equipo
   que el torneo NO reconoce, los alias están incompletos y cualquier
   faltante podría ser ese mismo equipo escrito distinto: mostrarlo dos
   veces es peor que no completar. En ese caso no se completa nada y se
   avisa por consola.

   Dos mitades, como el resto: el motor PURO arriba (se testea desde Node)
   y la UI abajo.
   ===================================================================== */
const SGADD_INSCRIPTOS = (function () {
  'use strict';

  let _nucleoNode = null;
  function clave(nombre) {
    try {
      if (typeof SGADD !== 'undefined' && SGADD.claveEquipo) return SGADD.claveEquipo(nombre);
      if (typeof require === 'function') {
        _nucleoNode = _nucleoNode || require('./sgadd-core.js');
        return _nucleoNode.claveEquipo(nombre);
      }
    } catch (e) { /* el núcleo puede no haber cargado */ }
    return String(nombre || '').trim().toUpperCase();
  }

  /**
   * Los equipos que el torneo declara, de una zona o de todas.
   *
   * Cada uno lleva `claves`: la de su nombre y la de cada alias, que es
   * con lo que se lo cruza contra el libro.
   */
  function delTorneo(doc, zona) {
    const zs = (doc && doc.zonas) || {};
    const ids = (zona && zs[zona]) ? [zona] : Object.keys(zs);
    const out = [];
    const vistos = {};
    ids.forEach((z) => {
      ((zs[z] && zs[z].equipos) || []).forEach((e) => {
        if (!e || !e.nombre) return;
        const k = clave(e.nombre);
        if (!k || vistos[k]) return;
        vistos[k] = true;
        const claves = [k].concat((e.alias || []).map(clave)).filter(Boolean);
        out.push({ clave: k, nombre: e.nombre, ciudad: e.ciudad || '', id: e.id || null, zona: z, claves: claves });
      });
    });
    return out;
  }

  /**
   * Los inscriptos que el libro no tiene.
   *
   * `presentes` son los nombres de los equipos del libro. Devuelve
   * `{lista, sueltos}`: `sueltos` son los del libro que el torneo no
   * reconoce, y si hay alguno `lista` sale vacía (ver la cabecera).
   */
  function faltantes(inscriptos, presentes) {
    const porClave = new Map();
    (inscriptos || []).forEach(i => i.claves.forEach(k => porClave.set(k, i)));
    const pres = (presentes || []).map(clave).filter(Boolean);
    const sueltos = pres.filter(k => !porClave.has(k));
    if (sueltos.length) return { lista: [], sueltos: sueltos };
    const hay = new Set(pres);
    const lista = (inscriptos || [])
      .filter(i => !i.claves.some(k => hay.has(k)))
      .map(i => ({ clave: i.clave, nombre: i.nombre, ciudad: i.ciudad, id: i.id, zona: i.zona,
                   claves: i.claves, sinDatos: true }));
    return { lista: lista, sueltos: [] };
  }

  /** `AAAA-MM-DD` de un valor de calendario, o '' si no es una fecha. */
  function fechaISO(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '').trim());
    return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
  }

  /**
   * Los próximos partidos de un equipo en el calendario declarado.
   *
   * `hoy` es `AAAA-MM-DD` y entra: el partido de hoy todavía no se jugó
   * para quien lo mira a la mañana. Ordenados por fecha y hora.
   */
  function proximos(doc, zona, nombre, hoy, n) {
    const k = clave(nombre);
    const lista = ((doc && doc.calendario && doc.calendario.partidos) || []).filter((p) => {
      if (!p || !p.local || !p.visitante) return false;
      if (zona && p.zona && p.zona !== zona) return false;
      const f = fechaISO(p.fecha);
      if (!f || (hoy && f < hoy)) return false;
      return clave(p.local) === k || clave(p.visitante) === k;
    }).map((p) => {
      const local = clave(p.local) === k;
      return { fecha: fechaISO(p.fecha), hora: p.hora || null, local: local,
               rival: local ? p.visitante : p.local };
    });
    lista.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1
      : String(a.hora || '').localeCompare(String(b.hora || ''))));
    return n ? lista.slice(0, n) : lista;
  }

  /** El aviso de la ficha, con la temporada del torneo si la declara. */
  function textoSinDatos(doc) {
    const t = doc && doc.temporada ? ' (Temporada ' + doc.temporada + ')' : '';
    return 'Sin datos estadísticos registrados aún' + t;
  }

  return { clave, delTorneo, faltantes, proximos, fechaISO, textoSinDatos };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_INSCRIPTOS;


/* =====================================================================
   UI · de dónde sale la lista y la ficha mínima
   ===================================================================== */

/* El archivo del torneo se baja UNA vez y se comparte con el Fixture
   (`SGADD_FIXTURE.cargarTorneo` lo cachea): las dos secciones leen el
   mismo documento. Mientras no llegó la lista sale vacía y la sección se
   pinta como antes; cuando llega, se repinta una sola vez. */
const INSCRIPTOS_UI = { pedidos: {}, avisados: {}, escudos: {} };

function inscriptosDoc() {
  try {
    const p = SGADD_APP.planillaActual();
    const id = p && p.torneoId;
    if (!id || typeof SGADD_FIXTURE === 'undefined') return null;
    const F = SGADD_FIXTURE;
    if (F.estado.torneo === id && F.estado.doc) return { doc: F.estado.doc, zona: p.zonaId || null };
    if (!INSCRIPTOS_UI.pedidos[id]) {
      INSCRIPTOS_UI.pedidos[id] = true;
      F.cargarTorneo(id).then((doc) => { if (doc) inscriptosRepintar(); });
    }
  } catch (e) { /* sin torneo: las vistas siguen con el libro solo */ }
  return null;
}

/** Los inscriptos que el libro abierto no tiene, para las vistas. */
function inscriptosFaltantes(idx) {
  const t = inscriptosDoc();
  if (!t || !idx || typeof idx.lista !== 'function') return [];
  const presentes = idx.lista().filter(e => !e.__externo).map(e => e.nombre);
  const r = SGADD_INSCRIPTOS.faltantes(SGADD_INSCRIPTOS.delTorneo(t.doc, t.zona), presentes);
  if (r.sueltos.length) {
    const firma = r.sueltos.join('|');
    if (!INSCRIPTOS_UI.avisados[firma]) {
      INSCRIPTOS_UI.avisados[firma] = true;
      console.warn('[inscriptos] El torneo no reconoce a ' + r.sueltos.join(', ')
        + ': faltan alias en torneos/<id>.json, así que no se completan equipos.');
    }
  }
  inscriptosPedirEscudos(r.lista);
  return r.lista;
}

/* LOS ESCUDOS DE LOS QUE NO JUGARON. `precargarLogos()` resuelve solo los
   nombres del ÍNDICE, así que los inscriptos sin partidos salían con
   iniciales aunque su `.jpg` esté en `logos/liga-nacional/`: `getUrl` lee
   un caché que nadie les había llenado. Se piden una vez por nombre; el
   hook de LOGOS repinta la sección cuando llega uno nuevo (y no repinta si
   no llegó nada, que es lo que corta el ciclo — ver `LOGOS.resolver`). */
function inscriptosPedirEscudos(lista) {
  if (typeof LOGOS === 'undefined' || !LOGOS.resolver || !lista.length) return;
  const nuevos = lista.map(f => f.nombre).filter(n => !INSCRIPTOS_UI.escudos[n]);
  if (!nuevos.length) return;
  nuevos.forEach(n => { INSCRIPTOS_UI.escudos[n] = true; });
  try { LOGOS.resolver(nuevos).catch(() => {}); } catch (e) { /* sin escudos: iniciales */ }
}

/** El faltante de una clave (la de la ruta o la del selector), o null. */
function inscriptoDe(idx, k) {
  if (!k) return null;
  const c = SGADD_INSCRIPTOS.clave(String(k).replace(/-/g, ' '));
  return inscriptosFaltantes(idx).find(f => f.clave === c) || null;
}

/* Repinta la sección abierta cuando llega el archivo. Solo las que usan
   la lista: el resto no cambia y repintarlas es gastar. */
function inscriptosRepintar() {
  try {
    if (typeof currentSection === 'undefined') return;
    if (currentSection === 'clasificacion' && typeof buildClasificacion === 'function') {
      const r = document.getElementById('view-root');
      if (r) r.innerHTML = buildClasificacion();
    }
    if (currentSection === 'equipos' && typeof equiposPintar === 'function') equiposPintar();
    /* Jugadores, por las fotos (punto 95): su base sale del mismo archivo. */
    if (currentSection === 'jugadores' && typeof jugadoresPintar === 'function'
        && SGADD_APP.estado && Object.keys(SGADD_APP.estado.fotos || {}).length) jugadoresPintar();
    if (currentSection === 'scouting' && typeof scoutPintar === 'function'
        && typeof tabState !== 'undefined' && tabState.scouting === 'equipos') scoutPintar();
  } catch (e) { console.warn('[inscriptos]', e); }
}

function inscriptosHoy() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/**
 * La ficha mínima de un equipo sin partidos: escudo, nombre, ciudad, el
 * aviso y sus próximos partidos del calendario. Nada más, a propósito:
 * cualquier número sería inventado.
 */
function inscriptosFichaMinima(f) {
  const esc = SGADD_UI.esc;
  const t = inscriptosDoc();
  const doc = t ? t.doc : null;
  const url = (typeof LOGOS !== 'undefined' && LOGOS.getUrl) ? LOGOS.getUrl(f.nombre) : null;
  const escudo = url
    ? `<img src="${esc(url)}" alt="" class="w-16 h-16 object-contain shrink-0">`
    : `<span class="escudo-aro w-16 h-16 text-lg font-semibold text-ink shrink-0">${esc(
      (typeof LOGOS !== 'undefined' && LOGOS.iniciales) ? LOGOS.iniciales(f.nombre) : f.nombre.slice(0, 2))}</span>`;
  const prox = doc ? SGADD_INSCRIPTOS.proximos(doc, t.zona, f.nombre, inscriptosHoy(), 5) : [];
  const fecha = (iso) => (typeof SGADD_FIXTURE !== 'undefined' && SGADD_FIXTURE.fechaLarga)
    ? SGADD_FIXTURE.fechaLarga(iso, true) : iso;
  const filas = prox.length
    ? `<ul>${prox.map(p => `<li class="flex items-center gap-3 py-2 text-sm border-b border-hairline/40">
        <span class="font-mono text-xs text-muted w-36 shrink-0">${esc(fecha(p.fecha))}${p.hora ? ' · ' + esc(p.hora) : ''}</span>
        <span class="text-[10px] uppercase tracking-wider text-muted w-16 shrink-0">${p.local ? 'Local' : 'Visitante'}</span>
        <span class="text-ink">vs ${esc(p.rival)}</span></li>`).join('')}</ul>`
    : '<p class="text-xs text-muted">El calendario publicado no tiene partidos por jugar de este equipo.</p>';
  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex items-center gap-4 mb-4">
        ${escudo}
        <div class="min-w-0 flex-1">
          <h2 class="font-display text-xl sm:text-2xl uppercase tracking-wide text-white truncate">${esc(f.nombre)}</h2>
          ${f.ciudad ? `<p class="text-xs text-muted">${esc(f.ciudad)}</p>` : ''}
        </div>
      </div>
      <p class="aviso-sin-datos inline-block rounded px-2 py-1 text-[11px] border border-hairline text-muted mb-4">
        ${esc(SGADD_INSCRIPTOS.textoSinDatos(doc))}</p>
      <p class="text-[11px] text-muted mb-3">Está inscripto en ${esc((doc && doc.nombre) || 'el torneo')} pero todavía
        no tiene partidos cargados: sus métricas, el plantel y el informe aparecen con su primer partido.</p>
      <h3 class="font-display uppercase tracking-wide text-xs text-accent mb-1">Próximos partidos</h3>
      ${filas}
    </div>`;
}


/* =====================================================================
   LAS FOTOS DE LOS JUGADORES (punto 95)

   El servidor manda `fotos` (clave `NOMBRES|EQUIPO` → ruta) solo en los
   libros de un torneo, con la ruta TAL COMO LA PUBLICA LA LIGA:
   `/fotos/<id>`. La base es `fuente.base` del archivo del torneo, el mismo
   documento de arriba. Solo se acepta una base https: termina en un <img>.

   Va acá y no en Jugadores porque es lo mismo que los inscriptos: un dato
   que el libro no tiene y que se completa con lo que publicó la liga.
   ===================================================================== */
function torneoFotoJugador(nombre, equipo) {
  try {
    const fotos = (SGADD_APP.estado && SGADD_APP.estado.fotos) || {};
    const ruta = fotos[SGADD.clavePersona(nombre) + '|' + SGADD.claveEquipo(equipo)];
    if (!ruta) return null;
    if (/^https:\/\//.test(ruta)) return ruta;
    const t = inscriptosDoc();
    const base = t && t.doc && t.doc.fuente && t.doc.fuente.base;
    if (!base || !/^https:\/\/[^/\s]+$/.test(base) || !/^\/fotos\/\d+$/.test(ruta)) return null;
    return base + ruta;
  } catch (e) { return null; }
}

/**
 * La imagen de la ficha de un jugador: su FOTO si la liga la publicó, y si
 * no —o si no carga— el escudo de su equipo, como antes. `clases` es el
 * tamaño; la foto va recortada en círculo y el escudo entero.
 *
 * EL ENCUADRE (2026-10-08): la LNB publica fotos de medio cuerpo o cuerpo
 * entero, y `object-cover` centrado dejaba el pecho en el círculo y la cara
 * afuera. `.foto-jugador` (index.html) ancla la imagen al BORDE SUPERIOR:
 * con una foto de rostro no cambia nada y con una de cuerpo entero la cara
 * queda adentro, como en la web de la liga.
 */
function torneoImagenJugador(nombre, equipo, clases) {
  const esc = SGADD_UI.esc;
  const logo = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(equipo) : null;
  const foto = torneoFotoJugador(nombre, equipo);
  if (foto) {
    /* Si la foto no carga, cae al escudo y no a una imagen rota. */
    const respaldo = logo
      ? `this.onerror=null;this.src='${SGADD_UI.escJs(logo)}';this.classList.remove('rounded-full','object-cover','foto-jugador');this.classList.add('object-contain')`
      : `this.remove()`;
    return `<img src="${esc(foto)}" alt="${esc(nombre)}" loading="lazy" referrerpolicy="no-referrer"
      class="${esc(clases)} rounded-full object-cover foto-jugador shrink-0 bg-surface2" onerror="${esc(respaldo)}">`;
  }
  return logo ? `<img src="${esc(logo)}" alt="" class="${esc(clases)} object-contain shrink-0">` : '';
}

/* =====================================================================
   EL DORSAL (2026-10-08) · «#32 Juan Pérez» en fichas, rankings,
   planteles, scouting y el post-partido.

   De dónde sale, en orden:
     1. `dorsales` del servidor: `PADRON J` del libro de un torneo, con la
        clave de las fotos (`server/lib/padron-j.js`).
     2. `Base Datos J`: la columna DORSAL de su último partido, que la
        ingesta escribe en los libros que carga ella. Un libro con Excel
        manual no la trae y el nombre queda como estaba.
   Un jugador sin dorsal conocido no lleva «#»: nunca un número inventado.
   ===================================================================== */
const DORSAL_VALIDO = /^\d{1,3}$/;

function torneoDorsal(nombre, equipo) {
  try {
    if (typeof SGADD === 'undefined' || typeof SGADD_APP === 'undefined' || !SGADD_APP.estado) return null;
    const kp = SGADD.clavePersona(nombre), ke = SGADD.claveEquipo(equipo);
    const d = (SGADD_APP.estado.dorsales || {})[kp + '|' + ke];
    if (d != null && DORSAL_VALIDO.test(String(d))) return String(Number(d));
    const idx = SGADD_APP.estado.idx;
    const filas = (idx && idx.liga && idx.liga.jugadorPartidos && idx.liga.jugadorPartidos.get(kp)) || [];
    let ultimo = null;
    filas.forEach((f) => {
      if (f.__equipo !== ke) return;
      const v = f['DORSAL'];
      if (v === '' || v == null || !DORSAL_VALIDO.test(String(v))) return;
      if (!ultimo || (f.__fecha && ultimo.__fecha && f.__fecha > ultimo.__fecha)) ultimo = f;
    });
    return ultimo ? String(Number(ultimo['DORSAL'])) : null;
  } catch (e) { return null; }
}

/** «#32 » para anteponer al nombre ya formateado, o '' si no se conoce. */
function torneoPrefijoDorsal(nombre, equipo) {
  const d = torneoDorsal(nombre, equipo);
  return d === null ? '' : '#' + d + ' ';
}

/* =====================================================================
   LA TITULARIDAD (punto 97) · «Titular 5/5»

   SOLO CON EL DATO. La regla del punto 8 sigue en pie para todo lo que
   el motor INFIERE (etiquetas, consignas, jerarquías: nada de eso dice
   «titular»). Esto no se infiere: es la columna TITULAR de `Base Datos J`,
   que la ingesta escribe desde el box score oficial. Un libro con Excel
   manual no la trae y acá no aparece nada.

   De dónde sale, en orden:
     1. las filas del jugador en `Base Datos J` del índice (el tramo que
        se está mirando), si alguna trae el dato;
     2. `titulares` del servidor: el mismo conteo hecho sobre el libro
        completo, para los rivales que el plan recorta.
   ===================================================================== */
function torneoTitularidad(nombre, equipo) {
  try {
    if (typeof SGADD === 'undefined' || typeof SGADD_APP === 'undefined' || !SGADD_APP.estado) return null;
    const kp = SGADD.clavePersona(nombre), ke = SGADD.claveEquipo(equipo);
    const idx = SGADD_APP.estado.idx;
    const filas = (idx && idx.liga && idx.liga.jugadorPartidos && idx.liga.jugadorPartidos.get(kp)) || [];
    let t = 0, n = 0;
    filas.forEach((f) => {
      if (f.__equipo !== ke) return;
      const v = String(f['TITULAR'] == null ? '' : f['TITULAR']).trim().toUpperCase();
      if (v !== 'SI' && v !== 'SÍ' && v !== 'NO') return;
      n++;
      if (v !== 'NO') t++;
    });
    if (n) return { titular: t, partidos: n };
    const s = (SGADD_APP.estado.titulares || {})[kp + '|' + ke];
    if (Array.isArray(s) && s.length === 2 && s[1] > 0 && s[0] >= 0 && s[0] <= s[1]) return { titular: s[0], partidos: s[1] };
    return null;
  } catch (e) { return null; }
}

/**
 * La badge «TITULAR (X/Y)» o «DESDE EL BANCO (0/Y)», o '' sin el dato.
 *
 * UN SOLO FORMATO EN TODAS LAS VISTAS (2026-10-09, pedido del club): el
 * mismo de la etiqueta principal de la ficha —display, mayúsculas, borde
 * del color del texto—. `compacta` achica el tamaño para las cards y las
 * tablas, sin cambiar ni el texto ni el estilo. Se resalta si arrancó en
 * todos o casi todos (≥ 80 %).
 */
function torneoBadgeTitular(nombre, equipo, compacta) {
  const r = torneoTitularidad(nombre, equipo);
  if (!r) return '';
  const esc = SGADD_UI.esc;
  const frac = r.titular / r.partidos;
  const texto = (r.titular === 0 ? 'Desde el banco' : 'Titular') + ' (' + r.titular + '/' + r.partidos + ')';
  const color = frac >= 0.8 ? 'text-accent' : r.titular === 0 ? 'text-muted' : 'text-ink';
  const tam = compacta ? 'text-[9px] px-1.5 py-px' : 'text-[10px] px-2.5 py-1';
  return `<span class="badge-titular ${tam} font-display uppercase tracking-wider rounded border border-current/40 ${color} whitespace-nowrap shrink-0"
    title="${esc('Arrancó ' + r.titular + ' de los ' + r.partidos + ' partidos que jugó (box score oficial)')}">${esc(texto)}</span>`;
}
