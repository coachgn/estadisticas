#!/usr/bin/env node
/* =====================================================================
   El servidor REAL con un Google de mentira.

   Sirve para ejercer el panel entero contra la API —CORS incluido— sin
   una credencial de Google ni red. Es el mismo `crearApp()` de
   producción: lo único que se reemplaza es el `fetch` que habla con
   Sheets, que es exactamente el borde que no se puede probar sin
   credenciales.

     node server/bin/servidor-de-prueba.js [--puerto 3010]

   NO es para producción y no hace falta decirlo dos veces: sin este
   archivo el servidor no arranca sin credenciales, que es lo correcto.
   ===================================================================== */
'use strict';

require('../lib/env.js').cargar();
const { crearApp } = require('../app.js');
const { HOJAS } = require('../lib/config.js');

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i !== -1 ? process.argv[i + 1] : d;
};

/* Un libro chico pero con la forma REAL: encabezados en la fila 0,
   columna EQUIPO, y la fila TIPO que el panel usa como mediana. */
const LIBRO = {
  'PROMEDIOS E': [
    ['EQUIPO', 'FASE', 'PJ', 'PTS', 'eFG%', 'PACE', 'RTNG OFF', 'RTNG DEF', 'NET RTNG'],
    ['DEPORTIVO LA PLATA - MM', 'REGULAR', 12, 75.6, 0.48, 78.2, 104.1, 98.3, 5.8],
    ['A. MAYO - MM', 'REGULAR', 12, 71.2, 0.46, 74.1, 99.4, 101.2, -1.8],
    ['UNIVERSITARIO - MM', 'REGULAR', 12, 69.8, 0.44, 72.6, 97.1, 100.5, -3.4],
    ['EQUIPO TIPO', 'TOTAL', 12, 70.5, 0.46, 75.0, 100.0, 100.0, 0.0],
  ],
  'ACUMULADO E': [['EQUIPO', 'FASE', 'PTS'], ['DEPORTIVO LA PLATA - MM', 'REGULAR', 907]],
  'Base Datos E': [
    ['PARTIDO', 'EQUIPO', 'FECHA', 'CONDICION', 'FASE', 'PTS', 'PTSopp'],
    ['DEPORTIVO LA PLATA vs A. MAYO', 'DEPORTIVO LA PLATA - MM', '07/05/2026', 'LOCAL', 'REGULAR', 78, 71],
    ['DEPORTIVO LA PLATA vs A. MAYO', 'A. MAYO - MM', '07/05/2026', 'VISITANTE', 'REGULAR', 71, 78],
    ['A. MAYO vs UNIVERSITARIO', 'A. MAYO - MM', '14/05/2026', 'LOCAL', 'REGULAR', 66, 70],
    ['A. MAYO vs UNIVERSITARIO', 'UNIVERSITARIO - MM', '14/05/2026', 'VISITANTE', 'REGULAR', 70, 66],
  ],
  'PROMEDIOS 4F': [
    ['EQUIPO', 'FASE', 'PACE', 'eFG%', 'RTNG OFF', 'RTNG DEF', 'NET RTNG'],
    ['DEPORTIVO LA PLATA - MM', 'REGULAR', 78.2, 0.48, 104.1, 98.3, 5.8],
    ['A. MAYO - MM', 'REGULAR', 74.1, 0.46, 99.4, 101.2, -1.8],
    ['EQUIPO TIPO', 'TOTAL', 75.0, 0.46, 100.0, 100.0, 0.0],
  ],
  'ACUMULADO 4F': [['EQUIPO', 'FASE', 'POS'], ['DEPORTIVO LA PLATA - MM', 'REGULAR', 938]],
  '4 FACTORES': [
    ['PARTIDO', 'EQUIPO', 'FECHA', 'FASE', 'eFG%'],
    ['DEPORTIVO LA PLATA vs A. MAYO', 'DEPORTIVO LA PLATA - MM', '07/05/2026', 'REGULAR', 0.51],
  ],
  'PROMEDIOS J': [
    ['NOMBRES', 'EQUIPO', 'FASE', 'PJ', 'MIN', 'PTS', 'eFG%', 'PLAYS'],
    ['BOTTE, IGNACIO', 'DEPORTIVO LA PLATA - MM', 'REGULAR', 12, 28.4, 14.2, 0.49, 15.1],
    ['BORRAJO, FRANCISCO', 'A. MAYO - MM', 'REGULAR', 12, 31.1, 17.9, 0.51, 18.3],
    ['JUGADOR TIPO', '', 'TOTAL', 10, 22.7, 8.1, 0.45, 9.2],
  ],
  'ACUMULADO J': [['NOMBRES', 'EQUIPO', 'FASE', 'PTS'], ['BOTTE, IGNACIO', 'DEPORTIVO LA PLATA - MM', 'REGULAR', 170]],
  'Base Datos J': [
    ['PARTIDO', 'NOMBRES', 'EQUIPO', 'FECHA', 'FASE', 'MIN', 'PTS'],
    ['DEPORTIVO LA PLATA vs A. MAYO', 'BOTTE, IGNACIO', 'DEPORTIVO LA PLATA - MM', '07/05/2026', 'REGULAR', 30, 18],
    ['A. MAYO vs UNIVERSITARIO', 'BORRAJO, FRANCISCO', 'A. MAYO - MM', '14/05/2026', 'REGULAR', 33, 22],
  ],
};

/* El render de TEXTO: lo que Sheets devolvería ya formateado. Se escribe
   a mano y distinto del crudo a propósito —comas decimales, porcentajes—
   para que se note si el panel toma uno por el otro. */
function comoTexto(m) {
  return m.map((fila, i) => i === 0 ? fila : fila.map(v =>
    typeof v !== 'number' ? String(v)
      : (v > 0 && v < 1 ? (v * 100).toFixed(2).replace('.', ',') + '%'
        : String(v).replace('.', ','))));
}

const googleFalso = (url) => {
  if (String(url).indexOf('oauth2.googleapis.com') !== -1) {
    return Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ access_token: 'de-mentira', expires_in: 3600 }) });
  }
  const pedidos = String(url).split('ranges=').slice(1)
    .map(x => decodeURIComponent(x.split('&')[0]));
  const nombres = pedidos.length ? pedidos : HOJAS;
  const texto = /valueRenderOption=FORMATTED_VALUE/.test(String(url));
  return Promise.resolve({ ok: true, status: 200,
    json: () => Promise.resolve({
      valueRanges: nombres.map(h => ({
        range: h,
        values: texto ? comoTexto(LIBRO[h] || []) : (LIBRO[h] || []),
      })),
    }) });
};

const puerto = Number(arg('puerto', process.env.PORT || 3010));
crearApp({ deps: { fetch: googleFalso } }).listen(puerto, () => {
  console.log('SGADD API (Google de mentira) en http://localhost:' + puerto);
});
