/* =====================================================================
   El soporte de decisión del Scouting (v313-v314): la versión perdedora del
   rival, los duelos cruzados con sus volúmenes de umbral, el FODA y las
   tres cosas del tiempo muerto (el mal menor se fue en la v314).

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

console.log('\n2. LOS DUELOS CRUZADOS');
console.log('═'.repeat(70));
const duelosStub = (margen) => ({
  ok: true, claveLocal: 'L', claveVisitante: 'V', margen: margen, factorClave: { id: 'eFG%' }, muestraLocal: 10, muestraVisitante: 9,
  duelos: [
    { id: 'eFG%', label: 'Eficiencia de tiro', netL: 0.03, netV: -0.02, impactoL: 2.0, impactoV: -1.0, propioL: 0.52, defV: 0.49, propioV: 0.47, defL: 0.49 },
    { id: 'PP%', label: 'Cuidado de la pelota', netL: -0.01, netV: 0.02, impactoL: -0.5, impactoV: 1.0, propioL: 0.15, defV: 0.14, propioV: 0.12, defL: 0.14 },
  ],
});
const idxDuelos = { get: (c) => ({ clave: c }) };
{
  global.SGADD_4F = { simularEnfrentamiento: () => duelosStub(4.2) };
  const d = S.duelosCruzados(idxDuelos, 'L', 'V', 'L', 'V');
  check('nuestro equipo local: nuestro ataque es el del local y su defensa la del visitante', d.ok && d.filas[0].nuestro.propio === 0.52 && d.filas[0].nuestro.contra === 0.49 && d.filas[0].rival.propio === 0.47, d.filas && d.filas[0]);
  check('✓/✗: el ataque que supera a la defensa rival', d.filas[0].nuestro.ok === true && d.filas[0].rival.ok === false && d.filas[1].nuestro.ok === false && d.filas[1].rival.ok === true);
  check('★ marca el factor clave del simulador y solo ese', d.filas[0].estrella === true && d.filas[1].estrella === false);
  check('el balance es nuestro impacto menos el del rival: > 0 inclina a nuestro favor', Math.abs(d.filas[0].balance - 3.0) < 1e-9 && Math.abs(d.filas[1].balance + 1.5) < 1e-9);
  check('el margen proyectado viene desde nuestro lado y dice a quién favorece', d.margenNuestro === 4.2 && d.favorece === 'nuestro');
  const v = S.duelosCruzados(idxDuelos, 'V', 'L', 'L', 'V');
  check('si nosotros somos el visitante los lados se dan vuelta y el margen cambia de signo', v.filas[0].nuestro.propio === 0.47 && v.filas[0].rival.propio === 0.52 && v.margenNuestro === -4.2 && v.favorece === 'rival');
  global.SGADD_4F = { simularEnfrentamiento: () => ({ ok: false, motivo: 'sin partidos' }) };
  const f = S.duelosCruzados(idxDuelos, 'L', 'V', 'L', 'V');
  check('sin muestra no se inventa el cruce y se dice por qué', f.ok === false && /sin partidos/.test(f.motivo));
  global.SGADD_4F = {};
  check('sin el simulador cargado degrada, sin error', S.duelosCruzados(idxDuelos, 'L', 'V', 'L', 'V').ok === false);
}

console.log('\n3. LOS VOLÚMENES DE UMBRAL');
console.log('═'.repeat(70));
const liga = { PTS: 80, T3C: 8, 'RO%': 0.28, 'RTL%': 0.3 };
const idxVol = (propio, dist) => ({
  get: (c) => ({ clave: c, nombre: 'EQ', pj: 12 }),
  leer: (c, k) => (propio[k] === undefined ? null : { valor: propio[k], tipo: liga[k] === undefined ? null : liga[k] }),
  liga: { distribuciones: { 'PePP%': dist || [0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.20] } },
});
const volProp = { TCI: 62, T1C: 12, PTS: 78, 'eFG%': 0.5, T3C: 7, T3I: 22, 'T3%': 0.32, PP: 15, PLAYS: 85, RO: 9, 'RO%': 0.25, T1I: 16, 'RTL%': 0.26 };
{
  const v = S.volumenesUmbral(idxVol(volProp), 'X');
  const g = (id) => v.items.find(i => i.id === id);
  check('trae los cinco volúmenes', v.items.map(i => i.id).join() === 'tc,t3,perdidas,ro,tl', v.items.map(i => i.id));
  check('tiros de campo: los puntos de la mediana menos sus libres, sobre 2 × su eFG% → (80−12)/(2×0,5) = 68', Math.abs(g('tc').umbral - 68) < 1e-9 && g('tc').ok === false);
  check('triples: los convertidos de la mediana sobre su T3% → 8/0,32 = 25', Math.abs(g('t3').umbral - 25) < 1e-9 && g('t3').ok === false);
  check('pérdidas: el tope es sus plays × el peor cuarto de la liga, y se mide hacia abajo', g('perdidas').dir === 'max' && Math.abs(g('perdidas').umbral - 85 * 0.17) < 1e-9 && g('perdidas').ok === false, g('perdidas'));
  check('rebote ofensivo: el RO% de la mediana × sus oportunidades (9/0,25 = 36) → 10,08', Math.abs(g('ro').umbral - 0.28 * 36) < 1e-9);
  check('libres: el RTL% de la mediana × sus tiros de campo → 0,3 × 62 = 18,6', Math.abs(g('tl').umbral - 18.6) < 1e-9);
  check('cada uno trae el texto con el número y el actual', v.items.every(i => /\d/.test(i.texto) && typeof i.corto === 'string' && i.corto.length > 5));
  const alto = S.volumenesUmbral(idxVol(Object.assign({}, volProp, { PP: 9, TCI: 80 })), 'X');
  check('con pérdidas bajo el tope y tiros de sobra, el equipo está del lado bueno', alto.items.find(i => i.id === 'perdidas').ok === true && alto.items.find(i => i.id === 'tc').ok === true);
  check('sin datos de un volumen se omite, no se inventa', S.volumenesUmbral(idxVol({ TCI: 62 }), 'X').items.length === 0);
  check('sin distribución de pérdidas no hay tope', !S.volumenesUmbral({ get: () => ({ nombre: 'E' }), leer: idxVol(volProp).leer, liga: {} }, 'X').items.some(i => i.id === 'perdidas'));
  check('un equipo que no existe no revienta', S.volumenesUmbral({ get: () => null }, 'X') === null && S.volumenesUmbral(null, 'X') === null);
}

console.log('\n4. LAS TRES COSAS');
console.log('═'.repeat(70));
{
  global.SGADD_4F = { simularEnfrentamiento: () => duelosStub(-3.1) };
  const d = S.duelosCruzados(idxDuelos, 'L', 'V', 'L', 'V');
  const q = S.versionPerdedora(idxDe([
    P('GANADO', 0.55, 0.12), P('GANADO', 0.56, 0.15), P('GANADO', 0.54, 0.10), P('PERDIDO', 0.44, 0.13), P('PERDIDO', 0.45, 0.11), P('PERDIDO', 0.43, 0.14)]), 'X');
  const vr = S.volumenesUmbral(idxVol(volProp), 'X'), vn = S.volumenesUmbral(idxVol(volProp), 'X');
  const t = S.tresCosas(d, q, vr, vn, 'SNIPER');
  check('con todo el dato salen las tres, en orden: duelo, quiebre y volumen', t.map(x => x.id).join() === 'duelo,quiebre,volumen', t.map(x => x.id));
  check('el duelo es el factor ★, con las dos cifras y a quién favorece el margen', /★ Eficiencia de tiro/.test(t[0].texto) && /47,0%/.test(t[0].texto) && /49,0%/.test(t[0].texto) && /−3,1/.test(t[0].texto), t[0].texto);
  check('si su ataque no supera nuestra defensa, el duelo dice que es nuestro y hay que sostenerlo', /lo ganamos/.test(t[0].texto) && t[0].tono === 'bajo');
  const dPierde = S.duelosCruzados(idxDuelos, 'V', 'L', 'L', 'V');
  check('si su ataque supera nuestra defensa, dice que hay que quitárselo y es ▲', /nos gana: hay que quitárselo/.test(S.tresCosas(dPierde, null, null, null, null)[0].texto) && S.tresCosas(dPierde, null, null, null, null)[0].tono === 'alto');
  check('el quiebre trae la referencia de volumen de SU métrica', /Cuando su eFG% cae/.test(t[1].texto) && /Su referencia: 68,0 tiros de campo por partido \(hoy 62,0\)/.test(t[1].texto), t[1].texto);
  check('el volumen propio da el tope de pérdidas y lo que hay que sostener, y dice a quién no soltar', /no pasar de 14,[45] pérdidas/.test(t[2].texto) && /al menos 68,0 tiros de campo/.test(t[2].texto) && /Sin soltar a SNIPER/.test(t[2].texto), t[2].texto);
  check('sin quiebre quedan dos, sin inventar la tercera', S.tresCosas(d, { ok: false }, vr, vn, null).map(x => x.id).join() === 'duelo,volumen');
  check('sin duelos (sin muestra) se salta el primero', S.tresCosas({ ok: false }, q, vr, vn, null).map(x => x.id).join() === 'quiebre,volumen');
  check('sin nada, ninguna', S.tresCosas(null, null, null, null, null).length === 0);
  check('ninguna repite el diagnóstico ni habla de conceder: son directivas del cruce', t.every(x => !/Conceder|mal menor/.test(x.texto)));
}

console.log('\n5. EL FODA');
console.log('═'.repeat(70));
{
  global.SGADD_4F = { simularEnfrentamiento: () => duelosStub(4.2) };
  const d = S.duelosCruzados(idxDuelos, 'L', 'V', 'L', 'V');
  const q = S.versionPerdedora(idxDe([
    P('GANADO', 0.55, 0.12), P('GANADO', 0.56, 0.15), P('GANADO', 0.54, 0.10), P('PERDIDO', 0.44, 0.13), P('PERDIDO', 0.45, 0.11), P('PERDIDO', 0.43, 0.14)]), 'X');
  const it = (titulo, percentil) => ({ titulo, valor: '50%', sub: 'liga 45%', percentil });
  const f = S.foda({
    fortalezasRival: [it('eFG%', 91), it('Rebote', 72), it('Ritmo', 55)],
    debilidadesRival: [it('Pérdidas', 12), it('DRTG', 38), it('Faltas', 30)],
    duelos: d, quiebre: q, amenaza: 'SNIPER',
  });
  check('F: solo percentil ≥ 70', f.F.length === 2 && /eFG%/.test(f.F[0].texto) && /A neutralizar/.test(f.F[0].texto), f.F);
  check('D: solo percentil < 35 (un 38 no entra) y suma su versión perdedora', f.D.length === 3 && f.D.some(x => /Pérdidas/.test(x.texto)) && !f.D.some(x => /DRTG/.test(x.texto)) && f.D.some(x => /Cuando su eFG%/.test(x.texto)), f.D);
  check('O: donde NUESTRO ataque supera su defensa', f.O.length === 1 && /Nuestro eficiencia de tiro \(52,0%\) supera su defensa \(49,0%\)/.test(f.O[0].texto), f.O);
  check('A: donde su ataque supera nuestra defensa, más la amenaza', f.A.length === 2 && /Su cuidado de la pelota \(12,0% de pérdidas\)/.test(f.A[0].texto) && /SNIPER: su tiro paga/.test(f.A[1].texto), f.A);
  const sinF = S.foda({ fortalezasRival: [{ titulo: 'eFG%', valor: '50,0%', percentil: 60 }], fortalezasAltas: [{ titulo: 'RD%', valor: '70,0%', sub: 'percentil 62', percentil: 62 }, { titulo: 'eFG%', valor: '50,0%', sub: 'percentil 58', percentil: 58 }, { titulo: 'RO%', valor: '25%', percentil: 40 }] });
  check('F sin nada sobre el corte de 70: muestra las métricas más altas (55 o más) en vez de callar', sinF.F.length === 2 && /RD%/.test(sinF.F[0].texto) && /condiciona el planteo/.test(sinF.F[0].texto) && !sinF.F.some(i => /RO%/.test(i.texto)), sinF.F);
  const srcSc = require('fs').readFileSync('js/sgadd-scouting.js', 'utf8');
  check('el FODA no dice «Sin datos del box score»; las dependencias nombran al top 3 con Plays y USG', !/Sin datos del box score/.test(srcSc) && /slice\(0, 3\)/.test(srcSc.split('TOP 3 CON NOMBRE')[1].slice(0, 400)) && /Plays · \$\{scoutPctFino\(f\.perfil\.usg\)\} USG/.test(srcSc));
  const vacio = S.foda({});
  check('sin nada, nada: no se inventa ninguna casilla', vacio.hay === false && !vacio.F.length && !vacio.O.length && !vacio.D.length && !vacio.A.length);
  global.SGADD_4F = { simularEnfrentamiento: () => ({ ok: true, claveLocal: 'L', claveVisitante: 'V', margen: 0, factorClave: { id: 'eFG%' }, duelos: [{ id: 'eFG%', label: 'Eficiencia de tiro', netL: -0.02, netV: 0.02, impactoL: -1, impactoV: 1, propioL: 0.47, defV: 0.5, propioV: 0.5, defL: 0.48 }] }) };
  const sinVentaja = S.foda({ duelos: S.duelosCruzados(idxDuelos, 'L', 'V', 'L', 'V') });
  check('si ningún factor nuestro supera su defensa, la O lo dice y habla de volumen', sinVentaja.O.length === 1 && /construirse|construirla/.test(sinVentaja.O[0].texto));
}

console.log('\n6. QUE ESTÉ CABLEADO');
console.log('═'.repeat(70));
{
  const src = fs.readFileSync('./js/sgadd-scouting.js', 'utf8');
  const html = fs.readFileSync('./index.html', 'utf8');
  const pbp = fs.readFileSync('./js/sgadd-pbp.js', 'utf8');
  check('el informe suma duelos, volúmenes, quiebre y las tres cosas', /duelos: duelosCruzadosInf/.test(src) && /volumenesRival: volumenesRival/.test(src) && /volumenesNuestro: volumenesNuestro/.test(src) && /quiebreRival: quiebreRival/.test(src) && /tresCosas: tresCosas\(duelosCruzadosInf/.test(src));
  check('las cards nuevas están en el modal y en el orden del informe',
    ['tres-cosas', 'duelos', 'diagnostico', 'foda', 'pbp-cuartos'].every(id => new RegExp("\\{ id: '" + id + "'").test(src))
      && src.indexOf('scoutBloqueTresCosas(inf)}') < src.indexOf('scoutBloqueDiagnostico(inf)}')
      && src.indexOf('scoutBloqueDiagnostico(inf)}') < src.indexOf('scoutBloqueDuelos(inf)}')
      && src.indexOf('scoutBloqueDuelos(inf)}') < src.indexOf('scoutBloqueFoda(inf)}')
      && src.indexOf('scoutBloqueFoda(inf)}') < src.indexOf('scoutBloqueMatriz(inf)}')
      && src.indexOf('scoutBloquePbp(inf)}') < src.indexOf('scoutBloqueCuartos(inf)}'));
  check('cada una tiene su data-bloque (una opción de exportación cada una)', ['tres-cosas', 'duelos', 'diagnostico', 'foda', 'pbp-cuartos'].every(id => src.includes('data-bloque="' + id + '"')));
  check('la card del mal menor se fue: ni en el modal, ni en el DOM, ni en el motor', !/id: 'concesiones'/.test(src) && !src.includes('data-bloque="concesiones"') && !/concesionesRival|scoutBloqueConcesiones/.test(src) && typeof S.concesiones === 'undefined');
  check('y su pieza del play-by-play también', typeof require('./js/sgadd-pbp.js').rivalConcesionesHtml === 'undefined' && !/rival-concesiones/.test(pbp));
  check('solo la de cuartos pide la capa de laboratorio; ninguna es del plan ORO', /\{ id: 'pbp-cuartos'[^}]*capa: 'pbp'/.test(src) && !/id: '(tres-cosas|duelos|diagnostico|foda)'[^}]*bloque:/.test(src));
  check('el semáforo no depende solo del color: lleva glifo', /▲/.test(src) && /▼/.test(src) && /●/.test(src) && /◆/.test(src) && /✓/.test(src) && /✗/.test(src));
  check('el diagnóstico y el FODA reusan el motor clínico y no calculan percentiles por su cuenta', (src.match(/C\.equipo\(idx, eR\)/g) || []).length >= 2);
  check('las piezas del play-by-play son opcionales: sin la capa dice que necesita el laboratorio', /necesita la capa de laboratorio/.test(src));
  check('el assets va en ?v=315 o más', /sgadd-scouting\.js\?v=3(1[4-9]|[2-9]\d)/.test(html));
}

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
