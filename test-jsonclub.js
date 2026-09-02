/* =====================================================================
   SGADD · TESTS DE INTEGRIDAD DEL JSON DE CLUB

   El 2026-09-01 `clubes/reconquista.json` quedó sin la coma entre
   `competencia` y `planillas`. El archivo entero dejó de parsear y la app
   se fue a los valores por defecto: el club estuvo viendo la marca, los
   colores y las zonas de OTRO club, y nada en pantalla decía que su
   configuración estaba rota. Ese es el peor modo de fallar que tiene este
   proyecto — no se cae, miente.

   Estos tests cubren las cuatro cosas que lo habrían evitado:

   1. TODOS los `clubes/*.json` parsean. Es el test que faltaba, y es de
      los baratos: un archivo de config roto no puede llegar a `main`.
   2. Lo que la pantalla exporta sale ya validado y COMPLETO — el archivo
      entero, no un fragmento al que hay que acertarle la coma.
   3. Editar una categoría no le toca las zonas a las hermanas, en el
      cliente Y en el servidor.
   4. El flujo de publicar de punta a punta entrega lo que el admin editó
      (y no `undefined`, que es lo que mandaba y BORRABA las zonas).

   Todo se EJERCE, no se lee del fuente: cuando el defecto es qué se
   ejecuta, un grep no lo caza nunca. Es el mismo aprendizaje que dejaron
   la pestaña de Torneo (punto 18) y el tramo por defecto (punto 3 ter).
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CONFIG = require('./js/sgadd-config.js');
const MUTAR = require('./server/lib/catalogo-mutar.js');

let pasados = 0, fallados = 0;
function ok(cond, nombre, detalle) {
  if (cond) { pasados++; return; }
  fallados++;
  console.log('  ✗ ' + nombre + (detalle ? '  →  ' + detalle : ''));
}
function igual(a, b, nombre) {
  ok(JSON.stringify(a) === JSON.stringify(b), nombre,
     'esperaba ' + JSON.stringify(b) + ' y dio ' + JSON.stringify(a));
}
function bloque(t) { console.log('\n' + t); }

const clonar = (o) => JSON.parse(JSON.stringify(o));

/* =====================================================================
   1 · TODOS LOS JSON DE CLUB PARSEAN
   ===================================================================== */
bloque('1 · Integridad de clubes/*.json');

const dir = path.join(__dirname, 'clubes');
const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

ok(archivos.length >= 3, 'hay al menos los tres clubes conocidos',
   'encontrados: ' + archivos.length);

const clubes = {};
archivos.forEach(f => {
  const ruta = path.join(dir, f);
  const crudo = fs.readFileSync(ruta, 'utf8');
  let obj = null, err = null;
  try { obj = JSON.parse(crudo); } catch (e) { err = e.message; }
  ok(obj !== null, 'clubes/' + f + ' parsea', err);
  if (!obj) return;
  clubes[f] = obj;

  /* Un JSON puede parsear y aun así no servir: si la app no encuentra el
     catálogo se cae a los defaults, que es exactamente el síntoma que
     hubo que diagnosticar a mano. */
  ok(Array.isArray(obj.planillas) && obj.planillas.length > 0,
     'clubes/' + f + ' declara planillas');
  ok(typeof obj.id === 'string' && obj.id,
     'clubes/' + f + ' declara su id');

  /* El BOM rompe `JSON.parse` en algunos runtimes y es invisible al ojo:
     un archivo editado por la web de GitHub puede traerlo. */
  ok(crudo.charCodeAt(0) !== 0xFEFF, 'clubes/' + f + ' no arranca con BOM');
});

/* El bloque de competencia, donde exista, tiene que ser algo que el motor
   sepa leer. Un `competencia` que parsea pero no produce formatos deja la
   tabla sin colores sin decir por qué. */
Object.keys(clubes).forEach(f => {
  const c = clubes[f];
  if (!c.competencia) return;
  const cfg = CONFIG.parsear(c);
  ok(cfg !== null, 'clubes/' + f + ' · el motor puede parsear su competencia');
  if (!cfg) return;
  ok(Object.keys(cfg.formatos).length > 0 || Object.keys(cfg.porCategoria || {}).length > 0,
     'clubes/' + f + ' · declara al menos un formato');
});

