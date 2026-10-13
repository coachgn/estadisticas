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
/* El servidor escribe la bandeja, la cola y el historial: en los tests van
   a una carpeta temporal, nunca a contenido/. Y sin clave: la IA se ejerce
   con un cliente simulado. */
const DATOS_TMP = fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'cm-'));
process.env.CENTRO_MANDO_DATOS = DATOS_TMP;
/* Ningún test puede levantar un «claude -p» de verdad ni gastar del plan. */
process.env.CENTRO_MANDO_MOTOR = 'no';
delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_AUTH_TOKEN;
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
  check('gancho, cierre y la placa de contexto', (h.match(/data-document-role="page"/g) || []).length === 3);
  check('todo lo que entra se escapa', h.indexOf('<script>') === -1 && h.indexOf('Título <b>') === -1 && h.indexOf('&quot;gancho&quot;') !== -1);
  check('las imágenes van por URL pública, no en data URI', !/data:image/.test(h) && /https:\/\/coachgn\.github\.io/.test(h));
  check('el carrusel es 3:4 y el reel 9:16', /height:1350px/.test(h) && /height:1920px/.test(M.placasHtml(Object.assign({}, p, { formato: 'reel' }))));
  check('sin contexto no hay placa de contexto', (M.placasHtml(p, 'g').match(/data-document-role="page"/g) || []).length === 2);
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
  check('el servidor no llama a nadie por su cuenta: la única salida es el módulo de agentes', !/fetch\(|https?:\/\/(?!127\.0\.0\.1)/.test(codigo) && /require\('\.\/llm\.js'\)/.test(codigo));

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
  check('el visor recibe una página por placa', (v1.html.match(/data-document-role="page"/g) || []).length === M.placasDe(p).length && M.placasDe(p).length === p.guion.length && v1.plantilla === 'generica');
  check('cambiar el gancho cambia la portada', v1.html !== v2.html && /<h1 class="\w+">/.test(v1.html));
  check('las Stories anónimas no usan la plantilla con nombres', S.placas(Object.assign({}, st, { datos: Object.assign({}, st.datos, { anonimo: true }) }), null, '').plantilla === 'generica');
  check('una propuesta sin datos no tiene placas', (() => { try { S.placas({ id: 'RL-01', ok: false }); return false; } catch (e) { return /sin|No hay/.test(e.message); } })());

  const src = fs.readFileSync('centro-mando/servidor.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const aprobar = src.slice(src.indexOf('function aprobar('), src.indexOf('function registrar('));
  check('aprobar escribe con el MISMO html que muestra el visor', /const pl = placas\(p, x\.gancho, x\.contexto\)/.test(aprobar) && /escribir\('\.html', pl\.html\)/.test(aprobar));
  check('aprobar anota el historial y la cola', /registroDeAprobacion\(/.test(aprobar) && /escribirLista\(APRENDIZAJE/.test(aprobar) && /escribirLista\(COLA/.test(aprobar));
  check('el servidor no tiene credencial ni llamada a Canva', !/canva\.com|CANVA_|api\.instagram|graph\.facebook/i.test(src));

  const html = fs.readFileSync('centro-mando/index.html', 'utf8');
  check('la página tiene el visor adentro de cada propuesta, aislado', /class="visor"/.test(html) && /<iframe[^>]* sandbox>/.test(html) && /srcdoc = /.test(html));
  check('elegir liga o zona carga la pestaña abierta sin tocar un botón', /addEventListener\('change', cambioDeZona\)/.test(html) && (() => { const i = html.indexOf('function cambioDeZona()'); return i !== -1 && html.slice(i, html.indexOf('\n}', i)).indexOf('cargarTab(true)') !== -1; })());
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
  check('el porcentaje no viaja solo: T3I entra a las columnas aunque no se haya marcado', r.columnas.map((c) => c.id).join() === 'T3%,T3I,MIN');
  check('toda efectividad de la tabla lleva su volumen en la columna de al lado, no solo la que ordena', (() => {
    const x = E.explorar(idx, 'jugadores', { metricas: ['PTS', 'eFG%', 'T3%', 'PePP%'], orden: 'PTS' }).columnas;
    return x.map((c) => c.id).join() === 'PTS,eFG%,TCI,T3%,T3I,PePP%,PLAYS' && x.find((c) => c.id === 'TCI').volumenDe.join() === 'eFG%' && x.find((c) => c.id === 'PTS').volumenDe.length === 0;
  })());
  check('si el volumen ya estaba pedido, no se repite', E.explorar(idx, 'jugadores', { metricas: ['T3I', 'T3%'], orden: 'T3%' }).columnas.map((c) => c.id).join() === 'T3I,T3%');
  check('entre zonas el volumen no se cuela como una «diferencia»', E.zonas([{ id: 'a', label: 'A', idx }, { id: 'b', label: 'B', idx }], { metricas: ['PACE', 'eFG%', 'PePP%'], orden: 'PACE' }).diferencias.every((d) => ['TCI', 'PLAYS'].indexOf(d.metrica) === -1));
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
  check('su placa trae la tabla', /<table/.test(M.placasHtml(anon, anon.titulo)) && /Jugador 1/.test(M.placasHtml(anon, anon.titulo)));

  titulo('El catálogo completo del libro');
  const cat = E.catalogo(idx);
  check('contiene la lista corta y la supera', ['jugadores', 'equipos', 'partidos'].every((n) => E.METRICAS[n].every((k) => cat[n].indexOf(k) !== -1) && cat[n].length > E.METRICAS[n].length), cat.jugadores.length + '/' + cat.equipos.length + '/' + cat.partidos.length);
  check('toda métrica que ofrece tiene dato en ese nivel', cat.jugadores.every((k) => idx.liga.jugadores.some((j) => typeof j[k] === 'number')) &&
    cat.equipos.every((k) => E.EXTRAS[k] || idx.lista().some((e) => typeof idx.leer(e.clave, k).valor === 'number')));
  /* LAS MÉTRICAS DE RESULTADO */
  const wn = E.explorar(idx, 'equipos', { metricas: ['WIN%', 'NET RTNG'], orden: 'WIN%', top: 50 });
  check('el % de victorias está en el catálogo de equipos, y solo ahí', cat.equipos.indexOf('WIN%') !== -1 && cat.zonas.indexOf('WIN%') !== -1 && cat.jugadores.indexOf('WIN%') === -1 && cat.partidos.indexOf('WIN%') === -1 && E.METRICAS.equipos.indexOf('NET RTNG') !== -1);
  check('sale del récord del índice: ganados sobre partidos con box score', wn.filas.length === idx.lista().length && wn.filas.every((x) => { const e = idx.lista().find((y) => y.nombre === x.equipo); return x.valores['WIN%'] === e.record.ganados / e.record.pj; }));
  check('se escribe como porcentaje, con coma', wn.filas.every((x) => /^\d+,\d%$/.test(x.texto['WIN%'])) && E.definicion('WIN%').formato === 'pct' && E.rotulo('WIN%') === '% Victorias');
  check('un 55 es 55 %: la condición se compara como se escribe', E.explorar(idx, 'equipos', { metricas: ['WIN%'], condiciones: [{ metrica: 'WIN%', op: '>=', valor: 55 }], top: 50 }).filas.every((x) => x.valores['WIN%'] >= 0.55));
  check('el núcleo no se tocó: WIN% no está en su registro', !SGADD.metrica('WIN%'));
  check('VAL y +/- no se ofrecen: el panel no ordena por ninguna', ['jugadores', 'equipos', 'partidos'].every((n) => cat[n].indexOf('VAL') === -1 && cat[n].indexOf('+/-') === -1));
  check('una métrica fuera de la lista corta se explora si el libro la trae', E.METRICAS.equipos.indexOf('eFG Opp%') === -1 && E.explorar(idx, 'equipos', { metricas: ['eFG Opp%'], orden: 'eFG Opp%' }).columnas[0].id === 'eFG Opp%');
  check('y la que no es de ese nivel se sigue descartando', E.explorar(idx, 'equipos', { metricas: ['USG%', 'PACE'] }).columnas.map((c) => c.id).join() === 'PACE');

  titulo('El cruce de dos métricas');
  const cz = E.explorar(idx, 'jugadores', { cruce: ['USG%', 'TS%'], soloCalificados: true, top: 50 });
  const cal = idx.liga.jugadores.filter((j) => j.__califica && typeof j['USG%'] === 'number' && typeof j['TS%'] === 'number');
  const mu = SGADD.mediana(cal.map((j) => j['USG%'])), mt = SGADD.mediana(cal.map((j) => j['TS%']));
  const enGrupo = cal.filter((j) => j['USG%'] >= mu && j['TS%'] < mt).length, Q = cz.cruce.cuadrantes;
  check('los cuatro grupos suman a todos los que cumplen', Q.altoAlto + Q.altoBajo + Q.bajoAlto + Q.bajoBajo === cal.length && cz.cruce.n === cal.length && cz.cumplen === cal.length);
  check('el grupo se cuenta igual que contándolo a mano contra las medianas', Q.altoBajo === enGrupo && cz.cruce.enGrupo === enGrupo, Q.altoBajo + ' vs ' + enGrupo);
  check('la tabla es SOLO ese grupo, ordenada por la primera métrica', cz.filas.length === Math.min(50, enGrupo) && cz.filas.every((x, i, a) => x.valores['USG%'] >= mu && x.valores['TS%'] < mt && (!i || a[i - 1].valores['USG%'] >= x.valores['USG%'])));
  check('otro grupo, otra tabla', E.explorar(idx, 'jugadores', { cruce: ['USG%', 'TS%'], soloCalificados: true, grupo: 'bajoAlto', top: 50 }).filas.every((x) => x.valores['USG%'] < mu && x.valores['TS%'] >= mt));
  const pearson = (() => { const a = cal.map((j) => j['USG%']), b = cal.map((j) => j['TS%']), n = a.length, pa = a.reduce((t, v) => t + v, 0) / n, pb = b.reduce((t, v) => t + v, 0) / n;
    let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { ab += (a[i] - pa) * (b[i] - pb); aa += (a[i] - pa) * (a[i] - pa); bb += (b[i] - pb) * (b[i] - pb); } return Math.round(ab / Math.sqrt(aa * bb) * 100) / 100; })();
  check('la correlación es la de Pearson, a dos decimales', cz.cruce.r === pearson && cz.cruce.rTexto === pearson.toFixed(2).replace('.', ','), cz.cruce.r + ' vs ' + pearson);
  const quinto = idx.liga.jugadores.map((j) => j.PTS).filter((v) => typeof v === 'number').sort((a, b) => b - a)[4];
  const pocos = E.explorar(idx, 'jugadores', { cruce: ['USG%', 'TS%'], condiciones: [{ metrica: 'PTS', op: '>=', valor: quinto }] });
  check('con menos de ' + E.MIN_CRUCE + ' casos no se informa la correlación', pocos.cruce.n < E.MIN_CRUCE && pocos.cruce.r === null && /no alcanza/.test(E.aPropuesta(pocos, '', 'p').dato));
  check('no cruza una métrica consigo misma, ni de otro nivel, ni entre zonas', E.pedido('equipos', { cruce: ['PACE', 'PACE'] }).cruce === null && E.pedido('equipos', { cruce: ['PACE', 'USG%'] }).cruce === null && E.pedido('zonas', { cruce: ['PACE', 'eFG%'] }).cruce === null);
  check('sin cruce, la tabla es la de siempre', E.explorar(idx, 'jugadores', q).cruce === null && JSON.stringify(E.explorar(idx, 'jugadores', q).filas) === JSON.stringify(r.filas));
  const pc = E.aPropuesta(cz, '', 'c1');
  check('la propuesta cuenta el grupo, las medianas, el n y la relación', pc.ok && pc.dato.indexOf(' ' + enGrupo + ' quedan altos en USG% y bajos en TS%') !== -1 && pc.dato.indexOf('r = ' + cz.cruce.rTexto + ' sobre ' + cal.length + ' casos') !== -1 && pc.datos.cruce.n === cal.length && /no dice cuál causa al otro/.test(pc.guion.join(' ')));
  /* Cuánto tiene de la segunda cada mitad de la primera. */
  const medB = (alto) => SGADD.mediana(cal.filter((j) => (j['USG%'] >= mu) === alto).map((j) => j['TS%']));
  check('cada mitad de la primera, con su mediana de la segunda, contada a mano', cz.cruce.altosA + cz.cruce.bajosA === cal.length && cz.cruce.altosA === Q.altoAlto + Q.altoBajo &&
    cz.cruce.medianaBEnAltosA === SGADD.formatear('TS%', medB(true)) && cz.cruce.medianaBEnBajosA === SGADD.formatear('TS%', medB(false)) && pc.dato.indexOf(cz.cruce.medianaBEnAltosA + ' en TS%') !== -1);
  const tod = E.explorar(idx, 'equipos', { cruce: ['RO%', 'WIN%'], grupo: 'todos', top: 50 });
  check('«todos» no es un cuadrante: la tabla entera, ordenada por la primera', tod.filas.length === idx.lista().length && tod.cruce.enGrupo === idx.lista().length && tod.filas.every((x, i, a) => !i || a[i - 1].valores['RO%'] >= x.valores['RO%']) && /también quedan? sobre la mediana de % Victorias/.test(E.aPropuesta(tod, '', 't').dato));
  /* LA CONCORDANCIA: el número manda sobre el verbo y el adjetivo. */
  const uno = { n: 12, altosA: 6, bajosA: 6, labelA: 'RO%', labelB: '% Victorias', medianaA: '23,3%', medianaB: '50,0%', medianaBEnAltosA: '54,5%', medianaBEnBajosA: '45,5%', cuadrantes: { altoAlto: 5, altoBajo: 1, bajoAlto: 1, bajoBajo: 5 }, grupo: 'altoBajo', enGrupo: 1, grupoTextoN: 'alto en RO% y bajo en % Victorias', r: 0.4, rTexto: '0,40', fuerza: 'moderada', sentido: 'directa' };
  const dUno = E.datoDeCruce(uno, 'equipos', '');
  check('con uno solo: «1 queda alto», nunca «1 quedan altos»', /\b1 queda alto en RO% y bajo en % Victorias/.test(dUno) && !/1 quedan/.test(dUno) && !/\b1 [a-záéíóú]+ altos\b/.test(dUno));
  check('y con uno solo en el universo: «De 1 equipo»', /^De 1 equipo,/.test(E.datoDeCruce(Object.assign({}, uno, { n: 1, altosA: 1, bajosA: 0, medianaBEnBajosA: null, r: null }), 'equipos', '')) && /el que está sobre la mediana de RO% \(23,3%\) tiene 54,5%/.test(E.datoDeCruce(Object.assign({}, uno, { n: 1, altosA: 1, bajosA: 0, r: null }), 'equipos', '')) && /Con 1 caso no alcanza/.test(E.datoDeCruce(Object.assign({}, uno, { n: 1, altosA: 1, bajosA: 0, r: null }), 'equipos', '')));
  check('el grupo real de cada cruce también concuerda', ['altoBajo', 'altoAlto', 'bajoAlto', 'bajoBajo'].every((g) => { const x = E.explorar(idx, 'equipos', { cruce: ['RO%', 'WIN%'], grupo: g, top: 50 }); const d = E.aPropuesta(x, '', 'g'); return !d.ok || (x.cruce.enGrupo === 1 ? /\b1 queda (alto|bajo) en/.test(d.dato) : new RegExp(' ' + x.cruce.enGrupo + ' quedan (altos|bajos) en').test(d.dato)); }));
  /* NINGÚN TEXTO SE CORTA A MITAD DE PALABRA */
  const larga = '¿Por qué o cómo influye el RO% en las victorias y qué tan decisivo es? Tener en cuenta aquellos equipos que dominan el cristal en toda la liga y cómo influye en el % de victorias.';
  check('un título que no entra se queda con su primera oración, entera', E.tituloDe(larga, 90) === '¿Por qué o cómo influye el RO% en las victorias y qué tan decisivo es?');
  check('si tampoco entra la primera oración, no hay título cortado: lo arma el generador', E.tituloDe('una frase larguísima sin un solo punto que sigue y sigue y sigue y sigue y sigue y sigue y sigue y sigue y sigue y no termina', 90) === '' && /qué dice el cruce$/.test(E.aPropuesta(tod, 'una frase larguísima sin un solo punto que sigue y sigue y sigue y sigue y sigue y sigue y sigue y sigue y sigue y sigue y sigue y sigue y sigue y sigue y no termina nunca', 't').titulo));
  check('un texto que entra no se toca', E.tituloDe('  USG%   contra TS% ', 90) === 'USG% contra TS%');
  check('recortar corta en el fin de una oración o de una palabra', M.recortar('Una frase entera. Otra frase que ya no entra del todo acá', 22) === 'Una frase entera.' && M.recortar('palabra1 palabra2 palabra3 palabra4', 20) === 'palabra1 palabra2…' && M.recortar('corto', 20) === 'corto' && !/\S…\S/.test(M.recortar(larga, 100)) && M.recortar(larga, 100).length <= 100);
  check('y anonimizada no nombra a nadie', lanza(() => GC.verificarAnonimo(GC.anonimizar(pc), nombres)) === null);

  titulo('«A medida» · el intérprete local del texto libre');
  const LB = require('./centro-mando/libre.js');
  const li = (t, o) => LB.interpretarLibre(t, cat, o || {});
  const a1 = li('ritmo contra rebote ofensivo');
  check('dos conceptos de cancha → un cruce', a1.ok && a1.nivel === 'equipos' && a1.consulta.cruce.join() === 'PACE,RO%' && a1.entendido.every((e) => e.por === 'concepto'));
  const a2 = li('USG% vs TS% con al menos 20 minutos');
  check('las siglas de la planilla se leen tal cual, y la condición con su número', a2.nivel === 'jugadores' && a2.consulta.cruce.join() === 'USG%,TS%' &&
    JSON.stringify(a2.consulta.condiciones) === JSON.stringify([{ metrica: 'MIN', op: '>=', valor: 20 }]) && a2.consulta.soloCalificados === false && a2.entendido[0].por === 'sigla');
  check('una sigla fuera de la lista corta entra igual', li('eFG Opp% de los equipos').consulta.orden === 'eFG Opp%' && li('drtg').consulta.orden === 'RTNG DEF');
  check('una hipótesis entera, con sus palabras', li('¿Los equipos que más tiran de tres son los que peor defienden?').consulta.cruce.join() === 'T3I,RTNG DEF');
  check('la hipótesis elige el grupo del cruce: «más» y «peor», con la dirección de cada métrica', li('jugadores con más uso y peor true shooting').consulta.grupo === 'altoBajo' && li('los jugadores con más uso y más pérdidas').consulta.grupo === 'altoAlto' &&
    li('¿Los equipos que más tiran de tres son los que peor defienden?').consulta.grupo === 'altoAlto' && li('equipos con poco ritmo y mejor defensa').consulta.grupo === 'bajoBajo' && !li('ritmo contra rebote ofensivo').consulta.grupo);
  check('«corren» es ritmo', li('¿Los equipos que más cargan el rebote ofensivo son los que más corren?').consulta.cruce.join() === 'RO%,PACE');
  const a3 = li('puntos de segunda oportunidad contra eficiencia');
  check('lo que no está se APROXIMA con lo más cercano, y se dice', a3.consulta.cruce.join() === 'RO%,RTNG OFF' && a3.aproximaciones.length === 1 && /no están en el libro/.test(a3.aproximaciones[0]) && a3.entendido[0].por === 'aproximacion');
  check('el mismo concepto es otra métrica según el nivel', li('eficiencia de los jugadores').consulta.orden === 'PPP' && li('eficiencia de los equipos').consulta.orden === 'RTNG OFF');
  const a4 = li('altura de los pivotes');
  check('lo que no existe no se inventa: sin métrica, no hay pedido', a4.ok === false && /altura/i.test(a4.motivo) && !a4.consulta);
  check('pero no frena lo que sí se puede', (() => { const x = li('triples y altura'); return x.ok && x.noExiste.length === 1 && x.consulta.orden === 'T3%'; })());
  check('por parecido de palabra, y lo declara', (() => { const x = li('los reboteadores que más pierden la pelota'); const e = x.entendido.find((y) => y.frase === 'reboteadores'); return x.nivel === 'jugadores' && !!e && e.por === 'parecido' && /rebote/.test(e.como); })());
  check('«peores» respeta la dirección de la métrica, y lee el tope', (() => { const x = li('los 5 peores equipos en pérdidas'); return x.consulta.top === 5 && x.consulta.sentido === 'desc' && x.consulta.orden === 'PePP%' && !x.consulta.cruce; })());
  check('los decimales se escriben con coma', li('tiro libre con más de 3,5 libres intentados en jugadores').consulta.condiciones[0].valor === 3.5);
  check('el nivel se puede forzar', li('ritmo', { nivel: 'partidos' }).nivel === 'partidos');
  check('entre zonas, sin dos libros, compara equipos y avisa', (() => { const x = li('ritmo entre zonas'); return x.nivel === 'equipos' && x.avisos.some((a) => /una sola zona/.test(a)) && li('ritmo entre zonas', { zonas: true }).nivel === 'zonas'; })());
  check('en jugadores el piso lo pone el Explorador: el intérprete lo pide y respeta los minutos que se filtraron a mano', (() => { const x = li('triples con menos de 15 minutos'); return x.consulta.condiciones.length === 1 && x.consulta.condiciones[0].metrica === 'MIN' && x.consulta.pisoAuto.minutos === false &&
    li('triples de los jugadores').consulta.pisoAuto.minutos === true && !li('triples de los equipos').consulta.pisoAuto; })());
  check('en un partido no hay piso de liga: se avisa cómo pedirlo', li('triples en un partido').avisos.some((a) => /sin piso de intentos/.test(a)));
  check('«suplentes» no afirma titularidad: usa minutos y lo dice', (() => { const x = li('recuperos de los suplentes'); return x.nivel === 'jugadores' && x.consulta.soloCalificados === false && x.consulta.orden === 'PR' && x.aproximaciones.some((a) => /no dice quién arranca/.test(a)); })());
  check('una condición sin métrica cerca no se aplica, y se dice', (() => { const x = li('más de 3 en general, y bastante más lejos en la frase aparece el ritmo de los equipos'); return x.ok && x.consulta.condiciones.length === 0 && x.avisos.some((a) => /no dice de qué métrica/.test(a)); })());
  check('sin ninguna métrica, dice cómo escribirlo', li('hola qué tal').ok === false && /No reconocí/.test(li('hola qué tal').motivo));
  check('todo lo que resuelve existe en el catálogo de ese nivel', ['ritmo contra rebote ofensivo', 'uso y true shooting', 'presión defensiva de los suplentes', 'peso del triple, PACE y eFG permitido en equipos', 'contraataque en un partido', 'tapas y faltas'].every((t) => {
    const x = li(t); return x.ok && x.consulta.metricas.concat(x.consulta.condiciones.map((c) => c.metrica)).every((k) => cat[x.nivel].indexOf(k) !== -1); }));
  check('todo candidato del vocabulario es una métrica del registro del núcleo o de resultado', LB.CONCEPTOS.every((c) => c.m.every((k) => !!SGADD.metrica(k) || !!E.EXTRAS[k])));
  /* LA PRUEBA DE FUEGO que trajo el club (2026-10-13). */
  const fuego = li(larga);
  check('la pregunta del cristal y las victorias: RO% contra % de victorias, en equipos', fuego.ok && fuego.nivel === 'equipos' && fuego.consulta.cruce.join() === 'RO%,WIN%' && fuego.consulta.metricas.join() === 'RO%,WIN%');
  check('una pregunta de influencia pide la tabla entera, no una esquina', fuego.consulta.grupo === 'todos' && /influencia/.test(fuego.lectura) && li('rebote ofensivo y victorias').consulta.grupo === undefined);
  check('victorias, net rating y pérdidas, como se escriben', li('PACE contra win%').consulta.cruce.join() === 'PACE,WIN%' && li('eFG% vs %V').consulta.cruce.join() === 'eFG%,WIN%' && li('TOV% contra netrtg').consulta.cruce.join() === 'PePP%,NET RTNG' && li('los equipos que más ganan').consulta.orden === 'WIN%');
  check('a nivel jugadores no hay victorias, y se dice', li('jugadores: uso contra victorias').fuera.some((x) => /victorias/.test(x)));
  check('lo que pide lo corre el Explorador sin perder nada', ['USG% vs TS% con al menos 20 minutos', 'los 5 peores equipos en pérdidas', 'triples con menos de 15 minutos'].every((t) => {
    const x = li(t), res = E.explorar(idx, x.nivel, x.consulta); return res.orden === x.consulta.orden && res.condiciones.filter((y) => !y.auto).length === x.consulta.condiciones.length && !!res.cruce === !!x.consulta.cruce && res.filas.length > 0; }));
  const fuenteLibre = fs.readFileSync('centro-mando/libre.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check('es local y puro: ni red, ni disco, ni modelo, ni reloj', !/require\('fs'\)|fetch\(|llm\.js|child_process|Date\.now|Math\.random/.test(fuenteLibre));

  const fuente = fs.readFileSync('centro-mando/explorador.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check('el Explorador es puro: ni red, ni disco, ni reloj', !/require\('fs'\)|fetch\(|Date\.now\(\)(?!\.toString)/.test(fuente.replace(/sello \|\| Date\.now\(\)/, '')));
  const srv = fs.readFileSync('centro-mando/servidor.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  /* El CUERPO de cada función, no una ventana de caracteres (punto 43). */
  const cuerpo = (n) => { const i = srv.indexOf(n); return i === -1 ? '' : srv.slice(i, srv.indexOf('\n}', i)); };
  const pan = cuerpo('async function propuestaAnonima(');
  check('lo que sale del laboratorio se anonimiza y se verifica ANTES de guardarse', pan.indexOf('GC.anonimizar(') !== -1 && pan.indexOf('GC.verificarAnonimo(') > pan.indexOf('GC.anonimizar(') && pan.indexOf('guardarBandeja(') === -1 &&
    ['async function delLaboratorio(', 'async function libre('].every((n) => { const c = cuerpo(n); return c.indexOf('propuestaAnonima(') !== -1 && c.indexOf('propuestaAnonima(') < c.indexOf('aLaBandeja(') && c.indexOf('guardarBandeja(') === -1; }));
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
  check('y dice lo que el tono y el ángulo NO hacen', /los números son siempre los del libro/.test(html) && /los números los lee el Explorador del libro, no el modelo/.test(html) && /no hay un proceso corriendo de fondo/.test(html));
}

/* -------------------------------------------------------------------- */
titulo('Los agentes con Claude · la guarda numérica');
(async () => {
  const L = require('./centro-mando/llm.js');
  const S = require('./centro-mando/servidor.js');
  const E = require('./centro-mando/explorador.js');
  const lanza = (f) => { try { f(); return null; } catch (e) { return e.message; } };
  const lanzaA = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };

  check('un número que está en la fuente pasa, con coma o con punto', L.numerosAjenos('7 de 12 equipos (58%) rinden 7,20', '7 de 12 (58%) 7.2').length === 0);
  check('uno que no está se detecta', L.numerosAjenos('6 de cada 10 equipos', '7 de 12 (58%)').join() === '6,10');
  check('redondear es inventar: 58,3 no es 58', L.numerosAjenos('58%', 'el 58,3%').join() === '58' && L.numerosAjenos('casi 60', '58').join() === '60');
  check('lee los números de un objeto, no solo de un texto', L.numerosAjenos('102,4 y 88', { a: 102.4, b: [{ c: 88 }] }).length === 0);
  check('un texto sin números siempre pasa', L.numerosAjenos('La tabla está mal ordenada', '').length === 0);

  const pieza = { id: 'CR-01', titulo: 'La tabla de ataque está mal ordenada', dato: '7 de 12 equipos (58%) cambian de puesto.', guion: ['Portada: el dato', 'Jugada no es posesión', '¿Con qué vara medís? + demo'], numeros: { cambian: 7, equipos: 12 } };
  const buena = { titulo: 'Tu tabla de ataque miente', ganchos: [{ estilo: 'dato', texto: '7 de 12 equipos cambian de puesto' }, { estilo: 'titular', texto: 'El ranking que mirás está mal' }, { estilo: 'pregunta', texto: '¿Con qué vara medís tu ataque?' }],
    guion: ['Portada: 7 de 12', 'Una jugada no es una posesión', '¿Cómo lo medís vos? Probá la demo'], placas: [], copy: '' };
  const f1 = L.filtrar(buena, pieza);
  check('una redacción fiel pasa entera', f1.titulo === buena.titulo && f1.ganchos.length === 3 && f1.guion.length === 3 && f1.descartado.length === 0);
  check('los ganchos quedan marcados como de la IA', f1.ganchos.every((g) => g.ia === true));
  const mala = { titulo: 'El 60% de la liga mide mal', ganchos: [{ estilo: 'dato', texto: '6 de cada 10 equipos cambian' }, { estilo: 'titular', texto: 'El ranking que mirás está mal' }, { estilo: 'titular', texto: 'Otro titular' }, { estilo: 'grito', texto: 'x' }],
    guion: ['Portada', 'En 2019 pasaba igual', 'Cierre'], placas: [], copy: '' };
  const f2 = L.filtrar(mala, pieza);
  check('el título con un número ajeno se descarta', f2.titulo === null);
  check('el gancho con un número ajeno se descarta, y los demás quedan', f2.ganchos.map((g) => g.estilo).join() === 'titular');
  check('un estilo repetido o inventado no entra', f2.ganchos.length === 1);
  check('UNA línea del guion con un número ajeno tira el guion entero', f2.guion === null);
  check('y dice qué descartó y por qué', f2.descartado.some((d) => d.campo === 'título' && /60/.test(d.motivo)) && f2.descartado.some((d) => /línea 2/.test(d.campo) && /2019/.test(d.motivo)));
  check('un guion con otra cantidad de líneas se descarta', L.filtrar(Object.assign({}, buena, { guion: ['una sola'] }), pieza).guion === null);

  /* El cliente simulado: devuelve lo que se le diga y guarda lo que recibió. */
  const fake = (salida, extra) => { const c = { pedidos: [], beta: { messages: { parse: async (params) => { c.pedidos.push(params); return Object.assign({ parsed_output: salida, stop_reason: 'end_turn', model: 'simulado', usage: { input_tokens: 1, output_tokens: 1 } }, extra); } } } }; return c; };

  titulo('Los agentes con Claude · redactar');
  const p = M.conTono(M.deReceta(Object.assign({ ok: true, formato: 'Carrusel 3:4', datos: pieza.numeros }, pieza)), 'polemico');
  const c1 = fake(buena);
  const r1 = await L.redactar(p, 'polemico', { cliente: c1 });
  const ped = c1.pedidos[0];
  check('pide con el modelo por defecto y salida estructurada', ped.model === 'claude-opus-5-5' && ped.output_config.format.type === 'json_schema' && ped.output_config.effort === 'low');
  check('con el respaldo ante una declinación', ped.fallbacks === 'default' && ped.betas.indexOf('server-side-fallback-2026-07-01') !== -1);
  check('no manda parámetros que este modelo rechaza', !('temperature' in ped) && !('thinking' in ped) && !('tool_choice' in ped));
  check('el sistema lleva la regla de los números', /no sos la fuente de ningún número/.test(ped.system));
  check('el tono va en el mensaje', /POLÉMICO/.test(ped.messages[0].content) && ped.messages[0].role === 'user');
  check('devuelve la redacción ya filtrada', r1.ganchos.length === 3 && r1.tono === 'polemico' && r1.descartado.length === 0);
  const r2 = await L.redactar(p, 'tactico', { cliente: fake(mala) });
  check('lo que inventa el modelo NO llega: la guarda corre después de la respuesta', r2.titulo === null && r2.guion === null && r2.ganchos.length === 1);
  check('un tono inventado se rechaza sin llamar', /tono/.test(await lanzaA(() => L.redactar(p, 'gritado', { cliente: fake(buena) }))));
  check('una pieza sin datos no se redacta', /sin|No hay/.test(await lanzaA(() => L.redactar({ ok: false }, 'tactico', { cliente: fake(buena) }))));
  check('una declinación del modelo se dice', /declinó/.test(await lanzaA(() => L.redactar(p, 'tactico', { cliente: fake(null, { stop_reason: 'refusal', stop_details: { explanation: 'x' } }) }))));
  check('una respuesta sin la forma pedida se dice', /forma pedida/.test(await lanzaA(() => L.redactar(p, 'tactico', { cliente: fake(null) }))));

  const ap = M.aplicarRedaccion(p, r1);
  check('aplicada: título y guion de la IA, el DATO intacto', ap.titulo === buena.titulo && ap.guion[1] === buena.guion[1] && ap.dato === p.dato && ap.redaccion === 'ia');
  check('el gancho del estilo del tono va primero', ap.ganchos[0].estilo === M.TONOS.polemico.estilo && ap.ganchos[0].ia === true);
  check('la redacción REEMPLAZA: los ganchos de plantilla se van de la tarjeta', ap.ganchos.length === 3 && ap.ganchos.every((g) => g.ia));
  check('salvo que la guarda haya tirado todos los de la IA: ahí quedan los del generador', (() => { const x = M.aplicarRedaccion(M.conTono(p, 'tactico'), { titulo: 't', ganchos: [], guion: null, placas: null, copy: null, descartado: [] }); return x.ganchos.length === p.ganchos.length && x.ganchos.every((g) => !g.ia); })());
  const ap2 = M.aplicarRedaccion(p, r2);
  check('lo que la guarda descartó vuelve a ser lo del generador', ap2.titulo === p.titulo && ap2.guion === p.guion && ap2.redaccionDescartada === r2.descartado.length);
  check('los datos de la pieza no los toca nadie', JSON.stringify(ap.datos) === JSON.stringify(p.datos) && JSON.stringify(ap.muestra) === JSON.stringify(p.muestra));
  check('el historial anota si fue IA o plantilla', M.registroDeAprobacion(ap, ap.ganchos[0], 'x').redaccion === 'ia' && M.registroDeAprobacion(p, p.ganchos[0], 'x').redaccion === 'plantilla');

  let b = M.armarBandeja([p, Object.assign({}, p, { id: 'CR-02', enfoque: 'defensa' })], 'q');
  const uid = b.items[0].uid;
  b = M.guardarRedaccion(b, uid, 'tactico', r1);
  check('guardar una redacción conserva la pieza del generador como base', b.items[0].base.titulo === p.titulo && b.items[0].propuesta.redaccion === 'ia');
  const pol = M.cambiarTono(b, uid).items[0];
  check('cambiar a un tono sin redactar vuelve a la plantilla, no arrastra la anterior', pol.propuesta.tono === 'polemico' && pol.propuesta.redaccion !== 'ia' && pol.propuesta.titulo === p.titulo);
  const vuelta = M.cambiarTono(M.cambiarTono(M.cambiarTono(b, uid), uid), uid).items[0];
  check('y volver a un tono ya redactado lo repone sin pedirlo de nuevo', vuelta.propuesta.tono === 'tactico' && vuelta.propuesta.redaccion === 'ia' && vuelta.propuesta.titulo === buena.titulo);
  check('una redacción de otro tono no pisa la pieza vigente', M.guardarRedaccion(b, uid, 'educativo', r1).items[0].propuesta.tono === 'tactico');

  titulo('Los agentes con Claude · la pregunta táctica');
  S.indices.set('lnb/unica', { idx, t: Date.now() });
  const consulta = { sePuede: true, motivo: '', nivel: 'jugadores', metricas: ['T3%', 'MIN'], orden: 'T3%', sentido: 'mejor', top: 5, soloCalificados: false,
    condiciones: [{ metrica: 'MIN', op: '<', valor: 15 }, { metrica: 'T3I', op: '>=', valor: 1 }], lectura: 'Los mejores de tres con menos de 15 minutos.' };
  const cq = fake(consulta);
  const rp = await S.preguntar({ liga: 'lnb', zona: 'unica', pregunta: '¿Quiénes tiran mejor de tres con menos de 15 minutos?' }, { cliente: cq });
  const directo = E.explorar(idx, 'jugadores', { metricas: ['T3%', 'MIN'], orden: 'T3%', top: 5, condiciones: consulta.condiciones });
  check('la respuesta es la del Explorador local, fila por fila', rp.sePuede && JSON.stringify(rp.resultado.filas) === JSON.stringify(directo.filas) && rp.resultado.cumplen === directo.cumplen);
  check('devuelve la consulta para volcarla en los controles', rp.consulta.nivel === 'jugadores' && rp.consulta.orden === 'T3%' && rp.consulta.condiciones.length === 2 && !!rp.lectura);
  check('al modelo NO le viaja un solo dato del libro', (() => { const t = JSON.stringify(cq.pedidos[0]); return GC.nombresDelLibro(idx).jugadores.slice(0, 40).every((n) => t.indexOf(n) === -1) && !/PEREZ\d+|CLUB\d+/.test(t); })());
  check('le viaja el catálogo de métricas y lo que NO existe', /T3% = /.test(cq.pedidos[0].system) && /tras pérdida/.test(cq.pedidos[0].system) && cq.pedidos[0].output_config.effort === 'low');
  const noSe = await S.preguntar({ liga: 'lnb', zona: 'unica', pregunta: '¿Quién anota más tras pérdida del rival?' }, { cliente: fake(Object.assign({}, consulta, { sePuede: false, motivo: 'No hay puntos tras pérdida.' })) });
  check('lo que no está en los libros se dice, sin tabla', noSe.sePuede === false && /tras pérdida/.test(noSe.motivo) && !noSe.resultado);
  const malaCond = Object.assign({}, consulta, { condiciones: [{ metrica: 'ALTURA', op: '>', valor: 190 }] });
  check('una condición con una métrica inventada NO se descarta en silencio: se rechaza la traducción',
    /No pude traducir/.test(await lanzaA(() => S.preguntar({ liga: 'lnb', zona: 'unica', pregunta: 'los más altos que tiran bien' }, { cliente: fake(malaCond) }))));
  check('una métrica de orden inventada también', /No pude traducir/.test(await lanzaA(() => S.preguntar({ liga: 'lnb', zona: 'unica', pregunta: 'los de mejor PER de la liga' }, { cliente: fake(Object.assign({}, consulta, { orden: 'PER' })) }))));
  check('comparar zonas en una liga de una sola se rechaza', /una sola/.test(await lanzaA(() => S.preguntar({ liga: 'lnb', zona: 'unica', pregunta: 'compará el ritmo de las zonas' }, { cliente: fake(Object.assign({}, consulta, { nivel: 'zonas', metricas: ['PACE'], orden: 'PACE', condiciones: [] })) }))));
  check('una pregunta de dos letras no se manda', /completa/.test(await lanzaA(() => L.interpretar('t3', E.opciones(), { cliente: fake(consulta) }))));
  check('sin clave y sin cliente, la IA se declara apagada', L.disponible() === false && /apagada/.test(await lanzaA(() => S.preguntar({ liga: 'lnb', zona: 'unica', pregunta: 'una pregunta cualquiera' }))));

  titulo('Los agentes con Claude · redactar un ítem de la bandeja');
  const fsx = require('fs'), pth = require('path');
  const anon = GC.anonimizar(GC.nivel2(idx, [], { nivel: 'LIGA_NACIONAL', piezas: ['CR-01'] })).piezas.map(M.deReceta);
  const arm = Object.assign(M.armarBandeja(anon, 't'), { clave: 'lnb-unica', generada: new Date().toISOString(), meta: {} });
  fsx.mkdirSync(pth.join(DATOS_TMP, 'centro-mando'), { recursive: true });
  const escribir = (x) => fsx.writeFileSync(pth.join(DATOS_TMP, 'centro-mando', 'bandeja.json'), JSON.stringify({ bandejas: { 'lnb-unica': x } }));
  escribir(arm);
  const u = arm.items[0].uid, base = arm.items[0].propuesta;
  const fiel = { titulo: 'La tabla miente', ganchos: [{ estilo: 'titular', texto: 'Tu ranking de ataque está mal' }], guion: base.guion.map((g) => 'Reescrita: ' + g.replace(/\d/g, '')), placas: [], copy: '' };
  const ri = await S.redactarItem({ liga: 'lnb', zona: 'unica', uid: u }, { cliente: fake(fiel) });
  check('redacta el ítem y lo guarda en la bandeja', ri.item.propuesta.redaccion === 'ia' && ri.item.propuesta.titulo === 'La tabla miente' && JSON.parse(fsx.readFileSync(pth.join(DATOS_TMP, 'centro-mando', 'bandeja.json'), 'utf8')).bandejas['lnb-unica'].items[0].redacciones.tactico.titulo === 'La tabla miente');
  const otra = fake(fiel);
  await S.redactarItem({ liga: 'lnb', zona: 'unica', uid: u }, { cliente: otra });
  check('un tono ya redactado NO se vuelve a pedir (no se paga dos veces)', otra.pedidos.length === 0);
  escribir(arm);
  /* Un club cuyo número YA está en la pieza: si no, lo frena antes la
     guarda numérica y este test no probaría la del anonimato. */
  const enPieza = L.numerosDe({ t: base.titulo, d: base.dato, g: base.guion, x: base.datos, m: base.muestra, id: base.id });
  const nombre = GC.nombresDelLibro(idx).equipos.find((n) => enPieza.has((n.match(/\d+/) || [''])[0]));
  check('la fixture tiene un club con el que probar la fuga', !!nombre, [...enPieza].join());
  const fuga = Object.assign({}, fiel, { titulo: 'Lo que hace ' + nombre });
  check('si la IA nombra a un club del libro en una pieza anónima, se descarta entera',
    /nombró a alguien/.test(await lanzaA(() => S.redactarItem({ liga: 'lnb', zona: 'unica', uid: u }, { cliente: fake(fuga) }))) &&
    !JSON.parse(fsx.readFileSync(pth.join(DATOS_TMP, 'centro-mando', 'bandeja.json'), 'utf8')).bandejas['lnb-unica'].items[0].redacciones);
  check('nada de esto tocó contenido/', !fsx.existsSync(pth.join(DATOS_TMP, '..', 'no')) && fsx.existsSync(pth.join(DATOS_TMP, 'centro-mando', 'bandeja.json')));

  const src = fs.readFileSync('centro-mando/llm.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check('usa el SDK oficial, no HTTP a mano', /require\('@anthropic-ai\/sdk'\)/.test(src) && !/fetch\(|api\.anthropic\.com/.test(src));
  check('la clave sale del entorno: no hay ninguna escrita', !/sk-ant-/.test(src) && !/apiKey:/.test(src));
  check('la clave y las dependencias no van al repo', /^centro-mando\/\.env\s*$/m.test(fs.readFileSync('.gitignore', 'utf8')) && /^centro-mando\/node_modules\/\s*$/m.test(fs.readFileSync('.gitignore', 'utf8')));
  check('el ejemplo de .env no trae una clave', /^ANTHROPIC_API_KEY=\s*$/m.test(fs.readFileSync('centro-mando/.env.ejemplo', 'utf8')));

  titulo('Claude Code como motor · sin clave');
  const cli = (respuesta, extra) => { const c = { llamadas: [], ejecutar: async (args, entrada) => { c.llamadas.push({ args, entrada }); return Object.assign({ codigo: 0, error: '', salida: typeof respuesta === 'string' ? respuesta : JSON.stringify(respuesta) }, extra); } }; return c; };
  const okCli = (so) => ({ is_error: false, subtype: 'success', result: JSON.stringify(so), structured_output: so, modelUsage: { 'claude-sonnet-5': {} }, usage: { input_tokens: 5, output_tokens: 7 }, duration_ms: 18142 });
  const c2 = cli(okCli(buena));
  const rc = await L.redactar(p, 'polemico', { ejecutar: c2.ejecutar });
  const a = c2.llamadas[0].args, arg = (k) => a[a.indexOf(k) + 1];
  check('redacta por Claude Code y dice con qué motor y modelo', rc.motor === 'claude-code' && rc.modelo === 'claude-sonnet-5' && rc.ganchos.length === 3);
  check('lo llama en modo no interactivo, con salida JSON y sin guardar la sesión', a[0] === '-p' && arg('--output-format') === 'json' && a.indexOf('--no-session-persistence') !== -1);
  check('SIN herramientas, sin configuración del usuario y sin conectores', arg('--tools') === '' && a.indexOf('--safe-mode') !== -1 && a.indexOf('--strict-mcp-config') !== -1);
  check('nunca saltea permisos', !a.some((x) => /dangerously|bypassPermissions/.test(x)));
  check('el esquema viaja como JSON Schema', JSON.parse(arg('--json-schema')).required.join() === 'titulo,ganchos,placas,guion,copy,capas');
  check('la regla de los números va en el sistema y la pieza por la entrada estándar', /no sos la fuente de ningún número/.test(arg('--system-prompt')) && /POLÉMICO/.test(c2.llamadas[0].entrada) && !a.some((x) => /POLÉMICO/.test(x)));
  const rm = await L.redactar(p, 'tactico', { ejecutar: cli(okCli(mala)).ejecutar });
  check('LA MISMA GUARDA numérica corre sobre lo que devuelve Claude Code', rm.titulo === null && rm.guion === null && rm.ganchos.length === 1 && rm.descartado.length > 0);
  check('el límite del plan o un error se dice, y manda a las plantillas', /plantillas/.test(await lanzaA(() => L.redactar(p, 'tactico', { ejecutar: cli({ is_error: true, subtype: 'error_during_execution', result: 'usage limit reached' }).ejecutar }))));
  check('una salida que no es JSON se dice', /legible/.test(await lanzaA(() => L.redactar(p, 'tactico', { ejecutar: cli('no anda', { error: 'claude: command not found' }).ejecutar }))));
  check('una respuesta a la que le falta un campo se rechaza', /forma pedida/.test(await lanzaA(() => L.redactar(p, 'tactico', { ejecutar: cli(okCli({ titulo: 'x' })).ejecutar }))));
  const rq = await S.preguntar({ liga: 'lnb', zona: 'unica', pregunta: '¿Quiénes tiran mejor de tres con menos de 15 minutos?' }, { ejecutar: cli(okCli(consulta)).ejecutar });
  check('la pregunta táctica por Claude Code da la tabla del Explorador local', rq.sePuede && JSON.stringify(rq.resultado.filas) === JSON.stringify(directo.filas));
  const { z } = require('./centro-mando/node_modules/zod');
  const campos = (j) => Object.keys(j.properties).sort().join();
  check('los esquemas del CLI nombran los mismos campos que los del SDK', campos(L.ESQUEMAS_JSON.consulta) === campos(z.toJSONSchema(L.EsquemaConsulta)) && campos(L.ESQUEMAS_JSON.redaccion) === campos(z.toJSONSchema(L.EsquemaRedaccion)) &&
    L.ESQUEMAS_JSON.consulta.required.length === Object.keys(L.ESQUEMAS_JSON.consulta.properties).length);

  const env = (k, v, f) => { const prev = process.env[k]; if (v == null) delete process.env[k]; else process.env[k] = v; try { return f(); } finally { if (prev == null) delete process.env[k]; else process.env[k] = prev; } };
  check('apagada a propósito, no hay motor', L.motor() === null && L.disponible() === false && /a propósito/.test(L.motivoApagada()));
  check('forzar la API sin clave no la enciende', env('CENTRO_MANDO_MOTOR', 'api', () => L.motor()) === null);
  check('con clave, manda la API; sin clave, nunca', env('CENTRO_MANDO_MOTOR', null, () => env('ANTHROPIC_API_KEY', 'x', () => L.motor())) === 'api');
  check('forzar el CLI lo usa aunque haya clave, si está instalado', env('CENTRO_MANDO_MOTOR', 'cli', () => env('ANTHROPIC_API_KEY', 'x', () => L.motor())) === (L.cliDisponible() ? 'claude-code' : null));
  const fuenteL = fs.readFileSync('centro-mando/llm.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check('las llamadas a Claude Code van de a una', /return enFila\(\(\) => pedirPorCli\(ejecutarClaude/.test(fuenteL));
  check('corre en una carpeta vacía, no en el repo', /cwd = path\.join\(os\.tmpdir\(\)/.test(fuenteL) && !/cwd: __dirname|cwd: process\.cwd/.test(fuenteL));

  titulo('La redacción que llega hecha (/agencia)');
  escribir(arm);
  const hecha = await S.redactarItem({ liga: 'lnb', zona: 'unica', uid: u, tono: 'tactico', redaccion: Object.assign({}, fiel, { ganchos: [{ estilo: 'titular', texto: 'Tu ranking de ataque está mal' }, { estilo: 'dato', texto: 'El 99,9% de la liga mide mal' }] }) });
  check('se guarda sin llamar a ningún modelo', hecha.item.propuesta.redaccion === 'ia' && hecha.item.propuesta.titulo === 'La tabla miente');
  check('y pasa por LA MISMA guarda numérica: el gancho con un número ajeno no entra', hecha.descartado.some((d) => /99/.test(d.motivo)) && !hecha.item.propuesta.ganchos.some((g) => /99/.test(g.texto)));
  check('una redacción para otro tono se rechaza', /tono/.test(await lanzaA(() => S.redactarItem({ liga: 'lnb', zona: 'unica', uid: u, tono: 'polemico', redaccion: fiel }))));
  escribir(arm);
  check('si nombra a un club del libro en una pieza anónima, se descarta entera', /nombró a alguien/.test(await lanzaA(() => S.redactarItem({ liga: 'lnb', zona: 'unica', uid: u, redaccion: fuga }))));
  const cmd = fs.readFileSync('.claude/commands/agencia.md', 'utf8');
  check('/agencia exige confirmación antes de publicar e importar', /sin un «sí» del usuario/.test(cmd) && /Pedí confirmación/.test(cmd) && /preguntá cuáles aprobar/.test(cmd));
  check('/agencia no edita la bandeja a mano y borra siempre las placas temporales', /No edites .bandeja\.json. ni .aprendizaje\.json. a mano/.test(cmd) && /Hacelo siempre/.test(cmd));
  check('/agencia usa las rutas que el servidor tiene', ['/api/bandeja', '/api/bandeja/accion', '/api/bandeja/redactar', '/api/aprendizaje', '/api/opciones'].every((r) => cmd.indexOf(r) !== -1 && fs.readFileSync('centro-mando/servidor.js', 'utf8').indexOf("'" + r + "'") !== -1));
  const hp = M.placasHtml(Object.assign({}, p, { guion: ['portada', 'corta', 'x'.repeat(400), 'fin'] }), 'g');
  check('un texto largo baja de cuerpo en la placa', /class="baj gr">corta/.test(hp) && /class="baj ch">x{400}/.test(hp));

  titulo('La narrativa de referente · placas, copy y prompt alternativo');
  const P = (rol, texto, titulo, destacado) => ({ rol, texto, titulo: titulo || '', destacado: destacado || '' });
  const serie = [P('gancho', 'Lo que la tabla no te muestra', '¿Tu ranking de ataque *miente*?'), P('evidencia', '7 de 12 equipos cambian de puesto', 'El dato'), P('evidencia', 'Una jugada no es una posesión', 'Por qué pasa'),
    P('propuesta', 'Medí por posesión antes de armar el plan', 'Qué te pide en cancha', 'El rebote ofensivo cambia la cuenta'), P('cierre', '¿Con qué vara medís tu ataque?', 'La tabla depende de la vara')];
  check('la estructura buena pasa', M.estructuraDePlacas(serie) === null);
  check('la cantidad de placas es libre entre el mínimo y el máximo', M.estructuraDePlacas(serie.slice(0, 1).concat(serie.slice(2))) === null && M.MIN_PLACAS === 4 && M.MAX_PLACAS === 10 &&
    /entre/.test(M.estructuraDePlacas(serie.slice(0, 3))) && /entre/.test(M.estructuraDePlacas(serie.slice(0, 1).concat(Array(10).fill(serie[1]), serie.slice(3)))));
  check('sin gancho al principio o sin cierre al final, no', /primera/.test(M.estructuraDePlacas(serie.slice(1).concat(serie[4]))) && /última/.test(M.estructuraDePlacas(serie.slice(0, 4).concat(serie[3]))));
  check('sin evidencia o sin propuesta, no', /evidencia/.test(M.estructuraDePlacas([serie[0], serie[3], serie[3], serie[4]])) && /propuesta/.test(M.estructuraDePlacas([serie[0], serie[1], serie[2], serie[4]])));
  check('el orden es gancho, evidencia, propuesta, cierre', /orden/.test(M.estructuraDePlacas([serie[0], serie[3], serie[1], serie[4]])));
  check('un rol inventado, no', /rol/.test(M.estructuraDePlacas([serie[0], serie[1], P('opinion', 'x'), serie[3], serie[4]])));

  const conPlacas = Object.assign({}, buena, { placas: serie, guion: [], copy: 'Tu ranking de ataque puede estar mal: 7 de 12 equipos cambian de puesto.\n\n¿Con qué vara medís?\n\n#MotorStatsAR #Pace' });
  const fp = L.filtrar(conPlacas, pieza);
  check('una redacción con placas fieles pasa entera, con su copy', fp.placas.length === 5 && /7 de 12/.test(fp.copy) && fp.descartado.length === 0);
  check('en un carrusel, el guion vacío no es un error', fp.guion === null && !fp.descartado.some((d) => d.campo === 'guion'));
  const unaMala = serie.slice(); unaMala[2] = P('evidencia', 'En 2019 la liga corría a 80 posesiones', 'Antes');
  const fm = L.filtrar(Object.assign({}, conPlacas, { placas: unaMala }), pieza);
  check('la placa del medio con un número ajeno se saca, y las demás quedan', fm.placas.length === 4 && !fm.placas.some((x) => /2019/.test(x.texto)) && fm.descartado.some((d) => /placa 3/.test(d.campo) && /2019/.test(d.motivo)));
  const sinEvidencia = [serie[0], P('evidencia', 'El 99% mide mal'), serie[3], serie[3], serie[4]];
  check('si al sacarla se rompe la estructura, se descartan todas', L.filtrar(Object.assign({}, conPlacas, { placas: sinEvidencia }), pieza).placas === null);
  const ganchoMalo = serie.slice(); ganchoMalo[0] = P('gancho', 'El 99% de los rankings está mal', 'Mirá');
  check('si el que falla es el gancho, se descartan todas', (() => { const r = L.filtrar(Object.assign({}, conPlacas, { placas: ganchoMalo }), pieza); return r.placas === null && r.descartado.some((d) => /gancho no pasó/.test(d.motivo)); })());
  const tituloMalo = serie.slice(); tituloMalo[1] = P('evidencia', 'Texto limpio', 'Los 45 mejores');
  check('el TÍTULO y el DESTACADO de una placa pasan por la misma guarda', L.filtrar(Object.assign({}, conPlacas, { placas: tituloMalo }), pieza).placas.length === 4);
  const marcas = L.filtrar(Object.assign({}, conPlacas, { placas: [P('gancho', 'Lo que *la tabla* no muestra', 'Tu ranking *miente*')].concat(serie.slice(1)), copy: '*7 de 12* equipos cambian', ganchos: [{ estilo: 'dato', texto: '*7 de 12* cambian' }] }), pieza);
  check('el resaltado *así* se conserva solo en el título de una placa', marcas.placas[0].titulo === 'Tu ranking *miente*' && marcas.placas[0].texto === 'Lo que la tabla no muestra' && marcas.copy === '7 de 12 equipos cambian\n\n' + M.HASHTAGS && marcas.ganchos[0].texto === '7 de 12 cambian');
  check('un copy con un número ajeno se descarta entero', (() => { const r = L.filtrar(Object.assign({}, conPlacas, { copy: 'El 83% de los equipos…' }), pieza); return r.copy === null && r.descartado.some((d) => d.campo === 'copy'); })());

  const pIa = M.aplicarRedaccion(p, fp);
  check('aplicadas: la pieza lleva las placas y el copy de la IA, y el DATO intacto', pIa.placas.length === 5 && pIa.copy === fp.copy && pIa.dato === p.dato && pIa.guion.length === 5);
  check('las placas que se dibujan son las de la IA', M.placasDe(pIa).length === 5 && M.placasDe(pIa)[3].destacado === 'El rebote ofensivo cambia la cuenta');
  check('el gancho elegido en pantalla va a la portada', M.placasDe(pIa, 'Otro gancho')[0].titulo === 'Otro gancho' && M.placasDe(pIa)[0].titulo === serie[0].titulo);
  const der = M.placasDe(p);
  check('sin IA, las placas salen del guion repartido en los cuatro momentos, sin una palabra nueva', M.estructuraDePlacas(Object.assign([], der)) === null || der.length < 4 ? der[0].rol === 'gancho' && der[der.length - 1].rol === 'cierre' && der.slice(1, -1).every((x) => p.guion.indexOf(x.texto) !== -1) : false);

  const hIa = M.placasHtml(pIa, null, '');
  check('una página por placa', (hIa.match(/data-document-role="page"/g) || []).length === 5);
  check('la línea gráfica de la cuenta: píldora, barra celeste, isotipo de fondo, pie y flecha', /class="pildora"/.test(hIa) && /class="barra"/.test(hIa) && /class="agua"/.test(hIa) && /Link en Bio \| @motorstats\.ar/.test(hIa) && /class="sig"/.test(hIa));
  check('Barlow Condensed en títulos y Barlow en el cuerpo; azul noche, celeste y naranja', /Barlow\+Condensed/.test(hIa) && /font-family:Barlow,/.test(hIa) && /#0a1930/.test(hIa) && /#74acdf/.test(hIa) && /#f5a623/.test(hIa));
  check('*así* en un título sale resaltado, ya escapado', /<span class="nar">miente<\/span>/.test(hIa) && M.placasHtml(Object.assign({}, pIa, { placas: [P('gancho', 't', '<u>*x*</u>')].concat(serie.slice(1)) })).indexOf('<u>') === -1);
  check('el cierre lleva el llamado a comentar, y la última placa no lleva flecha', hIa.indexOf(M.CTA_COMENTARIO.replace(/«/g, '«')) !== -1 && (hIa.match(/class="sig"/g) || []).length === 4);
  check('el destacado de la propuesta va en su tarjeta', /class="tarj v">El rebote ofensivo cambia la cuenta/.test(hIa));

  const cp = M.copyPlantilla(p, p.ganchos[0].texto);
  check('sin IA hay copy igual: frases de la pieza, llamado a comentar y hashtags', cp.indexOf(p.dato) !== -1 && cp.indexOf(M.CTA_COMENTARIO) !== -1 && /#MotorStatsAR/.test(cp));
  check('y no trae un número que no esté en la pieza', L.numerosAjenos(cp, L.piezaDe(p)).length === 0);
  const pr = M.promptDeCopy(pIa);
  check('el prompt alternativo lleva la pieza, las placas y la regla de los números', pr.indexOf(pIa.dato) !== -1 && /REGLA QUE NO SE NEGOCIA/.test(pr) && /\[Evidencia\]/.test(pr) && /\[Propuesta\]/.test(pr) && /referente/.test(pr));
  check('lo arma el código: no trae un número ajeno a la pieza (salvo las consignas de formato)', L.numerosAjenos(pr.split('TÍTULO:')[1], { p: L.piezaDe(pIa), x: pIa.placas }).length === 0);
  check('el prompt de una pieza anónima no nombra a nadie del libro', lanza(() => GC.verificarAnonimo({ t: M.promptDeCopy(M.deReceta(GC.anonimizar(GC.nivel2(idx, [], { nivel: 'LIGA_NACIONAL', piezas: ['CR-02'] })).piezas[0])) }, GC.nombresDelLibro(idx))) === null);
  const md = M.resumenMd(pIa, null, '');
  check('el resumen exportado trae placas, copy y prompt', /## Placas/.test(md) && /## Copy sugerido para Instagram/.test(md) && /## Prompt alternativo para el copy/.test(md) && md.indexOf(fp.copy) !== -1);
  check('el sistema del redactor pide la voz de referente y los cuatro momentos', /REFERENTE/.test(L.SISTEMA_REDACCION) && ['GANCHO', 'EVIDENCIA', 'PROPUESTA', 'CIERRE'].every((x) => L.SISTEMA_REDACCION.indexOf(x) !== -1) && /NO es fija/.test(L.SISTEMA_REDACCION));
  check('y deja la lectura táctica como lectura, sin hechos inventados', /no como un hecho medido/.test(L.SISTEMA_REDACCION) && /no inventes hechos sobre equipos, jugadores, planteles, canchas/.test(L.SISTEMA_REDACCION));

  titulo('«A medida» · la idea libre, de punta a punta');
  const enBandeja = () => { try { return JSON.parse(fs.readFileSync(require('path').join(DATOS_TMP, 'centro-mando', 'bandeja.json'), 'utf8')).bandejas['lnb-unica'].items; } catch (e) { return []; } };
  const antesL = enBandeja().length;
  const lb = await S.libre({ liga: 'lnb', zona: 'unica', texto: 'USG% contra TS% con al menos 20 minutos' });
  check('devuelve qué entendió, la tabla y una propuesta', lb.ok && lb.lectura.ok && lb.lectura.entendido.length === 3 && !!lb.resultado.cruce && !!lb.propuesta && /^LAB-/.test(lb.propuesta.id));
  check('la tabla es la del Explorador local, fila por fila', JSON.stringify(lb.resultado.filas) === JSON.stringify(E.explorar(idx, 'jugadores', lb.consulta).filas));
  check('la tabla va con nombres y la propuesta sale anónima y verificada', lb.resultado.filas.some((x) => /PEREZ/.test(x.jugador)) && lanza(() => GC.verificarAnonimo(lb.propuesta, GC.nombresDelLibro(idx))) === null && /Jugador 1/.test(JSON.stringify(lb.propuesta.datos)));
  check('el título es lo que se escribió, y trae ganchos', lb.propuesta.titulo === 'USG% contra TS% con al menos 20 minutos' && lb.propuesta.ganchos.length >= 2);
  const larga2 = '¿Por qué o cómo influye el RO% en las victorias y qué tan decisivo es? Tener en cuenta aquellos equipos que dominan el cristal en toda la liga y cómo influye en el % de victorias.';
  const lf = await S.libre({ liga: 'lnb', zona: 'unica', texto: larga2 });
  check('la prueba de fuego, de punta a punta: cruce con victorias, título entero y ganchos sin cortar', lf.ok && lf.resultado.cruce.b === 'WIN%' && lf.resultado.filas.length === idx.lista().length && lf.propuesta.titulo === '¿Por qué o cómo influye el RO% en las victorias y qué tan decisivo es?' &&
    [lf.propuesta.titulo, lf.propuesta.dato].concat(lf.propuesta.ganchos.map((g) => g.texto)).every((t) => /[.?!]$/.test(t)) && !/\b1 quedan\b/.test(lf.propuesta.dato));
  check('y sus placas de plantilla tampoco traen un texto cortado', M.placasDe(lf.propuesta, lf.propuesta.ganchos[0].texto).every((x) => !/[a-záéíóúñ]$/.test(x.titulo || '.') || x.titulo === lf.propuesta.ganchos[0].texto));
  check('todo número de la propuesta sale del cruce o del texto', L.numerosAjenos(lb.propuesta.dato, { c: lb.resultado.cruce, t: lb.propuesta.titulo, x: lb.resultado.condicionesTexto }).length === 0);
  check('buscar no toca la bandeja', !lb.enBandeja && enBandeja().length === antesL);
  const lb2 = await S.libre({ liga: 'lnb', zona: 'unica', texto: 'USG% contra TS% con al menos 20 minutos', aBandeja: true });
  check('mandarla la deja arriba de la bandeja, pendiente', !!lb2.enBandeja && enBandeja().length === antesL + 1 && enBandeja()[0].propuesta.id === lb2.enBandeja && enBandeja()[0].estado === 'pendiente');
  const club = idx.lista()[0].nombre;
  const lb3 = await S.libre({ liga: 'lnb', zona: 'unica', texto: 'ritmo de ' + club + ' contra rebote ofensivo' });
  check('un texto que nombra a un club no llega al título: sale el del generador, y se avisa', !!lb3.propuesta && lb3.propuesta.titulo.toUpperCase().indexOf(club.toUpperCase()) === -1 && lb3.avisos.some((a) => /anónimas/.test(a)), club);
  const lb4 = await S.libre({ liga: 'lnb', zona: 'unica', texto: 'altura de los pivotes' });
  check('lo que no existe vuelve sin tabla ni propuesta, con el motivo', lb4.ok === false && !lb4.resultado && !lb4.propuesta && /altura/i.test(lb4.lectura.motivo));
  check('el grupo del cruce y el tope se pueden elegir', (await S.libre({ liga: 'lnb', zona: 'unica', texto: 'USG% contra TS%', grupo: 'altoAlto', top: 3 })).resultado.cruce.grupo === 'altoAlto' &&
    (await S.libre({ liga: 'lnb', zona: 'unica', texto: 'USG% contra TS%', grupo: 'altoAlto', top: 3 })).resultado.filas.length === 3);
  check('el nivel forzado manda sobre el texto', (await S.libre({ liga: 'lnb', zona: 'unica', texto: 'ritmo y pérdidas', nivel: 'partidos' })).resultado.nivel === 'partidos');
  check('la página tiene la idea libre y dice qué entendió antes que la tabla', /id="l-texto"/.test(fs.readFileSync('centro-mando/index.html', 'utf8')) && /api\('\/api\/libre'/.test(fs.readFileSync('centro-mando/index.html', 'utf8')) && /Aproximación · /.test(fs.readFileSync('centro-mando/index.html', 'utf8')));

  titulo('El buscador · una variable que el libro no trae');
  {
    const LB2 = require('./centro-mando/libre.js');
    const cat2 = E.catalogo(idx);
    const li2 = (t, o) => LB2.interpretarLibre(t, cat2, Object.assign({ libro: 'LIGA DE PRUEBA' }, o || {}));
    const u23 = li2('jugadores U23 con más puntos');
    check('un filtro por edad no se ignora en silencio: se desactiva y se dice, con el nombre del libro', u23.ok && u23.omitidos.length === 1 && u23.omitidos[0].variable === 'EDAD' &&
      u23.omitidos[0].texto.indexOf('⚠️ El libro actual de LIGA DE PRUEBA no contiene la variable EDAD. Se desactiva este filtro para evitar datos engañosos.') === 0);
    const menos23 = li2('puntos de jugadores de menos de 23 años');
    check('el número de una variable que falta NO se le pasa a la métrica de al lado', menos23.consulta.condiciones.length === 0 && menos23.consulta.orden === 'PTS' && /«menos de 23» era sobre EDAD: no se aplicó/.test(menos23.omitidos[0].texto));
    const varios = li2('extranjeros con más de 1,95 de altura que más anotan');
    check('altura y nacionalidad, cada una con su aviso; y son de personas', varios.omitidos.map((x) => x.variable).sort().join() === 'ALTURA,NACIONALIDAD' && varios.consulta.condiciones.length === 0 && varios.nivel === 'jugadores');
    check('posición, cuartos, clutch y zona de tiro también se avisan', ['los bases que más asisten', 'puntos en el último cuarto', 'triples desde la esquina', 'uso en el clutch'].every((t) => li2(t).omitidos.length === 1));
    check('una variable que falta se avisa una sola vez', li2('juveniles u21 y u23 con más puntos').omitidos.length === 1 && li2('juveniles u21 y u23 con más puntos').omitidos[0].frases.length === 3);
    check('lo que el panel no usa (+/-) no es una variable que falte', (() => { const x = li2('uso y +/- de los jugadores'); return x.omitidos.length === 0 && x.noExiste.length === 1; })());
    check('una consulta sin variables faltantes no avisa nada', li2('uso contra true shooting').omitidos.length === 0);
    const ru = await S.libre({ liga: 'lnb', zona: 'unica', texto: 'jugadores U23 con más puntos' });
    check('con un filtro desactivado NO se arma la pieza: se muestra la tabla y se pide aceptar', ru.ok && ru.propuesta === null && ru.pideAceptar === true && ru.resultado.filas.length > 0 && ru.resultado.calidad.certificado === false && ru.resultado.calidad.filtros.omitidos.length === 1 && /LIGA NACIONAL/.test(ru.resultado.calidad.filtros.omitidos[0]));
    check('y no se puede mandar a la bandeja sin aceptar', (await S.libre({ liga: 'lnb', zona: 'unica', texto: 'jugadores U23 con más puntos', aBandeja: true })).enBandeja === undefined);
    const ra = await S.libre({ liga: 'lnb', zona: 'unica', texto: 'jugadores U23 con más puntos', aceptarOmitidos: true });
    check('aceptando, la pieza sale SIN prometer el filtro: otro título, y el aviso adentro', !!ra.propuesta && !/u23/i.test(ra.propuesta.titulo) && ra.propuesta.avisos.some((a) => /no contiene la variable EDAD/.test(a)) && L.piezaDe(ra.propuesta).limites.some((a) => /EDAD/.test(a)) && ra.propuesta.datos.calidad.certificado === false);

    titulo('El buscador · tabla multivariable e índice combinado');
    const multi = li2('minutos, uso, plays y puntos de los jugadores');
    check('más de dos métricas no se fuerzan a un cruce: tabla con todas, ordenada por la primera', !multi.consulta.cruce && multi.consulta.metricas.join() === 'MIN,USG%,PLAYS,PTS' && multi.consulta.orden === 'MIN' && multi.consulta.top === 50);
    const rm2 = E.explorar(idx, 'jugadores', multi.consulta);
    check('salen todas las columnas pedidas, ordenadas por la líder', ['MIN', 'USG%', 'PLAYS', 'PTS'].every((k) => rm2.columnas.some((x) => x.id === k)) && rm2.cruce === null && rm2.filas.every((x, i, a) => !i || a[i - 1].valores.MIN >= x.valores.MIN));
    check('dos métricas sin «contra» tampoco se cruzan; con «contra», sí', !li2('minutos y puntos de los jugadores').consulta.cruce && li2('minutos contra puntos de los jugadores').consulta.cruce.join() === 'MIN,PTS');
    const ind = li2('minutos, uso, plays y puntos de los jugadores, índice combinado');
    const ri = E.explorar(idx, 'jugadores', ind.consulta);
    check('con «índice combinado» se ordena por el índice, que va primero y dice cómo se armó', ind.consulta.indice.length === 4 && ri.orden === 'INDICE' && ri.columnas[0].id === 'INDICE' && /promedio de los percentiles/.test(ri.columnas[0].nombre) && ri.filas.every((x, i, a) => !i || a[i - 1].valores.INDICE >= x.valores.INDICE));
    check('el índice es el promedio de los percentiles entre los que cumplen, a mano', (() => {
      const pasan = idx.liga.jugadores.filter((j) => j.__califica && ['MIN', 'USG%', 'PLAYS', 'PTS'].every((k) => typeof j[k] === 'number'));
      const pct = (k, v) => { let m = 0, ig = 0; pasan.forEach((j) => { if (j[k] < v) m++; else if (j[k] === v) ig++; }); return (m + 0.5 * ig) / pasan.length * 100; };
      const j0 = pasan.find((j) => j.NOMBRES === ri.filas[0].jugador);
      return ri.cumplen === pasan.length && ri.filas[0].valores.INDICE === Math.round(['MIN', 'USG%', 'PLAYS', 'PTS'].reduce((t, k) => t + pct(k, j0[k]), 0) / 4 * 10) / 10;
    })());
    check('en una métrica donde menos es mejor, el índice se da vuelta', (() => { const x = E.explorar(idx, 'equipos', { indice: ['PePP%', 'RTNG DEF'], top: 50 }); const peor = x.filas[x.filas.length - 1], mejor = x.filas[0]; return mejor.valores['PePP%'] + mejor.valores['RTNG DEF'] / 1000 < peor.valores['PePP%'] + peor.valores['RTNG DEF'] / 1000 || mejor.valores['RTNG DEF'] < peor.valores['RTNG DEF']; })());
    check('un índice que no entra entero en la vista NO certifica la muestra', ri.cumplen > 50 && ri.calidad.muestra.ok === false && /VISTA RECORTADA/.test(ri.calidad.muestra.texto));

    titulo('El buscador · por partido contra totales');
    const tj = E.explorar(idx, 'jugadores', { metricas: ['PTS', 'T3I', 'T3%'], orden: 'PTS', escala: 'total', top: 50 });
    const j1 = idx.liga.jugadores.find((j) => j.NOMBRES === tj.filas[0].jugador);
    const log1 = idx.liga.jugadorPartidos.get(SGADD.clavePersona(j1.NOMBRES)).filter((r) => r.__equipo === SGADD.claveEquipo(j1.EQUIPO));
    check('el total de un jugador es la SUMA de su partido a partido, no el promedio por los partidos', tj.filas[0].valores.PTS === log1.reduce((t, r) => t + (r.PTS || 0), 0) && tj.filas[0].valores.PTS > j1.PTS * 3);
    check('aunque el promedio de la hoja diga otra cosa: el total no se arma multiplicándolo', (() => {
      /* Un libro con el promedio de un jugador mal cargado: su total tiene que seguir siendo lo que sumó. */
      const idxT = SGADD.construirIndice(JSON.parse(JSON.stringify(hojas)), { fase: 'REGULAR', torneo: SGADD.TORNEO_TOTAL });
      const jt = idxT.liga.jugadores.find((j) => j.NOMBRES === j1.NOMBRES && j.EQUIPO === j1.EQUIPO);
      jt.PTS = 99;
      const fila = E.explorar(idxT, 'jugadores', { metricas: ['PTS'], orden: 'PTS', escala: 'total', top: 50 }).filas.find((x) => x.jugador === j1.NOMBRES);
      return fila.valores.PTS === log1.reduce((t, r) => t + (r.PTS || 0), 0) && fila.valores.PTS !== 99 * jt.PJ;
    })());
    check('las cuentas van rotuladas «tot.» y las tasas no cambian', tj.columnas.find((x) => x.id === 'PTS').label === 'PTS tot.' && tj.columnas.find((x) => x.id === 'PTS').escala === 'total' && tj.columnas.find((x) => x.id === 'T3%').escala === 'tasa' && tj.filas[0].valores['T3%'] === j1['T3%'] && tj.escala === 'total' && /TOTALES/.test(tj.calidad.escala));
    check('por defecto es por partido, y lo dice', (() => { const x = E.explorar(idx, 'jugadores', { metricas: ['PTS'], orden: 'PTS' }); return x.escala === 'promedio' && x.columnas[0].label === 'PTS' && /PROMEDIOS por partido/.test(x.calidad.escala) && x.filas[0].valores.PTS === Math.max.apply(null, idx.liga.jugadores.map((j) => j.PTS || 0)); })());
    check('el total de un equipo es el de sus partidos', (() => { const x = E.explorar(idx, 'equipos', { metricas: ['PTS'], orden: 'PTS', escala: 'total', top: 50 }); return x.filas.every((y) => { const e = idx.lista().find((z) => z.nombre === y.equipo); return y.valores.PTS === e.totales.propio.PTS; }); })());
    check('el orden por total no es el orden por promedio', (() => { const a = E.explorar(idx, 'jugadores', { metricas: ['PTS'], orden: 'PTS', top: 20 }).filas.map((x) => x.jugador).join('|'), b = E.explorar(idx, 'jugadores', { metricas: ['PTS'], orden: 'PTS', escala: 'total', top: 20 }).filas.map((x) => x.jugador).join('|'); return a !== b; })());
    check('«totales» pide la escala; «rebotes totales» es una métrica, no una escala', li2('puntos totales de los jugadores').consulta.escala === 'total' && !li2('rebotes totales y puntos de los equipos').consulta.escala && li2('rebotes totales y puntos de los equipos').consulta.metricas[0] === 'RT%');
    check('un partido no tiene total', E.explorar(idx, 'partidos', { metricas: ['PTS'], orden: 'PTS', escala: 'total' }).escala === 'promedio');

    titulo('El buscador · el piso de volumen automático');
    const pt = E.explorar(idx, 'jugadores', li2('triples de los jugadores').consulta);
    const califPj = idx.liga.jugadores.filter((j) => j.__califica && !(j.PJ < 3));
    const corte = (() => { const o = califPj.map((j) => j.T3I).filter((v) => typeof v === 'number').sort((a, b) => a - b); return Math.round(o[Math.floor((o.length - 1) * 0.25)] * 10) / 10; })();
    check('ordenar por una efectividad aplica el piso con números de ESTA liga', pt.calidad.piso.aplicado === true && pt.condiciones.some((x) => x.metrica === 'PJ' && x.valor === 3 && x.auto) && pt.condiciones.some((x) => x.metrica === 'T3I' && x.valor === corte && x.auto), JSON.stringify(pt.condiciones) + ' corte ' + corte);
    check('y lo informa en el encabezado, pieza por pieza', new RegExp('MIN ≥ ' + SGADD.formatear('MIN', idx.liga.minJugador).replace('.', '\\.')).test(pt.calidad.piso.texto) && /PJ ≥ 3/.test(pt.calidad.piso.texto) && /T3I ≥ /.test(pt.calidad.piso.texto) && /cuartil más bajo/.test(pt.calidad.piso.texto));
    check('todas las filas lo cumplen', pt.filas.every((x) => x.valores.T3I >= corte && x.valores.PJ >= 3 && x.califica));
    check('el primero ya no es un 1 de 1', pt.filas[0].valores['T3%'] < 1 && E.explorar(idx, 'jugadores', { metricas: ['T3%'], orden: 'T3%' }).filas[0].valores['T3%'] > pt.filas[0].valores['T3%']);
    check('un piso pedido a mano no se pisa', (() => { const x = E.explorar(idx, 'jugadores', li2('triples con al menos 4 t3i en jugadores').consulta); return x.condiciones.filter((y) => y.metrica === 'T3I').length === 1 && x.condiciones.find((y) => y.metrica === 'T3I').valor === 4 && /el piso que pediste/.test(x.calidad.piso.texto); })());
    check('si se filtró por minutos a propósito, no se exige el umbral de la liga', (() => { const x = E.explorar(idx, 'jugadores', li2('triples con menos de 15 minutos').consulta); return x.filas.every((y) => y.valores.MIN < 15) && /minutos: los que pediste/.test(x.calidad.piso.texto) && x.filas.length > 0; })());
    check('lo que no es una efectividad no lleva piso', E.explorar(idx, 'jugadores', li2('puntos de los jugadores').consulta).calidad.piso.aplicado === false && E.explorar(idx, 'jugadores', li2('puntos de los jugadores').consulta).calidad.piso.ok === true);
    check('en equipos no hace falta: la temporada entera', (() => { const x = E.explorar(idx, 'equipos', li2('eFG% de los equipos').consulta).calidad.piso; return x.ok && !x.aplicado && /temporada entera/.test(x.texto); })());
    check('sin piso automático ni manual, el diagnóstico lo denuncia', (() => { const x = E.explorar(idx, 'jugadores', { metricas: ['T3%'], orden: 'T3%' }).calidad; return x.piso.ok === false && /SIN PISO/.test(x.piso.texto) && x.certificado === false; })());

    titulo('El buscador · solo activos');
    const todos = E.explorar(idx, 'jugadores', { metricas: ['PTS'], orden: 'PTS', top: 50 });
    const act = E.explorar(idx, 'jugadores', { metricas: ['PTS'], orden: 'PTS', top: 50, activos: 4 });
    const activoAMano = (j, n) => { const e = idx.lista().find((x) => x.clave === SGADD.claveEquipo(j.EQUIPO)); const ult = new Set(e.partidos.slice().sort((a, b) => a.__fecha - b.__fecha).slice(-n).map((p) => p.__id)); return (idx.liga.jugadorPartidos.get(SGADD.clavePersona(j.NOMBRES)) || []).some((r) => r.__equipo === e.clave && ult.has(r.__id) && r.MIN > 0); };
    const inact = idx.liga.jugadores.filter((j) => typeof j.PTS === 'number' && !activoAMano(j, 4)).length;
    check('saca a los que no sumaron minutos en las últimas 4 fechas de su equipo, contados a mano', act.inactivos === inact && inact > 0 && act.cumplen === todos.cumplen - inact, act.inactivos + ' vs ' + inact);
    check('y lo dice entre los filtros aplicados', act.calidad.filtros.aplicados.some((a) => new RegExp('últimas 4 fechas de su equipo\\. ' + inact + ' quedaron afuera').test(a)));
    check('con más fechas de margen quedan afuera menos', E.explorar(idx, 'jugadores', { metricas: ['PTS'], orden: 'PTS', activos: 10 }).inactivos <= act.inactivos);
    check('sin pedirlo no se saca a nadie', todos.inactivos === 0 && !todos.calidad.filtros.aplicados.some((a) => /activos/.test(a)));
    check('«activos» y «últimas N fechas» se leen del texto', li2('puntos de los jugadores activos').consulta.activos === E.FECHAS_ACTIVO && li2('puntos de los jugadores activos en las últimas 6 fechas').consulta.activos === 6 && !li2('puntos de los jugadores').consulta.activos);
    check('no aplica a equipos', E.explorar(idx, 'equipos', { metricas: ['PTS'], activos: 4 }).inactivos === 0);

    titulo('El buscador · el diagnóstico de calidad');
    const cz2 = E.explorar(idx, 'equipos', { cruce: ['RO%', 'WIN%'], grupo: 'todos', top: 50 }).calidad;
    check('los tres puntos y la escala, siempre', ['muestra', 'filtros', 'piso', 'escala', 'certificado'].every((k) => k in cz2) && Array.isArray(cz2.filtros.aplicados) && Array.isArray(cz2.filtros.omitidos));
    check('un cruce de equipos entero queda certificado', cz2.certificado === true && cz2.muestra.ok && cz2.muestra.n === idx.lista().length && /sin recortes/.test(cz2.muestra.texto));
    check('un ranking no es un recorte: sus 10 primeros son lo pedido', (() => { const x = E.explorar(idx, 'jugadores', { metricas: ['PTS'], orden: 'PTS' }).calidad.muestra; return x.ok === true && x.ranking === true && /RANKING: los 10 primeros de/.test(x.texto); })());
    check('un cruce que no entra entero NO se certifica', (() => { const x = E.explorar(idx, 'jugadores', { cruce: ['USG%', 'TS%'], grupo: 'todos', top: 50 }).calidad; return x.muestra.ok === false && x.certificado === false && /las medianas se calcularon sobre todos/.test(x.muestra.texto); })());
    check('la N del diagnóstico es la de la tabla', (() => { const x = E.explorar(idx, 'jugadores', { metricas: ['PTS'], orden: 'PTS', soloCalificados: true }); return x.calidad.muestra.n === x.cumplen && x.calidad.filtros.aplicados.some((a) => /califican por minutos/.test(a)); })());
    check('un filtro desactivado quita el certificado', E.certificar({ muestra: { ok: true }, piso: { ok: true }, filtros: { aplicados: [], omitidos: ['x'] } }).certificado === false && E.certificar({ muestra: { ok: true }, piso: { ok: true }, filtros: { aplicados: [], omitidos: [] } }).certificado === true);
    check('el diagnóstico viaja en la pieza: lo lee la IA', (() => { const x = E.aPropuesta(E.explorar(idx, 'equipos', { cruce: ['RO%', 'WIN%'], grupo: 'todos', top: 50 }), '', 'q'); return L.piezaDe(x).numeros.calidad.certificado === true && L.piezaDe(x).numeros.escala === 'promedio'; })());
    const htmlQ = fs.readFileSync('centro-mando/index.html', 'utf8');
    check('la pantalla lo muestra ANTES de la tabla, y tiene la escala, los activos y el permiso para seguir', /return calidad \+ cab \+ cruce/.test(htmlQ) && /Datos certificados para redactar/.test(htmlQ) && /id="l-escala"/.test(htmlQ) && /id="l-activos"/.test(htmlQ) && /id="l-aceptar"/.test(htmlQ) && /Desactivados por falta de columna/.test(htmlQ));
  }

  titulo('Lo que se ve es lo que se cuenta');
  {
    const N = idx.lista().length;
    const lt = await S.libre({ liga: 'lnb', zona: 'unica', texto: '¿Cómo influye el RO% en las victorias de los equipos?' });
    const R = lt.resultado, K = R.cruce;
    check('un cruce de equipos muestra a TODOS: las filas son la N del resumen', R.filas.length === N && K.n === N && R.enTabla === N && lt.propuesta.datos.filas.length === N, R.filas.length + ' de ' + N);
    check('dice sobre cuántos se calculó la mediana', K.base === 'Medianas calculadas sobre N = ' + N + ' equipos del libro, todos los que tienen las dos métricas.');
    check('cada fila dice de qué lado de cada mediana cae, y contarlas da el resumen', R.filas.filter((x) => x.sobreA).length === K.altosA && R.filas.filter((x) => x.sobreA && x.sobreB).length === K.cuadrantes.altoAlto && R.filas.filter((x) => !x.sobreA && x.sobreB).length === K.cuadrantes.bajoAlto);
    check('la tabla va ordenada por la primera: la mediana la parte en un solo lugar', R.filas.every((x, i, a) => !i || !(x.sobreA && !a[i - 1].sobreA)));
    check('lo que lee la IA son esas mismas filas, con sus marcas', (() => { const pz = L.piezaDe(lt.propuesta); return pz.numeros.filas.length === N && pz.numeros.filas.every((x, i) => x.sobreA === R.filas[i].sobreA && x.sobreB === R.filas[i].sobreB && x.texto['WIN%'] === R.filas[i].texto['WIN%']) && pz.numeros.cruce.n === N; })());
    const hp = M.placasHtml(Object.assign({}, lt.propuesta, { datos: Object.assign({}, lt.propuesta.datos, { filas: lt.propuesta.datos.filas.slice(0, 12) }), muestra: Object.assign({}, lt.propuesta.muestra, { filasDelGrupo: 12 }) }), lt.propuesta.titulo, '');
    check('la placa de la tabla trae la línea de la mediana, las marcas y la N', /<tr class="med">/.test(hp) && /▲/.test(hp) && /▼/.test(hp) && new RegExp('N = ' + N + ' · ▲▼ contra la mediana de % Victorias').test(hp) && !/se muestran/.test(hp));
    const hpT = M.placasHtml(lt.propuesta, lt.propuesta.titulo, '');
    check('y si no entran todas, lo dice: nunca una tabla recortada en silencio', N <= M.FILAS_EN_PLACA ? !/se muestran/.test(hpT) : new RegExp('se muestran ' + M.FILAS_EN_PLACA + ' de ' + N).test(hpT));
    const lj = await S.libre({ liga: 'lnb', zona: 'unica', texto: 'USG% contra TS% en jugadores', grupo: 'todos' });
    check('con más casos que el tope, la tabla dice cuántas muestra de cuántas, y la pieza lo lleva como límite', lj.resultado.enTabla > 50 && lj.resultado.filas.length === 50 && lj.propuesta.avisos.some((a) => new RegExp('La tabla muestra 50 de ' + lj.resultado.enTabla).test(a)) && L.piezaDe(lj.propuesta).limites.length >= 1);
    check('un ranking sigue saliendo de a 10, y lo dice', (() => { const x = E.aPropuesta(E.explorar(idx, 'jugadores', { metricas: ['PTS'], orden: 'PTS' }), '', 'r'); return x.datos.filas.length === 10 && x.muestra.filasDelGrupo > 10 && x.avisos.some((a) => /La tabla muestra 10 de/.test(a)); })());
    const html2 = fs.readFileSync('centro-mando/index.html', 'utf8');
    check('la pantalla pinta la línea de la mediana, las marcas, «se muestran X de Y» y el volumen al lado', /class="med"/.test(html2) && /Se muestran las /.test(html2) && /Se muestran ' \+ r\.filas\.length \+ ' de '/.test(html2) && /volumenDe/.test(html2) && /esc\(k\.base\)/.test(html2));

    titulo('El autochequeo de cada pieza');
    const ac = (p) => { const o = {}; M.autochequeo(p).forEach((x) => { o[x.id] = x; }); return o; };
    const a1 = ac(lt.propuesta);
    check('son tres preguntas, siempre', M.autochequeo(lt.propuesta).length === 3 && M.autochequeo({ ok: true, id: 'CR-01', datos: { cambian: 7 } }).length === 3);
    check('1 · filas: con las ' + N + ' a la vista' + (N <= M.FILAS_EN_PLACA ? ' pasa' : ' en pantalla y ' + M.FILAS_EN_PLACA + ' en la placa, avisa'), a1.filas.ok === (N <= M.FILAS_EN_PLACA));
    check('1 · filas: una tabla que muestra 50 de más, NO pasa y dice cuántas', (() => { const x = ac(lj.propuesta).filas; return x.ok === false && /se muestran 50/.test(x.detalle); })());
    check('1 · filas: una receta sin tabla no aplica', ac({ ok: true, id: 'CR-01', datos: { cambian: 7 } }).filas.ok === null);
    check('2 · volumen: en equipos el volumen es la temporada, y pasa si está a la vista', ac((await S.libre({ liga: 'lnb', zona: 'unica', texto: 'eFG% contra victorias en equipos' })).propuesta).volumen.ok === true);
    const sinPiso = await S.libre({ liga: 'lnb', zona: 'unica', texto: 'triples con menos de 15 minutos' });
    check('2 · volumen: un T3% de jugadores sale con su piso automático, y pasa', (() => { const x = ac(sinPiso.propuesta).volumen; return x.ok === true && /un piso de/.test(x.detalle) && sinPiso.resultado.calidad.piso.aplicado === true; })());
    check('2 · volumen: sin piso (una tabla armada a mano en el laboratorio) NO pasa', (() => { const x = ac(E.aPropuesta(E.explorar(idx, 'jugadores', { metricas: ['T3%'], orden: 'T3%' }), '', 'v')).volumen; return x.ok === false && /no tiene un piso de T3I/.test(x.detalle); })());
    check('2 · volumen: con el piso pedido, pasa', ac((await S.libre({ liga: 'lnb', zona: 'unica', texto: 'triples con menos de 15 minutos y al menos 2 t3i' })).propuesta).volumen.ok === true);
    check('2 · volumen: lo que no es una efectividad pasa sin más', ac((await S.libre({ liga: 'lnb', zona: 'unica', texto: 'ritmo de los equipos' })).propuesta).volumen.ok === true);
    check('3 · copy: sin redactar, todavía no aplica', a1.copy.ok === null && /plantilla/.test(a1.copy.detalle));
    const P1 = 'Cargar el cristal no gana solo. Con estos equipos la relación es débil, y eso ya es una postura: el que arma su plan alrededor del rebote ofensivo está apostando a una variable que explica poco de lo que pasa.';
    const P2 = 'Detrás de este número hay una tensión de la cancha: mandar jugadores al rebote ofensivo te saca gente del balance defensivo, y el rival sale de contraataque con ventaja antes de que llegues al retroceso.';
    const P3 = 'El que no lo mide decide la charla técnica a ciegas y regala posesiones en el cierre. El que lo cruza con sus pérdidas y su tiro sabe a qué rival apretar en el cristal y contra cuál conviene volver a defender.';
    const Q3 = '¿Sabés cuántos contraataques concediste por ir al rebote?\n¿Quién de los tuyos vuelve primero a defender?\n¿Cuándo mediste por última vez tu balance defensivo?';
    const copyOk = [P1, P2, P3, Q3, 'Comentá CONTEXTO.'].join('\n\n') + '\n\n' + M.HASHTAGS;
    const capasOk = { porQue: 'mandar jugadores al rebote ofensivo te saca gente del balance defensivo', dolor: 'El que no lo mide decide la charla técnica a ciegas y regala posesiones en el cierre.', beneficio: 'sabe a qué rival apretar en el cristal y contra cuál conviene volver a defender' };
    const red = (copy, capas) => Object.assign({}, lt.propuesta, { redaccion: 'ia', copy, capas });
    check('3 · copy: tres párrafos, tres preguntas y las tres capas señaladas, pasa', ac(red(copyOk, capasOk)).copy.ok === true && ac(red(copyOk, capasOk)).copy.capas.dolor === capasOk.dolor);
    check('3 · copy: con dos párrafos no pasa', (() => { const x = ac(red([P1, P2, Q3].join('\n\n'), capasOk)).copy; return x.ok === false && /párrafo/.test(x.detalle); })());
    check('3 · copy: con dos preguntas no pasa', (() => { const x = ac(red([P1, P2, P3, '¿Sabés cuántos contraataques concediste?\n¿Quién vuelve primero a defender?'].join('\n\n'), capasOk)).copy; return x.ok === false && /pregunta/.test(x.detalle); })());
    check('3 · copy: sin una capa señalada no pasa, y dice cuál', (() => { const x = ac(red(copyOk, { porQue: capasOk.porQue, dolor: null, beneficio: capasOk.beneficio })).copy; return x.ok === false && /el dolor/.test(x.detalle) && !/el beneficio/.test(x.detalle); })());
    check('3 · copy: si copia el dato del generador palabra por palabra, no pasa', (() => { const x = ac(red(copyOk.replace(P1, P1 + ' ' + lt.propuesta.dato), capasOk)).copy; return x.ok === false && /palabra por palabra/.test(x.detalle); })());
    check('3 · copy: las capas como rótulo no pasan', ac(red(copyOk.replace(P3, 'El dolor de no verlo: ' + P3), capasOk)).copy.ok === false);

    titulo('Las capas que señala la IA se verifican contra el copy');
    const baseC = { id: 'X', titulo: 't', dato: 'd', guion: [], numeros: {} };
    const salidaC = (capas) => ({ titulo: 't', ganchos: [], guion: [], placas: [], copy: [P1, P2, P3, Q3].join('\n\n') + '\n\n#uno #dos', capas });
    const fc = L.filtrar(salidaC(capasOk), baseC);
    check('una cita que está en el copy vale', fc.capas.porQue === capasOk.porQue && fc.capas.dolor === capasOk.dolor && fc.capas.beneficio === capasOk.beneficio);
    check('una cita que NO está en el copy no vale: el modelo no puede decir que cumplió sin haberlo escrito', L.filtrar(salidaC(Object.assign({}, capasOk, { dolor: 'Perdés partidos por no medir esto, y lo sabés.' })), baseC).capas.dolor === null);
    check('ni la misma oración para dos capas, ni una cita de tres palabras', (() => { const x = L.filtrar(salidaC({ porQue: capasOk.porQue, dolor: capasOk.porQue, beneficio: 'sabe a qué rival' }), baseC).capas; return x.porQue === capasOk.porQue && x.dolor === null && x.beneficio === null; })());
    check('sin copy no hay capas, y una redacción sin el campo no se rechaza', L.filtrar({ titulo: 't', ganchos: [], guion: [], placas: [], copy: '' }, baseC).capas.dolor === null &&
      (await L.redactar(p, 'tactico', { ejecutar: cli(okCli(buena)).ejecutar })).capas.porQue === null);
    check('el prompt pide el autochequeo y el volumen antes que el adjetivo', /TU AUTOCHEQUEO/.test(L.SISTEMA_REDACCION) && /copiadas TEXTUALES/.test(L.SISTEMA_REDACCION) && /EL VOLUMEN ANTES QUE EL ADJETIVO/.test(L.SISTEMA_REDACCION) && /no hables de filas que la pieza no trae/.test(L.SISTEMA_REDACCION));
    check('la tarjeta muestra el autochequeo y las citas, y el copy de la IA reemplaza al de plantilla', /r\.autochequeo/.test(html2) && /blockquote/.test(html2) && /reemplazó al de plantilla/.test(html2));

    titulo('Los conectores locales');
    /* Un catálogo de mentira: los tests no salen a la red. */
    const catF = { catalogo: { 'liga-nacional-2026-27': { tipo: 'torneo', categorias: { 'lnb-2026-27': { sheetId: 'x' } } }, deportivo: { categorias: { 'deportivo-primera': { sheetId: 'y', torneo: 'apb-2026-masculino', zona: 'b' } } }, jujuy: { categorias: { 'jujuy-primera': {} } } }, origen: 'kv', aviso: null };
    const cx = await S.conectores({ catalogo: catF });
    check('un libro conectado, uno sin libro y uno que el catálogo no tiene, cada uno con su motivo', (() => { const l = (n) => cx.conectores.find((x) => x.nombre.indexOf('Libro · ') === 0 && x.detalle.indexOf(n) !== -1); return l('deportivo/deportivo-primera').ok === true && l('jujuy/jujuy-primera').ok === false && /todavía no tiene libro/.test(l('jujuy/jujuy-primera').detalle) && l('reconquista/reconquista-primera').ok === false; })());
    check('lee el archivo del torneo de la zona enganchada y el del torneo mismo', cx.conectores.filter((x) => x.nombre.indexOf('Torneo · ') === 0 && x.ok).length === 2 && cx.conectores.some((x) => /torneos\/apb-2026-masculino\.json/.test(x.detalle)));
    check('con el catálogo de respaldo, lo dice', (await S.conectores({ catalogo: { catalogo: {}, origen: 'codigo', aviso: null } })).conectores[0].ok === false);
    const de = (n) => cx.conectores.filter((x) => x.nombre.indexOf(n) === 0);
    check('revisa el catálogo, un libro por zona, los torneos, los escudos, la cola, la bandeja y el historial', de('Catálogo').length === 1 && de('Libro · ').length === Object.keys(GC.LIGAS).reduce((a, l) => a + Object.keys(GC.LIGAS[l].zonas).length, 0) && de('Escudos · ').length === Object.keys(GC.LIGAS).length && de('Cola de Canva').length === 1 && de('Bandeja').length === 1 && de('Historial').length === 1);
    check('los escudos de cada liga están en el repo', de('Escudos · ').every((x) => x.ok), de('Escudos · ').filter((x) => !x.ok).map((x) => x.detalle).join(' | '));
    check('cada conector dice si está y por qué; ninguno lleva un sheetId', cx.conectores.every((x) => typeof x.ok === 'boolean' && x.detalle.length > 5) && !/[A-Za-z0-9_-]{40,}/.test(JSON.stringify(cx)) && cx.total === cx.conectores.length);
    const colaRota = await (async () => {
      const colaF = require('path').join(DATOS_TMP, 'centro-mando', 'cola-canva.json'), previa = fs.existsSync(colaF) ? fs.readFileSync(colaF, 'utf8') : null;
      fs.writeFileSync(colaF, JSON.stringify({ pendientes: [{ id: 'x', estado: 'pendiente', pieza: 'CR-99', html: 'contenido/centro-mando/no-existe.html' }] }));
      const y = await S.conectores({ catalogo: catF });
      if (previa == null) fs.unlinkSync(colaF); else fs.writeFileSync(colaF, previa);
      return y.conectores.find((x) => x.nombre === 'Cola de Canva');
    })();
    check('una pieza de la cola cuyo HTML ya no está se denuncia, y dice cuál', colaRota.ok === false && /CR-99/.test(colaRota.detalle));
    check('la página tiene el panel de conectores', /id="conectores"/.test(html2) && /api\('\/api\/conectores'\)/.test(html2));
  }

  titulo('El % de victorias es el de la tabla de posiciones');
  {
    const idx2 = SGADD.construirIndice(JSON.parse(JSON.stringify(hojas)), { fase: 'REGULAR', torneo: SGADD.TORNEO_TOTAL });
    const A = idx2.lista()[0], B = idx2.lista()[1];
    const win = (i) => { const r = E.explorar(i, 'equipos', { metricas: ['WIN%'], top: 50 }); const m = {}; r.filas.forEach((x) => { m[x.equipo] = x.valores['WIN%']; }); m.__v = r.victorias; return m; };
    const libro = win(idx2);
    check('sin la tabla, sale del libro y lo dice', libro.__v.fuente === 'box' && libro[A.nombre] === A.record.ganados / A.record.pj);
    E.conRecordDeTabla(idx2, {});
    const sinM = win(idx2);
    check('con la tabla y sin partidos cargados a mano, da lo mismo que el libro', sinM.__v.fuente === 'tabla' && sinM.__v.manuales === 0 && idx2.lista().every((e) => sinM[e.nombre] === libro[e.nombre]));
    E.conRecordDeTabla(idx2, { ['IDA|' + idx2.fase]: [{ id: 'm1', fecha: '2026-01-01', local: A.nombre, visitante: B.nombre, puntosLocal: 80, puntosVisitante: 70 }], 'IDA|PLAYOFF': [{ id: 'm2', fecha: '2026-05-01', local: B.nombre, visitante: A.nombre, puntosLocal: 90, puntosVisitante: 60 }] });
    const conM = win(idx2);
    check('un partido sin estadísticas suma al récord: el que ganó y el que perdió', conM[A.nombre] === (A.record.ganados + 1) / (A.record.pj + 1) && conM[B.nombre] === B.record.ganados / (B.record.pj + 1) && conM.__v.manuales === 1, conM[A.nombre] + ' / ' + conM[B.nombre]);
    check('el de otra fase no entra', conM.__v.manuales === 1);
    check('los promedios y el récord del índice no se tocan', idx2.leer(A.clave, 'RTNG OFF').valor === idx.leer(idx.lista()[0].clave, 'RTNG OFF').valor && A.record.pj === idx.lista()[0].record.pj && A.pj === idx.lista()[0].pj);
    check('el cruce usa ese mismo récord', E.explorar(idx2, 'equipos', { cruce: ['RO%', 'WIN%'], grupo: 'todos', top: 50 }).filas.find((x) => x.equipo === A.nombre).valores['WIN%'] === conM[A.nombre]);
    const srv2 = fs.readFileSync('centro-mando/servidor.js', 'utf8');
    const ci = srv2.indexOf('async function indiceDe('), cuerpoI = srv2.slice(ci, srv2.indexOf('\n}', ci));
    check('el servidor lo cuelga de cada índice que lee, con los manuales de la zona', cuerpoI.indexOf('GC.leerIndice(') !== -1 && cuerpoI.indexOf('recordDeTabla(') > cuerpoI.indexOf('GC.leerIndice(') && /MUT\.manualesDeZona\(/.test(srv2));
  }

  titulo('La guarda de números en letras');
  check('orden y prioridad', ['prioridad número uno', 'el primero de la tabla', 'en segundo lugar', 'Top tres del torneo', 'quedó en primer puesto'].every((t) => L.numerosEnLetras(t).length === 1));
  check('cantidades de la liga y fracciones', ['seis equipos ganan', 'tres de cada cinco', 'doce puntos de diferencia', 'la mitad de la liga', 'un tercio de sus jugadas'].every((t) => L.numerosEnLetras(t).length === 1));
  check('el léxico del juego no se toca', ['segunda oportunidad y tiro de tres', 'uno contra uno', 'el segundo tiro', 'la primera línea de pase', 'vale dos puntos'].every((t) => L.numerosEnLetras(t).length === 0));
  check('ni los giros que no cuentan nada', ['las dos métricas, dos decisiones', 'los cuatro grupos', 'primero mirá el número', 'los de la mitad de arriba en RO%', 'pagás dos veces', 'cada uno de tus jugadores', 'un equipo y una posesión'].every((t) => L.numerosEnLetras(t).length === 0));
  check('con o sin acentos y mayúsculas', L.numerosEnLetras('PRIORIDAD NUMERO UNO').length === 1 && L.numerosEnLetras('El Séptimo de la tabla').length === 1);
  check('un texto con un número en letras se descarta, como uno con una cifra ajena', (() => {
    const base = { id: 'X', titulo: 't', dato: '7 de 12 equipos', guion: [], numeros: {} };
    const pl3 = (rol, texto) => ({ rol, titulo: '', texto, destacado: '' });
    const r3 = L.filtrar({ titulo: 't', ganchos: [{ estilo: 'dato', texto: 'Seis equipos lo hacen mal' }, { estilo: 'titular', texto: 'Tu prioridad está mal puesta' }], guion: [], copy: 'La mitad de la liga se equivoca.',
      placas: [pl3('gancho', 'g'), pl3('evidencia', '7 de 12'), pl3('evidencia', 'Lo ponés como prioridad número uno'), pl3('propuesta', 'Pagás dos veces la misma jugada'), pl3('cierre', 'c')] }, base);
    return r3.ganchos.length === 1 && r3.ganchos[0].estilo === 'titular' && r3.copy === null && r3.placas.length === 4 && r3.placas.some((x) => /dos veces/.test(x.texto)) && r3.descartado.filter((d) => /números en letras/.test(d.motivo)).length === 3;
  })());

  titulo('La voz de entrenador-analista');
  check('términos exactos de cancha, no metáforas', /TÉRMINOS EXACTOS, no metáforas/.test(L.SISTEMA_REDACCION) && ['contraataque rival', 'balance defensivo', 'puntos de transición'].every((w) => L.SISTEMA_REDACCION.indexOf(w) !== -1) && /nunca una zona de la cancha/.test(L.SISTEMA_REDACCION) && /TÉRMINOS EXACTOS/.test(pr));
  check('ningún número en letras, y dice qué sí va en letras', /NINGÚN NÚMERO EN LETRAS/.test(L.SISTEMA_REDACCION) && /prioridad número uno/.test(L.SISTEMA_REDACCION) && /Lo único que se escribe en letras es el léxico del juego/.test(L.SISTEMA_REDACCION));
  const SR = L.SISTEMA_REDACCION;
  check('pide interpretar el número, no describirlo', /ENTRENADOR-ANALISTA/.test(SR) && /NO es describir el número: es INTERPRETARLO/.test(SR) && /no leés tablas: leés DINÁMICAS DE JUEGO/.test(SR));
  check('la tesis de vestuario va en la placa 1, y dice qué NO es una tesis', /LA TESIS DE VESTUARIO/.test(SR) && /La placa 1 no presenta el tema/.test(SR) && /NO es una tesis/.test(SR));
  check('el dolor se dice en la moneda del juego, sin números inventados', /puntos por posesión que se dejan en la cancha/.test(SR) && /desgaste de defender dos veces/.test(SR) && /golpe anímico/.test(SR) && /sin números inventados/.test(SR));
  check('punch: títulos cortos y léxico de cancha rioplatense', /hasta ocho palabras/.test(SR) && ['cancha', 'cristal', 'pintura', 'balance defensivo', 'segunda oportunidad', 'rotación'].every((w) => SR.indexOf(w) !== -1));
  check('el copy es un artículo de opinión: tres párrafos y tres preguntas de auditoría', /ARTÍCULO DE OPINIÓN TÁCTICA/.test(SR) && /TRES párrafos/.test(SR) && /TRES preguntas de auditoría incisivas/.test(SR) && /ARTÍCULO DE OPINIÓN TÁCTICA/.test(pr));
  check('un dato flojo no se infla: la postura es esa', /no lo infles/.test(SR));
  check('lo que la IA manda de más se corta en una palabra, no a mitad', (() => {
    const base = { id: 'X', titulo: 't', dato: 'd', guion: [], numeros: {} };
    const largo = 'palabra '.repeat(80).trim();
    const pl2 = (rol, texto) => ({ rol, titulo: '', texto, destacado: '' });
    const r2 = L.filtrar({ titulo: 't', ganchos: [{ estilo: 'titular', texto: largo }], guion: [], copy: '', placas: [pl2('gancho', 'g'), pl2('evidencia', largo), pl2('propuesta', 'p'), pl2('cierre', 'c')] }, base);
    return r2.ganchos[0].texto.length <= 200 && /palabra…$/.test(r2.ganchos[0].texto) && r2.placas[1].texto.length <= 420 && /palabra…$/.test(r2.placas[1].texto);
  })());
  check('las capas: por qué, dolor, beneficio, otra mirada y preguntas de auditoría', ['EL POR QUÉ', 'EL DOLOR', 'EL BENEFICIO', 'LA OTRA MIRADA', 'LAS PREGUNTAS DISPARADORAS'].every((x) => SR.indexOf(x) !== -1) && /AUDITORÍA/.test(SR));
  check('cada capa tiene su lugar en la narrativa', /después EL POR QUÉ, en su propia placa/.test(SR) && /EL DOLOR de no verlo, EL BENEFICIO de dominarlo y LA OTRA MIRADA/.test(SR) && /pregunta disparadora de auditoría/.test(SR));
  check('prohíbe el tono robótico o académico, con ejemplos', /robótico o académico/.test(SR) && /cabe destacar/.test(SR));
  check('y que las capas se anuncien como rótulos', /no se anuncian/.test(SR) && /no las uses de rótulo/.test(SR));
  check('la profundidad no abre la puerta a números nuevos ni a hechos inventados', /La profundidad se gana con lectura, no con números nuevos/.test(SR) && /una correlación no es una causa/.test(SR) && /lecturas GENERALES del juego/.test(SR));
  check('el copy va más hondo que las placas y trae preguntas para auditar', /más profundo que las placas/.test(SR) && /TRES preguntas de auditoría/.test(SR));
  check('el prompt alternativo habla con la MISMA voz que el redactor', M.VOZ.concat(M.CAPAS, M.ESTILO).every((l) => pr.indexOf(l) !== -1 && SR.indexOf(l) !== -1));
  check('los hashtags los pone el código: los del modelo se sacan y van los de la cuenta', (() => {
    const base = { id: 'X', titulo: 't', dato: '7 de 12', guion: [], numeros: {} };
    const c = L.filtrar({ titulo: 't', ganchos: [], guion: [], placas: [], copy: 'Mirá esto.\n\n¿Lo medís?\n\n#basquetfemenino #basquetprofesional #x1' }, base).copy;
    return c.indexOf('#basquetfemenino') === -1 && c.indexOf('#basquetprofesional') === -1 && c.slice(-M.HASHTAGS.length) === M.HASHTAGS && c.indexOf('¿Lo medís?') !== -1 && /NO escribas hashtags/.test(SR);
  })());
  check('una pregunta de gancho que quedó sin cerrar se cierra, no se tira', (() => {
    const base = { id: 'X', titulo: 't', dato: 'd', guion: [], numeros: {} };
    const g = L.filtrar({ titulo: 't', ganchos: [{ estilo: 'pregunta', texto: '¿Con qué vara medís' }, { estilo: 'titular', texto: 'Ya está bien.' }], guion: [], placas: [], copy: '' }, base).ganchos;
    return g[0].texto === '¿Con qué vara medís?' && g[1].texto === 'Ya está bien.';
  })());
  check('los decimales se piden con coma, y la guarda los toma como el mismo número', /Los decimales van con COMA/.test(SR) && L.numerosAjenos('salta de 83,2 a 95,2', { a: 83.2, b: 95.2 }).length === 0);
  check('los tres tonos dicen qué capa pesa más', Object.keys(L.TONOS).every((t) => /Lo que más pesa/.test(L.TONOS[t])));
  check('la guarda sigue igual con la voz nueva: un «por qué» con un número ajeno se descarta', (() => {
    const base = { id: 'X', titulo: 't', dato: '7 de 12 equipos', guion: ['a', 'b', 'c'], numeros: { a: 7, b: 12 } };
    const pl = (rol, texto, destacado) => ({ rol, titulo: '', texto, destacado: destacado || '' });
    const r1x = L.filtrar({ titulo: 't', ganchos: [], guion: [], copy: 'El 7 de 12. ¿Sabés cuántas de las tuyas?', placas: [pl('gancho', 'g'), pl('evidencia', '7 de 12'), pl('evidencia', 'Pasa en el 40 % de los casos'), pl('propuesta', 'El que no lo mide decide a ciegas', '¿Quién de los tuyos lo hace?'), pl('cierre', 'c')] }, base);
    return r1x.placas.length === 4 && r1x.placas.every((x) => !/40/.test(x.texto)) && r1x.placas[2].destacado === '¿Quién de los tuyos lo hace?' && r1x.descartado.some((d) => /40/.test(d.motivo));
  })());

  fsx.rmSync(DATOS_TMP, { recursive: true, force: true });
  console.log(NL + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
