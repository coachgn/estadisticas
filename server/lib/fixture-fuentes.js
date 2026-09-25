/* =====================================================================
   SGADD · FUENTES EXTERNAS DE FIXTURE · motor PURO (punto 70)

   Un torneo puede declarar de dónde sale su calendario:

     "fixture": {
       "adaptador": "basket-club",
       "zonas": { "a": "https://basket-club.com/torneos/…-zona-a", … }
     }

   Acá vive el ADAPTADOR: entra HTML, salen partidos. No hay red, ni KV, ni
   `document` — eso es `server/api/fixture.js`. Así el parser se prueba
   contra HTML guardado, que es la única forma de tener un test que no
   dependa de que el sitio esté arriba ni de que no haya cambiado.

   ---------------------------------------------------------------------
   POR QUÉ UN REGISTRO DE ADAPTADORES Y NO UN PARSER SUELTO

   Cada federación publica su fixture a su manera: Gesdeportiva (la CAB y
   la Liga Nacional) lo sirve como fragmento HTML por rango de fechas,
   basket-club lo sirve entero en la página del torneo. Lo que NO cambia es
   la forma de la salida. El registro fija ese contrato —`ADAPTADORES`— y
   sumar una federación es sumar una entrada, sin tocar ni el endpoint ni
   el panel.

   ---------------------------------------------------------------------
   LO QUE EL ADAPTADOR NO INVENTA

   **basket-club NO publica la sede ni la cancha.** Se verificó en las tres
   zonas: cero menciones de sede, cancha, estadio, gimnasio o dirección. El
   campo no se emite: una columna vacía permanente es ruido, y rellenarla
   con el nombre del local sería un dato inventado.

   Tampoco se emite un estado que el sitio no diga. Hoy solo escribe la
   hora (partido por jugarse) y «Final»; cualquier otro texto se conserva
   CRUDO en `estadoTexto` y se clasifica por palabra clave. Un sitio que
   mañana escriba «Suspendido» no rompe nada: cae en `OTRO` con su texto.
   ===================================================================== */
'use strict';

/* Los estados que el panel entiende. `OTRO` es la válvula: lo que el sitio
   diga y no se reconozca viaja igual, en `estadoTexto`. */
const ESTADOS = ['PROGRAMADO', 'EN_JUEGO', 'FINALIZADO', 'SUSPENDIDO', 'OTRO'];

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/* Se clasifica por palabra clave y en ESTE orden. «Finalizado» antes que
   «Final» no hace falta —una contiene a la otra— pero «En juego» sí tiene
   que ir antes que «juego». */
