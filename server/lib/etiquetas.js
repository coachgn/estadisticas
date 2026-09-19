/* =====================================================================
   SGADD · Reetiquetado de TORNEO / FASE en la lectura

   QUÉ RESUELVE

   El motor deriva `TORNEO` y `FASE` del nombre de la carpeta de Nivel 6 de
   Drive, con la convención `"TORNEO - FASE"` (guion CON espacios). Una
   carpeta SIN el separador —`CLASIFICACION`— deja `TORNEO` vacío por
   diseño: no hay de dónde sacarlo.

   La U21 de Reconquista es ese caso. Sus 1.685 filas vienen con
   `TORNEO=""` y `FASE="REGULAR"`, y así el panel no puede distinguir ese
   torneo de cualquier otra fase regular sin nombre.

   Renombrar la carpeta lo arreglaría de raíz, pero el club decidió NO
   tocar Drive. Entonces la traducción vive acá: en la lectura, declarada,
   y sin escribir una sola celda de la planilla.

   ---------------------------------------------------------------------
   POR QUÉ ACÁ Y NO EN EL FRONTEND

   Porque hay más de un consumidor. El índice, `combinacionesTorneoFase()`,
   el detector de alertas y los rankings leen las mismas matrices; parchear
   en el cliente obligaría a acertarle a todos y a mantenerlos en línea.
   Acá se aplica UNA vez, apenas baja el libro, y todo lo de abajo ve un
   dato ya coherente.

   ---------------------------------------------------------------------
   ES UNA TRADUCCIÓN, NO UN DEFAULT

   Solo se reescriben las filas que coinciden EXACTAMENTE con el par
   declarado en `de`. Las que no coinciden quedan intactas — y eso incluye
   la fila TOTAL de las hojas derivadas, que trae `FASE="TOTAL"` y no debe
   convertirse en un tramo.

   Consecuencia deliberada: si algún día la carpeta se renombra a
   `"ZONA A1 - CLASIFICACION"`, el motor va a escribir el par correcto, la
   regla dejará de encontrar filas que coincidan y se volverá inerte sola.
   No hay que acordarse de sacarla.
   ===================================================================== */
'use strict';

/* Indexado por SLUG de categoría, que es la clave que ya usan el catálogo
   y las URLs. Nunca por sheetId: el id no aparece en el JSON que sale al
   cliente y atar una regla a él lo volvería a meter en el código. */
const REGLAS = {
  /* ───────────────────────────────────────────────────────────────────
     NO HAY NINGUNA REGLA ACTIVA. La tabla queda como punto de extensión.

     Hubo una para `reconquista-u21`, que traducía el par
     `{torneo:"", fase:"REGULAR"}` a `{torneo:"ZONA A1",
     fase:"CLASIFICACION"}`. Existía porque ese slug apuntaba al libro de
     Clasificación (`1wNpSkd…`), que viene del esquema viejo y ni siquiera
     tiene columna `TORNEO`.

     SE SACÓ AL REPUNTAR EL SLUG. Desde 2026-09-04 `reconquista-u21`
     resuelve a `1CD7FEDc…`, que sí trae `TORNEO` con `IDA` y `VUELTA`
     escritos por el motor. La regla quedaba inerte —ninguna fila coincide
     con torneo vacío— pero dejarla era un riesgo real y no una molestia:
     una fila que entrara sin `TORNEO` (un partido a medio procesar) se
     habría reetiquetado sola como `ZONA A1 / CLASIFICACION`, mezclando un
     torneo con otro sin que nadie lo pidiera.

     Si algún día se vuelve a servir el libro de Clasificación bajo algún
     slug, la regla se reescribe con ESE slug — nunca con uno que apunte a
     un libro que ya trae su propio torneo.
     ─────────────────────────────────────────────────────────────────── */
};

const norm = (v) => String(v === null || v === undefined ? '' : v).trim().toUpperCase();

/**
 * Reescribe TORNEO/FASE en una matriz de Sheets (fila 0 = encabezados).
 *
 * Muta en el lugar y devuelve cuántas filas tocó. Se muta a propósito: el
 * libro puede traer nueve hojas grandes y copiarlas para cambiar dos
 * columnas duplicaría la memoria de cada petición.
 */
