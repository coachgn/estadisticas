/* =====================================================================
   Upstash Redis por su API REST · sin dependencias

   Upstash expone HTTP además del protocolo Redis, así que alcanza con
   `fetch`. El SDK oficial (`@upstash/redis`) haría exactamente esto y
   agregaría un paquete al arranque en frío, que en serverless se paga por
   invocación.

   ---------------------------------------------------------------------
   ESTE MÓDULO NUNCA LANZA EN LECTURA

   Es la regla que hace que el catálogo se pueda mover al KV sin volver
   frágil al servidor: si Upstash no contesta —cae, cambia el token, se
   agota el plan— `leer()` devuelve `null` y el catálogo se cae al
   siguiente origen de la cascada. Un club deja de poder darse de alta;
   los que ya están siguen funcionando.

   La ESCRITURA sí lanza: la usa el CLI, donde un error silencioso haría
   creer que un alta se guardó cuando no.
   ===================================================================== */
'use strict';

/* TRES juegos de nombres, y hay que aceptar los tres:

     UPSTASH_REDIS_REST_*     las del panel propio de Upstash
     UPSTASH_KV_REST_API_*    las de la integración Upstash en Vercel
     KV_REST_API_*            las del Vercel KV clásico

   Según por dónde se conecte la base, el que la crea se encuentra UNO de
   los tres juegos y ninguno de los otros. Exigir un nombre concreto es
   mandarlo a copiar valores a mano para nada — y ya pasó: la primera
   versión aceptaba dos y llegaron las del tercero. */
function credenciales(env) {
  const e = env || process.env;
  const url = e.UPSTASH_REDIS_REST_URL || e.UPSTASH_KV_REST_API_URL
    || e.KV_REST_API_URL || '';
  const token = e.UPSTASH_REDIS_REST_TOKEN || e.UPSTASH_KV_REST_API_TOKEN
    || e.KV_REST_API_TOKEN || '';
  /* EL TOKEN DE SOLO LECTURA · el servidor lee, el CLI escribe.

     Vercel no tiene por qué poder escribir el catálogo: lo único que hace
     con KV es leerlo. Con el token completo ahí arriba, cualquier fallo de
     la API podría pisar el catálogo de los tres clubes.

     Y ACÁ VAN LAS CUATRO VARIANTES DE NOMBRE, por lo mismo que el token
     completo acepta tres: Upstash bautiza distinto según por dónde se cree
     la base. La consola nativa muestra `UPSTASH_REDIS_REST_READONLY_TOKEN`
     —todo junto, sin `API`— y la integración estilo Vercel KV muestra
     `KV_REST_API_READ_ONLY_TOKEN`, con guión bajo en medio. Exigir uno
     concreto es mandar a copiar valores a mano para nada, y ya pasó dos
     veces con el token completo. */
  const tokenLectura = e.KV_REST_API_READ_ONLY_TOKEN
    || e.UPSTASH_KV_REST_API_READ_ONLY_TOKEN
    || e.UPSTASH_REDIS_REST_READONLY_TOKEN
    || e.UPSTASH_REDIS_REST_READ_ONLY_TOKEN || '';
  /* EL TOKEN VIEJO, PARA ROTAR SIN CORTAR NADA.

     Rotar una credencial de un servicio que está sirviendo tiene un
     agujero conocido: entre que se genera la nueva y que el servidor la
     lee, hay peticiones en vuelo. Y en serverless «el servidor» son N
     instancias que se reciclan cuando quieren, así que la ventana no es
     un instante — puede durar minutos.

     Con un segundo nombre de variable la ventana desaparece: se pone el
     token nuevo, se DEJA el viejo bajo `*_LEGACY`, y cada petición prueba
     el nuevo y cae al viejo si el nuevo todavía no llegó o ya no sirve.
     Cuando el nuevo anda en todas las instancias, se borra el legacy y se
     revoca el viejo en la consola.

     Es una variable de TRANSICIÓN: si queda puesta para siempre, el token
     que se quiso revocar sigue vivo y la rotación no rotó nada. El
     healthcheck lo dice con todas las letras. */
  const tokenLegacy = e.UPSTASH_REDIS_REST_TOKEN_LEGACY
    || e.UPSTASH_KV_REST_API_TOKEN_LEGACY
    || e.KV_REST_API_TOKEN_LEGACY || '';
  const tokenLecturaLegacy = e.KV_REST_API_READ_ONLY_TOKEN_LEGACY
    || e.UPSTASH_REDIS_REST_READONLY_TOKEN_LEGACY || '';

  return {
    url: String(url).replace(/\/+$/, ''),
    token: String(token),
    tokenLectura: String(tokenLectura),
    tokenLegacy: String(tokenLegacy),
    tokenLecturaLegacy: String(tokenLecturaLegacy),
  };
}

function configurado(env) {
  const c = credenciales(env);
  /* El legacy cuenta: durante la rotación puede ser el único que anda, y
     un `configurado()` en false ahí apagaría la escritura entera. */
  return !!(c.url && (c.token || c.tokenLectura || c.tokenLegacy || c.tokenLecturaLegacy));
}

/**
 * Los tokens a probar, en orden, para una operación.
 *
 * El NUEVO primero y el legacy después: al revés, el viejo seguiría
 * sirviendo todas las peticiones y la rotación no se completaría nunca.
 */
