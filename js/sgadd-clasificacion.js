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
  };
  const ORDEN_POR_DEFECTO = ['PCT', 'DIF', 'PF'];

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

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
    const filasOrdenadas = ordenar(filas(idx), orden);
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

  return { CRITERIOS, ORDEN_POR_DEFECTO, filas, ordenar, tabla };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CLASIF;


/* =====================================================================
   UI · la sección Clasificación
   ===================================================================== */

/* El formato de competencia vigente para el tramo abierto. Un solo lugar
   lo resuelve: si cada consumidor volviera a leer el JSON del club y a
   componer la clave TORNEO|FASE, tarde o temprano uno se queda viejo. */
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
  const filas = SGADD_CLASIF.tabla(idx, { formato: formato, orden: orden });
  if (!filas.length) return clasifCartel('Sin partidos cargados en este tramo.');

  const completa = o.columnas === 'completa';
  const recorte = o.limite ? filas.slice(0, o.limite) : filas;

  const th = 'px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-muted ' +
    'whitespace-nowrap font-display font-semibold border-b border-hairline bg-surface2/50';
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
        <span class="inline-flex items-center gap-2">${clasifEscudo(r.nombre)}${SGADD_UI.esc(r.nombre)}</span>
      </td>
      ${cols.map(v => `<td class="${td}">${SGADD_UI.esc(String(v))}</td>`).join('')}
    </tr>`;
  }).join('');

  return `<div class="scrollbox rounded-lg border border-hairline/50 overflow-hidden">
      <table class="w-full border-collapse tabla-rank">
        <thead><tr>${cabeceras.map(h => `<th class="${th}">${SGADD_UI.esc(h)}</th>`).join('')}</tr></thead>
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
