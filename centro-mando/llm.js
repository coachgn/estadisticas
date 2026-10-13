/* =====================================================================
   centro-mando/llm.js · los agentes con Claude

   Dos trabajos, y solo dos:

     1. INTERPRETAR una pregunta táctica → un PEDIDO del Explorador
        (nivel, métricas, orden, condiciones). El modelo no ve un solo
        dato del libro y no devuelve ninguno: devuelve la consulta, que
        corre el Explorador local.
     2. REDACTAR una propuesta en un tono → ganchos, título y guion.

   LA GUARDA · 0 % DE NÚMEROS INVENTADOS

     · El modelo NUNCA es la fuente de un número. Todo número que escriba
       tiene que estar, tal cual, en la propuesta que recibió. Lo verifica
       `numerosAjenos` DESPUÉS de cada respuesta: el gancho que trae un
       número que no está se descarta, y el título o el guion vuelven a
       los del generador. No se confía en que el prompt alcance.
     · El DATO de la pieza no se reescribe nunca: es la oración que armó
       la receta con los números del libro.
     · Una propuesta anónima se le manda ANÓNIMA: el modelo no puede
       filtrar un nombre que no recibió. El servidor igual verifica la
       respuesta contra los nombres del libro.

   La credencial sale del entorno (`ANTHROPIC_API_KEY`, que el servidor
   carga de `centro-mando/.env`). Sin ella, este módulo se declara
   apagado y el Centro de Mando sigue andando con las plantillas.
   ===================================================================== */
'use strict';

/* Sin `npm install` en centro-mando/ no hay SDK: el módulo se declara
   apagado en vez de tumbar el servidor, que sin IA funciona igual. */
let z = null, SIN_DEPENDENCIAS = null;
try { z = require('zod').z; require.resolve('@anthropic-ai/sdk'); }
catch (e) { z = null; SIN_DEPENDENCIAS = 'Faltan las dependencias de la IA: corré «npm install» adentro de centro-mando/.'; }

const MODELO = process.env.CENTRO_MANDO_MODELO || 'claude-opus-5-5';
const ESTILOS = ['dato', 'titular', 'pregunta'];

const TONOS = {
  tactico: 'TÁCTICO: le hablás a un cuerpo técnico. Preciso, sobrio, vocabulario de cancha. El número adelante y la consecuencia para el plan de partido.',
  polemico: 'POLÉMICO: discutís una creencia instalada del ambiente. Frontal y contraintuitivo, pero sostenido por el dato; nunca contra una persona ni un club.',
  educativo: 'EDUCATIVO: le explicás el concepto a alguien que recién empieza a mirar estadística. Claro, paso a paso, sin jerga sin explicar.',
};

/* -------------------------------------------------------------------- */
function disponible() { return !SIN_DEPENDENCIAS && !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN); }
/** Por qué está apagada, para decirlo en pantalla. null si está activa. */
function motivoApagada() {
  if (SIN_DEPENDENCIAS) return SIN_DEPENDENCIAS;
  return disponible() ? null : 'Falta ANTHROPIC_API_KEY en centro-mando/.env (hay un .env.ejemplo al lado).';
}

let _cliente = null;
function clientePorDefecto() {
  if (!_cliente) {
    const { Anthropic } = require('@anthropic-ai/sdk');
    _cliente = new Anthropic();
  }
  return _cliente;
}

/** El error del SDK, dicho para quien opera la pantalla. */
function explicar(e) {
  let A = null;
  try { A = require('@anthropic-ai/sdk').Anthropic; } catch (x) { /* sin SDK instalado */ }
  if (A) {
    if (e instanceof A.AuthenticationError) return 'La clave de la API de Claude no es válida: revisá ANTHROPIC_API_KEY en centro-mando/.env.';
    if (e instanceof A.PermissionDeniedError) return 'La clave no tiene permiso para usar ' + MODELO + '.';
    if (e instanceof A.NotFoundError) return 'El modelo ' + MODELO + ' no está disponible para esta cuenta.';
    if (e instanceof A.RateLimitError) return 'La API de Claude pidió esperar (límite de uso). Probá de nuevo en un momento.';
    if (e instanceof A.APIConnectionError) return 'No se pudo conectar con la API de Claude: revisá la conexión.';
    if (e instanceof A.APIError) return 'La API de Claude contestó un error (' + (e.status || 's/d') + '): ' + e.message;
  }
  return e && e.message ? e.message : String(e);
}

