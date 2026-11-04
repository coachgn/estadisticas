/* test-cancha.js · la cancha vectorial unificada (js/sgadd-cancha.js).
   Fija: la MISMA geometría que SGADD_PBP, los marcadores ○/✕, el perímetro
   fino de las zonas citadas y el enlace texto ↔ zona. */
const C = require('./js/sgadd-cancha.js');
const PBP = require('./js/sgadd-pbp.js');

let pasan = 0, fallan = 0;
function ok(cond, msg) {
  if (cond) { pasan++; return; }
  fallan++; console.log('  ✗ ' + msg);
}
function seccion(t) { console.log('\n' + t); }

/* ---------- 1 · equivalencia con SGADD_PBP (no hay dos geometrías) */
seccion('1 · la geometría es la de SGADD_PBP');
{
  ok(JSON.stringify(C.GEOMETRIA) === JSON.stringify(PBP.GEOMETRIA), 'el respaldo de geometría coincide');
  ok(JSON.stringify(C.ZONAS) === JSON.stringify(PBP.ZONAS), 'las 14 zonas coinciden');
  let difieren = 0;
  for (let f = 0.1; f < 14; f += 0.37) for (let l = 0.1; l < 15; l += 0.41) {
    if (C.zonaGeometrica(f, l) !== PBP.zonaGeometrica(f, l, PBP.GEOMETRIA)) difieren++;
  }
  ok(difieren === 0, 'zonaGeometrica da lo mismo en toda la media cancha (' + difieren + ' difieren)');
  const a = C.geometriaZonas(), b = PBP.geometriaZonas(PBP.GEOMETRIA);
  ok(C.ZONAS.every(z => JSON.stringify(a[z]) === JSON.stringify(b[z])), 'los 14 polígonos y sus etiquetas coinciden');
  const G2 = Object.assign({}, C.GEOMETRIA, { r2: 5.1 });
  ok(JSON.stringify(C.geometriaZonas(G2).Z7) === JSON.stringify(PBP.geometriaZonas(G2).Z7), 'una geometría recalibrada también coincide');
  ok(C.geometria({ liga: { geometria: { r2: 5.1 } } }).r2 === 5.1, 'manda la geometría del paquete');
}

