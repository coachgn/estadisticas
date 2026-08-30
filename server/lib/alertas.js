/* =====================================================================
   DETECCIÓN DE ALERTAS EN EL SERVIDOR

   El buzón necesita saber qué jugadores de la liga dejaron de jugar. Ese
   cálculo necesita el log partido a partido —`Base Datos J`— que es
   justamente lo que el recorte NO le manda al cliente por sus rivales.

   La salida de acá es la LISTA DE ALERTAS YA PROCESADA: texto y unos
   pocos números. Ninguna fila de `Base Datos J` cruza al navegador.

   ---------------------------------------------------------------------
   NO SE REIMPLEMENTA NADA, Y ESA ES LA DECISIÓN

   La tentación era escribir acá un join partido-a-jugador y un contador
   de rachas. Habría sido una segunda implementación de dos cosas que en
   este proyecto costaron caro:

     · el JOIN. La `FECHA` de `Base Datos J` puede venir vacía, así que se
       hereda de `Base Datos E` ANTES de calcular el `__id` — parchearla
       después no sirve porque el id ya está hecho. Y si un mismo texto de
       `PARTIDO` aparece con dos fechas distintas, NO se hereda: en una
       liga con ida y vuelta los dos cruces se escriben igual, y atribuirle
       a un jugador la noche equivocada no se nota y le contamina el log,
       el desvío y los atípicos (punto 3 quater de CLAUDE.md).

     · el ANTI-SPAM del detector. La regla de los 4 partidos sola marcaba
       al 24% de la liga, y un buzón que se abre con 50 tarjetas no se lee.
       Los dos filtros —tenía partidos previos, y era rotación de verdad—
       están calibrados contra datos reales (punto 13).

   Así que el servidor CORRE EL MISMO CÓDIGO que el navegador:
   `construirIndice()` arma el índice y `detectarAlertas()` detecta. Los
   dos módulos vienen de `js/` por `bin/sincronizar-compartido.js`, con su
   test de drift. Si mañana cambia una regla, cambia en los dos lados a la
   vez o la suite falla.
   ===================================================================== */
'use strict';

/* `sgadd-estados.js` usa `SGADD` como GLOBAL —es un módulo pensado para el
   navegador, donde el núcleo es una variable global— así que hay que
   dejarlo puesto antes de requerirlo. Es lo mismo que hace
   `test-estados.js` para poder correrlo en Node. */
const NUCLEO = require('./compartido/sgadd-core.js');
if (typeof global.SGADD === 'undefined') global.SGADD = NUCLEO;

const ESTADOS = require('./compartido/sgadd-estados.js');
const DATOS = require('./compartido/sgadd-data.js');
const { entorno } = require('./config.js');

/* Las alertas dependen del TRAMO que se esté mirando: los mismos equipos
   en IDA y en VUELTA son dos competencias distintas, y una racha se
   cuenta dentro de una sola (punto 3 ter). Por eso la clave del caché
   lleva los tres. */
const cache = new Map();

/**
 * Pasa las matrices crudas de Sheets a la forma que consume el índice.
 * Reusa el MISMO adaptador que el frontend: si los dos convirtieran por su
 * cuenta, un día una fila vacía se descartaría de un lado y del otro no.
 */
function aFormatoIndice(hojas) {
  const out = {};
  Object.keys(hojas || {}).forEach(h => { out[h] = DATOS.matrizAFilas(hojas[h]); });
  return out;
}

/**
 * Las alertas de TODA la liga para un tramo.
 *
 * @param {object} libro   lo que devuelve `obtenerLibro` (matrices crudas)
 * @param {object} tramo   { fase, torneo } · si faltan, se usan los del libro
 * @returns {{alertas: Array, fase, torneo, jugadores: number}}
 */