/* El archivo que rompió, con nombre y apellido: es la regresión concreta
   y tiene que fallar fuerte si alguien vuelve a pegar el bloque a mano. */
const rec = clubes['reconquista.json'];
ok(!!rec, 'reconquista.json existe y parsea');
if (rec) {
  igual(rec.planillas.length, 3, 'reconquista declara sus tres categorías');
  ok(!!rec.competencia, 'reconquista conserva su bloque de competencia');
  const cfg = CONFIG.parsear(rec);
  ok(!!cfg && !!cfg.formatos.regular, 'reconquista declara el formato «regular»');
  if (cfg && cfg.formatos.regular) {
    igual(cfg.formatos.regular.equiposEsperados, 12, 'reconquista espera 12 equipos');
    igual(cfg.formatos.regular.zonas.length, 3, 'reconquista declara sus tres zonas');
  }
}

/* =====================================================================
   2 · EL VALIDADOR ESTRICTO
   ===================================================================== */
bloque('2 · La guarda: nada sale sin sobrevivir a JSON.parse()');

igual(CONFIG.serializar({ a: 1 }).ok, true, 'un objeto sano se serializa');
ok(CONFIG.serializar({ a: 1 }).texto.indexOf('\n') > -1,
   'sale indentado con null, 2 (legible en un diff)');

/* `JSON.stringify(undefined)` devuelve undefined, no un string. Es el
   caso exacto que rompió publicar, así que tiene que dar un error que se
   entienda y no una excepción. */
const vacio = CONFIG.serializar(undefined);
igual(vacio.ok, false, 'undefined no pasa la guarda');
ok(/vac[íi]o|undefined/i.test(vacio.error), 'y lo dice con esas palabras', vacio.error);
igual(vacio.texto, null, 'y no devuelve texto que alguien pueda copiar');

const circ = {}; circ.yo = circ;
const rc = CONFIG.serializar(circ);
igual(rc.ok, false, 'una referencia circular no pasa la guarda');
ok(typeof rc.error === 'string' && rc.error.length > 10, 'con un motivo legible');

/* Nunca lanza: una pantalla de configuración que revienta al copiar es
   peor que una que dice que no puede. */
let lanzo = false;
try { CONFIG.serializar(circ); CONFIG.serializar(undefined); CONFIG.serializar(function () {}); }
catch (e) { lanzo = true; }
igual(lanzo, false, 'la guarda nunca lanza, devuelve el error');

/* =====================================================================
   3 · EL EXPORT ES EL ARCHIVO ENTERO
   ===================================================================== */
bloque('3 · exportarArchivo: sin coma que acertar');

if (rec) {
  const cfg = CONFIG.parsear(rec);
  const bloq = JSON.parse(CONFIG.exportar(cfg));
  const arch = CONFIG.exportarArchivo(rec, bloq);

  igual(arch.ok, true, 'exporta el archivo del club');
  let re = null, err = null;
  try { re = JSON.parse(arch.texto); } catch (e) { err = e.message; }
  ok(re !== null, 'y lo exportado parsea', err);

  if (re) {
    /* La propiedad que importa: es reemplazable tal cual. Si al pegarlo
       se perdiera una planilla o el escudo, el remedio sería peor que la
       enfermedad. */
    igual(Object.keys(re).length, Object.keys(rec).length,
          'conserva TODAS las claves del archivo original');
    igual(re.planillas.length, rec.planillas.length, 'conserva las planillas');
    igual(re.id, rec.id, 'conserva el id del club');
    igual(re.competencia.formatos.regular.equiposEsperados, 12,
          'y trae el bloque de competencia editado');

    /* El orden de claves se conserva para que el diff de git muestre el
       cambio real y no treinta líneas movidas. */
    igual(Object.keys(re), Object.keys(rec), 'conserva el ORDEN de las claves');
  }

  /* Sin JSON del club no se puede armar el archivo, y hay que decirlo en
     vez de devolver medio archivo. */
  igual(CONFIG.exportarArchivo(null, bloq).ok, false, 'sin JSON del club, no exporta');
  ok(/no se pudo leer/i.test(CONFIG.exportarArchivo(null, bloq).error),
     'y explica por qué');
  igual(CONFIG.exportarArchivo([], bloq).ok, false, 'un array tampoco es un club');

  /* Un club que todavía no tiene bloque: se agrega, no se pierde nada. */
  const sinBloque = clonar(rec); delete sinBloque.competencia;
  const a2 = CONFIG.exportarArchivo(sinBloque, bloq);
  igual(a2.ok, true, 'un club sin bloque previo también exporta');
  ok(JSON.parse(a2.texto).competencia, 'y le queda el bloque puesto');
  igual(JSON.parse(a2.texto).planillas.length, 3, 'sin perder sus planillas');
}

