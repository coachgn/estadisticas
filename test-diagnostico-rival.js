/* =====================================================================
   El soporte de decisión del Scouting (v313): la versión perdedora del
   rival, la matriz de concesiones y las tres cosas del tiempo muerto.

   El motor es PURO. La versión perdedora se prueba con un índice de
   mentira (solo `get` y `agregarPartidos`) para que cada caso sea un
   número escrito a mano; la integración con el índice de verdad se
   verifica en test-scouting.js.
   ===================================================================== */
global.SGADD = require('./js/sgadd-core.js');
const fs = require('fs');
const S = require('./js/sgadd-scouting.js');
let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); } };

/* Un equipo con partidos que traen directamente sus ratios de tiro. */
function idxDe(partidos) {
  const e = { clave: 'X', partidos: partidos.map(([res, v]) => ({ RESULTADO: res, v })) };
  return {
    get: (c) => (c === 'X' ? e : null),
    agregarPartidos: (c, ps) => ({ tiro: ps[0].v }),
  };
}
const P = (res, efg, tov) => [res, { 'eFG%': efg, 'PePP%': tov }];

console.log('\n1. LA VERSIÓN PERDEDORA');
console.log('═'.repeat(70));
{
  /* Gana con eFG% alto (una victoria con 0,47 es la excepción) y pierde
     con eFG% bajo (una derrota con 0,52 también). Las pérdidas no separan. */
  const idx = idxDe([
    P('GANADO', 0.55, 0.12), P('GANADO', 0.56, 0.15), P('GANADO', 0.54, 0.10), P('GANADO', 0.58, 0.14), P('GANADO', 0.47, 0.11),
    P('PERDIDO', 0.44, 0.13), P('PERDIDO', 0.45, 0.11), P('PERDIDO', 0.43, 0.14), P('PERDIDO', 0.52, 0.12),
  ]);
  const q = S.versionPerdedora(idx, 'X');
  check('con 5 ganados y 4 perdidos hay lectura', q.ok === true && q.ganados === 5 && q.perdidos === 4);
  check('la métrica que más los separa es el eFG%', q.principal && q.principal.id === 'eFG%', q.principal && q.principal.id);
  check('el corte es el medio entre las medias de victorias y derrotas', Math.abs(q.principal.corte - 0.502) < 0.01, q.principal.corte);
  check('cuenta los partidos del lado malo: 4, y pierde 3', q.principal.nMalo === 4 && q.principal.perdidosMalo === 3, q.principal);
  const t = S.textoQuiebre(q);
  check('el texto dice el corte, los partidos y el porcentaje', /Cuando su eFG% cae por debajo de 50,\d%, pierde 3 de 4 partidos \(75%\)\./.test(t), t);
  check('menos de 6 perdidos: se marca como muestra chica', q.chica === true);
  check('toda lectura trae la acción que el cuerpo técnico puede hacer', typeof q.principal.accion === 'string' && q.principal.accion.length > 10);

  const grande = idxDe([].concat(
    [1, 2, 3, 4, 5, 6].map(i => P('GANADO', 0.54 + i / 1000, 0.12)),
    [1, 2, 3, 4, 5, 6].map(i => P('PERDIDO', 0.44 + i / 1000, 0.12))));
  check('con 6 y 6 ya no es muestra chica', S.versionPerdedora(grande, 'X').chica === false);
}
{
  /* Una métrica INVERTIDA: pierde cuando las pérdidas SUBEN. */
  const idx = idxDe([
    P('GANADO', 0.50, 0.08), P('GANADO', 0.50, 0.09), P('GANADO', 0.50, 0.10), P('GANADO', 0.50, 0.09),
    P('PERDIDO', 0.50, 0.20), P('PERDIDO', 0.50, 0.19), P('PERDIDO', 0.50, 0.18), P('PERDIDO', 0.50, 0.21),
  ]);
  const q = S.versionPerdedora(idx, 'X');
  check('en una métrica donde menos es mejor, el quiebre es «sube por encima de»',
    q.principal && q.principal.id === 'PePP%' && /sube por encima de/.test(S.textoQuiebre(q)), S.textoQuiebre(q));
  check('y pierde las 4 veces que cruza el corte', q.principal.nMalo === 4 && q.principal.perdidosMalo === 4);
}
{
  /* La defensa también separa, y el texto no dice «su eFG% de sus rivales». */
  const idx = idxDe([
    ['GANADO', { 'eFG Opp%': 0.44 }], ['GANADO', { 'eFG Opp%': 0.45 }], ['GANADO', { 'eFG Opp%': 0.46 }],
    ['PERDIDO', { 'eFG Opp%': 0.56 }], ['PERDIDO', { 'eFG Opp%': 0.57 }], ['PERDIDO', { 'eFG Opp%': 0.58 }],
  ]);
  const t = S.textoQuiebre(S.versionPerdedora(idx, 'X'));
  check('la métrica de su defensa se dice «el eFG% de sus rivales sube por encima de»', /^Cuando el eFG% de sus rivales sube por encima de 5\d,\d%, pierde 3 de 3/.test(t), t);
}
{
  /* Gana cuando su eFG% es MÁS BAJO: no es un quiebre, es ruido. */
  const idx = idxDe([
    P('GANADO', 0.40, 0.12), P('GANADO', 0.41, 0.12), P('GANADO', 0.39, 0.12),
    P('PERDIDO', 0.55, 0.12), P('PERDIDO', 0.56, 0.12), P('PERDIDO', 0.54, 0.12),
  ]);
  const q = S.versionPerdedora(idx, 'X');
  check('una relación al revés (gana con peor eFG%) NO se presenta como quiebre', q.ok === true && q.principal === null, q.principal);
  check('y dice por qué no hay lectura', /Ninguna métrica/.test(q.motivo));
}
{
  const pocos = S.versionPerdedora(idxDe([P('GANADO', 0.5, 0.1), P('GANADO', 0.5, 0.1), P('GANADO', 0.5, 0.1), P('PERDIDO', 0.4, 0.1)]), 'X');
  check('con menos de 3 perdidos no se inventa un quiebre', pocos.ok === false && /al menos 3/.test(pocos.motivo), pocos);
  check('un equipo que no existe no revienta', S.versionPerdedora(idxDe([]), 'NOEXISTE').ok === false && S.versionPerdedora(null, 'X').ok === false);
  const sinRival = {
    get: () => ({ clave: 'X', partidos: [].concat(Array(3).fill({ RESULTADO: 'GANADO' }), Array(3).fill({ RESULTADO: 'PERDIDO' })) }),
    agregarPartidos: () => ({ tiro: {} }),
  };
  const q = S.versionPerdedora(sinRival, 'X');
  check('sin datos de tiro por partido queda sin lectura, sin error', q.ok === true && q.principal === null);
}