function aplicarAMatriz(matriz, reglas) {
  if (!Array.isArray(matriz) || matriz.length < 2) return 0;
  const cab = matriz[0] || [];
  const iF = cab.indexOf('FASE');
  /* Sin FASE no hay tramo que traducir. `RANKINGS` y cualquier hoja sin
     tramo entran por acá y salen intactas. */
  if (iF < 0) return 0;

  let iT = cab.indexOf('TORNEO');

  /* LA COLUMNA `TORNEO` PUEDE NO EXISTIR.

     Los libros anteriores a la migración de 15 columnas no la tienen: su
     encabezado es `FECHA, PARTIDO, EQUIPO, FASE, …` y nada más. Es el caso
     de la U21 de Reconquista.

     No es lo mismo que tenerla vacía, y la diferencia importa: acá hay que
     CREARLA. Se agrega al final, que es donde el motor la pondría, y se
     rellena solo en las filas que la regla toca. El panel arma las filas
     por NOMBRE de columna, así que sumar una al final no corre nada. */
  let creada = false;
  if (iT < 0) {
    /* Solo tiene sentido crearla si alguna regla parte de un torneo
       vacío: si todas esperan un torneo concreto, no hay nada que hacer
       en un libro que no lo tiene. */
    const alguna = reglas.some((r) => norm(r.de.torneo) === '');
    if (!alguna) return 0;
    iT = cab.length;
    cab[iT] = 'TORNEO';
    creada = true;
  }

  let tocadas = 0;
  for (let i = 1; i < matriz.length; i++) {
    const fila = matriz[i];
    if (!fila) continue;
    for (let r = 0; r < reglas.length; r++) {
      const regla = reglas[r];
      if (norm(fila[iT]) !== norm(regla.de.torneo)) continue;
      if (norm(fila[iF]) !== norm(regla.de.fase)) continue;
      /* Sheets recorta las celdas vacías del final, así que una fila puede
         ser más corta que el encabezado. Sin rellenar el hueco, el valor
         caería en la columna equivocada. */
      while (fila.length < iT) fila.push('');
      fila[iT] = regla.a.torneo;
      fila[iF] = regla.a.fase;
      tocadas++;
      break;                       // una fila la traduce UNA regla
    }
  }

  /* Si se creó el encabezado y al final ninguna fila coincidió, se
     deshace: dejar una columna `TORNEO` entera en blanco sería peor que
     no tenerla — el panel la leería como un tramo sin nombre. */
  if (creada && !tocadas) cab.length = iT;

  return tocadas;
}

/**
 * Aplica las reglas de una categoría al libro entero.
 *
 * @param {object} libro  el de `google-sheets.obtenerLibro`
 * @param {string} slug   slug de la categoría, p. ej. `reconquista-u21`
 * @returns {{aplicada: boolean, filas: number, hojas: string[]}}
 */
function reetiquetar(libro, slug) {
  const reglas = REGLAS[slug];
  if (!libro || !reglas || !reglas.length) return { aplicada: false, filas: 0, hojas: [] };

  let filas = 0;
  const hojas = [];
  /* Las DOS vistas: la cruda que consume el índice y la de texto que
     consume la capa vieja de Principal. Traducir solo una dejaría al panel
     mostrando un tramo en una pantalla y otro en la de al lado. */
  [libro.hojas, libro.hojasTexto].forEach((grupo) => {
    if (!grupo) return;
    Object.keys(grupo).forEach((nombre) => {
      const n = aplicarAMatriz(grupo[nombre], reglas);
      if (n) { filas += n; if (hojas.indexOf(nombre) === -1) hojas.push(nombre); }
    });
  });

  return { aplicada: filas > 0, filas: filas, hojas: hojas };
}

/** Para el diagnóstico: qué reglas hay declaradas y por qué. */
function reglasDe(slug) { return (REGLAS[slug] || []).slice(); }

module.exports = { reetiquetar, reglasDe, aplicarAMatriz, REGLAS };
