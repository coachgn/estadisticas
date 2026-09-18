/* =====================================================================
   UN UPSTASH DE MENTIRA, EN MEMORIA

   Lo usan el simulador de mails (`bin/probar-mails.js`) y `test-mails.js`:
   con esto el cron corre de punta a punta —reclamos atómicos, fichas y
   log— sin tocar la base de producción. Implementa SOLO los comandos que
   usan las fichas y los avisos; uno desconocido LANZA, para que un test
   no pase en silencio sobre una operación que no existe.
   ===================================================================== */
'use strict';

function kvMemoria() {
  const hashes = {};
  const h = (k) => (hashes[k] = hashes[k] || {});
  const parse = (v) => { try { return JSON.parse(v); } catch (e) { return null; } };
  const ops = [];
  return {
    hashes: hashes,
    ops: ops,
    configurado: () => true,
    async comando(partes) {
      ops.push(partes[0]);
      const [cmd, clave, campo, valor] = partes;
      if (cmd === 'HSETNX') {
        if (Object.prototype.hasOwnProperty.call(h(clave), campo)) return 0;
        h(clave)[campo] = valor;
        return 1;
      }
      if (cmd === 'HDEL') { const habia = campo in h(clave); delete h(clave)[campo]; return habia ? 1 : 0; }
      throw new Error('kv-memoria: comando no implementado ' + cmd);
    },
    async leerHash(clave) {
      ops.push('HGETALL');
      const out = {};
      Object.keys(h(clave)).forEach(k => { const v = parse(h(clave)[k]); if (v !== null) out[k] = v; });
      return out;
    },
    async leerCampos(clave, campos) {
      ops.push('HMGET');
      const out = {};
      (campos || []).forEach(c => { if (c in h(clave)) { const v = parse(h(clave)[c]); if (v !== null) out[c] = v; } });
      return out;
    },
    async escribirCampos(clave, mapa) {
      ops.push('HSET');
      Object.keys(mapa || {}).forEach(k => { h(clave)[k] = JSON.stringify(mapa[k]); });
      return Object.keys(mapa || {}).length;
    },
  };
}

module.exports = { kvMemoria };
