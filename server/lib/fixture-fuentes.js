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

/* EL ENCABEZADO DE JORNADA DE LA PÁGINA «FIXTURE»: `1ª Fecha - 21/3/2026`.
   Esa página es el fixture ESTRUCTURAL —qué cruce va en cada fecha— y sus
   filas traen solo LOCAL · vs · VISITANTE, sin fecha propia: la fecha la
   pone el encabezado que las precede. */
const JORNADA_APDEB = /(\d{1,2}\s*[\u00ba\u00b0]?\s*)?fecha[^<]{0,20}?(\d{1,2}\/\d{1,2}\/\d{4})/i;

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

  /* LAS JORNADAS, en orden de aparición: una fila sin celda de fecha toma la
     del último encabezado que vino antes. Es el mismo mecanismo que el «Hoy»
     de basket-club, y hace falta para la página FIXTURE, donde NINGUNA fila
     trae fecha. */
  const jornadas = [];
  todas(FILA, doc).forEach((f) => {
    const m = JORNADA_APDEB.exec(texto(f[1]));
    if (m) jornadas.push({ i: f.index, fecha: fechaDesdeDDMM(m[2]) });
  });

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
    let fecha = fechaDesdeDDMM(primera);

    /* LA FILA DE LA PÁGINA «FIXTURE» no tiene celda de fecha: el local es la
       PRIMERA celda (`iVs === 1`). Ahí la fecha la pone el encabezado de
       jornada, y solo ahí: en la programación una fila sin fecha dice «A
       Reprogramar» y heredar la de la jornada le inventaría un día que el
       sitio justamente no publicó. La forma de la fila es lo que las separa,
       no una adivinanza. */
    const esFixtureEstructural = (iVs === 1 && !jugado);
    if (!fecha && esFixtureEstructural) {
      const previa = jornadas.filter(j => j.i < f.index && j.fecha).pop();
      if (previa) fecha = previa.fecha;
    }
    /* La hora es cualquier celda de la cabecera con hh:mm, y nunca la
       primera cuando esa ya trae la fecha. */
    const hh = cabecera.map(c => hora(c)).filter(Boolean)[0] || null;

    let est;
    if (fecha) {
      est = hh ? { estado: 'PROGRAMADO', estadoTexto: hh } : { estado: 'PROGRAMADO', estadoTexto: '' };
    } else if (esFixtureEstructural) {
      /* Sin fecha de jornada tampoco: el cruce está declarado en el fixture
         y no tiene día asignado todavía. No es un estado raro. */
      est = { estado: 'PROGRAMADO', estadoTexto: '' };
    } else {
      /* SIN FECHA, la celda dice POR QUÉ: «A Reprogramar», «SUSPENDIDO».
         Se conserva el texto tal cual y se clasifica por palabra clave. */
      est = clasificarEstado(primera);
      if (est.estado === 'PROGRAMADO' && primera) est = { estado: 'OTRO', estadoTexto: primera };
    }
    const estado = jugado ? 'FINALIZADO' : est.estado;

    if (!fecha && !jugado && est.estado === 'PROGRAMADO' && !primera && !esFixtureEstructural) {
      return;   // fila vacía
    }
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
      /* DE QUÉ PÁGINA SALIÓ. El fixture estructural es el de MENOS detalle
         —no trae hora ni estado— así que la unión lo deja perder contra la
         programación del mismo cruce (ver `refrescar`). */
      estructural: esFixtureEstructural,
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
   LA INSTANCIA DE UN PARTIDO · fase regular, octavos, play-in…

   Las fuentes rotulan cada partido con su ronda —«Fecha 21», «Torneo
   Apertura - LBB ORO - Cuartos de Final»— y ese texto es lo único que dice
   a qué fase pertenece sin adivinar por la fecha. Se lee por palabra clave
   y se CONSERVA el texto crudo (`ronda`): lo que no se reconoce no se
   inventa, viaja como `OTRA` con su rótulo tal cual.
   ===================================================================== */

