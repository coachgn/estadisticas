/* =====================================================================
   SGADD · El padrón de CLIENTES en KV

   Los mails del cuerpo técnico de cada club, con su clave. Es el gemelo
   de `admins.js`, y la diferencia entre los dos NO es un detalle de
   implementación: es la propiedad de seguridad del sistema.

     · QUIÉN ES ADMIN vive en `ADMINS`, en el CÓDIGO. `esAdmin()` lo
       re-deriva en cada petición, así que un KV comprometido no alcanza
       para inventar un administrador nuevo.

     · QUIÉN ES CLIENTE vive acá, en KV, porque es DATO: el admin da de
       alta y de baja mails todos los días desde el Panel Master, y
       pedirle un deploy para cada uno haría que el producto no se pueda
       operar.

   La consecuencia hay que tenerla clara: alguien que pueda escribir en KV
   puede darse de alta como cliente de un club. Eso le da lo que ese club
   ve, que es exactamente lo que el gate de interfaz protege (punto 19) —
   no le da administración, ni le da otro club.

   LOS HASHES NO VIVEN EN EL CATÁLOGO. El catálogo se sirve por
   `GET /api/v1/catalogo` a cualquiera con token, y meter ahí los mails
   le contaría a cada cliente quiénes son los del resto. Van en su propia
   clave y solo salen por un endpoint con gate de ADMIN.
   ===================================================================== */
'use strict';

const kv = require('./kv.js');
const claves = require('./claves.js');
const AUTH = require('./compartido/sgadd-auth.js');

const CLAVE_KV = 'sgadd:clientes';

/* El mismo criterio que los administradores: por MAIL y no por IP, que en
   Vercel llega por cabecera y se puede falsificar. Ver `admins.js`. */
const INTENTOS_MAX = 8;
const BLOQUEO_MS = 15 * 60 * 1000;

function normalizar(email) { return AUTH.normalizarEmail(email); }

/**
 * Lee el padrón. LANZA si KV no se pudo leer.
 *
 * Igual que `admins.cargar()`, y por el mismo motivo: `kv.leer` se traga
 * el error y devuelve `{valor: null}`, así que un fallo de red sería
 * indistinguible de «todavía no hay nadie» — y la rama de fallo del login
 * ESCRIBE. Ese es el bug que borró las claves de los tres administradores;
 * no se repite acá.
 */
async function cargar(opciones) {
  const r = await kv.leer(CLAVE_KV, opciones);
  if (r && r.error) {
    throw Object.assign(new Error('No se pudo leer el padrón de clientes.'),
      { codigo: 'KV' });
  }
  const v = r && r.valor;
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}

async function guardar(padron, opciones) {
  await kv.escribir(CLAVE_KV, padron || {}, opciones);
}

/** El registro de un mail, o `null`. */
function registro(padron, email) {
  const e = normalizar(email);
  if (!e) return null;
  return (padron || {})[e] || null;
}

/** Los mails dados de alta en un club, en orden de alta. */
function delClub(padron, clubId) {
  const c = String(clubId || '').trim().toLowerCase();
  return Object.keys(padron || {})
    .filter(e => String((padron[e] || {}).club || '').toLowerCase() === c)
    .map(e => ({
      email: e,
      club: padron[e].club,
      tieneClave: !!padron[e].clave,
      invitacionPendiente: !!padron[e].invitacion,
      invitacionVence: padron[e].invitacion
        ? new Date(padron[e].invitacion.venceEn).toISOString() : null,
      bloqueado: bloqueado(padron[e]),
      altaEl: padron[e].altaEl || null,
      ultimoIngreso: padron[e].ultimoIngreso || null,
    }))
    .sort((a, b) => String(a.altaEl || '').localeCompare(String(b.altaEl || '')));
}

/**
 * El cupo de un club y cuánto lleva usado.
 *
 * EL CUPO SALE DEL MOTOR COMPARTIDO (`AUTH.cupoDeMails`), que es la misma
 * tabla que la landing le muestra al cliente. Dos tablas de cupos que
 * digan cosas distintas es el reclamo que uno no quiere tener con alguien
 * que paga.
 */
function cupo(padron, clubId, plan) {
  const usados = delClub(padron, clubId).length;
  const tope = AUTH.cupoDeMails(plan);
  return { usados: usados, tope: tope, libres: Math.max(0, tope - usados), plan: AUTH.normalizarPlan(plan) };
}

function bloqueado(reg, ahora) {
  if (!reg || !reg.bloqueadoHasta) return false;
  return (ahora === undefined ? Date.now() : ahora) < reg.bloqueadoHasta;
}