const SENALES_ESTADO = [
  { estado: 'FINALIZADO', re: /\b(final|finalizad|terminad|jugad)/i },
  { estado: 'EN_JUEGO', re: /\b(en\s*juego|en\s*vivo|jugando|entretiempo|q[1-4]\b)/i },
  { estado: 'SUSPENDIDO', re: /\b(suspendid|postergad|reprogramad|aplazad|cancelad)/i },
];

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function sinAcentos(t) {
  return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function texto(html) {
  return decodificar(String(html == null ? '' : html).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

/* Las entidades que aparecen de verdad en estas páginas. No se usa un
   parser de HTML: el objetivo es leer un fragmento conocido, no interpretar
   documentos arbitrarios. */
function decodificar(t) {
  return String(t == null ? '' : t)
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '-').replace(/&mdash;/g, '-')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

/** `AAAA-MM-DD` desde `dd/mm/aaaa`, que es lo que escribe basket-club. */
function fechaDesdeDDMM(t) {
  const m = String(t || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

/**
 * La fecha de un encabezado de jornada: «Viernes 25 de septiembre».
 *
 * **NO TRAE AÑO**, así que se resuelve contra una fecha de referencia y se
 * elige el año que deje la jornada más cerca de ella. Sin eso, una jornada
 * de enero leída en diciembre caería un año antes.
 */
function fechaDesdeJornada(t, referencia) {
  const s = sinAcentos(String(t || '')).toLowerCase();
  const m = s.match(/(\d{1,2})\s+de\s+([a-z]+)/);
  if (!m) return null;
  const mes = MESES[m[2]];
  if (!mes) return null;
  const dia = Number(m[1]);
  const ref = String(referencia || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const anioRef = ref ? Number(ref[1]) : new Date().getUTCFullYear();
  const mesRef = ref ? Number(ref[2]) : new Date().getUTCMonth() + 1;
  /* A más de seis meses de distancia, el año que corresponde es el otro:
     una jornada de enero vista en diciembre es del año que viene. */
  let anio = anioRef;
  if (mes - mesRef > 6) anio = anioRef - 1;
  else if (mesRef - mes > 6) anio = anioRef + 1;
  return anio + '-' + ('0' + mes).slice(-2) + '-' + ('0' + dia).slice(-2);
}

function clasificarEstado(t) {
  const s = String(t || '').trim();
  if (!s) return { estado: 'PROGRAMADO', estadoTexto: '' };
  if (/^\d{1,2}[:.]\d{2}/.test(s)) return { estado: 'PROGRAMADO', estadoTexto: s };
  for (let i = 0; i < SENALES_ESTADO.length; i++) {
    if (SENALES_ESTADO[i].re.test(sinAcentos(s))) {
      return { estado: SENALES_ESTADO[i].estado, estadoTexto: s };
    }
  }
  /* NO SE ADIVINA: lo que el sitio diga viaja crudo y el panel lo muestra
     tal cual. Es lo que hace que un estado nuevo no rompa nada. */
  return { estado: 'OTRO', estadoTexto: s };
}

function hora(t) {
  const m = String(t || '').match(/(\d{1,2})[:.](\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : null;
}

/* =====================================================================
   ADAPTADOR · basket-club.com
   ===================================================================== */

/* Un partido es un <li> con esta firma de clases. Se ancla a las clases y
   no a la posición: el sitio usa Tailwind y el bloque se repite igual en
   las tres zonas y en las dos secciones (próximos y jugados). */
const LI = /<li class="flex items-center gap-1[^"]*">([\s\S]*?)<\/li>/g;
/* El encabezado de jornada, para resolver los «Hoy». */
const JORNADA = /<span class="text-xs font-bold uppercase tracking-wider[^"]*">([\s\S]*?)<\/span>/g;
/* Los dos equipos: el PRIMER <a> es el local y el segundo el visitante. */
const EQUIPO = /<a href="https?:\/\/[^"]*\/equipos\/([a-z0-9-]+)"[\s\S]*?alt="([^"]*)"/g;
/* El nombre largo, que es el que se compara con el libro. El corto (la
   abreviatura de tres letras) queda para la insignia. */
const NOMBRE_LARGO = /<span class="hidden sm:inline">([\s\S]*?)<\/span>/g;
const NOMBRE_CORTO = /<span class="sm:hidden">([\s\S]*?)<\/span>/g;
/* La cabecera de cada partido: fecha arriba, estado u hora abajo. */
const CABECERA = /<div class="w-20 sm:w-32[^"]*">([\s\S]*?)<\/a>/;
const SPAN = /<span[^>]*>([\s\S]*?)<\/span>/g;
/* El marcador: dos números con la clase de display. */
const TANTOS = /<span class="font-display[^"]*">\s*(\d+)\s*<\/span>/g;
/* La transmisión: el `title` del link, con su URL. */
const TV = /<a href="([^"]+)"[^>]*title="([^"]+)"[^>]*aria-label="Ver por/g;

function todas(re, t) {
  const out = [];
  const r = new RegExp(re.source, re.flags);
  let m;
  while ((m = r.exec(t))) out.push(m);
  return out;
}

/**
 * El fixture de una página de torneo de basket-club.
 *
 * @param {string} html la página entera
 * @param {{hoy?: string, zona?: string}} [opciones] `hoy` resuelve los
 *        encabezados de jornada, que no traen año.
 * @returns {{partidos: Array, avisos: Array<string>}}
 */
function parsearBasketClub(html, opciones) {
  const o = opciones || {};
  const doc = String(html == null ? '' : html);
  const hoy = o.hoy || new Date().toISOString().slice(0, 10);
  const avisos = [];

  /* Las jornadas y los partidos se recorren EN ORDEN DE APARICIÓN para
     poder atribuirle a cada «Hoy» la jornada que lo precede. Por eso se
     buscan sobre el mismo texto y se comparan los índices. */
  const jornadas = todas(JORNADA, doc).map(m => ({ i: m.index, fecha: fechaDesdeJornada(texto(m[1]), hoy) }));
  const partidos = [];

  todas(LI, doc).forEach((m) => {
    const li = m[1];
    const cab = CABECERA.exec(li);
    if (!cab) return;
    const spans = todas(SPAN, cab[1]).map(x => texto(x[1])).filter(Boolean);
    if (!spans.length) return;

    let fecha = fechaDesdeDDMM(spans[0]);
    if (!fecha) {
      /* «Hoy» (y cualquier etiqueta relativa): la fecha la pone el
         encabezado de jornada que viene ANTES en la página. */
      const previa = jornadas.filter(j => j.i < m.index).pop();
      fecha = previa ? previa.fecha : null;
      if (!fecha) { avisos.push('Un partido sin fecha legible: «' + spans[0] + '»'); return; }
    }

    const eqs = todas(EQUIPO, li);
    if (eqs.length < 2) { avisos.push('Un partido del ' + fecha + ' sin los dos equipos'); return; }
    const largos = todas(NOMBRE_LARGO, li).map(x => texto(x[1]));
    const cortos = todas(NOMBRE_CORTO, li).map(x => texto(x[1]));
    /* El NOMBRE LARGO manda sobre el `alt`: es el que el sitio muestra y el
       que se compara con el libro. El `alt` queda de respaldo. */
    const nombre = (i) => largos[i] || decodificar(eqs[i][2]) || eqs[i][1];

    const est = clasificarEstado(spans[1] || '');
    const tantos = todas(TANTOS, li).map(x => Number(x[1]));
    const jugado = tantos.length >= 2;
    /* UN PARTIDO CON MARCADOR ESTÁ JUGADO, diga lo que diga el estado: el
       marcador es el hecho y la etiqueta es cómo lo rotula el sitio. */
    const estado = jugado && est.estado === 'PROGRAMADO' ? 'FINALIZADO' : est.estado;

    partidos.push({
      fecha: fecha,
      hora: hora(spans[1] || ''),
      estado: estado,
      estadoTexto: est.estadoTexto,
      local: nombre(0), visitante: nombre(1),
      localSlug: eqs[0][1], visitanteSlug: eqs[1][1],
      localCorto: cortos[0] || null, visitanteCorto: cortos[1] || null,
      ptsLocal: jugado ? tantos[0] : null,
      ptsVisitante: jugado ? tantos[1] : null,
      /* LA TRANSMISIÓN: lo que el sitio publica, con su link. Es el dato que
         el DT usa para ver al rival sin ir a la cancha. */
      transmision: todas(TV, li).map(x => ({ nombre: texto(x[2]), url: decodificar(x[1]) })),
      zona: o.zona || null,
    });
  });

  if (!partidos.length) {
    /* CAMBIÓ LA ESTRUCTURA. No es lo mismo que «el torneo no tiene
       partidos»: se dice, y quien llama decide servir lo último guardado. */
    avisos.push('No se reconoció ningún partido: la página cambió de estructura.');
  }
  return { partidos: partidos.sort(ordenar), avisos: avisos };
}

function ordenar(a, b) {
  return String(a.fecha).localeCompare(String(b.fecha))
    || String(a.hora || '').localeCompare(String(b.hora || ''))
    || String(a.local).localeCompare(String(b.local));
}

/* =====================================================================
   ADAPTADOR · apdeb.com.ar (Asociación Platense de Básquetbol)

   Un sitio de tablas HTML de los de antes: una `<tr>` por partido, sin
   clases que identifiquen nada. Así que NO se cuentan columnas —eso se
   rompe con la primera que agreguen— sino que se busca la celda que dice
   `vs` y se lee alrededor:

     …  [pts local]  LOCAL  vs  VISITANTE  [pts visitante]  [categorías]
     ^
     la fecha, o el estado cuando no hay fecha («A Reprogramar»)

   Con eso, la misma función lee las tres páginas que publican —
   programación (5 celdas), resultados (6, con el marcador a los costados)
   y la de menores (una más, con las categorías)— y sobrevive a que sumen
   una columna.

   ---------------------------------------------------------------------
   UNA FILA PUEDE SER DE VARIAS CATEGORÍAS A LA VEZ

   En menores el mismo cruce de clubes juega U15, U17 y U21 el mismo día:
   la celda de categorías dice `U15 - U17 - U21`. Con `categoria` en la
   config se toman solo las filas que la mencionan, y el partido se emite
   una vez. Sin `categoria` entran todas, que es lo que corresponde para
   Sub-23, donde la página ya es de una sola.
   ===================================================================== */

/* Una celda: `<td>` o `<th>`, con su contenido en texto plano. */
const CELDA = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
const FILA = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const ES_VS = /^vs\.?$/i;
const CATEGORIA = /U\s?-?(\d{2})/gi;

/** Las categorías que menciona una celda: `U15 - U17 - U21` → [15,17,21]. */
function categoriasDe(celda) {
  const out = [];
  const re = new RegExp(CATEGORIA.source, CATEGORIA.flags);
  let m;
  while ((m = re.exec(String(celda || '')))) out.push(Number(m[1]));
  return out;
}

/**
 * El fixture de una página de apdeb.
 *
 * @param {string} html
 * @param {{hoy?: string, zona?: string, categoria?: string}} [opciones]
 *        `categoria` filtra las filas de una página multi-categoría
 *        (`U21`); sin ella entran todas.
 */
function parsearApdeb(html, opciones) {
  const o = opciones || {};
  const doc = String(html == null ? '' : html);
  const hoy = o.hoy || new Date().toISOString().slice(0, 10);
  const avisos = [];
  const partidos = [];
  /* La categoría pedida, como número: `U21` → 21. */
  const pedida = o.categoria ? (categoriasDe(o.categoria)[0] || null) : null;
  /* El piso de temporada, si el torneo lo declara (ver `configDe`). */
  const desde = FECHA_ISO.test(String(o.desde || '')) ? String(o.desde) : null;
  let fueraDeTemporada = 0;

  todas(FILA, doc).forEach((f) => {
    const celdas = todas(CELDA, f[1]).map(c => texto(c[1]));
    const iVs = celdas.findIndex(c => ES_VS.test(c));
    /* Sin `vs` no es un partido: es un encabezado de jornada, la tabla de
       posiciones o el menú del sitio. */
    if (iVs < 1 || iVs + 1 >= celdas.length) return;

    const local = celdas[iVs - 1];
    const visitante = celdas[iVs + 1];
    if (!local || !visitante) return;

    /* LA CATEGORÍA, si la fila la trae: es la última celda que mencione
       una. Se busca DESPUÉS del visitante para no confundirla con el
       nombre de un club que tenga un número. */
    const cola = celdas.slice(iVs + 2);
    const celdaCat = cola.filter(c => categoriasDe(c).length).pop() || '';
    const cats = categoriasDe(celdaCat);
    if (pedida && cats.length && cats.indexOf(pedida) === -1) return;
    /* Con `categoria` pedida y una fila que NO declara ninguna, se
       DESCARTA: en una página multi-categoría, una fila sin rótulo no se
       puede atribuir, y meterla en U21 sería inventar. */
    if (pedida && !cats.length) return;

    /* EL MARCADOR está a los costados, y solo si las DOS celdas son
       números: con una sola, el partido no tiene resultado cargado. */
    const nLocal = numeroDe(celdas[iVs - 2]);
    const nVisitante = numeroDe(cola.length ? cola[0] : '');
    const jugado = nLocal !== null && nVisitante !== null;

    /* LA FECHA y el ESTADO salen de la primera celda, que trae una cosa o
       la otra: `MIERCOLES 30/09/2026` o `A Reprogramar`. */
    const cabecera = celdas.slice(0, Math.max(0, iVs - (jugado ? 2 : 1))).concat(
      jugado ? [] : []).filter(Boolean);
    const primera = cabecera.length ? cabecera[0] : '';
    const fecha = fechaDesdeDDMM(primera);
    /* La hora es cualquier celda de la cabecera con hh:mm, y nunca la
       primera cuando esa ya trae la fecha. */
    const hh = cabecera.map(c => hora(c)).filter(Boolean)[0] || null;

    let est;
    if (fecha) {
      est = hh ? { estado: 'PROGRAMADO', estadoTexto: hh } : { estado: 'PROGRAMADO', estadoTexto: '' };
    } else {
      /* SIN FECHA, la celda dice POR QUÉ: «A Reprogramar», «SUSPENDIDO».
         Se conserva el texto tal cual y se clasifica por palabra clave. */
      est = clasificarEstado(primera);
      if (est.estado === 'PROGRAMADO' && primera) est = { estado: 'OTRO', estadoTexto: primera };
    }
    const estado = jugado ? 'FINALIZADO' : est.estado;

    if (!fecha && !jugado && est.estado === 'PROGRAMADO' && !primera) return;   // fila vacía
    /* FUERA DE LA TEMPORADA DECLARADA no entra, y se cuenta para poder
       decirlo: son partidos reales de otro año, no un error del sitio. Los
       que no tienen fecha pasan igual —«a reprogramar» es de ahora—. */
    if (desde && fecha && fecha < desde) { fueraDeTemporada++; return; }

    partidos.push({
      /* SIN FECHA EL PARTIDO ENTRA IGUAL, con `fecha: null`: «a
         reprogramar» es información —el DT tiene que saber que ese cruce
         está pendiente— y descartarlo dejaría el fixture incompleto. La
         sección lo agrupa aparte porque no cae en ningún mes. */
      fecha: fecha,
      hora: hh,
      estado: estado,
      estadoTexto: est.estadoTexto || '',
      local: local, visitante: visitante,
      localSlug: null, visitanteSlug: null,
      localCorto: null, visitanteCorto: null,
      ptsLocal: jugado ? nLocal : null,
      ptsVisitante: jugado ? nVisitante : null,
      /* apdeb NO publica transmisión: el campo va vacío, no inventado. */
      transmision: [],
      zona: o.zona || null,
      categorias: cats.length ? cats : null,
    });
  });

  if (!partidos.length) {
    /* CON TODO FILTRADO POR TEMPORADA no es que la página cambió: es que
       esa página es de otro año. Decirlo distinto importa, porque uno se
       arregla con el `desde` y el otro con el parser. */
    avisos.push(fueraDeTemporada
      ? ('Los ' + fueraDeTemporada + ' partidos de la página son anteriores a ' + desde + '.')
      : 'No se reconoció ningún partido: la página cambió de estructura.');
  } else if (fueraDeTemporada) {
    avisos.push(fueraDeTemporada + ' partidos de temporadas anteriores quedaron afuera.');
  }
  /* Los que no tienen fecha van al final: no se pueden ordenar por algo que
     no tienen, y arriba taparían lo que sí está programado.

     ES EXPLÍCITO A PROPÓSITO, aunque hoy sea redundante: con `fecha: null`,
     `String(null)` da «null» y por alfabeto ya cae después de cualquier
     «2026-…». La propiedad no debería depender de que la letra «n» sea
     mayor que un dígito. */
  partidos.sort((a2, b2) => {
    if (!a2.fecha && !b2.fecha) return 0;
    if (!a2.fecha) return 1;
    if (!b2.fecha) return -1;
    return ordenar(a2, b2);
  });
  return { partidos: partidos, avisos: avisos };
}

/** Un número entero, o null. `''`, `'-'` y `'&nbsp;'` no son números. */
function numeroDe(c) {
  const t = String(c == null ? '' : c).trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  return Number(t);
}

/* =====================================================================
   EL REGISTRO
   ===================================================================== */

const ADAPTADORES = {
  'basket-club': {
    nombre: 'Basket Club La Plata',
    /* Una página por zona, y la página trae el torneo entero. */
    porZona: true,
    parsear: parsearBasketClub,
  },
  apdeb: {
    nombre: 'APdeB · Asociación Platense de Básquetbol',
    /* VARIAS páginas por zona: la programación y los resultados viven
       aparte, y se unen en una sola lista. */
    porZona: true,
    variasUrls: true,
    parsear: parsearApdeb,
  },
};

function adaptador(id) { return ADAPTADORES[String(id || '')] || null; }

/**
 * La configuración de fixture de un torneo, validada.
 *
 * Devuelve `null` si no declara ninguna: un torneo sin fuente externa
 * sigue funcionando con el `calendario` de su archivo, que es como
 * funciona LAB hoy.
 */
function configDe(doc) {
  const f = doc && doc.fixture;
  if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
  const ad = adaptador(f.adaptador);
  if (!ad) return null;
  const zonas = {};
  Object.keys(f.zonas || {}).forEach((z) => {
    const v = f.zonas[z];
    /* UNA ZONA PUEDE SER UNA URL O UN OBJETO con varias. La forma corta
       —un string— es la de basket-club, donde la página del torneo trae
       todo; la larga es la de apdeb, que publica la programación y los
       resultados en archivos distintos, y donde además hace falta decir
       qué categoría tomar de una página que trae varias. */
    if (typeof v === 'string') {
      /* SOLO SE EXIGE QUE SEA UNA URL: la escribe un administrador en un
         archivo del repo, no llega de afuera. */
      if (/^https?:\/\//i.test(v)) zonas[z] = { urls: [v], categoria: null };
      return;
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;
    const urls = (Array.isArray(v.urls) ? v.urls : [v.programacion, v.resultados, v.url])
      .filter(u => typeof u === 'string' && /^https?:\/\//i.test(u));
    if (!urls.length) return;
    zonas[z] = { urls: urls, categoria: v.categoria ? String(v.categoria) : null,
      label: v.label ? String(v.label) : null,
      /* Una zona puede tener su propio piso de temporada; si no, rige el
         del torneo. */
      desde: FECHA_ISO.test(String(v.desde || '')) ? String(v.desde) : null };
  });
  if (!Object.keys(zonas).length) return null;
  /* `desde` ACOTA A LA TEMPORADA. apdeb publica en la misma página los
     resultados de varias temporadas —medido: la de Sub-23 trae 2025 y
     2026— y sin el corte el fixture muestra meses de hace un año como si
     fueran del torneo en curso. Se DECLARA y no se adivina: no hay forma
     de saber desde el HTML dónde empieza la temporada. */
  const desde = FECHA_ISO.test(String(f.desde || '')) ? String(f.desde) : null;
  return { adaptador: String(f.adaptador), zonas: zonas, desde: desde,
    ttlMs: Number(f.ttlMs) || 0 };
}

/* =====================================================================
   EL CRUCE CON EL LIBRO

   El sitio escribe `ATENAS` y el libro `ATENAS 'A' - MM`; el sitio
   `CEYE` y el libro `C E Y E`. Sin resolverlo, el fixture no cruza con lo
   jugado y la sección muestra dos veces el mismo partido.

   Se resuelve en CASCADA y lo que no cruza SE REPORTA, no se fuerza: un
   equipo atribuido al que no es contamina el calendario de dos clubes.
   ===================================================================== */

/**
 * @param {string} nombreWeb el nombre que publica la fuente
 * @param {Array<string>} clavesLibro las claves del índice (`claveEquipo`)
 * @param {Object} [alias] lo que el torneo declare a mano: web → libro
 * @param {Function} clave el normalizador del núcleo
 */
function equipoDelLibro(nombreWeb, clavesLibro, alias, clave) {
  const c = clave(nombreWeb);
  if (!c) return null;
  const libro = clavesLibro || [];

  /* 1 · declarado a mano: gana siempre. */
  const decl = alias && (alias[nombreWeb] || alias[c]);
  if (decl) {
    const d = clave(decl);
    if (libro.indexOf(d) !== -1) return d;
  }
  /* 2 · igual. */
  if (libro.indexOf(c) !== -1) return c;
  /* 3 · el libro le agrega la letra del equipo: ATENAS → ATENAS A. */
  const conLetra = libro.filter(k => k === c + ' A' || k === c + ' B');
  if (conLetra.length === 1) return conLetra[0];
  /* 4 · el libro separa las siglas: CEYE → C E Y E, UNLP → U N L P. */
  const pegado = (x) => x.replace(/\s+/g, '');
  const porPegado = libro.filter(k => pegado(k) === pegado(c));
  if (porPegado.length === 1) return porPegado[0];
  /* 5 · el libro abrevia la primera palabra: ASOCIACION MAYO → A MAYO,
     ATLETICO CHASCOMUS → A CHASCOMUS, CIRCULO MARCHIGIANO → C MARCHIGIANO. */
  const inicial = (x) => x.replace(/^(\S)\S*\s+/, '$1 ');
  const porInicial = libro.filter(k => inicial(k) === inicial(c) || k === inicial(c));
  if (porInicial.length === 1) return porInicial[0];
  /* 6 · el libro le agrega una palabra: ESTRELLA ← ESTRELLA DE BERISSO,
     VILLA ELISA ← DEP VILLA ELISA. Se exige UNA sola candidata: con dos,
     elegir sería adivinar. */
  const contiene = libro.filter(k => k !== c && (
    (' ' + c + ' ').indexOf(' ' + k + ' ') !== -1 || (' ' + k + ' ').indexOf(' ' + c + ' ') !== -1));
  if (contiene.length === 1) return contiene[0];
  return null;
}

/**
 * Traduce los partidos de la fuente a las claves del libro.
 *
 * Los que no cruzan **igual viajan**, con `sinCruce: true`: son partidos
 * reales del torneo y esconderlos dejaría el calendario incompleto. Lo que
 * no se hace es atribuirlos a un equipo que no es.
 */
function cruzarConLibro(partidos, clavesLibro, alias, clave) {
  const sinCruce = {};
  const out = (partidos || []).map((p) => {
    const l = equipoDelLibro(p.local, clavesLibro, alias, clave);
    const v = equipoDelLibro(p.visitante, clavesLibro, alias, clave);
    if (!l) sinCruce[p.local] = true;
    if (!v) sinCruce[p.visitante] = true;
    return Object.assign({}, p, {
      localClave: l || clave(p.local),
      visitanteClave: v || clave(p.visitante),
      sinCruce: !l || !v,
    });
  });
  return { partidos: out, sinCruce: Object.keys(sinCruce).sort() };
}

module.exports = {
  ESTADOS, ADAPTADORES, adaptador, configDe,
  parsearBasketClub, parsearApdeb, categoriasDe, numeroDe,
  clasificarEstado, fechaDesdeDDMM, fechaDesdeJornada, hora, texto, decodificar,
  equipoDelLibro, cruzarConLibro,
};
