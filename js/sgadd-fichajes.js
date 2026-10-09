/* =====================================================================
   SGADD · FICHAJES · el mercado de jugadores de un torneo (punto 87)

   Una sección POR INVITACIÓN: la ve el admin y los mails del padrón de
   fichajes, y solo de los torneos de su registro. El servidor es el que
   lo hace cumplir (`server/api/fichajes.js`); acá está la vidriera.

   QUÉ HACE
     1 · baja el libro COMPLETO de cada zona del torneo y arma un índice por
         zona —cada zona es su propia liga: los percentiles se miden contra
         ella, y por eso la comparación entre zonas va por percentil—;
     2 · etiqueta a todos con `jugadoresADN()`, el MISMO motor de la ficha
         y del scouting (punto 8: un solo motor por taxonomía);
     3 · filtra y ordena con `SGADD_MERCADO`, que es puro y testeado;
     4 · abre la RADIOGRAFÍA ADN de uno —lo que se va a encontrar en
         cancha—, compara hasta cuatro y exporta la radiografía a PDF A4
         vertical, como la ficha individual (punto 7.6 ter).

   LO QUE NO HACE
     · No estima edad, posición ni talla: salen de la ficha manual que
       carga el admin (KV, por torneo). Sin dato, se dice «sin ficha».
     · No escribe en la URL más que la sección: la búsqueda vive en
       memoria y se pierde al recargar, a propósito — un link compartido
       no tiene que abrir el libro de un torneo a quien no lo tiene.
   ===================================================================== */