/** Una llamada con salida estructurada. Devuelve el objeto ya validado contra el esquema. */
async function pedir(cliente, esquema, sistema, usuario, esfuerzo) {
  if (SIN_DEPENDENCIAS) throw new Error(SIN_DEPENDENCIAS);
  const { betaZodOutputFormat } = require('@anthropic-ai/sdk/helpers/beta/zod');
  let r;
  try {
    r = await cliente.beta.messages.parse({
      model: MODELO,
      max_tokens: 16000,
      /* Si el modelo declina por política, la API reintenta sola en el de respaldo. */
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: sistema,
      messages: [{ role: 'user', content: usuario }],
      output_config: { effort: esfuerzo, format: betaZodOutputFormat(esquema) },
    });
  } catch (e) { throw new Error(explicar(e)); }
  if (r.stop_reason === 'refusal') throw new Error('El modelo declinó el pedido' + (r.stop_details && r.stop_details.explanation ? ': ' + r.stop_details.explanation : '.'));
  if (r.stop_reason === 'max_tokens') throw new Error('La respuesta del modelo se cortó por largo.');
  if (!r.parsed_output) throw new Error('El modelo no devolvió una respuesta con la forma pedida.');
  return { salida: r.parsed_output, uso: r.usage ? { entrada: r.usage.input_tokens, salida: r.usage.output_tokens } : null, modelo: r.model || MODELO };
}

/* --------------------------------------------------------------------
   LA GUARDA NUMÉRICA · pura
   -------------------------------------------------------------------- */
const NUMERO = /\d+(?:[.,]\d+)?/g;
const canon = (n) => String(n).replace(',', '.').replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

/** Los números de `fuente` (cualquier valor: se serializa), en forma canónica. */
function numerosDe(fuente) {
  const t = typeof fuente === 'string' ? fuente : JSON.stringify(fuente == null ? '' : fuente);
  return new Set((t.match(NUMERO) || []).map(canon));
}

/** Los números de `texto` que NO están en la fuente. Vacío = el texto es fiel. */
function numerosAjenos(texto, permitidos) {
  const set = permitidos instanceof Set ? permitidos : numerosDe(permitidos);
  return (String(texto || '').match(NUMERO) || []).filter((n, i, a) => !set.has(canon(n)) && a.indexOf(n) === i);
}

/* --------------------------------------------------------------------
   1 · INTERPRETAR LA PREGUNTA
   -------------------------------------------------------------------- */
const EsquemaConsulta = z && z.object({
  sePuede: z.boolean().describe('false si la pregunta pide algo que las métricas del catálogo no pueden contestar'),
  motivo: z.string().describe('si sePuede es false, qué falta, en una oración; si es true, cadena vacía'),
  nivel: z.enum(['jugadores', 'equipos', 'zonas', 'partidos']),
  metricas: z.array(z.string()).describe('ids de métricas del catálogo de ESE nivel, las que conviene mostrar'),
  orden: z.string().describe('id de la métrica por la que se ordena'),
  sentido: z.enum(['mejor', 'desc', 'asc']).describe('«mejor» deja que el sistema ponga primero al mejor según la métrica'),
  top: z.number().int().describe('cuántas filas, entre 1 y 50'),
  soloCalificados: z.boolean().describe('solo para jugadores: exigir el umbral de minutos de la liga. false si la pregunta habla de jugadores de pocos minutos'),
  condiciones: z.array(z.object({
    metrica: z.string(), op: z.enum(['<', '<=', '>', '>=']),
    valor: z.number().describe('los porcentajes se escriben como 35, no como 0.35'),
  })),
  lectura: z.string().describe('una oración en castellano rioplatense que dice cómo entendiste la pregunta'),
});

