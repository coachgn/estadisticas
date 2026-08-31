/* =====================================================================
   El filtrado SERVER-SIDE

   Acá está la diferencia entre el gate de interfaz y la seguridad real:
   estas funciones no deciden qué MOSTRAR, deciden qué SALE del servidor.
   Lo que se recorta acá no llega al navegador ni con la consola abierta.

   Las reglas son las mismas que corren en el cliente (`js/sgadd-auth.js`);
   lo único que cambia es que este lado además borra los datos.
   ===================================================================== */
'use strict';

const AUTH = require('./compartido/sgadd-auth.js');
const NUCLEO = require('./compartido/sgadd-core.js');

/* Qué bloques de la respuesta pide cada plan. Es el equivalente de datos
   de la matriz `MODULOS` del frontend, que es de secciones.

   Van declarados y no inferidos de `MODULOS` porque son dos preguntas
   distintas: `MODULOS` dice a qué PANTALLA se entra, esto dice qué CAMPOS
   viajan. Un día puede haber una pantalla abierta con un bloque Pro
   adentro. */
const BLOQUES = {
  equipos: { plan: null },
  jugadores: { plan: null },
  clasificacion: { plan: null },
  rankings: { plan: null },
  /* El informe pre-partido es lo que separa Básico de Pro. */
  scouting: { plan: AUTH.PLANES.PLATA },
};

/**
 * ¿Puede pedir este bloque de datos?
 * @returns {{ok, motivo, plan}}
 */
function puedeBloque(bloque, sesion) {
  const regla = Object.prototype.hasOwnProperty.call(BLOQUES, bloque)
    ? BLOQUES[bloque] : null;
  /* Un bloque que nadie declaró se trata como CERRADO, al revés que las
     secciones del frontend.

     La asimetría es a propósito: allá una sección sin declarar cae a
     abierta para no romper el panel al agregar una pantalla, y el costo es
     una pantalla de más. Acá el costo de un default permisivo es filtrar
     datos, así que un bloque que nadie pensó no se sirve. */
  if (!regla) return { ok: false, motivo: 'BLOQUE_DESCONOCIDO', plan: null };
  if (AUTH.sinRestricciones(sesion)) return { ok: true, motivo: AUTH.MOTIVOS.OK, plan: null };
  if (regla.plan && !AUTH.tieneModulo('scouting', sesion)) {
    return { ok: false, motivo: AUTH.MOTIVOS.REQUIERE_PLAN, plan: regla.plan };
  }
  return { ok: true, motivo: AUTH.MOTIVOS.OK, plan: null };
}

/**
 * Recorta las filas de una hoja a las del equipo autorizado.
 *
 * `filasDeEquipo` recibe la matriz cruda de Sheets (fila 0 = encabezados)
 * y devuelve la misma matriz con solo las filas cuyo `EQUIPO` el usuario
 * puede ver, más los encabezados.
 *
 * LA FILA `EQUIPO TIPO` SE CONSERVA SIEMPRE, y no es una excepción menor:
 * es la MEDIANA de la liga (punto 3 de CLAUDE.md) y de ella salen todos
 * los percentiles, las bandas z y los umbrales del panel. Sin ella, el
 * cliente recibe sus propios números sin nada contra qué compararlos, que
 * es exactamente el valor del producto. No es el dato de otro club: es el
 * agregado de la competencia.
 */
/**
 * QUÉ FILAS SOBREVIVEN, por índice.
 *
 * Devuelve los índices que se conservan en vez de la matriz recortada, y
 * eso NO es un detalle de implementación: el servidor manda DOS vistas de
 * la misma hoja (los valores crudos y el texto formateado), y si cada una
 * se filtrara por su cuenta podrían desalinearse — el panel mostraría el
 * número de una fila con el texto de otra, sin ningún síntoma.
 *
 * Se decide UNA vez, sobre los valores, y se aplica a las dos.
 */
