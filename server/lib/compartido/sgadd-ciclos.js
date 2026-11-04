/* ARCHIVO GENERADO · NO EDITAR ACÁ.
 *
 * Copia mecánica de js/sgadd-ciclos.js, que es la fuente de verdad.
 * Existe porque Vercel despliega con raíz en `server/` y no sube el
 * resto del repo. Para regenerar:
 *
 *     node server/bin/sincronizar-compartido.js
 *
 * `test-backend.js` falla si este archivo difiere del original.
 */
/* ============================================================================
   SGADD_CICLOS · EL INFORME DE CICLO DE 4 PARTIDOS (PURO, sin `document`)

   Un ciclo son N partidos validados SEGUIDOS de un equipo (4 por defecto,
   `PARTIDOS_POR_CICLO` del plan ORO): el Ciclo 0 son los primeros cuatro, el
   Ciclo 1 los siguientes, y así. Se arma desde el bloque `ciclos` del paquete
   de laboratorio (el dato de CADA partido, ver motorstats-ingestion/src/pbp/
   ciclos.js) y, para el mapa con círculos y cruces, de `partidosPbp`.

   Marco del informe (cerrado con el club):
     · sin tendencias: se dice el valor, la mediana de la liga y el puesto;
       comparar dos ciclos pone los dos lados a la vista, sin flecha de mejora
     · ORTG / DRTG / NET por 100 POSESIONES; el PPP, por jugada
     · la disponibilidad del rival no se asume
     · lo que es lectura va marcado como lectura

   Este módulo NO dibuja: devuelve datos (`ciclo.json`). La vista del panel y
   el PDF del servidor usan las mismas funciones sobre el mismo objeto, así que
   no pueden contradecirse.
   ============================================================================ */
