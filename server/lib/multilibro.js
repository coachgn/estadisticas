/* =====================================================================
   multilibro.js · LOS LIBROS VINCULADOS DE UN TORNEO (punto 77)

   Un torneo tiene el libro de cada zona y, además, los libros de sus
   tramos siguientes: los playoffs interzonales, la permanencia, un
   repechaje. MotorStats escribe un libro por tramo —cada carpeta de Drive
   es un libro— y hasta acá un cliente solo leía el de su zona: los
   partidos de su equipo en cuartos vivían en un libro que no le llegaba
   nunca, y el panel los mostraba en «modo llave», sin estadísticas.

   ---------------------------------------------------------------------
   LA REGLA DE ACCESO ES POR PARTIDO, no por libro

   Un cliente ve las estadísticas de un partido de un libro vinculado si su
   equipo jugó ese partido —de local o de visitante— y NADA más de ese
   libro. El libro de la otra zona sigue sin llegarle entero (el 403 de
   `/api/v1/equipos` no se toca), pero sus partidos contra ese rival sí.

     maestras (Base Datos E, 4 FACTORES, Base Datos J)
        → solo las filas de los partidos donde jugó su equipo

     derivadas (PROMEDIOS/ACUMULADO de equipo, 4F y jugador)
        → solo las de un equipo cuyos partidos de esa fase fueron TODOS
          contra el suyo: en una serie es siempre el rival, y su promedio
          de la fase no contiene un solo partido ajeno
        → el propio equipo, siempre
        → las filas TIPO de la liga (la mediana): son una agregación de la
          fase, la misma clase de dato que la tabla, sin un solo partido
        → un rival que además jugó contra otros (una permanencia todos
          contra todos) pierde sus derivadas, y su promedio de equipo se
          RE-DERIVA acá de los partidos que sí se pueden ver, con el mismo
          motor que arma el TOTAL (punto 3 ter). Sus jugadores no: no hay
          de dónde sacarlos sin mezclar partidos ajenos

   Todo se fusiona en el libro de la zona ANTES del recorte por plan
   (`reglas.recortarLibro`), así que la hoja que el plan recorta —Base
   Datos J— se sigue recortando igual.

   ---------------------------------------------------------------------
   SIN DUPLICAR: el libro de la zona gana

   Si un partido está en los dos libros —MotorStats lo escribió también en
   el de la zona—, manda el de la zona. La clave es la del índice (FECHA +
   PARTIDO + EQUIPO, y + NOMBRES en las de jugador).

   PURO salvo `leerVinculados`, que recibe la función que lee un libro.
   ===================================================================== */
'use strict';

const CORE = require('./compartido/sgadd-core.js');

/** Los roles de un libro vinculado. `regular` es el de cada zona. */
const ROLES = ['regular', 'playoffs', 'permanencia', 'repechaje'];

const MAESTRAS = ['Base Datos E', '4 FACTORES', 'Base Datos J'];
const DERIVADAS = ['PROMEDIOS E', 'ACUMULADO E', 'PROMEDIOS 4F', 'ACUMULADO 4F', 'PROMEDIOS J', 'ACUMULADO J'];
const DE_EQUIPO = { 'PROMEDIOS E': 'promedios', 'PROMEDIOS 4F': 'factores' };

const txt = (v) => (v === null || v === undefined) ? '' : String(v).trim();
const may = (v) => txt(v).toUpperCase();
const clave = (v) => CORE.claveEquipo(v);

/** El rol de una zona de torneo: lo declarado, o `playoffs` si es la vieja `interzonal`. */
function rolDe(k) {
  const r = txt(k && k.rol).toLowerCase();
  if (ROLES.indexOf(r) !== -1) return r;
  return (k && k.interzonal) ? 'playoffs' : 'regular';
}

/**
 * Los libros vinculados que le tocan a la categoría de un cliente: los de
 * su torneo que no son una zona regular, con libro, y que declaran a su
 * zona entre las que participan (vacío = todas).
 */
function vinculadosDe(cat, clubId, slug) {
  const club = cat && cat[clubId];
  const k = club && club.categorias && club.categorias[slug];
  if (!k || !k.torneo || !k.zona) return [];
  const t = cat[k.torneo];
  if (!t || t.tipo !== 'torneo') return [];
  const out = [];
  Object.keys(t.categorias || {}).forEach((s) => {
    const z = t.categorias[s];
    if (!z || rolDe(z) === 'regular' || !z.sheetId) return;
    if (z.sheetId === k.sheetId) return;
    const part = Array.isArray(z.participan) ? z.participan : [];
    if (part.length && part.indexOf(k.zona) === -1) return;
    out.push({ slug: s, zona: z.zona || null, rol: rolDe(z), label: z.label || s, sheetId: z.sheetId });
  });
  return out.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
}

/* ------------------------------------------------------------ matrices */

