/* ARCHIVO GENERADO · NO EDITAR ACÁ.
 *
 * Copia mecánica de js/sgadd-mercado.js, que es la fuente de verdad.
 * Existe porque Vercel despliega con raíz en `server/` y no sube el
 * resto del repo. Para regenerar:
 *
 *     node server/bin/sincronizar-compartido.js
 *
 * `test-backend.js` falla si este archivo difiere del original.
 */
/* =====================================================================
   SGADD · MERCADO DE FICHAJES · el motor puro (punto 87)

   La sección Fichajes busca jugadores en TODO un torneo —todas sus zonas,
   sin el recorte por equipo— y devuelve su Radiografía ADN. Este archivo
   es la parte sin `document`: el vocabulario de la ficha manual, quién
   está habilitado, los filtros, el orden y los ejes del radar. La UI vive
   en `sgadd-fichajes.js`; el servidor copia ESTE archivo a
   `server/lib/compartido/` y valida con las mismas funciones con las que
   el navegador filtra.

   LO QUE NO HACE: calcular el ADN. Eso es `jugadoresADN()` y vive en
   `sgadd-jugadores.js` (punto 8: un solo motor por taxonomía). La UI le
   pasa a este motor las filas ya etiquetadas.

   ---------------------------------------------------------------------
   EDAD, POSICIÓN Y TALLA · la ficha manual

   La planilla no las trae (punto 9, «Lo que la planilla NO tiene») y no
   se estiman: el scouting dejó de sugerir nombres justamente porque la
   aproximación de biotipo fallaba en uno de cada doce cruces. Se cargan a
   mano, por jugador, en un hash de KV por torneo. Un filtro por edad deja
   AFUERA a quien no tiene el dato, y la pantalla dice cuántos quedaron
   afuera por eso: un jugador sin ficha no es un jugador que no cumple.
   ===================================================================== */

