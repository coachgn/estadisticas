/* ARCHIVO GENERADO · NO EDITAR ACÁ.
 *
 * Copia mecánica de js/sgadd-cancha.js, que es la fuente de verdad.
 * Existe porque Vercel despliega con raíz en `server/` y no sube el
 * resto del repo. Para regenerar:
 *
 *     node server/bin/sincronizar-compartido.js
 *
 * `test-backend.js` falla si este archivo difiere del original.
 */
/* ============================================================================
   SGADD_CANCHA · LA CANCHA VECTORIAL UNIFICADA (PURO, sin `document`)

   Un solo lugar que sabe dibujar la media cancha: la geometría medida de las
   14 zonas, los tiros como ○ verdes (aciertos) y ✕ rojas (errados) y el
   PERÍMETRO FINO que lleva el ojo del párrafo al sector exacto («Z13»).

   Lo usan el informe de ciclo (panel y PDF) y, a medida que se migren, los
   mapas del play-by-play. La geometría es la MISMA de SGADD_PBP (hay un test
   de equivalencia: test-cancha.js): si se recalibra en la ingesta, manda
   `liga.geometria` del paquete.

   Todo lo que se dibuja lleva sus colores y trazos EN LÍNEA: el SVG tiene que
   verse igual en el panel, en el PDF que arma el servidor y pegado en un mail,
   sin depender de que exista una hoja de estilos.

   Un acierto y un error no se distinguen solo por color (punto 14): son
   formas distintas (círculo y cruz).
   ============================================================================ */