console.log('\n2. EL MAL MENOR');
console.log('═'.repeat(70));
{
  const perfil = (o) => Object.assign({ nombre: 'J', min: 28, t3i: 4, pptTriple: 0.78, pptDoble: 0.95, t2i: 6, t1: 0.7, t1i: 1,
    tiroExternoFrio: false, tiroExternoRentable: false, cuotaTriplesEquipo: 0.2 }, o);
  const fila = (nombre, o, plan) => ({ clave: nombre, nombre, perfil: perfil(Object.assign({ nombre }, o)), plan: Object.assign({}, plan) });
  const intocable = fila('SNIPER', { pptTriple: 1.3, t3i: 6, tiroExternoRentable: true }, { intocable: true });
  const foco = fila('EJE', { pptTriple: 0.6, t3i: 5, tiroExternoFrio: true }, { foco: true });
  const frio1 = fila('FRIO UNO', { pptTriple: 0.78, tiroExternoFrio: true }, {});
  const frio2 = fila('FRIO DOS', { pptTriple: 0.85, t3i: 3, tiroExternoFrio: true }, {});
  const falta = fila('FALTERO', { t1: 0.45, t1i: 4, pptDoble: 1.1 }, {});
  const jc = { filas: [falta, frio2, intocable, foco, frio1], plan: { focos: [foco], intocables: [intocable], fuentes: [frio1], cristal: [] } };
  const c = S.concesiones(jc);
  check('hay opciones y vienen de menor a mayor costo', c.opciones.length === 3 && c.opciones.every((o, i, l) => i === 0 || l[i - 1].costo <= o.costo),
    c.opciones.map(o => o.titulo + ' ' + o.costo));
  check('la más barata es dejarle el triple al peor tirador', c.opciones[0].jugador === 'FRIO UNO' && c.opciones[0].tipo === 'triple');
  check('un INTOCABLE nunca aparece como concesión', !c.opciones.some(o => o.jugador === 'SNIPER'));
  check('un FOCO tampoco: a ese se lo dobla', !c.opciones.some(o => o.jugador === 'EJE'));
  check('los intocables se listan aparte, para decir qué no se concede', c.intocables.join() === 'SNIPER');
  const f = c.opciones.find(o => o.tipo === 'linea');
  check('la falta táctica cuesta DOS libres: 2 × T1%', f && Math.abs(f.costo - 0.9) < 1e-9 && /dos libres/.test(f.costoTexto), f);
  check('y avisa que el bonus lo mira el cuerpo técnico', /bonus|margen de faltas/.test(f.protege));
  check('cada una dice qué protege del plan colectivo (la ayuda sobre el foco)', /EJE/.test(c.opciones[0].protege), c.opciones[0].protege);
  check('la falta táctica NO libera ayuda: corta la jugada', !/libera la ayuda/.test(f.protege) && /corta su jugada/.test(f.protege), f.protege);
  check('cada una dice el volumen que absorbe', /triples por partido/.test(c.opciones[0].volumen));
  check('sin plantel no revienta', S.concesiones(null).opciones.length === 0 && S.concesiones({}).opciones.length === 0);
  check('tope de 5 opciones', S.concesiones({ filas: Array(9).fill(0).map((_, i) => fila('F' + i, { pptTriple: 0.6 + i / 100, tiroExternoFrio: true }, {})), plan: {} }).opciones.length === 5);

  console.log('\n3. LAS TRES COSAS');
  console.log('═'.repeat(70));
  const q = S.versionPerdedora(idxDe([
    P('GANADO', 0.55, 0.12), P('GANADO', 0.56, 0.15), P('GANADO', 0.54, 0.10), P('PERDIDO', 0.44, 0.13), P('PERDIDO', 0.45, 0.11), P('PERDIDO', 0.43, 0.14)]), 'X');
  const t = S.tresCosas(jc, q, c);
  check('con todo el dato salen las tres, en orden', t.map(x => x.id).join() === 'amenaza,quiebre,decision', t.map(x => x.id));
  check('la amenaza es el intocable antes que el foco y dice que su defensor no ayuda', /SNIPER/.test(t[0].texto) && /no ayuda/.test(t[0].texto));
  check('la decisión es la concesión más barata e incluye lo que no se concede', /FRIO UNO/.test(t[2].texto) && /SNIPER/.test(t[2].texto));
  check('todas dicen que es una lectura, no una orden (en el título del bloque de la UI y en la acción)', t.every(x => typeof x.texto === 'string' && x.texto.length > 10));
  check('sin quiebre quedan dos, sin inventar la tercera', S.tresCosas(jc, { ok: false }, c).map(x => x.id).join() === 'amenaza,decision');
  check('sin nada, ninguna', S.tresCosas(null, null, null).length === 0);
  const sinInt = { filas: jc.filas, plan: { focos: [foco], intocables: [], fuentes: [], cristal: [] } };
  check('sin intocable, la amenaza es el foco: se lo dobla', /doblarlo/.test(S.tresCosas(sinInt, null, null)[0].texto));
}

