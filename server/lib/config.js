/* =====================================================================
   Configuración del servidor · el entorno y el catálogo privado

   ACÁ ESTÁ EL PUNTO ENTERO DEL BACKEND: el mapa slug → sheetId vive de
   este lado y NUNCA se serializa a una respuesta.

   Hoy los `sheetId` están en `clubes/<club>.json`, que GitHub Pages sirve
   como archivo público: cualquiera lo abre, saca el id y lee la planilla
   entera por GViz sin pasar por el panel. Mientras ese archivo exista con
   los ids adentro, el backend no protege nada — la migración incluye
   vaciar ese campo del JSON público.
   ===================================================================== */
'use strict';

/* --------------------------------------------------------------------
   EL CATÁLOGO PRIVADO

   Un club tiene N categorías y cada una es un Sheet aparte (punto 18 de
   CLAUDE.md). El frontend va a conocer solo los slugs.

   En producción esto sale de una base o de una variable de entorno; acá
   va literal porque es un PoC y porque tenerlo a la vista hace evidente
   qué es lo que NO puede cruzar al cliente.
   -------------------------------------------------------------------- */
/* EL CATÁLOGO PRIVADO · slug → sheetId

   El frontend conoce SOLO el slug (`deportivo-primera`), que es una
   cadena opaca: no sirve para nada sin este mapa. El `sheetId` real vive
   en el entorno del servidor y no se serializa NUNCA.

   Los slugs van literales y los ids salen del entorno, no al revés: así
   el catálogo se puede leer para saber qué categorías existen sin tener
   una sola credencial a mano, y un `.env` incompleto se nota (la
   categoría queda `activo: false`) en vez de romper. */
const CATALOGO = {
  deportivo: {
    nombre: 'Deportivo La Plata',
    liga: 'la-plata',
    /* El equipo propio del club, para el gate de "su" ficha. Se compara
       con `claveEquipo()`, así que va como lo escribe la planilla —
       OJO con la letra: `RECONQUISTA A` y `RECONQUISTA` no son lo mismo
       (punto 19 de CLAUDE.md). */
    equipoPropio: 'DEPORTIVO LA PLATA',
    categorias: {
      'deportivo-primera': {
        label: 'Primera 2026',
        sheetId: process.env.SHEET_DEPORTIVO_PRIMERA || '',
      },
    },
  },
  reconquista: {
    nombre: 'Club Reconquista La Plata',
    liga: 'la-plata',
    equipoPropio: 'RECONQUISTA A',
    categorias: {
      'reconquista-primera': {
        label: 'Primera · Vuelta 2026',
        sheetId: process.env.SHEET_RECONQUISTA_PRIMERA || '',
      },
      /* OJO: el JSON público traía para la U21 un id que devuelve 401 por
         GViz y *entity not found* por Drive — el archivo no existe. El
         bueno es `1wNpSkd…` y estaba SOLO en el respaldo de
         `sgadd-core.js` (el bug de las dos fuentes del punto 6, que la
         migración a slugs cierra de raíz). Al completar el `.env` va el
         BUENO. */
      'reconquista-u21': {
        label: 'Masculina Naranja · U21',
        sheetId: process.env.SHEET_RECONQUISTA_U21 || '',
      },
      'reconquista-u23': {
        label: 'Masculina Naranja · U23',
        sheetId: process.env.SHEET_RECONQUISTA_U23 || '',
      },
    },
  },
  jujuy: {
    nombre: 'Jujuy Basquet',
    liga: 'liga-argentina',
    equipoPropio: 'JUJUY BASQUET',
    categorias: {
      'jujuy-primera': {
        label: 'Conferencia Norte',
        sheetId: process.env.SHEET_JUJUY_PRIMERA || '',
      },
    },
  },
};

/* Las hojas que la capa vieja de Principal necesita EN TEXTO, además de
   los valores crudos.

   Esa capa consume el `formatted` que le daba GViz —el texto ya armado
   por Sheets— y reproducirlo del lado del cliente da 40% de precisión
   sobre 157.278 celdas: cada columna tiene su propio patrón en la
   planilla y sin el `pattern` no se adivina (punto 3 de CLAUDE.md).

   Así que no se reproduce: se le pide a Google la segunda vista. Son
   cuatro hojas y una petición más, no las nueve. */