function cabecera(m) { return (Array.isArray(m) && m[0]) ? m[0].map(txt) : []; }
function aObjeto(cab, fila) {
  const o = {};
  cab.forEach((c, i) => { o[c] = (fila && fila[i] !== undefined && fila[i] !== null) ? fila[i] : ''; });
  return o;
}
/** La fila de un libro reordenada a la cabecera de otro, por NOMBRE de columna. */
function reordenar(cabOrigen, fila, cabDestino) {
  const o = aObjeto(cabOrigen, fila);
  return cabDestino.map(c => (o[c] !== undefined ? o[c] : ''));
}

function idPartido(o) { return may(o.FECHA) + '|' + may(o.PARTIDO); }
function claveFila(hoja, o) {
  const base = MAESTRAS.indexOf(hoja) !== -1
    ? idPartido(o) + '|' + clave(o.EQUIPO)
    : may(o.FASE) + '|' + may(o.TORNEO) + '|' + clave(o.EQUIPO);
  return /J$/.test(hoja) ? base + '|' + may(o.NOMBRES) : base;
}
function esTipoDeLiga(o) {
  const eq = may(o.EQUIPO);
  return eq === '' || eq === 'EQUIPO TIPO';
}

/**
 * Lo que de un libro vinculado le corresponde a UN equipo.
 *
 * Devuelve, por hoja, los ÍNDICES de fila (1-based sobre la matriz) que se
 * conservan —los mismos para la vista numérica y la de texto—, más los
 * equipos «sucios» por fase (jugaron también contra otros) para
 * re-derivarlos.
 */
function filtrar(libro, equipoClave) {
  const hojas = (libro && libro.hojas) || {};
  const out = { indices: {}, partidos: 0, fases: [], sucios: [] };
  const bd = hojas['Base Datos E'];
  const cabBd = cabecera(bd);
  const permitidos = new Set();      // FECHA|PARTIDO
  const textos = new Set();          // PARTIDO, para las filas sin fecha
  const fases = new Set();
  (bd || []).slice(1).forEach((f) => {
    const o = aObjeto(cabBd, f);
    if (!equipoClave || clave(o.EQUIPO) !== equipoClave) return;
    permitidos.add(idPartido(o));
    textos.add(may(o.PARTIDO));
    fases.add(may(o.FASE));
  });
  out.partidos = permitidos.size;
  out.fases = Array.from(fases);

  /* Un equipo está LIMPIO en una fase si todos sus partidos de esa fase
     en este libro son partidos del equipo propio. */
  const limpio = {};
  (bd || []).slice(1).forEach((f) => {
    const o = aObjeto(cabBd, f);
    const k = clave(o.EQUIPO) + '|' + may(o.FASE) + '|' + may(o.TORNEO);
    const dentro = permitidos.has(idPartido(o));
    limpio[k] = (limpio[k] === undefined ? true : limpio[k]) && dentro;
  });
  const sucios = new Set();
  Object.keys(limpio).forEach((k) => {
    const [eq, fase] = k.split('|');
    if (!limpio[k] && fases.has(fase) && eq !== equipoClave) {
      /* Sucio pero RIVAL: jugó al menos un partido con el propio en esa fase. */
      const rival = (bd || []).slice(1).some((f) => {
        const o = aObjeto(cabBd, f);
        return clave(o.EQUIPO) === eq && may(o.FASE) === fase && permitidos.has(idPartido(o));
      });
      if (rival) sucios.add(eq + '|' + fase);
    }
  });
  out.sucios = Array.from(sucios).map((s) => { const p = s.split('|'); return { equipo: p[0], fase: p[1] }; });

  MAESTRAS.concat(DERIVADAS).forEach((h) => {
    const m = hojas[h];
    if (!Array.isArray(m) || !m.length) return;
    const cab = cabecera(m);
    const idx = [];
    for (let i = 1; i < m.length; i++) {
      const o = aObjeto(cab, m[i]);
      let va;
      if (MAESTRAS.indexOf(h) !== -1) {
        va = txt(o.FECHA) ? permitidos.has(idPartido(o)) : textos.has(may(o.PARTIDO));
      } else if (esTipoDeLiga(o)) {
        /* La mediana de la fase: solo si la fase es una donde jugó. */
        va = fases.has(may(o.FASE));
      } else {
        const k = clave(o.EQUIPO) + '|' + may(o.FASE) + '|' + may(o.TORNEO);
        va = fases.has(may(o.FASE)) && (clave(o.EQUIPO) === equipoClave || limpio[k] === true);
      }
      if (va) idx.push(i);
    }
    out.indices[h] = idx;
  });
  return out;
}

/**
 * Las filas de PROMEDIOS E y PROMEDIOS 4F de un rival «sucio», derivadas
 * de los partidos que el cliente puede ver. Mismo motor que el TOTAL.
 */
