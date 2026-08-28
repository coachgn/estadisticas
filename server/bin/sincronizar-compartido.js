#!/usr/bin/env node
/* =====================================================================
   Copia los módulos compartidos a `server/lib/compartido/`.

   ---------------------------------------------------------------------
   POR QUÉ EXISTE ESTE PASO, QUE PARECE UNA DUPLICACIÓN Y NO LO ES

   El servidor tiene que aplicar EXACTAMENTE las mismas reglas que el
   navegador (matriz de secciones, cascada de planes, normalización de
   equipos). Por eso `server/lib/auth.js` importaba `../../js/sgadd-auth.js`
   directamente: una sola fuente, cero riesgo de divergencia.

   Eso funciona en local y **falla en Vercel**, porque el proyecto tiene
   como raíz `server/` y el bundle solo sube ESE directorio: `../../js/`
   sencillamente no existe del otro lado. El síntoma fue
   `FUNCTION_INVOCATION_FAILED` en TODOS los endpoints, incluido
   `/api/v1/salud`, que no toca ni Google ni credenciales — la función
   moría al cargar.

   La alternativa era desplegar desde la raíz del repo, y tiene un costo
   peor: Vercel serviría también una segunda copia del panel entero, en
   una URL que nadie mira.

   Así que se copia. La fuente de verdad SIGUE SIENDO `js/`:

     · el copiado es mecánico, byte por byte, sin editar una línea;
     · `test-backend.js` compara los dos y FALLA si difieren, diciendo
       qué comando correr;
     · el archivo copiado lo declara en su primera línea.

   Es la misma convención que ya usa `sgadd.css` (se genera a mano con
   `node generar-css.js` y se commitea), con una mejora: acá el test hace
   imposible olvidarse.

     node server/bin/sincronizar-compartido.js
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

/* Los módulos que el servidor necesita, TODOS puros y ya testeados:

     sgadd-core.js      el índice, con la herencia de fecha y el guard de
                        ambigüedad del punto 3 quater
     sgadd-auth.js      roles, planes y la normalización de equipos
     sgadd-estados.js   los detectores de alertas del punto 13
     sgadd-data.js      `matrizAFilas`, para pasar de la matriz cruda de
                        Sheets a la forma que consume el índice

   Se requieren entre ellos con rutas relativas (`./sgadd-core.js`), así
   que copiándolos al mismo directorio los require siguen resolviendo sin
   tocar una línea.

   EL PUNTO DE COPIARLOS EN VEZ DE REIMPLEMENTAR: el join partido-a-
   jugador tiene reglas que costaron encontrar —la fecha se hereda de
   `Base Datos E` ANTES de calcular el `__id`, y un `PARTIDO` con dos
   fechas distintas no se hereda para no inventar un dato— y el detector
   de inactividad tiene su filtro anti-spam calibrado contra la liga real.
   Reescribir cualquiera de las dos cosas del lado del servidor era
   garantizar que las alertas del navegador y las del servidor
   divergieran. Acá corre EL MISMO código. */
const MODULOS = ['sgadd-core.js', 'sgadd-auth.js', 'sgadd-estados.js', 'sgadd-data.js'];

const ORIGEN = path.join(__dirname, '..', '..', 'js');
const DESTINO = path.join(__dirname, '..', 'lib', 'compartido');

const NL = String.fromCharCode(10);

/* El banner va ARRIBA del contenido sin tocarlo, así la comparación del
   test es exacta: `banner + fuente` contra el archivo. */
function banner(nombre) {
  return [
    '/* ARCHIVO GENERADO · NO EDITAR ACÁ.',
    ' *',
    ' * Copia mecánica de js/' + nombre + ', que es la fuente de verdad.',
    ' * Existe porque Vercel despliega con raíz en `server/` y no sube el',
    ' * resto del repo. Para regenerar:',
    ' *',
    ' *     node server/bin/sincronizar-compartido.js',
    ' *',
    ' * `test-backend.js` falla si este archivo difiere del original.',
    ' */',
    '',
  ].join(NL);
}

/* La comparación NORMALIZA los fines de línea, y no es un detalle: git
   está configurado para convertir a CRLF al hacer checkout en Windows,
   así que el archivo en disco nunca coincide byte a byte con lo que
   genera este script. Comparando crudo, el test fallaba EN FALSO apenas
   alguien clonaba el repo — y un test que falla sin motivo se termina
   ignorando, que es peor que no tenerlo.

   Lo que importa es el CONTENIDO: si el cuerpo difiere, las reglas del
   servidor y las del navegador divergieron. */
function normalizar(t) {
  return String(t).split(String.fromCharCode(13) + String.fromCharCode(10))
    .join(String.fromCharCode(10));
}

function contenidoEsperado(nombre) {
  const fuente = fs.readFileSync(path.join(ORIGEN, nombre), 'utf8');
  return banner(nombre) + fuente;
}

function sincronizar() {
  if (!fs.existsSync(DESTINO)) fs.mkdirSync(DESTINO, { recursive: true });
  const cambios = [];
  MODULOS.forEach(nombre => {
    const destino = path.join(DESTINO, nombre);
    const esperado = contenidoEsperado(nombre);
    const actual = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : null;
    if (actual === null || normalizar(actual) !== normalizar(esperado)) {
      fs.writeFileSync(destino, esperado);
      cambios.push(nombre);
    }
  });
  return cambios;
}

/** ¿Están al día? Lo usa el test. */
function desincronizados() {
  return MODULOS.filter(nombre => {
    const destino = path.join(DESTINO, nombre);
    if (!fs.existsSync(destino)) return true;
    return normalizar(fs.readFileSync(destino, 'utf8')) !== normalizar(contenidoEsperado(nombre));
  });
}

module.exports = { MODULOS, sincronizar, desincronizados, contenidoEsperado, DESTINO };

if (require.main === module) {
  const cambios = sincronizar();
  if (cambios.length) {
    console.log('  actualizados: ' + cambios.join(', '));
    console.log('  ACORDATE DE COMMITEARLOS: son parte del deploy.');
  } else {
    console.log('  ya estaban al día (' + MODULOS.join(', ') + ')');
  }
}