const HOJAS_TEXTO = ['PROMEDIOS E', 'Base Datos E', 'PROMEDIOS J', 'PROMEDIOS 4F'];
/* Las 9 hojas del contrato (punto 3 de CLAUDE.md). `RANKINGS J` y
   `RANKINGS E` quedan afuera a propósito: no son tablas, son bloques
   apilados con encabezados repetidos, y la API devuelve basura. Los
   rankings se derivan en el cliente. */
const HOJAS = [
  'PROMEDIOS E', 'ACUMULADO E', 'Base Datos E',
  'PROMEDIOS 4F', 'ACUMULADO 4F', '4 FACTORES',
  'PROMEDIOS J', 'ACUMULADO J', 'Base Datos J',
];

function entorno() {
  return {
    /* LA CLAVE PRIVADA TRAE `\n` LITERALES.

       En un `.env` —y en el panel de variables de Vercel— el salto de
       línea se escribe como los dos caracteres `\` y `n`. Sin convertirlos
       a saltos reales, `crypto.sign` falla con un error de OpenSSL que no
       menciona el problema. Es el error número uno de las Service
       Accounts y cuesta una tarde encontrarlo. */
    googleEmail: (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim(),
    googleKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),

    jwtSecret: process.env.JWT_SECRET || '',
    /* Vacío = ningún origen permitido, y eso es lo correcto: preferimos
       que el PoC no responda a nadie antes que responder a todos. */
    origenes: (process.env.ORIGENES_PERMITIDOS || '')
      .split(',').map(s => s.trim()).filter(Boolean),
    puerto: Number(process.env.PORT || 3000),
    /* Techo de peticiones por ventana. Ver la advertencia de
       `app.js`: en serverless esto NO limita de verdad. */
    rateMax: Number(process.env.RATE_LIMIT_MAX || 60),
    rateVentanaMs: Number(process.env.RATE_LIMIT_VENTANA_MS || 60000),
    ttlCacheMs: Number(process.env.TTL_CACHE_MS || 5 * 60 * 1000),
  };
}

/**
 * Resuelve slug → configuración de la categoría.
 * Devuelve `null` si no existe: nunca lanza, para que el handler pueda
 * contestar 404 sin distinguir "club que no existe" de "categoría que no
 * existe" — las dos son lo mismo para quien pregunta.
 */
function resolverCategoria(clubId, slugCategoria) {
  const club = CATALOGO[String(clubId || '').trim().toLowerCase()];
  if (!club) return null;
  const ids = Object.keys(club.categorias);
  /* Sin categoría se abre la primera del club. Es lo mismo que hace el
     selector del panel al arrancar. */
  const catId = String(slugCategoria || ids[0] || '').trim().toLowerCase();
  const cat = club.categorias[catId];
  if (!cat) return null;
  return {
    clubId: String(clubId).toLowerCase(),
    club: club.nombre,
    liga: club.liga,
    equipoPropio: club.equipoPropio,
    slug: catId,
    label: cat.label,
    sheetId: cat.sheetId,
  };
}

/** Los slugs que el frontend SÍ puede conocer. Sin un solo `sheetId`. */
function catalogoPublico() {
  return Object.keys(CATALOGO).map(id => ({
    id: id,
    nombre: CATALOGO[id].nombre,
    liga: CATALOGO[id].liga,
    categorias: Object.keys(CATALOGO[id].categorias).map(c => ({
      slug: c,
      label: CATALOGO[id].categorias[c].label,
      /* `activo` reemplaza al `sheetId` como señal de "esta categoría ya
         tiene libro". Es la misma idea que `activo: !!sheetId` del
         frontend (punto 6), pero sin revelar el id. */
      activo: !!CATALOGO[id].categorias[c].sheetId,
    })),
  }));
}

module.exports = { CATALOGO, HOJAS, HOJAS_TEXTO, entorno, resolverCategoria, catalogoPublico };