/* El ORDEN importa: «final extra» antes que «final», «semifinal» antes que
   «final», y «play-in» antes que cualquier cosa que diga «partido». */
const INSTANCIAS = [
  { id: 'PLAYIN', label: 'Play-In', orden: 2, re: /\bplay\s*-?\s*in\b/ },
  { id: 'RECLASIFICACION', label: 'Reclasificación', orden: 2, re: /reclasifica/ },
  { id: 'OCTAVOS', label: 'Octavos de final', orden: 3, re: /octavos/ },
  { id: 'CUARTOS', label: 'Cuartos de final', orden: 4, re: /cuartos/ },
  { id: 'SEMIFINAL', label: 'Semifinales', orden: 5, re: /semi\s*-?\s*final/ },
  { id: 'FINAL_EXTRA', label: 'Final extra', orden: 7, re: /final\s+extra|superfinal/ },
  { id: 'FINAL', label: 'Final', orden: 6, re: /\bfinal(es)?\b/ },
  { id: 'PERMANENCIA', label: 'Permanencia', orden: 8, re: /permanencia|descenso/ },
  { id: 'PROMOCION', label: 'Promoción', orden: 9, re: /promoci/ },
  { id: 'REGULAR', label: 'Fase regular', orden: 1, re: /\b(fecha|jornada|regular|ronda)\b/ },
];

/**
 * @param {string} t el rótulo de la fuente
 * @returns {{id, label, orden, etapa}|null} `etapa` es Apertura/Clausura si
 *          el rótulo lo dice; nunca se deduce de la fecha.
 */
function instanciaDe(t) {
  const s = sinAcentos(String(t || '')).normalize('NFKC').toLowerCase();
  if (!s.trim()) return null;
  const i = INSTANCIAS.find(x => x.re.test(s));
  const etapa = /apertura/.test(s) ? 'Apertura' : /clausura/.test(s) ? 'Clausura' : null;
  if (!i) return { id: 'OTRA', label: String(t).trim(), orden: 10, etapa: etapa };
  return { id: i.id, label: i.label, orden: i.orden, etapa: etapa };
}

/* =====================================================================
   ADAPTADOR · volcala.com

   Una app de Next.js: la página no trae una tabla sino el payload de React
   Server Components (`self.__next_f.push([1,"…"])`), y adentro un arreglo
   `"matches":[…]` con un objeto por partido — fecha, hora, local,
   visitante, resultado, estado, ronda y cancha.

   SE LEE EL JSON, NO EL HTML DIBUJADO: es el dato con el que la propia app
   arma la pantalla, así que un cambio de estilos no lo rompe. Medido sobre
   la de Bahía Blanca Primera el 2026-10-16: 163 partidos (151 jugados, 12
   por jugar), las 22 fechas y los playoffs del Apertura.

   Volcala SÍ publica la cancha (`venue`), así que acá `sede` viaja.
   ===================================================================== */

/* Los textos del payload, en orden. Cada uno es un literal de JS. */
const NEXT_F = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

/** El arreglo que empieza en `i` (un `[`), respetando los strings. */
function arregloDesde(s, i) {
  let d = 0, enStr = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (enStr) {
      if (c === '\\') { j++; continue; }
      if (c === '"') enStr = false;
      continue;
    }
    if (c === '"') enStr = true;
    else if (c === '[') d++;
    else if (c === ']') { d--; if (!d) return s.slice(i, j + 1); }
  }
  return null;
}

const ESTADOS_VOLCALA = [
  { estado: 'FINALIZADO', re: /^(finished|ended|after|ft\b|final)/i },
  { estado: 'PROGRAMADO', re: /^(scheduled|not started|ns\b|tbd)/i },
  { estado: 'SUSPENDIDO', re: /(postpon|cancel|suspend|abandon|delay)/i },
  { estado: 'EN_JUEGO', re: /(live|quarter|half|break|overtime|q[1-4]\b|in progress)/i },
];

function sinUndefined(v) { return v === '$undefined' || v === undefined ? null : v; }

