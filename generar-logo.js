#!/usr/bin/env node
/* =====================================================================
   SGADD · Versiones chicas del logo de MotorStats

     node generar-logo.js

   POR QUÉ EXISTE. El original (`logos/motorlogo.PNG`) mide 1536x1024 y
   pesa 1,3 MB. Puesto en el header se descarga ENTERO en cada visita por
   más que el CSS lo muestre a 32 píxeles: el navegador no sabe que lo vas
   a achicar. Serían 1,3 MB contra los 28 KB que pesa todo el CSS
   compilado — desharía de un saque el trabajo que llevó el primer pintado
   de 26 s a 5,9 s (punto 5 bis).

   SIN DEPENDENCIAS, que es la regla del proyecto. `sharp` o `jimp`
   resolverían esto en tres líneas y son una dependencia nueva con
   binarios nativos. Un PNG se decodifica con `zlib`, que ya viene en
   Node: inflar los IDAT, deshacer los filtros por línea, y volver a
   comprimir. Son cien líneas y no hay que instalar nada.

   Se corre a mano y los resultados se commitean, igual que `sgadd.css` y
   el manual de etiquetas. No hay bundler en el camino.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ORIGEN = path.join(__dirname, 'logos', 'motorlogo.PNG');

/* 64 para el header y 128 para pantallas de alta densidad y el encabezado
   del PDF, que se imprime a 300 dpi. Más grande no aporta: el logo nunca
   se muestra a más de 40 px de lado. */
const TAMANOS = [64, 128];

const FIRMA = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/* ------------------------------------------------------------------ leer */

function trozos(buf) {
  if (!buf.slice(0, 8).equals(FIRMA)) throw new Error('No es un PNG');
  const out = [];
  let i = 8;
  while (i < buf.length) {
    const largo = buf.readUInt32BE(i);
    const tipo = buf.toString('ascii', i + 4, i + 8);
    out.push({ tipo, datos: buf.slice(i + 8, i + 8 + largo) });
    i += largo + 12;               // 4 largo + 4 tipo + datos + 4 crc
  }
  return out;
}

/**
 * Decodifica a RGBA de 8 bits.
 *
 * SOLO SE SOPORTA LO QUE ESTE LOGO ES: color 6 (RGBA), 8 bits, sin
 * entrelazado. Un decodificador de PNG completo —paletas, 16 bits,
 * Adam7— es otro proyecto, y acá el archivo de entrada es uno solo y
 * conocido. Si algún día cambia, esto avisa en vez de sacar basura.
 */
function decodificar(buf) {
  const cs = trozos(buf);
  const ihdr = cs.find(c => c.tipo === 'IHDR');
  if (!ihdr) throw new Error('PNG sin IHDR');
  const ancho = ihdr.datos.readUInt32BE(0);
  const alto = ihdr.datos.readUInt32BE(4);
  const bits = ihdr.datos[8];
  const color = ihdr.datos[9];
  const entrelazado = ihdr.datos[12];

  if (bits !== 8 || color !== 6 || entrelazado !== 0) {
    throw new Error('Solo se soporta RGBA de 8 bits sin entrelazar. '
      + 'Este archivo es bits=' + bits + ' color=' + color + ' entrelazado=' + entrelazado
      + '. Exportalo así y volvé a correr esto.');
  }

  const crudo = zlib.inflateSync(
    Buffer.concat(cs.filter(c => c.tipo === 'IDAT').map(c => c.datos)));

  const canales = 4;
  const linea = ancho * canales;
  const px = Buffer.alloc(alto * linea);

  /* Deshacer los filtros. Cada línea empieza con un byte que dice cuál se
     le aplicó; los cinco están en la sección 9 de la especificación. */
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (linea + 1)];
    const org = y * (linea + 1) + 1;
    const dst = y * linea;
    for (let x = 0; x < linea; x++) {
      const cru = crudo[org + x];
      const a = x >= canales ? px[dst + x - canales] : 0;          // izquierda
      const b = y > 0 ? px[dst - linea + x] : 0;                   // arriba
      const c = (x >= canales && y > 0) ? px[dst - linea + x - canales] : 0;
      let v;
      if (filtro === 0) v = cru;
      else if (filtro === 1) v = cru + a;
      else if (filtro === 2) v = cru + b;
      else if (filtro === 3) v = cru + ((a + b) >> 1);
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = cru + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c));
      } else throw new Error('Filtro PNG desconocido: ' + filtro);
      px[dst + x] = v & 0xff;
    }
  }
  return { ancho, alto, px };
}

/* --------------------------------------------------------------- escalar */

/**
 * Encaja la imagen ENTERA en un lienzo cuadrado y la achica promediando.
 *
 * ANTES RECORTABA EL CUADRADO CENTRAL Y ESO CORTABA EL LOGO. El original
 * es 1536x1024, o sea 3:2, así que quedarse con los 1024 del medio tiraba
 * 256 píxeles de CADA lado — justo donde vive parte de la gráfica y el
 * texto de la marca. Se veía como un logo mal encuadrado dentro de su aro,
 * y ninguna cantidad de padding en el CSS lo podía arreglar: lo que
 * faltaba no estaba en el archivo.
 *
 * Ahora se recorta el AIRE transparente del original —no el dibujo— y el
 * dibujo entero entra en el cuadrado; el sobrante se rellena con
 * TRANSPARENTE,
 * no con un color: el logo se usa sobre el aro blanco de la barra, sobre la
 * card oscura y sobre el papel de los PDF. Cualquier color horneado se
 * vería como un rectángulo en al menos uno de los tres.
 *
 * Se promedia el bloque entero de origen en vez de tomar un píxel suelto:
 * bajando de 1536 a 64 cada píxel de salida cubre 24x24 de entrada, y
 * quedarse con uno solo da un resultado con escalones y ruido.
 *
 * EL ALFA SE PREMULTIPLICA. Sin eso, un píxel transparente aporta su color
 * al promedio y aparece un halo alrededor de los bordes.
 */
