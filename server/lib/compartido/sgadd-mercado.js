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
  /* LA ESCALA DE PUESTOS · 1 | 1-2 | 2 | 2-3 | 3 | 3-4 | 4 | 4-5 | 5

     Un puesto HÍBRIDO no es un sexto puesto: es un jugador que cubre los
     dos. El PRIMER número es su puesto principal y el segundo su FACETA
     SECUNDARIA —la misma idea que los secundarios del rol funcional
     (punto 46)—, y el buscador lo trata igual: «puesto 3» encuentra a los
     2-3, 3 y 3-4 si se cuentan las facetas secundarias, y solo a los 3 y
     3-4 (principal 3) si no. Solo se combinan puestos VECINOS: un «1-3» no
     describe a nadie que la escala no describa mejor. */
  const PUESTOS = [
    { n: 1, label: 'Base' }, { n: 2, label: 'Escolta' }, { n: 3, label: 'Alero' },
    { n: 4, label: 'Ala pívot' }, { n: 5, label: 'Pívot' },
  ];
  const POSICIONES = [];
  PUESTOS.forEach((p, i) => {
    POSICIONES.push({ id: String(p.n), label: p.label, cubre: [p.n], principal: p.n, hibrido: false });
    const sig = PUESTOS[i + 1];
    if (sig) {
      POSICIONES.push({ id: p.n + '-' + sig.n, label: p.label + ' / ' + sig.label,
        cubre: [p.n, sig.n], principal: p.n, hibrido: true });
    }
  });
  const POR_POSICION = {};
  POSICIONES.forEach(p => { POR_POSICION[p.id] = p; });

  /* Las fichas cargadas con la escala vieja (nombres) se leen igual: el
     nombre es su número, y un nombre + secundaria VECINA es el híbrido. */
  const LEGADO = { BASE: 1, ESCOLTA: 2, ALERO: 3, 'ALA-PIVOTE': 4, PIVOTE: 5 };

  /** El id de la escala para lo que venga escrito: «2-3», «2/3», «3-2»,
      «ALERO»… `null` si no hay puesto; `false` si no es de la escala. */
  function idPosicion(v, secundaria) {
    const t = String(v === undefined || v === null ? '' : v).trim().toUpperCase().replace(/\s+/g, '');
    if (!t) return null;
    if (LEGADO[t]) {
      const n = LEGADO[t];
      const s = secundaria ? (LEGADO[String(secundaria).trim().toUpperCase()] || Number(secundaria)) : null;
      if (s && Math.abs(s - n) === 1) return Math.min(n, s) + '-' + Math.max(n, s);
      return String(n);
    }
    const nums = t.replace(/[–/]/g, '-').split('-').map(Number);
    if (!nums.length || nums.length > 2 || nums.some(x => !(x >= 1 && x <= 5) || Math.floor(x) !== x)) return false;
    if (nums.length === 1) return String(nums[0]);
    const a = Math.min(nums[0], nums[1]), b = Math.max(nums[0], nums[1]);
    if (a === b) return String(a);
    return (b - a === 1) ? a + '-' + b : false;
  }

  /** Qué puestos cubre una posición de la ficha. Vacío si no hay. */
  function cubre(posicion) {
    const p = POR_POSICION[posicion];
    return p ? p.cubre.slice() : [];
  }

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

    /* Un solo campo con la escala de nueve: el híbrido YA dice cuál es la
       faceta secundaria. `secundaria` se acepta solo para leer las fichas
       de la escala vieja, y se pliega al híbrido si es vecina. */
    const pos = idPosicion(r.posicion, r.secundaria);
    if (pos === false) {
      return { error: 'POSICION', mensaje: 'El puesto va en la escala 1 | 1-2 | 2 | 2-3 | 3 | 3-4 | 4 | 4-5 | 5.' };
    }
    if (pos) out.posicion = pos;

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
    /* EL VOLUMEN DE TIRO. Un 45 % de triple sobre 0,8 intentos por partido
       y sobre 7 no es el mismo tirador: el porcentaje sin el volumen
       promete lo que la muestra no sostiene. Por partido (de `PROMEDIOS J`)
       y en el TOTAL del tramo (de `ACUMULADO J`, el `__acum` del índice):
       el total es el tamaño de la muestra, que es lo que se pregunta antes
       de creerle a un porcentaje. Los totales no tienen percentil. */
    { id: 'TCI', grupo: 'Volumen de tiro' }, { id: 'T2I', grupo: 'Volumen de tiro' },
    { id: 'T3I', grupo: 'Volumen de tiro' }, { id: 'T1I', grupo: 'Volumen de tiro' },
    { id: 'tot:TCI', grupo: 'Volumen de tiro', label: 'Tiros de campo int. (total)', total: true },
    { id: 'tot:T3I', grupo: 'Volumen de tiro', label: 'Triples int. (total)', total: true },
    { id: 'tot:T1I', grupo: 'Volumen de tiro', label: 'Libres int. (total)', total: true },
  ];
  const IDS_FILTRO = METRICAS_FILTRO.map(m => m.id);

  /* EL ORDEN DE LA LISTA «CONTRA SU ZONA», de lo general a lo particular:
     cuánto juega, qué tan bien convierte, cuánto tira, cuánto crea y
     cuánto pelea. Lo leen la Radiografía, su PDF y Comparar: con un orden
     por pantalla, el mismo jugador se leería distinto en cada una. */
  const GRUPOS_METRICAS = ['Volumen', 'Eficiencia', 'Volumen de tiro', 'Creación', 'Rebote y defensa'];

  /**
   * Las métricas del filtro agrupadas en ese orden: `[{grupo, ids}]`.
   * Sin `conTotales`, los totales del tramo no van (no tienen percentil).
   * Un grupo que no esté en la lista va al final, no se pierde.
   */
  function metricasPorGrupo(conTotales) {
    const por = {};
    METRICAS_FILTRO.forEach(m => {
      if (m.total && !conTotales) return;
      (por[m.grupo] = por[m.grupo] || []).push(m.id);
    });
    const orden = GRUPOS_METRICAS.filter(g => por[g])
      .concat(Object.keys(por).filter(g => GRUPOS_METRICAS.indexOf(g) === -1));
    return orden.map(g => ({ grupo: g, ids: por[g] }));
  }

  /* Las cuatro familias de tiro, con sus columnas: convertidos, intentados
     y el acierto. Es lo que pinta «5,2/11,4» al lado de cada porcentaje. */
  const VOLUMEN_TIRO = [
    { id: 'TC', label: 'Campo', conv: 'TCC', int: 'TCI', pct: 'TC%' },
    { id: 'T2', label: 'Dobles', conv: 'T2C', int: 'T2I', pct: 'T2%' },
    { id: 'T3', label: 'Triples', conv: 'T3C', int: 'T3I', pct: 'T3%' },
    { id: 'T1', label: 'Libres', conv: 'T1C', int: 'T1I', pct: 'T1%' },
  ];
  /* Las columnas que la UI tiene que leer por jugador para el volumen,
     además de las del filtro. */
  const COLUMNAS_VOLUMEN = [];
  VOLUMEN_TIRO.forEach(v => { COLUMNAS_VOLUMEN.push(v.conv, v.int); });

  /**
   * La familia de tiro de CAMPO con más intentos: 'T2' o 'T3'. Los libres
   * no cuentan (no son tiro de campo). Con empate gana el doble —es el
   * tiro que define el perfil de uno que no se decide por el triple— y
   * sin intentos de campo, `null`: no hay perfil de tiro que decir.
   */
  function tiroPredominante(fila) {
    if (!fila) return null;
    const n = (k) => (typeof fila[k] === 'number' && isFinite(fila[k])) ? fila[k] : 0;
    const t2 = n('T2I'), t3 = n('T3I');
    if (t2 <= 0 && t3 <= 0) return null;
    return t3 > t2 ? 'T3' : 'T2';
  }

  /** Un número con coma decimal, como el resto del panel. */
  function decimal(v, dec) {
    return (Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec)).toFixed(dec).replace('.', ',');
  }

  /**
   * «convertidos/intentados»: `5,2/11,4` por partido, `166/365` en el
   * total. `null` si falta cualquiera de los dos — un «—/11,4» se leería
   * como cero convertidos. Sin intentos, `0/0`: no tiró, y eso es un dato.
   */
  function textoVolumen(conv, int, dec) {
    if (typeof conv !== 'number' || !isFinite(conv) || typeof int !== 'number' || !isFinite(int)) return null;
    const d = typeof dec === 'number' ? dec : 1;
    return decimal(conv, d) + '/' + decimal(int, d);
  }

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
      /* PUESTOS: se piden en la escala SIMPLE (1 a 5). Un híbrido calza
         por su principal y —si se cuentan las facetas secundarias, que es
         el defecto— también por su segundo puesto: un 2-3 aparece pidiendo
         escoltas y pidiendo aleros. */
      if (c.posiciones && c.posiciones.length) {
        if (!fi.posicion) falta = true;
        else {
          const p = POR_POSICION[fi.posicion];
          const propios = !p ? [] : (c.puestosSecundarios === false ? [p.principal] : p.cubre);
          if (!c.posiciones.some(x => propios.indexOf(Number(x)) !== -1)) return;
        }
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

  /* ------------------------------------------------------------------
     EL PERÍODO · fases y fechas (punto 90)

     El recorte temporal NO recalcula nada acá: deja solo los partidos del
     período en `Base Datos E` y `Base Datos J`, y el índice los
     reconstruye con el MISMO motor del TOTAL (punto 3 ter) —volumen
     sumado y dividido por PJ, tasas sobre los totales—. Un segundo cálculo
     de tasas terminaría distinto del de la ficha (punto 8).

     Medido contra la demo antes de escribirlo: reconstruido desde el log
     sin recortar, los 124 calificados coinciden con `PROMEDIOS J` (<1 %)
     en PJ, MIN, PTS, PLAYS, TS%, eFG%, USG%, T3I, PPP, RTL%, PR y PePP%.
     ------------------------------------------------------------------ */

  /** `YYYY-MM-DD` local de una fecha, o null. */
  function diaIso(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;

  /** ¿El período pide algo además del tramo? */
  function hayFechas(p) {
    return !!(p && ((p.desde && DIA_VALIDO.test(p.desde)) || (p.hasta && DIA_VALIDO.test(p.hasta))));
  }

  /**
   * Deja en `Base Datos E` y `Base Datos J` solo los partidos del período.
   *
   * `periodo` = { fase, torneo, desde, hasta } (días `YYYY-MM-DD`, ambos
   * inclusive; `torneo` null, GENERAL o `*TOTAL*` = toda la fase).
   * `dep` = { fecha: v → Date|null, texto: v → string }, las del núcleo: este
   * archivo no lo requiere para seguir siendo puro.
   *
   * UNA FILA DE JUGADOR SIN FECHA se ubica por su PARTIDO, si ese texto
   * tiene UNA sola fecha en `Base Datos E`. Si tiene dos (ida y vuelta con
   * el mismo local) no se puede saber de qué noche es y QUEDA AFUERA: es la
   * regla del dato inventado, y se cuenta en `sinFecha`.
   *
   * Devuelve { hojas, partidos, sinFecha, rango: [primerDía, últimoDía] }.
   */
  function recortarHojas(hojas, periodo, dep) {
    const p = periodo || {};
    const fecha = dep && dep.fecha, texto = (dep && dep.texto) || (v => String(v === undefined || v === null ? '' : v).trim());
    const fase = p.fase ? String(p.fase).toUpperCase() : null;
    const tor = p.torneo ? String(p.torneo).toUpperCase() : null;
    const filtraTorneo = !!(tor && tor !== 'GENERAL' && tor !== '*TOTAL*');
    const desde = (p.desde && DIA_VALIDO.test(p.desde)) ? p.desde : null;
    const hasta = (p.hasta && DIA_VALIDO.test(p.hasta)) ? p.hasta : null;

    const dia = (v) => { const d = fecha ? fecha(v) : null; return diaIso(d); };
    const enFaseYTorneo = (f) => {
      const ff = texto(f['FASE']).toUpperCase();
      if (fase && ff && ff !== fase) return false;
      if (filtraTorneo) {
        const tt = texto(f['TORNEO']).toUpperCase();
        if (tt && tt !== tor) return false;
      }
      return true;
    };
    const enRango = (d) => !!d && (!desde || d >= desde) && (!hasta || d <= hasta);

    const E = hojas && hojas['Base Datos E'];
    const J = hojas && hojas['Base Datos J'];
    const fechasDePartido = new Map();   // texto del PARTIDO -> Set de días
    const filasE = [];
    const partidos = new Set();
    let primero = null, ultimo = null;
    ((E && E.filas) || []).forEach(f => {
      if (!enFaseYTorneo(f)) return;
      const d = dia(f['FECHA']);
      const k = texto(f['PARTIDO']).toUpperCase();
      if (k && d) {
        if (!fechasDePartido.has(k)) fechasDePartido.set(k, new Set());
        fechasDePartido.get(k).add(d);
      }
      if (!enRango(d) && (desde || hasta)) return;
      if (!d && (desde || hasta)) return;
      filasE.push(f);
      partidos.add((d || '') + '|' + k);
      if (d && (!primero || d < primero)) primero = d;
      if (d && (!ultimo || d > ultimo)) ultimo = d;
    });

    let sinFecha = 0;
    const filasJ = [];
    ((J && J.filas) || []).forEach(f => {
      if (!enFaseYTorneo(f)) return;
      let d = dia(f['FECHA']);
      if (!d) {
        const set = fechasDePartido.get(texto(f['PARTIDO']).toUpperCase());
        if (set && set.size === 1) d = Array.from(set)[0];
      }
      if (desde || hasta) {
        if (!d) { sinFecha++; return; }
        if (!enRango(d)) return;
      }
      filasJ.push(f);
    });

    return {
      hojas: {
        'Base Datos E': { cols: (E && E.cols) || [], filas: filasE },
        'Base Datos J': { cols: (J && J.cols) || [], filas: filasJ },
      },
      partidos: partidos.size, sinFecha: sinFecha, rango: [primero, ultimo],
    };
  }

  /** El rótulo de un tramo del núcleo: «IDA · REGULAR», «Total · REGULAR», «REGULAR». */
  function etiquetaTramo(t) {
    if (!t) return '';
    const tor = String(t.torneo || '').toUpperCase();
    if (!tor || tor === 'GENERAL') return String(t.fase || '');
    if (tor === '*TOTAL*') return 'Total · ' + t.fase;
    return t.torneo + ' · ' + t.fase;
  }

  return {
    diaIso, hayFechas, recortarHojas, etiquetaTramo,
    SERVICIO, PUESTOS, POSICIONES, POR_POSICION, TALLA_MIN, TALLA_MAX, CLAVE_VALIDA,
    idPosicion, cubre, normalizarFicha, edad,
    VOLUMEN_TIRO, COLUMNAS_VOLUMEN, textoVolumen, tiroPredominante, GRUPOS_METRICAS, metricasPorGrupo,
    torneosDelCatalogo, torneosHabilitados, normalizarEmail, normalizarHabilitacion,
    METRICAS_FILTRO, IDS_FILTRO, EJES_RADAR, ejesRadar,
    filtrar, ordenar, mejorPorMetrica,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_MERCADO;