/* =====================================================================
   4 · AISLAMIENTO POR CATEGORÍA · el motor
   ===================================================================== */
bloque('4 · fusionarCategoria: una categoría no pisa a las otras');

const BASE = {
  formatos: { club: { id: 'club', label: 'Del club', zonas: [] } },
  porTramo: { '*': 'club' },
  porCategoria: {
    u21: { formatos: { a: { id: 'a', label: 'U21', zonas: [] } }, porTramo: { '*': 'a' } },
    u23: { formatos: { b: { id: 'b', label: 'U23', zonas: [] } }, porTramo: { '*': 'b' } },
  },
};

const f1 = CONFIG.fusionarCategoria(BASE, 'u21',
  { formatos: { z: { id: 'z', label: 'NUEVO', zonas: [] } }, porTramo: { '*': 'z' } });
igual(Object.keys(f1.porCategoria.u21.formatos), ['z'], 'la categoría editada cambia');
igual(f1.porCategoria.u23.formatos.b.label, 'U23', 'la HERMANA queda intacta');
igual(f1.formatos.club.label, 'Del club', 'el bloque del club queda intacto');

const f2 = CONFIG.fusionarCategoria(BASE, null,
  { formatos: { y: { id: 'y', label: 'OTRO', zonas: [] } }, porTramo: { '*': 'y' } });
igual(Object.keys(f2.formatos), ['y'], 'editar el club cambia el nivel del club');
igual(Object.keys(f2.porCategoria).sort(), ['u21', 'u23'],
      'y CONSERVA las categorías: editar un nivel no decide sobre el otro');

const f3 = CONFIG.fusionarCategoria(BASE, 'u21', null);
igual(Object.keys(f3.porCategoria), ['u23'], 'vaciar una categoría la devuelve al club');

/* La recursión es de un nivel: una categoría no lleva su propio mapa. */
const f4 = CONFIG.fusionarCategoria(BASE, 'u21',
  { formatos: { z: { id: 'z' } }, porTramo: {}, porCategoria: { colado: {} } });
igual(f4.porCategoria.u21.porCategoria, undefined,
      'no se anida un porCategoria adentro de una categoría');

/* No muta la entrada: el borrador de la pantalla no puede cambiar debajo. */
CONFIG.fusionarCategoria(BASE, 'u21', { formatos: { q: { id: 'q' } } });
igual(Object.keys(BASE.porCategoria.u21.formatos), ['a'], 'no muta el bloque de entrada');

/* Y lo que resuelve la app tiene que ser el bloque de SU categoría. */
const conCat = { id: 'x', competencia: BASE };
const p = CONFIG.parsear(conCat);
ok(!!p.porCategoria.u21, 'el parser conserva porCategoria');
igual(Object.keys(p.porCategoria.u21.formatos), ['a'], 'con el formato de esa categoría');

/* =====================================================================
   5 · AISLAMIENTO POR CATEGORÍA · el servidor
   ===================================================================== */
bloque('5 · El servidor escribe UN slot, no el bloque entero');

const CAT = () => ({ rec: { nombre: 'Reconquista', competencia: clonar(BASE) } });

