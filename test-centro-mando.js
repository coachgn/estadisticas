/* =====================================================================
   test-centro-mando.js · centro-mando/motor.js y su servidor local

   Lo que se fija: las propuestas salen de lo que arma el generador y no
   de un número propio, una pieza sin datos se muestra sin datos, el
   play-by-play no se presta entre ligas, el aprendizaje reordena sin
   filtrar y no opina con menos de tres publicaciones, y el servidor
   escucha solo en la máquina local.

   Corre sobre el snapshot de la demo, igual que test-contenido.js.
   ===================================================================== */
'use strict';

const fs = require('fs');
const NL = '\n';
let ok = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); }
};
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));

const SGADD = require('./js/sgadd-core.js');
const DEMO = require('./js/sgadd-demo.js');
const GC = require('./generar-contenido.js');
const M = require('./centro-mando/motor.js');

const hojas = DEMO.rehidratar(require('./demo/datos-demo.json'));
const idx = SGADD.construirIndice(hojas, { fase: 'REGULAR', torneo: SGADD.TORNEO_TOTAL });

/* -------------------------------------------------------------------- */
titulo('El catálogo de piezas');
{
  check('cada receta del generador tiene su ficha, y al revés',
    Object.keys(GC.RECETAS).sort().join() === Object.keys(M.PIEZAS).sort().join());
  check('las de libro son carruseles y las de play-by-play, reels',
    Object.keys(GC.RECETAS).every((id) => (GC.RECETAS[id].fuente === 'pbp') === (M.PIEZAS[id].formato === 'reel')));
  check('todo eje declarado tiene nombre', Object.keys(M.PIEZAS).every((id) => !!M.EJES[M.PIEZAS[id].eje]));
  check('adentro de un formato, un eje nombra UNA pieza',
    ['carrusel', 'reel'].every((f) => { const e = M.piezasPara(f).map((id) => M.PIEZAS[id].eje); return new Set(e).size === e.length; }));
  check('un eje filtra', M.piezasPara('carrusel', 'falta').join() === 'CR-03' && M.piezasPara('reel', 'falta').length === 0);

  const o = M.opciones(GC.LIGAS);
  check('las opciones no llevan club, categoría ni carpeta', !/reconquista|deportivo-primera|conferencia-norte|jujuy/.test(JSON.stringify(o.ligas)));
  check('dicen qué zona tiene play-by-play', o.ligas.find((l) => l.id === 'apb').zonas.every((z) => z.pbp === false) &&
    o.ligas.find((l) => l.id === 'lab25').zonas[0].pbp === true);
}

/* -------------------------------------------------------------------- */
titulo('Qué formato se puede pedir');
{
  const apb = GC.LIGAS.apb, lnb = GC.LIGAS.lnb;
  check('un reel de APdeB se rechaza con el motivo literal', M.motivoSinFormato('reel', apb, apb.zonas.b) === GC.SIN_PBP);
  check('un reel de una liga con play-by-play pasa', M.motivoSinFormato('reel', lnb, lnb.zonas.unica) === null);
  check('las Stories solo salen de una liga con nombres', /solo se publican de APdeB/.test(M.motivoSinFormato('stories', lnb, lnb.zonas.unica)) &&
    M.motivoSinFormato('stories', apb, apb.zonas.a) === null);
  check('un carrusel se puede pedir de cualquiera', Object.keys(GC.LIGAS).every((l) => M.motivoSinFormato('carrusel', GC.LIGAS[l], {}) === null));
  check('un formato que no existe se rechaza', !!M.motivoSinFormato('tiktok', apb, apb.zonas.a));
}