const SGADD_MERCADO = (function () {
  'use strict';

  const SERVICIO = 'fichajes';

  /* ------------------------------------------------------------------
     LA FICHA MANUAL
     ------------------------------------------------------------------ */
  const POSICIONES = [
    { id: 'BASE', label: 'Base', corto: '1' },
    { id: 'ESCOLTA', label: 'Escolta', corto: '2' },
    { id: 'ALERO', label: 'Alero', corto: '3' },
    { id: 'ALA-PIVOTE', label: 'Ala pívot', corto: '4' },
    { id: 'PIVOTE', label: 'Pívot', corto: '5' },
  ];
  const POR_POSICION = {};
  POSICIONES.forEach(p => { POR_POSICION[p.id] = p; });

  const TALLA_MIN = 150, TALLA_MAX = 235;
  const ANIO_MIN = 1950;

  /* La clave del jugador es la del resto del panel: NOMBRE|EQUIPO. */
  const CLAVE_VALIDA = /^[^|]{1,120}\|[^|]{1,120}$/;

  function hoyLocal(hoy) { return hoy instanceof Date ? hoy : new Date(); }

  /**
   * Lo que se guarda de un jugador, validado. Devuelve `null` si no queda
   * ningún dato: una ficha vacía no se guarda, se borra el campo.
   *
   * El nacimiento puede ser el AÑO solo (`1998`): es lo que suele saber un
   * entrenador, y exigir el día haría que no se cargue nada. La edad sale
   * entonces marcada como aproximada.
   */
  function normalizarFicha(r, hoy) {
    if (!r || typeof r !== 'object') return null;
    const h = hoyLocal(hoy);
    const out = {};

    const nac = String(r.nacimiento || '').trim();
    if (nac) {
      const m = /^(\d{4})(?:-(\d{2})-(\d{2}))?$/.exec(nac);
      if (!m) return { error: 'NACIMIENTO', mensaje: 'La fecha de nacimiento va como AAAA o AAAA-MM-DD.' };
      const anio = Number(m[1]);
      if (anio < ANIO_MIN || anio > h.getFullYear() - 10) {
        return { error: 'NACIMIENTO', mensaje: 'El año de nacimiento no es plausible.' };
      }
      if (m[2]) {
        const d = new Date(anio, Number(m[2]) - 1, Number(m[3]));
        if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
          return { error: 'NACIMIENTO', mensaje: 'Esa fecha no existe.' };
        }
      }
      out.nacimiento = nac;
    }

    const pos = String(r.posicion || '').trim().toUpperCase();
    if (pos) {
      if (!POR_POSICION[pos]) return { error: 'POSICION', mensaje: 'Posición desconocida.' };
      out.posicion = pos;
    }
    const sec = String(r.secundaria || '').trim().toUpperCase();
    if (sec) {
      if (!POR_POSICION[sec]) return { error: 'POSICION', mensaje: 'Posición secundaria desconocida.' };
      if (sec !== out.posicion) out.secundaria = sec;
    }

    if (r.talla !== undefined && r.talla !== null && String(r.talla).trim() !== '') {
      const t = Math.round(Number(String(r.talla).replace(',', '.')));
      if (!isFinite(t) || t < TALLA_MIN || t > TALLA_MAX) {
        return { error: 'TALLA', mensaje: 'La talla va en centímetros, entre ' + TALLA_MIN + ' y ' + TALLA_MAX + '.' };
      }
      out.talla = t;
    }

    return Object.keys(out).length ? out : null;
  }

  /** Edad cumplida a `hoy`. Con el año solo, aproximada (puede ser uno menos). */
  function edad(nacimiento, hoy) {
    const m = /^(\d{4})(?:-(\d{2})-(\d{2}))?$/.exec(String(nacimiento || ''));
    if (!m) return null;
    const h = hoyLocal(hoy);
    let anios = h.getFullYear() - Number(m[1]);
    if (!m[2]) return { anios: anios, aproximada: true };
    const mes = Number(m[2]) - 1, dia = Number(m[3]);
    if (h.getMonth() < mes || (h.getMonth() === mes && h.getDate() < dia)) anios--;
    return { anios: anios, aproximada: false };
  }

  /* ------------------------------------------------------------------
     QUIÉN ENTRA · el padrón
     ------------------------------------------------------------------ */

  /** Los torneos de un catálogo, con sus zonas. Solo `tipo: 'torneo'`. */
  function torneosDelCatalogo(catalogo) {
    const out = [];
    Object.keys(catalogo || {}).forEach(id => {
      const t = catalogo[id];
      if (!t || t.tipo !== 'torneo') return;
      out.push(id);
    });
    return out.sort();
  }

  /**
   * Los torneos que ve una sesión. El ADMIN, todos. Cualquier otro, los de
   * su registro en el padrón QUE EXISTAN: un torneo dado de baja no se
   * sigue ofreciendo aunque quede escrito en el registro.
   *
   * Sin registro, o con `torneos: []`, nada. No hay default permisivo:
   * esta es una lista de permitidos, como los admins (punto 19).
   */
  function torneosHabilitados(catalogo, esAdmin, registro) {
    const todos = torneosDelCatalogo(catalogo);
    if (esAdmin) return todos;
    const pedidos = (registro && Array.isArray(registro.torneos)) ? registro.torneos : [];
    return todos.filter(id => pedidos.indexOf(id) !== -1);
  }

  /* El mismo normalizador que la lista de admins: mayúsculas y espacios,
     NADA más (punto 19 — toda normalización de más ensancha quién entra). */
  function normalizarEmail(v) {
    return String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  }
  const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /** Lo que entra al padrón, validado contra el catálogo. */
  function normalizarHabilitacion(pedido, catalogo) {
    const p = pedido || {};
    const email = normalizarEmail(p.email);
    if (!EMAIL_VALIDO.test(email)) return { error: 'EMAIL', mensaje: 'El mail no es válido.' };
    const existentes = torneosDelCatalogo(catalogo);
    const crudos = Array.isArray(p.torneos) ? p.torneos : [];
    const torneos = [];
    for (let i = 0; i < crudos.length; i++) {
      const id = String(crudos[i] || '').trim().toLowerCase();
      if (!id) continue;
      if (existentes.indexOf(id) === -1) return { error: 'TORNEO', mensaje: 'El torneo «' + id + '» no existe.' };
      if (torneos.indexOf(id) === -1) torneos.push(id);
    }
    const nota = p.nota ? String(p.nota).trim().slice(0, 140) : null;
    return { email: email, registro: { torneos: torneos.sort(), nota: nota } };
  }

  /* ------------------------------------------------------------------
     LA BÚSQUEDA
     ------------------------------------------------------------------ */

  /* Las métricas por las que se puede filtrar y ordenar. Son de las 59 de
     `SGADD.METRICAS` —la UI saca de ahí el label, el formato y si es
     invertida—, elegidas por lo que pregunta quien sale a buscar un
     jugador: cuánto juega, cuánto produce, con qué eficiencia, cuánto
     crea, cuánto cuida la pelota y cuánto pelea. */
  const METRICAS_FILTRO = [
    { id: 'MIN', grupo: 'Volumen' }, { id: 'PJ', grupo: 'Volumen' },
    { id: 'PTS', grupo: 'Volumen' }, { id: 'PLAYS', grupo: 'Volumen' },
    { id: 'USG%', grupo: 'Volumen' },
    { id: 'TS%', grupo: 'Eficiencia' }, { id: 'eFG%', grupo: 'Eficiencia' },
    { id: 'PPP', grupo: 'Eficiencia' }, { id: 'T3%', grupo: 'Eficiencia' },
    { id: 'T1%', grupo: 'Eficiencia' }, { id: 'PT3%', grupo: 'Eficiencia' },
    { id: 'RTL%', grupo: 'Eficiencia' },
    { id: 'AST-PP', grupo: 'Creación' }, { id: 'AST%', grupo: 'Creación' },
    { id: 'AST', grupo: 'Creación' }, { id: 'PePP%', grupo: 'Creación' },
    { id: 'RO%', grupo: 'Rebote y defensa' }, { id: 'RD%', grupo: 'Rebote y defensa' },
    { id: 'RT', grupo: 'Rebote y defensa' }, { id: 'PR', grupo: 'Rebote y defensa' },
    { id: '+/-', grupo: 'Rebote y defensa' },
  ];
  const IDS_FILTRO = METRICAS_FILTRO.map(m => m.id);

  /**
   * Los EJES DEL RADAR · lo que el jugador es, en ocho direcciones.
   *
   * Cada eje es el PROMEDIO de los percentiles de sus métricas contra su
   * propia zona (el percentil ya da vuelta las invertidas: menos pérdidas
   * es más arriba). Un eje sin ningún percentil queda en `null` y se
   * dibuja como hueco, no como cero: un jugador sin muestra no es malo en
   * todo, es alguien de quien no se sabe.
   */
  const EJES_RADAR = [
    { id: 'anotacion', label: 'Anotación', metricas: ['PTS', 'PLAYS'] },
    { id: 'eficiencia', label: 'Eficiencia', metricas: ['TS%', 'eFG%', 'PPP'] },
    { id: 'exterior', label: 'Tiro exterior', metricas: ['T3%', 'PT3%'] },
    { id: 'contacto', label: 'Llega al libre', metricas: ['RTL%', 'T1%'] },
    { id: 'creacion', label: 'Creación', metricas: ['AST-PP', 'AST%'] },
    { id: 'cuidado', label: 'Cuida la pelota', metricas: ['PePP%'] },
    { id: 'rebote', label: 'Rebote', metricas: ['RO%', 'RD%'] },
    { id: 'recupero', label: 'Recupero', metricas: ['PR'] },
  ];

  /** Los ejes de UNA fila: `{id, label, valor|null}`. `pc` = {métrica: percentil}. */
  function ejesRadar(pc) {
    return EJES_RADAR.map(e => {
      const vals = e.metricas.map(k => pc && pc[k]).filter(v => typeof v === 'number' && isFinite(v));
      return { id: e.id, label: e.label,
        valor: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
    });
  }

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function enLista(lista, v) { return !lista || !lista.length || lista.indexOf(v) !== -1; }
  function sinAcentos(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /**
   * Filtra las filas del mercado.
   *
   * Una FILA es lo que arma la UI por jugador:
   *   { clave, nombre, equipo, zona, califica,
   *     rol, jerarquia, rolMinutos, arquetipos: [ids], origen,
   *     m: {métrica: valor}, pc: {métrica: percentil|null},
   *     ficha: {edad, posicion, secundaria, talla} | null }
   *
   * Devuelve `{ filas, sinDato }`: `sinDato` cuenta a los que quedaron
   * afuera SOLO porque les faltaba el dato que se pidió (edad, posición,
   * talla o una métrica sin valor). La pantalla lo dice con ese número.
   *
   * `rangos` filtra sobre el VALOR, no sobre el percentil, salvo que se
   * pida `{ pc: true }`: «TS% ≥ 55» es lo que escribe un entrenador, y
   * «en el 20 % de arriba de su zona» es la otra pregunta, igual de útil.
   */
  function filtrar(filas, criterios) {
    const c = criterios || {};
    const q = sinAcentos(c.texto).trim();
    const out = [];
    let sinDato = 0;
    (filas || []).forEach(f => {
      if (q && sinAcentos(f.nombre).indexOf(q) === -1 && sinAcentos(f.equipo).indexOf(q) === -1) return;
      if (c.soloCalificados && !f.califica) return;
      if (!enLista(c.zonas, f.zona)) return;
      if (!enLista(c.equipos, f.equipo)) return;
      if (c.roles && c.roles.length && c.roles.indexOf(f.rol) === -1
          && !(c.incluirSecundarios && (f.secundarios || []).some(s => c.roles.indexOf(s) !== -1))) return;
      if (!enLista(c.jerarquias, f.jerarquia)) return;
      if (!enLista(c.rolesMinutos, f.rolMinutos)) return;
      if (c.origen && f.origen !== c.origen) return;
      /* Arquetipos: los pedidos TODOS (es un perfil, no un menú). */
      if (c.arquetipos && c.arquetipos.length
          && !c.arquetipos.every(a => (f.arquetipos || []).indexOf(a) !== -1)) return;

      let falta = false;
      const fi = f.ficha || {};
      if (c.posiciones && c.posiciones.length) {
        if (!fi.posicion) falta = true;
        else if (c.posiciones.indexOf(fi.posicion) === -1 && c.posiciones.indexOf(fi.secundaria) === -1) return;
      }
      const rango = (v, r) => {
        if (!r || (r.min === undefined && r.max === undefined) ||
            (r.min === null && r.max === null)) return true;
        if (v === null) { falta = true; return true; }
        if (typeof r.min === 'number' && v < r.min) return false;
        if (typeof r.max === 'number' && v > r.max) return false;
        return true;
      };
      if (!rango(fi.edad !== undefined ? num(fi.edad) : null, c.edad)) return;
      if (!rango(fi.talla !== undefined ? num(fi.talla) : null, c.talla)) return;
      const rangos = c.rangos || {};
      for (const k of Object.keys(rangos)) {
        const r = rangos[k];
        const v = r && r.pc ? num((f.pc || {})[k]) : num((f.m || {})[k]);
        if (!rango(v, r)) return;
      }
      if (falta) { sinDato++; return; }
      out.push(f);
    });
    return { filas: out, sinDato: sinDato };
  }

  /**
   * Ordena por una métrica (o por `nombre`). Los que no tienen el valor
   * van SIEMPRE al final, en las dos direcciones: un vacío arriba de todo
   * en orden ascendente parecería el mejor.
   *
   * `invertida` lo decide el que llama —sale de `SGADD.METRICAS`—, y solo
   * cambia la dirección por defecto: «mejor primero».
   */
  function ordenar(filas, por, dir) {
    const d = dir === 'asc' ? 1 : -1;
    const lista = (filas || []).slice();
    if (por === 'nombre') {
      return lista.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)) * (dir === 'desc' ? -1 : 1));
    }
    const leer = (f) => {
      if (por && por.indexOf('pc:') === 0) return num((f.pc || {})[por.slice(3)]);
      if (por === 'edad' || por === 'talla') return num((f.ficha || {})[por]);
      return num((f.m || {})[por]);
    };
    return lista.sort((a, b) => {
      const va = leer(a), vb = leer(b);
      if (va === null && vb === null) return String(a.nombre).localeCompare(String(b.nombre));
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va === vb) return String(a.nombre).localeCompare(String(b.nombre));
      return (va - vb) * d;
    });
  }

  /**
   * La comparación de dos a cuatro jugadores: por métrica, quién está
   * mejor. Se compara por PERCENTIL contra su propia zona cuando los dos
   * lo tienen, porque dos zonas son dos ligas: 14 puntos en la Norte y 14
   * en la Sur no valen lo mismo si las ligas no anotan lo mismo.
   */
  function mejorPorMetrica(filas, metricas, invertidas) {
    const out = {};
    (metricas || []).forEach(k => {
      const inv = !!(invertidas && invertidas[k]);
      let mejor = null, valorMejor = null, porPc = true;
      const pcs = filas.map(f => num((f.pc || {})[k]));
      if (pcs.some(v => v === null)) porPc = false;
      filas.forEach((f, i) => {
        const v = porPc ? pcs[i] : num((f.m || {})[k]);
        if (v === null) return;
        const gana = valorMejor === null || (porPc || !inv ? v > valorMejor : v < valorMejor);
        if (gana) { valorMejor = v; mejor = i; }
      });
      out[k] = { indice: mejor, porPercentil: porPc };
    });
    return out;
  }

  return {
    SERVICIO, POSICIONES, POR_POSICION, TALLA_MIN, TALLA_MAX, CLAVE_VALIDA,
    normalizarFicha, edad,
    torneosDelCatalogo, torneosHabilitados, normalizarEmail, normalizarHabilitacion,
    METRICAS_FILTRO, IDS_FILTRO, EJES_RADAR, ejesRadar,
    filtrar, ordenar, mejorPorMetrica,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_MERCADO;