/**
 * El rectángulo que ocupa el DIBUJO, sin el aire transparente de alrededor.
 *
 * El original trae margen propio: 179 px de aire a la izquierda y 181 a la
 * derecha sobre 1536. Encajando el lienzo entero, ese aire se suma al
 * padding del CSS y el logo termina diminuto adentro de su aro. Recortando
 * primero, la gráfica llega al borde del PNG y el respiro lo decide la
 * hoja de estilos, que es donde se puede ajustar sin regenerar nada.
 *
 * El umbral es 10 y no 0: los bordes suavizados dejan un halo de alfa muy
 * bajo que no se ve pero cuenta como contenido.
 */
function recorteDelDibujo(img) {
  let x0 = img.ancho, x1 = -1, y0 = img.alto, y1 = -1;
  for (let y = 0; y < img.alto; y++) {
    for (let x = 0; x < img.ancho; x++) {
      if (img.px[(y * img.ancho + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  /* Sin un solo píxel opaco no hay nada que recortar: se devuelve la
     imagen entera en vez de un rectángulo vacío. */
  if (x1 < x0 || y1 < y0) return { x: 0, y: 0, ancho: img.ancho, alto: img.alto };
  return { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
}

function reescalarCuadrado(img, lado) {
  /* Primero se descarta el aire transparente del original, y recién sobre
     el dibujo se arma el lienzo cuadrado. */
  const rec = recorteDelDibujo(img);
  const lienzo = Math.max(rec.ancho, rec.alto);
  const x0 = rec.x + Math.floor((rec.ancho - lienzo) / 2);
  const y0 = rec.y + Math.floor((rec.alto - lienzo) / 2);
  const paso = lienzo / lado;
  const out = Buffer.alloc(lado * lado * 4);         // arranca en 0: transparente

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const xa = x0 + Math.floor(x * paso), xb = x0 + Math.floor((x + 1) * paso);
      const ya = y0 + Math.floor(y * paso), yb = y0 + Math.floor((y + 1) * paso);
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = ya; sy < yb; sy++) {
        /* Fuera del original NO se lee: ese píxel del bloque queda
           transparente y baja el alfa promedio, que es exactamente lo que
           tiene que pasar en el borde de la franja. */
        if (sy < 0 || sy >= img.alto) { n += (xb - xa); continue; }
        for (let sx = xa; sx < xb; sx++) {
          if (sx < 0 || sx >= img.ancho) { n++; continue; }
          const i = (sy * img.ancho + sx) * 4;
          const al = img.px[i + 3] / 255;
          r += img.px[i] * al; g += img.px[i + 1] * al; b += img.px[i + 2] * al;
          a += img.px[i + 3];
          n++;
        }
      }
      if (!n) continue;
      const o = (y * lado + x) * 4;
      const alfa = a / n;
      const f = alfa > 0 ? 255 / alfa : 0;          // deshacer la premultiplicación
      out[o] = Math.min(255, Math.round(r / n * f));
      out[o + 1] = Math.min(255, Math.round(g / n * f));
      out[o + 2] = Math.min(255, Math.round(b / n * f));
      out[o + 3] = Math.round(alfa);
    }
  }
  return { ancho: lado, alto: lado, px: out };
}

/* -------------------------------------------------------------- escribir */

function crc32(buf) {
  let c, tabla = crc32.tabla;
  if (!tabla) {
    tabla = crc32.tabla = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      tabla[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = tabla[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

function codificar(img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.ancho, 0);
  ihdr.writeUInt32BE(img.alto, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  /* Se escribe con filtro 0 en cada línea y se deja comprimir a zlib al
     máximo. Elegir el mejor filtro por línea daría un archivo algo más
     chico, pero a 64 y 128 px la diferencia son unos pocos KB y no
     justifica la complejidad. */
  const linea = img.ancho * 4;
  const conFiltro = Buffer.alloc(img.alto * (linea + 1));
  for (let y = 0; y < img.alto; y++) {
    conFiltro[y * (linea + 1)] = 0;
    img.px.copy(conFiltro, y * (linea + 1) + 1, y * linea, (y + 1) * linea);
  }

  return Buffer.concat([
    FIRMA,
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(conFiltro, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ main */

if (!fs.existsSync(ORIGEN)) {
  console.error('\n  No está ' + ORIGEN + '\n');
  process.exit(1);
}

const original = fs.readFileSync(ORIGEN);
const img = decodificar(original);
console.log('');
console.log('  original   ' + img.ancho + 'x' + img.alto
  + ' · ' + Math.round(original.length / 1024) + ' KB');

TAMANOS.forEach((lado) => {
  const chico = reescalarCuadrado(img, lado);
  const png = codificar(chico);
  const nombre = 'motorlogo-' + lado + '.png';
  fs.writeFileSync(path.join(__dirname, 'logos', nombre), png);
  console.log('  ' + nombre.padEnd(20) + lado + 'x' + lado
    + ' · ' + Math.round(png.length / 1024) + ' KB');
});

console.log('');
console.log('  El original queda como está: es el que se usa si alguna vez');
console.log('  hace falta a tamaño grande.');
console.log('');
