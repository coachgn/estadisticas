/* =====================================================================
   SGADD · SECCIÓN FIXTURE (punto 68)

   Contesta las dos preguntas que el DT hace el lunes y que ninguna otra
   sección podía contestar, porque todas miran hacia atrás:

     1. ¿qué me queda este mes?
     2. ¿contra quién juego, cómo le fue y qué tiene después?

   ---------------------------------------------------------------------
   DE DÓNDE SALEN LOS DATOS · dos fuentes que NO se pisan

     CALENDARIO   `torneos/<id>.json` · lo que se va a jugar
     ÍNDICE       el libro de MotorStats · lo que se jugó

   El calendario es lo único que existe ANTES del primer partido, y el
   índice lo único que tiene el marcador DESPUÉS. Se cruzan por
   FECHA + los dos equipos, la misma clave que el resto del proyecto
   (`idPartido`, punto 3 quater) pero sin depender del texto `PARTIDO`,
   que el calendario no tiene.

   **EL MARCADOR SALE SIEMPRE DEL ÍNDICE, NUNCA DEL CALENDARIO.** El
   calendario es una declaración de intención publicada semanas antes: si
   un partido se reprograma o se define por secretaría, lo que vale es lo
   que MotorStats escribió. Un resultado del calendario contradiciendo a la
   tabla de posiciones es exactamente el bug que este proyecto no comete.

   Y AL REVÉS: un partido que el índice tiene y el calendario no se
   muestra igual (`soloJugados`). El calendario de LAB 2026-27 es parcial
   —el sitio publicó dos semanas— así que descartar lo jugado por no estar
   declarado dejaría la sección mintiendo apenas empiece el torneo.

   Motor puro arriba (testeable desde Node), UI abajo.
   ===================================================================== */
