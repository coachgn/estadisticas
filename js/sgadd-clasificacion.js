/* =====================================================================
   SGADD · Sección CLASIFICACIÓN

   Dos mitades, como el resto del proyecto:

     · `SGADD_CLASIF` es el motor PURO —arma la tabla desde el índice y
       le cuelga la zona de cada puesto— y se testea desde Node.
     · Abajo va la UI, que usa `document` y se verifica en el navegador.

   ---------------------------------------------------------------------
   POR QUÉ EXISTE ESTE MÓDULO

   La tabla de posiciones vivía en la capa de datos vieja del index, en
   DOS funciones que calculaban lo mismo desde la misma hoja con
   agregaciones distintas —`renderStandingsTable` y
   `renderFullStandingsTable`— y solo una pintaba zonas. Esas zonas
   estaban HARDCODEADAS:

       if (pos <= 8) verde; else if (pos <= 10) amarillo; else rojo;

   Ocho a playoffs para todos los clientes, todas las categorías y todos
   los torneos, con verdes de Tailwind que además no sobreviven al
   papel. Ahora los cortes salen de `sgadd-config.js` y el cálculo sale
   del ÍNDICE, que ya viene scopeado al tramo.
   ===================================================================== */
const SGADD_CLASIF = (function () {
  'use strict';

  /* Los criterios de desempate que `ordenTabla` puede nombrar. `dir` es
     el sentido: -1 ordena de mayor a menor. `PC` es el único al revés —
     recibir menos puntos es mejor. */
  const CRITERIOS = {
    PCT: { dir: -1, valor: (r) => r.pct },
    PG:  { dir: -1, valor: (r) => r.pg },
    DIF: { dir: -1, valor: (r) => r.dif },
    PF:  { dir: -1, valor: (r) => r.pf },
    PC:  { dir:  1, valor: (r) => r.pc },
    /* Puntos de tabla a la argentina: 2 por ganado, 1 por perdido. Es
       OPT-IN — un club lo usa declarando `ordenTabla: ["PTS", …]`. El
       default sigue siendo PCT, porque cambiarlo reordenaría la tabla de
       los tres clientes sin que nadie lo pidiera. */
    PTS: { dir: -1, valor: (r) => r.puntos },
  };
  const ORDEN_POR_DEFECTO = ['PCT', 'DIF', 'PF'];

  /* Los puntos que reparte cada partido. Van acá y no en la vista para
     que la columna, el criterio de orden y el badge digan lo mismo. */
  const PUNTOS_GANADO = 2;
  const PUNTOS_PERDIDO = 1;
  function puntosDeTabla(pg, pp) { return pg * PUNTOS_GANADO + pp * PUNTOS_PERDIDO; }

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

/* =====================================================================
   PARTIDOS SIN ESTADÍSTICAS · la carga manual

   Cuando GES no registra el box score, el partido existió igual: cuenta
   para la tabla y no puede faltar. Pero NO puede entrar por donde entran
   los demás.

   POR QUÉ NO VAN AL ÍNDICE. `construirIndice()` alimenta TODO: eFG%,
   PACE, percentiles, bandas z, arquetipos, el grupo de pares. Un partido
   del que solo se sabe el marcador metido ahí produciría un equipo con
   PJ mayor y los mismos totales de tiro — o sea eFG% y PACE diluidos, y
   un jugador con menos minutos por partido sin haber faltado a ninguno.
   Serían números plausibles y falsos, que es lo que este proyecto no
   hace.

   Por eso viven aparte y se fusionan SOLO acá, sobre las filas ya
   armadas de la tabla. Lo que tocan es exactamente: PJ, PG, PP, PF, PC
   y el split local/visitante — de donde salen PCT, DIF y los puntos de
   tabla. Nada más.

   EL SCOPE ES club + categoría + TRAMO. Sin el tramo, un partido de la
   IDA contaría también en la VUELTA: las claves de `porTramo` ya son
   `TORNEO|FASE` y acá se usa la misma (punto 32).
   ===================================================================== */

  /** Normaliza como el resto del proyecto, para que matchee con el índice. */
  function claveDe(nombre) {
    try {
      if (typeof SGADD !== 'undefined' && SGADD.claveEquipo) return SGADD.claveEquipo(nombre);
    } catch (e) { /* el núcleo puede no haber cargado */ }
    return String(nombre || '').trim().toUpperCase();
  }

  /**
   * Los partidos manuales de UN tramo, ya validados.
   *
   * Se descarta lo que no se puede contar: sin los dos equipos o sin los
   * dos marcadores no hay resultado, y un empate no existe en básquet —
   * dejarlo pasar daría un partido que no suma ni a ganados ni a
   * perdidos y descuadraría PJ contra PG+PP.
   */
  const TOTAL = '*TOTAL*';
  const esTramoTotal = (t) => String(t || '').toUpperCase() === TOTAL;

  function manualValido(p) {
    if (!p || typeof p !== 'object') return false;
    const pl = Number(p.puntosLocal), pv = Number(p.puntosVisitante);
    return !!String(p.local || '').trim() && !!String(p.visitante || '').trim()
      && isFinite(pl) && isFinite(pv) && pl !== pv;
  }

  function manualesDelTramo(mapa, torneo, fase) {
    if (!mapa || typeof mapa !== 'object') return [];
    const f = String(fase || '').toUpperCase();

    /* EL TOTAL NO ES UNA LLAVE MÁS: ES LA SUMA DE SUS TORNEOS.

       Un partido manual se carga en un tramo donde SE JUEGA —IDA,
       VUELTA— porque el sintético no es un torneo sino la suma de los
       reales. Con una búsqueda por llave exacta ese partido quedaba
       invisible justo en la vista que el panel abre por defecto (punto
       3 ter), o sea que el DT cargaba un resultado y la tabla que ve al
       entrar seguía sin contarlo.

       Se juntan SOLO los de la MISMA FASE, por el mismo motivo que el
       TOTAL derivado del núcleo no mezcla fases: sumar una regular con
       unos playoffs no significa nada.

       La llave sintética se sigue leyendo por RETROCOMPATIBILIDAD: hubo
       una ventana en la que el formulario dejaba caer ahí un partido
       (el destino por defecto era el tramo abierto en la barra, y el
       panel abre en TOTAL). Descartarla ahora borraría de la tabla
       partidos que el club ya cargó. */
    const claves = esTramoTotal(torneo)
      ? Object.keys(mapa).filter(k => k.toUpperCase().split('|')[1] === f)
      : [String(torneo || '').toUpperCase() + '|' + f];

    /* Un mismo `id` no se cuenta dos veces: si alguna vez un partido
       quedara en dos llaves de la misma fase, el TOTAL lo sumaría
       duplicado y PJ dejaría de cuadrar contra PG+PP. */
    const vistos = {};
    const out = [];
    claves.forEach(k => {
      const lista = mapa[k];
      if (!Array.isArray(lista)) return;
      lista.forEach(p => {
        if (!manualValido(p)) return;
        const id = p.id ? String(p.id) : null;
        if (id) { if (vistos[id]) return; vistos[id] = true; }
        out.push(p);
      });
    });
    return out;
  }

  /** Una fila vacía, para el equipo que SOLO tiene partidos manuales. */
  function filaVacia(clave, nombre) {
    return {
      clave: clave, nombre: nombre || clave,
      pj: 0, pg: 0, pp: 0, pct: 0, pf: 0, pc: 0, dif: 0,
      pfProm: 0, pcProm: 0,
      local: { pg: 0, pp: 0 }, visitante: { pg: 0, pp: 0 },
      manuales: 0, detalleManual: [],
    };
  }

  /**
   * Fusiona los partidos manuales sobre las filas de la tabla.
   *
   * Devuelve filas NUEVAS: no muta las que vienen del índice, que las
   * usan otras pantallas.
   */
  function fusionarManuales(base, manuales) {
    const filas = (base || []).map(f => Object.assign({}, f, {
      local: Object.assign({}, f.local),
      visitante: Object.assign({}, f.visitante),
      manuales: 0, detalleManual: [],
    }));
    if (!manuales || !manuales.length) {
      filas.forEach(recalcular);
      return filas;
    }

    const porClave = new Map();
    filas.forEach(f => porClave.set(claveDe(f.clave), f));
    const traer = (nombre) => {
      const k = claveDe(nombre);
      if (!porClave.has(k)) {
        /* Un equipo que SOLO tiene partidos manuales igual va a la tabla:
           si no, desaparece del torneo por no tener box score. */
        const nueva = filaVacia(k, String(nombre || '').trim());
        porClave.set(k, nueva);
        filas.push(nueva);
      }
      return porClave.get(k);
    };

    manuales.forEach(p => {
      const pl = Number(p.puntosLocal), pv = Number(p.puntosVisitante);
      const fl = traer(p.local), fv = traer(p.visitante);
      const ganaLocal = pl > pv;

      [[fl, pl, pv, ganaLocal, 'local', p.visitante],
       [fv, pv, pl, !ganaLocal, 'visitante', p.local]].forEach(([f, pro, con, gano, rol, rival]) => {
        f.pj += 1;
        f.pf += pro;
        f.pc += con;
        if (gano) { f.pg += 1; f[rol === 'local' ? 'local' : 'visitante'].pg += 1; }
        else { f.pp += 1; f[rol === 'local' ? 'local' : 'visitante'].pp += 1; }
        f.manuales += 1;
        /* El desglose que pide el badge: fecha, rol, rival y resultado. */
        f.detalleManual.push({
          fecha: p.fecha || null,
          rol: rol === 'local' ? 'Local' : 'Visitante',
          rival: String(rival || '').trim(),
          puntosPropios: pro,
          puntosRival: con,
          gano: !!gano,
        });
      });
    });

    filas.forEach(recalcular);
    return filas;
  }

  /* Lo derivado se recalcula DESPUÉS de sumar, nunca se suma: un
     porcentaje o una diferencia acumulados darían cualquier cosa. */
  function recalcular(f) {
    f.dif = f.pf - f.pc;
    f.pct = f.pj > 0 ? f.pg / f.pj : 0;
    f.pfProm = f.pj > 0 ? f.pf / f.pj : 0;
    f.pcProm = f.pj > 0 ? f.pc / f.pj : 0;
    f.puntos = puntosDeTabla(f.pg, f.pp);
  }

  /**
   * Una fila por equipo, con todo lo que las dos tablas necesitaban.
   *
   * NO recalcula nada que el índice ya tenga: `e.record` trae el récord,
   * `e.totales` los puntos a favor y en contra, y `e.split` el desglose
   * de local y visitante. Las dos funciones viejas rehacían esas tres
   * sumas a mano sobre la hoja cruda, cada una a su manera.
   */
  function filas(idx) {
    if (!idx || typeof idx.lista !== 'function') return [];
    return idx.lista().map((e) => {
      const rec = e.record || { ganados: 0, perdidos: 0, pj: 0 };
      const tot = e.totales || { propio: {}, rival: {} };
      const pf = num(tot.propio && tot.propio['PTS']);
      const pc = num(tot.rival && tot.rival['PTS']);
      const pj = num(rec.pj);
      const L = (e.split && e.split.LOCAL) || { ganados: 0, perdidos: 0 };
      const V = (e.split && e.split.VISITANTE) || { ganados: 0, perdidos: 0 };
      return {
        clave: e.clave,
        nombre: e.nombre || e.clave,
        pj: pj,
        pg: num(rec.ganados),
        pp: num(rec.perdidos),
        /* Sin partidos el porcentaje es 0 y no NaN: un equipo dado de
           alta que todavía no jugó tiene que entrar a la tabla igual. */
        pct: pj > 0 ? num(rec.ganados) / pj : 0,
        pf: pf,
        pc: pc,
        dif: pf - pc,
        pfProm: pj > 0 ? pf / pj : 0,
        pcProm: pj > 0 ? pc / pj : 0,
        local: { pg: num(L.ganados), pp: num(L.perdidos) },
        visitante: { pg: num(V.ganados), pp: num(V.perdidos) },
      };
    });
  }

  /**
   * Ordena por la lista de criterios, en cascada.
   *
   * Las dos funciones viejas ordenaban SOLO por `pct`, así que dos
   * equipos empatados quedaban en el orden en que Object.keys los
   * devolvía — o sea que podían intercambiarse entre repintados sin que
   * cambiara un solo dato. Con un torneo que define descenso por
   * posición eso no es un detalle cosmético.
   *
   * El último desempate es el NOMBRE: alfabético es arbitrario, pero es
   * estable y auditable, que es lo que hace falta cuando dos equipos
   * empatan en todo.
   */
  function ordenar(lista, orden) {
    const crits = (Array.isArray(orden) && orden.length ? orden : ORDEN_POR_DEFECTO)
      .map((id) => CRITERIOS[String(id).toUpperCase()])
      .filter(Boolean);
    const usar = crits.length ? crits : ORDEN_POR_DEFECTO.map((id) => CRITERIOS[id]);
    return lista.slice().sort((a, b) => {
      for (let i = 0; i < usar.length; i++) {
        const c = usar[i];
        const d = (c.valor(a) - c.valor(b)) * c.dir;
        if (d !== 0) return d;
      }
      return String(a.nombre).localeCompare(String(b.nombre));
    });
  }

  /**
   * La tabla completa: filas ordenadas, con puesto y zona.
   *
   * `formato` es lo que devuelve `SGADD_CONFIG.formatoDeTramo()`. Si
   * viene null —el club no configuró nada, o el tramo apaga las zonas—
   * la tabla sale igual, sin colores. Es la regla de siempre: la config
   * es opcional y su ausencia no puede dejar la pantalla vacía.
   */
  function tabla(idx, opciones) {
    const o = opciones || {};
    const orden = o.orden || (o.config && o.config.ordenTabla) || ORDEN_POR_DEFECTO;
    /* LOS MANUALES SE FUSIONAN ACÁ, y solo acá: es el único punto por el
       que pasan las dos tablas (la sección y el resumen de Principal),
       así que no pueden mostrar totales distintos. Sin `manuales` la
       fusión igual corre, porque es la que calcula `puntos`. */
    const conManuales = fusionarManuales(filas(idx), o.manuales || []);
    const filasOrdenadas = ordenar(conManuales, orden);
    const total = filasOrdenadas.length;
    const zonaDe = (typeof SGADD_CONFIG !== 'undefined' && o.formato)
      ? (p) => SGADD_CONFIG.zonaDePuesto(o.formato, p, total)
      : () => null;
    return filasOrdenadas.map((r, i) => {
      r.puesto = i + 1;
      r.zona = zonaDe(r.puesto);
      return r;
    });
  }

  return { CRITERIOS, ORDEN_POR_DEFECTO, filas, ordenar, tabla,
           fusionarManuales, manualesDelTramo, puntosDeTabla, esTramoTotal,
           PUNTOS_GANADO, PUNTOS_PERDIDO };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CLASIF;


/* =====================================================================
   UI · la sección Clasificación
   ===================================================================== */

/* El formato de competencia vigente para el tramo abierto. Un solo lugar
   lo resuelve: si cada consumidor volviera a leer el JSON del club y a
   componer la clave TORNEO|FASE, tarde o temprano uno se queda viejo. */
/* =====================================================================
   DE DÓNDE SALEN LOS PARTIDOS MANUALES

   Del catálogo publicado, con la misma cascada y el mismo scope que las
   zonas: club → categoría → tramo. Se resuelve en UN solo lugar porque
   lo consumen dos tablas —la sección y el resumen de Principal— y dos
   resolvedores darían dos totales para el mismo equipo.
   ===================================================================== */
function clasifManualesVigentes() {
  try {
    if (typeof SGADD_CLIENTES === 'undefined' || !SGADD_CLIENTES.estado) return [];
    const clubId = SGADD_CONFIG.clubActivo();
    const club = (SGADD_CLIENTES.estado.clubes || []).filter(c => c.slug === clubId || c.id === clubId)[0];
    if (!club || !club.partidosManuales) return [];
    const cat = SGADD_CONFIG.categoriaActiva();
    const mapa = club.partidosManuales[cat];
    if (!mapa) return [];
    const st = SGADD_APP.estado;
    return SGADD_CLASIF.manualesDelTramo(mapa, st.torneo, st.fase);
  } catch (e) { return []; }   // es una mejora, no una dependencia dura
}

/**
 * El badge amarillo de «partidos sin registro de estadísticas».
 *
 * Va en la fila de la tabla y en la ficha del equipo. El desglose
 * —fecha, rol, rival y resultado— viaja en el `title` para que también
 * se lea con el teclado y en el papel, donde no hay hover.
 */
function clasifBadgeManual(fila) {
  const n = (fila && fila.manuales) || 0;
  if (!n) return '';
  const det = (fila.detalleManual || []).map(d =>
    (d.fecha ? SGADD_UI.esc(String(d.fecha)) + ' · ' : '')
    + d.rol + ' vs ' + SGADD_UI.esc(d.rival)
    + ' · ' + d.puntosPropios + '-' + d.puntosRival
    + ' (' + (d.gano ? 'ganado' : 'perdido') + ')').join('\n');
  const texto = 'Este equipo cuenta con ' + n + ' partido'
    + (n === 1 ? '' : 's') + ' sin registro de estadísticas.';
  return '<span class="badge-manual" title="' + SGADD_UI.esc(texto + '\n\n' + det) + '"'
    + ' tabindex="0" role="note" aria-label="' + SGADD_UI.esc(texto) + '">⚠ ' + n + '</span>';
}

/** El banner, para la ficha del equipo (donde hay lugar para la frase). */
function clasifBannerManual(fila) {
  const n = (fila && fila.manuales) || 0;
  if (!n) return '';
  const filas = (fila.detalleManual || []).map(d => `<li>
      <span class="font-mono">${d.fecha ? SGADD_UI.esc(String(d.fecha)) : '—'}</span>
      · ${d.rol} vs <b>${SGADD_UI.esc(d.rival)}</b>
      · <span class="font-mono">${d.puntosPropios}-${d.puntosRival}</span>
      ${d.gano ? '✓' : '✗'}</li>`).join('');
  return `<details class="aviso-manual rounded-lg px-3 py-2 mb-4 text-xs">
    <summary class="cursor-pointer">⚠ Este equipo cuenta con ${n} partido${n === 1 ? '' : 's'}
      sin registro de estadísticas.</summary>
    <p class="mt-2 opacity-80">Cuentan para la tabla —resultado, diferencia y puntos— pero
      no para las métricas: no tienen box score, así que no entran a eFG%, PACE ni a nada
      de jugadores.</p>
    <ul class="mt-2 space-y-1">${filas}</ul>
  </details>`;
}

function clasifFormatoVigente() {
  if (typeof SGADD_CONFIG === 'undefined') return { config: null, formato: null, origen: 'ninguno' };
  const cfgClub = (typeof CLUB !== 'undefined' && CLUB.cfg) ? CLUB.cfg : null;
  const st = SGADD_APP.estado;
  /* `resolver()` y NO `parsear()`: el segundo se come el override local
     y la tabla seguiría pintando el corte viejo después de que el DT lo
     cambió desde Configuración, sin ningún síntoma. */
  return SGADD_CONFIG.resolver(cfgClub, st.torneo, st.fase);
}

function clasifCartel(txt, tono) {
  const c = tono === 'error' ? 'text-red-400' : 'text-muted';
  return `<div class="card rounded-xl p-8 border border-hairline text-center ${c} text-sm">${SGADD_UI.esc(txt)}</div>`;
}

/* EL ESCUDO DE LA TABLA DE POSICIONES.

   Va entre el puesto y el nombre, dentro de la MISMA celda del nombre y
   no en una columna propia: una columna mas empuja la tabla a lo ancho, y
   en celular la tabla ya scrollea. Asi el escudo viaja pegado al nombre y
   la cantidad de columnas no cambia.

   SIN ESCUDO RESUELTO VAN LAS INICIALES, no un hueco. Es lo que pasa
   siempre que el manifiesto de logos no se pueda leer —abriendo el panel
   como `file://`, por ejemplo— y es la misma decision que ya tomaron el
   scouting y el scatter de Principal (punto 7.5).

   El tamaño es chico a proposito: la tabla tiene doce filas y el escudo
   es una ayuda para encontrar la propia, no el protagonista. */
function clasifEscudo(nombre) {
  const url = (typeof LOGOS !== 'undefined' && LOGOS.getUrl) ? LOGOS.getUrl(nombre) : null;
  if (url) {
    return '<img src="' + SGADD_UI.esc(url) + '" alt="" loading="lazy" ' +
      'class="w-5 h-5 object-contain shrink-0">';
  }
  /* Las iniciales salen de LOGOS, no de una fórmula propia: es la misma
     insignia que ya usan el scouting, el scatter y los PDF, y dos
     implementaciones terminan dando insignias distintas para el mismo
     club. */
  const ini = (typeof LOGOS !== 'undefined' && LOGOS.iniciales)
    ? LOGOS.iniciales(nombre)
    : String(nombre || '?').trim().slice(0, 2).toUpperCase();
  return '<span class="w-5 h-5 shrink-0 rounded-full bg-surface2 text-muted ' +
    'text-[9px] font-display inline-flex items-center justify-center">' +
    SGADD_UI.esc(ini) + '</span>';
}

/**
 * La tabla, en HTML. La usan la sección y el resumen de Principal.
 *
 * `columnas` decide el ancho del cuadro: 'completa' trae el desglose de
 * local y visitante, 'resumida' se queda con lo que entra en la pantalla
 * de entrada sin scrollear. Es la única diferencia entre las dos vistas
 * que antes justificaba tener dos funciones enteras duplicadas.
 */
function clasifTablaHTML(idx, opciones) {
  const o = opciones || {};
  /* El formato y el orden se resuelven UNA vez arriba y bajan por
     `opciones`. Si cada consumidor los volviera a resolver, el resumen de
     Principal y la seccion podrian ordenar distinto y mostrar dos tablas
     que se contradicen. */
  const vig = (o.formato !== undefined || o.orden !== undefined)
    ? { formato: o.formato || null, config: null } : clasifFormatoVigente();
  const formato = o.formato !== undefined ? o.formato : vig.formato;
  const orden = o.orden || (vig.config && vig.config.ordenTabla) || null;
  /* Si el que llama no los pasa, se resuelven acá: así el resumen de
     Principal y la sección muestran lo mismo sin que cada uno se acuerde. */
  const manuales = o.manuales !== undefined ? o.manuales : clasifManualesVigentes();
  const filas = SGADD_CLASIF.tabla(idx, { formato: formato, orden: orden, manuales: manuales });
  if (!filas.length) return clasifCartel('Sin partidos cargados en este tramo.');

  const completa = o.columnas === 'completa';
  const recorte = o.limite ? filas.slice(0, o.limite) : filas;

  /* =====================================================================
     QUE DICE CADA COLUMNA

     Va como `data-glosa` y NO como `data-metrica`, y esa es la decision
     que importa: la misma sigla no significa lo mismo en todas las
     tablas. Aca `PP` es «Partidos Perdidos»; en el glosario del motor
     `PP` es «Perdidas», que es cierto en el box score y falso en esta
     pantalla. Un tooltip que dice algo verdadero en otro lado es peor que
     no decir nada.

     Por lo mismo NO se agregan al glosario: ahi `PP` ya esta, y ocupado.
     ===================================================================== */
  const GLOSA = {
    'Pos': 'Posicion en la tabla',
    'PJ': 'Partidos Jugados',
    'PG': 'Partidos Ganados',
    'PP': 'Partidos Perdidos',
    'PG L': 'Partidos Ganados de Local',
    'PP L': 'Partidos Perdidos de Local',
    'PG V': 'Partidos Ganados de Visitante',
    'PP V': 'Partidos Perdidos de Visitante',
    'PF': 'Puntos a Favor',
    'PC': 'Puntos en Contra',
    'Dif': 'Diferencia de Puntos (PF menos PC)',
    'PCT%': 'Porcentaje de Victorias',
    'PF/P': 'Puntos a Favor por Partido',
    'PC/P': 'Puntos en Contra por Partido',
  };

  /* EL ENCABEZADO SE ALINEA COMO SU COLUMNA.

     Los valores van centrados y los titulos iban todos a la izquierda:
     en columnas de tres caracteres el titulo quedaba colgado del borde y
     no se leia sobre su propia columna.

     Las dos primeras se quedan a la izquierda —el puesto y el nombre del
     equipo— porque ahi es lo correcto: un nombre centrado en una columna
     de ancho variable baila de fila en fila. */
  const thBase = 'px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted ' +
    'whitespace-nowrap font-display font-semibold border-b border-hairline bg-surface2/50';
  const th = thBase + ' text-left';
  const td = 'px-3 py-2.5 whitespace-nowrap text-sm border-b border-hairline/40 ' +
    'text-white font-mono tabular-nums';

  const cabeceras = completa
    ? ['Pos', 'Equipo', 'PJ', 'PG', 'PP', 'PG L', 'PP L', 'PG V', 'PP V', 'PF', 'PC', 'Dif', 'PCT%', 'PF/P', 'PC/P']
    : ['Pos', 'Equipo', 'PJ', 'PG', 'PP', 'PCT%', 'Dif', 'PF/P', 'PC/P'];

  const cuerpo = recorte.map((r) => {
    /* La clase de zona va en el <tr> y la barra la pinta el <td>: en una
       tabla el fondo de la celda tapa el de la fila (punto 14). */
    const zc = r.zona ? ' zona-' + SGADD_UI.esc(r.zona.tono) : '';
    const titulo = r.zona ? ` title="${SGADD_UI.esc(r.zona.label)}"` : '';
    const cols = completa
      ? [r.pj, r.pg, r.pp, r.local.pg, r.local.pp, r.visitante.pg, r.visitante.pp,
         r.pf, r.pc, (r.dif > 0 ? '+' : '') + r.dif,
         (r.pct * 100).toFixed(1) + '%', r.pfProm.toFixed(1), r.pcProm.toFixed(1)]
      : [r.pj, r.pg, r.pp, (r.pct * 100).toFixed(1) + '%',
         (r.dif > 0 ? '+' : '') + r.dif, r.pfProm.toFixed(1), r.pcProm.toFixed(1)];
    return `<tr class="hover:bg-surface2/40 transition-colors${zc}"${titulo}>
      <td class="${td} font-bold">${r.puesto}</td>
      <td class="${td.replace('font-mono tabular-nums', 'font-body font-medium')} text-ink">
        <span class="inline-flex items-center gap-2">${clasifEscudo(r.nombre)}${SGADD_UI.esc(r.nombre)}${clasifBadgeManual(r)}</span>
      </td>
      ${cols.map(v => `<td class="${td}">${SGADD_UI.esc(String(v))}</td>`).join('')}
    </tr>`;
  }).join('');

  return `<div class="scrollbox rounded-lg border border-hairline/50 overflow-hidden">
      <table class="w-full border-collapse tabla-rank">
        <thead><tr>${cabeceras.map((h, i) => {
          const g = GLOSA[h];
          /* `Equipo` no lleva glosa: no es una sigla y explicarla seria
             ruido. Sin `data-glosa` el tooltip ni siquiera la considera. */
          /* Las dos primeras a la izquierda; el resto, centradas sobre
             sus numeros. `i` y no el nombre de la columna: el juego de
             cabeceras cambia entre la tabla completa y la resumida. */
          const cls = thBase + (i < 2 ? ' text-left' : ' text-center');
          return `<th class="${cls}"${g ? ` data-glosa="${SGADD_UI.esc(g)}"` : ''}>${SGADD_UI.esc(h)}</th>`;
        }).join('')}</tr></thead>
        <tbody>${cuerpo}</tbody>
      </table>
    </div>`;
}

/**
 * La leyenda de zonas, calculada sobre los equipos REALES.
 *
 * No sobre `equiposEsperados`: es la única forma de que el DT vea dónde
 * caen los cortes de verdad y no dónde deberían caer si el libro
 * trajera la cantidad declarada.
 */
function clasifLeyendaHTML(formato, total) {
  if (typeof SGADD_CONFIG === 'undefined' || !formato) return '';
  const zonas = SGADD_CONFIG.leyenda(formato, total);
  if (!zonas.length) return '';
  return `<div class="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
    ${zonas.map(z => `<span class="flex items-center gap-2 zona-${SGADD_UI.esc(z.tono)}">
        <span class="zona-punto shrink-0"></span>
        <span class="font-mono text-[11px] text-muted">${z.desde}–${z.hasta}</span>
        <span class="text-[11px] zona-texto">${SGADD_UI.esc(z.label)}</span>
      </span>`).join('')}
  </div>`;
}

function buildClasificacion() {
  const st = SGADD_APP.estado;
  if (!st.idx) {
    return SGADD_APP.barra() + SGADD_UI.cargando('Cargando la categoría…',
      (SGADD_APP.planillaActual() || {}).label);
  }
  const { config, formato } = clasifFormatoVigente();
  const orden = (config && config.ordenTabla) || SGADD_CLASIF.ORDEN_POR_DEFECTO;
  const total = st.idx.lista().length;

  const sinFormato = formato ? '' : SGADD_UI.aviso('Sin formato de competencia',
    'Este club no declara zonas para el tramo abierto, así que la tabla sale sin ' +
    'colores de clasificación ni descenso. Se configura en el JSON del club (bloque ' +
    '"competencia") y el Diagnóstico lo audita.');

  return SGADD_APP.barra() + `
    <section class="space-y-5 mt-5">
      ${sinFormato}
      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <div class="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 class="font-display uppercase tracking-wide text-sm text-ink">Tabla de posiciones</h2>
          <span class="text-[11px] text-muted font-mono">${total} equipos · orden ${
            SGADD_UI.esc(orden.join(' › '))}</span>
        </div>
        ${clasifLeyendaHTML(formato, total)}
        <div class="mt-4">${clasifTablaHTML(st.idx, { columnas: 'completa', formato: formato, orden: orden })}</div>
      </div>
    </section>`;
}