/* Un registro válido con una clave que nadie conoce, para gastar el mismo
   tiempo cuando el mail no está en el padrón: sin esto, uno que no existe
   contesta en un milisegundo y uno que sí tarda cien, y la diferencia se
   mide desde afuera. */
const SEÑUELO = {
  alg: 'scrypt', N: claves.PARAMS.N, r: claves.PARAMS.r, p: claves.PARAMS.p,
  largo: claves.PARAMS.largo,
  salt: 'c2VudWVsbw==',
  hash: Buffer.alloc(claves.PARAMS.largo).toString('base64'),
};

/**
 * Verifica mail + clave.
 *
 * MISMO RESULTADO PARA «NO EXISTE» Y «CLAVE INCORRECTA», igual que con los
 * administradores: distinguirlos le diría a cualquiera qué mails están
 * dados de alta. El bloqueo sí se separa, porque el dueño legítimo
 * necesita saber por qué no entra con la clave correcta.
 */
async function verificar(padron, email, clave, ahora) {
  const reg = registro(padron, email);
  const t = (ahora === undefined ? Date.now() : ahora);

  if (bloqueado(reg, t)) {
    return { ok: false, motivo: 'BLOQUEADO', esperaMs: reg.bloqueadoHasta - t };
  }
  if (!reg || !reg.clave) {
    await claves.verificar(String(clave || ''), SEÑUELO);
    /* SE DISTINGUE «tiene invitación y todavía no fijó su clave» del resto,
       y esto NO filtra el padrón: para llegar acá hay que traer el código,
       que es un secreto de 256 bits. Sin esta rama, el cliente que recién
       recibe su código intenta entrar, le dicen «mail o clave incorrectos»
       y concluye que le dieron mal el acceso. */
    if (reg && reg.invitacion) return { ok: false, motivo: 'FALTA_CLAVE' };
    return { ok: false, motivo: 'CREDENCIALES' };
  }
  const bien = await claves.verificar(clave, reg.clave);
  if (!bien) return { ok: false, motivo: 'CREDENCIALES' };
  return { ok: true, email: normalizar(email), club: reg.club, equipoAsignado: reg.equipoAsignado || null };
}

function anotarFallo(padron, email, ahora) {
  const e = normalizar(email);
  const p = Object.assign({}, padron);
  /* Solo se lleva cuenta de los que EXISTEN: crear un registro por cada
     mail que alguien pruebe convertiría el padrón en un basurero que
     crece con cada intento. Los admins tienen la lista en el código y por
     eso allá el guard es otro. */
  if (!p[e]) return padron;
  const reg = Object.assign({}, p[e]);
  const t = (ahora === undefined ? Date.now() : ahora);
  reg.fallos = (Number(reg.fallos) || 0) + 1;
  if (reg.fallos >= INTENTOS_MAX) {
    reg.bloqueadoHasta = t + BLOQUEO_MS;
    reg.fallos = 0;
  }
  p[e] = reg;
  return p;
}

function anotarExito(padron, email, ahora) {
  const e = normalizar(email);
  const p = Object.assign({}, padron);
  if (!p[e]) return padron;
  const reg = Object.assign({}, p[e]);
  delete reg.fallos;
  delete reg.bloqueadoHasta;
  reg.ultimoIngreso = new Date(ahora === undefined ? Date.now() : ahora).toISOString();
  p[e] = reg;
  return p;
}

/**
 * Da de alta un mail en un club, con su invitación.
 *
 * EL CUPO SE VALIDA ACÁ Y NO EN LA UI. La pantalla lo muestra para que el
 * admin no llegue al tope de sorpresa, pero el que decide es el servidor:
 * una validación que solo vive en el navegador no es una validación.
 *
 * UN MAIL ESTÁ EN UN SOLO CLUB. Con el mismo mail en dos, el login tendría
 * que adivinar cuál abrir, y adivinar es lo que este proyecto no hace. Si
 * alguien trabaja en dos clubes, se le da un mail por club.
 */