function indicesPermitidos(filas, sesion, opciones) {
  const o = opciones || {};
  const arr = Array.isArray(filas) ? filas : [];
  if (!arr.length) return [];
  if (AUTH.sinRestricciones(sesion)) return arr.map((_, i) => i);

  const cab = arr[0] || [];
  const iEquipo = cab.findIndex(c => String(c || '').trim().toUpperCase() === 'EQUIPO');
  /* Sin columna EQUIPO no se puede filtrar por equipo. Se devuelve solo el
     encabezado y no todo: no saber a quién pertenece una fila no es motivo
     para entregarla. */
  if (iEquipo === -1) return [0];

  const out = [0];
  for (let i = 1; i < arr.length; i++) {
    const bruto = String(arr[i][iEquipo] || '').trim();
    /* LA FILA TIPO SE CONSERVA SIEMPRE, y no es una excepción menor: es la
       MEDIANA de la liga (punto 3 de CLAUDE.md) y de ella salen todos los
       percentiles, las bandas z y los umbrales del panel. Sin ella el
       cliente recibe sus propios números sin nada contra qué compararlos,
       que es exactamente el valor del producto. No es el dato de otro
       club: es el agregado de la competencia. */
    const esTipo = !o.soloPropio &&
      (bruto.toUpperCase().indexOf('EQUIPO TIPO') !== -1 || bruto === '');
    if (esTipo || AUTH.puedeVerEquipo(bruto, sesion)) out.push(i);
  }
  return out;
}

/** Aplica una lista de índices a una matriz. */
function tomar(filas, indices) {
  const arr = Array.isArray(filas) ? filas : [];
  return indices.filter(i => i < arr.length).map(i => arr[i]);
}

function filasDeEquipo(filas, sesion, opciones) {
  return tomar(filas, indicesPermitidos(filas, sesion, opciones));
}

/**
 * Recorta las filas de jugador al plantel autorizado. Misma lógica, pero
 * la columna de referencia sigue siendo `EQUIPO`: un jugador se autoriza
 * por su equipo y NO por su nombre, porque dos homónimos de equipos
 * distintos abrirían el que no es (punto 8).
 */
function filasDeJugador(filas, sesion) {
  return filasDeEquipo(filas, sesion);
}

/**
 * Los partidos donde JUEGA su equipo.
 *
 * Un partido tiene dos lados y el rival aparece en el texto `A vs B` sí o
 * sí: no se puede entregar el box score propio escondiendo contra quién
 * fue. Lo que sí se recorta son los partidos AJENOS, que es donde estaría
 * el scouting encubierto — mirar la liga entera partido a partido es
 * exactamente lo que separa al Pro.
 *
 * `soloPropio` porque acá NO hay fila TIPO que preservar: en una hoja
 * partido a partido, una fila sin equipo es una fila rota, no la mediana.
 */
function partidosDeEquipo(filas, sesion) {
  return tomar(filas, indicesPermitidos(filas, sesion, { soloPropio: true }));
}
/**
 * La tabla de posiciones y los rankings de liga van COMPLETOS, y eso es
 * la propiedad, no un agujero.
 *
 * Comparar contra la liga entera es el valor del panel, y no expone nada
 * que la tabla de posiciones de la federación no publique ya. Lo que se
 * protege es el ANÁLISIS en profundidad de un plantel ajeno, no el
 * resultado de los partidos.
 */
function tablaCompleta(filas) { return filas; }

/**
 * El recorte completo de un libro, según la sesión.
 *
 * @returns {{hojas, recortadas: string[], completas: string[]}}
 */
/* COLUMNAS QUE NO SALEN NUNCA, para NADIE — ni para un admin.

   `ID_ARCHIVO` la escribe MotorStats desde su v43 en las tres maestras:
   es el id de Drive del box score de origen. El panel la lee y NO la usa
   en ninguna vista (punto 3 de CLAUDE.md).

   Mandarla al navegador contradice el objetivo entero de la migración —
   sacar los ids de Google del lado del cliente— por una columna que
   nadie mira. Medido contra la planilla real de DEPORTIVO: **76 ids
   distintos en 460 filas**, y 152 de esas van en `Base Datos E`, que se
   entrega COMPLETA hasta al cliente más restringido porque de ahí sale
   la tabla de posiciones.

   Se corta para todos y no solo para los clientes: el navegador de un
   admin sigue siendo un navegador, y la columna no le sirve tampoco.

   El día que el panel necesite `ID_ARCHIVO` para algo, lo que hay que
   servir es un identificador propio, no el de Drive. */
