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
const CATALOGO = {
  deportivo: {
    nombre: 'Deportivo La Plata',
    liga: 'la-plata',
    /* El equipo propio del club, para el gate de "su" ficha. Se compara
       con `claveEquipo()`, así que va como lo escribe la planilla —
       OJO con la letra: `RECONQUISTA A` y `RECONQUISTA` no son lo mismo
       (punto 19). */
    equipoPropio: 'DEPORTIVO LA PLATA',
    categorias: {
      'primera-2026': {
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
      'primera-2026': {
        label: 'Primera · Vuelta 2026',
        sheetId: process.env.SHEET_RECONQUISTA_PRIMERA || '',
      },
    },
  },
};

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
function resolverCategoria(clubId, categoriaId) {
  const club = CATALOGO[String(clubId || '').trim().toLowerCase()];
  if (!club) return null;
  const ids = Object.keys(club.categorias);
  const catId = String(categoriaId || ids[0] || '').trim().toLowerCase();
  const cat = club.categorias[catId];
  if (!cat) return null;
  return {
    clubId: String(clubId).toLowerCase(),
    club: club.nombre,
    liga: club.liga,
    equipoPropio: club.equipoPropio,
    categoriaId: catId,
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
      id: c,
      label: CATALOGO[id].categorias[c].label,
      /* `activo` reemplaza al `sheetId` como señal de "esta categoría ya
         tiene libro". Es la misma idea que `activo: !!sheetId` del
         frontend (punto 6), pero sin revelar el id. */
      activo: !!CATALOGO[id].categorias[c].sheetId,
    })),
  }));
}

module.exports = { CATALOGO, HOJAS, entorno, resolverCategoria, catalogoPublico };