/* -------------------------------------------------------------------- */
titulo('Los ganchos');
{
  const g = M.ganchos('El titular', 'Primer dato de 7 equipos. Segundo dato.', ['Portada', '¿Con qué vara medís? + demo']);
  check('salen tres, uno por estilo', g.map((x) => x.estilo).join() === 'dato,titular,pregunta');
  check('el de dato es la PRIMERA oración del dato', g[0].texto === 'Primer dato de 7 equipos.');
  check('la pregunta sale del guion, sin el resto de la línea', g[2].texto === '¿Con qué vara medís?');
  check('sin pregunta en el guion, ese estilo no se inventa', M.ganchos('T', 'D.', ['Portada']).length === 2);
  check('dos ganchos iguales no se repiten', M.ganchos('Igual.', 'Igual.', []).length === 1);

  const n2 = GC.nivel2(idx, [], { nivel: 'LIGA_ARGENTINA' });
  const props = n2.piezas.map(M.deReceta);
  const conDatos = props.filter((p) => p.ok);
  check('hay propuestas con datos', conDatos.length >= 3, conDatos.length);
  const numeros = (t) => String(t).match(/\d+(?:[.,]\d+)?/g) || [];
  check('NINGÚN gancho trae un número que no esté en la receta', conDatos.every((p) => {
    const r = n2.piezas.find((x) => x.id === p.id), fuente = [r.titulo, r.dato].concat(r.guion).join(' ');
    return p.ganchos.every((gg) => numeros(gg.texto).every((n) => fuente.indexOf(n) !== -1));
  }));
  check('la propuesta lleva los datos de la receta sin tocarlos',
    conDatos.every((p) => JSON.stringify(p.datos) === JSON.stringify(n2.piezas.find((x) => x.id === p.id).datos)));
  const sin = props.filter((p) => !p.ok);
  check('las de play-by-play, sin paquetes, quedan SIN DATOS y con el motivo',
    sin.filter((p) => p.formato === 'reel').length === 4 && sin.filter((p) => p.formato === 'reel').every((p) => p.avisos[0] === GC.SIN_PBP && !p.ganchos));
}

/* -------------------------------------------------------------------- */
titulo('El Nivel 1');
{
  const pq = GC.paquete(idx, { torneo: 'TORNEO', zona: 'ZONA X' });
  const st = M.propuestas({ nivel1: pq }, { formato: 'stories' });
  check('las Stories son UNA propuesta con sus placas', st.length === 1 && st[0].id === 'STORIES' && st[0].datos.placas.length === pq.stories.placas.length);
  const fd = M.propuestas({ nivel1: pq }, { formato: 'feed' });
  check('el feed trae la elegida y las alternativas', fd.length === 1 + pq.feed.alternativas.length && fd[0].id === pq.feed.elegida);
  check('la elegida lo dice', /mayor contraste/.test(fd[0].avisos[0]) && fd.slice(1).every((p) => !p.avisos.length));
  check('cada posteo de feed tiene eje', fd.every((p) => !!M.EJES[p.eje]));
  const soloTiro = M.propuestas({ nivel1: pq }, { formato: 'feed', eje: 'tiro' });
  check('el eje filtra el feed', soloTiro.length > 0 && soloTiro.length < fd.length && soloTiro.every((p) => p.eje === 'tiro'));
  check('pedir Stories no arrastra el feed, ni al revés', st.every((p) => p.formato === 'stories') && fd.every((p) => p.formato === 'feed'));
}