let r = MUTAR.aplicar(CAT(), 'zonas', {
  club: 'rec', categoria: 'u21',
  competencia: { formatos: { z: { id: 'z', label: 'NUEVO' } }, porTramo: { '*': 'z' } },
});
igual(r.ok, true, 'publicar una categoría sale bien');
igual(Object.keys(r.catalogo.rec.competencia.porCategoria.u21.formatos), ['z'],
      'la categoría publicada cambia');
igual(r.catalogo.rec.competencia.porCategoria.u23.formatos.b.label, 'U23',
      'la HERMANA queda intacta en el servidor');
igual(r.catalogo.rec.competencia.formatos.club.label, 'Del club',
      'y el bloque del club también');

/* La garantía del servidor: aunque una pantalla vieja mandara el bloque
   de una categoría como si fuera el del club, con `categoria` no puede
   pisar a las otras. */
r = MUTAR.aplicar(CAT(), 'zonas', {
  club: 'rec', categoria: 'u21',
  competencia: { formatos: { z: { id: 'z' } }, porCategoria: { u23: { formatos: {} } } },
});
igual(r.catalogo.rec.competencia.porCategoria.u23.formatos.b.label, 'U23',
      'un porCategoria colado en el pedido no pisa a la hermana');

r = MUTAR.aplicar(CAT(), 'zonas', {
  club: 'rec',
  competencia: { formatos: { y: { id: 'y' } }, porTramo: { '*': 'y' } },
});
igual(Object.keys(r.catalogo.rec.competencia.porCategoria).sort(), ['u21', 'u23'],
      'publicar el nivel del club conserva las categorías');

r = MUTAR.aplicar(CAT(), 'zonas', { club: 'rec', categoria: 'u21', competencia: null });
igual(Object.keys(r.catalogo.rec.competencia.porCategoria), ['u23'],
      'vaciar una categoría en el servidor la devuelve al club');
igual(r.catalogo.rec.competencia.formatos.club.label, 'Del club',
      'sin tocar el bloque del club');

/* Un bloque de categoría sin formatos no se acepta: publicarlo se leería
   como «se rompió», no como «lo vacié». Para vaciar está la rama de
   arriba, que es explícita. */
r = MUTAR.aplicar(CAT(), 'zonas', { club: 'rec', categoria: 'u21', competencia: { formatos: {} } });
igual(r.ok, false, 'una categoría sin formatos se rechaza');

r = MUTAR.aplicar({ rec: { nombre: 'R' } }, 'zonas',
  { club: 'rec', categoria: 'u21', competencia: { formatos: { z: { id: 'z' } } } });
igual(r.ok, false, 'sin bloque del club no se puede colgar una categoría');

/* =====================================================================
   6 · EL FLUJO DE PUBLICAR, DE PUNTA A PUNTA

   Se ejerce la pantalla de verdad en un `vm`: el defecto que se corrige
   acá —publicar mandaba `undefined` y BORRABA las zonas— vivía en una
   línea que leía `.competencia` de un objeto que no tiene esa clave. Un
   grep no lo habría cazado nunca: la línea se leía perfecta.
   ===================================================================== */
bloque('6 · Publicar de punta a punta');

