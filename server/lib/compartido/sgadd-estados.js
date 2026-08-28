/* ARCHIVO GENERADO · NO EDITAR ACÁ.
 *
 * Copia mecánica de js/sgadd-estados.js, que es la fuente de verdad.
 * Existe porque Vercel despliega con raíz en `server/` y no sube el
 * resto del repo. Para regenerar:
 *
 *     node server/bin/sincronizar-compartido.js
 *
 * `test-backend.js` falla si este archivo difiere del original.
 */
/* =====================================================================
   SGADD · Estados de jugador y buzón de alertas

   Implementa lo diseñado en PROPUESTA_ESTADOS_JUGADOR.md, con las cuatro
   decisiones ya tomadas por el club:

     1. El filtro anti-spam de inactividad exige `PJ previos > 0` Y
        `MIN previo ≥ 8,0`. Sin eso, con la regla de 4 partidos pelada
        salían 50 alertas sobre 210 jugadores (24%) y un buzón que se abre
        con 50 tarjetas no se lee nunca más.
     2. Una BAJA sale de los planes defensivos y de las rotaciones futuras,
        pero **conserva sus datos históricos**: los box scores que disputó
        y su aporte a las medianas de la competencia. La liga describe lo
        que pasó, y un jugador que jugó seis fechas las jugó.
     3. `origen: "usuario"` gana SIEMPRE sobre el escaneo automático. El
        detector propone, el DT decide.
     4. Los estados viven en `localStorage`, por club y por planilla.

   POR QUÉ NO VA EN LA PLANILLA
   ----------------------------
   MotorStats no escribe estado, y pedirle una columna abre un ciclo de
   coordinación con el otro proyecto por algo que es una decisión del
   cuerpo técnico, no un dato del box score.

   DEGRADACIÓN
   -----------
   Sin `localStorage` (Node, modo privado, primera visita) todos los
   jugadores son ACTIVO y el panel se comporta exactamente como antes. La
   funcionalidad nueva no puede tumbar lo que ya anda — misma regla que la
   config de club.
   ===================================================================== */