/**
 * @param {string} html la página de la liga en volcala
 * @param {{zona?: string, categoria?: string}} [opciones] `categoria` filtra
 *        por `league_key` si la página trajera más de una liga
 */
function parsearVolcala(html, opciones) {
  const o = opciones || {};
  const doc = String(html == null ? '' : html);
  const avisos = [];
  let s = '';
  todas(NEXT_F, doc).forEach((m) => { try { s += JSON.parse(m[1]); } catch (e) { /* trozo roto: se saltea */ } });
  const porId = {};
  const crudos = [];
  const re = /"matches":\[/g;
  let m;
  while ((m = re.exec(s))) {
    const txt = arregloDesde(s, m.index + m[0].length - 1);
    if (!txt) continue;
    let arr = null;
    try { arr = JSON.parse(txt); } catch (e) { continue; }
    (arr || []).forEach((x) => {
      if (!x || typeof x !== 'object' || !x.event_home_team || !x.event_away_team) return;
      /* La misma lista puede venir dos veces en el payload: el id manda. */
      const id = x.event_key != null ? String(x.event_key) : null;
      if (id && porId[id]) return;
      if (id) porId[id] = true;
      crudos.push(x);
    });
  }
  const partidos = [];
  crudos.forEach((x) => {
    if (o.categoria && x.league_key && String(x.league_key) !== String(o.categoria)) return;
    const fecha = FECHA_ISO.test(String(x.event_date || '')) ? String(x.event_date) : null;
    const st = String(sinUndefined(x.event_status) || '').trim();
    const v = ESTADOS_VOLCALA.find(e => e.re.test(st));
    let estado = v ? v.estado : (st ? 'OTRO' : 'PROGRAMADO');
    const res = String(sinUndefined(x.event_final_result) || '').match(/^\s*(\d{1,3})\s*-\s*(\d{1,3})\s*$/);
    /* EL MARCADOR SOLO SE TOMA DE UN PARTIDO TERMINADO. Uno en juego trae
       el parcial en el mismo campo, y tomarlo como resultado daría por
       ganado un partido que todavía no terminó. */
    const jugado = !!res && estado === 'FINALIZADO';
    const ronda = String(sinUndefined(x.round) || '').trim() || null;
    partidos.push({
      fecha: fecha,
      hora: hora(sinUndefined(x.event_time) || ''),
      estado: estado,
      estadoTexto: estado === 'OTRO' ? st : '',
      local: String(x.event_home_team).trim(),
      visitante: String(x.event_away_team).trim(),
      ptsLocal: jugado ? Number(res[1]) : null,
      ptsVisitante: jugado ? Number(res[2]) : null,
      ronda: ronda,
      instancia: instanciaDe(ronda),
      sede: String(sinUndefined(x.venue) || '').trim() || null,
      transmision: [],
      zona: o.zona || null,
    });
  });
  if (!partidos.length) {
    avisos.push(s ? 'No se reconoció ningún partido: la página cambió de estructura.'
      : 'La página no trae el calendario de volcala (sin payload de la app).');
  }
  partidos.sort((a, b) => {
    if (!a.fecha && !b.fecha) return 0;
    if (!a.fecha) return 1;
    if (!b.fecha) return -1;
    return ordenar(a, b);
  });
  return { partidos: partidos, avisos: avisos };
}

/* =====================================================================
   ADAPTADOR GENÉRICO · «jornadas» en una página de texto

   Es el formato de las federaciones que publican el fixture como NOTA —la
   ABB lo hace en WordPress—: un encabezado por jornada con su día y debajo
   un cruce por renglón.

       JORNADA 1 – Jueves 20 de agosto
       Pueyrredón – Leandro Alem
       Liniers – Napostá

   Y más abajo, la ESTRUCTURA de la postemporada en prosa: «Cuartos de
   final … al mejor de tres … Los días de juego serán: Lun 09/11 – Jue
   12/11». De eso se toman la instancia, sus días y la serie, y NADA más:
   los cruces de esas fases todavía no existen.

   - Es FIXTURE ESTRUCTURAL (`estructural: true`): no trae hora, estado ni
     marcador, y pierde contra cualquier otra fuente del mismo cruce.
   - El año no se escribe: sale del primer `dd/mm/aaaa` de la página
     («Inicio: Jueves 20/08/2026») y, si no hay, de la fecha de hoy.
   - Un renglón se toma como cruce SOLO debajo de un encabezado de jornada,
     y solo si es «NOMBRE – NOMBRE» corto: la prosa del reglamento no
     puede colarse como partido.
   ===================================================================== */

/* Los tags que NO cortan renglón: con ellos la ABB parte una palabra
   («<u>PL</u><u>AY-</u><u>IN</u>»). Todo lo demás corta. */
const INLINE = /<\/?(u|em|strong|b|i|span|a|small|sup|sub|font|mark)\b[^>]*>/gi;
const ENCABEZADO_JORNADA = /^(jornada|fecha)\s*(?:n[°º.]?\s*)?(\d{1,2})\b\s*[-–—:.]?\s*(.*)$/i;
const CRUCE_TEXTO = /^([^–—:|]{2,40}?)\s*[–—]\s*([^–—:|]{2,40})$|^([^\-–—:|]{2,40}?)\s+-\s+([^\-–—:|]{2,40})$/;
const NUMEROS_PALABRA = { uno: 1, tres: 3, cinco: 5, siete: 7 };

function renglones(html) {
  const s = String(html == null ? '' : html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ')
    .replace(INLINE, '')
    .replace(/<[^>]+>/g, '\n');
  return decodificar(s).normalize('NFKC').split(/\n/)
    .map(l => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean);
}

/** Las fechas de un renglón: `09/11`, `09/11/2026` o «lunes 02 de noviembre». */
function fechasDeRenglon(l, ref) {
  const out = [];
  const anioRef = Number(String(ref).slice(0, 4)) || new Date().getUTCFullYear();
  const re = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g;
  let m;
  while ((m = re.exec(l))) {
    const mes = Number(m[2]), dia = Number(m[1]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) continue;
    out.push((m[3] || anioRef) + '-' + ('0' + mes).slice(-2) + '-' + ('0' + dia).slice(-2));
  }
  if (!out.length) {
    const f = fechaDesdeJornada(l, ref);
    if (f) out.push(f);
  }
  return out;
}

function parsearJornadas(html, opciones) {
  const o = opciones || {};
  const lineas = renglones(html);
  const avisos = [];
  const inicio = lineas.map(l => fechaDesdeDDMM(l)).find(Boolean);
  const ref = inicio || o.desde || o.hoy || new Date().toISOString().slice(0, 10);
  const partidos = [];
  const estructura = [];
  let jornada = null;
  let etapa = null;
  lineas.forEach((l) => {
    const j = l.match(ENCABEZADO_JORNADA);
    if (j && l.length <= 70) {
      const f = fechasDeRenglon(j[3] || '', ref);
      jornada = { ronda: (j[1].charAt(0).toUpperCase() + j[1].slice(1).toLowerCase()) + ' ' + Number(j[2]), fecha: f[0] || null };
      etapa = null;
      return;
    }
    const c = l.match(CRUCE_TEXTO);
    if (jornada && c && !/\d{2}/.test(l)) {
      const a = (c[1] || c[3]).trim(), b = (c[2] || c[4]).trim();
      if (/[a-z]/i.test(a) && /[a-z]/i.test(b)) {
        partidos.push({ fecha: jornada.fecha, hora: null, estado: 'PROGRAMADO', estadoTexto: '',
          local: a, visitante: b, ptsLocal: null, ptsVisitante: null,
          ronda: jornada.ronda, instancia: instanciaDe(jornada.ronda),
          transmision: [], zona: o.zona || null, estructural: true });
        return;
      }
    }
    /* UN ENCABEZADO DE INSTANCIA corta la jornada y abre una etapa de la
       estructura. Se exige renglón corto: «La ventaja de campo será para
       el mejor posicionado» no es un título aunque diga «posicionado». */
    /* Sin números: «Del 7° al 10° disputarán el Play-In» es una regla, no
       el título de la sección. */
    const inst = (l.length <= 40 && !/\d/.test(l)) ? instanciaDe(l) : null;
    if (inst && inst.id !== 'OTRA' && inst.id !== 'REGULAR') {
      jornada = null;
      etapa = estructura.find(e => e.instancia === inst.id) || null;
      if (!etapa) {
        etapa = { instancia: inst.id, label: inst.label, orden: inst.orden, fechas: [], mejorDe: null };
        estructura.push(etapa);
      }
      return;
    }
    if (!etapa) return;
    fechasDeRenglon(l, ref).forEach((f) => { if (etapa.fechas.indexOf(f) === -1) etapa.fechas.push(f); });
    const md = sinAcentos(l).toLowerCase().match(/mejor de\s+(\d|uno|tres|cinco|siete)\b/);
    if (md) etapa.mejorDe = Number(md[1]) || NUMEROS_PALABRA[md[1]] || null;
  });
  if (!partidos.length && !estructura.length) {
    avisos.push('No se reconoció ninguna jornada: la página no tiene el formato «JORNADA N – día» con un cruce por renglón.');
  }
  return { partidos: partidos.sort(ordenar), avisos: avisos,
    estructura: estructura.map((e) => { e.fechas.sort(); return e; }) };
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
  volcala: {
    nombre: 'Volcala',
    porZona: true,
    variasUrls: true,
    parsear: parsearVolcala,
  },
  jornadas: {
    nombre: 'Página de texto con jornadas',
    porZona: true,
    variasUrls: true,
    parsear: parsearJornadas,
  },
  /* EL MODO DE PEGAR UN LINK Y LISTO. Cada URL elige su parser por el
     sitio (`adaptadorDeUrl`), así una zona puede juntar volcala con la nota
     de la federación, y un torneo nuevo no pide código: si el sitio no es
     uno conocido, se intenta como página de jornadas, y si tampoco
     cuadra, el aviso lo dice. */
  auto: {
    nombre: 'Automático por sitio',
    porZona: true,
    variasUrls: true,
    parsear: (html, o) => adaptadorDeUrl((o || {}).url).parsear(html, o),
  },
};

/* Los sitios con un parser propio. Lo que no está acá va al genérico. */
const SITIOS = [
  { re: /(^|\.)volcala\.com$/i, id: 'volcala' },
  { re: /(^|\.)basket-club\.com$/i, id: 'basket-club' },
  { re: /(^|\.)apdeb\.com\.ar$/i, id: 'apdeb' },
];

/** El adaptador que corresponde a una URL. Nunca `auto`: sería un ciclo. */
function adaptadorDeUrl(url) {
  let host = '';
  try { host = new URL(String(url || '')).hostname; } catch (e) { host = ''; }
  const s = SITIOS.find(x => x.re.test(host));
  return ADAPTADORES[s ? s.id : 'jornadas'];
}

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
    /* EL ORDEN IMPORTA POCO —la unión decide por informatividad, no por
       posición— pero se declara de más a menos detallada igual, para que
       leer la config diga cuál es la principal. `fixture` es la página
       ESTRUCTURAL de apdeb: el respaldo para el cruce que la programación
       todavía no publicó (punto 72). */
    const urls = (Array.isArray(v.urls) ? v.urls : [v.programacion, v.resultados, v.fixture, v.url])
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
  ESTADOS, ADAPTADORES, adaptador, adaptadorDeUrl, configDe,
  parsearBasketClub, parsearApdeb, parsearVolcala, parsearJornadas, instanciaDe, renglones, categoriasDe, numeroDe,
  clasificarEstado, fechaDesdeDDMM, fechaDesdeJornada, hora, texto, decodificar,
  equipoDelLibro, cruzarConLibro,
};