const COLUMNAS_OCULTAS = ['ID_ARCHIVO'];

/**
 * Saca las columnas ocultas de una matriz.
 *
 * Se resuelve por NOMBRE de encabezado y no por posición: el motor
 * agrega columnas entre versiones (punto 3), así que un índice fijo
 * empezaría a cortar la columna equivocada sin ningún síntoma.
 */
function sinColumnasOcultas(filas) {
  const m = Array.isArray(filas) ? filas : [];
  if (!m.length) return m;
  const cab = m[0] || [];
  const fuera = [];
  cab.forEach((c, k) => {
    if (COLUMNAS_OCULTAS.indexOf(String(c || '').trim().toUpperCase()) !== -1) fuera.push(k);
  });
  if (!fuera.length) return m;
  return m.map(fila => (fila || []).filter((_, k) => fuera.indexOf(k) === -1));
}

/* --------------------------------------------------------------------
   QUÉ SE RECORTA Y QUÉ NO

   La línea NO está en "propio contra ajeno": está entre el BENCHMARK de
   la competencia y el ANÁLISIS de un plantel.

   Todo el valor del panel es comparativo. Un PACE de 76 no dice nada; lo
   que dice algo es el percentil contra la liga (punto 4 de CLAUDE.md).
   Recortar los agregados de temporada no protegía un dato sensible: le
   sacaba al cliente la mitad del producto y —peor— lo hacía en silencio.

   MEDIDO en producción antes de este cambio, con la sesión de DEPORTIVO:

     · el scatter ORTG/DRTG de Principal quedaba con UN punto de 12;
     · los rankings de Equipos y el Top 20 de Jugadores, con un equipo y
       un plantel;
     · el informe de scouting se armaba igual pero con el rival en `—`;
     · y lo peor: los percentiles del PROPIO equipo salían 50 en TODAS
       las métricas, porque la distribución tenía n=1. Eso no se lee como
       "falta el dato", se lee como "está en el promedio".

   LO QUE SIGUE BLOQUEADO es el log partido a partido (`Base Datos J`),
   que es lo que hace "profunda" a una ficha: la evolución, el tab
   Partidos, los rendimientos atípicos, el split local/visitante y el
   perfil de tiro salen todos de ahí. Sin eso, un rival tiene su promedio
   de temporada —el mismo número que muestra cualquier ranking— y nada
   más.

   Y la interfaz sigue bloqueando la ficha del rival, que es lo que
   separa un plan del otro.
   -------------------------------------------------------------------- */

/* La ÚNICA hoja que se recorta. Va como lista para que agregar otra sea
   explícito: el default es servir, no esconder — al revés que antes, y a
   propósito. */
const HOJAS_RECORTADAS = ['Base Datos J'];

function recortarLibro(libro, sesion) {
  const hojas = (libro && libro.hojas) || {};
  const texto = (libro && libro.hojasTexto) || {};
  const salida = {};
  const salidaTexto = {};
  const recortadas = [];
  const completas = [];

  Object.keys(hojas).forEach(h => {
    const recortar = !AUTH.sinRestricciones(sesion) && HOJAS_RECORTADAS.indexOf(h) !== -1;
    if (!recortar) {
      salida[h] = sinColumnasOcultas(hojas[h]);
      if (texto[h]) salidaTexto[h] = sinColumnasOcultas(texto[h]);
      completas.push(h);
      return;
    }
    /* LOS MISMOS ÍNDICES para las dos vistas: si cada una se filtrara por
       su cuenta podrían desalinearse y el panel mostraría el número de una
       fila con el texto de otra.

       `soloPropio` porque en una hoja partido a partido una fila sin
       equipo es una fila rota, no la mediana de la liga. */
    const idx = indicesPermitidos(hojas[h], sesion, { soloPropio: true });
    salida[h] = sinColumnasOcultas(tomar(hojas[h], idx));
    if (texto[h]) salidaTexto[h] = sinColumnasOcultas(tomar(texto[h], idx));
    recortadas.push(h);
  });

  return { hojas: salida, hojasTexto: salidaTexto, recortadas, completas };
}
/** Aplica una transformación a cada hoja de un objeto {nombre: matriz}. */
function mapear(hojas, fn) {
  const out = {};
  Object.keys(hojas || {}).forEach(h => { out[h] = fn(hojas[h]); });
  return out;
}