const SGADD_FIXTURE = (function () {
  'use strict';

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc)
    ? SGADD_UI.esc(v) : String(v == null ? '' : v).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* EL NORMALIZADOR ES EL DEL NÚCLEO, también desde Node.
     Con un respaldo propio (`trim().toUpperCase()`) los tests probarían un
     módulo con OTRA vara: `"C. MARCHIGIANO - MM"` y `"C MARCHIGIANO"` —el
     nombre del libro y la clave del índice— dejarían de cruzar y la
     sección saldría vacía sin que ningún test lo viera. */
  const CORE = (typeof SGADD !== 'undefined') ? SGADD
    : (typeof require !== 'undefined' ? require('./sgadd-core.js') : null);
  const clave = (v) => (CORE && CORE.claveEquipo)
    ? CORE.claveEquipo(v) : String(v == null ? '' : v).trim().toUpperCase();

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  /* =====================================================================
     MOTOR · puro
     ===================================================================== */

  /**
   * Una fecha del calendario a `AAAA-MM-DD`.
   *
   * Se acepta ISO y `d/m/aaaa`, que es lo que escribe la planilla de La
   * Plata. **Se trabaja con el TEXTO y no con `Date`**: un `new Date('2026-10-15')`
   * es medianoche UTC, o sea el 14 a las 21 en Argentina, y el partido
   * aparecería un día antes en la agenda del DT.
   */
  function fechaISO(v) {
    const t = String(v == null ? '' : v).trim();
    if (!t) return null;
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return null;
  }

  /** `AAAA-MM-DD` → «domingo 18 de octubre». Sin `Date`, por lo de arriba. */
  function fechaLarga(iso, conDia) {
    const p = String(iso || '').split('-');
    if (p.length !== 3) return '';
    const d = Number(p[2]), mes = MESES[Number(p[1]) - 1] || '';
    const texto = d + ' de ' + mes;
    if (!conDia) return texto;
    /* El día de la semana sí necesita aritmética, y ahí `Date` en UTC es
       seguro: no se lo compara con nada ni se lo muestra como fecha. */
    const dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, d));
    return DIAS[dt.getUTCDay()] + ' ' + texto;
  }

  /** `AAAA-MM` → «octubre 2026». */
  function mesLargo(am) {
    const p = String(am || '').split('-');
    if (p.length < 2) return '';
    return (MESES[Number(p[1]) - 1] || '') + ' ' + p[0];
  }

  function mesDe(iso) { return String(iso || '').slice(0, 7); }

  /** Suma meses a `AAAA-MM`, sin `Date`: la aritmética es de calendario. */
  function mesMas(am, n) {
    const p = String(am || '').split('-');
    let a = Number(p[0]), m = Number(p[1]) - 1 + Number(n);
    a += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return a + '-' + ('0' + (m + 1)).slice(-2);
  }

  /** La clave de un cruce: fecha + los dos equipos, sin importar el orden. */
  function claveCruce(iso, a, b) {
    return String(iso || '') + '|' + [clave(a), clave(b)].sort().join('|');
  }

  /**
   * El calendario declarado del torneo, acotado a una zona.
   *
   * Sin `zona` van todos: un torneo de zona única no tiene por qué
   * declararla en cada partido.
   */
  function normalizarCalendario(doc, zona) {
    const cal = (doc && doc.calendario) || {};
    const lista = Array.isArray(cal.partidos) ? cal.partidos : [];
    const out = [];
    lista.forEach((p) => {
      if (zona && p.zona && p.zona !== zona) return;
      const f = fechaISO(p.fecha);
      if (!f || !p.local || !p.visitante) return;
      out.push({
        fecha: f, hora: p.hora || null, zona: p.zona || null,
        local: p.local, visitante: p.visitante,
        localClave: clave(p.local), visitanteClave: clave(p.visitante),
        declarado: true, jugado: false, ptsLocal: null, ptsVisitante: null,
      });
    });
    return out.sort(ordenar);
  }

  function ordenar(a, b) {
    return String(a.fecha).localeCompare(String(b.fecha))
      || String(a.localClave).localeCompare(String(b.localClave));
  }

  /**
   * Los partidos JUGADOS, derivados del índice.
   *
   * Se recorren los equipos y se toma cada partido **desde el lado LOCAL**,
   * así cada cruce entra una sola vez sin tener que deduplicar después. Un
   * libro sin la columna `CONDICION` no produce nada, que es degradar y no
   * inventar de qué lado jugó cada uno.
   */
  function jugadosDelIndice(idx) {
    const out = [];
    if (!idx || typeof idx.lista !== 'function') return out;
    idx.lista().forEach((e) => {
      (e.partidos || []).forEach((p) => {
        if (String(p.CONDICION || '').toUpperCase() !== 'LOCAL') return;
        const f = fechaISO(p.FECHA);
        const rival = rivalDelTexto(p.PARTIDO, e.clave);
        if (!f || !rival) return;
        out.push({
          fecha: f, hora: null, zona: null,
          local: e.nombre || e.clave, visitante: rival,
          localClave: clave(e.clave), visitanteClave: clave(rival),
          declarado: false, jugado: true,
          ptsLocal: num(p.PTS), ptsVisitante: num(p.PTSopp),
        });
      });
    });
    return out.sort(ordenar);
  }

  function num(v) { const n = Number(v); return isFinite(n) ? n : null; }

  /** El otro lado de `"A vs B"`. Devuelve `null` si no se puede saber cuál es. */
  function rivalDelTexto(texto, propio) {
    const partes = String(texto || '').split(/\s+vs\.?\s+/i);
    if (partes.length !== 2) return null;
    const c = clave(propio);
    const a = clave(partes[0]), b = clave(partes[1]);
    if (a === c) return partes[1].trim();
    if (b === c) return partes[0].trim();
    return null;
  }

  /**
   * Calendario + índice, con el ÍNDICE MANDANDO sobre el marcador.
   *
   * Un cruce declarado que ya se jugó conserva su hora y su zona —que el
   * índice no tiene— y toma el resultado. Uno que el índice tiene y el
   * calendario no, entra igual: el calendario puede ser parcial.
   */
  function unir(calendario, jugados) {
    /* EL MAPA GUARDA LA POSICIÓN, no el objeto.

       La primera versión guardaba la fila del calendario y después buscaba
       su `indexOf` en la lista de COPIAS: siempre daba -1, así que el
       marcador se escribía en `out[-1]` —o sea en ninguna parte— y el
       partido jugado seguía saliendo como «a jugarse». Lo cazó el test, no
       la pantalla: sin datos reales de un torneo empezado, no se veía. */
    const posicion = {};
    const out = (calendario || []).map((p, i) => {
      posicion[claveCruce(p.fecha, p.localClave, p.visitanteClave)] = i;
      return Object.assign({}, p);
    });
    (jugados || []).forEach((j) => {
      const k = claveCruce(j.fecha, j.localClave, j.visitanteClave);
      const i = posicion[k];
      if (i === undefined) {
        posicion[k] = out.length;
        out.push(Object.assign({}, j));
        return;
      }
      /* El declarado conserva hora y zona; el marcador y de qué lado jugó
         cada uno los pone el índice, que es la fuente del resultado. */
      out[i] = Object.assign({}, out[i], {
        jugado: true, ptsLocal: j.ptsLocal, ptsVisitante: j.ptsVisitante,
        local: j.local, visitante: j.visitante,
        localClave: j.localClave, visitanteClave: j.visitanteClave,
      });
    });
    return out.sort(ordenar);
  }

  /** Los partidos de un equipo, con su rival y su condición ya resueltos. */
  function delEquipo(partidos, equipo) {
    const c = clave(equipo);
    if (!c) return [];
    return (partidos || []).filter(p => p.localClave === c || p.visitanteClave === c)
      .map((p) => {
        const local = p.localClave === c;
        return Object.assign({}, p, {
          esLocal: local,
          rival: local ? p.visitante : p.local,
          rivalClave: local ? p.visitanteClave : p.localClave,
          ptsPropios: local ? p.ptsLocal : p.ptsVisitante,
          ptsRival: local ? p.ptsVisitante : p.ptsLocal,
        });
      });
  }

  /** ¿Ganó, perdió, o todavía no se jugó? */
  function resultado(p) {
    if (!p || !p.jugado || p.ptsPropios == null || p.ptsRival == null) return null;
    if (p.ptsPropios > p.ptsRival) return 'GANADO';
    if (p.ptsPropios < p.ptsRival) return 'PERDIDO';
    return 'EMPATE';   // en básquet no existe: si aparece, el dato está mal
  }

  /** Los meses que tienen algún partido, ordenados. */
  function meses(partidos) {
    const v = {};
    (partidos || []).forEach(p => { if (p.fecha) v[mesDe(p.fecha)] = true; });
    return Object.keys(v).sort();
  }

  /**
   * Por qué mes abrir la sección.
   *
   * El mes en curso si tiene partidos; si no, **el primero que venga
   * después** —antes del torneo, septiembre está vacío y lo útil es
   * octubre—; y si ya terminó todo, el último jugado. Devuelve `motivo`
   * para poder DECIRLO en pantalla: un mes que no es el actual sin
   * explicación se lee como que la sección se equivocó.
   */
  function mesPorDefecto(partidos, hoy) {
    const ms = meses(partidos);
    if (!ms.length) return { mes: mesDe(hoy), motivo: 'sin-partidos' };
    const actual = mesDe(hoy);
    if (ms.indexOf(actual) !== -1) return { mes: actual, motivo: 'actual' };
    const siguiente = ms.find(m => m > actual);
    if (siguiente) return { mes: siguiente, motivo: 'proximo' };
    return { mes: ms[ms.length - 1], motivo: 'terminado' };
  }

  function deMes(partidos, mes) {
    return (partidos || []).filter(p => mesDe(p.fecha) === mes);
  }

  /**
   * Partidos con un AÑO que se aparta del resto · se DENUNCIAN, no se tocan.
   *
   * Medido en el libro de la Zona C el 2026-09-25: dos fechas vienen
   * cargadas como `27/05/2029` y `29/05/2029` en una temporada 2026. El
   * panel las muestra donde caen —«mayo 2029»— y eso se lee como un error
   * del panel, no del dato.
   *
   * Una temporada abarca a lo sumo dos años seguidos (octubre a abril), así
   * que se toma el año MÁS FRECUENTE y se marca todo lo que esté a más de
   * uno de distancia. Con un solo año no marca nada, que es el caso sano.
   *
   * NO se corrige ni se descarta: no se puede saber si el año bueno es el
   * del resto o si ese partido es de otra cosa. Es la regla de siempre —un
   * dato inventado es peor que uno ausente— y la corrección va en el libro.
   */
  function aniosAtipicos(partidos) {
    const cuenta = {};
    (partidos || []).forEach((p) => {
      const a = Number(String(p.fecha || '').slice(0, 4));
      if (a) cuenta[a] = (cuenta[a] || 0) + 1;
    });
    const anios = Object.keys(cuenta).map(Number).sort((x, y) => cuenta[y] - cuenta[x] || x - y);
    if (anios.length < 2) return [];
    const modal = anios[0];
    return (partidos || []).filter((p) => {
      const a = Number(String(p.fecha || '').slice(0, 4));
      return a && Math.abs(a - modal) > 1;
    });
  }

  /** El próximo partido a jugarse (hoy incluido: se juega hoy). */
  function proximo(partidos, hoy) {
    const h = fechaISO(hoy) || '';
    return (partidos || []).find(p => !p.jugado && p.fecha >= h) || null;
  }

  /** El último que ya se jugó. */
  function anterior(partidos, hoy) {
    const h = fechaISO(hoy) || '';
    const previos = (partidos || []).filter(p => p.jugado || p.fecha < h);
    return previos.length ? previos[previos.length - 1] : null;
  }

  /**
   * La agenda completa que pinta la sección.
   *
   * Es PURA y devuelve todo lo que la vista necesita, incluido por qué el
   * mes elegido es ése. Sin equipo propio —un torneo que el admin mira
   * entero— devuelve el calendario igual, sin los bloques del rival: la
   * sección sigue sirviendo para ver qué se juega.
   */
  function agenda(opciones) {
    const o = opciones || {};
    const hoy = fechaISO(o.hoy) || fechaISO(new Date().toISOString().slice(0, 10));
    const cal = normalizarCalendario(o.torneo, o.zona);
    const jug = jugadosDelIndice(o.idx);
    const todos = unir(cal, jug);
    const propio = o.equipo ? clave(o.equipo) : '';
    const mios = propio ? delEquipo(todos, propio) : [];

    /* LOS ATÍPICOS SE MUESTRAN PERO NO DECIDEN POR DÓNDE ABRIR. Medido en
       la Zona C: con las dos fechas cargadas en 2029, «el primer mes con
       actividad después de hoy» era mayo de 2029 y la sección abría
       justo en lo que está mal cargado. */
    const atipicos = aniosAtipicos(todos);
    const sanos = atipicos.length
      ? (propio ? mios : todos).filter(p => atipicos.indexOf(p) === -1
        && !atipicos.some(x => x.fecha === p.fecha && x.localClave === p.localClave))
      : (propio ? mios : todos);
    const porDefecto = mesPorDefecto(sanos.length ? sanos : (propio ? mios : todos), hoy);
    const mes = o.mes || porDefecto.mes;
    const ms = meses(propio ? mios : todos);

    const sig = propio ? proximo(mios, hoy) : null;
    let rival = null;
    if (sig) {
      const suyos = delEquipo(todos, sig.rivalClave);
      rival = {
        clave: sig.rivalClave, nombre: sig.rival,
        cruce: sig,
        anterior: anterior(suyos, hoy),
        siguiente: (suyos.filter(p => !p.jugado && p.fecha >= hoy)
          .find(p => p.rivalClave !== propio) || null),
      };
    }

    return {
      hoy: hoy,
      /* `declarados` distingue «el torneo no empezó» de «no hay fixture
         publicado»: son dos vacíos distintos y piden textos distintos. */
      declarados: cal.length, jugados: jug.length, total: todos.length,
      calendarioParcial: !!(o.torneo && o.torneo.calendario && o.torneo.calendario.parcial),
      equipo: propio || null,
      partidos: todos, mios: mios,
      meses: ms, mes: mes, mesMotivo: o.mes ? 'elegido' : porDefecto.motivo,
      delMes: deMes(propio ? mios : todos, mes),
      proximo: sig, rival: rival,
      /* Fechas que el libro trae con un año que no es el de la temporada.
         Se muestran igual, con el aviso al lado (ver `aniosAtipicos`). */
      atipicos: atipicos,
      /* Para el empty state: el torneo declara cuándo arranca. */
      inicio: (o.torneo && o.torneo.formato && o.torneo.formato.inicio) || (ms.length ? null : null),
    };
  }

  /* =====================================================================
     UI
     ===================================================================== */

  const estado = { torneo: null, doc: null, pidiendo: null, error: '', mes: '' };

  /* La base del sitio, deducida del propio <script>: con una URL sin barra
     final, un fetch relativo se resuelve contra la raíz del dominio y da
     404 (la misma razón que en sgadd-club.js). */
  const BASE = (function () {
    try {
      const sc = (typeof document !== 'undefined') && (document.currentScript
        || Array.prototype.slice.call(document.getElementsByTagName('script'))
          .filter(x => /sgadd-fixture\.js/.test(x.src || '')).pop());
      if (sc && sc.src) return sc.src.replace(/js\/sgadd-fixture\.js.*$/, '');
    } catch (e) { /* cae a la relativa */ }
    return '';
  })();

  /** La planilla abierta, que es la que sabe a qué torneo pertenece. */
  function planillaActual() {
    try {
      const id = SGADD_APP.estado.planillaId;
      return SGADD.CATALOGO.planillas.find(p => p.id === id) || null;
    } catch (e) { return null; }
  }

  /**
   * Baja `torneos/<id>.json` una vez por torneo.
   *
   * Un 404 NO es un error del panel: un club puede no estar enganchado a
   * ningún torneo, y ahí la sección lo dice en vez de mostrar un fallo.
   */
  function cargarTorneo(id) {
    if (!id) return Promise.resolve(null);
    if (estado.torneo === id && estado.doc !== null) return Promise.resolve(estado.doc);
    if (estado.pidiendo && estado.pidiendo.id === id) return estado.pidiendo.promesa;
    const promesa = fetch(BASE + 'torneos/' + encodeURIComponent(id) + '.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then((doc) => {
        estado.torneo = id; estado.doc = doc; estado.pidiendo = null;
        estado.error = doc ? '' : 'No se encontró el fixture de este torneo.';
        return doc;
      })
      .catch((e) => {
        estado.torneo = id; estado.doc = null; estado.pidiendo = null;
        estado.error = e.message || 'No se pudo leer el fixture.';
        return null;
      });
    estado.pidiendo = { id: id, promesa: promesa };
    return promesa;
  }

  function escudo(nombre, px) {
    const t = px || 22;
    try {
      const url = LOGOS.getUrl(nombre);
      if (url) return '<img src="' + esc(url) + '" alt="" class="rounded-full object-cover shrink-0"'
        + ' style="width:' + t + 'px;height:' + t + 'px" loading="lazy">';
      return '<span class="fila-inicial shrink-0" style="width:' + t + 'px;height:' + t + 'px;font-size:'
        + Math.round(t * 0.42) + 'px">' + esc(LOGOS.iniciales(nombre)) + '</span>';
    } catch (e) {
      return '<span class="fila-inicial shrink-0" style="width:' + t + 'px;height:' + t + 'px"></span>';
    }
  }

  /** Una fila de partido. `propio` marca de qué lado mirar el marcador. */
  function filaPartido(p, propio) {
    const c = propio ? clave(propio) : '';
    const yoLocal = c && p.localClave === c;
    const yoVisita = c && p.visitanteClave === c;
    const res = c ? resultado(Object.assign({}, p, {
      ptsPropios: yoLocal ? p.ptsLocal : p.ptsVisitante,
      ptsRival: yoLocal ? p.ptsVisitante : p.ptsLocal,
    })) : null;
    const tono = res === 'GANADO' ? 'text-emerald-400' : res === 'PERDIDO' ? 'text-red-400' : 'text-ink';
    const marcador = p.jugado && p.ptsLocal != null
      ? '<span class="font-mono ' + tono + '">' + p.ptsLocal + ' – ' + p.ptsVisitante + '</span>'
      : '<span class="text-muted text-[11px]">' + (p.hora ? esc(p.hora) : 'a jugarse') + '</span>';
    const lado = (n, cl, fuerte) => '<span class="flex items-center gap-1.5 min-w-0 '
      + (fuerte ? 'text-ink font-medium' : 'text-ink') + '">' + escudo(n)
      + '<span class="truncate">' + esc(n) + '</span></span>';
    return '<tr class="text-xs border-t border-hairline">'
      + '<td class="py-2 pr-3 text-muted whitespace-nowrap">' + esc(fechaLarga(p.fecha, true)) + '</td>'
      + '<td class="py-2 pr-3">' + lado(p.local, p.localClave, yoLocal) + '</td>'
      + '<td class="py-2 px-2 text-center whitespace-nowrap">' + marcador + '</td>'
      + '<td class="py-2 pr-3">' + lado(p.visitante, p.visitanteClave, yoVisita) + '</td>'
      + '<td class="py-2 text-[11px] text-muted whitespace-nowrap">'
      + (c ? (yoLocal ? 'Local' : 'Visitante') : (p.zona ? esc(p.zona) : '')) + '</td>'
      + '</tr>';
  }

  function tabla(partidos, propio) {
    return '<div class="scrollbox"><table class="w-full">'
      + '<thead><tr class="text-[10px] uppercase tracking-wider text-muted">'
      + '<th class="text-left pb-1 pr-3 font-display">Fecha</th>'
      + '<th class="text-left pb-1 pr-3 font-display">Local</th>'
      + '<th class="pb-1 px-2 font-display">Marcador</th>'
      + '<th class="text-left pb-1 pr-3 font-display">Visitante</th>'
      + '<th class="text-left pb-1 font-display">' + (propio ? 'Condición' : 'Zona') + '</th>'
      + '</tr></thead><tbody>'
      + partidos.map(p => filaPartido(p, propio)).join('')
      + '</tbody></table></div>';
  }

  /**
   * EMPTY STATE · dice QUÉ falta y POR QUÉ, nunca un contenedor vacío.
   *
   * Es la regla del punto 14 llevada al caso que más importa acá: antes de
   * que el torneo empiece, TODA la sección es un vacío, y un vacío sin
   * explicación se lee como que el panel está roto.
   */
  function vacio(titulo, detalle, accion) {
    return '<div class="rounded-lg border border-dashed border-hairline p-5 text-center">'
      + '<p class="font-display uppercase tracking-wide text-xs text-ink">' + esc(titulo) + '</p>'
      + '<p class="text-xs text-muted mt-1.5 max-w-lg mx-auto">' + detalle + '</p>'
      + (accion ? '<div class="mt-3">' + accion + '</div>' : '')
      + '</div>';
  }

  function selectorMes(a) {
    if (!a.meses.length) return '';
    const i = a.meses.indexOf(a.mes);
    const btn = (m, txt, hab) => '<button type="button" ' + (hab ? '' : 'disabled ')
      + 'onclick="SGADD_FIXTURE.irAMes(\'' + esc(m) + '\')" '
      + 'class="px-2 py-1.5 rounded-md border border-hairline text-[11px] font-display uppercase '
      + 'tracking-wider text-ink disabled:opacity-30">' + txt + '</button>';
    const prev = a.meses.filter(m => m < a.mes).pop();
    const sig = a.meses.find(m => m > a.mes);
    return '<div class="flex items-center gap-2 flex-wrap">'
      + btn(prev || a.mes, '←', !!prev)
      + '<span class="font-display uppercase tracking-wide text-sm text-ink px-1">'
      + esc(mesLargo(a.mes)) + '</span>'
      + btn(sig || a.mes, '→', !!sig)
      + '<span class="text-[11px] text-muted ml-2">'
      + (i === -1 ? 'sin partidos este mes' : (a.delMes.length + (a.delMes.length === 1 ? ' partido' : ' partidos')))
      + '</span></div>';
  }

  /** El aviso de por qué se abrió en un mes que no es el actual. */
  function avisoMes(a) {
    if (a.mesMotivo === 'proximo') {
      return '<p class="text-[11px] text-muted mt-1">En ' + esc(mesLargo(mesDe(a.hoy)))
        + ' no hay partidos, así que se abre en el primer mes con actividad.</p>';
    }
    if (a.mesMotivo === 'terminado') {
      return '<p class="text-[11px] text-muted mt-1">El calendario cargado ya terminó: '
        + 'se muestra el último mes con partidos.</p>';
    }
    return '';
  }

  function bloqueMes(a) {
    const cuerpo = a.delMes.length
      ? tabla(a.delMes, a.equipo)
      : (a.equipo
        ? vacio('Sin partidos en ' + mesLargo(a.mes),
          'Tu equipo no tiene partidos declarados este mes. Movete con las flechas para ver el resto del calendario.')
        : vacio('Sin partidos en ' + mesLargo(a.mes),
          'No hay partidos declarados en este mes del calendario.'));
    return '<div class="card rounded-xl p-4 sm:p-5 border border-hairline">'
      + '<div class="flex items-baseline justify-between gap-3 flex-wrap mb-1">'
      + '<h3 class="font-display uppercase tracking-wide text-sm text-ink">'
      + (a.equipo ? 'Mis partidos' : 'Calendario de la zona') + '</h3>'
      + selectorMes(a) + '</div>' + avisoMes(a)
      + '<div class="mt-3">' + cuerpo + '</div></div>';
  }

  function miniPartido(rotulo, p, propio, vacioTxt) {
    const cuerpo = p
      ? '<div class="mt-2">' + tabla([p], propio) + '</div>'
      : '<p class="text-xs text-muted mt-2">' + esc(vacioTxt) + '</p>';
    return '<div class="rounded-lg border border-hairline p-3">'
      + '<p class="text-[10px] uppercase tracking-wider text-muted font-display">' + esc(rotulo) + '</p>'
      + cuerpo + '</div>';
  }

  function bloqueRival(a) {
    if (!a.equipo) return '';
    if (!a.proximo) {
      return '<div class="card rounded-xl p-4 sm:p-5 border border-hairline">'
        + '<h3 class="font-display uppercase tracking-wide text-sm text-ink mb-3">Próximo rival</h3>'
        + vacio('Sin próximo partido declarado',
          a.declarados
            ? 'Todos los partidos declarados de tu equipo ya se jugaron. Cuando se publique el resto del fixture aparece acá.'
            : 'El fixture de este torneo todavía no está publicado, así que no hay un próximo cruce que anticipar.')
        + '</div>';
    }
    const r = a.rival;
    const p = a.proximo;
    return '<div class="card rounded-xl p-4 sm:p-5 border border-hairline">'
      + '<div class="flex items-baseline justify-between gap-3 flex-wrap mb-3">'
      + '<h3 class="font-display uppercase tracking-wide text-sm text-ink">Próximo rival</h3>'
      + '<span class="text-[11px] text-muted">' + esc(fechaLarga(p.fecha, true))
      + ' · ' + (p.esLocal ? 'de local' : 'de visitante') + '</span></div>'
      + '<div class="flex items-center gap-2 mb-3">' + escudo(r.nombre, 34)
      + '<span class="font-display uppercase tracking-wide text-base text-ink">' + esc(r.nombre) + '</span></div>'
      + '<div class="grid md:grid-cols-2 gap-3">'
      + miniPartido('Su partido anterior', r.anterior, r.clave,
        'Todavía no jugó ningún partido en este torneo.')
      + miniPartido('Su partido siguiente', r.siguiente, r.clave,
        'No tiene otro partido declarado después del tuyo.')
      + '</div>'
      + '<p class="text-[11px] text-muted mt-3">El marcador sale del libro de la categoría; '
      + 'la fecha y la hora, del calendario del torneo.</p>'
      + '</div>';
  }

  function encabezado(a, doc, planilla) {
    const nombre = (doc && doc.nombre) || (planilla && planilla.label) || 'Fixture';
    const zona = estado.zonaLabel ? ' · ' + estado.zonaLabel : '';
    const partes = [];
    if (a.declarados) partes.push(a.declarados + ' partidos declarados');
    if (a.jugados) partes.push(a.jugados + ' jugados');
    return '<div class="card rounded-xl p-4 sm:p-5 border border-hairline">'
      + '<div class="flex items-baseline justify-between gap-3 flex-wrap">'
      + '<h3 class="font-display uppercase tracking-wide text-sm text-ink">' + esc(nombre + zona) + '</h3>'
      + '<span class="font-mono text-[11px] text-muted">' + esc(partes.join(' · ') || 'sin partidos') + '</span></div>'
      + (a.atipicos.length
        ? '<p class="text-xs mt-2 zona-aviso zona-texto">⚠ ' + a.atipicos.length
          + (a.atipicos.length === 1 ? ' partido viene' : ' partidos vienen')
          + ' con un año que no es el de la temporada ('
          + esc([...new Set(a.atipicos.map(p => String(p.fecha).slice(0, 4)))].join(', '))
          + '). Se muestran donde el libro los pone: la fecha se corrige en la planilla, '
          + 'no acá.</p>'
        : '')
      + (a.calendarioParcial
        ? '<p class="text-xs text-muted mt-2">El calendario publicado es PARCIAL: la liga anunció las primeras '
          + 'fechas y el resto se carga cuando salga. Lo que ya se jugó aparece igual, salga o no en el anuncio.</p>'
        : '')
      + '</div>';
  }

  /** La sección entera. */
  function html() {
    const planilla = planillaActual();
    const torneoId = planilla && planilla.torneo;
    const idx = (typeof SGADD_APP !== 'undefined') ? SGADD_APP.estado.idx : null;

    if (!torneoId) {
      return '<div class="space-y-5">'
        + '<div class="card rounded-xl p-4 sm:p-5 border border-hairline">'
        + '<h3 class="font-display uppercase tracking-wide text-sm text-ink mb-2">Fixture</h3>'
        + vacio('Esta categoría no está enganchada a un torneo',
          'El fixture sale del calendario del torneo, y esta categoría todavía no declara a cuál pertenece. '
          + 'Se engancha desde el Panel Master, en <strong>Torneos → Enganchar un cliente</strong>.')
        + '</div></div>';
    }
    if (estado.torneo !== torneoId || estado.doc === null) {
      if (estado.torneo === torneoId && estado.error) {
        return '<div class="space-y-5"><div class="card rounded-xl p-4 sm:p-5 border border-hairline">'
          + '<h3 class="font-display uppercase tracking-wide text-sm text-ink mb-2">Fixture</h3>'
          + vacio('Todavía no hay fixture publicado',
            'El torneo está declarado pero su calendario no se pudo leer. Mientras tanto, los partidos '
            + 'que ya se jugaron se ven en <strong>Equipos → Partidos</strong> y en la tabla de posiciones.')
          + '</div></div>';
      }
      return (typeof SGADD_UI !== 'undefined' && SGADD_UI.cargando)
        ? SGADD_UI.cargando('Cargando el fixture…', 'el calendario del torneo')
        : '<p class="text-xs text-muted">Cargando…</p>';
    }

    const a = agenda({
      torneo: estado.doc, zona: planilla.zona, idx: idx,
      equipo: equipoPropio(), mes: estado.mes || null,
    });

    if (!a.total) {
      return '<div class="space-y-5">' + encabezado(a, estado.doc, planilla)
        + '<div class="card rounded-xl p-4 sm:p-5 border border-hairline">'
        + vacio('El torneo todavía no empezó',
          'No hay partidos declarados ni jugados en ' + esc((estado.doc && estado.doc.nombre) || 'este torneo')
          + '. Cuando la liga publique el fixture, o cuando se juegue la primera fecha, aparecen acá.')
        + '</div></div>';
    }

    return '<div class="space-y-5">' + encabezado(a, estado.doc, planilla)
      + bloqueRival(a) + bloqueMes(a) + '</div>';
  }

  /** El equipo del club, si la categoría abierta declara uno. */
  function equipoPropio() {
    try {
      const p = planillaActual();
      if (p && p.equipoPropio) return p.equipoPropio;
      if (typeof CLUB !== 'undefined' && CLUB.estado.cfg && CLUB.estado.cfg.equipoEscudo) {
        return CLUB.estado.cfg.equipoEscudo;
      }
    } catch (e) { /* sin equipo: se muestra el calendario entero */ }
    return '';
  }

  function pintar() {
    const n = (typeof document !== 'undefined') ? document.getElementById('view-root') : null;
    if (!n) return;
    n.innerHTML = html();
  }

  function irAMes(m) { estado.mes = m; pintar(); }

  /**
   * El punto de entrada de la sección.
   *
   * Se engancha a la promesa de `cargar()` igual que Equipos y Comparativa:
   * entrando antes de que baje la categoría, el hook de `onCambio` sería el
   * único que repinta y la vista quedaría clavada en «Cargando…».
   */
  function montar() {
    estado.mes = '';
    const planilla = planillaActual();
    const id = planilla && planilla.torneo;
    estado.zonaLabel = (planilla && planilla.label) || '';
    pintar();
    if (id) cargarTorneo(id).then(() => { if (vigente()) pintar(); });
    if (typeof SGADD_APP !== 'undefined') {
      SGADD_APP.cargar().then(() => { if (vigente()) pintar(); });
    }
  }

  /* Repintar solo si el DT sigue en la sección: dos cambios seguidos
     pintarían el fixture encima de otra pantalla. */
  function vigente() {
    try { return typeof currentSection === 'undefined' || currentSection === 'fixture'; }
    catch (e) { return true; }
  }

  return {
    /* motor */
    fechaISO, fechaLarga, mesLargo, mesDe, mesMas, claveCruce,
    normalizarCalendario, jugadosDelIndice, rivalDelTexto, unir, delEquipo, resultado,
    meses, mesPorDefecto, deMes, proximo, anterior, agenda, aniosAtipicos,
    /* ui */
    html, pintar, montar, irAMes, cargarTorneo, estado, vacio,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_FIXTURE;