function tokensPara(c, soloLectura) {
  const out = [];
  const push = (t, cual) => { if (t && !out.some(x => x.token === t)) out.push({ token: t, cual: cual }); };
  if (soloLectura) {
    push(c.tokenLectura, 'lectura');
    push(c.token, 'completo');
    push(c.tokenLecturaLegacy, 'lectura-legacy');
    push(c.tokenLegacy, 'completo-legacy');
  } else {
    push(c.token, 'completo');
    push(c.tokenLegacy, 'completo-legacy');
  }
  return out;
}

async function comando(partes, opciones) {
  const o = opciones || {};
  const c = credenciales(o.env);
  const candidatos = tokensPara(c, o.soloLectura);

  /* ESCRIBIR CON UN TOKEN DE SOLO LECTURA FALLA ACÁ, NO EN UPSTASH.

     Sin esto la petición sale igual y vuelve un `NOPERM` crudo que no
     dice cuál es el problema: el administrador ve un error de red donde
     lo que pasa es que está corriendo el CLI contra el entorno que solo
     lee. Es el mismo criterio que el guard de `guardar()`, que aborta
     antes de escribir en vez de dejar a medias.

     VA ANTES DEL GUARD DE «no hay token», y ese orden importa: con solo
     el de lectura, `tokensPara` para escritura devuelve una lista vacía y
     el mensaje genérico —«Upstash no está configurado»— taparía al que sí
     dice qué pasa. Lo específico primero. */
  if (!o.soloLectura && !c.token && !c.tokenLegacy && (c.tokenLectura || c.tokenLecturaLegacy)) {
    const e = new Error('Este entorno solo tiene el token de LECTURA de Upstash: '
      + 'no puede escribir el catálogo. El token completo va en la máquina '
      + 'que corre el CLI, nunca en el servidor.');
    e.codigo = 'KV_SOLO_LECTURA';
    throw e;
  }

  const token = candidatos.length ? candidatos[0].token : '';
  if (!c.url || !token) {
    const e = new Error('Upstash no está configurado (falta UPSTASH_REDIS_REST_URL o su token)');
    e.codigo = 'SIN_KV';
    throw e;
  }
  const traer = o.fetch || fetch;

  /* Techo de espera. Sin esto, un Upstash que no contesta deja colgada la
     petición del panel — y el catálogo tiene un respaldo perfectamente
     bueno esperando del otro lado. Es la misma decisión que el
     `TIMEOUT_HOJA` del frontend. */
  /* SE PRUEBA CADA TOKEN, PERO SOLO SI EL ANTERIOR FALLÓ POR PERMISOS.

     Un 401 o un `NOPERM` significan «este token no sirve», que es
     exactamente el caso de la rotación a medio camino. Cualquier otro
     error —un timeout, un 500, la cuota agotada— NO se reintenta: el
     token está bien y repetir la petición solo duplica la espera del que
     está del otro lado. */
  let ultimo = null;
  for (let i = 0; i < candidatos.length; i++) {
    const cand = candidatos[i];
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const corte = setTimeout(() => { if (ctrl) ctrl.abort(); }, o.timeoutMs || 2500);
    try {
      const r = await traer(c.url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + cand.token, 'Content-Type': 'application/json' },
        body: JSON.stringify(partes),
        signal: ctrl ? ctrl.signal : undefined,
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok || cuerpo.error) {
        const e = new Error(cuerpo.error || ('Upstash respondió ' + r.status));
        e.codigo = r.status === 401 ? 'KV_TOKEN' : 'KV_' + r.status;
        e.tokenUsado = cand.cual;
        throw e;
      }
      ultimoTokenOk = cand.cual;
      return cuerpo.result;
    } catch (e) {
      ultimo = e;
      const dePermisos = e.codigo === 'KV_TOKEN' || e.codigo === 'KV_403'
        || /NOPERM|WRONGPASS|unauthor/i.test(String(e.message || ''));
      if (!dePermisos || i === candidatos.length - 1) throw e;
      /* Y se sigue con el próximo. */
    } finally {
      clearTimeout(corte);
    }
  }
  throw ultimo || new Error('Upstash no contestó');
}

/* Cuál de los tokens fue el último que funcionó. Lo lee el healthcheck
   para poder decir si la rotación ya se puede terminar — o sea si el
   legacy todavía hace falta. */
let ultimoTokenOk = null;
function tokenEnUso() { return ultimoTokenOk; }

/**
 * Lee una clave. NUNCA lanza: devuelve `null` y deja que el llamador siga
 * con su respaldo.
 * @returns {Promise<{valor: any, error: string|null}>}
 */
async function leer(clave, opciones) {
  const o = opciones || {};
  try {
    const crudo = await comando(['GET', clave], Object.assign({ soloLectura: true }, o));
    if (crudo === null || crudo === undefined) return { valor: null, error: null };
    /* Upstash devuelve el string tal cual se guardó. Si no es JSON válido,
       se trata como ausente: un blob corrupto NO puede tumbar el
       catálogo. */
    try { return { valor: JSON.parse(crudo), error: null }; }
    catch (e) { return { valor: null, error: 'JSON inválido en ' + clave }; }
  } catch (e) {
    return { valor: null, error: (e && e.codigo) || 'KV' };
  }
}

/** Escribe una clave. SÍ lanza: la usa el CLI y un fallo silencioso ahí
    haría creer que un alta se guardó cuando no. */
async function escribir(clave, valor, opciones) {
  return comando(['SET', clave, JSON.stringify(valor)], opciones);
}

async function borrar(clave, opciones) {
  return comando(['DEL', clave], opciones);
}

module.exports = { credenciales, configurado, comando, leer, escribir, borrar,
  tokensPara, tokenEnUso };