function pantalla(jsonClub, planillaId) {
  const enviado = [];
  const avisos = [];
  const ctx = {
    console: console,
    JSON: JSON,
    Object: Object,
    Array: Array,
    document: { getElementById: () => null },
    localStorage: {
      _d: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; },
    },
    navigator: {},
    SGADD_UI: { esc: (x) => String(x) },
    SGADD: { CATALOGO: { planillas: (jsonClub.planillas || []).map(p => ({ id: p.id, label: p.label })) } },
    SGADD_APP: { estado: { planillaId: planillaId }, reindexar() {} },
    CLUB: { cfg: jsonClub, estado: { id: jsonClub.id } },
    SGADD_DATA: {
      apiConfigurada: () => true,
      guardarCatalogo(d) { enviado.push(clonar(d)); return Promise.resolve({ clubes: [] }); },
    },
    SGADD_AUTH: { rol: () => 'ADMIN' },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  /* EL MOTOR SE CARGA DENTRO DEL CONTEXTO, no se inyecta el `require` de
     Node. Un módulo requerido tiene su propio ámbito y ahí `SGADD_APP` y
     `CLUB` no existen, así que `categoriaActiva()` y `clubActivo()`
     devolverían null y 'default' — y el test estaría midiendo otra cosa
     que la que corre en el navegador.

     Funciona porque los `const` de nivel superior van al ámbito léxico
     GLOBAL del realm, que es compartido entre scripts del mismo contexto
     — igual que dos <script> de la página. */
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/sgadd-config.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/sgadd-configui.js'), 'utf8'), ctx);
  /* `const CONFIGUI` vive en el ámbito léxico, no en el objeto del
     contexto: hay que pedirlo por su nombre. Las `function` sí quedan
     colgadas del global, por eso los espías de abajo sí se pueden pisar. */
  ctx.CONFIGUI = vm.runInContext('CONFIGUI', ctx);
  ctx.configPintar = () => {};
  ctx.configPintarPreview = () => {};
  /* `configAvisar` escribe en el DOM, que acá no existe: se reemplaza por
     un espía para poder leer lo que la pantalla le diría al admin. */
  ctx.configAvisar = (txt, ok2) => { avisos.push({ txt: txt, ok: ok2 }); };
  return { ctx: ctx, enviado: enviado, avisos: avisos };
}

if (rec) {
  const P = pantalla(rec, rec.planillas[0].id);
  P.ctx.configCargarBorrador(true);

  ok(!!P.ctx.CONFIGUI.borrador, 'la pantalla carga el borrador del club');
  igual(P.ctx.CONFIGUI.categoria, rec.planillas[0].id,
        'y sabe qué categoría está abierta');
  igual(P.ctx.CONFIGUI.propia, false,
        'que hoy hereda del club: reconquista no declara porCategoria');

  /* EL BUG. Antes esto mandaba `competencia: undefined`, el servidor lo
     entendía como «vaciar» y publicar BORRABA las zonas — contestando
     `ok: true`, además. */
  const g = P.ctx.configBloqueAGrabar();
  igual(g.ok, true, 'el bloque a grabar se arma bien');
  ok(g.bloque && typeof g.bloque === 'object', 'y es un objeto, no undefined');
  ok(!!(g.bloque.formatos && g.bloque.formatos.regular),
     'con los formatos que el admin está viendo');
  igual(g.bloque.formatos.regular.equiposEsperados, 12,
        'y con los valores editados, no con otros');

  P.ctx.configPublicar();
  igual(P.enviado.length, 1, 'publicar manda un pedido');
  const d = P.enviado[0];
  igual(d.accion, 'zonas', 'con la acción correcta');
  igual(d.club, rec.id, 'y el club correcto');
  ok(d.competencia && typeof d.competencia === 'object',
     'LA REGRESIÓN: la competencia viaja, no va undefined');
  ok(!!(d.competencia.formatos && d.competencia.formatos.regular),
     'y trae los formatos');

  /* Y lo que llega tiene que producir el efecto correcto en el catálogo:
     publicar, no borrar. */
  const cat0 = { [rec.id]: { nombre: 'Reconquista' } };
  const res = MUTAR.aplicar(cat0, 'zonas', d);
  igual(res.ok, true, 'el servidor lo acepta');
  igual(!!res.borrado, false, 'y NO lo interpreta como un borrado');
  igual(res.catalogo[rec.id].competencia.formatos.regular.equiposEsperados, 12,
        'el catálogo queda con lo que el admin publicó');

  /* Lo que el cliente lee después de publicar tiene que ser eso mismo. */
  const cfgPub = CONFIG.parsear({ competencia: res.catalogo[rec.id].competencia });
  igual(cfgPub.formatos.regular.zonas.length, 3,
        'y el cliente resuelve sus tres zonas desde lo publicado');
}