/* ---------- 2 · marcadores */
seccion('2 · aciertos ○ y errores ✕');
{
  const g = C.GEOMETRIA;
  /* un tiro bajo el aro y otro triple al ala derecha, en cm×10 (lateral, fondo) */
  const bajoAro = [g.aro[1] * 10, g.aro[0] * 10 + 8];            // Z1
  const ala = [(g.aro[1] - 4.5) * 10, 3.9 * 10];                  // detrás de la línea, a la derecha
  const zonaAla = C.zonaGeometrica(ala[1] / 10, ala[0] / 10);
  const zi = (z) => C.ZONAS.indexOf(z);
  const r = C.capaTiros([
    [bajoAro[0], bajoAro[1], 1, zi('Z1')],
    [ala[0], ala[1], 0, zi(zonaAla)],
  ]);
  ok(r.convertidos === 1 && r.errados === 1, 'cuenta 1 acierto y 1 error');
  ok(/<circle class="cancha-tiro-c"/.test(r.svg) && /stroke="#16a34a"/.test(r.svg), 'el acierto es un círculo verde');
  ok(/<path class="cancha-tiro-e"/.test(r.svg) && /stroke="#dc2626"/.test(r.svg), 'el error es una cruz roja');
  ok(!/fill="#/.test(r.svg), 'los marcadores no llevan relleno (trazo fino)');
  const incoherente = C.capaTiros([[bajoAro[0], bajoAro[1], 1, zi('Z13')]]);
  ok(incoherente.sinUbicar === 1 && incoherente.convertidos === 0, 'un tiro cuya zona no coincide con su posición no se dibuja y se cuenta');
  const soloZ1 = C.capaTiros([[bajoAro[0], bajoAro[1], 1, zi('Z1')], [ala[0], ala[1], 1, zi(zonaAla)]], { soloZonas: 'Z1' });
  ok(soloZ1.convertidos === 1, 'soloZonas filtra por zona');
  ok(C.capaTiros([[NaN, 3, 1, 0], null, 'x']).convertidos === 0, 'entradas rotas no tiran');
  const sinZona = C.capaTiros([[75, 20, 1]]);
  ok(sinZona.convertidos === 1, 'sin zona etiquetada se dibuja');
}

/* ---------- 3 · perímetros */
seccion('3 · perímetro fino de las zonas citadas');
{
  const o = C.svg({ resaltar: ['Z13', { id: 'Z1', punteado: true }, 'Z13', 'ZX', 'z99'] });
  ok(o.resaltadas.join(',') === 'Z13,Z1', 'normaliza: sin repetidas ni ids inválidos');
  ok((o.svg.match(/class="cancha-perimetro"/g) || []).length === 2, 'dibuja un perímetro por zona resaltada');
  ok(/data-cancha-zona="Z13"/.test(o.svg) && /data-cancha-zona="Z1"/.test(o.svg), 'cada perímetro dice su zona');
  ok(/fill="none" stroke="#f7941e" stroke-width="0.8"/.test(o.svg), 'trazo fino del acento, sin relleno');
  ok(/stroke-dasharray/.test(o.svg), 'la zona de muestra chica va punteada');
  ok(/>Z13<\/text>/.test(o.svg), 'el código de la zona va escrito sobre el perímetro');
  ok(/data-siempre="1"/.test(o.svg), 'un perímetro resaltado queda siempre visible');
  ok(/aria-label="[^"]*Zonas resaltadas: Z13 Triple ala derecha/.test(o.svg), 'el aria-label nombra la zona');
  const sin = C.svg({ resaltar: ['Z13'], etiquetas: false });
  ok(!/>Z13<\/text>/.test(sin.svg), 'etiquetas:false saca el rótulo');
  const inter = C.svg({ interactivo: true, resaltar: ['Z12'] });
  ok((inter.svg.match(/class="cancha-perimetro"/g) || []).length === 14, 'interactivo: los 14 perímetros están, el resaltado visible y el resto oculto');
  ok((inter.svg.match(/style="opacity:0"/g) || []).length === 13, 'interactivo: 13 ocultos');
  const rel = C.svg({ zonas: { Z13: { fill: '#16a34a', titulo: 'Z13 · 36/93' }, Z99: { fill: '#000' } } });
  ok(/class="cancha-zona" data-cancha-zona="Z13"/.test(rel.svg) && !/Z99/.test(rel.svg), 'rellena solo zonas que existen');
  ok(/<title>Z13 · 36\/93<\/title>/.test(rel.svg), 'el relleno lleva su título');
  const ids = [C.svg({}).svg, C.svg({}).svg].map(s => (s.match(/cancha-clip-\d+/) || [])[0]);
  ok(ids[0] && ids[0] !== ids[1], 'cada cancha tiene su propio clipPath');
  ok(/viewBox="-4 -4 158 148"/.test(C.svg({}).svg), 'mismo viewBox que los mapas del play-by-play');
  ok(C.perimetro('Z99', C.geometriaZonas()) === '', 'una zona inexistente no dibuja nada');
}

/* ---------- 4 · texto ↔ zona */
seccion('4 · del texto al sector');
{
  const t = 'El problema está en {{Z13}} y en Z11, no en Z1 ni en Z130 ni en AZ5.';
  ok(C.zonasMencionadas(t).join(',') === 'Z13,Z11,Z1', 'detecta las zonas en orden y sin repetir, sin confundir Z130 ni AZ5');
  ok(C.zonasMencionadas('Z13 y Z13 otra vez').length === 1, 'sin repetidas');
  ok(C.zonasMencionadas(null).length === 0, 'null no tira');
  const h = C.enlazarZonas(t);
  ok((h.match(/data-cancha-ref="Z\d+"/g) || []).length === 3, 'arma un botón por mención');
  ok(/<button type="button" class="cancha-zona-ref" data-cancha-ref="Z13"/.test(h), 'el botón lleva su zona');
  ok(!/\{\{/.test(h), 'se van las llaves');
  const mal = C.enlazarZonas('<img src=x onerror=alert(1)> Z2');
  ok(!/<img/.test(mal) && /&lt;img/.test(mal), 'el texto se escapa ANTES de armar los botones');
  ok(/data-cancha-ref="Z2"/.test(mal), 'y el botón se arma igual');
  ok(C.activar(null) === false, 'sin document, activar no hace nada');
}

/* ---------- 5 · la leyenda */
seccion('5 · leyenda');
{
  const l = C.leyenda();
  ok(/acierto/.test(l) && /error/.test(l) && /zona citada/.test(l), 'dice qué es cada marca');
  ok(/<circle/.test(l) && /M-4 -4L4 4/.test(l), 'las marcas de la leyenda son formas, no solo color');
}

console.log('\n' + pasan + ' pasan · ' + fallan + ' fallan');
process.exit(fallan ? 1 : 0);
