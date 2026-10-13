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
/* La demo ya llama «JUGADOR 45» a su gente, que es el rótulo que pone la
   anonimización: se renombran para que una fuga se pueda ver (igual que
   en test-contenido.js). Las filas TIPO no llevan número y no se tocan. */
Object.keys(hojas).forEach((h) => hojas[h].filas.forEach((fila) => Object.keys(fila).forEach((k) => {
  if (typeof fila[k] !== 'string') return;
  fila[k] = fila[k].replace(/JUGADOR (\d+)/g, 'PEREZ$1, JUAN').replace(/EQUIPO (\d+)/g, 'CLUB$1 ATLETICO');
})));
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

/* -------------------------------------------------------------------- */
titulo('Destacadas de la fecha, el visor y la aprobación');
{
  const pq = GC.paquete(idx, { torneo: 'TORNEO', zona: 'ZONA X' });
  const n2 = GC.nivel2(idx, [], { nivel: 'LIGA_ARGENTINA' });
  const auto = M.propuestas({ nivel1: pq, nivel2: n2 }, { formato: M.AUTO, stories: true });
  const feeds = auto.filter((p) => p.formato === 'feed');
  const conAnomalia = [pq.feed.posteo].concat(pq.feed.alternativas).filter((x) => x.contraste > 0).length;
  check('«destacadas» junta Nivel 1 y Nivel 2', auto.some((p) => p.formato === 'carrusel') && auto.some((p) => p.id === 'STORIES'));
  check('del feed entra SOLO el que encontró una anomalía', feeds.length === conAnomalia && feeds.length < 1 + pq.feed.alternativas.length, feeds.length + ' de ' + (1 + pq.feed.alternativas.length));
  check('y van del mayor contraste al menor', feeds.every((p, i) => !i || feeds[i - 1].muestra.contraste >= p.muestra.contraste));
  check('una liga sin nombres no recibe Stories en «destacadas»', !M.propuestas({ nivel1: pq, nivel2: n2 }, { formato: M.AUTO, stories: false }).some((p) => p.id === 'STORIES'));
  check('las diez piezas de Nivel 2 están, con o sin datos', auto.filter((p) => M.PIEZAS[p.id]).length === 10);
  check('«destacadas» se ofrece primero y no es un formato de publicación', M.opciones(GC.LIGAS).formatos[0].id === M.AUTO && !M.FORMATOS[M.AUTO]);

  const p = auto.find((x) => x.ok && x.formato === 'carrusel');
  const t0 = new Date('2026-10-12T15:00:00Z');
  const reg = M.registroDeAprobacion(p, p.ganchos[0], 'apb-b', t0);
  check('aprobar anota pieza, formato, estilo y gancho', reg.pieza === p.id && reg.formato === 'carrusel' && reg.estilo === p.ganchos[0].estilo && reg.gancho === p.ganchos[0].texto && reg.estado === 'aprobada');
  check('la fecha es la del día LOCAL, también de noche', M.registroDeAprobacion(p, null, 'x', new Date(2026, 9, 12, 22, 30)).fecha === '2026-10-12' && M.diaLocal(new Date(2026, 0, 5, 23, 59)) === '2026-01-05');
  check('ni el motor ni el servidor fechan con toISOString', [fs.readFileSync('centro-mando/motor.js', 'utf8'), fs.readFileSync('centro-mando/servidor.js', 'utf8')].every((x) => x.indexOf('toISOString().slice(0, 10)') === -1));
  check('y NO inventa métricas', !('alcance' in reg) && !('guardados' in reg) && !('likes' in reg));
  check('una aprobada sin métricas no mueve las ponderaciones', M.ponderaciones([reg, reg, reg]).publicaciones === 0);
  const med = M.medir([reg], reg.id, { alcance: 2000, guardados: 40, pieza: 'OTRA', formato: 'reel' });
  check('cargarle las métricas la vuelve «medida»', med.ok && med.registros[0].estado === 'medida' && med.registros[0].alcance === 2000 && M.puntaje(med.registros[0]) === 6);
  check('sin dejar cambiarle la pieza ni el formato', med.registros[0].pieza === p.id && med.registros[0].formato === 'carrusel' && med.registros[0].id === reg.id);
  check('no muta el historial que recibe', !('alcance' in reg));
  check('medir sin alcance, o una que no está, se rechaza', M.medir([reg], reg.id, { alcance: 0 }).ok === false && M.medir([reg], 'no-esta', { alcance: 10 }).ok === false);

  const S = require('./centro-mando/servidor.js');
  const st = auto.find((x) => x.id === 'STORIES');
  const v1 = S.placas(p, p.ganchos[0], ''), v2 = S.placas(p, p.ganchos[1], '');
  check('el visor recibe una página por placa', (v1.html.match(/data-document-role="page"/g) || []).length === p.guion.length + 1 && v1.plantilla === 'generica');
  check('cambiar el gancho cambia la portada', v1.html !== v2.html && v1.html.indexOf('<h1>') !== -1);
  check('las Stories anónimas no usan la plantilla con nombres', S.placas(Object.assign({}, st, { datos: Object.assign({}, st.datos, { anonimo: true }) }), null, '').plantilla === 'generica');
  check('una propuesta sin datos no tiene placas', (() => { try { S.placas({ id: 'RL-01', ok: false }); return false; } catch (e) { return /sin|No hay/.test(e.message); } })());

  const src = fs.readFileSync('centro-mando/servidor.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const aprobar = src.slice(src.indexOf('function aprobar('), src.indexOf('function registrar('));
  check('aprobar escribe con el MISMO html que muestra el visor', /const pl = placas\(p, x\.gancho, x\.contexto\)/.test(aprobar) && /escribir\('\.html', pl\.html\)/.test(aprobar));
  check('aprobar anota el historial y la cola', /registroDeAprobacion\(/.test(aprobar) && /escribirLista\(APRENDIZAJE/.test(aprobar) && /escribirLista\(COLA/.test(aprobar));
  check('el servidor no tiene credencial ni llamada a Canva', !/canva\.com|CANVA_|api\.instagram|graph\.facebook/i.test(src));

  const html = fs.readFileSync('centro-mando/index.html', 'utf8');
  check('la página tiene el visor adentro de cada propuesta, aislado', /class="visor"/.test(html) && /<iframe[^>]* sandbox>/.test(html) && /srcdoc = /.test(html));
  check('elegir liga o zona carga la pestaña abierta sin tocar un botón', /addEventListener\('change', cambioDeZona\)/.test(html) && /function cambioDeZona\(\)[\s\S]{0,260}cargarTab\(true\)/.test(html));
  check('una respuesta vieja no pisa a la nueva, en las tres pestañas', ['turnoB', 'turnoX', 'turnoM'].every((t) => html.indexOf('if (yo !== ' + t + ') return;') !== -1));
  check('la página dice que la importación a Canva no sale de ella', /La importación no sale de esta página/.test(html) && /esta página no lee Instagram/.test(html));
}

/* -------------------------------------------------------------------- */
titulo('El Explorador táctico');
{
  const E = require('./centro-mando/explorador.js');
  const o = E.opciones();
  check('los cuatro niveles', Object.keys(o.niveles).join() === 'jugadores,equipos,zonas,partidos');
  check('lo que no está en ningún libro se DICE y no se ofrece', o.noDisponibles.some((x) => /tras pérdida/.test(x)) &&
    !Object.keys(o.metricas).some((n) => o.metricas[n].some((m) => /p[eé]rdida/i.test(m.nombre) && /tras/i.test(m.nombre))));

  /* El ejemplo del pedido: los mejores de tres con menos de 15 minutos. */
  const q = { metricas: ['T3%', 'MIN'], orden: 'T3%', condiciones: [{ metrica: 'MIN', op: '<', valor: 15 }, { metrica: 'T3I', op: '>=', valor: 1 }], top: 5 };
  const r = E.explorar(idx, 'jugadores', q);
  const todos = idx.liga.jugadores;
  const aMano = todos.filter((j) => typeof j['T3%'] === 'number' && typeof j.MIN === 'number' && typeof j.T3I === 'number' && j.MIN < 15 && j.T3I >= 1);
  check('cuenta los que cumplen igual que contándolos a mano', r.cumplen === aMano.length && r.universo === todos.length, r.cumplen + ' vs ' + aMano.length);
  check('todas las filas cumplen las condiciones', r.filas.every((f) => f.valores.MIN < 15 && f.valores.T3I >= 1));
  check('van de mayor a menor por la métrica de orden', r.filas.every((f, i, a) => !i || a[i - 1].valores['T3%'] >= f.valores['T3%']));
  check('el primero es el máximo de los que cumplen', r.filas[0].valores['T3%'] === Math.max.apply(null, aMano.map((j) => j['T3%'])));
  check('el porcentaje no viaja solo: T3I entra a las columnas aunque no se haya marcado', r.columnas.map((c) => c.id).join() === 'T3%,MIN,T3I');
  check('el valor es el del libro, sin tocar', r.filas.every((f) => { const j = todos.find((x) => x.NOMBRES === f.jugador); return j && j['T3%'] === f.valores['T3%']; }));
  check('el que no tiene el dato queda afuera y se cuenta', r.sinDato === todos.filter((j) => typeof j['T3%'] !== 'number' || typeof j.MIN !== 'number' || typeof j.T3I !== 'number').length && r.sinDato > 0);
  check('respeta el tope', r.filas.length === 5 && E.explorar(idx, 'jugadores', { top: 999 }).filas.length === 50);
  check('un porcentaje se compara como se escribe: 35 es 35 %', E.explorar(idx, 'jugadores', { metricas: ['T3%'], condiciones: [{ metrica: 'T3%', op: '>=', valor: 35 }], top: 50 }).filas.every((f) => f.valores['T3%'] >= 0.35));
  check('una métrica que no es de ese nivel se descarta', E.pedido('equipos', { metricas: ['USG%', 'PACE'] }).columnas.join() === 'PACE');
  check('una condición sin valor o con operador inventado se descarta', E.pedido('jugadores', { condiciones: [{ metrica: 'MIN', op: '<', valor: '' }, { metrica: 'MIN', op: '!=', valor: 3 }] }).condiciones.length === 0);
  check('un nivel que no existe se rechaza', (() => { try { E.explorar(idx, 'arbitros', {}); return false; } catch (e) { return true; } })());

  const eq = E.explorar(idx, 'equipos', { metricas: ['RTNG DEF', 'RTNG OFF'], orden: 'RTNG DEF', top: 3 });
  check('equipos · una métrica invertida ordena «el mejor primero» de menor a mayor', eq.sentido === 'asc' && eq.filas[0].valores['RTNG DEF'] <= eq.filas[1].valores['RTNG DEF']);
  check('equipos · el valor es el que da el índice (por posesión)', eq.filas.every((f) => { const e = idx.lista().find((x) => x.nombre === f.equipo); return idx.leer(e.clave, 'RTNG DEF').valor === f.valores['RTNG DEF']; }));
  check('equipos · trae el percentil', eq.filas.every((f) => typeof f.percentil['RTNG OFF'] === 'number'));
  const pa = E.explorar(idx, 'partidos', { metricas: ['PTS'], orden: 'PTS', top: 3 });
  check('partidos · cada fila es un equipo en una noche', pa.universo === idx.lista().reduce((a, e) => a + e.partidos.length, 0) && !!pa.filas[0].fecha);

  /* Entre zonas: dos índices con el ritmo corrido a propósito. */
  const lento = SGADD.construirIndice(JSON.parse(JSON.stringify(hojas)), { fase: 'REGULAR', torneo: SGADD.TORNEO_TOTAL });
  const z1 = E.zonas([{ id: 'a', label: 'ZONA A', idx }, { id: 'b', label: 'ZONA B', idx }], { metricas: ['PACE', 'eFG%'] });
  check('zonas · una fila por zona, con la mediana de sus equipos', z1.filas.length === 2 && z1.filas[0].valores.PACE === SGADD.mediana(idx.lista().map((e) => idx.leer(e.clave, 'PACE').valor)));
  check('zonas · dos zonas iguales no tienen brecha', z1.diferencias.every((d) => d.brecha === 0) && E.diferenciasEntreZonas([{ id: 'a', label: 'A', idx }, { id: 'b', label: 'B', idx: lento }]).length === 0);
  check('zonas · con una sola no hay diferencias que mostrar', E.diferenciasEntreZonas([{ id: 'a', label: 'A', idx }]).length === 0);

  const v = GC.ventana(idx, {});
  const an = E.anomalias(idx, GC.filasDeVentana(idx, v));
  check('anomalías · todo punto alto pasa el piso de su métrica y el de minutos', an.altos.every((x) => x.valor >= E.PISO_NOCHE[x.metrica] && x.z >= E.Z_ATIPICO));
  const ruido = E.anomalias(idx, [{ NOMBRES: idx.liga.jugadores[0].NOMBRES, EQUIPO: 'X', MIN: 30, T3C: 1, PTS: 3, AST: 0, RO: 0, RD: 0 }]);
  check('anomalías · un triple suelto NO es un pico, por alto que dé su desvío', ruido.altos.length === 0);
  check('anomalías · una noche sin minutos no entra', E.anomalias(idx, [{ NOMBRES: idx.liga.jugadores[0].NOMBRES, MIN: 4, PTS: 40 }]).altos.length === 0);
  check('fugas · solo equipos con una métrica en el percentil 25 o menos, de peor a mejor', an.fugas.every((f, i, a) => f.percentil <= E.FUGA_PERCENTIL && (!i || a[i - 1].percentil <= f.percentil)));
  check('fugas · la métrica es de la lista declarada y trae la referencia de la liga', an.fugas.every((f) => E.METRICAS_FUGA.indexOf(f.metrica) !== -1 && !!f.liga));
  check('rachas · de tres o más', an.rachas.every((x) => x.n >= 3));

  const p = E.aPropuesta(r, '¿Quién tira mejor con pocos minutos?', 't1');
  check('la propuesta lleva el ángulo como título', p.ok && p.titulo === '¿Quién tira mejor con pocos minutos?' && p.id === 'LAB-T1');
  const nombres = GC.nombresDelLibro(idx);
  const lanza = (f) => { try { f(); return null; } catch (e) { return e.message; } };
  check('su texto no nombra a nadie', lanza(() => GC.verificarAnonimo({ titulo: p.titulo, dato: p.dato, guion: p.guion }, nombres)) === null);
  check('cruda, sus filas SÍ nombran: por eso pasa por el anonimizador', /todavía nombra/.test(lanza(() => GC.verificarAnonimo(p, nombres)) || ''));
  const anon = GC.anonimizar(p);
  check('anonimizada, no queda un nombre', lanza(() => GC.verificarAnonimo(anon, nombres)) === null && /^Jugador 1$/.test(anon.datos.filas[0].jugador));
  check('y los números no se tocan', JSON.stringify(anon.datos.filas.map((f) => f.texto)) === JSON.stringify(r.filas.map((f) => f.texto)));
  check('el dato cita cuántos cumplen y el universo', p.dato.indexOf(String(r.cumplen)) !== -1 && p.dato.indexOf(String(r.universo)) !== -1);
  check('una propuesta de partidos no arrastra la fecha ni el resultado', E.aPropuesta(pa, '', 'x').datos.filas.every((f) => !('fecha' in f) && !('resultado' in f)));
  check('sin filas no hay propuesta', E.aPropuesta({ filas: [] }, 'x').ok === false);
  check('el enfoque sale de la métrica de orden', E.enfoqueDe('RTNG DEF') === 'defensa' && E.enfoqueDe('T1%') === 'faltas' && E.enfoqueDe('eFG%') === 'ataque');
  check('su placa trae la tabla', /<table>/.test(M.placasHtml(anon, anon.titulo)) && /Jugador 1/.test(M.placasHtml(anon, anon.titulo)));

  const fuente = fs.readFileSync('centro-mando/explorador.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check('el Explorador es puro: ni red, ni disco, ni reloj', !/require\('fs'\)|fetch\(|Date\.now\(\)(?!\.toString)/.test(fuente.replace(/sello \|\| Date\.now\(\)/, '')));
  const srv = fs.readFileSync('centro-mando/servidor.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const lab = srv.slice(srv.indexOf('async function delLaboratorio('), srv.indexOf('function aprobar('));
  check('lo que sale del laboratorio se anonimiza y se verifica ANTES de guardarse', lab.indexOf('GC.anonimizar(') !== -1 && lab.indexOf('GC.verificarAnonimo(') !== -1 && lab.indexOf('GC.verificarAnonimo(') < lab.indexOf('guardarBandeja('));
}

/* -------------------------------------------------------------------- */
titulo('La bandeja · enfoque, tono y aprobación');
{
  const pq = GC.paquete(idx, { torneo: 'TORNEO', zona: 'ZONA X' });
  const n2 = GC.nivel2(idx, [], { nivel: 'LIGA_ARGENTINA' });
  const todas = M.propuestas({ nivel1: pq, nivel2: n2 }, { formato: M.AUTO, stories: true });
  const b = M.armarBandeja(todas, 'q');
  const conEnfoque = b.items.filter((i) => i.propuesta.enfoque);
  check('toda pieza con datos tiene enfoque, salvo el resumen de la fecha', todas.filter((p) => p.ok && !p.enfoque).every((p) => p.id === 'STORIES'));
  check('entran las Stories y hasta ' + M.MAX_BANDEJA + ' piezas', b.items[0].propuesta.id === 'STORIES' && conEnfoque.length <= M.MAX_BANDEJA && conEnfoque.length > 0);
  check('las piezas se reparten: ningún enfoque con datos queda afuera', Object.keys(M.ENFOQUES).every((e) => !todas.some((p) => p.ok && p.enfoque === e) || conEnfoque.some((i) => i.propuesta.enfoque === e)));
  check('nada con datos se pierde: va a la bandeja o a la reserva', b.items.length + b.reserva.length === todas.filter((p) => p.ok).length);
  check('lo que no tiene datos se lista aparte, con su motivo', b.sinDatos.length === todas.filter((p) => !p.ok).length && b.sinDatos.every((s) => s.avisos.length));
  check('todas arrancan pendientes y en tono táctico', b.items.every((i) => i.estado === 'pendiente' && i.propuesta.tono === 'tactico'));

  const it = conEnfoque[0];
  const t1 = M.cambiarTono(b, it.uid), p1 = t1.items.find((i) => i.uid === it.uid).propuesta;
  check('cambiar el tono pasa al siguiente y pone su gancho primero', p1.tono === 'polemico' && p1.ganchos[0].estilo === M.TONOS.polemico.estilo);
  check('el tono NO toca el texto: mismos ganchos, mismo dato', p1.dato === it.propuesta.dato && p1.ganchos.map((g) => g.texto).sort().join() === it.propuesta.ganchos.map((g) => g.texto).sort().join());
  check('la píldora de la portada es la del tono', M.placasHtml(p1, 'g').indexOf(M.TONOS.polemico.pildora) !== -1);
  check('tres cambios de tono vuelven al principio', M.cambiarTono(M.cambiarTono(t1, it.uid), it.uid).items.find((i) => i.uid === it.uid).propuesta.tono === 'tactico');
  check('no muta la bandeja que recibe', b.items.find((i) => i.uid === it.uid).propuesta.tono === 'tactico');

  if (b.reserva.length) {
    const e1 = M.cambiarEnfoque(t1, it.uid), nueva = e1.items.find((i) => i.uid === it.uid).propuesta;
    check('cambiar el enfoque trae OTRA pieza, de la reserva', nueva.id !== it.propuesta.id && b.reserva.some((p) => p.id === nueva.id));
    check('la que salió vuelve a la reserva', e1.reserva.some((p) => p.id === it.propuesta.id) && e1.reserva.length === b.reserva.length);
    check('y conserva el tono elegido', nueva.tono === 'polemico');
  }
  const sinReserva = Object.assign({}, b, { reserva: [] });
  check('sin reserva, cambiar el enfoque lo dice en vez de inventar', (() => { try { M.cambiarEnfoque(sinReserva, it.uid); return false; } catch (e) { return /reserva/.test(e.message); } })());
  check('las Stories no cambian de enfoque', (() => { try { M.cambiarEnfoque(b, b.items[0].uid); return false; } catch (e) { return /no tiene enfoque/.test(e.message); } })());
  check('una propuesta que ya no está se rechaza', (() => { try { M.cambiarTono(b, 'no-esta'); return false; } catch (e) { return true; } })());
  check('marcar cambia solo ese ítem', M.marcar(b, it.uid, 'aprobada').items.filter((i) => i.estado === 'aprobada').length === 1);

  const reg = M.registroDeAprobacion(p1, p1.ganchos[0], 'apb-b', new Date(2026, 9, 12, 10));
  check('aprobar anota el enfoque y el tono', reg.enfoque === it.propuesta.enfoque && reg.tono === 'polemico');
  const medidas = [1, 2, 3].map((n) => Object.assign({}, reg, { id: 'a' + n, alcance: 1000, guardados: 60 })).concat([1, 2, 3].map((n) => Object.assign({}, reg, { id: 'b' + n, tono: 'educativo', alcance: 1000, guardados: 10 })));
  check('y el aprendizaje los agrupa', M.ponderaciones(medidas).tono.polemico.peso > 1 && M.ponderaciones(medidas).tono.educativo.peso < 1 && !!M.ponderaciones(medidas).enfoque[reg.enfoque]);
  const lab = M.sumarABandeja(b, { id: 'LAB-X', ok: true, enfoque: 'ataque', ganchos: [], guion: [] }, 's');
  check('lo del laboratorio entra arriba de todo, sin sacar nada', lab.items[0].propuesta.id === 'LAB-X' && lab.items.length === b.items.length + 1);

  const srv = fs.readFileSync('centro-mando/servidor.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const acc = srv.slice(srv.indexOf('async function accionDeBandeja('), srv.indexOf('async function delLaboratorio('));
  check('aprobar desde la bandeja usa el MISMO «aprobar» (archivos, cola e historial)', /extra = aprobar\(\{ propuesta: item\.propuesta/.test(acc) && /M\.marcar\(actual, x\.uid, 'aprobada'\)/.test(acc));
  check('la bandeja se rearma sola a los 14 días, no antes', /QUINCENA_MS = 14 \* 24 \* 60 \* 60 \* 1000/.test(srv) && /if \(previa && !x\.rearmar && !vencida\) return previa;/.test(srv));
  const html = fs.readFileSync('centro-mando/index.html', 'utf8');
  check('la página tiene los tres botones de la bandeja', ['data-accion="enfoque"', 'data-accion="tono"', 'data-accion="aprobar"'].every((x) => html.indexOf(x) !== -1));
  check('y dice lo que el tono y el ángulo NO hacen', /No reescribe el texto/.test(html) && /no se interpreta/.test(html) && /no hay un proceso corriendo de fondo/.test(html));
}

console.log(NL + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
