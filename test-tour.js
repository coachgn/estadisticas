/* =====================================================================
   SGADD · EL HERO DE LA LANDING Y EL RECORRIDO GUIADO DE LA DEMO

   Qué se verifica, y por qué:

   1 · EL HERO CONTESTA TRES PREGUNTAS EN ORDEN: qué es, qué le duele hoy
       y qué solución le damos. Cada dolor tiene su respuesta (un dolor
       sin solución es una promesa a medias) y la demo va ANTES de todo
       lo demás.

   2 · LOS LOGOS DE LAS LIGAS EXISTEN y su CSS los pone en grises con el
       color al pasar el mouse, SOLO donde hay hover (en el teléfono un
       logo gris que nunca se enciende se lee como «deshabilitado»).

   3 · EL RECORRIDO NO ES INVASIVO. Nunca modal (el oscurecido no atrapa
       clics), nunca arranca solo, se puede pausar y retomar, y «explicar
       al tocar» es un modo explícito. Se verifica sobre el fuente y sobre
       el motor puro.

   4 · LOS PASOS: cada uno con título y texto, sin repetir, y una guía que
       salta lo que no está en pantalla en vez de trabarse.

   Lo que toca `document` se verificó a mano en el navegador sobre la demo.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

let ok = 0, fail = 0;
const NL = '\n';
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { fail++; console.log('  ✗ ' + nombre + (detalle ? '  →  ' + detalle : '')); }
}
function titulo(t) { console.log(NL + t); }

const RAIZ = __dirname;
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* EN EL NAVEGADOR `SGADD_AUTH` ES UN GLOBAL y la landing deriva de él qué trae cada
   plan; sin exponerlo, alcanza() falla cerrado y las cards salen vacías. */
global.SGADD_AUTH = require('./js/sgadd-auth.js');
const TOUR = require('./js/sgadd-tour.js');
const DEMO = require('./js/sgadd-demo.js');
const LAN = require('./js/sgadd-landing.js');
const tourSrc = leer('js/sgadd-tour.js');
const idx = leer('index.html').replace(/\r\n/g, '\n');
const bienvenida = LAN.bienvenida();

/* ===================================================================== */
titulo('1 · EL HERO · qué es, qué duele, qué solución');

check('dice qué es: analítica de básquet para cuerpos técnicos',
  /Analítica de básquet para cuerpos técnicos/.test(bienvenida));
check('promete lo que el panel hace: datos ya cargados, sin planillas',
  /fuera una persona/.test(bienvenida) && /Sin cargar nada/.test(bienvenida) && /Sin planillas/.test(bienvenida));
check('hay dolores y TODOS tienen su solución', LAN.DOLORES.length >= 3
  && LAN.DOLORES.every(d => d.hoy && d.hoy.length > 15 && d.con && d.con.length > 15),
  String(LAN.DOLORES.length));
check('cada dolor se muestra con su par «Hoy» y «Con MotorStats»',
  (bienvenida.match(/hero-hoy/g) || []).length === LAN.DOLORES.length
  && (bienvenida.match(/hero-con/g) || []).length === LAN.DOLORES.length);
check('el dolor y la solución no son el mismo texto',
  LAN.DOLORES.every(d => d.hoy !== d.con));
check('ninguna solución promete un número de velocidad que no se midió',
  LAN.DOLORES.every(d => !/\b\d+\s*(minutos|horas|segundos|veces)\b/i.test(d.con)));
check('la demo va ANTES que los dolores y que las ligas',
  bienvenida.indexOf('landing-hero-cta') < bienvenida.indexOf('hero-pares')
  && bienvenida.indexOf('hero-pares') < bienvenida.indexOf('liga-tira'));
check('el CTA principal es la demo y dice que no pide registro',
  /Probá la demo ahora/.test(bienvenida) && /No pide\s+registro ni clave/.test(bienvenida));
check('el mensaje aclara que la guía es opcional', /guía\s+opcional/.test(bienvenida));

/* ===================================================================== */
titulo('2 · LOS LOGOS DE LAS LIGAS');