/* --- el mismo flujo, con la categoría separada --- */
if (rec) {
  const P = pantalla(rec, rec.planillas[1].id);
  P.ctx.configCargarBorrador(true);
  P.ctx.configAlcancePropio(true);
  igual(P.ctx.CONFIGUI.propia, true, 'la categoría se puede separar');

  P.ctx.configPublicar();
  const d = P.enviado[0];
  igual(d.categoria, rec.planillas[1].id,
        'y publicar manda la categoría, para que el servidor escriba un solo slot');
  ok(d.competencia && d.competencia.formatos,
     'con el bloque de esa categoría');

  /* El efecto en el catálogo: solo su slot. */
  const cat0 = { [rec.id]: { nombre: 'R', competencia: clonar(BASE) } };
  const res = MUTAR.aplicar(cat0, 'zonas', d);
  igual(res.ok, true, 'el servidor lo acepta');
  igual(res.catalogo[rec.id].competencia.porCategoria.u23.formatos.b.label, 'U23',
        'y las categorías ajenas siguen intactas tras publicar la propia');
  igual(res.catalogo[rec.id].competencia.formatos.club.label, 'Del club',
        'igual que el bloque del club');
}

/* --- guardar en el navegador tampoco puede pisar a las hermanas --- */
if (rec) {
  const conCats = clonar(rec);
  conCats.competencia = clonar(BASE);
  const P = pantalla(conCats, conCats.planillas[0].id);
  P.ctx.configCargarBorrador(true);
  P.ctx.configAlcancePropio(true);
  P.ctx.configGuardar();

  const guardado = JSON.parse(P.ctx.localStorage.getItem(CONFIG.claveAlmacen(conCats.id)));
  ok(!!guardado, 'guardar escribe el override');
  igual(guardado.porCategoria.u23.formatos.b.label, 'U23',
        'y las hermanas sobreviven al guardado local');
  igual(guardado.formatos.club.label, 'Del club',
        'igual que el bloque del club');
}

/* --- el export, desde la pantalla --- */
if (rec) {
  const P = pantalla(rec, rec.planillas[0].id);
  P.ctx.configCargarBorrador(true);
  const t = P.ctx.configTextoExport();
  igual(t.ok, true, 'la pantalla puede exportar');
  let re = null, err = null;
  try { re = JSON.parse(t.texto); } catch (e) { err = e.message; }
  ok(re !== null, 'y lo que ofrece copiar parsea', err);
  if (re) {
    igual(re.planillas.length, 3, 'es el archivo entero, con sus planillas');
    ok(!!re.competencia, 'y con el bloque adentro');
  }
  /* Es el archivo, no el fragmento: no puede empezar por la clave suelta,
     que es lo que obligaba a empalmar a mano. */
  ok(t.texto.trim().charAt(0) === '{', 'arranca como un archivo, no como un fragmento');
  ok(t.texto.indexOf('"planillas"') > -1, 'e incluye las planillas');
}

/* =====================================================================
   7 · LA PANTALLA NO OFRECE COPIAR UN JSON ROTO
   ===================================================================== */
bloque('7 · Si no parsea, no se copia ni se publica');

if (rec) {
  const P = pantalla(rec, rec.planillas[0].id);
  P.ctx.configCargarBorrador(true);

  /* Se rompe el borrador a propósito: un valor que `JSON.stringify` no
     puede serializar. La pantalla tiene que negarse, no copiar basura. */
  P.ctx.CONFIGUI.borrador = null;

  const t = P.ctx.configTextoExport();
  igual(t.ok, false, 'sin borrador no exporta');

  P.ctx.configExportarToggle();
  igual(P.ctx.CONFIGUI.exportando, false, 'y no abre el panel de copiado');
  ok(P.avisos.length > 0 && P.avisos[0].ok === false, 'avisa que no exportó nada');

  const antes = P.enviado.length;
  P.ctx.configPublicar();
  igual(P.enviado.length, antes, 'y publicar tampoco manda nada');
}

/* =====================================================================
   RESUMEN
   ===================================================================== */
console.log('\n' + '─'.repeat(60));
if (fallados === 0) {
  console.log('✓ TODO OK · ' + pasados + ' tests');
} else {
  console.log('✗ ' + fallados + ' FALLARON de ' + (pasados + fallados));
  process.exitCode = 1;
}