/* --------------------------------------------------------------------
   EL PADRÓN DE LA LIGA

   Nombre y equipo de TODOS los jugadores del torneo, sin una sola
   estadística. Es lo que el buzón necesita para que el buscador global
   funcione: el DT tiene que poder marcarle una lesión o una baja a
   cualquiera, esté o no en su plantel.

   POR QUÉ ESTO NO ABRE EL AGUJERO QUE EL RECORTE CERRÓ

   Lo que se protege es el ANÁLISIS de un plantel ajeno —minutos,
   eficiencia, evolución, el log partido a partido—, no la existencia de
   sus jugadores. Quién juega en cada club es público: está en la tabla
   de posiciones, en los box scores de la federación y en cualquier
   transmisión. Ocultar el nombre no protege nada y rompe una
   funcionalidad real.

   La línea está en las COLUMNAS: acá van dos, y ninguna es un número.
   Si alguna vez alguien agrega `MIN` o `PTS` a este bloque, se filtró
   justo lo que el recorte de `PROMEDIOS J` bloquea — hay un test que lo
   fija por lista blanca, no por lista negra.
   -------------------------------------------------------------------- */
const PADRON_CAMPOS = ['nombre', 'equipo'];

function padronLiga(hojas) {
  const filas = (hojas && hojas['PROMEDIOS J']) || [];
  if (filas.length < 2) return [];
  const cab = filas[0] || [];
  const iNombre = cab.findIndex(c => String(c || '').trim().toUpperCase() === 'NOMBRES');
  const iEquipo = cab.findIndex(c => String(c || '').trim().toUpperCase() === 'EQUIPO');
  if (iNombre === -1 || iEquipo === -1) return [];

  /* Un jugador aparece una vez por FASE y por TORNEO, así que la misma
     persona viene repetida. Se deduplica por nombre + equipo, que es la
     clave con la que el buzón guarda los estados (punto 13). */
  const vistos = new Set();
  const out = [];
  for (let i = 1; i < filas.length; i++) {
    const nombre = String(filas[i][iNombre] || '').trim();
    const equipo = String(filas[i][iEquipo] || '').trim();
    if (!nombre || !equipo) continue;
    /* La fila JUGADOR TIPO es la MEDIANA de la liga, no una persona:
       ofrecerla en el buscador dejaría marcarle una lesión a una
       estadística. */
    if (nombre.toUpperCase().indexOf('JUGADOR TIPO') !== -1) continue;
    const k = nombre + '|' + equipo;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ nombre: nombre, equipo: equipo });
  }
  return out;
}

/** ¿El equipo que se pide es uno que esta sesión puede analizar? */
function puedeAnalizarEquipo(equipo, sesion) {
  if (!equipo) return true;
  return AUTH.puedeVerEquipo(equipo, sesion);
}

/** Normaliza igual que el frontend, para que el 403 no dependa del sufijo. */
function clave(v) { return NUCLEO.claveEquipo(v || ''); }

module.exports = {
  BLOQUES, puedeBloque, filasDeEquipo, filasDeJugador, partidosDeEquipo,
  indicesPermitidos, tomar, COLUMNAS_OCULTAS, sinColumnasOcultas, mapear,
  padronLiga, PADRON_CAMPOS, HOJAS_RECORTADAS,
  tablaCompleta, recortarLibro, puedeAnalizarEquipo, clave,
};