const SGADD_FICHAJES = (function () {
  'use strict';

  const M = SGADD_MERCADO;
  const POR_PAGINA = 24;
  const MAX_COMPARAR = 4;
  /* Los colores de la comparación: uno por jugador, los mismos en el
     radar y en la tabla. Contrastan entre sí y contra el fondo oscuro y el
     papel (medidos ≥ 3:1 contra los dos, son marcas, no texto). */
  const COLORES = ['#FBBF24', '#60A5FA', '#F472B6', '#34D399'];

  const ST = {
    iniciado: false,
    torneos: null, admin: false, errorTorneos: null,
    torneo: null,
    zonas: {},            // slug -> { estado, label, nivel, idx, filas, fichas, fichasLeidas, tramo, error }
    crit: criteriosVacios(),
    /* El período (punto 90): un tramo del libro y/o un rango de días. Es
       de TODO el torneo, no de una zona: una búsqueda compara jugadores en
       el mismo período. Literal y no `PERIODO_VACIO`, que se declara abajo. */
    periodo: { tramo: null, desde: '', hasta: '' },
    orden: 'coincidencia', dir: 'desc',
    pagina: 1,
    vista: 'buscar',      // 'buscar' | 'radiografia' | 'comparar' | 'padron'
    abierto: null,        // id de la fila en la radiografía
    comparar: [],         // ids
    editandoFicha: false,
    filtrosAbiertos: true,
    padron: null, padronError: null,
  };

  function criteriosVacios() {
    return { texto: '', zonas: [], equipos: [], roles: [], incluirSecundarios: true,
      jerarquias: [], rolesMinutos: [], arquetipos: [], origen: null,
      soloCalificados: true, rangos: {}, edad: {}, nacimiento: {}, talla: {}, posiciones: [], puestosSecundarios: true,
      modelo: null };
  }

  const esc = (v) => SGADD_UI.esc(v);
  const escJs = (v) => SGADD_UI.escJs(v);
  const raiz = () => document.getElementById('view-root');
  const enSeccion = () => typeof currentSection !== 'undefined' && currentSection === 'fichajes';

  /* =====================================================================
     ARRANQUE · ¿este mail tiene el servicio?
     ===================================================================== */

  /**
   * Se llama una vez desde `init()`. Sin backend o sin sesión no hay a
   * quién preguntar y el servicio queda apagado: el item del menú no se
   * muestra. Con un 403 tampoco. Con un 200 se fija el servicio y se
   * repinta el menú.
   */
  function iniciar() {
    if (ST.iniciado) return Promise.resolve(false);
    ST.iniciado = true;
    return cargarTorneos().then(() => {
      try { if (typeof aplicarPermisosNav === 'function') aplicarPermisosNav(); } catch (e) { /* sin menú todavía */ }
      /* Entrando DIRECTO por `#fichajes`, el guard del router corrió antes
         de que el servidor contestara y pintó «servicio por invitación».
         Con la respuesta en mano se vuelve a pasar por el router, que es
         el único punto de entrada al render. */
      if (enSeccion() && typeof renderSection === 'function') renderSection('fichajes');
      return !!ST.torneos;
    });
  }

  function cargarTorneos() {
    if (typeof SGADD_DATA === 'undefined' || !SGADD_DATA.estadosCompartibles || !SGADD_DATA.estadosCompartibles()) {
      SGADD_AUTH.fijarServicios([]);
      return Promise.resolve(null);
    }
    return SGADD_DATA.fichajesTorneos().then(r => {
      ST.torneos = r.torneos || [];
      ST.admin = !!r.admin;
      ST.errorTorneos = null;
      SGADD_AUTH.fijarServicios([M.SERVICIO]);
      if (!ST.torneo && ST.torneos.length) ST.torneo = ST.torneos[0].id;
      return ST.torneos;
    }).catch(e => {
      ST.torneos = null;
      ST.errorTorneos = e;
      SGADD_AUTH.fijarServicios([]);
      return null;
    });
  }

  /* =====================================================================
     DATOS · una zona = un libro = un índice
     ===================================================================== */

  function torneoActual() {
    return (ST.torneos || []).filter(t => t.id === ST.torneo)[0] || null;
  }

  /** Las zonas que entran a la búsqueda: con libro y que no sean la
      postemporada interzonal (sus jugadores ya están en su zona, y
      medirlos contra un cuadro de ocho partidos no dice nada). */
  function zonasBuscables(t) {
    return ((t && t.zonas) || []).filter(z => z.conLibro && !z.interzonal);
  }

  function cargarTorneo() {
    const t = torneoActual();
    if (!t) return Promise.resolve();
    const pendientes = zonasBuscables(t).filter(z => !ST.zonas[t.id + '/' + z.slug]);
    return Promise.all(pendientes.map(z => cargarZona(t, z))).then(() => { if (enSeccion()) pintar(); });
  }

  function cargarZona(t, z) {
    const id = t.id + '/' + z.slug;
    ST.zonas[id] = { estado: 'cargando', label: z.label, slug: z.slug };
    return SGADD_DATA.fichajesZona(t.id, z.slug).then(r => {
      const hojas = {};
      Object.keys(r.hojas || {}).forEach(h => { hojas[h] = SGADD_DATA.matrizAFilas(r.hojas[h]); });
      const tramos = SGADD.combinacionesTorneoFase(hojas) || [];
      const zona = {
        estado: 'ok', slug: z.slug, label: r.label || z.label, nivel: r.nivel || z.nivel,
        hojas: hojas, tramos: tramos, tramoDefecto: SGADD.tramoPorDefecto(tramos) || {},
        fichas: r.fichas || {}, fichasLeidas: !!r.fichasLeidas,
        leidoEn: r.leidoEn || null, torneo: t.id,
        vistas: new Map(),   // firma del período -> vista ya calculada
      };
      /* El rango de días que trae la zona, para acotar el calendario. */
      const r0 = M.recortarHojas(hojas, { fase: zona.tramoDefecto.fase }, { fecha: SGADD.fecha, texto: SGADD.texto });
      zona.rangoDias = r0.rango;
      zona.base = vistaDe(zona, PERIODO_VACIO);
      ST.zonas[id] = zona;
    }).catch(e => {
      ST.zonas[id] = { estado: 'error', slug: z.slug, label: z.label, error: e };
    });
  }

  /* =====================================================================
     EL PERÍODO · fase y fechas (punto 90)

     Una VISTA es el índice de la zona para un período, con sus filas ya
     etiquetadas. Se calcula una vez por período y queda en caché: cambiar
     de fecha y volver no rehace nada.

       sin fechas   el tramo elegido (o el por defecto) con su índice de
                    siempre: lo que declara la planilla.
       con fechas   `recortarHojas` deja solo esos partidos y el índice se
                    RECONSTRUYE con el motor del TOTAL (punto 3 ter): todo
                    —promedios, tasas, percentiles contra la zona en ese
                    período, volumen, radar, tendencia— sale de la muestra
                    recortada.

     `AST%` (y `RO%`/`RD%`) del modo reconstruido salen con la fórmula de
     MotorStats desde el 2026-10-05: promedio del jugador sobre promedio
     del equipo (punto 24 del CLAUDE.md). Hasta ahí `AST%` se dejaba en
     blanco porque el núcleo le aplicaba la fórmula del equipo.
     ===================================================================== */
  const PERIODO_VACIO = { tramo: null, desde: '', hasta: '' };

  function firmaPeriodo(p) { return (p.tramo || '') + '|' + (p.desde || '') + '|' + (p.hasta || ''); }
  function periodoActivo(p) { return !!(p && (p.tramo || p.desde || p.hasta)); }

  function vistaDe(zona, p) {
    const firma = firmaPeriodo(p);
    if (zona.vistas.has(firma)) return zona.vistas.get(firma);
    const t = (ST.torneos || []).filter(x => x.id === zona.torneo)[0] || { id: zona.torneo };
    let tramo = zona.tramoDefecto;
    if (p.tramo) {
      tramo = zona.tramos.filter(x => x.id === p.tramo)[0] || null;
      /* La zona no jugó ese tramo: queda AFUERA, y se dice. */
      if (!tramo) {
        const v = { filas: [], idx: null, tramo: null, fueraDeTramo: true, partidos: 0, derivado: false };
        zona.vistas.set(firma, v);
        return v;
      }
    }
    let idx, partidos = null, sinFecha = 0, derivado = false;
    if (M.hayFechas(p)) {
      const rec = M.recortarHojas(zona.hojas, { fase: tramo.fase, torneo: tramo.torneo, desde: p.desde, hasta: p.hasta },
        { fecha: SGADD.fecha, texto: SGADD.texto });
      idx = SGADD.construirIndice(rec.hojas, { fase: tramo.fase, torneo: SGADD.TORNEO_TOTAL });
      partidos = rec.partidos; sinFecha = rec.sinFecha; derivado = true;
    } else {
      idx = SGADD.construirIndice(zona.hojas, { fase: tramo.fase, torneo: tramo.torneo });
      /* Los partidos se cuentan igual en los dos modos: partidos DISTINTOS
         de `Base Datos E` en el tramo. */
      partidos = M.recortarHojas(zona.hojas, { fase: tramo.fase, torneo: tramo.torneo },
        { fecha: SGADD.fecha, texto: SGADD.texto }).partidos;
    }
    /* LA VARA DE LA ZONA, no la del club que está abierto: el índice
       declara su nivel y `jugadoresUmbrales` lo toma antes que el estado
       de la app (punto 41). */
    if (idx && idx.liga && zona.nivel) idx.liga.nivel = zona.nivel;
    const v = { idx: idx, tramo: tramo, partidos: partidos, sinFecha: sinFecha, derivado: derivado, fueraDeTramo: false };
    v.filas = armarFilas(zona, t, v);
    zona.vistas.set(firma, v);
    return v;
  }

  /** La vista vigente de una zona, con el período que eligió el usuario. */
  function vistaActual(zona) { return vistaDe(zona, ST.periodo); }

  function zonasCargadas() {
    const t = torneoActual();
    if (!t) return [];
    return zonasBuscables(t).map(z => ST.zonas[t.id + '/' + z.slug]).filter(z => z && z.estado === 'ok');
  }

  /** Los tramos de TODO el torneo (la unión de sus zonas), sin repetir. */
  function tramosDelTorneo() {
    const vistos = new Map();
    zonasCargadas().forEach(z => z.tramos.forEach(t => { if (!vistos.has(t.id)) vistos.set(t.id, t); }));
    return Array.from(vistos.values());
  }

  /** El primer y el último día con partidos en el torneo, para el calendario. */
  function rangoDelTorneo() {
    let a = null, b = null;
    zonasCargadas().forEach(z => {
      const r = z.rangoDias || [];
      if (r[0] && (!a || r[0] < a)) a = r[0];
      if (r[1] && (!b || r[1] > b)) b = r[1];
    });
    return [a, b];
  }

  /** `2026-05-08` → `08/05/2026`. */
  function diaLegible(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  /**
   * Qué muestra está mirando la búsqueda: el período, cuántos partidos
   * entraron y cuántos jugadores quedaron afuera por no haber jugado en
   * él. Es lo que dice el badge: un percentil sobre doce partidos no se
   * lee igual que uno sobre la temporada.
   */
  function resumenPeriodo() {
    const p = ST.periodo;
    const zonas = zonasCargadas();
    let partidos = 0, sinPartidos = 0, sinFecha = 0;
    const fuera = [];
    zonas.forEach(z => {
      const v = vistaActual(z);
      if (v.fueraDeTramo) { fuera.push(z.label); return; }
      partidos += v.partidos || 0;
      sinFecha += v.sinFecha || 0;
      sinPartidos += Math.max(0, z.base.filas.length - v.filas.length);
    });
    const tramo = p.tramo ? tramosDelTorneo().filter(t => t.id === p.tramo)[0]
      : (zonas[0] ? zonas[0].tramoDefecto : null);
    const partes = [];
    partes.push(tramo && tramo.fase ? M.etiquetaTramo(tramo) : 'Tramo por defecto');
    if (p.desde && p.hasta) partes.push('del ' + diaLegible(p.desde) + ' al ' + diaLegible(p.hasta));
    else if (p.desde) partes.push('desde el ' + diaLegible(p.desde));
    else if (p.hasta) partes.push('hasta el ' + diaLegible(p.hasta));
    return { activo: periodoActivo(p), etiqueta: partes.join(' · '), partidos: partidos,
      sinPartidos: sinPartidos, sinFecha: sinFecha, zonasFuera: fuera, conFechas: M.hayFechas(p) };
  }

  /** El aviso de muestra parcial. Sale en la búsqueda, la Radiografía y el PDF. */
  function badgePeriodo(compacto) {
    const r = resumenPeriodo();
    if (!r.activo) return '';
    const extra = [];
    if (r.sinPartidos) extra.push(r.sinPartidos + ' jugador' + (r.sinPartidos === 1 ? '' : 'es') + ' sin partidos en el período quedaron afuera');
    if (r.zonasFuera.length) extra.push(r.zonasFuera.join(', ') + ' no jugó ese tramo');
    if (r.sinFecha) extra.push(r.sinFecha + ' planillas sin fecha que no se pudieron ubicar');
    return `<div class="fx-periodo rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 ${compacto ? '' : 'mb-3'}" role="status">
      <p class="text-[11px] text-ink"><span class="font-display uppercase tracking-wider text-accent">Período activo</span>
        · ${esc(r.etiqueta)} · <b>${r.partidos} partido${r.partidos === 1 ? '' : 's'} analizado${r.partidos === 1 ? '' : 's'}</b></p>
      <p class="text-[10px] dato-sec">Promedios, percentiles, volumen, radar y tendencia salen SOLO de esta muestra${extra.length ? ' · ' + esc(extra.join(' · ')) : ''}.</p>
    </div>`;
  }

  /** Los controles: fase/tramo y el calendario Desde–Hasta. */
  function bloquePeriodo() {
    const p = ST.periodo;
    const tramos = tramosDelTorneo();
    const rango = rangoDelTorneo();
    const def = zonasCargadas()[0] ? zonasCargadas()[0].tramoDefecto : null;
    const clase = 'rounded border border-hairline bg-surface2/40 px-2 py-1.5 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
    return `
      <div class="mb-4 pb-3 border-b border-hairline/60">
        <p class="text-[10px] uppercase tracking-widest font-display text-muted mb-1.5">Período</p>
        <div class="flex flex-wrap items-end gap-3">
          <label class="text-[11px] text-muted flex flex-col gap-1">Fase
            <select onchange="SGADD_FICHAJES.fijarPeriodo('tramo', this.value)" class="${clase}">
              <option value="">Por defecto${def && def.id ? ' (' + esc(M.etiquetaTramo(def)) + ')' : ''}</option>
              ${tramos.map(t => `<option value="${esc(t.id)}" ${p.tramo === t.id ? 'selected' : ''}>${esc(M.etiquetaTramo(t))}</option>`).join('')}
            </select></label>
          <label class="text-[11px] text-muted flex flex-col gap-1">Desde
            <input type="date" value="${esc(p.desde)}" ${rango[0] ? 'min="' + rango[0] + '"' : ''} ${rango[1] ? 'max="' + rango[1] + '"' : ''}
              onchange="SGADD_FICHAJES.fijarPeriodo('desde', this.value)" class="${clase}"></label>
          <label class="text-[11px] text-muted flex flex-col gap-1">Hasta
            <input type="date" value="${esc(p.hasta)}" ${rango[0] ? 'min="' + rango[0] + '"' : ''} ${rango[1] ? 'max="' + rango[1] + '"' : ''}
              onchange="SGADD_FICHAJES.fijarPeriodo('hasta', this.value)" class="${clase}"></label>
          ${periodoActivo(p) ? `<button type="button" onclick="SGADD_FICHAJES.quitarPeriodo()"
            class="text-[11px] text-muted hover:text-ink underline underline-offset-2 pb-1.5">Toda la temporada</button>` : ''}
        </div>
        <p class="text-[10px] dato-sec mt-1">${rango[0] ? 'Hay partidos del ' + esc(diaLegible(rango[0])) + ' al ' + esc(diaLegible(rango[1])) + '. ' : ''}Las fechas acotan DENTRO de la fase: una regular y unos playoffs no se mezclan.</p>
      </div>`;
  }

  function claveDe(nombre, equipo) {
    return SGADD.clavePersona(nombre) + '|' + SGADD.claveEquipo(equipo);
  }

  function fichaDe(zona, clave) {
    const f = zona.fichas && zona.fichas[clave];
    if (!f || !Object.keys(f).some(k => k === 'nacimiento' || k === 'posicion' || k === 'talla')) return null;
    const e = f.nacimiento ? M.edad(f.nacimiento) : null;
    /* La escala de nueve; una ficha de la escala vieja (nombre + secundaria)
       se lee plegada al híbrido, sin reescribirla en KV. */
    const pos = M.idPosicion(f.posicion, f.secundaria);
    return { nacimiento: f.nacimiento || null, edad: e ? e.anios : null, edadAprox: !!(e && e.aproximada),
      posicion: pos || null,
      talla: typeof f.talla === 'number' ? f.talla : null };
  }

  /** Qué tan cerca queda de cada perfil técnico (crédito parcial, punto 91). */
  function cercaniaPerfiles(j, prom) {
    const o = {};
    PERFILES_TECNICOS.forEach(p => { o[p.id] = jugadoresCercaniaPerfil(p, j, prom); });
    return o;
  }

  /**
   * El contexto que el motor del % de coincidencia no puede conocer: los
   * ejes de cada rol, las bandas de minutos, el orden de la jerarquía, las
   * etiquetas y cómo ubicar un valor en el percentil de SU zona.
   */
  function ctxCoincidencia() {
    const etiquetas = {}, ejes = {};
    JUGADORES_ROLES_FUNCIONALES.forEach(r => { etiquetas[r.id] = r.label; if (r.eje) ejes[r.id] = r.eje; });
    PERFILES_TECNICOS.forEach(p => { etiquetas[p.id] = p.label; });
    JERARQUIA.forEach(r => { etiquetas[r.id] = r.label; });
    ROLES_MINUTOS.forEach(r => { etiquetas[r.id] = r.label; });
    M.METRICAS_FILTRO.forEach(x => { etiquetas[x.id] = metrica(x.id).label; });
    return {
      etiquetas: etiquetas, ejes: ejes,
      bandasMinutos: ROLES_MINUTOS.map((r, i) => ({ id: r.id, min: r.min, max: i ? ROLES_MINUTOS[i - 1].min : Infinity })),
      ordenJerarquia: JERARQUIA.map(r => r.id),
      percentilDe: (f, k, v) => {
        const d = f._idx && f._idx.liga && f._idx.liga.distribucionesJ && f._idx.liga.distribucionesJ[k];
        return d ? SGADD.percentil(d, v, !!metrica(k).invertida) : null;
      },
    };
  }

  /** Una fila del mercado por jugador. El ADN sale del motor de la ficha. */
  function armarFilas(zona, t, vista) {
    const idx = vista && vista.idx;
    if (!idx || !idx.liga) return [];
    const derivado = !!(vista && vista.derivado);
    const adnMapa = jugadoresAdnLiga(idx);
    /* La vara de los perfiles técnicos de ESTA vista: la misma con la que
       el ADN los etiquetó, así que «calza» y cercanía 1 son lo mismo. */
    const promLiga = jugadoresPromediosLiga(idx);
    const out = [];
    (idx.liga.jugadores || []).forEach(j => {
      const adn = adnMapa.get(j);
      if (!adn) return;
      const clave = claveDe(j['NOMBRES'], j['EQUIPO']);
      /* LOS TOTALES DEL TRAMO. De `ACUMULADO J` (`__acum`) si está, y si no,
         la SUMA de su log partido a partido con SU equipo. La demo trae
         `ACUMULADO J` para 16 de 260 jugadores; el log está para todos y
         cierra exacto (medido: 555 tiros de campo = 17,34 × 32 PJ). Con el
         equipo filtrado, por el homónimo del punto 86. No tienen
         percentil: son el tamaño de la muestra, no un rendimiento. */
      const eqClave = SGADD.claveEquipo(j['EQUIPO']);
      const log = (idx.liga.jugadorPartidos.get(j.__clave) || []).filter(p => p.__equipo === eqClave);
      const total = (col) => {
        if (j.__acum && typeof j.__acum[col] === 'number') return j.__acum[col];
        const vals = log.map(p => p[col]).filter(v => typeof v === 'number' && isFinite(v));
        return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
      };
      const m = {}, pc = {};
      M.IDS_FILTRO.forEach(k => {
        if (k.indexOf('tot:') === 0) {
          m[k] = total(k.slice(4));
          pc[k] = null;
          return;
        }
        const r = idx.leerJugador(j, k);
        const v = r ? r.valor : null;
        m[k] = (v === null && k === 'RT') ? jugadoresNN(jugadoresRT(j)) : v;
        pc[k] = r ? r.percentil : null;
      });
      /* El volumen bruto, por partido y en el total del tramo. */
      const vol = {}, volTot = {};
      M.COLUMNAS_VOLUMEN.forEach(k => {
        vol[k] = jugadoresNN(j[k]);
        volTot[k] = total(k);
      });
      const perfil = adn.perfil || {};
      out.push({
        id: t.id + '/' + zona.slug + '::' + clave,
        clave: clave, nombre: String(j['NOMBRES'] || '').trim(),
        equipo: SGADD.limpiarNombre(j['EQUIPO']), equipoCrudo: j['EQUIPO'],
        zona: zona.slug, zonaLabel: zona.label, torneo: t.id,
        califica: !!j.__califica,
        rol: adn.rolFuncional ? adn.rolFuncional.id : null,
        secundarios: adn.rolFuncional ? (adn.rolFuncional.secundarios || []).map(s => s.id) : [],
        jerarquia: adn.jerarquia ? adn.jerarquia.id : null,
        rolMinutos: adn.rolMinutos ? adn.rolMinutos.id : null,
        arquetipos: (adn.arquetipos || []).map(a => a.id),
        cercania: cercaniaPerfiles(j, promLiga),
        origen: perfil.esInterior ? 'interior' : perfil.esPerimetral ? 'perimetral' : null,
        m: m, pc: pc, vol: vol, volTot: volTot, ficha: fichaDe(zona, clave),
        _j: j, _idx: idx, _adn: adn, _derivado: derivado,
      });
    });
    return out;
  }

  /** Todas las filas del torneo elegido, de las zonas que ya bajaron. */
  function filasDelTorneo() {
    const t = torneoActual();
    if (!t) return [];
    const out = [];
    zonasBuscables(t).forEach(z => {
      const zona = ST.zonas[t.id + '/' + z.slug];
      if (zona && zona.estado === 'ok') out.push.apply(out, vistaActual(zona).filas);
    });
    return out;
  }

  function filaPorId(id) { return filasDelTorneo().filter(f => f.id === id)[0] || null; }

  function zonaDeFila(f) { return ST.zonas[f.torneo + '/' + f.zona] || null; }

  /* =====================================================================
     FORMATO
     ===================================================================== */

  function metrica(k) {
    if (SGADD.METRICAS && SGADD.METRICAS[k]) return SGADD.METRICAS[k];
    const def = M.METRICAS_FILTRO.filter(x => x.id === k)[0];
    return { label: (def && def.label) || k, total: !!(def && def.total) };
  }
  function esTotal(k) { return String(k).indexOf('tot:') === 0; }
  function fmt(k, v) {
    if (v === null || v === undefined) return '—';
    return esTotal(k) ? String(Math.round(v)) : SGADD.formatear(k, v);
  }

  /** «5,2/11,4» por partido y «166/365» en el total, de una familia de tiro. */
  function volumen(f, fam, total) {
    const v = M.VOLUMEN_TIRO.filter(x => x.id === fam)[0];
    if (!v) return null;
    const src = total ? f.volTot : f.vol;
    return src ? M.textoVolumen(src[v.conv], src[v.int], total ? 0 : 1) : null;
  }
  function pcTexto(v) { return (typeof v === 'number') ? 'p' + Math.round(v) : '—'; }
  function tonoPc(v) {
    if (typeof v !== 'number') return 'text-muted';
    return v >= 75 ? 'text-green-400' : v >= 40 ? 'text-accent' : 'text-red-400';
  }
  function barraPc(v) {
    const ancho = (typeof v === 'number') ? Math.max(2, Math.min(100, v)) : 0;
    const color = typeof v !== 'number' ? '' : v >= 75 ? 'fx-bar-alta' : v >= 40 ? 'fx-bar-media' : 'fx-bar-baja';
    return `<span class="fx-bar" aria-hidden="true"><span class="fx-bar-fill ${color}" style="width:${ancho}%"></span></span>`;
  }

  /** «Puesto 2-3 · Escolta / Alero»: el número primero, que es como se
      habla en el banco, y el nombre para el que lee la ficha afuera. */
  function posicionTexto(fi) {
    if (!fi || !fi.posicion) return null;
    const p = M.POR_POSICION[fi.posicion];
    return p ? 'Puesto ' + p.id + ' · ' + p.label : null;
  }

  function fichaTexto(fi) {
    if (!fi) return 'Sin ficha';
    const partes = [];
    if (fi.edad !== null) partes.push((fi.edadAprox ? '~' : '') + fi.edad + ' años');
    const p = posicionTexto(fi);
    if (p) partes.push(p);
    if (fi.talla) partes.push((fi.talla / 100).toFixed(2).replace('.', ',') + ' m');
    return partes.length ? partes.join(' · ') : 'Sin ficha';
  }

  /* EL ESCUDO VA EN SU DISCO (`.escudo-aro`), no suelto sobre la card.
     Suelto, uno de trazo oscuro sobre transparente desaparecía contra el
     fondo negro. En el disco recibe el fondo que le corresponde según su
     propio dibujo (`SGADD_UI.tonoEscudo`, punto 89), igual que en el resto
     del panel. */
  function escudo(equipoCrudo, clase) {
    const tam = clase || 'w-8 h-8';
    const logo = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(equipoCrudo) : null;
    if (logo) return `<span class="escudo-aro ${tam} shrink-0"><img src="${esc(logo)}" alt=""></span>`;
    const ini = (typeof LOGOS !== 'undefined') ? LOGOS.iniciales(equipoCrudo) : String(equipoCrudo || '').slice(0, 2);
    return `<span class="${tam} shrink-0 rounded-full bg-surface2 grid place-items-center text-[10px] font-display text-muted">${esc(ini)}</span>`;
  }

  /* =====================================================================
     EL RADAR · SVG y no Chart.js

     Sale igual en pantalla y en el PDF: un canvas de Chart.js en la hoja
     necesita la paleta de papel, el `dibujarPendientes()` y un tamaño
     fijo (punto 7), y un SVG no necesita nada de eso. Un eje sin dato es
     un HUECO en el polígono, no un cero.
     ===================================================================== */
  function radarSvg(series, opciones) {
    const o = opciones || {};
    const t = o.tam || 260, c = t / 2, r = c - (o.margen || 46);
    const ejes = M.EJES_RADAR;
    const n = ejes.length;
    const punto = (i, v) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v];
    };
    const anillos = [0.25, 0.5, 0.75, 1].map(k =>
      `<polygon points="${ejes.map((_, i) => punto(i, k).join(',')).join(' ')}" class="fx-radar-anillo"/>`).join('');
    const rayos = ejes.map((_, i) => {
      const p = punto(i, 1);
      return `<line x1="${c}" y1="${c}" x2="${p[0]}" y2="${p[1]}" class="fx-radar-rayo"/>`;
    }).join('');
    const etiquetas = ejes.map((e, i) => {
      const p = punto(i, 1.17);
      const ancla = Math.abs(p[0] - c) < 4 ? 'middle' : p[0] > c ? 'start' : 'end';
      return `<text x="${p[0]}" y="${p[1]}" text-anchor="${ancla}" dominant-baseline="middle" class="fx-radar-txt">${esc(e.label)}</text>`;
    }).join('');
    const poligonos = (series || []).map(s => {
      const pts = s.ejes.map((e, i) => punto(i, e.valor === null ? 0 : e.valor / 100));
      const huecos = s.ejes.map((e, i) => e.valor === null
        ? `<circle cx="${punto(i, 0.06)[0]}" cy="${punto(i, 0.06)[1]}" r="2.5" fill="none" stroke="${s.color}"/>` : '').join('');
      const nodos = s.ejes.map((e, i) => e.valor === null ? ''
        : `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="2.6" fill="${s.color}"/>`).join('');
      return `<polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="${s.color}" fill-opacity="${o.relleno || 0.22}" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>${nodos}${huecos}`;
    }).join('');
    const titulo = o.titulo || 'Radar de percentiles contra su zona';
    return `<svg viewBox="0 0 ${t} ${t}" class="fx-radar" role="img" aria-label="${esc(titulo)}">
      <title>${esc(titulo)}</title>${anillos}${rayos}${poligonos}${etiquetas}</svg>`;
  }

  /** Línea de un jugador partido a partido, para la tendencia. */
  function sparkSvg(valores, opciones) {
    const o = opciones || {};
    const vs = valores.filter(v => typeof v === 'number');
    if (vs.length < 2) return '';
    const w = o.ancho || 220, h = o.alto || 44;
    const max = Math.max.apply(null, vs), min = Math.min.apply(null, vs);
    const rango = (max - min) || 1;
    const pts = valores.map((v, i) => typeof v !== 'number' ? null
      : [(i / (valores.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / rango) * (h - 6)]);
    const linea = pts.filter(Boolean).map(p => p.map(x => x.toFixed(1)).join(',')).join(' ');
    const ult = pts.filter(Boolean).slice(-1)[0];
    return `<svg viewBox="0 0 ${w} ${h}" class="fx-spark" role="img" aria-label="${esc(o.titulo || '')}">
      <polyline points="${linea}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      ${ult ? `<circle cx="${ult[0]}" cy="${ult[1]}" r="2.6" fill="currentColor"/>` : ''}</svg>`;
  }

  /* =====================================================================
     LA LECTURA · «lo que vas a ver en cancha»

     Todo sale de datos y de los motores existentes —rol funcional,
     arquetipos, síntesis, percentiles, su log partido a partido—, y cada
     frase dice de dónde sale. Nada de adjetivos que el número no sostiene.
     ===================================================================== */

  /** Los partidos del jugador CON SU EQUIPO, en orden. Filtrar por equipo
      no es opcional: `jugadorPartidos` se indexa por el nombre solo, y el
      homónimo de otro equipo se colaba (punto 86). */
  function partidosDe(f) {
    const eq = SGADD.claveEquipo(f.equipoCrudo);
    return jugadoresPartidosOrdenados(f._idx, f._j.__clave).filter(p => p.__equipo === eq);
  }

  function promedio(arr, k) {
    const vs = arr.map(p => p[k]).filter(v => typeof v === 'number' && isFinite(v));
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  }

  function tendencia(f) {
    const ps = partidosDe(f).filter(p => (p['MIN'] || 0) > 0);
    if (ps.length < 6) return null;
    const ult = ps.slice(-5);
    const filas = [['PTS', 2.0], ['MIN', 3.0], ['PLAYS', 2.0]].map(([k, umbral]) => {
      const tot = promedio(ps, k), u5 = promedio(ult, k);
      if (tot === null || u5 === null) return null;
      const d = u5 - tot;
      return { clave: k, temporada: tot, ultimos: u5, delta: d,
        lectura: Math.abs(d) < umbral ? 'estable' : d > 0 ? 'en alza' : 'en baja' };
    }).filter(Boolean);
    return { partidos: ps, filas: filas };
  }

  function condicion(f) {
    const ps = partidosDe(f).filter(p => (p['MIN'] || 0) > 0);
    const de = (c) => ps.filter(p => SGADD.texto(p['CONDICION']).toUpperCase() === c);
    const l = de('LOCAL'), v = de('VISITANTE');
    if (l.length < 3 || v.length < 3) return null;
    return { local: { pj: l.length, pts: promedio(l, 'PTS'), min: promedio(l, 'MIN') },
      visitante: { pj: v.length, pts: promedio(v, 'PTS'), min: promedio(v, 'MIN') } };
  }

  function lectura(f) {
    const adn = f._adn, j = f._j, idx = f._idx;
    const out = [];
    const rf = adn.rolFuncional;
    if (rf) {
      out.push({ t: 'Función', x: rf.label + (rf.detalle ? ': ' + rf.detalle : '') +
        ((rf.secundarios || []).length ? ' Además: ' + rf.secundarios.map(s => s.label).join(', ') + '.' : '') });
    }
    const pt3 = j['PT3%'], pt2 = j['PT2%'], pt1 = j['PT1%'];
    if ([pt3, pt2, pt1].every(v => typeof v === 'number')) {
      const lado = f.origen === 'interior' ? 'Juega adentro' : f.origen === 'perimetral' ? 'Juega afuera' : 'Sin un origen claro';
      /* PT2%/PT3%/PT1% son parte de sus JUGADAS (T2I / PLAYS), no de sus
         puntos: el resto de cada cien termina en pérdida. */
      out.push({ t: 'Cómo terminan sus jugadas', x: lado + ': de cada 100 jugadas suyas, ' + Math.round(pt2 * 100)
        + ' terminan en doble, ' + Math.round(pt3 * 100) + ' en triple y ' + Math.round(pt1 * 100) + ' en libres'
        + (typeof j['PePP%'] === 'number' ? '; ' + Math.round(j['PePP%'] * 100) + ' en pérdida.' : '.') });
    }
    (adn.arquetipos || []).slice(0, 3).forEach(a => {
      const d = typeof a.detalle === 'string' ? a.detalle : '';
      out.push({ t: a.emoji + ' ' + a.label, x: d || 'Perfil técnico que calza con sus números.' });
    });
    let sint = null;
    try { sint = jugadoresSintesisPerfil(idx, j); } catch (e) { sint = null; }
    if (sint) {
      out.push({ t: 'Impacto · ' + sint.impacto.nivel, x: sint.impacto.texto });
      out.push({ t: 'Eficiencia · ' + sint.eficiencia.nivel, x: sint.eficiencia.texto });
    }
    /* Fortalezas y fisuras salen de RENDIMIENTO. El volumen —minutos,
       partidos, intentos de tiro— no es una virtud ni un defecto: un
       «Tiros de campo int., p100» como lo que lo distingue confundía
       tirar mucho con tirar bien. */
    const rendimiento = M.METRICAS_FILTRO
      .filter(x => x.grupo !== 'Volumen de tiro' && x.id !== 'PJ' && x.id !== 'MIN').map(x => x.id);
    const fuertes = rendimiento.filter(k => typeof f.pc[k] === 'number' && f.pc[k] >= 80)
      .sort((a, b) => f.pc[b] - f.pc[a]).slice(0, 3);
    if (fuertes.length) {
      out.push({ t: 'Lo que lo distingue', x: fuertes.map(k => metrica(k).label + ' (' + fmt(k, f.m[k]) + ', ' + pcTexto(f.pc[k]) + ')').join(' · ') + '.' });
    }
    const flojas = rendimiento.filter(k => typeof f.pc[k] === 'number' && f.pc[k] <= 20)
      .sort((a, b) => f.pc[a] - f.pc[b]).slice(0, 2);
    if (flojas.length) {
      out.push({ t: 'Por dónde se lo expone', x: flojas.map(k => metrica(k).label + ' (' + fmt(k, f.m[k]) + ', ' + pcTexto(f.pc[k]) + ')').join(' · ') + '.' });
    } else if (sint && sint.puntoDeFuga) {
      out.push({ t: 'Por dónde se lo expone', x: sint.puntoDeFuga.texto });
    }
    const eq = idx.get(f.equipoCrudo);
    const pjEquipo = eq && eq.partidos ? eq.partidos.length : null;
    const pj = partidosDe(f).filter(p => (p['MIN'] || 0) > 0).length;
    if (pjEquipo) out.push({ t: 'Disponibilidad', x: 'Jugó ' + pj + ' de los ' + pjEquipo + ' partidos de su equipo en el tramo.' });
    if (!f.califica) out.push({ t: 'Muestra chica', x: JUGADORES_MOTIVO_SIN_RESPALDO });
    return out;
  }

  /** Los más parecidos del torneo, con el puntaje de similitud del punto 58. */
  function similares(f, n) {
    return filasDelTorneo()
      .filter(x => x.id !== f.id && x.califica)
      .map(x => ({ fila: x, sim: jugadoresSimilitud(f._adn, x._adn) }))
      .filter(x => x.sim.volumen && x.sim.volumen.ok)
      .sort((a, b) => b.sim.total - a.sim.total)
      .slice(0, n || 5);
  }

  /* =====================================================================
     PINTAR
     ===================================================================== */

  function montar() {
    pintar();
    if (!ST.iniciado) { iniciar(); return; }
    if (ST.torneos && ST.torneo) cargarTorneo();
  }

  function pintar() {
    const root = raiz();
    if (!root || !enSeccion()) return;
    const y = window.scrollY;
    root.innerHTML = cuerpo();
    montarMapas(root);
    if (ST.vista !== 'buscar') return;
    window.scrollTo(0, y);
  }

  function cuerpo() {
    if (ST.errorTorneos) {
      return `<div class="card rounded-xl p-6 border border-hairline text-center text-sm text-muted">
        ${esc(ST.errorTorneos.message || 'No se pudo abrir Fichajes.')}</div>`;
    }
    if (!ST.torneos) {
      return `<div class="card rounded-xl p-6 border border-hairline text-center text-sm text-muted">Cargando los torneos habilitados…</div>`;
    }
    if (!ST.torneos.length) {
      return `<div class="card rounded-xl p-6 border border-hairline text-center text-sm text-muted">No hay torneos dados de alta.</div>`;
    }
    const vista = ST.vista === 'radiografia' ? vistaRadiografia()
      : ST.vista === 'parecidos' ? vistaParecidos()
      : ST.vista === 'comparar' ? vistaComparar()
      : ST.vista === 'padron' ? vistaPadron()
      : vistaBuscar();
    return cabecera() + vista + barraComparar();
  }

  function cabecera() {
    const t = torneoActual();
    const chips = ST.torneos.map(x => `
      <button type="button" onclick="SGADD_FICHAJES.elegirTorneo('${escJs(x.id)}')"
        aria-pressed="${x.id === ST.torneo}"
        class="text-xs px-3 py-1.5 rounded-full border transition-colors
               focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
               ${x.id === ST.torneo ? 'border-accent text-ink bg-surface2' : 'border-hairline text-muted hover:text-ink hover:bg-surface2'}">
        ${esc(x.nombreCorto || x.nombre)}</button>`).join('');
    const zonas = t ? zonasBuscables(t).map(z => {
      const zz = ST.zonas[t.id + '/' + z.slug];
      const est = !zz ? '' : zz.estado === 'cargando' ? ' · cargando…' : zz.estado === 'error' ? ' · no se pudo leer'
        : ' · ' + zz.base.filas.length + ' jugadores';
      return `<span class="text-[11px] ${zz && zz.estado === 'error' ? 'text-red-400' : 'text-muted'}">${esc(z.label)}${esc(est)}</span>`;
    }).join('<span class="text-muted/50" aria-hidden="true">·</span>') : '';
    const sinLibro = t ? (t.zonas || []).filter(z => !z.conLibro && !z.interzonal).map(z => z.label) : [];
    return `
      <section class="mb-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[10px] uppercase tracking-widest font-display text-accent">Mercado de fichajes · servicio por invitación</p>
            <h2 class="font-display uppercase tracking-wide text-xl text-ink">${esc(t ? t.nombre : 'Fichajes')}</h2>
            <p class="flex flex-wrap items-center gap-2 mt-0.5">${zonas}</p>
            ${sinLibro.length ? `<p class="text-[11px] text-muted mt-0.5">Sin libro todavía: ${esc(sinLibro.join(', '))}.</p>` : ''}
          </div>
          ${ST.admin ? `<button type="button" onclick="SGADD_FICHAJES.irA('${ST.vista === 'padron' ? 'buscar' : 'padron'}')"
            class="text-[11px] uppercase tracking-wider font-display px-3 py-1.5 rounded border border-hairline text-muted hover:text-ink hover:bg-surface2
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            ${ST.vista === 'padron' ? '← Volver a la búsqueda' : 'Accesos a Fichajes'}</button>` : ''}
        </div>
        ${ST.torneos.length > 1 ? `<div class="flex flex-wrap gap-1.5 mt-3" role="group" aria-label="Torneo">${chips}</div>` : ''}
      </section>`;
  }

  /* ---------------------------------------------------------------------
     BUSCAR
     --------------------------------------------------------------------- */

  /* Con `conteos`, cada chip dice cuántos del universo (ya pasado por las
     puertas) la tienen, y la que da 0 se deshabilita: es una combinación
     que no existe (Franquicia + Rotación). La elegida sigue habilitada,
     para poder sacarla. */
  function opcionesChips(campo, opciones, elegidos, conteos) {
    return opciones.map(o => {
      const on = elegidos.indexOf(o.id) !== -1;
      const n = conteos ? (conteos[o.id] || 0) : null;
      const vacia = n === 0 && !on;
      return `<button type="button" onclick="SGADD_FICHAJES.alternar('${escJs(campo)}', '${escJs(o.id)}')"
        aria-pressed="${on}" ${vacia ? 'disabled aria-disabled="true"' : ''}
        title="${esc(vacia ? 'Ningún jugador del torneo combina esto con lo ya elegido' : (o.titulo || o.label))}"
        class="text-[11px] px-2 py-1 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed
               focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
               ${on ? 'border-accent text-ink bg-surface2' : 'border-hairline text-muted hover:text-ink hover:bg-surface2'}">
        ${esc(o.label)}${n !== null ? ` <span class="font-mono text-[10px] text-muted">${n}</span>` : ''}</button>`;
    }).join('');
  }

  /** El encabezado de cada nivel: su número, si es puerta o cuánto suma. */
  function encabezadoNivel(n, titulo, peso) {
    return `<p class="text-[10px] uppercase tracking-widest font-display text-ink mb-1.5 flex flex-wrap items-baseline gap-x-2">
      <span class="text-accent">${esc(n)}</span><span>${esc(titulo)}</span>
      <span class="normal-case tracking-normal font-sans text-[10px] ${peso ? 'text-accent' : 'text-muted'}">${peso
        ? 'suma ' + Math.round(peso * 100) + ' %' : 'filtro duro'}</span></p>`;
  }

  function nivelFiltro(n, titulo, peso, contenido, nota) {
    return `<div class="mb-3">${encabezadoNivel(n, titulo, peso)}
      <div class="flex flex-wrap gap-1.5">${contenido}</div>
      ${nota ? `<p class="text-[10px] dato-sec mt-1">${esc(nota)}</p>` : ''}</div>`;
  }

  function grupoFiltro(titulo, contenido, nota) {
    return `<div class="mb-3">
      <p class="text-[10px] uppercase tracking-widest font-display text-muted mb-1.5">${esc(titulo)}</p>
      <div class="flex flex-wrap gap-1.5">${contenido}</div>
      ${nota ? `<p class="text-[10px] dato-sec mt-1">${esc(nota)}</p>` : ''}
    </div>`;
  }

  /* EL JUGADOR MODELO (punto 97): uno de cualquier zona del torneo. Si su
     zona dejó de estar cargada o el período lo sacó, el filtro se apaga y
     la pantalla lo dice. */
  function modeloActual() { return ST.crit.modelo ? filaPorId(ST.crit.modelo) : null; }

  function selectorModelo(todas) {
    const m = modeloActual();
    const porEquipo = {};
    todas.forEach(f => { (porEquipo[f.equipo] = porEquipo[f.equipo] || []).push(f); });
    const grupos = Object.keys(porEquipo).sort().map(e => `<optgroup label="${esc(e)}">${porEquipo[e]
      .slice().sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(f => `<option value="${esc(f.id)}" ${m && m.id === f.id ? 'selected' : ''}>${esc(f.nombre)}</option>`).join('')}</optgroup>`).join('');
    return `<div class="flex flex-wrap items-center gap-2">
        <select onchange="SGADD_FICHAJES.usarModelo(this.value)" aria-label="Jugador modelo"
          class="min-w-[16rem] rounded border border-hairline bg-surface2/40 px-2 py-1 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <option value="">Ninguno · buscar solo por criterios</option>${grupos}</select>
        ${m ? `<button type="button" onclick="SGADD_FICHAJES.usarModelo('')"
          class="text-[11px] text-muted hover:text-ink underline underline-offset-2">quitar el modelo</button>` : ''}
      </div>
      <p class="text-[10px] dato-sec mt-1 mb-1">${m
        ? `Buscando parecidos a <b class="text-ink">${esc(m.nombre)}</b> (${esc(m.equipo)}): función en cancha, perfiles técnicos y jerarquía,
           con minutos y uso comparables, más talla y puesto si los dos tienen ficha (15 %). Con otros criterios, el % es el promedio de los dos.`
        : (ST.crit.modelo ? '<span class="text-accent">El modelo elegido no está en las zonas o el período cargados: el filtro no se aplica.</span>'
          : 'Elegí un jugador y la búsqueda trae a los que más se le parecen. Los filtros duros siguen mandando.')}</p>`;
  }

  function usarModelo(id) {
    ST.crit.modelo = id || null;
    if (id) { ST.orden = 'coincidencia'; ST.dir = 'desc'; }
    ST.pagina = 1;
    if (ST.vista !== 'buscar') irA('buscar'); else pintar();
  }

  function campoRango(id, etiqueta, r, paso, unidad) {
    const v = r || {};
    return `<label class="flex items-center gap-1.5 text-[11px] text-muted">
      <span class="w-24 shrink-0">${esc(etiqueta)}</span>
      <input type="number" step="${paso}" value="${typeof v.min === 'number' ? v.min : ''}" placeholder="mín"
        onchange="SGADD_FICHAJES.fijarRango('${escJs(id)}', 'min', this.value)"
        class="w-20 rounded border border-hairline bg-surface2/40 px-2 py-1 text-ink text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <input type="number" step="${paso}" value="${typeof v.max === 'number' ? v.max : ''}" placeholder="máx"
        onchange="SGADD_FICHAJES.fijarRango('${escJs(id)}', 'max', this.value)"
        class="w-20 rounded border border-hairline bg-surface2/40 px-2 py-1 text-ink text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      ${unidad ? `<span>${esc(unidad)}</span>` : ''}</label>`;
  }

  /* Los porcentajes se escriben como los lee un entrenador —«55» y no
     «0,55»— y se convierten al guardar el criterio. */
  function esPorcentaje(k) { return /%$/.test(k); }

  function panelFiltros(todas) {
    const c = ST.crit;
    const t = torneoActual();
    const zonasOk = t ? zonasBuscables(t).map(z => ({ id: z.slug, label: z.label })) : [];
    const equipos = Array.from(new Set(todas.map(f => f.equipo))).sort().map(e => ({ id: e, label: e }));
    const roles = JUGADORES_ROLES_FUNCIONALES.map(r => ({ id: r.id, label: r.label }));
    const jer = JERARQUIA.map(r => ({ id: r.id, label: r.emoji + ' ' + r.label, titulo: r.descripcion }));
    const minutos = ROLES_MINUTOS.map(r => ({ id: r.id, label: r.label }));
    const arq = PERFILES_TECNICOS.map(p => ({ id: p.id, label: p.emoji + ' ' + p.label }));
    const conFicha = todas.filter(f => f.ficha).length;
    const conEdad = todas.filter(f => f.ficha && f.ficha.nacimiento).length;

    const P = M.PESOS_COINCIDENCIA;
    const pool = M.filtrar(todas, c, { soloPuertas: true }).filas;
    const cuenta = M.conteosFacetas(pool, c);

    const rangoMetrica = (k) => {
      const r = c.rangos[k] || {};
      const pct = esPorcentaje(k);
      const aVista = (v) => typeof v !== 'number' ? undefined : pct && !r.pc ? Math.round(v * 1000) / 10 : v;
      return `<div class="flex flex-wrap items-center gap-2">${campoRango('m:' + k, metrica(k).label + (metrica(k).invertida ? ' ↓' : ''),
        { min: aVista(r.min), max: aVista(r.max) }, pct ? 0.5 : 0.1, r.pc ? 'pctl' : pct ? '%' : '')}
        <label class="flex items-center gap-1 text-[10px] text-muted" title="Obligatorio: el que no lo cumple queda afuera en vez de restar puntos">
          <input type="checkbox" ${r.duro ? 'checked' : ''} onchange="SGADD_FICHAJES.fijarRangoDuro('${escJs(k)}', this.checked)"> obligatorio</label></div>`;
    };
    const activas = Object.keys(c.rangos);
    const disponibles = M.METRICAS_FILTRO.filter(x => activas.indexOf(x.id) === -1);

    /* Minutos y jerarquía están ANIDADOS: si lo elegido en los dos no se
       cruza en ningún jugador, se dice — no es un error del filtro. */
    const sinCruce = c.rolesMinutos.length && c.jerarquias.length
      && !pool.some(f => c.rolesMinutos.indexOf(f.rolMinutos) !== -1 && c.jerarquias.indexOf(f.jerarquia) !== -1);

    return `
      <details ${ST.filtrosAbiertos ? 'open' : ''} ontoggle="SGADD_FICHAJES.recordarFiltros(this.open)"
        class="card rounded-xl border border-hairline mb-4">
        <summary class="cursor-pointer select-none px-4 py-3 font-display uppercase tracking-wide text-sm text-ink
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl">
          Búsqueda avanzada</summary>
        <div class="px-4 pb-4 grid gap-x-6 lg:grid-cols-2">
          <p class="lg:col-span-2 text-[11px] dato-sec mb-3">De lo general a lo particular. Los <b>filtros duros</b> descartan;
            los demás <b>suman</b> al % de coincidencia, y se muestran los que llegan al ${Math.round(M.PISO_COINCIDENCIA * 100)} %:
            un jugador que cumple casi todo no se pierde por un detalle. El número de cada opción es cuántos jugadores la tienen.</p>
          <div class="lg:col-span-2 mb-3">
            ${encabezadoNivel('0', 'Jugador modelo', null)}
            ${selectorModelo(todas)}
          </div>
          <div class="lg:col-span-2 mb-1">
            ${encabezadoNivel('1', 'Zona y período', null)}
            ${bloquePeriodo()}
            <div class="flex flex-wrap items-center gap-3 mb-3">
              ${zonasOk.length > 1 ? `<div class="flex flex-wrap gap-1.5" role="group" aria-label="Zona">${opcionesChips('zonas', zonasOk, c.zonas)}</div>` : ''}
              ${equipos.length ? `<label class="flex items-center gap-2 text-[11px] text-muted">
                <span>Equipo</span>
                <select onchange="SGADD_FICHAJES.fijarEquipo(this.value)"
                  class="rounded border border-hairline bg-surface2/40 px-2 py-1 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <option value="">Todos</option>
                  ${equipos.map(e => `<option value="${esc(e.id)}" ${c.equipos[0] === e.id ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}
                </select></label>` : ''}
            </div>
          </div>
          <div class="lg:col-span-2 mb-3">
            ${encabezadoNivel('2', 'Muestra mínima', null)}
            <label class="flex items-center gap-2 text-[11px] text-muted">
              <input type="checkbox" ${c.soloCalificados ? 'checked' : ''} onchange="SGADD_FICHAJES.fijar('soloCalificados', this.checked)">
              Solo los que llegan al umbral de minutos de su zona (sin eso el percentil no se calcula)</label>
          </div>
          <div class="lg:col-span-2 mb-3">
            ${grupoFiltro('Edad y nacimiento · filtro duro', `<div class="flex flex-wrap gap-x-6 gap-y-1.5">
                ${campoRango('edad', 'Edad', c.edad, 1, 'años')}
                ${campoRango('nacimiento', 'Año de nacimiento', c.nacimiento, 1, '')}
              </div>`,
              conEdad + ' de ' + todas.length + ' jugadores tienen el nacimiento cargado (padrón de la liga o ficha manual). '
              + 'El que no lo tiene queda afuera si se pide.')}
          </div>
          <div>
            ${nivelFiltro('3', 'Rol por minutos', P.minutos, opcionesChips('rolesMinutos', minutos, c.rolesMinutos, cuenta.rolesMinutos),
              'La banda de al lado suma la mitad; a menos de 2 minutos del borde, tres cuartos.')}
            ${nivelFiltro('4', 'Jerarquía en su plantel', P.jerarquia, opcionesChips('jerarquias', jer, c.jerarquias, cuenta.jerarquias),
              'Depende de su plantel, no de él: por eso pesa poco.')}
            ${sinCruce ? `<p class="text-[11px] text-accent -mt-2 mb-3" role="status">Esa combinación de minutos y jerarquía no existe en el torneo
              (todo Franquicia es Clave; todo Pocos Minutos es Especialista). Cada uno suma por su lado.</p>` : ''}
            ${nivelFiltro('5', 'Función en cancha', P.funcion, opcionesChips('roles', roles, c.roles, cuenta.roles),
              'Suma entero el mismo rol; ' + (c.incluirSecundarios ? '60 % si es su faceta secundaria; ' : '') + '50 % el mismo eje; 25 % el mismo lado.')}
            <label class="flex items-center gap-2 text-[11px] text-muted -mt-2 mb-3">
              <input type="checkbox" ${c.incluirSecundarios ? 'checked' : ''} onchange="SGADD_FICHAJES.fijar('incluirSecundarios', this.checked)">
              Contar también las facetas secundarias</label>
            ${grupoFiltro('Juega · filtro duro', opcionesChips('origen', [{ id: 'interior', label: 'Adentro' }, { id: 'perimetral', label: 'Afuera' }],
              c.origen ? [c.origen] : []), 'Sale de cómo tira y cuánto rebotea, no de una posición declarada.')}
          </div>
          <div>
            ${nivelFiltro('6', 'Perfiles técnicos', P.perfiles, opcionesChips('arquetipos', arq, c.arquetipos, cuenta.arquetipos),
              'Cuenta la parte de los pedidos que tiene. Al que le falta uno se le reconoce qué tan cerca quedó del corte (hasta 90 %).')}
            ${encabezadoNivel('7', 'Rangos de métricas', P.rangos)}
            <div class="grid gap-1.5 mb-2">${activas.map(rangoMetrica).join('')}</div>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <select id="fxNuevaMetrica" aria-label="Métrica para filtrar"
                class="rounded border border-hairline bg-surface2/40 px-2 py-1 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                ${disponibles.map(x => `<option value="${esc(x.id)}">${esc(x.grupo + ' · ' + metrica(x.id).label)}</option>`).join('')}
              </select>
              <button type="button" onclick="SGADD_FICHAJES.agregarRango(false)"
                class="text-[11px] px-2 py-1 rounded border border-hairline text-muted hover:text-ink hover:bg-surface2">+ por valor</button>
              <button type="button" onclick="SGADD_FICHAJES.agregarRango(true)"
                class="text-[11px] px-2 py-1 rounded border border-hairline text-muted hover:text-ink hover:bg-surface2">+ por percentil</button>
              ${activas.length ? `<button type="button" onclick="SGADD_FICHAJES.limpiarRangos()"
                class="text-[11px] text-muted hover:text-ink underline underline-offset-2">quitar todos</button>` : ''}
            </div>
            <p class="text-[10px] dato-sec mb-3">Fuera del rango resta según la distancia en percentiles (a 25 puntos ya no suma). Marcalo obligatorio para que descarte.</p>
            <details class="mb-3">
              <summary class="cursor-pointer text-[10px] uppercase tracking-widest font-display text-muted">Ficha manual · filtro duro</summary>
              <div class="mt-2">
              ${grupoFiltro('Puesto',
                opcionesChips('posiciones', M.PUESTOS.map(p => ({ id: String(p.n), label: p.n + ' · ' + p.label })), c.posiciones),
                conFicha + ' de ' + todas.length + ' jugadores tienen ficha cargada. Un filtro de ficha deja afuera a los que no la tienen.')}
              <label class="flex items-center gap-2 text-[11px] text-muted -mt-2 mb-3">
                <input type="checkbox" ${c.puestosSecundarios ? 'checked' : ''} onchange="SGADD_FICHAJES.fijar('puestosSecundarios', this.checked)">
                Contar los puestos híbridos por su faceta secundaria (un 2-3 entra como 2 y como 3)</label>
              <div class="grid gap-1.5">
                ${campoRango('talla', 'Talla', c.talla, 1, 'cm')}
              </div></div>
            </details>
          </div>
          <div class="lg:col-span-2 flex justify-end">
            <button type="button" onclick="SGADD_FICHAJES.limpiarTodo()"
              class="text-[11px] text-muted hover:text-ink underline underline-offset-2">Limpiar la búsqueda</button>
          </div>
        </div>
      </details>`;
  }

  const ORDENES = [
    { id: 'coincidencia', label: '% de coincidencia' },
    { id: 'PTS', label: 'Puntos' }, { id: 'MIN', label: 'Minutos' }, { id: 'TS%', label: 'TS%' },
    { id: 'USG%', label: 'Uso' }, { id: 'AST-PP', label: 'AST-PP' }, { id: 'PPP', label: 'PPP' },
    { id: 'RO%', label: 'Rebote of.' }, { id: 'PR', label: 'Recuperos' },
    { id: 'TCI', label: 'Tiros de campo int.' }, { id: 'T3I', label: 'Triples int.' },
    { id: 'tot:T3I', label: 'Triples int. (total)' }, { id: 'T1I', label: 'Libres int.' },
    { id: 'edad', label: 'Edad' }, { id: 'talla', label: 'Talla' }, { id: 'nombre', label: 'Nombre' },
  ];

  function vistaBuscar() {
    const todas = filasDelTorneo();
    const t = torneoActual();
    const cargando = t && zonasBuscables(t).some(z => {
      const zz = ST.zonas[t.id + '/' + z.slug];
      return !zz || zz.estado === 'cargando';
    });
    /* PUERTAS + % DE COINCIDENCIA (punto 91): el motor descarta solo con
       los filtros duros y puntúa el resto; quedan los que llegan al piso. */
    const base = M.evaluar(todas, ST.crit, ctxCoincidencia());
    /* EL JUGADOR MODELO (punto 97) re-puntúa sobre las mismas puertas: el %
       pasa a ser el parecido al modelo (promediado con el de los criterios,
       si los hay). Ver `SGADD_MERCADO.conModelo`. */
    const modelo = modeloActual();
    const res = modelo && typeof jugadoresSimilitud === 'function'
      ? Object.assign({}, base, M.conModelo(base, modelo, jugadoresSimilitud), { puntua: true })
      : base;
    /* «% de coincidencia» ordena por puntaje y, al empate, por confianza.
       Sin nada puntuable cae a Puntos. En una MÉTRICA el orden por defecto
       es «mejor primero», y en una invertida (pérdidas) lo mejor es lo más
       bajo. Nombre, edad y talla no son mejores ni peores. */
    const porCoinc = ST.orden === 'coincidencia';
    const por = porCoinc && !res.puntua ? 'PTS' : ST.orden;
    const esMetrica = ['nombre', 'edad', 'talla', 'coincidencia'].indexOf(por) === -1;
    const inv = esMetrica && metrica(por).invertida;
    let ordenadas;
    if (porCoinc && res.puntua) ordenadas = ST.dir === 'asc' ? res.items.slice().reverse() : res.items;
    else {
      const mapa = new Map(res.items.map(x => [x.fila, x]));
      ordenadas = M.ordenar(res.items.map(x => x.fila), por, inv ? (ST.dir === 'desc' ? 'asc' : 'desc') : ST.dir).map(f => mapa.get(f));
    }
    const visibles = ordenadas.slice(0, ST.pagina * POR_PAGINA);

    const buscador = `
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <label for="fxTexto" class="sr-only">Buscar por nombre o equipo</label>
        <input id="fxTexto" type="search" autocomplete="off" placeholder="Apellido o equipo…"
          value="${esc(ST.crit.texto)}" oninput="SGADD_FICHAJES.buscarTexto(this.value)"
          class="flex-1 min-w-[12rem] rounded-lg border border-hairline bg-surface2/40 px-3 py-2 text-sm text-ink
                 placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <label class="flex items-center gap-1.5 text-[11px] text-muted">Ordenar por
          <select onchange="SGADD_FICHAJES.ordenarPor(this.value)"
            class="rounded border border-hairline bg-surface2/40 px-2 py-1.5 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            ${ORDENES.map(o => `<option value="${esc(o.id)}" ${o.id === ST.orden ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select></label>
        <button type="button" onclick="SGADD_FICHAJES.invertirOrden()" aria-label="Invertir el orden"
          class="text-xs px-2 py-1.5 rounded border border-hairline text-muted hover:text-ink hover:bg-surface2">
          ${porCoinc && res.puntua ? (ST.dir === 'desc' ? '▼ más coincidencia primero' : '▲ menos coincidencia primero')
            : esMetrica ? (ST.dir === 'desc' ? '▼ mejor primero' : '▲ peor primero')
            : (ST.dir === 'asc' ? '▲ ascendente' : '▼ descendente')}</button>
      </div>`;

    const resumen = `<p id="fxResumen" class="text-[11px] text-muted mb-3" aria-live="polite">
      ${cargando ? 'Bajando los libros del torneo… ' : ''}${res.items.length} de ${todas.length} jugadores
      ${res.puntua ? ` · ${res.bajoPiso} por debajo del ${Math.round(M.PISO_COINCIDENCIA * 100)} % de coincidencia` : ''}
      ${res.sinDato ? ` · <span class="text-accent">${res.sinDato} quedaron afuera por no tener el dato pedido</span>` : ''}
      ${modelo && res.sinVolumen ? ` · ${res.sinVolumen} sin minutos ni uso comparables con el modelo` : ''}
      ${res.puntua && porCoinc ? ' · por % de coincidencia y, al empate, por confianza' : ''}</p>`;

    const grilla = visibles.length
      ? `<ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">${visibles.map(x => tarjeta(x.fila, x)).join('')}</ul>`
      : `<div class="card rounded-xl p-6 border border-hairline text-center text-sm text-muted">
          ${cargando ? 'Cargando…' : res.puntua
            ? 'Nadie llega al ' + Math.round(M.PISO_COINCIDENCIA * 100) + ' % de coincidencia. Probá aflojar un criterio.'
            : 'Nadie pasa los filtros duros. Probá aflojar uno.'}</div>`;
    const mas = ordenadas.length > visibles.length
      ? `<div class="text-center mt-4"><button type="button" onclick="SGADD_FICHAJES.verMas()"
          class="text-xs px-4 py-2 rounded border border-hairline text-muted hover:text-ink hover:bg-surface2">
          Ver ${Math.min(POR_PAGINA, ordenadas.length - visibles.length)} más (${ordenadas.length - visibles.length} restantes)</button></div>` : '';

    /* El badge va FUERA del panel plegable: con los filtros cerrados, el
       que mira los resultados igual tiene que saber que es una muestra
       parcial. */
    return panelFiltros(todas) + badgePeriodo() + buscador + resumen + `<div id="fxResultados">${grilla}${mas}</div>`;
  }

  /* El % y la confianza, arriba de la card. El % lleva su desglose en el
     `title`, y lo que no cumple va escrito: el número solo no se audita. */
  function lineaCoincidencia(item, f) {
    const conf = (item && item.conf) || M.confianza(f);
    const c = item && item.coinc;
    const tonoConf = conf.id === 'alta' ? 'border-green-500/50 text-green-400' : conf.id === 'media' ? 'border-hairline text-ink' : 'border-hairline text-muted';
    const chipConf = `<span class="text-[10px] px-1.5 py-0.5 rounded border ${tonoConf}" title="${esc('Confianza en la muestra: ' + conf.motivo)}">Confianza ${esc(conf.label.toLowerCase())}</span>`;
    if (!c || typeof c.pct !== 'number') return `<div class="flex items-center justify-end">${chipConf}</div>`;
    const pct = Math.round(c.pct * 100);
    const desglose = c.partes.map(x => x.label + ' ' + Math.round(x.puntaje * 100) + ' % (pesa ' + Math.round(x.peso * 100) + ')').join(' · ');
    return `<div class="flex items-center gap-2">
        <span class="font-display text-lg leading-none ${pct >= 85 ? 'text-green-400' : 'text-accent'}" title="${esc(desglose)}">${pct} %</span>
        <span class="text-[10px] text-muted">${esc((item && item.rotulo) || 'de coincidencia')}</span>
        <span class="ml-auto">${chipConf}</span></div>
      ${c.faltan.length ? `<p class="text-[10px] text-muted leading-snug" title="${esc(c.faltan.join(' · '))}">No cumple · ${esc(c.faltan.slice(0, 2).join(' · '))}${c.faltan.length > 2 ? ' …' : ''}</p>` : ''}`;
  }

  function tarjeta(f, item) {
    const adn = f._adn;
    const enComp = ST.comparar.indexOf(f.id) !== -1;
    const kpis = ['PTS', 'MIN', 'TS%', 'USG%'].map(k => `
      <div class="min-w-0">
        <p class="text-[9px] uppercase tracking-wider text-muted font-display">${esc(k)}</p>
        <p class="font-display text-lg leading-none text-ink">${esc(fmt(k, f.m[k]))}</p>
        <p class="text-[10px] font-mono ${tonoPc(f.pc[k])}">${pcTexto(f.pc[k])}</p>
      </div>`).join('');
    /* El rol funcional ya va como titular de la card: repetirlo como chip
       es ruido. */
    const badges = jugadoresBadges(adn).filter(b => b.tipo !== 'rol').slice(0, 4).map(b => `
      <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface2 ${b.sinRespaldo ? 'text-muted' : 'text-ink'}"
        ${b.motivo ? `title="${esc(b.motivo)}"` : ''}>${esc(b.texto)}</span>`).join('');
    return `
      <li class="card rounded-xl border ${enComp ? 'border-accent/60' : 'border-hairline'} p-3 flex flex-col gap-2">
        <div class="flex items-start gap-2.5">
          ${escudo(f.equipoCrudo, 'w-9 h-9')}
          <div class="min-w-0 flex-1">
            <p class="text-sm text-ink font-medium leading-tight truncate">${esc(f.nombre)}</p>
            <p class="text-[11px] text-muted truncate">${esc(f.equipo)} · ${esc(f.zonaLabel)}</p>
            <p class="text-[11px] ${f.ficha ? 'dato-sec' : 'text-muted/70'} truncate">${esc(fichaTexto(f.ficha))}</p>
          </div>
          <div class="w-16 h-16 shrink-0 -mt-1">${radarSvg([{ ejes: M.ejesRadar(f.pc), color: COLORES[0] }], { tam: 120, margen: 8, relleno: 0.3, titulo: 'Radar de ' + f.nombre }).replace(/<text[\s\S]*?<\/text>/g, '')}</div>
        </div>
        ${lineaCoincidencia(item, f)}
        <p class="text-[11px] text-accent leading-snug">${esc(adn.rolFuncional ? adn.rolFuncional.label : '—')}</p>
        <div class="flex flex-wrap gap-1">${badges}</div>
        <div class="grid grid-cols-4 gap-2">${kpis}</div>
        ${lineaVolumen(f)}
        <div class="flex items-center gap-2 mt-auto pt-1">
          <button type="button" onclick="SGADD_FICHAJES.abrir('${escJs(f.id)}')"
            class="flex-1 text-[11px] font-semibold px-2.5 py-2 rounded-md border border-accent/50 text-accent hover:bg-accent/10
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">Radiografía ADN →</button>
          <button type="button" onclick="SGADD_FICHAJES.alternarComparar('${escJs(f.id)}')" aria-pressed="${enComp}"
            class="text-[11px] px-2.5 py-2 rounded-md border ${enComp ? 'border-accent text-ink bg-surface2' : 'border-hairline text-muted hover:text-ink hover:bg-surface2'}
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            ${enComp ? '✓ Comparando' : '+ Comparar'}</button>
        </div>
      </li>`;
  }

  /* EL VOLUMEN AL LADO DEL ACIERTO, en la card: «TC - T2 4,1/8,0 · 51%».
     El tiro de campo se rotula con su familia de MÁS intentos
     (`tiroPredominante`, sin los libres): «TC» a secas mezclaba dobles y
     triples y no decía de dónde tira. Después va la otra familia de campo
     y los libres. Un porcentaje sin su volumen promete lo que la muestra
     no sostiene. */
  function lineaVolumen(f) {
    const pred = M.tiroPredominante(f.vol);
    const orden = pred ? [pred, pred === 'T2' ? 'T3' : 'T2', 'T1'] : ['T3', 'T1'];
    const partes = orden.map(id => {
      const v = M.VOLUMEN_TIRO.filter(x => x.id === id)[0];
      const t = v && volumen(f, v.id, false);
      if (!t) return '';
      const rotulo = id === pred ? 'TC - ' + id : (id === 'T1' ? 'TL' : id);
      return `<span class="whitespace-nowrap"><span class="${id === pred ? 'text-accent' : 'text-muted'}"${id === pred ? ' title="Su tiro de campo con más intentos"' : ''}>${esc(rotulo)}</span>
        <span class="font-mono text-ink">${esc(t)}</span>
        <span class="font-mono ${tonoPc(f.pc[v.pct])}">${esc(fmt(v.pct, f._j[v.pct]))}</span></span>`;
    }).filter(Boolean);
    if (!partes.length) return '';
    return `<p class="text-[10px] leading-snug flex flex-wrap gap-x-3 gap-y-0.5" title="Convertidos/intentados por partido y acierto">
      ${partes.join('')}</p>`;
  }

  function barraComparar() {
    if (!ST.comparar.length || ST.vista === 'comparar' || ST.vista === 'padron') return '';
    const nombres = ST.comparar.map(id => { const f = filaPorId(id); return f ? f.nombre : ''; }).filter(Boolean);
    return `
      <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 card rounded-xl border border-accent/50 shadow-2xl
                  px-4 py-2.5 flex items-center gap-3 max-w-[calc(100vw-2rem)]">
        <span class="text-[11px] text-muted truncate">${esc(nombres.join(' · '))}</span>
        <button type="button" onclick="SGADD_FICHAJES.irA('comparar')" ${ST.comparar.length < 2 ? 'disabled' : ''}
          class="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-md border border-accent text-accent hover:bg-accent/10
                 disabled:opacity-40 disabled:cursor-not-allowed">Comparar (${ST.comparar.length})</button>
        <button type="button" onclick="SGADD_FICHAJES.vaciarComparar()" aria-label="Vaciar la comparación"
          class="shrink-0 text-muted hover:text-ink text-sm">✕</button>
      </div>`;
  }

  /* ---------------------------------------------------------------------
     LA RADIOGRAFÍA ADN
     --------------------------------------------------------------------- */

  /* El acierto lleva su volumen al lado: «36,0% · 1,8/5,0». Lo usan la
     Radiografía y Comparar. */
  const VOL_DE = { 'T3%': 'T3', 'T1%': 'T1', 'TC%': 'TC' };
  function volumenDeAcierto(f, k) {
    const t = VOL_DE[k] && volumen(f, VOL_DE[k], false);
    return t ? `<span class="block text-[10px] text-muted" title="Convertidos/intentados por partido">${esc(t)}</span>` : '';
  }

  /** Las métricas de la tabla de percentiles, agrupadas como el filtro. */
  function tablaPercentiles(f) {
    /* Los TOTALES no van: no tienen percentil y ya están, con sus
       convertidos, en el bloque de volumen. El orden de los grupos es el
       del motor (`GRUPOS_METRICAS`), el mismo que usa Comparar. */
    return M.metricasPorGrupo(false).map(({ grupo: g, ids }) => `
      <div class="fx-grupo">
        <p class="text-[10px] uppercase tracking-widest font-display text-muted mb-1">${esc(g)}</p>
        <table class="w-full text-xs fx-tabla">
          <tbody>${ids.map(k => {
            const r = f._idx.leerJugador(f._j, k);
            return `<tr class="border-b border-hairline/40 last:border-0">
              <td class="py-1 pr-2">${esc(metrica(k).label)}${metrica(k).invertida ? ' <span class="text-muted" title="menos es mejor">↓</span>' : ''}</td>
              <td class="py-1 pr-2 font-mono text-ink text-right">${esc(fmt(k, f.m[k]))}${volumenDeAcierto(f, k)}</td>
              <td class="py-1 pr-2 font-mono text-muted text-right" title="Fila JUGADOR TIPO de su zona">${esc(r ? r.tipoFormateado : '—')}</td>
              <td class="py-1 w-24">${barraPc(f.pc[k])}</td>
              <td class="py-1 pl-1 font-mono text-right ${tonoPc(f.pc[k])}">${pcTexto(f.pc[k])}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`).join('');
  }

  function bloqueTendencia(f) {
    const td = tendencia(f);
    if (!td) return `<p class="text-[11px] text-muted">Hacen falta al menos seis partidos jugados para leer una tendencia.</p>`;
    const filas = td.filas.map(x => `
      <tr class="border-b border-hairline/40 last:border-0">
        <td class="py-1 pr-2">${esc(metrica(x.clave).label)}</td>
        <td class="py-1 pr-2 font-mono text-right">${esc(fmt(x.clave, x.temporada))}</td>
        <td class="py-1 pr-2 font-mono text-right text-ink">${esc(fmt(x.clave, x.ultimos))}</td>
        <td class="py-1 text-right ${x.lectura === 'en alza' ? 'text-green-400' : x.lectura === 'en baja' ? 'text-red-400' : 'text-muted'}">
          ${x.lectura === 'en alza' ? '▲' : x.lectura === 'en baja' ? '▼' : '='} ${esc(x.lectura)}</td>
      </tr>`).join('');
    const cond = condicion(f);
    return `
      <table class="w-full text-xs fx-tabla mb-3">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="text-left font-display pb-1">Métrica</th><th class="text-right font-display pb-1">${periodoActivo(ST.periodo) ? 'Período' : 'Tramo'}</th>
          <th class="text-right font-display pb-1">Últimos 5</th><th class="text-right font-display pb-1">Lectura</th></tr></thead>
        <tbody>${filas}</tbody></table>
      <div class="grid grid-cols-2 gap-3">
        <div class="fx-spark-box text-accent"><p class="text-[10px] uppercase tracking-wider text-muted font-display">Puntos por partido</p>
          ${sparkSvg(td.partidos.map(p => p['PTS']), { titulo: 'Puntos partido a partido' })}</div>
        <div class="fx-spark-box text-blue-400"><p class="text-[10px] uppercase tracking-wider text-muted font-display">Minutos por partido</p>
          ${sparkSvg(td.partidos.map(p => p['MIN']), { titulo: 'Minutos partido a partido' })}</div>
      </div>
      ${cond ? `<p class="text-[11px] dato-sec mt-2">Local: ${esc(fmt('PTS', cond.local.pts))} PTS en ${esc(fmt('MIN', cond.local.min))} MIN (${cond.local.pj} PJ)
        · Visitante: ${esc(fmt('PTS', cond.visitante.pts))} PTS en ${esc(fmt('MIN', cond.visitante.min))} MIN (${cond.visitante.pj} PJ).</p>` : ''}`;
  }

  function bloqueTiro(f) {
    const j = f._j;
    /* El reparto es de JUGADAS (T2I / PLAYS, etc.), y la pérdida va como
       cuarto tramo: sin ella la barra no cierra y parecería que falta algo. */
    const partes = [['PT2%', 'Doble', 'PPT2', 'T2%'], ['PT3%', 'Triple', 'PPT3', 'T3%'], ['PT1%', 'Libres', 'PPT1', 'T1%']];
    if (!partes.every(p => typeof j[p[0]] === 'number')) return `<p class="text-[11px] text-muted">Sin tiros suficientes para repartir sus jugadas.</p>`;
    const perdida = typeof j['PePP%'] === 'number' ? j['PePP%'] : null;
    const tramos = partes.map((p, i) => ({ label: p[1], v: j[p[0]], clase: 'fx-tiro-' + i }))
      .concat(perdida !== null ? [{ label: 'Pérdida', v: perdida, clase: 'fx-tiro-3' }] : []);
    const barra = tramos.map(x => `<span class="fx-tiro ${x.clase}" style="width:${Math.max(0, x.v * 100)}%"
      title="${esc(x.label + ': ' + Math.round(x.v * 100) + ' de cada 100 jugadas')}"></span>`).join('');
    const filas = partes.map((p, i) => `
      <tr class="border-b border-hairline/40 last:border-0">
        <td class="py-1 pr-2 whitespace-nowrap"><span class="fx-punto fx-tiro-${i}"></span> ${esc(p[1])}</td>
        <td class="py-1 pr-2 font-mono text-right">${Math.round(j[p[0]] * 100)} %</td>
        <td class="py-1 pr-2 font-mono text-right">${esc(fmt(p[3], j[p[3]]))}</td>
        <td class="py-1 font-mono text-right text-ink">${esc(fmt(p[2], j[p[2]]))}</td>
      </tr>`).join('') + (perdida !== null ? `
      <tr><td class="py-1 pr-2 whitespace-nowrap"><span class="fx-punto fx-tiro-3"></span> Pérdida</td>
        <td class="py-1 pr-2 font-mono text-right">${Math.round(perdida * 100)} %</td><td></td><td></td></tr>` : '');
    return `<div class="fx-tiro-barra" role="img" aria-label="Cómo terminan sus jugadas">${barra}</div>
      <table class="w-full text-xs fx-tabla mt-2">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="text-left font-display pb-1">Termina en</th><th class="text-right font-display pb-1">De sus jugadas</th>
          <th class="text-right font-display pb-1">Acierto</th><th class="text-right font-display pb-1">Pts por intento</th></tr></thead>
        <tbody>${filas}</tbody></table>`;
  }

  /* EL VOLUMEN DE TIRO · convertidos/intentados al lado del acierto, por
     partido y en el total del tramo. El total es el tamaño de la muestra:
     «12/30» y «120/300» dan el mismo 40 % y no dicen lo mismo. */
  function bloqueVolumen(f) {
    const filas = M.VOLUMEN_TIRO.map(v => {
      const pp = volumen(f, v.id, false), tot = volumen(f, v.id, true);
      if (!pp && !tot) return '';
      return `<tr class="border-b border-hairline/40 last:border-0">
        <td class="py-1 pr-2">${esc(v.label)}</td>
        <td class="py-1 pr-2 font-mono text-right text-ink">${esc(pp || '—')}</td>
        <td class="py-1 pr-2 font-mono text-right">${esc(fmt(v.pct, f._j[v.pct]))}</td>
        <td class="py-1 font-mono text-right text-muted">${esc(tot || '—')}</td>
      </tr>`;
    }).join('');
    if (!filas) return `<p class="text-[11px] text-muted">Sin tiros registrados.</p>`;
    const sinTotal = !f.volTot || M.COLUMNAS_VOLUMEN.every(k => f.volTot[k] === null);
    return `<table class="w-full text-xs fx-tabla">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="text-left font-display pb-1">Tiro</th><th class="text-right font-display pb-1">Conv./Int. por partido</th>
          <th class="text-right font-display pb-1">Acierto</th><th class="text-right font-display pb-1">${periodoActivo(ST.periodo) ? 'Total del período' : 'Total del tramo'}</th></tr></thead>
        <tbody>${filas}</tbody></table>
      ${sinTotal ? '<p class="text-[10px] dato-sec mt-1">La planilla de esta zona no trae los totales acumulados (ACUMULADO J).</p>' : ''}`;
  }

  function bloqueSimilares(f) {
    const lista = similares(f, 5);
    if (!lista.length) return `<p class="text-[11px] text-muted">Nadie del torneo con volumen comparable y etiquetas parecidas.</p>`;
    return `<ul class="grid gap-1.5">${lista.map(x => `
      <li class="flex items-center gap-2 text-xs">
        ${escudo(x.fila.equipoCrudo, 'w-6 h-6')}
        <button type="button" onclick="SGADD_FICHAJES.abrir('${escJs(x.fila.id)}')"
          class="min-w-0 flex-1 text-left hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
          <span class="text-ink">${esc(x.fila.nombre)}</span>
          <span class="text-muted"> · ${esc(x.fila.equipo)} · ${esc(x.fila.zonaLabel)}</span></button>
        <span class="font-mono ${x.sim.afin ? 'text-green-400' : 'text-muted'}" title="Función ${Math.round(x.sim.funcion * 100)} % · perfiles ${Math.round(x.sim.perfiles * 100)} % · jerarquía ${Math.round(x.sim.adn * 100)} %">${x.sim.porcentaje} %</span>
      </li>`).join('')}</ul>
      <p class="text-[10px] dato-sec mt-1.5">Similitud del punto 58: función en cancha 50 %, perfiles técnicos 30 %, jerarquía 20 %, con volumen comparable.</p>`;
  }

  function formFicha(f) {
    const fi = f.ficha || {};
    /* La escala de nueve en un solo selector: el híbrido ya trae su faceta
       secundaria, así que el segundo selector de antes sobra. */
    const opts = (sel) => `<option value="">—</option>` + M.POSICIONES.map(p =>
      `<option value="${esc(p.id)}" ${sel === p.id ? 'selected' : ''}>${esc(p.id + ' · ' + p.label)}</option>`).join('');
    const clase = 'rounded border border-hairline bg-surface2/40 px-2 py-1 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
    return `
      <form onsubmit="event.preventDefault(); SGADD_FICHAJES.guardarFicha('${escJs(f.id)}', this)"
        class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 p-3 rounded-lg border border-accent/40 bg-surface2/30">
        <label class="text-[10px] uppercase tracking-wider text-muted font-display flex flex-col gap-1">Nacimiento
          <input name="nacimiento" value="${esc(fi.nacimiento || '')}" placeholder="AAAA o AAAA-MM-DD" class="${clase}"></label>
        <label class="col-span-2 sm:col-span-2 text-[10px] uppercase tracking-wider text-muted font-display flex flex-col gap-1">Puesto
          <select name="posicion" class="${clase}">${opts(fi.posicion)}</select></label>
        <label class="text-[10px] uppercase tracking-wider text-muted font-display flex flex-col gap-1">Talla (cm)
          <input name="talla" type="number" min="${M.TALLA_MIN}" max="${M.TALLA_MAX}" value="${fi.talla || ''}" class="${clase}"></label>
        <div class="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-2">
          <button type="submit" class="whitespace-nowrap text-[11px] font-semibold px-3 py-1.5 rounded-md border border-accent text-accent hover:bg-accent/10">Guardar ficha</button>
          <button type="button" onclick="SGADD_FICHAJES.editarFicha(false)" class="text-[11px] text-muted hover:text-ink">Cancelar</button>
          <span class="text-[10px] dato-sec">Dato declarado a mano: se muestra tal cual y nunca se estima.</span>
        </div>
      </form>`;
  }

  function vistaRadiografia() {
    const f = filaPorId(ST.abierto);
    if (!f) {
      return `<div class="card rounded-xl p-6 border border-hairline text-center text-sm text-muted">
        Ese jugador no está en las zonas cargadas. <button type="button" onclick="SGADD_FICHAJES.irA('buscar')" class="underline">Volver</button></div>`;
    }
    const adn = f._adn;
    const zona = zonaDeFila(f);
    const badges = jugadoresBadges(adn).filter(b => b.tipo !== 'rol').map(b => `
      <span class="text-[11px] px-2 py-0.5 rounded bg-surface2 ${b.sinRespaldo ? 'text-muted' : 'text-ink'}"
        ${b.motivo ? `title="${esc(b.motivo)}"` : ''}>${esc(b.texto)}</span>`).join('');
    const kpis = ['PTS', 'MIN', 'TS%', 'USG%', 'AST-PP', 'PLAYS'].map(k => SGADD_UI.statCard(jugadoresLeer(f._idx, f._j, k))).join('');
    const enComp = ST.comparar.indexOf(f.id) !== -1;
    const items = lectura(f).map(x => `
      <li class="fx-lectura"><p class="text-[10px] uppercase tracking-widest font-display text-accent">${esc(x.t)}</p>
        <p class="text-xs text-ink leading-snug">${esc(x.x)}</p></li>`).join('');

    return `
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onclick="SGADD_FICHAJES.irA('buscar')"
          class="text-[11px] px-3 py-1.5 rounded border border-hairline text-muted hover:text-ink hover:bg-surface2">← Resultados</button>
        <button type="button" onclick="SGADD_FICHAJES.alternarComparar('${escJs(f.id)}')" aria-pressed="${enComp}"
          class="text-[11px] px-3 py-1.5 rounded border ${enComp ? 'border-accent text-ink bg-surface2' : 'border-hairline text-muted hover:text-ink hover:bg-surface2'}">
          ${enComp ? '✓ En la comparación' : '+ Comparar'}</button>
        <button type="button" onclick="SGADD_FICHAJES.buscarParecidos('${escJs(f.id)}')"
          class="text-[11px] px-3 py-1.5 rounded border border-accent/50 text-accent hover:bg-accent/10
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">🔎 Buscar parecidos en todo el torneo</button>
        <button type="button" onclick="SGADD_FICHAJES.usarModelo('${escJs(f.id)}')"
          title="Lo fija como jugador modelo de la búsqueda: se suma a tus filtros"
          class="text-[11px] px-3 py-1.5 rounded border border-hairline text-muted hover:text-ink hover:bg-surface2
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">🎯 Usar como modelo</button>
        <button type="button" onclick="SGADD_FICHAJES.exportar('${escJs(f.id)}')"
          class="ml-auto text-[11px] font-semibold px-3 py-1.5 rounded-md border border-accent text-accent hover:bg-accent/10
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">⬇ Descargar ficha de fichaje (PDF)</button>
      </div>
      ${badgePeriodo()}

      <section class="card rounded-xl border border-hairline p-4 sm:p-5 mb-4">
        <div class="grid gap-5 lg:grid-cols-[1fr_auto] items-start">
          <div class="min-w-0">
            <div class="flex items-start gap-3">
              ${escudo(f.equipoCrudo, 'w-14 h-14')}
              <div class="min-w-0">
                <p class="text-[10px] uppercase tracking-widest font-display text-accent">Radiografía ADN</p>
                <h2 class="font-display uppercase tracking-wide text-2xl text-ink leading-tight">${esc(f.nombre)}</h2>
                <p class="text-xs text-muted">${esc(f.equipo)} · ${esc(f.zonaLabel)} · ${esc((torneoActual() || {}).nombre || '')}</p>
                <p class="text-xs ${f.ficha ? 'text-ink' : 'text-muted'} mt-0.5">${esc(fichaTexto(f.ficha))}
                  ${ST.admin ? `<button type="button" onclick="SGADD_FICHAJES.editarFicha(${!ST.editandoFicha})"
                    class="ml-2 text-[11px] text-accent hover:underline">${f.ficha ? 'Editar ficha' : 'Cargar ficha'}</button>` : ''}
                  ${zona && !zona.fichasLeidas ? '<span class="text-[10px] text-red-400 ml-1">(no se pudieron leer las fichas)</span>' : ''}</p>
              </div>
            </div>
            ${ST.admin && ST.editandoFicha ? formFicha(f) : ''}
            <p class="text-sm text-accent mt-3">${esc(adn.rolFuncional ? adn.rolFuncional.label : '')}
              <span class="text-muted text-xs">· ${esc(adn.rolMinutos ? adn.rolMinutos.label : '')}</span></p>
            <div class="flex flex-wrap gap-1.5 mt-1.5">${badges}</div>
            <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 mt-4">${kpis}</div>
          </div>
          <div class="w-full max-w-[300px] mx-auto">${radarSvg([{ ejes: M.ejesRadar(f.pc), color: COLORES[0] }], { tam: 300 })}
            <p class="text-[10px] dato-sec text-center -mt-1">Percentil promedio de cada eje contra su zona${f.califica ? '' : ' · sin muestra suficiente, ejes vacíos'}.</p></div>
        </div>
      </section>

      <section class="card rounded-xl border border-hairline p-4 sm:p-5 mb-4">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Lo que vas a ver en cancha</h3>
        <p class="text-[11px] dato-sec mb-3">Cada línea sale de sus números de ${esc(f.zonaLabel)}
          (${esc(resumenPeriodo().activo ? resumenPeriodo().etiqueta : 'tramo por defecto')} · ${esc(String(f._j['PJ'] || 0))} PJ).</p>
        <ul class="grid gap-3 sm:grid-cols-2">${items}</ul>
      </section>

      <div class="grid gap-4 lg:grid-cols-2 mb-4">
        <section class="card rounded-xl border border-hairline p-4">
          <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-2">Contra su zona</h3>
          <div class="grid gap-3">${tablaPercentiles(f)}</div>
        </section>
        <div class="grid gap-4 content-start">
          <section class="card rounded-xl border border-hairline p-4">
            <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-2">Tendencia</h3>
            ${bloqueTendencia(f)}
          </section>
          <section class="card rounded-xl border border-hairline p-4">
            <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-2">Volumen de tiro</h3>
            ${bloqueVolumen(f)}
          </section>
          <section class="card rounded-xl border border-hairline p-4">
            <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-2">Cómo terminan sus jugadas</h3>
            ${bloqueTiro(f)}
          </section>
          <section class="card rounded-xl border border-hairline p-4">
            <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-2">Perfiles parecidos en el torneo</h3>
            ${bloqueSimilares(f)}
          </section>
        </div>
      </div>
      ${bloqueMapa(f)}`;
  }

  /* =====================================================================
     EL MAPA DE TIRO EN LA RADIOGRAFÍA (punto 97)

     El mismo mapa y el mismo diagnóstico que la pestaña Tiro de la ficha
     (`SGADD_PBP.jugador`), con el paquete de play-by-play del equipo de la
     zona. Lo trae `/api/v1/fichajes/:torneo/:zona/tiros`, que autoriza el
     padrón de fichajes y no el club: el que busca jugadores casi nunca es
     del club de la zona. Sin play-by-play para esa zona (los libros con
     Excel manual) la card lo dice y sigue.

     El paquete se pide una vez por equipo y queda en caché: la Radiografía
     de otro jugador del mismo equipo no vuelve a pedir nada.
     ===================================================================== */
  const MAPAS = new Map();   // 'torneo/zona/EQUIPO' -> Promise<paquete>

  function bloqueMapa(f) {
    if (typeof SGADD_PBP === 'undefined') return '';
    return `<section class="card rounded-xl border border-hairline p-4 sm:p-5 mb-4">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Mapa de tiro · diagnóstico</h3>
      <p class="text-[11px] dato-sec mb-3">Play-by-play oficial de los partidos validados de ${esc(f.equipo)}. No sigue el
        período elegido arriba: es la temporada que cargó la ingesta.</p>
      <div class="fx-mapa" data-fx-torneo="${esc(f.torneo)}" data-fx-zona="${esc(f.zona)}"
        data-fx-equipo="${esc(f.equipoCrudo)}" data-fx-jugador="${esc(f.nombre)}">
        <p class="text-[11px] text-muted">Cargando el mapa de tiro…</p></div>
    </section>`;
  }

  function paqueteTiros(torneo, zona, equipo) {
    const k = torneo + '/' + zona + '/' + SGADD.claveEquipo(equipo);
    if (!MAPAS.has(k)) {
      MAPAS.set(k, SGADD_DATA.fichajesTiros(torneo, zona, equipo).then(r => r.paquete)
        .catch((e) => { MAPAS.delete(k); throw e; }));
    }
    return MAPAS.get(k);
  }

  function montarMapas(root) {
    if (!root || !root.querySelectorAll || typeof SGADD_PBP === 'undefined') return;
    root.querySelectorAll('.fx-mapa:not([data-fx-montado])').forEach((nodo) => {
      nodo.setAttribute('data-fx-montado', '1');
      const g = (a) => nodo.getAttribute('data-fx-' + a);
      paqueteTiros(g('torneo'), g('zona'), g('equipo')).then((paq) => {
        if (!nodo.isConnected) return;
        nodo.innerHTML = SGADD_PBP.jugador(paq, g('jugador'));
        SGADD_PBP.activar(nodo, paq);
      }).catch((e) => {
        if (!nodo.isConnected) return;
        const txt = e && e.codigo === 'SIN_DATOS'
          ? 'Esta zona todavía no tiene análisis de play-by-play: el mapa sale con la ingesta automática.'
          : (e && e.message) || 'No se pudo cargar el mapa de tiro.';
        nodo.innerHTML = `<p class="text-[11px] text-muted">${esc(txt)}</p>`;
      });
    });
  }

  /* ---------------------------------------------------------------------
     PARECIDOS EN TODO EL TORNEO (punto 91, alternativa D)

     La similitud del punto 58 —función 50 %, perfiles 30 %, jerarquía 20 %,
     con volumen comparable de minutos y uso— contra TODAS las zonas, con el
     mismo piso del 60 %. Es la búsqueda «necesito otro como el que se me
     va»: el % sale de las etiquetas, y cada uno se etiquetó contra su zona.
     --------------------------------------------------------------------- */
  function parecidos(f) {
    return filasDelTorneo()
      .filter(x => x.id !== f.id && x.califica)
      .map(x => ({ fila: x, sim: jugadoresSimilitud(f._adn, x._adn) }))
      .filter(x => x.sim.volumen && x.sim.volumen.ok && x.sim.total >= M.PISO_COINCIDENCIA - 1e-9)
      .sort((a, b) => (b.sim.total - a.sim.total) || (M.confianza(b.fila).rango - M.confianza(a.fila).rango));
  }

  function itemDeSimilitud(x) {
    const partes = [
      { label: 'Función en cancha', peso: 0.5, puntaje: x.sim.funcion },
      { label: 'Perfiles técnicos', peso: 0.3, puntaje: x.sim.perfiles },
      { label: 'Jerarquía', peso: 0.2, puntaje: x.sim.adn },
    ];
    return { fila: x.fila, conf: M.confianza(x.fila), rotulo: 'de similitud',
      coinc: { pct: x.sim.total, partes: partes,
        faltan: partes.filter(p => p.puntaje < 1).map(p => p.label + ' ' + Math.round(p.puntaje * 100) + ' %') } };
  }

  function vistaParecidos() {
    const f = filaPorId(ST.abierto);
    if (!f) {
      return `<div class="card rounded-xl p-6 border border-hairline text-center text-sm text-muted">
        Ese jugador ya no está en la búsqueda. <button type="button" onclick="SGADD_FICHAJES.irA('buscar')" class="underline">Volver</button></div>`;
    }
    const lista = parecidos(f).map(itemDeSimilitud);
    const visibles = lista.slice(0, ST.pagina * POR_PAGINA);
    const zonas = Array.from(new Set(lista.map(x => x.fila.zonaLabel)));
    return `
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onclick="SGADD_FICHAJES.irA('radiografia')"
          class="text-[11px] px-3 py-1.5 rounded border border-hairline text-muted hover:text-ink hover:bg-surface2">← Radiografía</button>
        <button type="button" onclick="SGADD_FICHAJES.irA('buscar')"
          class="text-[11px] px-3 py-1.5 rounded border border-hairline text-muted hover:text-ink hover:bg-surface2">Resultados</button>
      </div>
      ${badgePeriodo()}
      <section class="card rounded-xl border border-hairline p-4 sm:p-5 mb-4">
        <p class="text-[10px] uppercase tracking-widest font-display text-accent">Parecidos en todo el torneo</p>
        <h3 class="font-display uppercase tracking-wide text-lg text-ink">${esc(f.nombre)}</h3>
        <p class="text-[11px] text-muted">${esc(f.equipo)} · ${esc(f.zonaLabel)} · ${esc(f._adn.rolFuncional ? f._adn.rolFuncional.label : '—')}</p>
        <p class="text-[11px] dato-sec mt-2">Similitud por etiquetas: función en cancha 50 %, perfiles técnicos 30 %, jerarquía 20 %,
          entre jugadores con minutos y uso comparables. Se muestran los que llegan al ${Math.round(M.PISO_COINCIDENCIA * 100)} %,
          de todas las zonas (cada uno etiquetado contra la suya). ${lista.length} jugador${lista.length === 1 ? '' : 'es'}${zonas.length ? ' · ' + esc(zonas.join(', ')) : ''}.</p>
      </section>
      ${visibles.length
        ? `<ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">${visibles.map(x => tarjeta(x.fila, x)).join('')}</ul>`
        : `<div class="card rounded-xl p-6 border border-hairline text-center text-sm text-muted">Nadie del torneo llega al ${Math.round(M.PISO_COINCIDENCIA * 100)} % de similitud con volumen comparable.</div>`}
      ${lista.length > visibles.length ? `<div class="text-center mt-4"><button type="button" onclick="SGADD_FICHAJES.verMas()"
          class="text-xs px-4 py-2 rounded border border-hairline text-muted hover:text-ink hover:bg-surface2">
          Ver ${Math.min(POR_PAGINA, lista.length - visibles.length)} más (${lista.length - visibles.length} restantes)</button></div>` : ''}`;
  }

  /* ---------------------------------------------------------------------
     COMPARAR
     --------------------------------------------------------------------- */
  function vistaComparar() {
    const filas = ST.comparar.map(filaPorId).filter(Boolean);
    if (filas.length < 2) {
      return `<div class="card rounded-xl p-6 border border-hairline text-center text-sm text-muted">
        Elegí al menos dos jugadores con «+ Comparar». <button type="button" onclick="SGADD_FICHAJES.irA('buscar')" class="underline">Volver</button></div>`;
    }
    const ids = M.IDS_FILTRO;
    const invertidas = {};
    ids.forEach(k => { invertidas[k] = !!metrica(k).invertida; });
    const mejor = M.mejorPorMetrica(filas, ids, invertidas);
    const cab = filas.map((f, i) => `
      <th class="text-left align-bottom pb-2 px-2 min-w-[8rem]">
        <span class="inline-block w-2.5 h-2.5 rounded-full mr-1" style="background:${COLORES[i]}"></span>
        <button type="button" onclick="SGADD_FICHAJES.abrir('${escJs(f.id)}')" class="text-xs text-ink font-medium hover:text-accent text-left">${esc(f.nombre)}</button>
        <span class="block text-[10px] text-muted font-normal">${esc(f.equipo)} · ${esc(f.zonaLabel)}</span>
        <span class="block text-[10px] text-muted font-normal">${esc(fichaTexto(f.ficha))}</span>
      </th>`).join('');
    const filaAdn = (titulo, fn) => `<tr class="border-b border-hairline/40">
      <td class="py-1.5 pr-2 text-[11px] text-muted">${esc(titulo)}</td>
      ${filas.map(f => `<td class="py-1.5 px-2 text-[11px] text-ink">${esc(fn(f) || '—')}</td>`).join('')}</tr>`;
    /* «CONTRA SU ZONA», la MISMA lista de la Radiografía y en el mismo
       orden (`metricasPorGrupo`): Volumen · Eficiencia · Volumen de tiro ·
       Creación · Rebote y defensa. Cada celda trae lo que trae la fila de
       la Radiografía —valor, convertidos/intentados del acierto, barra y
       percentil— y la mediana de SU zona en el `title`: dos jugadores de
       zonas distintas se comparan por percentil. Acá SÍ van los totales
       del tramo, dentro de Volumen de tiro: Comparar no tiene otro bloque
       de volumen, y el tamaño de la muestra es lo primero que se pregunta. */
    const nCol = filas.length + 1;
    const cuerpo = M.metricasPorGrupo(true).map(({ grupo, ids: gIds }) => `
      <tr><th colspan="${nCol}" scope="colgroup" class="text-left pt-3 pb-1 text-[10px] uppercase tracking-widest font-display text-muted">${esc(grupo)}</th></tr>
      ${gIds.map(k => `<tr class="border-b border-hairline/40 last:border-0">
      <td class="py-1 pr-2 text-xs">${esc(metrica(k).label)}${invertidas[k] ? ' <span class="text-muted" title="menos es mejor">↓</span>' : ''}</td>
      ${filas.map((f, i) => {
        const gana = mejor[k] && mejor[k].indice === i;
        const r = esTotal(k) ? null : f._idx.leerJugador(f._j, k);
        return `<td class="py-1 px-2 align-top"${r && r.tipoFormateado ? ` title="Mediana de ${esc(f.zonaLabel)}: ${esc(r.tipoFormateado)}"` : ''}>
          <span class="text-xs font-mono ${gana ? 'text-ink font-semibold' : 'text-muted'}">${gana ? '● ' : ''}${esc(fmt(k, f.m[k]))}</span>${volumenDeAcierto(f, k)}
          ${esTotal(k) ? '' : `<span class="flex items-center gap-1 mt-0.5"><span class="flex-1 min-w-[3rem]">${barraPc(f.pc[k])}</span>
            <span class="text-[10px] font-mono ${tonoPc(f.pc[k])}">${pcTexto(f.pc[k])}</span></span>`}</td>`;
      }).join('')}</tr>`).join('')}`).join('');
    return `
      <div class="flex items-center gap-2 mb-3">
        <button type="button" onclick="SGADD_FICHAJES.irA('buscar')"
          class="text-[11px] px-3 py-1.5 rounded border border-hairline text-muted hover:text-ink hover:bg-surface2">← Resultados</button>
        <button type="button" onclick="SGADD_FICHAJES.vaciarComparar()" class="text-[11px] text-muted hover:text-ink underline">Vaciar</button>
      </div>
      <div class="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
        <section class="card rounded-xl border border-hairline p-4">
          ${radarSvg(filas.map((f, i) => ({ ejes: M.ejesRadar(f.pc), color: COLORES[i] })), { tam: 300, relleno: 0.12, titulo: 'Radar comparado' })}
          <p class="text-[10px] dato-sec">Cada zona es su propia liga: se compara por percentil contra la zona de cada uno.</p>
        </section>
        <section class="card rounded-xl border border-hairline p-4 overflow-x-auto">
          <table class="w-full fx-tabla">
            <thead><tr><th></th>${cab}</tr></thead>
            <tbody>
              ${filaAdn('Función', f => f._adn.rolFuncional && f._adn.rolFuncional.label)}
              ${filaAdn('Jerarquía', f => f._adn.jerarquia && f._adn.jerarquia.label)}
              ${filaAdn('Minutos', f => f._adn.rolMinutos && f._adn.rolMinutos.label)}
              <tr><th colspan="${nCol}" scope="colgroup" class="text-left pt-4 pb-0.5 font-display uppercase tracking-wide text-sm text-ink">Contra su zona</th></tr>
              ${cuerpo}
            </tbody>
          </table>
          <p class="text-[10px] dato-sec mt-2">● el mejor de la fila: por percentil cuando todos lo tienen, si no por valor.
            El percentil es contra la zona de cada uno; su mediana, al pasar sobre la celda.</p>
        </section>
      </div>`;
  }

  /* ---------------------------------------------------------------------
     EL PADRÓN · solo admin
     --------------------------------------------------------------------- */
  function vistaPadron() {
    if (!ST.admin) return '';
    if (ST.padron === null && !ST.padronError) {
      SGADD_DATA.fichajesPadron().then(r => { ST.padron = r.padron || {}; pintar(); })
        .catch(e => { ST.padronError = e; pintar(); });
      return `<div class="card rounded-xl p-6 border border-hairline text-sm text-muted">Leyendo el padrón…</div>`;
    }
    if (ST.padronError) {
      return `<div class="card rounded-xl p-6 border border-hairline text-sm text-red-400">${esc(ST.padronError.message)}</div>`;
    }
    const torneos = ST.torneos;
    const filas = Object.keys(ST.padron).map(email => {
      const r = ST.padron[email];
      const activos = (r.torneos || []).map(id => { const t = torneos.filter(x => x.id === id)[0]; return t ? (t.nombreCorto || t.nombre) : id; });
      return `<tr class="border-b border-hairline/40 last:border-0">
        <td class="py-1.5 pr-3 text-xs text-ink font-mono">${esc(email)}</td>
        <td class="py-1.5 pr-3 text-xs ${activos.length ? 'text-ink' : 'text-muted'}">${esc(activos.length ? activos.join(', ') : 'Deshabilitado')}</td>
        <td class="py-1.5 pr-3 text-[11px] text-muted">${esc(r.nota || '')}</td>
        <td class="py-1.5 text-right whitespace-nowrap">
          <button type="button" onclick="SGADD_FICHAJES.editarAcceso('${escJs(email)}')" class="text-[11px] text-accent hover:underline">Editar</button>
          ${activos.length ? `<button type="button" onclick="SGADD_FICHAJES.guardarAcceso('${escJs(email)}', [], '${escJs(r.nota || '')}')"
            class="text-[11px] text-red-400 hover:underline ml-2">Deshabilitar</button>` : ''}</td>
      </tr>`;
    }).join('');
    return `
      <section class="card rounded-xl border border-hairline p-4 sm:p-5">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink">Accesos a Fichajes</h3>
        <p class="text-[11px] dato-sec mb-3">Un mail ve SOLO los torneos tildados, y el servidor lo verifica en cada pedido: sacarlo corta el acceso en el próximo clic.
          El mail tiene que poder entrar al panel (cliente de algún club). Los administradores ven todo y no van acá.</p>
        <form id="fxFormAcceso" onsubmit="event.preventDefault(); SGADD_FICHAJES.enviarAcceso(this)"
          class="grid gap-2 sm:grid-cols-[1fr_auto] items-end mb-4 p-3 rounded-lg border border-hairline bg-surface2/30">
          <div class="grid gap-2">
            <label class="text-[10px] uppercase tracking-wider text-muted font-display flex flex-col gap-1">Mail
              <input name="email" type="email" required autocomplete="off"
                class="rounded border border-hairline bg-surface2/40 px-2 py-1.5 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"></label>
            <fieldset class="flex flex-wrap gap-3"><legend class="text-[10px] uppercase tracking-wider text-muted font-display mb-1">Torneos</legend>
              ${torneos.map(t => `<label class="flex items-center gap-1.5 text-xs text-ink">
                <input type="checkbox" name="torneo" value="${esc(t.id)}"> ${esc(t.nombreCorto || t.nombre)}</label>`).join('')}
            </fieldset>
            <label class="text-[10px] uppercase tracking-wider text-muted font-display flex flex-col gap-1">Nota (quién es, hasta cuándo)
              <input name="nota" maxlength="140"
                class="rounded border border-hairline bg-surface2/40 px-2 py-1.5 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"></label>
          </div>
          <button type="submit" class="text-[11px] font-semibold px-4 py-2 rounded-md border border-accent text-accent hover:bg-accent/10">Guardar acceso</button>
        </form>
        ${filas ? `<div class="overflow-x-auto"><table class="w-full">
          <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
            <th class="text-left font-display pb-1">Mail</th><th class="text-left font-display pb-1">Torneos</th>
            <th class="text-left font-display pb-1">Nota</th><th></th></tr></thead>
          <tbody>${filas}</tbody></table></div>`
        : `<p class="text-xs text-muted">Todavía no hay nadie habilitado.</p>`}
      </section>`;
  }

  /* =====================================================================
     ACCIONES
     ===================================================================== */

  function elegirTorneo(id) {
    if (id === ST.torneo) return;
    ST.torneo = id; ST.crit = criteriosVacios(); ST.pagina = 1; ST.vista = 'buscar';
    /* Los tramos y los días son de cada libro: el período no viaja de un
       torneo a otro. */
    ST.periodo = Object.assign({}, PERIODO_VACIO);
    ST.abierto = null; ST.comparar = [];
    pintar();
    cargarTorneo();
  }

  function irA(vista) {
    ST.vista = vista;
    if (vista !== 'radiografia') ST.editandoFicha = false;
    if (vista === 'padron') { ST.padron = null; ST.padronError = null; }
    pintar();
    window.scrollTo(0, 0);
  }

  function abrir(id) { ST.abierto = id; ST.editandoFicha = false; irA('radiografia'); }

  /* Tipear NO repinta la sección: solo los resultados, como el buscador
     del buzón (punto 13). Un repintado por tecla le saca el foco al input. */
  function buscarTexto(v) {
    ST.crit.texto = v || '';
    ST.pagina = 1;
    repintarResultados();
  }

  function repintarResultados() {
    const cont = document.getElementById('fxResultados');
    if (!cont) { pintar(); return; }
    const tmp = document.createElement('div');
    tmp.innerHTML = vistaBuscar();
    const nuevo = tmp.querySelector('#fxResultados');
    const resumen = tmp.querySelector('#fxResumen');
    if (nuevo) cont.innerHTML = nuevo.innerHTML;
    const r = document.getElementById('fxResumen');
    if (r && resumen) r.innerHTML = resumen.innerHTML;
  }

  function alternar(campo, valor) {
    if (campo === 'origen') {
      ST.crit.origen = ST.crit.origen === valor ? null : valor;
    } else {
      const l = ST.crit[campo];
      const i = l.indexOf(valor);
      if (i === -1) l.push(valor); else l.splice(i, 1);
    }
    ST.pagina = 1;
    pintar();
  }

  function fijar(campo, valor) { ST.crit[campo] = valor; ST.pagina = 1; pintar(); }
  function fijarEquipo(v) { ST.crit.equipos = v ? [v] : []; ST.pagina = 1; pintar(); }
  function recordarFiltros(abierto) { ST.filtrosAbiertos = !!abierto; }

  function fijarRango(id, lado, valor) {
    const n = (valor === '' || valor === null) ? undefined : Number(String(valor).replace(',', '.'));
    const v = (typeof n === 'number' && isFinite(n)) ? n : undefined;
    if (id === 'edad' || id === 'talla' || id === 'nacimiento') {
      ST.crit[id] = Object.assign({}, ST.crit[id], { [lado]: v });
    } else if (id.indexOf('m:') === 0) {
      const k = id.slice(2);
      const r = Object.assign({}, ST.crit.rangos[k] || {});
      r[lado] = (v !== undefined && esPorcentaje(k) && !r.pc) ? v / 100 : v;
      ST.crit.rangos[k] = r;
    }
    ST.pagina = 1;
    pintar();
  }

  function agregarRango(porPercentil) {
    const sel = document.getElementById('fxNuevaMetrica');
    if (!sel || !sel.value) return;
    /* Un TOTAL no tiene percentil (es el tamaño de la muestra): se filtra
       por valor aunque se haya pedido por percentil, y se avisa. */
    if (porPercentil && esTotal(sel.value)) {
      SGADD_BUZON.toast('Los totales se filtran por valor: no tienen percentil.', 'aviso');
      porPercentil = false;
    }
    ST.crit.rangos[sel.value] = porPercentil ? { pc: true, min: 75 } : {};
    pintar();
  }

  function limpiarRangos() { ST.crit.rangos = {}; pintar(); }

  /** Un rango OBLIGATORIO descarta; uno común resta puntos (punto 91). */
  function fijarRangoDuro(k, duro) {
    if (!ST.crit.rangos[k]) return;
    ST.crit.rangos[k] = Object.assign({}, ST.crit.rangos[k], { duro: !!duro });
    ST.pagina = 1;
    pintar();
  }

  function buscarParecidos(id) { ST.abierto = id; ST.pagina = 1; irA('parecidos'); }

  /* EL PERÍODO. Cada cambio arma (o toma del caché) la vista de cada zona
     y repinta: la búsqueda, el radar y la tendencia salen de esa muestra. */
  function fijarPeriodo(campo, valor) {
    if (['tramo', 'desde', 'hasta'].indexOf(campo) === -1) return;
    const nuevo = Object.assign({}, ST.periodo, { [campo]: campo === 'tramo' ? (valor || null) : (valor || '') });
    if (nuevo.desde && nuevo.hasta && nuevo.desde > nuevo.hasta) {
      SGADD_BUZON.toast('«Desde» no puede ser posterior a «Hasta».', 'aviso');
      pintar();
      return;
    }
    ST.periodo = nuevo;
    ST.pagina = 1;
    aplicarPeriodo();
  }

  /* Un período NUEVO cuesta ~1 s con 260 jugadores (rehace el índice y
     reetiqueta el ADN de todos; medido en la demo) y uno ya visto, 80 ms
     del caché. Un segundo congelado sin aviso se lee como un cuelgue: se
     avisa primero y se calcula en el cuadro siguiente. */
  function aplicarPeriodo() {
    const pendiente = zonasCargadas().some(z => !z.vistas.has(firmaPeriodo(ST.periodo)));
    const cont = document.getElementById('fxResultados') || document.getElementById('view-root');
    if (pendiente && cont) {
      cont.innerHTML = `<div class="card rounded-xl p-6 border border-hairline text-center text-sm text-muted" role="status">
        Recalculando la muestra del período…</div>`;
      setTimeout(pintar, 30);
      return;
    }
    pintar();
  }

  function quitarPeriodo() { ST.periodo = Object.assign({}, PERIODO_VACIO); ST.pagina = 1; aplicarPeriodo(); }
  function limpiarTodo() { ST.crit = criteriosVacios(); ST.pagina = 1; pintar(); }
  function ordenarPor(k) { ST.orden = k; ST.dir = (k === 'nombre' || k === 'edad') ? 'asc' : 'desc'; pintar(); }
  function invertirOrden() { ST.dir = ST.dir === 'desc' ? 'asc' : 'desc'; pintar(); }
  function verMas() { ST.pagina++; repintarResultados(); }

  function alternarComparar(id) {
    const i = ST.comparar.indexOf(id);
    if (i !== -1) ST.comparar.splice(i, 1);
    else {
      if (ST.comparar.length >= MAX_COMPARAR) {
        SGADD_BUZON.toast('Se comparan hasta ' + MAX_COMPARAR + ' jugadores a la vez.', 'aviso');
        return;
      }
      ST.comparar.push(id);
    }
    pintar();
  }
  function vaciarComparar() { ST.comparar = []; if (ST.vista === 'comparar') ST.vista = 'buscar'; pintar(); }

  function editarFicha(on) { ST.editandoFicha = !!on; pintar(); }

  function guardarFicha(id, form) {
    const f = filaPorId(id);
    if (!f) return;
    const datos = {
      nacimiento: form.nacimiento.value, posicion: form.posicion.value, talla: form.talla.value,
    };
    const n = M.normalizarFicha(datos);
    if (n && n.error) { SGADD_BUZON.toast(n.mensaje, 'aviso', 3600); return; }
    SGADD_DATA.fichajesGuardarFichas(f.torneo, { [f.clave]: n || {} }).then(r => {
      /* Las fichas son del TORNEO: se refrescan en todas sus zonas. */
      Object.keys(ST.zonas).forEach(k => {
        const z = ST.zonas[k];
        if (k.indexOf(f.torneo + '/') !== 0 || z.estado !== 'ok') return;
        z.fichas = r.fichas || {};
        z.fichasLeidas = true;
        /* En TODAS las vistas ya calculadas (cada período es una), sin
           rehacer los índices: la ficha no cambia ningún número. */
        z.vistas.forEach(v => (v.filas || []).forEach(x => { x.ficha = fichaDe(z, x.clave); }));
      });
      ST.editandoFicha = false;
      SGADD_BUZON.toast('Ficha guardada · ' + f.nombre, 'ok');
      pintar();
    }).catch(e => SGADD_BUZON.toast(e.message || 'No se pudo guardar la ficha.', 'error', 4200));
  }

  function enviarAcceso(form) {
    const torneos = Array.from(form.querySelectorAll('input[name="torneo"]:checked')).map(i => i.value);
    guardarAcceso(form.email.value, torneos, form.nota.value);
  }

  function editarAcceso(email) {
    const form = document.getElementById('fxFormAcceso');
    const r = ST.padron && ST.padron[email];
    if (!form || !r) return;
    form.email.value = email;
    form.nota.value = r.nota || '';
    form.querySelectorAll('input[name="torneo"]').forEach(i => { i.checked = (r.torneos || []).indexOf(i.value) !== -1; });
    form.email.focus();
  }

  function guardarAcceso(email, torneos, nota) {
    SGADD_DATA.fichajesGuardarPadron({ email: email, torneos: torneos, nota: nota }).then(r => {
      ST.padron = r.padron || {};
      SGADD_BUZON.toast(torneos.length ? 'Acceso guardado · ' + email : 'Acceso deshabilitado · ' + email, torneos.length ? 'ok' : 'aviso');
      pintar();
    }).catch(e => SGADD_BUZON.toast(e.message || 'No se pudo guardar el acceso.', 'error', 4200));
  }

  /* =====================================================================
     EL PDF · la ficha de fichaje

     Mismo mecanismo que la ficha individual (punto 7.6 ter):
     `window.print()`, un contenedor propio, la clase de papel ANTES de
     armar y la limpieza en `afterprint`. A4 VERTICAL: es una hoja que se
     manda a un dirigente o a un representante, se lee de arriba abajo y se
     imprime en cualquier impresora de oficina.

     El radar y las líneas son SVG: salen iguales en el papel sin pasar por
     la paleta de Chart.js.
     ===================================================================== */
  function exportar(id) {
    const f = filaPorId(id);
    if (!f) return;
    /* EL GUARD PROPIO, redundante a propósito (punto 19): el archivo sale
       del panel y se comparte. */
    if (!SGADD_AUTH.puedoAcceder('fichajes').ok) return;
    const previo = document.getElementById('fichajeSalida');
    if (previo) previo.remove();
    document.body.classList.add('modo-fichaje-print');
    const salida = document.createElement('div');
    salida.id = 'fichajeSalida';
    salida.innerHTML = armarPdf(f);
    document.body.appendChild(salida);
    SGADD_UI.inyectarPieDeHoja('fichajeSalida');
    SGADD_UI.embeberImagenes('#fichajeSalida');
    SGADD_UI.tituloPdf(SGADD_UI.nombrePdf('fichaje', { jugador: f.nombre }));
    setTimeout(() => {
      const alTerminar = () => {
        window.removeEventListener('afterprint', alTerminar);
        clearTimeout(respaldo);
        limpiarPdf();
      };
      window.addEventListener('afterprint', alTerminar);
      const respaldo = setTimeout(alTerminar, 60000);
      window.print();
    }, 500);
  }

  function limpiarPdf() {
    document.body.classList.remove('modo-fichaje-print');
    SGADD_UI.quitarPieDeHoja('fichajeSalida');
    SGADD_UI.restaurarImagenes('#fichajeSalida');
    const s = document.getElementById('fichajeSalida');
    if (s) s.remove();
  }

  function armarPdf(f) {
    const adn = f._adn;
    const t = torneoActual() || {};
    const zona = zonaDeFila(f) || {};
    const fecha = SGADD_UI.fechaHoy();
    const kpis = ['PTS', 'MIN', 'TS%', 'USG%', 'AST-PP', 'PLAYS'].map(k => `
      <div class="fx-pdf-kpi"><span>${esc(k)}</span><b>${esc(fmt(k, f.m[k]))}</b><i>${pcTexto(f.pc[k])}</i></div>`).join('');
    const badges = jugadoresBadges(adn).filter(b => b.tipo !== 'rol').map(b => `<span class="fx-pdf-chip">${esc(b.texto)}</span>`).join('');
    const items = lectura(f).map(x => `<li><b>${esc(x.t)}</b> ${esc(x.x)}</li>`).join('');
    const sim = similares(f, 5).map(x => `<li>${esc(x.fila.nombre)} · ${esc(x.fila.equipo)} (${esc(x.fila.zonaLabel)}) — ${x.sim.porcentaje} %</li>`).join('');
    return `
      <header class="informe-cabecera fx-pdf-cab">
        <div class="fx-pdf-fila">
          ${escudo(f.equipoCrudo, 'fx-pdf-escudo')}
          <div>
            <p class="fx-pdf-sobre">Ficha de fichaje · Radiografía ADN</p>
            <h1>${esc(f.nombre)}</h1>
            <p>${esc(f.equipo)} · ${esc(f.zonaLabel)} · ${esc(t.nombre || '')}</p>
            <p>${esc(fichaTexto(f.ficha))} · Emitida el ${esc(fecha)}</p>
          </div>
        </div>
      </header>
      <section class="informe-bloque fx-pdf-perfil">
        <div>
          <h2>${esc(adn.rolFuncional ? adn.rolFuncional.label : 'Perfil')}</h2>
          <p class="informe-pregunta">${esc(adn.rolMinutos ? adn.rolMinutos.label : '')}${adn.jerarquia ? ' · ' + esc(adn.jerarquia.label) : ''}</p>
          <div class="fx-pdf-chips">${badges}</div>
          <div class="fx-pdf-kpis">${kpis}</div>
          ${f.califica ? '' : `<p class="ficha-aviso">~ ${esc(JUGADORES_MOTIVO_SIN_RESPALDO)}</p>`}
        </div>
        <div class="fx-pdf-radar">${radarSvg([{ ejes: M.ejesRadar(f.pc), color: '#B45309' }], { tam: 260, margen: 62 })}</div>
      </section>
      <section class="informe-bloque">
        ${badgePeriodo(true)}
        <h2>Lo que vas a ver en cancha</h2>
        <ul class="fx-pdf-lectura">${items}</ul>
      </section>
      <section class="informe-bloque">
        <h2>Contra su zona · ${esc(zona.label || '')}</h2>
        <div class="fx-pdf-grupos">${tablaPercentiles(f)}</div>
      </section>
      <section class="informe-bloque fx-pdf-dos">
        <div><h2>Tendencia</h2>${bloqueTendencia(f)}</div>
        <div><h2>Volumen de tiro</h2>${bloqueVolumen(f)}
          <h2 style="margin-top:4mm">Cómo terminan sus jugadas</h2>${bloqueTiro(f)}
          ${sim ? `<h2 style="margin-top:4mm">Perfiles parecidos</h2><ul class="fx-pdf-sim">${sim}</ul>` : ''}</div>
      </section>
      <footer class="informe-pie">${SGADD_UI.pieInforme(fecha)}</footer>`;
  }

  return {
    iniciar, montar, pintar, elegirTorneo, irA, abrir, buscarTexto, alternar, fijar, fijarEquipo,
    recordarFiltros, fijarRango, agregarRango, limpiarRangos, limpiarTodo, ordenarPor, invertirOrden,
    fijarPeriodo, quitarPeriodo, fijarRangoDuro, buscarParecidos, usarModelo,
    verMas, alternarComparar, vaciarComparar, editarFicha, guardarFicha, enviarAcceso, editarAcceso,
    guardarAcceso, exportar, radarSvg, sparkSvg, estado: ST,
  };
})();
