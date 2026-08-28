/* =====================================================================
   El filtrado SERVER-SIDE

   Acá está la diferencia entre el gate de interfaz y la seguridad real:
   estas funciones no deciden qué MOSTRAR, deciden qué SALE del servidor.
   Lo que se recorta acá no llega al navegador ni con la consola abierta.

   Las reglas son las mismas que corren en el cliente (`js/sgadd-auth.js`);
   lo único que cambia es que este lado además borra los datos.
   ===================================================================== */
'use strict';

const AUTH = require('../../js/sgadd-auth.js');
const NUCLEO = require('../../js/sgadd-core.js');

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
  scouting: { plan: AUTH.PLANES.PRO },
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
function recortarLibro(libro, sesion) {
  const hojas = (libro && libro.hojas) || {};
  const texto = (libro && libro.hojasTexto) || {};
  const salida = {};
  const salidaTexto = {};
  const recortadas = [];
  const completas = [];

  const POR_EQUIPO = ['PROMEDIOS E', 'ACUMULADO E', 'PROMEDIOS 4F', 'ACUMULADO 4F'];
  const POR_JUGADOR = ['PROMEDIOS J', 'ACUMULADO J'];
  const POR_PARTIDO = ['Base Datos J'];
  /* `Base Datos E` y `4 FACTORES` van completas: de ahí sale la tabla de
     posiciones y los factores de liga, que son públicos. Recortarlas
     dejaría al cliente sin poder ver el torneo. */
  const ENTERAS = ['Base Datos E', '4 FACTORES'];

  Object.keys(hojas).forEach(h => {
    const libre = AUTH.sinRestricciones(sesion) || ENTERAS.indexOf(h) !== -1
      || (POR_EQUIPO.indexOf(h) === -1 && POR_JUGADOR.indexOf(h) === -1
          && POR_PARTIDO.indexOf(h) === -1);
    if (libre) {
      salida[h] = hojas[h];
      if (texto[h]) salidaTexto[h] = texto[h];
      completas.push(h);
      return;
    }
    /* LOS MISMOS ÍNDICES para las dos vistas: si cada una se filtrara por
       su cuenta podrían desalinearse y el panel mostraría el número de una
       fila con el texto de otra. */
    const idx = indicesPermitidos(hojas[h], sesion,
      { soloPropio: POR_PARTIDO.indexOf(h) !== -1 });
    salida[h] = tomar(hojas[h], idx);
    if (texto[h]) salidaTexto[h] = tomar(texto[h], idx);
    recortadas.push(h);
  });

  return { hojas: salida, hojasTexto: salidaTexto, recortadas, completas };
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
  indicesPermitidos, tomar,
  tablaCompleta, recortarLibro, puedeAnalizarEquipo, clave,
};