const SGADD_ESTADOS = (function () {
  'use strict';

  /* =====================================================================
     1. TAXONOMÍA
     ===================================================================== */

  const ESTADOS = [
    {
      id: 'ACTIVO', emoji: '🟢', label: 'Activo',
      descripcion: 'Jugador regular en plantilla.',
      color: 'text-green-400', borde: 'border-green-400/40',
      enPlan: true, enMedianas: true, avisaEnScouting: false,
    },
    {
      id: 'SUSPENSO', emoji: '🟡', label: 'Suspenso / Lesión',
      descripcion: 'Ausente por rotación o físico. Sigue en el plantel.',
      color: 'text-yellow-400', borde: 'border-yellow-400/40',
      /* Sigue en el informe A PROPÓSITO: el DT rival necesita saber que
         existe y qué hace, aunque no haya jugado las últimas cuatro. Lo
         que no puede es que su ausencia pase inadvertida. */
      enPlan: true, enMedianas: true, avisaEnScouting: true,
    },
    {
      id: 'ALTA', emoji: '🔵', label: 'Alta / Refuerzo',
      descripcion: 'Incorporación reciente. Entra al análisis sin piso de partidos.',
      color: 'text-blue-400', borde: 'border-blue-400/40',
      enPlan: true, enMedianas: true, avisaEnScouting: true,
    },
    {
      id: 'BAJA', emoji: '🔴', label: 'Inactivo / Baja',
      descripcion: 'Traspasado o fuera de la liga.',
      color: 'text-red-400', borde: 'border-red-400/40',
      /* Sale de los planes futuros pero NO de las medianas: los partidos
         que jugó, los jugó. Borrarlo de la competencia sería reescribir
         la historia del torneo. */
      enPlan: false, enMedianas: true, avisaEnScouting: false,
    },
  ];

  const POR_ID = {};
  ESTADOS.forEach(e => { POR_ID[e.id] = e; });

  const DEFECTO = 'ACTIVO';

  function estado(id) { return POR_ID[id] || POR_ID[DEFECTO]; }

  /* =====================================================================
     2. PERSISTENCIA · localStorage por club + planilla
     ===================================================================== */

  const PREFIJO = 'sgadd.estados';

  /** Clave del jugador dentro del mapa: NOMBRE + EQUIPO, igual que el slug
      de la ficha. Dos homónimos de equipos distintos no se pisan. */
  function claveJugador(nombre, equipo) {
    const n = (typeof SGADD !== 'undefined') ? SGADD.clavePersona(nombre) : String(nombre || '').trim().toUpperCase();
    const e = (typeof SGADD !== 'undefined') ? SGADD.claveEquipo(equipo) : String(equipo || '').trim().toUpperCase();
    return n + '|' + e;
  }

  function claveAlmacen(clubId, planillaId) {
    return PREFIJO + '.' + (clubId || 'default') + '.' + (planillaId || 'sin-planilla');
  }

  function almacen() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return null;
      return localStorage;
    } catch (e) { return null; }   // modo privado tira al leer, no al usar
  }

  /** Mapa completo de estados de una planilla. `{}` si no hay nada. */
  function leerTodos(clubId, planillaId) {
    const ls = almacen();
    if (!ls) return {};
    try {
      const crudo = ls.getItem(claveAlmacen(clubId, planillaId));
      const obj = crudo ? JSON.parse(crudo) : {};
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
  }

  function guardarTodos(clubId, planillaId, mapa) {
    const ls = almacen();
    if (!ls) return false;
    try { ls.setItem(claveAlmacen(clubId, planillaId), JSON.stringify(mapa || {})); return true; }
    catch (e) { return false; }    // cuota llena: se degrada a sesión, no rompe
  }

  /* =====================================================================
     3. LECTURA Y ESCRITURA DE UN ESTADO
     ===================================================================== */

  /**
   * Registro de un jugador. Devuelve siempre un objeto usable, aunque no
   * haya nada guardado: `{ id: 'ACTIVO', origen: 'defecto' }`.
   */
  function registroDe(mapa, clave) {
    const r = mapa && mapa[clave];
    if (!r || !POR_ID[r.estado]) return { estado: DEFECTO, origen: 'defecto' };
    return {
      estado: r.estado,
      origen: r.origen === 'usuario' ? 'usuario' : 'automatico',
      desde: r.desde || null,
      nota: r.nota || null,
    };
  }

  /**
   * Aplica un estado. Todo cambio que pasa por acá es del DT, así que
   * queda con `origen: "usuario"` y **ningún escaneo automático posterior
   * lo puede pisar** (ver `fusionarDeteccion`).
   */
  function aplicar(mapa, clave, idEstado, opciones) {
    const o = opciones || {};
    const out = Object.assign({}, mapa || {});
    if (!POR_ID[idEstado]) return out;
    out[clave] = {
      estado: idEstado,
      origen: o.origen === 'automatico' ? 'automatico' : 'usuario',
      desde: o.desde || new Date().toISOString().slice(0, 10),
      nota: o.nota || null,
    };
    return out;
  }

  /**
   * Mezcla lo que detectó el motor con lo que ya hay guardado.
   * REGLA DURA: un registro con `origen: "usuario"` no se toca nunca. Es la
   * precedencia estricta que pidió el club, y es lo que hace que el buzón
   * no vuelva a preguntar lo que el DT ya contestó.
   */
  function fusionarDeteccion(mapa, detectados) {
    const out = Object.assign({}, mapa || {});
    (detectados || []).forEach(d => {
      const actual = out[d.clave];
      if (actual && actual.origen === 'usuario') return;   // el DT manda
      out[d.clave] = {
        estado: d.estado, origen: 'automatico',
        desde: d.desde || null, nota: d.nota || null,
      };
    });
    return out;
  }

  /** ¿Entra a los planes defensivos y a las rotaciones futuras? */
  function enPlan(mapa, clave) { return estado(registroDe(mapa, clave).estado).enPlan; }
  /** ¿Suma a las medianas de la competencia? Hoy: todos. */
  function enMedianas(mapa, clave) { return estado(registroDe(mapa, clave).estado).enMedianas; }

  /* =====================================================================
     4. DETECCIÓN AUTOMÁTICA
     ===================================================================== */

  /** Partidos consecutivos sin minutos antes de sospechar. Pedido del club. */
  const RACHA_INACTIVIDAD = 4;

  /* AVISO INTERMEDIO · dos fechas.

     Faltar a dos partidos casi nunca es una baja: es una lesión leve, un
     viaje, una sanción de una fecha. Por eso el aviso NO pide decisión —
     eso sigue siendo cosa de la alerta de 4— y solo se para al lado del
     jugador para que el DT le preste atención.

     La distinción importa: si los avisos entraran al buzón como alertas,
     volvería el problema que el filtro anti-spam vino a resolver (una
     lista de tarjetas que nadie contesta y que se ignora para siempre).
     Una tarjeta del buzón es UNA decisión pendiente; un aviso es un dato
     de contexto. */
  const RACHA_AVISO = 2;
  /* --- Filtro anti-spam ---
     Sin esto, la regla de 4 partidos marcaba 50 de 210 jugadores. Los dos
     umbrales descartan al que nunca fue parte de la rotación: si jamás
     entró, no es una baja; y si entraba dos minutos sueltos, tampoco. */
  const MIN_PJ_PREVIOS = 0;      // tiene que haber jugado ALGUNO (> 0)
  const MIN_MINUTOS_PREVIOS = 8.0;

  /**
   * Alertas de inactividad: jugadores que ERAN rotación y dejaron de serlo.
   *
   * La racha se cuenta sobre los partidos DEL EQUIPO, no sobre los del
   * jugador: si no figura en `Base Datos J` de las últimas cuatro fechas,
   * es que no entró.
   */
  function detectarInactividad(idx, mapa) {
    if (!idx || !idx.liga) return [];
    const out = [];
    const partidosPorEquipo = new Map();
    idx.lista().forEach(e => {
      partidosPorEquipo.set(e.clave, e.partidos.slice()
        .sort((a, b) => (a.__fecha || 0) - (b.__fecha || 0))
        .map(p => p.__id));
    });

    (idx.liga.jugadores || []).forEach(j => {
      const eqClave = SGADD.claveEquipo(j['EQUIPO']);
      const ids = partidosPorEquipo.get(eqClave) || [];
      if (ids.length < RACHA_AVISO + 1) return;

      const suyos = (idx.liga.jugadorPartidos.get(j.__clave) || [])
        .filter(p => (p['MIN'] || 0) > 0);
      const jugados = new Set(suyos.map(p => p.__id));

      let racha = 0;
      for (let i = ids.length - 1; i >= 0; i--) {
        if (jugados.has(ids[i])) break;
        racha++;
      }
      if (racha < RACHA_AVISO) return;

      /* --- ANTI-SPAM --- */
      const pjPrevios = suyos.length;
      if (pjPrevios <= MIN_PJ_PREVIOS) return;
      const minPrevio = suyos.reduce((a, p) => a + (p['MIN'] || 0), 0) / pjPrevios;
      if (minPrevio < MIN_MINUTOS_PREVIOS) return;

      const clave = claveJugador(j['NOMBRES'], j['EQUIPO']);
      if (registroDe(mapa, clave).origen === 'usuario') return;   // ya contestado

      /* El nivel lo decide la racha, y con él cambia lo que se pide: el
         aviso informa, la alerta pregunta. */
      const esAlerta = racha >= RACHA_INACTIVIDAD;
      out.push({
        tipo: 'inactividad', nivel: esAlerta ? 'alerta' : 'aviso', clave: clave,
        nombre: j['NOMBRES'], equipo: SGADD.limpiarNombre(j['EQUIPO']),
        racha: racha, pjPrevios: pjPrevios, minPrevio: minPrevio,
        detalle: racha + ' partidos seguidos sin ingresar. Antes jugó ' + pjPrevios +
          ' con ' + minPrevio.toFixed(1) + ' min de promedio.',
        /* Sin sugerencias no hay botones de estado: el aviso no pide que
           el DT decida nada todavía. */
        sugerencias: esAlerta ? ['SUSPENSO', 'BAJA'] : [],
      });
    });
    return out.sort((a, b) => b.racha - a.racha);
  }

  /**
   * Alertas de traspaso: la misma persona en dos equipos de la liga.
   *
   * NO decide sola, y no puede: la clave de un jugador es hoy el string
   * del nombre (deuda técnica conocida), así que dos homónimos en equipos
   * distintos son indistinguibles de un traspaso. Por eso pregunta.
   */
  function detectarTraspasos(idx, mapa) {
    if (!idx || !idx.liga) return [];
    const porPersona = new Map();
    (idx.liga.jugadores || []).forEach(j => {
      const k = j.__clave;
      if (!porPersona.has(k)) porPersona.set(k, []);
      porPersona.get(k).push(j);
    });

    const out = [];
    porPersona.forEach((filas, persona) => {
      const equipos = Array.from(new Set(filas.map(j => SGADD.claveEquipo(j['EQUIPO']))));
      if (equipos.length < 2) return;

      /* El equipo actual es donde jugó más recientemente. */
      const ultimoDe = (eq) => {
        const ps = (idx.liga.jugadorPartidos.get(persona) || [])
          .filter(p => p.__equipo === eq && p.__fecha);
        return ps.length ? Math.max.apply(null, ps.map(p => p.__fecha.getTime())) : 0;
      };
      const orden = equipos.slice().sort((a, b) => ultimoDe(b) - ultimoDe(a));

      orden.forEach(eq => {
        const clave = claveJugador(filas[0]['NOMBRES'], eq);
        if (registroDe(mapa, clave).origen === 'usuario') return;
        out.push({
          tipo: 'traspaso', nivel: 'alerta', clave: clave,
          nombre: filas[0]['NOMBRES'], equipo: SGADD.limpiarNombre(eq),
          equipos: orden.map(e => SGADD.limpiarNombre(e)),
          esActual: eq === orden[0],
          detalle: 'Figura en ' + orden.length + ' equipos de la liga: ' +
            orden.map(e => SGADD.limpiarNombre(e)).join(' y ') +
            '. El más reciente es ' + SGADD.limpiarNombre(orden[0]) + '.',
          sugerencias: eq === orden[0] ? ['ALTA'] : ['BAJA'],
        });
      });
    });
    return out;
  }

  /**
   * Alertas de REINGRESO: alguien marcado como ausente que volvió a jugar.
   *
   * Es la contracara necesaria de la alerta de inactividad. Sin esto, un
   * jugador marcado 🟡 SUSPENSO se quedaba con esa etiqueta para siempre
   * —porque `origen: "usuario"` bloquea al detector— y el DT tenía que
   * acordarse solo de que volvió. El plan de scouting seguiría mostrándolo
   * como dudoso y, si estaba en 🔴 BAJA, seguiría fuera del plan aunque
   * esté jugando.
   *
   * **Esta es la ÚNICA alerta que se dispara sobre un registro marcado por
   * el usuario**, y no contradice la regla de precedencia: no cambia nada
   * por su cuenta, avisa de un hecho nuevo —jugó— que el DT no tenía
   * cuando decidió. La decisión sigue siendo suya.
   */
  function detectarReingresos(idx, mapa) {
    if (!idx || !idx.liga || !mapa) return [];
    const out = [];
    const partidosPorEquipo = new Map();
    idx.lista().forEach(e => {
      partidosPorEquipo.set(e.clave, e.partidos.slice()
        .sort((a, b) => (a.__fecha || 0) - (b.__fecha || 0))
        .map(p => p.__id));
    });

    (idx.liga.jugadores || []).forEach(j => {
      const clave = claveJugador(j['NOMBRES'], j['EQUIPO']);
      const r = registroDe(mapa, clave);
      /* Solo los marcados como ausentes: un ACTIVO que juega no es noticia. */
      if (r.estado !== 'SUSPENSO' && r.estado !== 'BAJA') return;

      const eqClave = SGADD.claveEquipo(j['EQUIPO']);
      const ids = partidosPorEquipo.get(eqClave) || [];
      if (!ids.length) return;
      const ultimos = ids.slice(-RACHA_INACTIVIDAD);
      const jugados = new Set((idx.liga.jugadorPartidos.get(j.__clave) || [])
        .filter(p => (p['MIN'] || 0) > 0).map(p => p.__id));
      const reingresos = ultimos.filter(id => jugados.has(id));
      if (!reingresos.length) return;

      const est = estado(r.estado);
      out.push({
        tipo: 'reingreso', nivel: 'alerta', clave: clave,
        nombre: j['NOMBRES'], equipo: SGADD.limpiarNombre(j['EQUIPO']),
        estadoActual: r.estado, partidosJugados: reingresos.length,
        detalle: 'Está marcado como ' + est.emoji + ' ' + est.label.toLowerCase() +
          ' y volvió a jugar: ' + reingresos.length + ' de los últimos ' + ultimos.length +
          ' partidos del equipo.',
        sugerencias: ['ACTIVO'],
      });
    });
    return out;
  }

  /**
   * Todas las alertas pendientes de una planilla.
   * Los reingresos van PRIMEROS: son los que corrigen un dato que hoy está
   * mal en el panel, no los que proponen marcar algo nuevo.
   */
  /**
   * Saca de una lista YA DETECTADA las que el DT ya contestó.
   *
   * Existe porque con backend la detección se hace del lado del servidor,
   * que NO tiene el mapa de estados: esas respuestas viven en el
   * `localStorage` de cada navegador y el servidor ni las ve. Así que
   * detecta todo y el filtro corre acá — que además es lo correcto si dos
   * personas del cuerpo técnico usan el panel con estados distintos.
   *
   * Es el mismo criterio que ya aplican los detectores locales: `origen:
   * "usuario"` gana siempre y el buzón no vuelve a preguntar lo que ya
   * se contestó (punto 13).
   */
  function filtrarRespondidas(alertas, mapa) {
    return (alertas || []).filter(a =>
      a && a.clave && registroDe(mapa, a.clave).origen !== 'usuario');
  }

  /**
   * Junta las alertas del servidor con las que solo se pueden calcular en
   * el cliente, sin duplicar.
   *
   * Los REINGRESOS son las únicas que quedan locales: ese detector dispara
   * solo sobre jugadores que el DT marcó como ausentes, así que sin su
   * mapa no tiene sobre quién correr. Las demás vienen del servidor, que
   * las calcula para la liga ENTERA — el cliente solo tiene su plantel.
   *
   * Ante la misma clave y el mismo tipo gana la LOCAL: si el navegador
   * pudo calcularla, tiene el dato completo delante.
   */
  function combinarAlertas(locales, delServidor) {
    const vistas = new Set();
    const out = [];
    (locales || []).forEach(a => {
      if (!a || !a.clave) return;
      vistas.add(a.tipo + '|' + a.clave);
      out.push(a);
    });
    (delServidor || []).forEach(a => {
      if (!a || !a.clave || vistas.has(a.tipo + '|' + a.clave)) return;
      out.push(a);
    });
    return out;
  }

  function detectarAlertas(idx, mapa) {
    return [].concat(
      detectarReingresos(idx, mapa),
      detectarTraspasos(idx, mapa),
      detectarInactividad(idx, mapa));
  }

  /* =====================================================================
     5. RESUMEN PARA LA UI
     ===================================================================== */

  /** Las que piden decisión: son las que cuentan para el badge del buzón. */
  function soloAlertas(alertas) {
    return (alertas || []).filter(a => a.nivel !== 'aviso');
  }

  /** Los avisos de contexto, que se paran al lado del jugador. */
  function soloAvisos(alertas) {
    return (alertas || []).filter(a => a.nivel === 'aviso');
  }

  /** Lo que haya pendiente sobre UN jugador, para pintarlo en su ficha. */
  function pendienteDe(alertas, clave) {
    const suyas = (alertas || []).filter(a => a.clave === clave);
    if (!suyas.length) return null;
    /* Si tiene las dos cosas manda la que pide decisión. */
    return suyas.find(a => a.nivel !== 'aviso') || suyas[0];
  }

  function resumen(mapa, alertas) {
    const cuenta = {};
    ESTADOS.forEach(e => { cuenta[e.id] = 0; });
    Object.keys(mapa || {}).forEach(k => {
      const r = registroDe(mapa, k);
      if (cuenta[r.estado] !== undefined) cuenta[r.estado]++;
    });
    const porTipo = {};
    (alertas || []).forEach(a => { porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1; });
    return {
      porEstado: cuenta,
      /* El badge de la campana cuenta las que piden DECISIÓN. Los avisos
         se muestran, pero no inflan un número que el DT lee como
         "tenés esto sin contestar". */
      alertas: soloAlertas(alertas).length,
      avisos: soloAvisos(alertas).length,
      porTipo: porTipo,
      marcadosPorUsuario: Object.keys(mapa || {})
        .filter(k => registroDe(mapa, k).origen === 'usuario').length,
    };
  }

  return {
    ESTADOS, POR_ID, DEFECTO, estado,
    RACHA_INACTIVIDAD, RACHA_AVISO, MIN_PJ_PREVIOS, MIN_MINUTOS_PREVIOS,
    claveJugador, claveAlmacen, leerTodos, guardarTodos,
    registroDe, aplicar, fusionarDeteccion, enPlan, enMedianas,
    detectarInactividad, detectarTraspasos, detectarReingresos, detectarAlertas, resumen,
    filtrarRespondidas, combinarAlertas,
    soloAlertas, soloAvisos, pendienteDe,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_ESTADOS;