function alta(padron, email, clubId, opciones) {
  const o = opciones || {};
  const e = normalizar(email);
  if (!e || e.indexOf('@') === -1) {
    return { ok: false, motivo: 'Eso no parece un mail.' };
  }
  if (AUTH.esAdmin(e)) {
    /* Un admin ya entra por su propia puerta y con permisos más amplios;
       darlo de alta como cliente le ACOTARÍA la vista sin que nadie lo
       pida, y encima gastaría un cupo del club. */
    return { ok: false, motivo: 'Ese mail ya es administrador: entra por su propio acceso.' };
  }
  const club = String(clubId || '').trim().toLowerCase();
  if (!club) return { ok: false, motivo: 'Falta el club.' };

  const ya = (padron || {})[e];
  if (ya && String(ya.club || '').toLowerCase() !== club) {
    return { ok: false, motivo: 'Ese mail ya está dado de alta en ' + ya.club + '. Un mail pertenece a un solo club.' };
  }
  if (ya) return { ok: false, motivo: 'Ese mail ya está dado de alta en este club.' };

  const c = cupo(padron, club, o.plan);
  if (c.libres <= 0) {
    return { ok: false, motivo: 'El plan ' + c.plan + ' admite ' + c.tope
      + (c.tope === 1 ? ' mail' : ' mails') + ' y ya están los ' + c.usados
      + '. Sacá uno, o subí el plan del club.' };
  }

  const inv = claves.generarInvitacion(o.dias);
  const p = Object.assign({}, padron);
  p[e] = {
    club: club,
    equipoAsignado: o.equipoAsignado || null,
    altaEl: new Date(o.ahora === undefined ? Date.now() : o.ahora).toISOString(),
    invitacion: { hash: claves.hashearCodigo(inv.codigo), venceEn: inv.venceEn },
  };
  return { ok: true, padron: p, codigo: inv.codigo, venceEn: inv.venceEn, cupo: cupo(p, club, o.plan) };
}

/** Saca un mail del padrón. Su clave se va con él. */
function baja(padron, email) {
  const e = normalizar(email);
  if (!(padron || {})[e]) return { ok: false, motivo: 'Ese mail no está dado de alta.' };
  const p = Object.assign({}, padron);
  const club = p[e].club;
  delete p[e];
  return { ok: true, padron: p, club: club };
}

/**
 * Vuelve a invitar a un mail que ya está de alta.
 *
 * Es para el que perdió el código o dejó que venciera. NO le borra la
 * clave si ya tenía una: mientras no canjee el código nuevo, la vieja
 * sigue sirviendo. Invalidarla de entrada dejaría afuera a alguien que
 * está entrando bien, por un click de más del administrador.
 */
function reinvitar(padron, email, dias) {
  const e = normalizar(email);
  const reg = (padron || {})[e];
  if (!reg) return { ok: false, motivo: 'Ese mail no está dado de alta.' };
  const inv = claves.generarInvitacion(dias);
  const p = Object.assign({}, padron);
  p[e] = Object.assign({}, reg, {
    invitacion: { hash: claves.hashearCodigo(inv.codigo), venceEn: inv.venceEn },
  });
  return { ok: true, padron: p, codigo: inv.codigo, venceEn: inv.venceEn };
}

/** Fija la clave con el código de invitación. Consume la invitación. */
async function fijarClave(padron, email, codigo, claveNueva, ahora) {
  const e = normalizar(email);
  const reg = registro(padron, e);
  const t = (ahora === undefined ? Date.now() : ahora);

  if (!reg || !reg.invitacion) {
    return { ok: false, motivo: 'No hay una invitación pendiente para ese mail.' };
  }
  if (t > reg.invitacion.venceEn) {
    return { ok: false, motivo: 'Esa invitación venció. Pedí una nueva.' };
  }
  if (!claves.codigoCoincide(codigo, reg.invitacion.hash)) {
    return { ok: false, motivo: 'El código de invitación no es válido.' };
  }
  const mal = claves.revisar(claveNueva);
  if (mal) return { ok: false, motivo: mal };

  const hash = await claves.hashear(claveNueva);
  const p = Object.assign({}, padron);
  const nuevo = Object.assign({}, reg, { clave: hash, fijadaEl: new Date(t).toISOString() });
  delete nuevo.invitacion;
  delete nuevo.fallos;
  delete nuevo.bloqueadoHasta;
  p[e] = nuevo;
  return { ok: true, padron: p };
}

/** Cambio de clave con la clave actual. */
async function cambiarClave(padron, email, claveActual, claveNueva, ahora) {
  const v = await verificar(padron, email, claveActual, ahora);
  if (!v.ok) return { ok: false, motivo: 'La clave actual no es correcta.' };
  const mal = claves.revisar(claveNueva);
  if (mal) return { ok: false, motivo: mal };
  const hash = await claves.hashear(claveNueva);
  const e = normalizar(email);
  const p = Object.assign({}, padron);
  p[e] = Object.assign({}, p[e], {
    clave: hash, fijadaEl: new Date(ahora === undefined ? Date.now() : ahora).toISOString(),
  });
  delete p[e].invitacion;
  return { ok: true, padron: p };
}

module.exports = {
  CLAVE_KV, cargar, guardar, registro, delClub, cupo, verificar,
  alta, baja, reinvitar, fijarClave, cambiarClave,
  anotarFallo, anotarExito, bloqueado,
  INTENTOS_MAX, BLOQUEO_MS,
};