/* -------------------------------------------------------------------- */
titulo('El aprendizaje');
{
  const r = (o) => Object.assign({ pieza: 'CR-01', formato: 'carrusel', estilo: 'dato', alcance: 1000, guardados: 0, compartidos: 0, comentarios: 0, likes: 0 }, o);
  check('el puntaje pondera compartidos > guardados > comentarios > me gusta',
    M.puntaje(r({ compartidos: 10 })) === 4 && M.puntaje(r({ guardados: 10 })) === 3 && M.puntaje(r({ comentarios: 10 })) === 2 && M.puntaje(r({ likes: 10 })) === 1);
  check('sin alcance no hay puntaje', M.puntaje(r({ alcance: 0 })) === null && M.puntaje(null) === null);

  check('sin publicaciones, todo pesa 1', M.ponderaciones([]).publicaciones === 0 && Object.keys(M.ponderaciones([]).formato).length === 0);
  const dos = M.ponderaciones([r({ guardados: 90 }), r({ guardados: 90 }), r({ formato: 'reel', pieza: 'RL-01', guardados: 1 })]);
  check('con menos de tres publicaciones un grupo NO opina', dos.formato.carrusel.confiable === false && dos.formato.carrusel.peso === 1 && dos.formato.reel.peso === 1);

  const regs = [1, 2, 3].map(() => r({ estilo: 'pregunta', guardados: 60 })).concat([1, 2, 3].map(() => r({ formato: 'reel', pieza: 'RL-01', estilo: 'dato', guardados: 10 })));
  const w = M.ponderaciones(regs);
  check('con tres, el que rinde más pesa más que 1 y el otro menos', w.formato.carrusel.peso > 1 && w.formato.reel.peso < 1 && w.estilo.pregunta.peso > w.estilo.dato.peso);
  check('el peso queda acotado', [50, 500, 5000].every((g) => {
    const x = M.ponderaciones([1, 2, 3].map(() => r({ guardados: g })).concat([1, 2, 3].map(() => r({ formato: 'reel', guardados: 1 }))));
    return x.formato.carrusel.peso <= M.TECHO && x.formato.reel.peso >= M.PISO;
  }));

  const props = [
    { id: 'RL-01', ok: true, formato: 'reel', ganchos: [{ estilo: 'dato', texto: 'a' }, { estilo: 'pregunta', texto: 'b' }] },
    { id: 'RL-09', ok: false, formato: 'reel', avisos: ['x'] },
    { id: 'CR-01', ok: true, formato: 'carrusel', ganchos: [{ estilo: 'dato', texto: 'a' }, { estilo: 'pregunta', texto: 'b' }] },
  ];
  const sinApr = M.ordenar(props, M.ponderaciones([]));
  check('sin aprendizaje, el orden es el del generador', sinApr.map((p) => p.id).join() === 'RL-01,CR-01,RL-09' && sinApr[0].ganchos[0].estilo === 'dato');
  const conApr = M.ordenar(props, w);
  check('con aprendizaje, sube el formato que rindió', conApr.map((p) => p.id).join() === 'CR-01,RL-01,RL-09');
  check('y adentro, el estilo de gancho que rindió', conApr[0].ganchos[0].estilo === 'pregunta');
  check('reordena, NO filtra: no se pierde ninguna', conApr.length === props.length);
  check('la que no tiene datos va última, siempre', conApr[2].ok === false && sinApr[2].ok === false);
  check('no muta lo que recibe', props[0].ganchos[0].estilo === 'dato' && !('peso' in props[0]));

  check('un registro bueno pasa', M.normalizarRegistro({ pieza: 'cr-01', formato: 'carrusel', estilo: 'dato', alcance: '1200', guardados: '30' }).registro.pieza === 'CR-01');
  const mal = (o) => M.normalizarRegistro(Object.assign({ pieza: 'CR-01', formato: 'carrusel', alcance: 100 }, o));
  check('sin alcance se rechaza', mal({ alcance: 0 }).ok === false && /alcance/.test(mal({ alcance: '' }).error));
  check('un formato o un estilo inventados se rechazan', mal({ formato: 'tiktok' }).ok === false && mal({ estilo: 'gritado' }).ok === false);
  check('un número negativo o con letras se rechaza', mal({ guardados: -1 }).ok === false && mal({ likes: 'muchos' }).ok === false);
  check('lo que no se carga vale cero, no nulo', mal({}).registro.compartidos === 0);
  check('no guarda campos de más', !('basura' in mal({ basura: 1 }).registro));
}