function sistemaConsulta(catalogo) {
  const lista = (n) => catalogo.metricas[n].map((m) => m.id + ' = ' + m.nombre + (m.pct ? ' (porcentaje)' : '') + (m.invertida ? ' (menos es mejor)' : '')).join('\n');
  return [
    'Traducís preguntas de básquet a una consulta de un explorador de estadísticas. NO contestás la pregunta ni das números: solo armás la consulta. Los datos los lee después otro sistema.',
    '',
    'NIVELES',
    '- jugadores: promedios de temporada de cada jugador.',
    '- equipos: promedios de temporada de cada equipo.',
    '- partidos: un equipo en una noche.',
    '- zonas: compara la mediana de los equipos de cada zona; no admite condiciones.',
    '',
    'MÉTRICAS DE JUGADORES\n' + lista('jugadores'),
    '',
    'MÉTRICAS DE EQUIPOS Y DE ZONAS\n' + lista('equipos'),
    '',
    'MÉTRICAS DE PARTIDOS\n' + lista('partidos'),
    '',
    'NO EXISTEN EN NINGÚN LIBRO: ' + catalogo.noDisponibles.join('; ') + '. Tampoco hay altura, edad, posición ni datos por cuarto.',
    '',
    'REGLAS',
    '- Usá solo ids del catálogo del nivel elegido, escritos exactamente igual.',
    '- Los porcentajes van como 35, no 0.35. Los minutos, puntos e intentos son promedios por partido.',
    '- Si la pregunta ordena o filtra por un porcentaje de tiro, agregá una condición de volumen mínimo razonable sobre sus intentos (T3I, T2I, T1I) solo si la pregunta lo sugiere («que tiren seguido», «con volumen»); si no, no la inventes.',
    '- «Con pocos minutos», «suplentes», «de rotación corta»: condición sobre MIN y soloCalificados en false.',
    '- Si la pregunta pide algo que no existe en el catálogo, sePuede es false y explicás qué falta. No lo aproximes con otra métrica sin decirlo.',
    '- top: 10 si la pregunta no dice cuántos.',
  ].join('\n');
}

async function interpretar(pregunta, catalogo, deps) {
  const q = String(pregunta || '').trim();
  if (q.length < 8) throw new Error('Escribí la pregunta completa.');
  const r = await pedir((deps && deps.cliente) || clientePorDefecto(), EsquemaConsulta, sistemaConsulta(catalogo), q, 'low');
  return { consulta: r.salida, uso: r.uso, modelo: r.modelo };
}

/* --------------------------------------------------------------------
   2 · REDACTAR UNA PROPUESTA EN UN TONO
   -------------------------------------------------------------------- */
const EsquemaRedaccion = z && z.object({
  titulo: z.string().describe('título de la pieza, hasta 70 caracteres'),
  ganchos: z.array(z.object({ estilo: z.enum(ESTILOS), texto: z.string().describe('hasta 140 caracteres') })).describe('exactamente tres, uno por estilo: dato, titular y pregunta'),
  guion: z.array(z.string()).describe('la misma cantidad de líneas que el guion recibido, en el mismo orden y con la misma función cada una'),
});