const SGADD_CANCHA = (function () {
  'use strict';

  /* Respaldo de la geometría medida en motorstats-ingestion/src/pbp/avanzado.js. */
  const GEOMETRIA = {
    aro: [1.575, 7.5], r1: 2.35, r2: 4.8, triple: 6.75, esquina: 6.6, finEsquina: 2.99,
    anguloCorta: 31, anguloFrontal: 18, anguloFondo: 53, anguloEsquina: 71,
  };
  const ZONAS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7', 'Z8', 'Z9', 'Z10', 'Z11', 'Z12', 'Z13', 'Z14'];
  const NOMBRES_ZONA = {
    Z1: 'Bajo el aro', Z2: 'Corta izquierda', Z3: 'Corta frontal', Z4: 'Corta derecha',
    Z5: 'Media fondo izquierdo', Z6: 'Media ala izquierda', Z7: 'Media frontal', Z8: 'Media ala derecha',
    Z9: 'Media fondo derecho', Z10: 'Triple esquina izquierda', Z11: 'Triple ala izquierda', Z12: 'Triple frontal',
    Z13: 'Triple ala derecha', Z14: 'Triple esquina derecha',
  };

  const COLOR = { acierto: '#16a34a', error: '#dc2626', linea: '#6b7280', perimetro: '#f7941e', halo: '#ffffff' };
  const VIEWBOX = '-4 -4 158 148';

  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const rad = (g) => g * Math.PI / 180;
  const f1 = (n) => (Math.round(n * 10) / 10).toString();

  /* ===================================================== GEOMETRÍA (PURO) */

  function geometria(paq) {
    return Object.assign({}, GEOMETRIA, (paq && paq.liga && paq.liga.geometria) || {});
  }

  function esTriple(fondo, lateral, G) {
    if (fondo < G.finEsquina) return Math.abs(lateral - G.aro[1]) > G.esquina;
    return Math.hypot(fondo - G.aro[0], lateral - G.aro[1]) > G.triple;
  }

  /** La zona de una posición. «Izquierda» del atacante = lateral mayor que el aro. */
  function zonaGeometrica(fondo, lateral, g) {
    const G = g || GEOMETRIA;
    const dx = fondo - G.aro[0], dy = lateral - G.aro[1];
    const d = Math.hypot(dx, dy);
    const a = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
    const izq = dy > 0;
    if (esTriple(fondo, lateral, G)) {
      if (a >= G.anguloEsquina) return izq ? 'Z10' : 'Z14';
      if (a < G.anguloFrontal) return 'Z12';
      return izq ? 'Z11' : 'Z13';
    }
    if (d < G.r1) return 'Z1';
    if (d < G.r2) return a < G.anguloCorta ? 'Z3' : (izq ? 'Z2' : 'Z4');
    if (a < G.anguloFrontal) return 'Z7';
    if (a < G.anguloFondo) return izq ? 'Z6' : 'Z8';
    return izq ? 'Z5' : 'Z9';
  }

  function lineaTriple(angulo, G) {
    const a = Math.abs(angulo);
    if (G.aro[0] + G.triple * Math.cos(rad(a)) >= G.finEsquina) return G.triple;
    const s = Math.sin(rad(a));
    return s > 0 ? Math.min(40, G.esquina / s) : 40;
  }

  const geoCache = new Map();
  /** Los 14 polígonos en metros [fondo, lateral] y el punto de la etiqueta de cada zona. PURA, con caché. */
  function geometriaZonas(g) {
    const G = Object.assign({}, GEOMETRIA, g || {});
    const clave = JSON.stringify(G);
    if (geoCache.has(clave)) return geoCache.get(clave);
    const C = G.anguloCorta, F = G.anguloFrontal, B = G.anguloFondo, E = G.anguloEsquina;
    const k = (v) => () => v;
    const L = (a) => lineaTriple(a, G);
    const def = {
      Z1: [-180, 180, k(0), k(G.r1)],
      Z2: [C, 180, k(G.r1), k(G.r2)], Z3: [-C, C, k(G.r1), k(G.r2)], Z4: [-180, -C, k(G.r1), k(G.r2)],
      Z5: [B, 180, k(G.r2), L], Z6: [F, B, k(G.r2), L], Z7: [-F, F, k(G.r2), L], Z8: [-B, -F, k(G.r2), L], Z9: [-180, -B, k(G.r2), L],
      Z10: [E, 180, L, k(40)], Z11: [F, E, L, k(40)], Z12: [-F, F, L, k(40)], Z13: [-E, -F, L, k(40)], Z14: [-180, -E, L, k(40)],
    };
    const punto = (a, t) => [G.aro[0] + t * Math.cos(rad(a)), G.aro[1] + t * Math.sin(rad(a))];
    const out = {};
    ZONAS.forEach((z) => {
      const [a0, a1, rin, rout] = def[z];
      const pasos = Math.max(2, Math.round(a1 - a0));
      const adentro = [], afuera = [];
      for (let i = 0; i <= pasos; i++) {
        const a = a0 + (a1 - a0) * i / pasos;
        adentro.push(punto(a, rin(a)));
        afuera.push(punto(a, rout(a)));
      }
      out[z] = { poligono: z === 'Z1' ? afuera : adentro.concat(afuera.reverse()), etiqueta: null };
    });
    const muestras = {};
    ZONAS.forEach((z) => { muestras[z] = []; });
    for (let f = 0.1; f < 14; f += 0.2) {
      for (let l = 0.1; l < 15; l += 0.2) {
        const z = zonaGeometrica(f, l, G);
        const d = Math.hypot(f - G.aro[0], l - G.aro[1]);
        if (/^Z1[0-4]$/.test(z) && d > G.triple + 2.5) continue;
        muestras[z].push([f, l]);
      }
    }
    const aMano = {
      Z1: [G.aro[0] + 1.25, G.aro[1]],
      Z5: [1.5, G.aro[1] + 5.1], Z9: [1.5, G.aro[1] - 5.1],
      Z10: [G.finEsquina + 0.7, G.aro[1] + 6.5], Z14: [G.finEsquina + 0.7, G.aro[1] - 6.5],
    };
    ZONAS.forEach((z) => {
      const m = muestras[z];
      if (!m.length) return;
      if (aMano[z] && zonaGeometrica(aMano[z][0], aMano[z][1], G) === z) { out[z].etiqueta = aMano[z]; return; }
      const mf = m.reduce((a, p) => a + p[0], 0) / m.length, ml = m.reduce((a, p) => a + p[1], 0) / m.length;
      let mejor = m[0], dm = Infinity;
      m.forEach((p) => { const d = (p[0] - mf) ** 2 + (p[1] - ml) ** 2; if (d < dm) { dm = d; mejor = p; } });
      out[z].etiqueta = mejor;
    });
    geoCache.set(clave, out);
    return out;
  }

  /* 10 unidades = 1 m. X espejada: la derecha del atacante, a la derecha. */
  const X = (lateral) => (15 - lateral) * 10;
  const Y = (fondo) => fondo * 10;

  /* ===================================================== PIEZAS DEL DIBUJO */

  function lineasCancha(G) {
    const u = G.finEsquina;
    const xi = X(G.aro[1] - G.esquina), xd = X(G.aro[1] + G.esquina);
    return `<g class="cancha-lineas" fill="none" stroke="${COLOR.linea}" stroke-width="0.8" pointer-events="none">`
      + '<rect x="0" y="0" width="150" height="140"/>'
      + `<rect x="${f1(X(7.5 + 2.45))}" y="0" width="49" height="58"/>`
      + `<circle cx="${f1(X(G.aro[1]))}" cy="${f1(Y(G.aro[0]))}" r="2.25"/>`
      + `<line x1="${f1(xi)}" y1="0" x2="${f1(xi)}" y2="${f1(Y(u))}"/>`
      + `<line x1="${f1(xd)}" y1="0" x2="${f1(xd)}" y2="${f1(Y(u))}"/>`
      + `<path d="M ${f1(xi)} ${f1(Y(u))} A ${G.triple * 10} ${G.triple * 10} 0 0 1 ${f1(xd)} ${f1(Y(u))}"/>`
      + '</g>';
  }

  /** El tiro como círculo (acierto) o cruz (error). Trazo fino, sin relleno. */
  function marcador(x, y, convertido, r) {
    const R = r || 1.45;
    if (convertido) {
      return `<circle class="cancha-tiro-c" cx="${f1(x)}" cy="${f1(y)}" r="${R}" fill="none" stroke="${COLOR.acierto}" stroke-width="0.55"/>`;
    }
    const d = R * 0.8;
    return `<path class="cancha-tiro-e" d="M${f1(x - d)} ${f1(y - d)}L${f1(x + d)} ${f1(y + d)}M${f1(x + d)} ${f1(y - d)}L${f1(x - d)} ${f1(y + d)}" fill="none" stroke="${COLOR.error}" stroke-width="0.7" stroke-linecap="round"/>`;
  }

  /**
   * Los tiros de un paquete: [lateral×10, fondo×10, convertido, zonaIdx, tirador, …].
   * Solo se dibujan los que caen en la zona que les puso la plataforma (el ~1 %
   * restante son coordenadas cargadas en la mitad equivocada: se cuentan, no
   * se dibujan en mitad de cancha). Sin `zonaIdx` se dibujan todos.
   * @returns {{svg:string, convertidos:number, errados:number, sinUbicar:number}}
   */
  function capaTiros(tiros, o) {
    const opc = Object.assign({ geometria: GEOMETRIA, zonasOrden: ZONAS, soloZonas: null, soloCoherentes: true, radio: 1.45 }, o);
    const filtro = opc.soloZonas ? new Set([].concat(opc.soloZonas)) : null;
    let convertidos = 0, errados = 0, sinUbicar = 0;
    const partes = [];
    (tiros || []).forEach((p) => {
      if (!Array.isArray(p) || !isFinite(p[0]) || !isFinite(p[1])) return;
      const zonaEtiqueta = p[3] === undefined || p[3] === null ? null : opc.zonasOrden[p[3]];
      const zonaPos = zonaGeometrica(p[1] / 10, p[0] / 10, opc.geometria);
      if (filtro && !filtro.has(zonaEtiqueta || zonaPos)) return;
      if (opc.soloCoherentes && zonaEtiqueta && zonaEtiqueta !== zonaPos) { sinUbicar++; return; }
      if (p[2]) convertidos++; else errados++;
      partes.push(marcador(X(p[0] / 10), Y(p[1] / 10), !!p[2], opc.radio));
    });
    return { svg: partes.join(''), convertidos, errados, sinUbicar };
  }

  /* ===================================================== ZONAS Y PERÍMETROS */

  const ID_ZONA = /^Z(?:1[0-4]|[1-9])$/;
  /** Acepta 'Z13' o { id:'Z13', punteado:true, rotulo:'…' } y devuelve objetos limpios. */
  function normalizarResaltes(r) {
    const vistos = new Set();
    const out = [];
    [].concat(r || []).forEach((it) => {
      const o = typeof it === 'string' ? { id: it } : (it || {});
      const id = String(o.id || '').toUpperCase();
      if (!ID_ZONA.test(id) || vistos.has(id)) return;
      vistos.add(id);
      out.push({ id, punteado: !!o.punteado, rotulo: o.rotulo === undefined ? id : o.rotulo });
    });
    return out;
  }

  function puntosSvg(poligono) {
    return poligono.map(([fondo, lateral]) => f1(X(lateral)) + ',' + f1(Y(fondo))).join(' ');
  }

  /**
   * El perímetro fino de una zona: un halo blanco debajo, para que se lea sobre
   * cualquier relleno, y el trazo del acento encima. Sin relleno: no tapa nada.
   */
  function perimetro(id, geo, o) {
    const z = geo[id];
    if (!z) return '';
    const op = Object.assign({ punteado: false, rotulo: id, oculto: false, ancho: 0.8 }, o);
    const pts = puntosSvg(z.poligono);
    const dash = op.punteado ? ' stroke-dasharray="2.2 1.6"' : '';
    const estilo = op.oculto ? ' style="opacity:0"' : '';
    let rotulo = '';
    if (op.rotulo && z.etiqueta) {
      rotulo = `<text x="${f1(X(z.etiqueta[1]))}" y="${f1(Y(z.etiqueta[0]) + 1.6)}" text-anchor="middle" `
        + 'font-size="4.6" font-weight="700" fill="#0f1b2e" stroke="#fff" stroke-width="1.1" paint-order="stroke" stroke-linejoin="round">'
        + esc(op.rotulo) + '</text>';
    }
    return `<g class="cancha-perimetro" data-cancha-zona="${id}"${op.oculto ? '' : ' data-siempre="1"'}${estilo} pointer-events="none">`
      + `<polygon points="${pts}" fill="none" stroke="${COLOR.halo}" stroke-width="${op.ancho + 1.4}" stroke-linejoin="round" opacity="0.85"/>`
      + `<polygon points="${pts}" fill="none" stroke="${COLOR.perimetro}" stroke-width="${op.ancho}" stroke-linejoin="round"${dash}/>`
      + rotulo + '</g>';
  }

  /** Rellenos por zona: { Z13: { fill:'#…', opacidad:.8, titulo:'…' } }. */
  function rellenos(zonas, geo) {
    return Object.keys(zonas || {}).filter(id => geo[id]).map((id) => {
      const z = zonas[id] || {};
      if (!z.fill) return '';
      const t = z.titulo ? `<title>${esc(z.titulo)}</title>` : '';
      return `<polygon class="cancha-zona" data-cancha-zona="${id}" points="${puntosSvg(geo[id].poligono)}" fill="${esc(z.fill)}" fill-opacity="${z.opacidad === undefined ? 0.85 : z.opacidad}" stroke="none">${t}</polygon>`;
    }).join('');
  }

  /**
   * El C/I de cada zona escrito sobre la cancha: { Z13: '14/39' }. Debajo del
   * código de la zona si esa zona está citada (el código ocupa el punto);
   * si no, en el punto de la etiqueta. Trazo claro detrás para leerse sobre
   * cualquier relleno.
   */
  function rotulosZona(rot, geo, citadas) {
    if (!rot) return '';
    return '<g class="cancha-rotulos" pointer-events="none">' + Object.keys(rot).filter(id => geo[id] && geo[id].etiqueta && rot[id]).map((id) => {
      const e = geo[id].etiqueta, dy = citadas && citadas.has(id) ? 6.2 : 1.6;
      return `<text x="${f1(X(e[1]))}" y="${f1(Y(e[0]) + dy)}" text-anchor="middle" font-size="4.2" font-weight="700" fill="#0f1b2e" stroke="#fff" stroke-width="1.1" paint-order="stroke" stroke-linejoin="round">${esc(rot[id])}</text>`;
    }).join('') + '</g>';
  }

  /* ===================================================== EL SVG */

  let serie = 0;

  /**
   * La media cancha completa.
   * @param {object} o
   *  - geometria     objeto de geometría (por defecto la medida)
   *  - zonas         { Z13: { fill, opacidad, titulo } }  rellenos
   *  - tiros         [[lateral×10, fondo×10, conv, zonaIdx], …]
   *  - zonasOrden    el orden de `zonas` del paquete (por defecto Z1…Z14)
   *  - soloZonas     dibujar los tiros de esas zonas nada más
   *  - resaltar      ['Z13', { id:'Z1', punteado:true }] → perímetro fino siempre visible
   *  - interactivo   dibuja los 14 perímetros ocultos para que el texto los encienda (hover/foco)
   *  - etiquetas     true: el código de cada zona resaltada (por defecto true)
   *  - rotulo        aria-label
   * @returns {{svg:string, convertidos:number, errados:number, sinUbicar:number, resaltadas:string[]}}
   */
  function svg(o) {
    const opc = Object.assign({ geometria: GEOMETRIA, zonas: null, tiros: null, zonasOrden: ZONAS, soloZonas: null,
      resaltar: [], interactivo: false, etiquetas: true, rotulo: 'Mapa de tiro' }, o);
    const G = Object.assign({}, GEOMETRIA, opc.geometria || {});
    const geo = geometriaZonas(G);
    const clip = 'cancha-clip-' + (++serie);
    const resaltes = normalizarResaltes(opc.resaltar);
    const fijos = new Set(resaltes.map(r => r.id));
    const capa = opc.tiros ? capaTiros(opc.tiros, { geometria: G, zonasOrden: opc.zonasOrden, soloZonas: opc.soloZonas }) : { svg: '', convertidos: 0, errados: 0, sinUbicar: 0 };

    let oculto = '';
    if (opc.interactivo) {
      oculto = ZONAS.filter(id => !fijos.has(id)).map(id => perimetro(id, geo, { rotulo: opc.etiquetas ? id : '', oculto: true })).join('');
    }
    const fijas = resaltes.map(r => perimetro(r.id, geo, { punteado: r.punteado, rotulo: opc.etiquetas ? r.rotulo : '' })).join('');
    const aria = `${opc.rotulo}${capa.convertidos + capa.errados ? `: ${capa.convertidos} de ${capa.convertidos + capa.errados} tiros de campo convertidos` : ''}`
      + (resaltes.length ? `. Zonas resaltadas: ${resaltes.map(r => r.id + ' ' + (NOMBRES_ZONA[r.id] || '')).join(', ')}` : '');

    const out = `<svg class="cancha-svg" viewBox="${VIEWBOX}" role="img" aria-label="${esc(aria)}" style="width:100%;max-width:440px;height:auto;display:block;margin:0 auto">`
      + `<defs><clipPath id="${clip}"><rect x="0" y="0" width="150" height="140"/></clipPath></defs>`
      + `<g clip-path="url(#${clip})">${rellenos(opc.zonas, geo)}</g>`
      + lineasCancha(G)
      + `<g clip-path="url(#${clip})">${oculto}${fijas}</g>`
      + rotulosZona(opc.rotulosZona, geo, fijos)
      + `<g class="cancha-tiros" pointer-events="none">${capa.svg}</g>`
      + '</svg>';
    return { svg: out, convertidos: capa.convertidos, errados: capa.errados, sinUbicar: capa.sinUbicar, resaltadas: resaltes.map(r => r.id) };
  }

  /** La leyenda de las marcas: forma distinta además del color. */
  function leyenda(o) {
    const rel = o && o.rellenos
      ? `<span><svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" style="vertical-align:-2px"><rect x="1" y="2" width="12" height="8" fill="${o.bueno || COLOR.acierto}" fill-opacity=".45"/></svg> ${esc(o.rotuloBueno || 'mejor que la liga')}</span>`
        + `<span><svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" style="vertical-align:-2px"><rect x="1" y="2" width="12" height="8" fill="${o.malo || COLOR.error}" fill-opacity=".45"/></svg> ${esc(o.rotuloMalo || 'peor que la liga')}</span>`
        + '<span><svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" style="vertical-align:-2px"><rect x="1" y="2" width="12" height="8" fill="#94a3b8" fill-opacity=".3"/></svg> muestra chica</span>'
      : '';
    return '<p class="cancha-leyenda" style="display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:center;font-size:12px;margin:6px 0 0">' + rel
      + `<span><svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true" style="vertical-align:-2px"><circle r="4" fill="none" stroke="${COLOR.acierto}" stroke-width="1.4"/></svg> acierto</span>`
      + `<span><svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true" style="vertical-align:-2px"><path d="M-4 -4L4 4M4 -4L-4 4" fill="none" stroke="${COLOR.error}" stroke-width="1.6" stroke-linecap="round"/></svg> error</span>`
      + `<span><svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" style="vertical-align:-2px"><rect x="1" y="2" width="12" height="8" fill="none" stroke="${COLOR.perimetro}" stroke-width="1.2"/></svg> zona citada</span></p>`;
  }

  /* ===================================================== EL TEXTO ↔ LA ZONA */

  /** Las zonas que nombra un texto, en orden y sin repetir: «{{Z13}}» o un «Z13» suelto. */
  function zonasMencionadas(texto) {
    const out = [];
    const re = /\{\{\s*(Z(?:1[0-4]|[1-9]))\s*\}\}|\b(Z(?:1[0-4]|[1-9]))\b/g;
    let m;
    const s = String(texto == null ? '' : texto);
    while ((m = re.exec(s))) {
      const id = m[1] || m[2];
      if (out.indexOf(id) === -1) out.push(id);
    }
    return out;
  }

  /**
   * El texto con cada zona citada como botón que enciende su perímetro.
   * Escapa TODO el texto (viene de redacciones) y solo después arma los botones.
   * Reconoce «{{Z13}}» y también «Z13» suelto.
   */
  function enlazarZonas(texto) {
    const s = esc(texto);
    return s.replace(/\{\{\s*(Z(?:1[0-4]|[1-9]))\s*\}\}|\b(Z(?:1[0-4]|[1-9]))\b/g, (todo, a, b) => {
      const id = a || b;
      return `<button type="button" class="cancha-zona-ref" data-cancha-ref="${id}" title="${esc(NOMBRES_ZONA[id])}" `
        + 'style="font:inherit;font-weight:700;padding:0 3px;border:0;border-bottom:1.5px solid #f7941e;background:transparent;color:inherit;cursor:pointer">'
        + id + '</button>';
    });
  }

  /**
   * Engancha, por delegación y UNA vez, el hover, el foco y el toque: dentro de
   * un `[data-cancha-bloque]`, citar una zona enciende su perímetro en el SVG
   * interactivo del mismo bloque. Un toque lo FIJA hasta el siguiente.
   * Sin `document` (Node) no hace nada.
   */
  function activar(raiz) {
    const doc = raiz || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.addEventListener || doc.__canchaActiva) return false;
    doc.__canchaActiva = true;
    const bloqueDe = (n) => (n && n.closest ? n.closest('[data-cancha-bloque]') : null);
    const prender = (bloque, id) => {
      if (!bloque) return;
      bloque.querySelectorAll('.cancha-perimetro').forEach((g) => {
        if (g.getAttribute('data-cancha-zona') === id) g.style.opacity = '1';
      });
    };
    const apagar = (bloque) => {
      if (!bloque) return;
      bloque.querySelectorAll('.cancha-perimetro').forEach((g) => {
        if (g.getAttribute('data-fijo') !== '1' && !g.hasAttribute('data-siempre')) g.style.opacity = '0';
      });
    };
    const ref = (e) => (e.target && e.target.closest ? e.target.closest('[data-cancha-ref]') : null);
    ['mouseover', 'focusin'].forEach((ev) => doc.addEventListener(ev, (e) => {
      const r = ref(e); if (!r) return;
      prender(bloqueDe(r), r.getAttribute('data-cancha-ref'));
    }));
    ['mouseout', 'focusout'].forEach((ev) => doc.addEventListener(ev, (e) => {
      const r = ref(e); if (!r) return;
      apagar(bloqueDe(r));
    }));
    doc.addEventListener('click', (e) => {
      const r = ref(e); if (!r) return;
      const b = bloqueDe(r);
      if (!b) return;
      b.querySelectorAll('.cancha-perimetro').forEach((g) => g.setAttribute('data-fijo', '0'));
      const g = b.querySelector(`.cancha-perimetro[data-cancha-zona="${r.getAttribute('data-cancha-ref')}"]`);
      if (g) { g.setAttribute('data-fijo', '1'); g.style.opacity = '1'; }
      b.querySelectorAll('.cancha-perimetro').forEach((x) => { if (x !== g && !x.hasAttribute('data-siempre')) x.style.opacity = '0'; });
    });
    return true;
  }

  return {
    GEOMETRIA, ZONAS, NOMBRES_ZONA, COLOR, VIEWBOX,
    geometria, zonaGeometrica, geometriaZonas, lineaTriple, esTriple,
    lineasCancha, marcador, capaTiros, perimetro, rotulosZona, svg, leyenda,
    zonasMencionadas, enlazarZonas, normalizarResaltes, activar,
    X, Y,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CANCHA;