function alertasDeLaLiga(libro, tramo, opciones) {
  const o = opciones || {};
  const t = tramo || {};
  const hojas = aFormatoIndice((libro && libro.hojas) || {});

  /* EL TRAMO SE RESUELVE COMO EN EL PANEL, Y ESTO ESTABA MAL DE DOS FORMAS.

     1 · `torneoPorDefecto()` recibía `hojas` donde espera la LISTA de
     torneos. Con un objeto en vez de un array, `l.length` es `undefined` y
     la función devolvía siempre `GENERAL` — que NO es un torneo sino el
     centinela de "no scopear". O sea que las alertas se calculaban sobre
     un índice SIN SCOPE cada vez que el cliente no mandaba un torneo
     válido: IDA y VUELTA colapsados, los promedios del segundo pisando a
     los del primero y cada jugador contado dos veces. Es exactamente el
     defecto que el punto 3 ter existe para evitar, y no daba ningún
     síntoma: salían alertas, solo que de una liga que no existe.

     2 · `torneosDisponibles()` NO conoce al torneo sintético `*TOTAL*`,
     porque no sale de ninguna celda. Desde que el panel abre por el TOTAL,
     el cliente lo pide en cada carga y acá se rechazaba por inexistente.

     La lista buena es la de TRAMOS —la misma que enumera el selector—, que
     incluye al sintético y además valida el PAR: un libro puede traer IDA y
     VUELTA en REGULAR y solo VUELTA en PLAYOFF. */
  const fases = NUCLEO.fasesDisponibles(hojas).map(f => f.id);
  const fase = (t.fase && fases.indexOf(t.fase) !== -1) ? t.fase : (fases[0] || 'REGULAR');

  const tramos = NUCLEO.combinacionesTorneoFase(hojas);
  const pedido = t.torneo ? (t.torneo + '|' + fase) : null;
  let torneo;
  if (pedido && tramos.some(x => x.id === pedido)) {
    torneo = t.torneo;
  } else {
    /* El mismo criterio que el panel, para que las alertas describan el
       tramo que el DT tiene delante. Sin un solo tramo enumerable se cae a
       la lista de torneos sueltos, que es de donde venía. */
    const mejor = NUCLEO.tramoPorDefecto(tramos.filter(x => x.fase === fase));
    torneo = mejor ? mejor.torneo
      : NUCLEO.torneoPorDefecto(NUCLEO.torneosDisponibles(hojas));
  }

  const clave = (o.claveCache || '') + '|' + fase + '|' + torneo;
  const ahora = Date.now();
  const guardado = cache.get(clave);
  if (guardado && guardado.venceEn > ahora) return guardado.datos;

  const idx = NUCLEO.construirIndice(hojas, { fase: fase, torneo: torneo });

  /* EL MAPA DE ESTADOS VA VACÍO, y es a propósito.

     `detectarAlertas` saltea a los que el DT ya contestó, y esas
     respuestas viven en el `localStorage` DE SU NAVEGADOR: el servidor no
     las tiene ni las quiere. Se detecta todo y el cliente filtra lo que ya
     resolvió — que además es lo correcto si dos personas del cuerpo
     técnico usan el panel con estados distintos.

     Consecuencia: los REINGRESOS no se calculan acá. Ese detector solo
     dispara sobre jugadores que el DT marcó como ausentes, así que sin su
     mapa no tiene sobre quién correr. Sigue del lado del cliente, donde
     está el dato. */
  const alertas = [].concat(
    ESTADOS.detectarTraspasos(idx, {}),
    ESTADOS.detectarInactividad(idx, {}));

  const datos = {
    alertas: alertas.map(limpiar),
    fase: fase,
    torneo: torneo,
    jugadores: (idx.liga.jugadores || []).length,
  };

  /* Se cachea con el mismo TTL que las hojas: el dato de entrada es el
     mismo y recalcular el índice en cada request es lo más caro del
     endpoint. */
  cache.set(clave, { datos: datos, venceEn: ahora + (o.ttlMs || entorno().ttlCacheMs) });
  return datos;
}

/* LISTA BLANCA de campos, no lista negra.

   Con una lista negra, el campo que el detector agregue mañana viaja solo.
   Acá se copia lo que la UI del buzón consume y nada más — si falta algo,
   se ve enseguida en pantalla; si sobra, no se ve nunca.

   `pjPrevios` y `minPrevio` sí son números de un rival, y van a propósito:
   son exactamente los que el propio texto de la alerta ya dice ("antes
   jugó 8 con 19,9 min de promedio"). Sin ellos la alerta no se puede
   auditar, que es justo lo que hace que el DT le crea. Lo que NO va es de
   dónde salieron: ni un `__id` de partido, ni una fila del log. */
const CAMPOS = ['tipo', 'nivel', 'clave', 'nombre', 'equipo', 'detalle',
  'sugerencias', 'racha', 'pjPrevios', 'minPrevio', 'equipos', 'esActual'];

function limpiar(a) {
  const out = {};
  CAMPOS.forEach(k => { if (a[k] !== undefined) out[k] = a[k]; });
  return out;
}

function limpiarCache() { cache.clear(); }

module.exports = { alertasDeLaLiga, aFormatoIndice, limpiar, limpiarCache, CAMPOS };