const SISTEMA_REDACCION = [
  'Sos el redactor de @motorstats.ar, una cuenta de Instagram de analítica de básquet argentino para cuerpos técnicos y clubes. Escribís en castellano rioplatense (vos, tenés), directo, sin signos de exclamación en cadena, sin emojis y sin hashtags.',
  '',
  'Recibís una PIEZA ya calculada (título, dato, guion y sus números) y un TONO. Devolvés un título, tres ganchos de portada (uno que abre con el dato, uno que es un titular y uno que es una pregunta) y el guion reescrito en ese tono.',
  '',
  'LA REGLA QUE NO SE NEGOCIA: no sos la fuente de ningún número.',
  '- Todo número que escribas tiene que estar en la pieza, EXACTAMENTE como figura ahí (58 es 58, no «casi 60» ni «6 de cada 10»).',
  '- No calcules, no redondees, no conviertas, no sumes ni restes, no escribas un número en letras.',
  '- No agregues datos, causas ni comparaciones que la pieza no trae. Si la pieza no dice por qué pasa algo, no lo expliques.',
  '- Un sistema automático revisa cada número después de vos y descarta el texto que traiga uno que no esté en la pieza.',
  '',
  'OTRAS REGLAS',
  '- No nombres personas ni clubes que la pieza no nombre. Si la pieza dice «Jugador 1» o «Equipo A», se queda así o se generaliza («un escolta», «un equipo de la zona»).',
  '- El guion conserva la cantidad de líneas, su orden y la función de cada una (portada, desarrollo, cierre). En un reel, cada línea conserva su marca de tiempo del principio tal cual.',
  '- La última línea del guion cierra con una pregunta al cuerpo técnico o una invitación a probar la demo, como la original.',
].join('\n');

/**
 * Redacta `propuesta` en `tono`. Devuelve los textos YA FILTRADOS por la
 * guarda numérica y la lista de lo que se descartó.
 */
async function redactar(propuesta, tono, deps) {
  if (!TONOS[tono]) throw new Error('Ese tono no existe.');
  const p = propuesta || {};
  if (!p.ok) throw new Error('No hay una propuesta con datos para redactar.');
  const pieza = { id: p.id, formato: p.formatoLabel || p.formato, enfoque: p.enfoque || null, titulo: p.titulo, dato: p.dato, guion: p.guion || [], muestra: p.muestra || null, numeros: p.datos || null };
  const usuario = 'TONO\n' + TONOS[tono] + '\n\nPIEZA\n' + JSON.stringify(pieza, null, 1);
  const r = await pedir((deps && deps.cliente) || clientePorDefecto(), EsquemaRedaccion, SISTEMA_REDACCION, usuario, 'medium');
  return Object.assign(filtrar(r.salida, pieza), { tono, uso: r.uso, modelo: r.modelo });
}

/** La guarda aplicada a una redacción. PURA: es lo que se testea. */
function filtrar(salida, pieza) {
  const permitidos = numerosDe(pieza);
  const descartado = [];
  const fiel = (campo, texto) => {
    const t = String(texto || '').trim();
    if (!t) { descartado.push({ campo, motivo: 'vacío' }); return null; }
    const aj = numerosAjenos(t, permitidos);
    if (aj.length) { descartado.push({ campo, texto: t, motivo: 'trae números que no están en la pieza: ' + aj.join(', ') }); return null; }
    return t;
  };
  const vistos = new Set();
  const ganchos = (salida.ganchos || []).map((g) => {
    if (ESTILOS.indexOf(g.estilo) === -1 || vistos.has(g.estilo)) return null;
    const t = fiel('gancho · ' + g.estilo, g.texto);
    if (!t) return null;
    vistos.add(g.estilo);
    return { estilo: g.estilo, texto: t.slice(0, 200), ia: true };
  }).filter(Boolean);
  const titulo = fiel('título', salida.titulo);
  let guion = null;
  const original = pieza.guion || [];
  if (!Array.isArray(salida.guion) || salida.guion.length !== original.length) descartado.push({ campo: 'guion', motivo: 'cambió la cantidad de líneas' });
  else {
    const lineas = salida.guion.map((l, i) => fiel('guion · línea ' + (i + 1), l));
    if (lineas.every(Boolean)) guion = lineas;
  }
  return { titulo, ganchos, guion, descartado };
}

module.exports = { MODELO, TONOS, ESTILOS, disponible, motivoApagada, interpretar, redactar, filtrar, numerosDe, numerosAjenos, explicar, EsquemaConsulta, EsquemaRedaccion, sistemaConsulta, SISTEMA_REDACCION };