check('hay cuatro ligas', LAN.LIGAS.length === 4, String(LAN.LIGAS.length));
check('el logo de cada liga existe en el repo',
  LAN.LIGAS.every(l => fs.existsSync(path.join(RAIZ, l.logo))),
  LAN.LIGAS.filter(l => !fs.existsSync(path.join(RAIZ, l.logo))).map(l => l.logo).join(', '));
check('y ninguno empieza con «_»: GitHub Pages no sirve esos archivos (punto 152)',
  LAN.LIGAS.every(l => !/\/[_.][^/]*$/.test(l.logo)));
check('cada logo lleva el nombre de la liga debajo: la imagen sola no alcanza',
  LAN.LIGAS.every(l => bienvenida.indexOf('>' + l.nombre + '<') !== -1));
check('el logo es un enlace a la demo, con su texto accesible',
  (bienvenida.match(/class="liga-logo"/g) || []).length === LAN.LIGAS.length
  && bienvenida.indexOf(LAN.RUTA_DEMO) !== -1);
check('el logo es decorativo (alt vacío): el nombre ya está al lado',
  /<img src="logos\/[^"]+" alt=""/.test(bienvenida));

check('los logos van en escala de grises',
  /\.liga-logo img \{ filter: grayscale\(1\)/.test(idx));
check('y vuelven al color al pasar el mouse O al enfocar con el teclado',
  /\.liga-logo:hover img, \.liga-logo:focus-visible img \{ filter: none/.test(idx));
check('el gris va SOLO bajo `(hover: hover)`, acotado a screen: en el teléfono van a color',
  /@media screen and \(hover: hover\) \{[\s\S]{0,200}\.liga-logo img \{ filter: grayscale/.test(idx));
check('SIN contenedor: no hay aro circular ni fondo blanco alrededor del logo',
  !/\.liga-aro/.test(idx) && !/liga-aro/.test(bienvenida));
check('respeta prefers-reduced-motion',
  /prefers-reduced-motion: reduce\) \{ \.liga-logo img \{ transition: none/.test(idx));
check('el hero, las ligas, el bloque experto y «a medida» no se imprimen',
  /@media print \{ \.hero-landing, \.liga-tira, \.exp-grid, \.medida-seccion \{ display: none !important/.test(idx));

/* El hero NO usa variantes de Tailwind: sus clases nuevas van a mano y
   `sgadd.css` no necesita regenerarse. */
check('las clases del hero están definidas a mano en el <style>',
  ['hero-landing', 'hero-titulo', 'hero-par', 'hero-tag-ok', 'liga-tira', 'liga-logo', 'exp-card', 'exp-cita', 'ben-chip', 'jug-n', 'medida-card', 'medida-cta']
    .every(c => idx.indexOf('.' + c) !== -1));
check('las consultas de ancho del hero van acotadas a screen (punto 49)',
  /@media screen and \(min-width: 820px\) \{ \.hero-pares/.test(idx));

/* ===================================================================== */
titulo('2 bis · LA LANDING REESTRUCTURADA (2026-11-13)');

check('el título de las ligas es «Realizamos el seguimiento de las siguientes ligas»',
  /Realizamos el seguimiento de las siguientes ligas/.test(bienvenida));
check('y aclara que si no ves tu liga, consultes',
  /¿No ves tu liga\?/.test(bienvenida) && /Consultanos/.test(bienvenida));
check('cada logo lleva a la demo CON la estructura de esa liga (`?liga=`)',
  LAN.LIGAS.every(l => bienvenida.indexOf('index.html?demo=1&liga=' + l.id) !== -1));
check('y cada `?liga=` existe en la demo',
  LAN.LIGAS.every(l => !!DEMO.LIGAS_DEMO[l.id]));
check('las cards de secciones se SACARON de la portada: eso lo cuenta la guía',
  !/La foto de la categoría en una pantalla/.test(bienvenida)
  && !/La ficha completa de un equipo, en ocho pestañas/.test(bienvenida));
check('los planes van DIRECTAMENTE debajo de los logos',
  bienvenida.indexOf('liga-tira') < bienvenida.indexOf('plan-grid')
  && bienvenida.indexOf('plan-grid') < bienvenida.indexOf('medida-seccion'));
check('«No hace falta ser experto» está en el hero y en su propio bloque',
  /no hace falta ser\s+experto en estadística/i.test(bienvenida) && /exp-t/.test(bienvenida));
check('los beneficios van en chips: ganá tiempo, sin planillas, sin fórmulas, sin cargar nada, sin ser un experto',
  ['Ganá tiempo', 'Sin planillas', 'Sin fórmulas', 'Sin cargar nada', 'Sin ser un experto'].every(t => bienvenida.indexOf(t) !== -1) && /ben-chip/.test(bienvenida));
check('la jugada: ENTRÁ · ANALIZÁ · DECIDÍ · VOLVÉ A LA CANCHA, en ese orden y numerada',
  LAN.JUGADA.map(p => p.t).join('|') === 'Entrá|Analizá|Decidí qué mejorar|Volvé a la cancha'
  && bienvenida.indexOf('Entrá') < bienvenida.indexOf('Analizá') && bienvenida.indexOf('Analizá') < bienvenida.indexOf('Decidí'));
check('la cita vive una sola vez, en el hero, y los pasos van dentro del hero',
  (bienvenida.match(/fuera una persona/g) || []).length === 1 && bienvenida.indexOf('jug-p') < bienvenida.indexOf('hero-pares'));
check('el bloque dice que es para cualquier nivel y que el panel es intuitivo',
  /formativas, torneos locales o ligas nacionales/.test(bienvenida) && /intuitivo/.test(bienvenida));
check('y que se empieza por lo que ya se mira y se va sumando',
  /Empezá por lo que ya mirás/.test(bienvenida) && /sumá herramientas/.test(bienvenida));
check('la cita: «Si MotorStats fuera una persona…» es un integrante más del cuerpo técnico',
  /fuera una persona/.test(bienvenida) && /integrante más de tu cuerpo técnico/.test(bienvenida));

/* LOS PLANES, del documento de bienvenida, SIN PRECIO. */
const planesHtml = LAN.seccionPlanes();
check('los planes NO llevan precio (varía por tipo de cliente)',
  !/\$\s?\d/.test(planesHtml) && !/\/\s*mes/i.test(planesHtml) && /depende del tipo de cliente/.test(planesHtml));
const pl = LAN.planes();
const titulosBronce = pl[0].suma.map(x => x.titulo).join('|');
check('Bronce trae la carga automática, el panel, los rankings, las alertas y el post-partido',
  ['Carga automática', 'Principal', 'Fixture', 'Rankings de equipos y jugadores',
    'Alertas de plantel', 'Análisis post-partido'].every(t => titulosBronce.indexOf(t) !== -1), titulosBronce);
check('la carga automática va PRIMERA: es lo que más pesa para quien arma planillas',
  pl[0].suma[0].titulo === 'Carga automática');
check('el Fixture es una sección del panel y entra al plan base (derivado del gate)',
  LAN.ORDEN.indexOf('fixture') !== -1 && LAN.alcanza('BRONCE', 'fixture'));
check('las pantallas del plan se agrupan en «Panel completo de la liga»',
  /Panel completo de la liga/.test(planesHtml));
check('Plata suma Scouting y Oro el análisis de scouters (sin cambios)',
  pl[1].suma.some(x => x.titulo === 'Scouting') && pl[2].suma.some(x => x.servicio));
check('las alertas de plantel dicen lo que son',
  /dejaron o volvieron a jugar/.test(planesHtml));

/* A MEDIDA. */
const medida = LAN.seccionAMedida();
check('hay un plan a medida que conecta más de un equipo o categoría',
  /Plan a medida para tu club/.test(medida) && /más de un equipo o categoría/.test(medida));
check('con la intención de formar jugadores y seguir al equipo con datos reales',
  /desarrollo y la formación de tus jugadores/.test(medida) && /datos reales/.test(medida));
check('y el seguimiento de tu equipo en un torneo',
  /Seguimiento de tu equipo en un torneo/.test(medida));
check('los servicios puntuales del documento están todos',
  ['Scouting pre-partido', 'Informes post-partido', 'Ficha de jugadores', 'Análisis de tu equipo']
    .every(t => medida.indexOf(t) !== -1));
check('y dicen que son SIN sumarte a la plataforma',
  /sin sumarte a la plataforma/i.test(medida));
check('«a medida» tampoco lleva precio: se cotiza',
  !/\$\s?\d/.test(medida) && /Precio a cotizar/.test(medida));
check('cada botón abre el modal con el servicio dicho en el mensaje',
  (medida.match(/SGADD_LANDING\.consultar\(null,/g) || []).length >= 6);
check('el mensaje de WhatsApp nombra el servicio, no un «plan» inexistente',
  /quiero consultar por: plan a medida/.test(DEMO.mensaje({ servicio: 'plan a medida para mi club' }))
  && !/quiero consultar por el plan/.test(DEMO.mensaje({ servicio: 'x' })));

/* ===================================================================== */
titulo('2 ter · LA DEMO SE VE COMO LA DE UN USUARIO ACTIVO');

const CFG = require('./js/sgadd-config.js');
Object.keys(DEMO.LIGAS_DEMO).forEach((id) => {
  const cfg = CFG.parsear({ competencia: DEMO.competencia(id) });
  check('«' + id + '»: la estructura se parsea con el mismo parser del panel', !!cfg && !!cfg.formatos.referencia);
  const errores = CFG.validar(cfg, { equipos: 17 }).filter(x => x.nivel === 'error');
  check('«' + id + '»: sin errores de validación con 17 equipos', errores.length === 0,
    errores.map(x => x.mensaje).join(' | '));
  const z = cfg.formatos.referencia.zonas;
  check('«' + id + '»: tiene al menos una zona con rótulo (la leyenda no queda vacía)',
    z.length >= 1 && z.every(x => x.label && x.tono));
});
check('una liga desconocida cae a la de defecto, no a una demo sin estructura',
  DEMO.ligaId('?demo=1&liga=zzz') === DEMO.LIGA_DEFECTO && DEMO.ligaId('?demo=1') === DEMO.LIGA_DEFECTO);
check('la liga se lee de la URL', DEMO.ligaId('?demo=1&liga=abb') === 'abb');

const base = { id: 'demo', planillas: [{ id: 'x', label: 'Liga de muestra', torneoId: null }] };
const adaptada = DEMO.adaptarConfig(base, 'lnb');
check('adaptarConfig pone la estructura y engancha un torneo de muestra (habilita el Fixture)',
  adaptada.planillas[0].torneoId === 'demo' && adaptada.planillas[0].zonaId === 'general' && !!adaptada.competencia);
check('el nombre de la categoría dice la liga', /Liga Nacional/.test(adaptada.planillas[0].label));
check('y NO muta el JSON original', base.planillas[0].torneoId === null && !base.competencia);

/* El calendario que viene. */
const HOY = new Date(2026, 10, 13);
const cal = DEMO.calendarioFuturo(HOY);
check('hay tres jornadas de ocho partidos', cal.length === 24, String(cal.length));
check('TODOS los partidos son de los próximos días, nunca del pasado',
  cal.every(p => new Date(p.fecha + 'T00:00:00') > HOY));
check('EQUIPO 1 juega una vez por jornada: alimenta el próximo rival',
  cal.filter(p => p.local === 'EQUIPO 1' || p.visitante === 'EQUIPO 1').length === 3);
check('ningún equipo juega dos veces en la misma jornada',
  [0, 1, 2].every(j => {
    const ps = cal.slice(j * 8, j * 8 + 8);
    const e = ps.reduce((a, p) => a.concat([p.local, p.visitante]), []);
    return new Set(e).size === e.length;
  }));
check('los nombres son los del libro de la demo (EQUIPO 1..17)',
  cal.every(p => /^EQUIPO (1[0-7]|[1-9])$/.test(p.local) && /^EQUIPO (1[0-7]|[1-9])$/.test(p.visitante)));
check('el mismo día da el mismo calendario (semilla fija)',
  JSON.stringify(DEMO.calendarioFuturo(HOY)) === JSON.stringify(cal));
const doc = DEMO.torneo('lnb', HOY);
check('el torneo de muestra declara 17 equipos y NO se marca parcial (sin cartel de «calendario parcial»)',
  doc.zonas.general.equipos.length === 17 && !doc.calendario.parcial);
check('y su nombre no repite el de la liga', !/Liga Nacional/.test(doc.nombre));

const fixSrc = fs.readFileSync(path.join(RAIZ, 'js/sgadd-fixture.js'), 'utf8');
check('el Fixture lee el torneo de muestra de la demo, no pide un archivo que no existe',
  /id === 'demo' && typeof SGADD_DEMO !== 'undefined'/.test(fixSrc) && !fs.existsSync(path.join(RAIZ, 'torneos/demo.json')));

/* LAS FECHAS SIEMPRE SON ACTUALES. */
const hojasF = { 'Base Datos E': { cols: ['FECHA'], filas: [{ FECHA: 'Date(2025,9,31)' }, { FECHA: 'Date(2026,2,15)' }] },
  'PROMEDIOS E': { cols: ['EQUIPO'], filas: [{ EQUIPO: 'EQUIPO 1' }] } };
const dias = DEMO.diasACorrer(hojasF, new Date(2026, 10, 13));
check('se corre el calendario para que el último partido caiga AYER',
  dias === Math.round((new Date(2026, 10, 12) - new Date(2026, 2, 15)) / 86400000), String(dias));
DEMO.correrFechas(hojasF, dias);
check('y el último partido queda exactamente ayer, con el mes 0-indexado de GViz',
  hojasF['Base Datos E'].filas[1].FECHA === 'Date(2026,10,12)', hojasF['Base Datos E'].filas[1].FECHA);
check('el corte entre partidos se conserva (mismos días de diferencia)',
  (() => {
    const a = DEMO.diaDeFecha(hojasF['Base Datos E'].filas[0].FECHA), b = DEMO.diaDeFecha(hojasF['Base Datos E'].filas[1].FECHA);
    return Math.round((b - a) / 86400000) === Math.round((new Date(2026, 2, 15) - new Date(2025, 9, 31)) / 86400000);
  })());
check('las hojas sin FECHA no se tocan', hojasF['PROMEDIOS E'].filas[0].EQUIPO === 'EQUIPO 1');
const crudoF = { hojas: { 'Base Datos E': { cols: ['FECHA'], filas: [['Date(2025,0,10)']] } } };
check('rehidratar SIN opciones no corre nada (los tests y el contrato siguen igual)',
  DEMO.rehidratar(crudoF)['Base Datos E'].filas[0].FECHA === 'Date(2025,0,10)');
check('y CON `hoy` sí', DEMO.rehidratar(crudoF, { hoy: new Date(2026, 5, 20) })['Base Datos E'].filas[0].FECHA === 'Date(2026,5,19)');

check('Principal cuenta los partidos del índice cuando la hoja vieja no está (antes decía «—»)',
  /const nPartidos = \(baseE\.error && idxLiga && idxLiga\.partidos != null\)/.test(idx));
check('el club adapta la config de la demo donde nace, no en cada pantalla',
  /enDemo\(\) && typeof SGADD_DEMO !== 'undefined' && SGADD_DEMO\.adaptarConfig/.test(fs.readFileSync(path.join(RAIZ, 'js/sgadd-club.js'), 'utf8')));
check('la barra de la demo dice que es de referencia y manda a WhatsApp',
  /Datos de referencia/.test(DEMO.banner()) && /WhatsApp/.test(DEMO.banner()));

/* ===================================================================== */
titulo('3 · EL RECORRIDO NO ES INVASIVO');

/* NUNCA MODAL: el oscurecido no atrapa clics. */
check('el oscurecido tiene pointer-events: none: el panel sigue usándose',
  /\.tour-foco \{[\s\S]{0,200}pointer-events: none/.test(idx));
check('el hueco del foco es una sombra enorme, sin capas que recortar',
  /\.tour-foco \{[\s\S]{0,300}box-shadow: 0 0 0 9999px/.test(idx));
check('la guía no roba el foco con focus()', !/\.focus\(/.test(tourSrc));
check('no hay trampa de foco ni aria-modal', !/aria-modal/.test(tourSrc) && !/trapFocus|trampa/i.test(
  tourSrc.replace(/\/\*[\s\S]*?\*\//g, '')));
check('la tarjeta es un diálogo NO modal, anunciado con aria-live',
  /role="dialog"[^>]*aria-live="polite"/.test(tourSrc));

/* NUNCA ARRANCA SOLO: solo ofrece. */
check('el recorrido arranca solo con la acción del usuario',
  /data-tour="empezar"[\s\S]{0,400}empezar\(sec\)/.test(tourSrc)
  && !/ofrecer\(sec\);[\s\S]{0,60}empezar\(/.test(tourSrc));
check('el ofrecimiento se va solo si se ignora',
  /MAX_OFERTA_MS/.test(tourSrc) && TOUR.MAX_OFERTA_MS > 0 && TOUR.MAX_OFERTA_MS <= 20000);
check('«Ahora no» lo descarta para esa sección y no vuelve a insistir',
  /data-tour="no"[\s\S]{0,200}est\.vistos\[sec\] = true/.test(tourSrc));
check('una sección ya ofrecida no se vuelve a ofrecer',
  /!est\.vistos\[sec\]/.test(tourSrc));

/* SE ACTIVA Y SE PAUSA EN CUALQUIER MOMENTO. */
check('el botón «Guía» está siempre a la vista y es un botón real',
  /<button type="button" id="tourBoton"/.test(tourSrc) && /\.tour-boton \{[\s\S]{0,120}position: fixed/.test(idx));
check('el menú ofrece recorrer, explicar al tocar y apagar las sugerencias',
  /data-tour="recorrer"/.test(tourSrc) && /data-tour="ayuda"/.test(tourSrc) && /data-tour="ofrecer"/.test(tourSrc));
check('se puede pausar un recorrido y RETOMARLO donde quedó',
  /est\.pausado = \{ seccion: est\.seccion, i: est\.i \}/.test(tourSrc) && /Retomar el recorrido/.test(tourSrc));
check('Esc pausa, y las flechas navegan sin pisar un campo de texto',
  /e\.key === 'Escape'/.test(tourSrc) && /INPUT\|SELECT\|TEXTAREA/.test(tourSrc));
check('al cambiar de sección el recorrido se cierra, no se arrastra',
  /est\.activo && est\.seccion !== sec\) cerrar\(false\)/.test(tourSrc));

/* «EXPLICAR AL TOCAR» es un modo EXPLÍCITO. */
check('«explicar al tocar» arranca APAGADO',
  /ayuda: false/.test(tourSrc));
check('el modo se nota: el botón cambia y el cursor también',
  /Tocá algo para ver qué es/.test(tourSrc) && /body\.tour-ayuda \{ cursor: help/.test(idx));
check('al tocar con el modo prendido NO se ejecuta la acción del clic',
  /function alTocar[\s\S]{0,700}e\.preventDefault\(\);[\s\S]{0,60}e\.stopPropagation\(\)/.test(tourSrc));
check('y el clic sobre la propia guía nunca se intercepta',
  /closest\('#tourHost'\)\) return null/.test(tourSrc) && /closest\('#tourHost'\)\) return;/.test(tourSrc));

/* SOLO EN LA DEMO. */
check('solo se monta en la demo', /function iniciar\(\) \{\s*if \(typeof document === 'undefined' \|\| !enDemo\(\)\) return;/.test(tourSrc));
check('las preferencias viven en sessionStorage, no en localStorage',
  /sessionStorage/.test(tourSrc) && !/localStorage/.test(tourSrc.replace(/\/\*[\s\S]*?\*\//g, '')));
check('el storage va con try/catch: sin él la guía igual anda',
  /try \{ return window\.sessionStorage; \} catch/.test(tourSrc));
check('no se imprime', /@media print \{ #tourHost \{ display: none !important/.test(idx));
check('en el teléfono la tarjeta es una hoja abajo',
  /@media screen and \(max-width: 639px\) \{[\s\S]{0,200}\.tour-card \{ left: \.75rem !important/.test(idx));
check('el botón y las acciones miden 44 / 36 px mínimo',
  /\.tour-boton \{[\s\S]{0,200}min-height: 44px/.test(idx) && /\.tour-btn \{[\s\S]{0,160}min-height: 36px/.test(idx));
check('respeta prefers-reduced-motion también al desplazar',
  /movimientoReducido\(\) \? 'auto' : 'smooth'/.test(tourSrc) && /\.tour-foco \{ transition: none/.test(idx));
check('el módulo está cargado en index.html y DESPUÉS de la demo',
  idx.indexOf('js/sgadd-tour.js') > idx.indexOf('js/sgadd-demo.js'));

/* ===================================================================== */
titulo('4 · LOS PASOS Y EL MOTOR');

const secciones = Object.keys(TOUR.RECORRIDOS);
check('hay recorrido para Principal, Equipos, Jugadores, Clasificación y Scouting',
  ['principal', 'equipos', 'jugadores', 'clasificacion', 'scouting'].every(s => secciones.indexOf(s) !== -1));
check('toda sección con recorrido existe en el menú de la landing',
  secciones.every(s => LAN.ORDEN.indexOf(s) !== -1));
check('cada recorrido tiene título, introducción y pasos',
  secciones.every(s => { const r = TOUR.RECORRIDOS[s]; return r.titulo && r.intro && r.pasos.length >= 1; }));
check('cada paso tiene título corto y un texto de una o dos oraciones',
  secciones.every(s => TOUR.RECORRIDOS[s].pasos.every(p =>
    p.titulo && p.titulo.length <= 42 && p.texto && p.texto.length >= 30 && p.texto.length <= 260)));
check('cada paso apunta a algo: css, título de card o texto de botón',
  secciones.every(s => TOUR.RECORRIDOS[s].pasos.every(p => p.css || p.h || p.txt)));
check('no hay dos pasos con el mismo título en un recorrido',
  secciones.every(s => {
    const t = TOUR.RECORRIDOS[s].pasos.map(p => p.titulo);
    return new Set(t).size === t.length;
  }));
check('las acciones `antes` que usan los pasos existen en el módulo',
  secciones.every(s => TOUR.RECORRIDOS[s].pasos.every(p => !p.antes
    || new RegExp(p.antes + ': function').test(tourSrc))));
check('ningún texto afirma que el panel tiene los datos de TU liga en la demo',
  secciones.every(s => TOUR.RECORRIDOS[s].pasos.every(p => !/tu liga ya está/i.test(p.texto))));
check('Scouting aclara que el cruce de ejemplo se arma solo',
  /Armamos un cruce de ejemplo/.test(JSON.stringify(TOUR.RECORRIDOS.scouting)));

const pasosDe = (sec) => TOUR.RECORRIDOS[sec].pasos.map(p => p.titulo + ' ' + p.texto).join(' | ');
check('Jugadores guía las cuatro secciones del plantel que faltaban',
  /TOP 3 del plantel/.test(pasosDe('jugadores')) && /Tu plantel, jugador por jugador/.test(pasosDe('jugadores'))
  && /El ranking del plantel/.test(pasosDe('jugadores')) && /Pack PLANTEL/.test(pasosDe('jugadores')));
check('y el TOP 3 está plegado: el paso lo dice',
  /plegado/.test(pasosDe('jugadores')));
check('hay una parada para la campanita, con lo que dice el documento',
  /La campanita: alertas de plantel/.test(pasosDe('principal'))
  && /dejaron o volvieron a jugar/.test(pasosDe('principal')));
check('la campanita también se explica con «explicar al tocar»',
  /#buzonSlot/.test(tourSrc) && /closest\('#buzonSlot'\)/.test(tourSrc));
check('hay recorrido del Fixture, que es un recurso importante',
  secciones.indexOf('fixture') !== -1 && TOUR.RECORRIDOS.fixture.pasos.length >= 2);
check('el Fixture tiene su sección en la landing (para el menú y las cards)',
  LAN.SECCIONES.fixture && LAN.SECCIONES.fixture.titulo === 'Fixture');
check('al terminar Scouting —el momento «aha»— se ofrece ver el informe con los datos propios',
  /est\.seccion === 'scouting'/.test(tourSrc) && /data-tour="whatsapp"/.test(tourSrc)
  && /abrirModal\(\)/.test(tourSrc));
check('y en las otras secciones la guía no vende nada',
  /cierreComercial = est\.seccion === 'scouting'/.test(tourSrc));
check('un paso cuyo objetivo no está se saltea en el acto, sin esperar',
  /const intentos = paso\.antes \? 8 : 2/.test(tourSrc));

/* El motor puro. */
check('normalizar saca acentos, mayúsculas y signos',
  TOUR.normalizar('Líderes · Promedios') === 'lideres promedios' && TOUR.normalizar(null) === '');

const todos = () => true;
const faltan = (set) => (i) => !set.has(i);
check('vecino avanza al siguiente paso', TOUR.vecino(5, 1, 1, todos) === 2);
check('vecino retrocede', TOUR.vecino(5, 3, -1, todos) === 2);
check('vecino SALTA los pasos cuyo objetivo no está en pantalla',
  TOUR.vecino(5, 0, 1, faltan(new Set([1, 2]))) === 3);
check('y también hacia atrás',
  TOUR.vecino(5, 4, -1, faltan(new Set([3, 2]))) === 1);
check('al final del recorrido devuelve -1', TOUR.vecino(3, 2, 1, todos) === -1);
check('y al principio también', TOUR.vecino(3, 0, -1, todos) === -1);
check('si no queda ningún paso visible adelante, devuelve -1',
  TOUR.vecino(4, 1, 1, faltan(new Set([2, 3]))) === -1);
check('visibles cuenta solo lo que está',
  TOUR.visibles(5, faltan(new Set([1, 4]))) === 3);
check('posicion cuenta entre los visibles',
  TOUR.posicion(5, 3, faltan(new Set([1]))) === 3);

/* Ubicar la tarjeta: abajo si entra, arriba si no, adentro de la pantalla. */
const vista = { w: 1200, h: 800 };
const tarjeta = { w: 340, h: 170 };
const abajo = TOUR.ubicar({ top: 100, left: 200, width: 400, height: 120 }, tarjeta, vista);
check('la tarjeta va ABAJO del objetivo si entra', abajo.top === 100 + 120 + 12, JSON.stringify(abajo));
const arriba = TOUR.ubicar({ top: 640, left: 200, width: 400, height: 120 }, tarjeta, vista);
check('y ARRIBA si abajo no hay lugar', arriba.top === 640 - 170 - 12, JSON.stringify(arriba));
const borde = TOUR.ubicar({ top: 100, left: 1100, width: 300, height: 100 }, tarjeta, vista);
check('nunca se sale por la derecha', borde.left + tarjeta.w <= vista.w, JSON.stringify(borde));
const izq = TOUR.ubicar({ top: 100, left: -80, width: 100, height: 100 }, tarjeta, vista);
check('ni por la izquierda', izq.left >= 0, JSON.stringify(izq));
const alto = TOUR.ubicar({ top: 20, left: 100, width: 300, height: 760 }, tarjeta, vista);
check('con un objetivo más alto que la pantalla se queda adentro',
  alto.top >= 0 && alto.top + tarjeta.h <= vista.h, JSON.stringify(alto));

/* Preferencias: un storage roto no tumba nada. */
check('sin storage devuelve los valores por defecto',
  JSON.stringify(TOUR.leerPrefs(null)) === JSON.stringify({ ofrecer: true, vistos: {} }));
check('un JSON roto en el storage tampoco rompe',
  JSON.stringify(TOUR.leerPrefs({ getItem: () => '{no es json' })) === JSON.stringify({ ofrecer: true, vistos: {} }));
check('lee lo guardado',
  (() => {
    const p = TOUR.leerPrefs({ getItem: () => JSON.stringify({ ofrecer: false, vistos: { equipos: true } }) });
    return p.ofrecer === false && p.vistos.equipos === true;
  })());
check('un storage que LANZA al leer cae a los valores por defecto',
  TOUR.leerPrefs({ getItem: () => { throw new Error('bloqueado'); } }).ofrecer === true);

console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
  '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exitCode = fail === 0 ? 0 : 1;