function rederivar(libro, f, cabeceras) {
  if (!f.sucios.length) return {};
  const DATOS = require('./compartido/sgadd-data.js');
  const hojas = {};
  MAESTRAS.forEach((h) => {
    const m = (libro.hojas || {})[h];
    if (!Array.isArray(m) || !m.length) return;
    hojas[h] = DATOS.matrizAFilas([m[0]].concat((f.indices[h] || []).map(i => m[i])));
  });
  const out = {};
  const porFase = {};
  f.sucios.forEach((s) => { (porFase[s.fase] = porFase[s.fase] || []).push(s.equipo); });
  Object.keys(porFase).forEach((fase) => {
    let idx;
    try { idx = CORE.construirIndice(hojas, { fase: fase, torneo: CORE.TORNEO_TOTAL || '*TOTAL*' }); }
    catch (e) { return; }
    porFase[fase].forEach((eq) => {
      const e = idx.get ? idx.get(eq) : null;
      if (!e) return;
      const torneo = ((hojas['Base Datos E'] || {}).filas || [])
        .find(o => clave(o.EQUIPO) === eq && may(o.FASE) === fase);
      Object.keys(DE_EQUIPO).forEach((h) => {
        const datos = e[DE_EQUIPO[h]];
        const cab = cabeceras[h];
        if (!datos || !cab || !cab.length) return;
        const o = Object.assign({}, datos, { EQUIPO: (torneo && torneo.EQUIPO) || e.nombre, FASE: fase,
          TORNEO: (torneo && torneo.TORNEO) || '' });
        (out[h] = out[h] || []).push(cab.map(c => (o[c] !== undefined && o[c] !== null) ? o[c] : ''));
      });
    });
  });
  return out;
}

/**
 * Fusiona en el libro de la zona lo que de cada vinculado le toca al
 * equipo. No modifica los libros de entrada (el de Google viene cacheado).
 */
function fusionar(principal, vinculados, equipoClave) {
  const hojas = Object.assign({}, (principal && principal.hojas) || {});
  const texto = Object.assign({}, (principal && principal.hojasTexto) || {});
  const info = [];
  const vistos = {};
  Object.keys(hojas).forEach((h) => {
    const m = hojas[h];
    const cab = cabecera(m);
    vistos[h] = new Set((m || []).slice(1).map(f => claveFila(h, aObjeto(cab, f))));
  });

  (vinculados || []).forEach((v) => {
    const libro = v.libro;
    if (!libro || !libro.hojas) return;
    const f = filtrar(libro, equipoClave);
    info.push({ slug: v.slug, label: v.label, rol: v.rol, partidos: f.partidos, fases: f.fases });
    if (!f.partidos) return;

    const cabeceras = {};
    MAESTRAS.concat(DERIVADAS).forEach((h) => {
      const m = libro.hojas[h];
      cabeceras[h] = (hojas[h] && hojas[h].length) ? cabecera(hojas[h]) : cabecera(m);
    });
    const extra = rederivar(libro, f, cabeceras);

    MAESTRAS.concat(DERIVADAS).forEach((h) => {
      const m = libro.hojas[h];
      const idx = f.indices[h] || [];
      const nuevas = (extra[h] || []);
      if ((!Array.isArray(m) || !m.length || !idx.length) && !nuevas.length) return;
      const cabO = cabecera(m);
      const cabD = cabeceras[h];
      if (!hojas[h] || !hojas[h].length) {
        hojas[h] = [cabD];
        if (texto[h] !== undefined || (libro.hojasTexto || {})[h]) texto[h] = [cabD];
        vistos[h] = new Set();
      } else {
        hojas[h] = hojas[h].slice();
        if (texto[h]) texto[h] = texto[h].slice();
      }
      const mt = (libro.hojasTexto || {})[h];
      const cabT = cabecera(mt);
      const agregar = (filaNum, filaTxt) => {
        const k = claveFila(h, aObjeto(cabD, filaNum));
        if (vistos[h].has(k)) return;
        vistos[h].add(k);
        hojas[h].push(filaNum);
        if (texto[h]) texto[h].push(filaTxt.map(c => (c === null || c === undefined) ? '' : String(c)));
      };
      idx.forEach((i) => {
        const n = reordenar(cabO, m[i], cabD);
        const t = (mt && mt[i]) ? reordenar(cabT, mt[i], cabD) : n;
        agregar(n, t);
      });
      nuevas.forEach(n => agregar(n, n));
    });
  });

  return Object.assign({}, principal, { hojas: hojas, hojasTexto: texto, vinculados: info });
}

/**
 * Lee los libros vinculados y los fusiona. `leer(sheetId)` es la lectura
 * de Google. Un vinculado que no se puede leer NO tumba el libro de la
 * zona: se informa y se sigue.
 */
async function leerVinculados(principal, vinculados, equipoClave, leer) {
  const conLibro = [];
  const caidos = [];
  for (const v of vinculados || []) {
    try { conLibro.push(Object.assign({}, v, { libro: await leer(v.sheetId) })); }
    catch (e) { caidos.push({ slug: v.slug, label: v.label }); }
  }
  const r = fusionar(principal, conLibro, equipoClave);
  if (caidos.length) r.vinculadosCaidos = caidos;
  return r;
}

module.exports = { ROLES, rolDe, vinculadosDe, filtrar, fusionar, leerVinculados, MAESTRAS, DERIVADAS };