console.log('\n4. QUE ESTÉ CABLEADO');
console.log('═'.repeat(70));
{
  const src = fs.readFileSync('./js/sgadd-scouting.js', 'utf8');
  const html = fs.readFileSync('./index.html', 'utf8');
  check('el informe suma el quiebre, las concesiones y las tres cosas', /quiebreRival: quiebreRival/.test(src) && /concesionesRival: concesionesRival/.test(src) && /tresCosas: tresCosas\(/.test(src));
  check('las tres cards están en el modal y en el orden del informe',
    ['tres-cosas', 'diagnostico', 'concesiones'].every(id => new RegExp("\\{ id: '" + id + "'").test(src))
      && src.indexOf('scoutBloqueTresCosas(inf)}') < src.indexOf('scoutBloqueMatriz(inf)}')
      && src.indexOf('scoutBloqueConcesiones(inf)}') > src.indexOf('scoutBloqueMarcas(inf)}')
      && src.indexOf('scoutBloqueConcesiones(inf)}') < src.indexOf('scoutBloqueJugadores(inf)}'));
  check('las tres tienen su data-bloque (una opción de exportación cada una)', ['tres-cosas', 'diagnostico', 'concesiones'].every(id => src.includes('data-bloque="' + id + '"')));
  check('ninguna es del plan ORO: va para todos los planes', !/id: '(tres-cosas|diagnostico|concesiones)'[^}]*bloque:/.test(src));
  check('el semáforo no depende solo del color: lleva glifo', /▲/.test(src) && /▼/.test(src) && /●/.test(src) && /◆/.test(src));
  check('el diagnóstico reusa el motor clínico y no calcula percentiles por su cuenta', /C\.equipo\(idx, eR\)/.test(src));
  check('las piezas del play-by-play son opcionales: sin la capa dice que necesita el laboratorio', /necesita la capa de laboratorio/.test(src));
  check('el assets va en ?v=313 o más', /sgadd-scouting\.js\?v=3(1[3-9]|[2-9]\d)/.test(html));
}

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