/* -------------------------------------------------------------------- */
titulo('La exportación');
{
  const p = { id: 'CR-01', ok: true, formato: 'carrusel', formatoLabel: 'Carrusel 3:4', titulo: 'Título <b>', dato: 'Dato & más', guion: ['Uno', 'Dos <script>'] };
  const h = M.placasHtml(p, 'Mi "gancho"', 'Contexto a mano');
  check('una placa por línea del guion, más la portada y el contexto', (h.match(/data-document-role="page"/g) || []).length === 4);
  check('todo lo que entra se escapa', h.indexOf('<script>') === -1 && h.indexOf('Título <b>') === -1 && h.indexOf('&quot;gancho&quot;') !== -1);
  check('las imágenes van por URL pública, no en data URI', !/data:image/.test(h) && /https:\/\/coachgn\.github\.io/.test(h));
  check('el carrusel es 3:4 y el reel 9:16', /height:1350px/.test(h) && /height:1920px/.test(M.placasHtml(Object.assign({}, p, { formato: 'reel' }))));
  check('sin contexto no hay placa de contexto', (M.placasHtml(p, 'g').match(/data-document-role="page"/g) || []).length === 3);
  const md = M.resumenMd(p, 'Gancho elegido', 'Contexto');
  check('el resumen dice el gancho elegido y que el contexto es manual', /\*\*Gancho:\*\* Gancho elegido/.test(md) && /cargado a mano/.test(md));
}

/* -------------------------------------------------------------------- */
titulo('El servidor local y el generador');
{
  const src = fs.readFileSync('centro-mando/servidor.js', 'utf8');
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '');
  check('escucha SOLO en 127.0.0.1', /\.listen\(PUERTO, '127\.0\.0\.1'/.test(codigo) && !/0\.0\.0\.0/.test(codigo));
  check('arma las piezas por el camino que verifica el anonimato', /GC\.armarNivel2\(/.test(codigo) && /GC\.armarNivel1\(/.test(codigo) &&
    !/GC\.nivel2\(|GC\.paquete\(/.test(codigo));
  check('no calcula: no lee el núcleo ni los motores', !/sgadd-core|sgadd-scouting|sgadd-jugadores/.test(codigo));
  check('todo lo que escribe va a contenido/', (codigo.match(/path\.join\(RAIZ, '([^']+)'/g) || []).every((m) => /'contenido'/.test(m)));
  check('no llama a ningún servicio externo', !/fetch\(|https?:\/\/(?!127\.0\.0\.1)/.test(codigo));

  const gc = fs.readFileSync('generar-contenido.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const cuerpo = (n) => { const a = gc.indexOf('function ' + n + '('); return gc.slice(a, gc.indexOf('\nfunction ', a + 10)); };
  check('`armarNivel2` anonimiza y verifica antes de devolver', cuerpo('armarNivel2').indexOf('verificarAnonimo(') !== -1 &&
    cuerpo('armarNivel2').indexOf('verificarAnonimo(') < cuerpo('armarNivel2').lastIndexOf('return n2'));
  check('`armarNivel1` también', /anonimizar\(pq\);\s*verificarAnonimo\(/.test(cuerpo('armarNivel1')));
  check('la línea de comandos usa esas mismas dos', /armarNivel1\(args, p, idx\)/.test(cuerpo('principal')) && /armarNivel2\(args, p, idx\)/.test(cuerpo('escribirNivel2')));

  /* El armado en memoria, ejercido: anónimo y sin play-by-play ajeno. */
  const p = GC.resolverPedido({ liga: 'apb', zona: 'b' });
  const previo = process.env.MOTORSTATS_INGESTION;
  process.env.MOTORSTATS_INGESTION = __dirname + '/no-existe';
  const n2 = GC.armarNivel2({ piezas: 'CR-01,RL-01' }, p, idx);
  if (previo === undefined) delete process.env.MOTORSTATS_INGESTION; else process.env.MOTORSTATS_INGESTION = previo;
  check('el Nivel 2 en memoria sale anónimo', n2.anonimo === true);
  check('y su reel de APdeB, sin datos de PBP', n2.piezas[1].ok === false && n2.piezas[1].avisos[0] === GC.SIN_PBP);

  const html = fs.readFileSync('centro-mando/index.html', 'utf8');
  check('la página no se indexa', /name="robots" content="noindex/.test(html));
  check('y no trae un sheetId ni un mail', !/[A-Za-z0-9_-]{40,}/.test(html.replace(/https?:\/\/\S+/g, '')) && !/@gmail/.test(html));
}

console.log(NL + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