const SGADD_CICLOS = (function () {
  'use strict';

  const PARTIDOS_POR_CICLO = 4;
  const K_MUESTRA = 20;            // tiros de la liga que se suman a cada zona (el criterio del mapa)
  const TOLERANCIA_TIROS = 0.02;   // descalce tiros por cuarto vs zonas: hasta 2 % es aviso
  const MIN_TIROS_ZONA = 10;      // por debajo, la zona se resalta punteada: «muestra chica»
  const ORIGENES = ['RD', 'ROBO', 'SAQUE', 'MUERTA', 'PERIODO'];
  const ZONAS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7', 'Z8', 'Z9', 'Z10', 'Z11', 'Z12', 'Z13', 'Z14'];
  const valorZona = (z) => (/^Z(1[0-4])$/.test(z) ? 3 : 2);
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const sum = (l, f) => l.reduce((t, x) => t + (f ? f(x) : x), 0);

  /* ===================================================== VENTANAS */

  /** Los partidos del bloque `ciclos`, del más viejo al más nuevo. */
  function partidosDe(paq) {
    const l = paq && paq.ciclos && Array.isArray(paq.ciclos.partidos) ? paq.ciclos.partidos : [];
    return l.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (String(a.id) < String(b.id) ? -1 : 1)));
  }

  /**
   * Los ciclos del equipo: N partidos seguidos, numerados desde 0. El último
   * puede estar incompleto (`cerrado: false`) y NO se sella.
   */
  function ventanas(paq, n) {
    const N = Math.max(1, Math.floor(Number(n) || PARTIDOS_POR_CICLO));
    const ps = partidosDe(paq);
    const out = [];
    for (let i = 0; i < ps.length; i += N) {
      const parte = ps.slice(i, i + N);
      out.push({
        numero: i / N, n: N, cerrado: parte.length === N, partidos: parte.length,
        desde: parte[0].fecha, hasta: parte[parte.length - 1].fecha, ids: parte.map(p => String(p.id)),
      });
    }
    return out;
  }

  /* ===================================================== PIEZAS DEL CICLO */

  function resultados(ps) {
    const filas = ps.map((p) => ({
      id: String(p.id), fecha: p.fecha, rival: p.rival, condicion: p.condicion,
      final: p.final, resultado: p.final[0] > p.final[1] ? 'G' : 'P',
      dif: p.final[0] - p.final[1],
    }));
    const favor = sum(filas, f => f.final[0]), contra = sum(filas, f => f.final[1]);
    return {
      partidos: filas,
      record: { g: filas.filter(f => f.resultado === 'G').length, p: filas.filter(f => f.resultado === 'P').length },
      puntos: { favor, contra, dif: favor - contra, favorPP: r1(favor / filas.length), contraPP: r1(contra / filas.length) },
    };
  }

  const par = (v) => (Array.isArray(v) ? v : [0, 0, 0, 0]);

  /**
   * La transición del RIVAL en los primeros 7 s, por origen, contra la liga.
   * El exceso es lo que el rival rinde de más que lo habitual en la liga por
   * partido en ese origen; la parte del daño es cuánto de TODO el exceso
   * positivo sale de ese origen. Si no hay vara de liga, no se compara.
   */
  function transicion(ps, paq) {
    const total = ps.length;
    const por = {};
    ORIGENES.forEach((o) => {
      const v = [0, 0, 0, 0];
      ps.forEach((p) => { const x = par(((p.trans || {}).rival || {})[o]); for (let i = 0; i < 4; i++) v[i] += x[i]; });
      por[o] = { tiros: v[0], conv: v[1], pts: v[2], perd: v[3], ptsPP: r2(v[2] / total), tirosPP: r2(v[0] / total) };
    });
    const L = paq && paq.liga && paq.liga.ciclos;
    let sinVara = true;
    if (L && L.lados > 0) {
      sinVara = false;
      ORIGENES.forEach((o) => {
        const lg = par((L.trans || {})[o]);
        por[o].liga = { ptsPP: r2(lg[2] / L.lados), tirosPP: r2(lg[0] / L.lados) };
        por[o].exceso = r2(por[o].ptsPP - por[o].liga.ptsPP);
      });
      const pos = ORIGENES.map(o => Math.max(0, por[o].exceso));
      const tot = sum(pos);
      ORIGENES.forEach((o, i) => { por[o].parteDelDanio = tot > 0 ? r1(100 * pos[i] / tot) : null; });
    }
    const ptsTotal = sum(ORIGENES, o => por[o].pts);
    return { porOrigen: por, ptsPP: r2(ptsTotal / total), sinVara, partidos: total };
  }

  /** Qué genera esa transición: pérdidas propias (quién) y tiros errados previos al rebote rival. */
  function causas(ps) {
    const perd = {}, fall = { '2P': [0, 0], '3P': [0, 0] };
    let nRD = 0, nROBO = 0;
    ps.forEach((p) => {
      const c = p.causas || {};
      Object.keys(c.perd || {}).forEach((j) => {
        const x = perd[j] || (perd[j] = [0, 0]);
        x[0] += c.perd[j][0]; x[1] += c.perd[j][1];
      });
      ['2P', '3P'].forEach((k) => { const v = (c.fall || {})[k]; if (v) { fall[k][0] += v[0]; fall[k][1] += v[1]; } });
      nRD += c.nRD || 0; nROBO += c.nROBO || 0;
    });
    const jugadores = Object.keys(perd).map(n => ({ nombre: n, perdidas: perd[n][0], puntosRival: perd[n][1] }))
      .sort((a, b) => b.perdidas - a.perdidas || b.puntosRival - a.puntosRival);
    return {
      jugadores, nROBO, nRD,
      falladosPrevios: { dobles: { n: fall['2P'][0], pts: fall['2P'][1] }, triples: { n: fall['3P'][0], pts: fall['3P'][1] } },
      /* Cuántas de las salidas que arrancaron con rebote rival siguieron a un doble errado nuestro. */
      parteDeDobles: (fall['2P'][0] + fall['3P'][0]) ? r1(100 * fall['2P'][0] / (fall['2P'][0] + fall['3P'][0])) : null,
    };
  }

  /** Real contra esperado por cuarto, y los parciales. */
  function cuartos(ps) {
    const out = [];
    for (let q = 0; q < 4; q++) {
      const f = [0, 0, 0, 0], c = [0, 0, 0, 0];
      let pf = 0, pc = 0;
      ps.forEach((p) => {
        const a = par(((p.cuartos || {}).favor || [])[q]), b = par(((p.cuartos || {}).contra || [])[q]);
        for (let i = 0; i < 4; i++) { f[i] += a[i]; c[i] += b[i]; }
        const pp = (p.parciales || [])[q] || [0, 0];
        pf += pp[0]; pc += pp[1];
      });
      out.push({
        cuarto: q + 1,
        favor: { tiros: f[0], conv: f[1], pts: f[2], esperados: r1(f[3]), dif: r1(f[2] - f[3]) },
        contra: { tiros: c[0], conv: c[1], pts: c[2], esperados: r1(c[3]), dif: r1(c[2] - c[3]) },
        parcial: { favor: pf, contra: pc, dif: pf - pc },
      });
    }
    return out;
  }

  /**
   * Zonas a favor y en contra contra la liga, ajustadas por muestra
   * (K tiros de liga). `puntosDeMas` (contra) es lo que el rival rinde sobre
   * lo que la liga rinde en ESA zona con SUS tiros: la medida de una fuga.
   */
  function zonas(ps, paq) {
    const ligaPpt = {};
    ((paq && paq.liga && paq.liga.zonas) || []).forEach((z) => { ligaPpt[z.zona] = z.ppt; });
    const lado = (clave) => ZONAS.map((id, zi) => {
      let i = 0, c = 0;
      ps.forEach((p) => { const x = (((p.zonas || {})[clave]) || [])[zi]; if (x) { i += x[0]; c += x[1]; } });
      const v = valorZona(id), pts = c * v;
      const lg = ligaPpt[id];
      const ajustado = lg === undefined || lg === null ? null : (pts + K_MUESTRA * lg) / (i + K_MUESTRA);
      return {
        zona: id, i, c, pts, pct: i ? r1(100 * c / i) : null, ppt: i ? r2(pts / i) : null,
        ligaPpt: lg === undefined ? null : lg, pptAjustado: ajustado === null ? null : r2(ajustado),
        delta: ajustado === null ? null : r2(ajustado - lg),
        puntosDeMas: lg === undefined || lg === null ? null : r1(pts - i * lg),
        muestraChica: i < MIN_TIROS_ZONA,
      };
    });
    const favor = lado('favor'), contra = lado('contra');
    const ordenFuga = contra.filter(z => z.i >= 1 && z.puntosDeMas !== null).sort((a, b) => b.puntosDeMas - a.puntosDeMas);
    const ordenFav = favor.filter(z => z.i >= 1 && z.puntosDeMas !== null).sort((a, b) => a.puntosDeMas - b.puntosDeMas);
    return { favor, contra, fugas: ordenFuga.slice(0, 3), propiasBajas: ordenFav.slice(0, 3) };
  }

  /** Los tiros con coordenadas del ciclo: solo de los partidos que `partidosPbp` todavía conserva. */
  function tirosDelCiclo(ps, paq) {
    const ids = new Set(ps.map(p => String(p.id)));
    const g = ((paq && paq.partidosPbp) || []).filter(p => ids.has(String(p.id)));
    const favor = [], contra = [];
    g.forEach((p) => { (p.tiros.favor || []).forEach(x => favor.push(x)); (p.tiros.contra || []).forEach(x => contra.push(x)); });
    return { favor, contra, conPuntos: g.length, de: ps.length, completo: g.length === ps.length };
  }

  /* ===================================================== EL CICLO */

  /**
   * Arma el ciclo `numero` (0, 1, 2…). Devuelve null si no existe.
   * @returns {object} ciclo.json: meta, resultados, transicion, causas, cuartos, zonas, mapa, resaltar
   */
  function armarCiclo(paq, numero, opciones) {
    const N = Math.max(1, Math.floor(Number((opciones || {}).n) || PARTIDOS_POR_CICLO));
    const todas = partidosDe(paq);
    const ini = Number(numero) * N;
    if (!(ini >= 0) || ini >= todas.length) return null;
    const ps = todas.slice(ini, ini + N);
    return armarDesde(paq, ps, { tipo: 'ciclo', numero: Number(numero), n: N, cerrado: ps.length === N });
  }

  /** Arma el informe sobre una lista de partidos ya elegida. `base` lleva tipo, numero, n y cerrado. */
  function armarDesde(paq, ps, base) {
    const z = zonas(ps, paq);
    const resaltar = z.fugas.slice(0, 2).map(f => ({ id: f.zona, punteado: f.muestraChica }));
    return {
      version: 1,
      meta: {
        equipo: (paq && paq.equipo) || null, tipo: base.tipo, numero: base.numero === undefined ? null : base.numero,
        n: base.n, cerrado: base.cerrado,
        partidos: ps.length, desde: ps[0].fecha, hasta: ps[ps.length - 1].fecha,
        competencia: (paq && paq.etiqueta) || null,
      },
      resultados: resultados(ps),
      transicion: transicion(ps, paq),
      causas: causas(ps),
      cuartos: cuartos(ps),
      zonas: z,
      mapa: tirosDelCiclo(ps, paq),
      resaltar,
    };
  }

  /**
   * UNA ventana a elección, no solo el ciclo estándar de N partidos: el cliente
   * puede preferir otro corte y el analista puede querer mirar un tramo fuera del
   * período estándar. Criterios:
   *   { tipo: 'ciclo', numero, n }                        el estándar (Ciclo 0, 1, …)
   *   { tipo: 'partidos', ids: [...] }                    esos partidos exactos
   *   { tipo: 'partidos', ultimos: N }                    los últimos N
   *   { tipo: 'partidos', desde: i, cantidad: N }         N a partir del i-ésimo (0 = el primero)
   *   { tipo: 'calendario', desde: 'AAAA-MM-DD', hasta }  los partidos entre esas fechas
   * Una ventana libre se considera cerrada (la eligió quien analiza); la de
   * calendario solo si `opciones.hoy` ya pasó su fin. Devuelve null si no hay partidos.
   */
  function armarVentana(paq, criterio, opciones) {
    const c = criterio || {};
    if (!c.tipo || c.tipo === 'ciclo') return armarCiclo(paq, c.numero, { n: c.n });
    const todas = partidosDe(paq);
    let ps = [];
    if (c.tipo === 'calendario') {
      if (!c.desde || !c.hasta || c.desde > c.hasta) return null;
      ps = todas.filter(p => p.fecha >= c.desde && p.fecha <= c.hasta);
    } else if (c.tipo === 'partidos') {
      if (Array.isArray(c.ids) && c.ids.length) { const s = new Set(c.ids.map(String)); ps = todas.filter(p => s.has(String(p.id))); }
      else if (c.ultimos) ps = todas.slice(-Math.max(1, Math.floor(Number(c.ultimos))));
      else if (c.cantidad) { const i = Math.max(0, Math.floor(Number(c.desde) || 0)); ps = todas.slice(i, i + Math.floor(Number(c.cantidad))); }
    } else return null;
    if (!ps.length) return null;
    const hoy = (opciones || {}).hoy;
    const cerrado = c.tipo === 'calendario' && hoy ? c.hasta < hoy : true;
    const ciclo = armarDesde(paq, ps, { tipo: c.tipo, numero: null, n: ps.length, cerrado });
    ciclo.meta.criterio = c;
    return ciclo;
  }

  /* ===================================================== AUDITORÍA */

  /**
   * Lo que hay que mirar ANTES de publicar. `apto` es falso con un solo error;
   * los avisos se publican pero se dicen. El admin puede editar las lecturas de
   * texto, nunca estos números.
   */
  function auditar(ciclo, paq) {
    const items = [];
    const add = (id, nivel, texto) => items.push({ id, nivel, texto });
    if (!ciclo) return { apto: false, items: [{ id: 'sin-ciclo', nivel: 'error', texto: 'El ciclo no existe en este paquete.' }] };
    const m = ciclo.meta;
    if (!m.cerrado) add('abierto', 'error', `El ciclo tiene ${m.partidos} de ${m.n} partidos: no se sella ni se envía hasta que se complete.`);
    else add('cerrado', 'ok', `Ciclo cerrado: ${m.n} partidos validados (${m.desde} al ${m.hasta}).`);

    const loc = ciclo.resultados.partidos.filter(p => p.condicion === 'LOCAL').length;
    add('localia', 'ok', `Localía: ${loc} de local y ${m.partidos - loc} de visitante.`);

    if (ciclo.transicion.sinVara) add('vara', 'aviso', 'El paquete no trae la vara de la liga para la transición: no se compara contra la media.');
    const sinParciales = ciclo.cuartos.every(q => q.parcial.favor + q.parcial.contra === 0);
    if (sinParciales) add('parciales', 'error', 'Faltan los parciales por cuarto.');

    const dentro = (f) => f >= m.desde && f <= m.hasta;
    const p = (paq && paq.partidos) || {};
    const fuera = []
      .concat((p.excluidos || []).filter(x => dentro(x.fecha)).map(x => ({ x, t: 'excluido' })))
      .concat((p.parciales || []).filter(x => dentro(x.fecha)).map(x => ({ x, t: 'parcial' })));
    fuera.forEach((f) => add('partido-' + f.t, 'aviso',
      `Hay un partido ${f.t === 'excluido' ? 'excluido (no validó)' : 'con validación parcial'} dentro del rango: ${f.x.fecha} vs ${f.x.rival}. ${f.x.motivo || ''}`.trim()));

    if (!ciclo.mapa.completo) add('mapa', 'aviso',
      `El mapa con círculos y cruces tiene ${ciclo.mapa.conPuntos} de ${ciclo.mapa.de} partidos: el paquete conserva solo los últimos. Las zonas y los números sí usan los ${m.partidos}.`);

    ciclo.zonas.fugas.filter(f => f.muestraChica).forEach(f =>
      add('zona-chica-' + f.zona, 'aviso', `${f.zona} tiene ${f.i} tiros en contra: es una lectura de muestra chica.`));

    const tiros = sum(ciclo.cuartos, q => q.favor.tiros);
    const enZonas = sum(ciclo.zonas.favor, z => z.i);
    if (tiros !== enZonas) {
      /* Decisión del club (2026-11-04): un descalce de pocos tiros (hasta 2 % del
         volumen) es un aviso visible, no un bloqueo: son tiros que el paquete trae
         sin zona. Más que eso sigue siendo un error de ingesta. */
      const dif = Math.abs(tiros - enZonas), pct = dif / Math.max(tiros, enZonas, 1);
      const txt = `Los tiros por cuarto (${tiros}) no coinciden con los de las zonas (${enZonas}): ${dif} sin zona, ${(pct * 100).toFixed(1).replace('.', ',')} % del volumen.`;
      if (pct <= TOLERANCIA_TIROS) add('coherencia', 'aviso', txt + ' Las zonas se leen sobre los tiros que sí tienen ubicación.');
      else add('coherencia', 'error', txt);
    }

    add('sos', 'aviso', 'Este informe no ajusta por la fuerza de los rivales (SOS): el ajuste vive en el Simulador y se aplica al comparar ciclos.');
    return { apto: !items.some(i => i.nivel === 'error'), items };
  }

  /* ===================================================== COMPARAR */

  /**
   * Dos ciclos lado a lado. NO hay tendencia: se dicen los dos valores y la
   * diferencia como número, sin decir si es mejor o peor (la lectura la hace el
   * cuerpo técnico contra la mediana de la liga).
   */
  function comparar(a, b) {
    if (!a || !b) return null;
    const fila = (id, rotulo, va, vb, dec) => ({
      id, rotulo, a: va, b: vb,
      diferencia: (va === null || vb === null || va === undefined || vb === undefined) ? null : Math.round((vb - va) * Math.pow(10, dec)) / Math.pow(10, dec),
    });
    const filas = [
      fila('pf', 'Puntos a favor por partido', a.resultados.puntos.favorPP, b.resultados.puntos.favorPP, 1),
      fila('pc', 'Puntos en contra por partido', a.resultados.puntos.contraPP, b.resultados.puntos.contraPP, 1),
      fila('trans', 'Puntos del rival en 0-7 s por partido', a.transicion.ptsPP, b.transicion.ptsPP, 2),
    ];
    ['Z13', 'Z11', 'Z1'].forEach((id) => {
      const za = a.zonas.contra.find(z => z.zona === id), zb = b.zonas.contra.find(z => z.zona === id);
      filas.push(fila('c-' + id, `${id} en contra · puntos por tiro`, za ? za.ppt : null, zb ? zb.ppt : null, 2));
    });
    return { a: a.meta, b: b.meta, filas, nota: 'Diferencia de valores, sin juicio: la lectura contra la liga la hace el cuerpo técnico.' };
  }

  /* ===================================================== SELLO E HISTORIAL */

  /** La clave de un ciclo dentro del hash de sellados (la del equipo va aparte). */
  function claveSello(meta) {
    if (meta.tipo === 'ciclo') return `c${meta.numero}n${meta.n}`;
    if (meta.tipo === 'calendario') return `f${meta.desde}_${meta.hasta}`;
    return `p${meta.desde}_${meta.hasta}_${meta.n}`;
  }

  /**
   * La huella del ciclo: FNV-1a de 32 bits sobre lo que lo define (los partidos,
   * sus finales y los números del informe). NO incluye el mapa: depende de cuántos
   * partidos conserva el paquete, y la huella tiene que dar lo mismo en cualquier fecha.
   */
  function huella(ciclo) {
    const t = JSON.stringify([ciclo.meta.tipo, ciclo.resultados.partidos.map(p => [p.id, p.final]),
      ciclo.transicion.porOrigen, ciclo.cuartos, ciclo.zonas.favor.map(z => [z.i, z.c]),
      ciclo.zonas.contra.map(z => [z.i, z.c]), ciclo.causas.jugadores]);
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  /**
   * Prepara el registro a sellar. Solo se sella un ciclo CERRADO y APTO: uno
   * abierto cambia con el próximo partido, y uno con errores de coherencia no
   * se congela. El registro guarda el ciclo ENTERO (con su mapa de tiros): los
   * tiros viejos salen de `partidosPbp` y ese paquete solo conserva los últimos.
   */
  function sellar(paq, criterio, opciones) {
    const crit = criterio || { tipo: 'ciclo', numero: 0, n: PARTIDOS_POR_CICLO };
    const ciclo = armarVentana(paq, crit, opciones);
    if (!ciclo) return { ok: false, motivo: 'NO_EXISTE', mensaje: 'Ese ciclo no existe en el paquete del equipo.' };
    const auditoria = auditar(ciclo, paq);
    if (!ciclo.meta.cerrado) return { ok: false, motivo: 'ABIERTO', mensaje: 'El ciclo está abierto: no se sella hasta que se complete.', auditoria };
    if (!auditoria.apto) return { ok: false, motivo: 'NO_APTO', mensaje: 'La auditoría tiene errores: no se sella.', auditoria };
    const ahora = ((opciones || {}).ahora instanceof Date ? opciones.ahora : new Date()).toISOString();
    const clave = claveSello(ciclo.meta);
    return {
      ok: true, clave,
      registro: {
        version: 1, clave, huella: huella(ciclo), sellado: ahora, criterio: crit, ciclo,
        avisos: auditoria.items.filter(i => i.nivel === 'aviso').map(i => i.texto),
      },
    };
  }

  /** ¿El ciclo sellado sigue saliendo igual del paquete de hoy? INTACTO · DIVERGENTE · NO_VERIFICABLE. */
  function verificar(registro, paq) {
    if (!registro || !registro.criterio) return 'NO_VERIFICABLE';
    const ciclo = armarVentana(paq, registro.criterio, {});
    if (!ciclo) return 'NO_VERIFICABLE';
    return huella(ciclo) === registro.huella ? 'INTACTO' : 'DIVERGENTE';
  }

  /**
   * El historial: los ciclos uno al lado del otro. Cada fila trae el valor de
   * cada ciclo y la DIFERENCIA con el anterior como número. NO hay tendencia ni
   * juicio: si «subir» es mejor depende de la métrica y esa lectura es del cuerpo técnico.
   */
  function historial(registros) {
    const cs = (registros || []).map(r => r.ciclo || r).filter(c => c && c.meta)
      .sort((a, b) => (a.meta.desde < b.meta.desde ? -1 : a.meta.desde > b.meta.desde ? 1 : 0));
    const columnas = cs.map(c => ({
      rotulo: c.meta.tipo === 'ciclo' ? 'Ciclo ' + c.meta.numero : `${c.meta.desde} al ${c.meta.hasta}`,
      desde: c.meta.desde, hasta: c.meta.hasta, partidos: c.meta.partidos, cerrado: c.meta.cerrado,
    }));
    const def = [
      ['pf', 'Puntos a favor por partido', c => c.resultados.puntos.favorPP, 1],
      ['pc', 'Puntos en contra por partido', c => c.resultados.puntos.contraPP, 1],
      ['dif', 'Diferencia por partido', c => Math.round(10 * c.resultados.puntos.dif / c.meta.partidos) / 10, 1],
      ['trans', 'Puntos del rival en 0-7 s por partido', c => c.transicion.ptsPP, 2],
      ['q4', 'Parcial del último cuarto (por partido)', c => Math.round(100 * c.cuartos[3].parcial.dif / c.meta.partidos) / 100, 2],
    ];
    ['Z13', 'Z11', 'Z1'].forEach(id => def.push(['c-' + id, `${id} en contra · puntos por tiro`,
      c => { const z = c.zonas.contra.find(x => x.zona === id); return z ? z.ppt : null; }, 2]));
    const filas = def.map(([id, rotulo, f, dec]) => {
      const valores = cs.map(f);
      const deltas = valores.map((v, i) => (i === 0 || v === null || valores[i - 1] === null) ? null
        : Math.round((v - valores[i - 1]) * Math.pow(10, dec)) / Math.pow(10, dec));
      return { id, rotulo, valores, deltas };
    });
    return { columnas, filas, nota: 'Diferencia contra el ciclo anterior, sin juicio: si subir es mejor o peor lo decide el cuerpo técnico.' };
  }

  /* =====================================================================
     GESTIÓN DEL CICLO (Fase 5): estados y lecturas editables

     borrador → auditado → publicado. El admin edita las LECTURAS (texto), nunca
     los números: estos salen del paquete, que el servidor recalcula. Editar una
     lectura de un ciclo auditado lo devuelve a borrador (hay que auditar de
     nuevo); un publicado no se toca. Pure: la usan el servidor y la pantalla.
     ===================================================================== */
  const ESTADOS = ['borrador', 'auditado', 'publicado'];
  const LECTURAS = [
    { id: 'resumen', titulo: 'Resumen del ciclo' },
    { id: 'transicion', titulo: 'Transición defensiva' },
    { id: 'cuartos', titulo: 'Cuarto a cuarto' },
    { id: 'zonas', titulo: 'Zonas de tiro' },
    { id: 'cierre', titulo: 'Cierre para el cuerpo técnico' },
  ];
  const MAX_LECTURA = 1200;
  const sg = (n) => (n > 0 ? '+' : '') + String(Math.round(n * 10) / 10).replace('.', ',');
  const co = (n) => String(n === null || n === undefined ? '—' : n).replace('.', ',');

  /** Las lecturas que arma el motor con los números del ciclo: son el punto de partida de la edición. */
  function lecturasBase(c) {
    const m = c.meta, r = c.resultados;
    const tr = c.transicion;
    const orig = ORIGENES.map(o => ({ o, v: tr.porOrigen[o] })).sort((a, b) => b.v.pts - a.v.pts)[0];
    const mejorQ = c.cuartos.slice().sort((a, b) => b.parcial.dif - a.parcial.dif)[0];
    const peorQ = c.cuartos.slice().sort((a, b) => a.parcial.dif - b.parcial.dif)[0];
    const fugas = c.zonas.fugas;
    return {
      resumen: `Entre el ${m.desde} y el ${m.hasta} el equipo jugó ${m.partidos} partidos: ${r.record.g} ganados y ${r.record.p} perdidos, `
        + `con ${co(r.puntos.favorPP)} puntos a favor y ${co(r.puntos.contraPP)} en contra por partido (${sg(r.puntos.dif)} en el ciclo).`,
      transicion: `El rival anotó ${co(tr.ptsPP)} puntos por partido en los primeros 7 segundos de posesión`
        + (tr.sinVara ? '.' : ` (la liga sirve de vara en cada origen).`)
        + (orig && orig.v.pts > 0 ? ` El origen que más puntos le dio fue ${orig.o}: ${orig.v.pts} en total, ${co(orig.v.ptsPP)} por partido.` : ''),
      cuartos: `El mejor parcial fue el Q${mejorQ.cuarto} (${sg(mejorQ.parcial.dif)}) y el más flojo el Q${peorQ.cuarto} (${sg(peorQ.parcial.dif)}).`,
      zonas: fugas.length
        ? 'Las zonas donde más concedió sobre lo que rinde la liga: ' + fugas.map(z => `${z.zona} (${z.i} tiros, ${sg(z.puntosDeMas)} pts)`).join('; ') + '.'
        : 'Ninguna zona se separa de la liga en lo que concede.',
      cierre: '',
    };
  }

  /** Whitelist de ids, texto sin caracteres de control y con tope: lo que el servidor guarda. */
  function limpiarLecturas(obj) {
    const out = {};
    const ids = LECTURAS.map(l => l.id);
    Object.keys(obj || {}).forEach((k) => {
      if (ids.indexOf(k) === -1 || typeof obj[k] !== 'string') return;
      const t = obj[k].replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, MAX_LECTURA);
      if (t) out[k] = t;
    });
    return out;
  }

  /**
   * La máquina de estados. `doc` es el documento guardado (o null = borrador sin guardar).
   * Devuelve { ok, doc } o { ok:false, motivo, mensaje }. `ctx`: { ahora, por, ciclo, auditoria }.
   */
  function transicionarGestion(doc, accion, payload, ctx) {
    const p = payload || {}, c = ctx || {};
    const ahora = c.ahora || new Date().toISOString();
    const previo = doc || { estado: 'borrador', lecturas: {}, historial: [] };
    const nuevo = (estado, extra) => ({
      ok: true,
      doc: Object.assign({}, previo, extra || {}, {
        estado, actualizado: ahora,
        historial: (previo.historial || []).concat([{ estado, accion, en: ahora, por: c.por || null, nota: (p.nota || '').toString().slice(0, 300) }]),
      }),
    });
    const err = (motivo, mensaje) => ({ ok: false, motivo, mensaje });
    if (previo.estado === 'publicado') return err('PUBLICADO', 'Un ciclo publicado no se modifica.');
    if (accion === 'guardar') {
      const lecturas = Object.assign({}, previo.lecturas || {}, limpiarLecturas(p.lecturas));
      Object.keys(p.lecturas || {}).forEach((k) => { if (typeof p.lecturas[k] === 'string' && !p.lecturas[k].trim()) delete lecturas[k]; });
      return nuevo('borrador', { lecturas });
    }
    if (accion === 'auditar') {
      if (previo.estado !== 'borrador') return err('ESTADO', 'Solo un borrador se audita.');
      if (!c.auditoria || !c.auditoria.apto) return err('NO_APTO', 'La auditoría tiene errores: no pasa a auditado.');
      return nuevo('auditado', { huellaAuditada: c.ciclo ? huella(c.ciclo) : null });
    }
    if (accion === 'reabrir') {
      if (previo.estado !== 'auditado') return err('ESTADO', 'Solo un ciclo auditado se reabre.');
      return nuevo('borrador');
    }
    if (accion === 'publicar') {
      if (previo.estado !== 'auditado') return err('ESTADO', 'Primero hay que auditarlo.');
      if (!c.ciclo || !c.ciclo.meta.cerrado) return err('ABIERTO', 'El ciclo está abierto: no se publica.');
      if (!c.auditoria || !c.auditoria.apto) return err('NO_APTO', 'La auditoría tiene errores: no se publica.');
      const h = huella(c.ciclo);
      if (previo.huellaAuditada && previo.huellaAuditada !== h) return err('CAMBIO', 'El dato de origen cambió desde la auditoría: auditalo de nuevo.');
      return nuevo('publicado', { huella: h, publicado: ahora });
    }
    return err('ACCION', 'Acción desconocida.');
  }

  /* ===================================================== PLAN DE INTERVENCIÓN
     Cada meta sale de un número del ciclo y se expresa en PUNTOS POR PARTIDO que
     se recuperan al llevarla a lo que rinde la liga. Nada se inventa: lo que el
     paquete no trae (la vara de la liga) deja la meta afuera.
       zonas     defensa: lo que el rival rindió de más en esa zona · ataque: lo que se rindió de menos
       transición  el exceso del rival por origen en los primeros 7 s (ya viene por partido)
       pérdidas  la mitad de lo que el rival anotó tras pérdidas propias (criterio declarado)
     Las metas se pisan entre sí (un tiro en transición es también un tiro de una zona),
     así que la suma teórica no es un pronóstico: el escenario prudente la reduce por SOLAPE. */
  const SOLAPE_PRUDENTE = 0.5;
  const MIN_TIROS_META = 5;       // una zona con menos tiros no es meta: no hay con qué medirla
  const MIN_META_PP = 0.15;       // por debajo, la meta no pesa lo suficiente para entrar a la tabla

  function planIntervencion(c) {
    const out = { metas: [], balance: null, escenarios: null, criterio: { solape: SOLAPE_PRUDENTE, minPP: MIN_META_PP, minTiros: MIN_TIROS_META }, sinVara: false };
    if (!c || !c.meta || !c.meta.partidos) return out;
    const n = c.meta.partidos;
    const metas = out.metas;
    /* Lo recuperable en una zona usa el rendimiento AJUSTADO por muestra (K tiros de liga): 0 de 4 no
       es «cero real», y sin el ajuste las zonas de pocos tiros inflaban el total. */
    const dec = (v, d) => Number(v).toFixed(d).replace('.', ',');
    const recup = (z) => (z.pptAjustado === null || z.ligaPpt === null || z.pptAjustado === undefined) ? null : (z.pptAjustado - z.ligaPpt) * z.i;
    (c.zonas.contra || []).forEach((z) => {
      const r = recup(z);
      if (r === null || r <= 0 || z.i < MIN_TIROS_META) return;
      const pp = r2(r / n);
      if (pp < MIN_META_PP) return;
      metas.push({ id: 'def-' + z.zona, lado: 'Defensa', tipo: 'zona', zona: z.zona,
        meta: `Cerrar ${z.zona}: dejar de conceder sobre la liga`, cambio: `${dec(z.pptAjustado, 2)} → ${dec(z.ligaPpt, 2)} pts por tiro`,
        ptsPP: pp, base: `${z.i} tiros concedidos en ${n} partidos (${z.c} convertidos, ${dec(z.pct, 1)} %), ${dec(z.ppt, 2)} pts por tiro crudo y ${dec(z.pptAjustado, 2)} ajustado por muestra, liga ${dec(z.ligaPpt, 2)}`, muestraChica: z.muestraChica });
    });
    (c.zonas.favor || []).forEach((z) => {
      const r = recup(z);
      if (r === null || r >= 0 || z.i < MIN_TIROS_META) return;
      const pp = r2(-r / n);
      if (pp < MIN_META_PP) return;
      metas.push({ id: 'atq-' + z.zona, lado: 'Ataque', tipo: 'zona', zona: z.zona,
        meta: `Recuperar el rendimiento de ${z.zona}`, cambio: `${dec(z.pptAjustado, 2)} → ${dec(z.ligaPpt, 2)} pts por tiro`,
        ptsPP: pp, base: `${z.i} tiros propios en ${n} partidos (${z.c} convertidos, ${dec(z.pct, 1)} %), ${dec(z.ppt, 2)} pts por tiro crudo y ${dec(z.pptAjustado, 2)} ajustado por muestra, liga ${dec(z.ligaPpt, 2)}`, muestraChica: z.muestraChica });
    });
    const tr = c.transicion || {};
    if (tr.sinVara) out.sinVara = true;
    ORIGENES.forEach((o) => {
      const x = (tr.porOrigen || {})[o];
      if (!x || !x.liga || !(x.exceso >= MIN_META_PP)) return;
      metas.push({ id: 'tr-' + o, lado: 'Defensa', tipo: 'transicion', origen: o,
        meta: `Transición 0-7 s tras ${o}: bajar lo que anota el rival`, cambio: `${dec(x.ptsPP, 2)} → ${dec(x.liga.ptsPP, 2)} pts por partido`,
        ptsPP: x.exceso, base: `franja 0-7 s, ${x.tiros} tiros del rival en ${n} partidos (${dec(x.tirosPP, 2)} por partido, liga ${dec(x.liga.tirosPP, 2)}), ${x.pts} pts, ${x.perd} pérdidas` });
    });
    const perdidas = (c.causas.jugadores || []).reduce((t, j) => t + j.perdidas, 0);
    const ptsPerd = (c.causas.jugadores || []).reduce((t, j) => t + j.puntosRival, 0);
    if (ptsPerd > 0) {
      const pp = r2(ptsPerd / n * 0.5);
      if (pp >= MIN_META_PP) metas.push({ id: 'atq-perdidas', lado: 'Ataque', tipo: 'perdidas',
        meta: 'Cuidar la pelota: bajar a la mitad las pérdidas que el rival convierte', cambio: `${ptsPerd} → ${dec(ptsPerd / 2, 1)} pts del rival en ${n} partidos`,
        ptsPP: pp, base: `${perdidas} pérdidas propias en ${n} partidos que valieron ${ptsPerd} pts al rival (${dec(ptsPerd / n, 1)} por partido). Criterio: la mitad, no la liga` });
    }
    metas.sort((a, b) => b.ptsPP - a.ptsPP);
    const ataque = r2(sum(metas.filter(m => m.lado === 'Ataque'), m => m.ptsPP));
    const defensa = r2(sum(metas.filter(m => m.lado === 'Defensa'), m => m.ptsPP));
    const total = r2(ataque + defensa);
    out.balance = { ataque, defensa, total, pctAtaque: total ? r1(100 * ataque / total) : null, pctDefensa: total ? r1(100 * defensa / total) : null };
    const margen = c.resultados && c.resultados.puntos ? r1(c.resultados.puntos.dif / n) : null;
    const prudente = r1(total * SOLAPE_PRUDENTE);
    out.escenarios = {
      teorico: r1(total), prudente, margenActual: margen,
      margenTeorico: margen === null ? null : r1(margen + total), margenPrudente: margen === null ? null : r1(margen + prudente),
      siguiente: c.meta.numero === null || c.meta.numero === undefined ? null : c.meta.numero + 1,
    };
    return out;
  }

  return {
    planIntervencion, SOLAPE_PRUDENTE,
    PARTIDOS_POR_CICLO, K_MUESTRA, MIN_TIROS_ZONA, ORIGENES, ZONAS, ESTADOS, LECTURAS, MAX_LECTURA,
    lecturasBase, limpiarLecturas, transicionarGestion,
    partidosDe, ventanas, armarCiclo, armarVentana, claveSello, huella, sellar, verificar, historial, auditar, comparar,
    transicion, causas, cuartos, zonas, tirosDelCiclo, resultados,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CICLOS;
