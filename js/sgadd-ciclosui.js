/* =====================================================================
   SGADD · Sección CICLOS · la pantalla (Fase 3)

   El motor puro es `sgadd-ciclos.js` (datos) y `sgadd-cancha.js` (el SVG).
   Acá vive lo que toca `document`. El informe de ciclo de 4 partidos deja
   de ser un archivo externo: sale del bloque `ciclos` del paquete de
   laboratorio del equipo (`SGADD_PBP.pedir`).

   REGLAS
   - Sin el bloque `ciclos` (paquete viejo) la sección lo DICE: no inventa.
   - Un ciclo abierto (menos de N partidos) se muestra marcado y no se
     presenta como cerrado.
   - Los textos que citan una zona (Z13, Z1…) son botones: al pasar o tocar
     se enciende su perímetro en la cancha del mismo bloque.
   - La auditoría completa es del admin; el cliente ve el estado y los
     avisos que afectan la lectura.
   ===================================================================== */

const SGADD_CICLOSUI = (function () {
  'use strict';

  const CI = (typeof SGADD_CICLOS !== 'undefined') ? SGADD_CICLOS
    : (typeof require !== 'undefined' ? require('./sgadd-ciclos.js') : null);
  const CA = (typeof SGADD_CANCHA !== 'undefined') ? SGADD_CANCHA
    : (typeof require !== 'undefined' ? require('./sgadd-cancha.js') : null);

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc)
    ? SGADD_UI.esc(v) : String(v == null ? '' : v);
  const escJs = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.escJs)
    ? SGADD_UI.escJs(v) : String(v == null ? '' : v);

  const estado = {
    seccion: 'principal', // una de SECCIONES
    equipo: null,        // nombre del equipo (el del paquete)
    ciclo: null,         // número del ciclo elegido (null = el último)
    comparar: null,      // número del ciclo contra el que se compara (null = ninguno)
    lado: 'contra',      // mapa: 'contra' (lo que concede) | 'favor'
    paq: null, paqDe: null, error: null, cargando: false,
    sellados: [],        // los ciclos sellados del equipo (servidor)
    sellando: false,
    /* Cerrar un ciclo y lo que ve el cuerpo técnico (2026-11-06). */
    publicados: [],      // [{clave, publicado, meta}] del equipo
    envioClientes: false, // el servidor deja mandar a los entrenadores (CICLOS_ENVIO_CLIENTES)
    modelo: null,        // el informe armado que se ve: de ahí sale la foto
    cierre: null,        // el modal abierto: { num, publicar, enviar, yendo, resultado, error }
    pubClave: null, foto: null, fotoDe: null, fotoError: null, // el cliente: el ciclo publicado abierto
  };

  const f1 = (v) => (v === null || v === undefined || !isFinite(v)) ? '—' : String(Math.round(v * 10) / 10).replace('.', ',');
  const f2 = (v) => (v === null || v === undefined || !isFinite(v)) ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
  const signo = (v, d) => (v === null || v === undefined || !isFinite(v)) ? '—' : (v > 0 ? '+' : '') + (d === 2 ? f2(v) : f1(v));
  const dia = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}` : esc(iso); };

  const esAdmin = () => typeof SGADD_AUTH !== 'undefined' && SGADD_AUTH.rol && SGADD_AUTH.rol() === (SGADD_AUTH.ROLES || {}).ADMIN;

  /* ===================================================== BLOQUES */

  function bloqueResultados(c) {
    const r = c.resultados;
    return `<div class="rend-card">
      <h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">Los ${c.meta.partidos} partidos</h3>
      <div class="scrollbox"><table class="w-full text-xs"><thead><tr class="text-muted">
        <th>Fecha</th><th>Rival</th><th>Cond.</th><th>Marcador</th><th>Res.</th></tr></thead><tbody>
        ${r.partidos.map(p => `<tr><td>${dia(p.fecha)}</td><td>${esc(p.rival)}</td><td>${p.condicion === 'LOCAL' ? 'L' : 'V'}</td>
          <td class="whitespace-nowrap">${p.final[0]} - ${p.final[1]}</td>
          <td><span class="${p.resultado === 'G' ? 'zona-texto zona-exito' : 'zona-texto zona-peligro'}">${p.resultado === 'G' ? '✓ G' : '✗ P'}</span></td></tr>`).join('')}
      </tbody></table></div>
      <p class="text-[11px] text-muted mt-2">${r.record.g}-${r.record.p} · ${f1(r.puntos.favorPP)} a favor y ${f1(r.puntos.contraPP)} en contra por partido (${signo(r.puntos.dif)} en el ciclo).</p>
    </div>`;
  }

  const NOMBRE_ORIGEN = { RD: 'Tras rebote defensivo', ROBO: 'Tras robo', SAQUE: 'Tras saque', MUERTA: 'Pelota muerta', PERIODO: 'Inicio de período' };

  function bloqueTransicion(c) {
    const t = c.transicion;
    const max = Math.max(0.01, ...CI.ORIGENES.map(o => Math.max(t.porOrigen[o].ptsPP, (t.porOrigen[o].liga || {}).ptsPP || 0)));
    const filas = CI.ORIGENES.filter(o => t.porOrigen[o].tiros || t.porOrigen[o].perd).map((o) => {
      const x = t.porOrigen[o];
      const w = Math.round(100 * x.ptsPP / max), wl = x.liga ? Math.round(100 * x.liga.ptsPP / max) : null;
      const tono = x.exceso === undefined ? '' : (x.exceso > 0.15 ? 'zona-peligro' : x.exceso < -0.15 ? 'zona-exito' : 'zona-neutro');
      return `<div class="mb-2">
        <div class="flex justify-between text-[11px]"><span>${NOMBRE_ORIGEN[o]}</span>
          <span class="zona-texto ${tono}">${f2(x.ptsPP)} pts/partido${x.exceso === undefined ? '' : ` · ${signo(x.exceso, 2)} vs liga ${x.exceso > 0.15 ? '▲' : x.exceso < -0.15 ? '▼' : '●'}`}</span></div>
        <div style="position:relative;height:8px;background:rgba(148,163,184,.18);border-radius:4px" role="img"
             aria-label="${esc(NOMBRE_ORIGEN[o])}: ${f2(x.ptsPP)} puntos por partido${x.liga ? ', liga ' + f2(x.liga.ptsPP) : ''}">
          <div style="width:${w}%;height:100%;background:#f7941e;border-radius:4px"></div>
          ${wl === null ? '' : `<div style="position:absolute;top:-2px;left:${wl}%;width:2px;height:12px;background:#e5e7eb"></div>`}</div>
        <div class="text-[10px] text-muted">${x.tiros} tiros (${x.conv} convertidos) · ${x.perd} pérdidas propias del rival</div></div>`;
    }).join('');
    return `<div class="rend-card">
      <h3 class="font-display uppercase tracking-wide text-xs text-ink mb-1">Lo que el rival hace en los primeros 7 s</h3>
      <p class="text-[11px] text-muted mb-2">Puntos por partido del rival según cómo nació su posesión; el trazo claro es la media de la liga.</p>
      ${filas || '<p class="text-xs text-muted">Sin finales en 0-7 s en el ciclo.</p>'}
      ${t.sinVara ? '<p class="text-[11px] text-muted">Este paquete no trae la vara de la liga: no se compara.</p>' : ''}
      <p class="text-[11px] mt-2">Total: <b>${f2(t.ptsPP)}</b> pts por partido.</p>
    </div>`;
  }

  function bloqueCausas(c) {
    const k = c.causas;
    const top = k.jugadores.slice(0, 3);
    return `<div class="rend-card">
      <h3 class="font-display uppercase tracking-wide text-xs text-ink mb-1">Qué las genera</h3>
      <p class="text-xs">${k.nROBO} salidas tras robo y ${k.nRD} tras rebote rival que terminaron en tiro.</p>
      ${top.length ? `<ul class="text-xs mt-2 space-y-1">${top.map(j => `<li>${esc(j.nombre)}: <b>${j.perdidas}</b> pérdidas que valieron <b>${j.puntosRival}</b> pts al rival</li>`).join('')}</ul>` : ''}
      <p class="text-[11px] text-muted mt-2">Tiros errados previos al rebote rival: ${k.falladosPrevios.dobles.n} dobles (${k.falladosPrevios.dobles.pts} pts) y ${k.falladosPrevios.triples.n} triples (${k.falladosPrevios.triples.pts} pts).</p>
    </div>`;
  }

  function bloqueCuartos(c) {
    const mx = Math.max(1, ...c.cuartos.map(q => Math.abs(q.parcial.dif)));
    return `<div class="rend-card">
      <h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">Cuarto a cuarto</h3>
      ${c.cuartos.map((q) => {
        const d = q.parcial.dif, w = Math.round(50 * Math.abs(d) / mx);
        const tono = d > 0 ? '#16a34a' : d < 0 ? '#dc2626' : '#94a3b8';
        return `<div class="mb-2"><div class="flex justify-between text-[11px]"><span>Q${q.cuarto}${q.cuarto === 4 ? ' (con suplementario)' : ''}</span>
          <span>${q.parcial.favor}-${q.parcial.contra} · <b>${signo(d)}</b> ${d > 0 ? '▲' : d < 0 ? '▼' : '●'}</span></div>
          <div style="position:relative;height:8px;background:rgba(148,163,184,.18);border-radius:4px" role="img" aria-label="Q${q.cuarto}: diferencia ${signo(d)}">
            <div style="position:absolute;top:0;height:100%;background:${tono};border-radius:4px;${d >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`}"></div>
            <div style="position:absolute;left:50%;top:-2px;width:1px;height:12px;background:#e5e7eb"></div></div>
          <div class="text-[10px] text-muted">Ataque: ${q.favor.pts} pts de tiro de campo, esperados ${f1(q.favor.esperados)} (${signo(q.favor.dif)}) · Defensa: concede ${q.contra.pts}, esperados ${f1(q.contra.esperados)} (${signo(q.contra.dif)})</div></div>`;
      }).join('')}
    </div>`;
  }

  function lecturaZonas(c) {
    const f = c.zonas.fugas;
    if (!f.length) return 'No hay una zona que se separe de la liga en lo que concede.';
    const partes = f.map(z => `{{${z.zona}}} concede ${f2(z.ppt)} pts por tiro (${z.i} tiros, ${signo(z.puntosDeMas)} pts sobre lo que la liga rinde ahí)${z.muestraChica ? ', muestra chica' : ''}`);
    return 'Las fugas del ciclo: ' + partes.join('; ') + '.';
  }

  /**
   * La cancha guiada: cada zona se pinta por lo que rinde contra la liga (el
   * PPT ajustado por muestra de `zonas()`), con su C/I escrito. Verde = a favor
   * del equipo, rojo = en contra, gris = muestra chica. «Concede» se lee al
   * revés que «tira»: que el rival rinda más es malo para el equipo.
   */
  function rellenosMapa(zs, lado) {
    const zonas = {}, rotulos = {};
    (zs || []).forEach((z) => {
      if (!z.i) return;
      rotulos[z.zona] = z.c + '/' + z.i;
      const nombre = (CA.NOMBRES_ZONA || {})[z.zona] || z.zona;
      const base = `${z.zona} · ${nombre}: ${z.c}/${z.i} (${f1(z.pct)} %), ${f2(z.ppt)} pts por tiro`
        + (z.ligaPpt === null || z.ligaPpt === undefined ? '' : ` · liga ${f2(z.ligaPpt)}`);
      if (z.muestraChica || z.delta === null || z.delta === undefined) { zonas[z.zona] = { fill: '#94a3b8', opacidad: 0.3, titulo: base + ' · muestra chica' }; return; }
      if (Math.abs(z.delta) < 0.03) { zonas[z.zona] = { fill: '#94a3b8', opacidad: 0.16, titulo: base + ' · como la liga' }; return; }
      const bueno = lado === 'favor' ? z.delta > 0 : z.delta < 0;
      zonas[z.zona] = { fill: bueno ? CA.COLOR.acierto : CA.COLOR.error, opacidad: 0.16 + 0.4 * Math.min(1, Math.abs(z.delta) / 0.3),
        titulo: base + (bueno ? ' · a favor del equipo' : ' · en contra del equipo') };
    });
    return { zonas, rotulos };
  }

  function bloqueMapa(c) {
    if (!CA) return '';
    const m = c.mapa, lado = estado.lado === 'favor' ? 'favor' : 'contra';
    const resaltar = lado === 'contra' ? c.resaltar : (c.zonas.propiasBajas || []).slice(0, 2).map(z => ({ id: z.zona, punteado: z.i < CI.MIN_TIROS_ZONA }));
    const rl = rellenosMapa(c.zonas[lado], lado);
    const r = CA.svg({ tiros: m[lado], resaltar, interactivo: true, zonas: rl.zonas, rotulosZona: rl.rotulos,
      rotulo: lado === 'contra' ? 'Tiros que concede el equipo' : 'Tiros del equipo' });
    const ley = CA.leyenda({ rellenos: true,
      rotuloBueno: lado === 'contra' ? 'concede menos que la liga' : 'rinde más que la liga',
      rotuloMalo: lado === 'contra' ? 'concede más que la liga' : 'rinde menos que la liga' });
    const btn = (id, txt) => `<button type="button" onclick="SGADD_CICLOSUI.verLado('${id}')" aria-pressed="${lado === id}"
      class="px-3 py-2 text-[11px] font-semibold ${lado === id ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}">${txt}</button>`;
    const texto = lado === 'contra' ? lecturaZonas(c)
      : 'Las zonas donde el equipo rinde por debajo de la liga: ' + ((c.zonas.propiasBajas || []).slice(0, 2).map(z => `{{${z.zona}}} (${signo(z.puntosDeMas)} pts)`).join(', ') || 'ninguna') + '.';
    return `<div class="rend-card" data-cancha-bloque>
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 class="font-display uppercase tracking-wide text-xs text-ink">Mapa de tiro del ciclo</h3>
        <div class="inline-flex rounded-md border border-hairline overflow-hidden" role="group" aria-label="Qué mapa ver">${btn('contra', 'Lo que concede')}${btn('favor', 'Lo que tira')}</div>
      </div>
      ${r.svg}${ley}
      <p class="text-xs mt-2 leading-snug">${CA.enlazarZonas(texto)}</p>
      ${m.completo ? '' : `<p class="text-[11px] text-muted mt-1">El mapa con círculos y cruces usa ${m.conPuntos} de ${m.de} partidos: el paquete conserva solo los últimos.</p>`}
    </div>`;
  }

  function bloqueComparar(paq, c) {
    const nums = CI.ventanas(paq, c.meta.n).map(v => v.numero).filter(n => n !== c.meta.numero);
    if (!nums.length) return '';
    const sel = `<select onchange="SGADD_CICLOSUI.elegirComparar(this.value)" class="bg-surface2 border border-hairline rounded-md px-3 py-2 text-xs text-ink">
      <option value="">Comparar con…</option>${nums.map(n => `<option value="${n}"${estado.comparar === n ? ' selected' : ''}>Ciclo ${n}</option>`).join('')}</select>`;
    let tabla = '';
    if (estado.comparar !== null) {
      const otro = CI.armarCiclo(paq, estado.comparar, { n: c.meta.n });
      const cmp = CI.comparar(otro, c);
      if (cmp) tabla = `<div class="scrollbox mt-2"><table class="w-full text-xs"><thead><tr class="text-muted"><th>Indicador</th><th>Ciclo ${otro.meta.numero}</th><th>Ciclo ${c.meta.numero}</th><th>Diferencia</th></tr></thead><tbody>
        ${cmp.filas.map(f => `<tr><td>${esc(f.rotulo)}</td><td>${f2(f.a)}</td><td>${f2(f.b)}</td><td>${f.diferencia === null ? '—' : signo(f.diferencia, 2)}</td></tr>`).join('')}
      </tbody></table></div><p class="text-[11px] text-muted mt-1">${esc(cmp.nota)}</p>`;
    }
    return `<div class="rend-card"><h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">Contra otro ciclo</h3>${sel}${tabla}</div>`;
  }

  /* ===================================================== SELLO E HISTORIAL */

  const claveDe = (num, n) => 'c' + num + 'n' + n;
  const selladoDe = (num) => estado.sellados.find(r => r.clave === claveDe(num, CI.PARTIDOS_POR_CICLO)) || null;
  const fechaCorta = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };

  /** Un ciclo cerrado se lee SELLADO si lo está: la historia no se recalcula. */
  /** El documento publicado de un ciclo (si lo está). */
  const publicadoDe = (num) => estado.publicados.find(x => x.clave === claveDe(num, CI.PARTIDOS_POR_CICLO)) || null;

  function bloqueSello(c, reg, paq) {
    const admin = esAdmin();
    if (admin && c.meta.cerrado) {
      const pub = publicadoDe(c.meta.numero);
      const v = reg ? CI.verificar(reg, paq) : null;
      const apto = CI.auditar(c, paq).apto;
      const estadoTxt = pub ? `📣 <b>Publicado</b> el ${fechaCorta(pub.publicado)}: el cuerpo técnico lo ve en Ciclos.`
        : reg ? `🔒 <b>Sellado</b> el ${fechaCorta(reg.sellado)} (huella <span class="font-mono">${esc(reg.huella)}</span>), <b>sin publicar</b>: el cuerpo técnico todavía no lo ve.`
        : 'Ciclo cerrado, <b>sin publicar</b>: el cuerpo técnico todavía no lo ve.';
      return `<div class="rend-card" style="grid-column:1/-1"><div class="flex flex-wrap items-center gap-3">
        <p class="text-xs">${estadoTxt}${v ? (v === 'INTACTO' ? ' <span class="zona-texto zona-exito">✓ el sello coincide con el análisis actual</span>' : ' <span class="zona-texto zona-aviso">◆ el dato de origen cambió después del sello: se muestra lo sellado</span>') : ''}</p>
        <button type="button" ${apto && !estado.cierre ? '' : 'disabled'} onclick="SGADD_CICLOSUI.abrirCierre(${c.meta.numero})"
          class="px-3 py-2 text-[11px] font-semibold rounded-md bg-accent text-base disabled:opacity-40">${pub ? '✉ Enviar por mail…' : '📣 Sellar, publicar y enviar…'}</button>
        ${apto ? '' : '<span class="text-[11px] zona-texto zona-peligro">La auditoría tiene errores: no se puede cerrar.</span>'}</div>
        <p class="text-[11px] text-muted mt-1">El ciclo en curso no se le muestra al cuerpo técnico: ve cada ciclo recién cuando lo publicás. Lo sellado no se reemplaza ni se borra.</p></div>`;
    }
    if (reg) {
      const v = CI.verificar(reg, paq);
      const txt = { INTACTO: '✓ coincide con el análisis actual', DIVERGENTE: '◆ el dato de origen cambió después del sello: se muestra lo sellado', NO_VERIFICABLE: '● el análisis actual ya no trae esos partidos' }[v];
      return `<div class="rend-card" style="grid-column:1/-1"><p class="text-xs">🔒 <b>Ciclo sellado</b> el ${fechaCorta(reg.sellado)} · huella <span class="font-mono">${esc(reg.huella)}</span>
        <span class="zona-texto ${v === 'INTACTO' ? 'zona-exito' : 'zona-aviso'}">${txt}</span></p>
        <p class="text-[11px] text-muted mt-1">Lo sellado no se reemplaza ni se borra: es la historia del equipo.</p></div>`;
    }
    if (!c.meta.cerrado) return '';
    if (!admin) return '<div class="rend-card" style="grid-column:1/-1"><p class="text-xs text-muted">Ciclo cerrado, todavía sin sellar.</p></div>';
    const apto = CI.auditar(c, paq).apto;
    return `<div class="rend-card" style="grid-column:1/-1"><div class="flex flex-wrap items-center gap-3">
      <p class="text-xs">Ciclo cerrado, <b>sin sellar</b>. Al sellarlo queda fijo aunque se regenere el análisis.</p>
      <button type="button" ${apto && !estado.sellando ? '' : 'disabled'} onclick="SGADD_CICLOSUI.sellar(${c.meta.numero})"
        class="px-3 py-2 text-[11px] font-semibold rounded-md bg-accent text-base disabled:opacity-40">🔒 Sellar este ciclo</button>
      ${apto ? '' : '<span class="text-[11px] zona-texto zona-peligro">La auditoría tiene errores: no se puede sellar.</span>'}</div></div>`;
  }

  /** Los ciclos cerrados uno al lado del otro: sellado si lo hay, vivo si no. */
  function bloqueHistorial(paq) {
    const vs = CI.ventanas(paq, CI.PARTIDOS_POR_CICLO).filter(v => v.cerrado);
    if (vs.length < 2) return '';
    const cs = vs.map((v) => { const r = selladoDe(v.numero); return { ciclo: r ? r.ciclo : CI.armarCiclo(paq, v.numero, { n: CI.PARTIDOS_POR_CICLO }), sellado: !!r }; });
    const h = CI.historial(cs.map(x => x.ciclo));
    return `<div class="rend-card" style="grid-column:1/-1"><h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">Evolución entre ciclos</h3>
      <div class="scrollbox"><table class="w-full text-xs"><thead><tr class="text-muted"><th>Indicador</th>${h.columnas.map((col, i) =>
        `<th>${esc(col.rotulo)}${cs[i].sellado ? ' 🔒' : ''}<br><span class="text-[10px] font-normal">${dia(col.desde)}-${dia(col.hasta)}</span></th>`).join('')}</tr></thead><tbody>
      ${h.filas.map(f => `<tr><td>${esc(f.rotulo)}</td>${f.valores.map((v, i) => `<td>${f2(v)}${f.deltas[i] === null ? '' : ` <span class="text-[10px] text-muted">(${signo(f.deltas[i], 2)})</span>`}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <p class="text-[11px] text-muted mt-2">${esc(h.nota)} 🔒 = sellado; sin candado, calculado hoy.</p></div>`;
  }

  function bloqueAuditoria(c, paq) {
    const a = CI.auditar(c, paq);
    const admin = esAdmin();
    const items = admin ? a.items : a.items.filter(i => i.nivel !== 'ok' && i.id !== 'sos');
    if (!items.length && a.apto) return '';
    const glifo = { ok: '✓', aviso: '◆', error: '✗' };
    return `<div class="rend-card"><h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">${admin ? 'Auditoría del ciclo' : 'Para tener en cuenta'}
      <span class="ml-2 zona-texto ${a.apto ? 'zona-exito' : 'zona-peligro'}">${a.apto ? '✓ apto para publicar' : '✗ no apto'}</span></h3>
      <ul class="text-xs space-y-1">${items.map(i => `<li><span class="zona-texto ${i.nivel === 'error' ? 'zona-peligro' : i.nivel === 'aviso' ? 'zona-aviso' : 'zona-exito'}">${glifo[i.nivel] || '•'}</span> ${esc(i.texto)}</li>`).join('')}</ul></div>`;
  }

  /* ===================================================== LAS 6 SECCIONES (decisión del club, 2026-11-04)
     Principal · Equipos · Jugadores · Clasificación · Fixture · Plan de intervención.
     Todo sale del paquete del equipo. Lo que el paquete no trae se DICE: no se inventa. */

  const SECCIONES = [
    ['evolucion', 'Evolución'], ['principal', 'Principal'], ['equipos', 'Equipos'], ['jugadores', 'Jugadores'],
    ['clasificacion', 'Clasificación'], ['fixture', 'Fixture'], ['plan', 'Plan de intervención'],
  ];
  const ROTULO_METRICA = { pts: 'Puntos', rt: 'Rebotes', ro: 'Rebotes ofensivos', rd: 'Rebotes defensivos', ast: 'Asistencias', pr: 'Recuperos',
    tc: 'Tapones', pp: 'Pérdidas', fc: 'Faltas cometidas', val: 'Valoración', t1: 'Libres %', t2: 'Dobles %', t3: 'Triples %' };
  const vacio = (txt) => `<div class="rend-card" style="grid-column:1/-1"><p class="text-xs text-muted">${esc(txt)}</p></div>`;
  const sec = (paq) => (paq && paq.secciones) || null;

  function bloqueEquipos(paq) {
    const s = sec(paq);
    const ms = s && s.liga && Array.isArray(s.liga.metricas) ? s.liga.metricas : [];
    if (!ms.length) return vacio('El paquete de este equipo no trae el tablero contra la liga: llega con la próxima subida del análisis.');
    const filas = ms.map((m) => {
      const mas = m.mejor !== 'menos';
      const dif = m.v - m.med;
      const bien = Math.abs(dif) < 1e-9 ? null : (mas ? dif > 0 : dif < 0);
      const tono = bien === null ? 'zona-neutro' : bien ? 'zona-exito' : 'zona-peligro';
      return `<tr><td>${esc(ROTULO_METRICA[m.k] || m.k)}${m.b === 'pct' ? ' %' : ''}</td><td>${f1(m.v)}</td><td>${f1(m.med)}</td>
        <td><span class="zona-texto ${tono}">${bien === null ? '●' : bien ? '▲' : '▼'} ${m.puesto}.º de ${m.de}</span></td></tr>`;
    }).join('');
    return `<div class="rend-card" style="grid-column:1/-1"><h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">Equipo contra la liga · temporada</h3>
      <div class="scrollbox"><table class="w-full text-xs"><thead><tr class="text-muted"><th>Métrica</th><th>Equipo</th><th>Mediana liga</th><th>Puesto</th></tr></thead><tbody>${filas}</tbody></table></div>
      <p class="text-[11px] text-muted mt-2">${esc(s.fuente || 'Ficha del equipo en el sitio de la competencia')}. Por partido, de toda la temporada (no del ciclo). En pérdidas y faltas, menos es mejor.</p></div>`;
  }

  function bloqueJugadores(paq) {
    const s = sec(paq);
    const js = s && Array.isArray(s.jugadores) ? s.jugadores.filter(j => j.pj >= 5 && j.p).sort((a, b) => b.p.min - a.p.min) : [];
    if (!js.length) return vacio('El paquete no trae la tabla de jugadores de la temporada.');
    const rj = (paq.rendimiento && paq.rendimiento.jugadores) || {};
    const net = (a) => (Array.isArray(a) && a[3] > 0 && a[4] > 0) ? 100 * (a[1] / a[3] - a[2] / a[4]) : null;
    const filas = js.map((j) => {
      const r = rj[j.id], on = r ? net(r.on) : null, off = r ? net(r.off) : null;
      const onoff = (on !== null && off !== null) ? on - off : null;
      return `<tr><td>${esc(j.n)}</td><td>${j.pj}</td><td>${f1(j.p.min)}</td><td>${f1(j.p.pts)}</td><td>${f1(j.p.rt)}</td><td>${f1(j.p.ast)}</td><td>${f1(j.p.pp)}</td>
        <td>${onoff === null ? '—' : `<span class="zona-texto ${onoff > 1 ? 'zona-exito' : onoff < -1 ? 'zona-peligro' : 'zona-neutro'}">${onoff > 1 ? '▲' : onoff < -1 ? '▼' : '●'} ${signo(onoff)}</span>`}</td></tr>`;
    }).join('');
    return `<div class="rend-card" style="grid-column:1/-1"><h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">Jugadores · temporada</h3>
      <div class="scrollbox"><table class="w-full text-xs"><thead><tr class="text-muted"><th>Jugador</th><th>PJ</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>PÉR</th><th title="Net por 100 posesiones con él en cancha menos sin él">On/Off</th></tr></thead><tbody>${filas}</tbody></table></div>
      <p class="text-[11px] text-muted mt-2">Promedios por partido de toda la temporada, jugadores con 5 partidos o más. On/Off = net por 100 posesiones con el jugador en cancha menos sin él; solo con la cancha validada.</p></div>`;
  }

  function bloqueClasificacion(paq, idx) {
    const s = sec(paq), t = s && s.clasificacion;
    /* El paquete no trae la tabla: se usa la de la categoría abierta, la MISMA de la sección Clasificación. */
    if ((!Array.isArray(t) || !t.length) && idx && typeof clasifTablaHTML === 'function') {
      try {
        return `<div class="rend-card" style="grid-column:1/-1"><h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">Clasificación · ${esc(idx.liga && idx.liga.nombre ? idx.liga.nombre : 'categoría abierta')}</h3>
          ${clasifTablaHTML(idx, { columnas: 'resumida' })}<p class="text-[11px] text-muted mt-2">La misma tabla de la sección Clasificación, del tramo abierto en la barra.</p></div>`;
      } catch (err) { /* cae al aviso */ }
    }
    if (!Array.isArray(t) || !t.length) return vacio('La tabla de posiciones del grupo no está en el paquete de este equipo: la liga no la sirve para esta temporada. Se ve en la sección Clasificación del panel.');
    return `<div class="rend-card" style="grid-column:1/-1"><h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">Clasificación del grupo</h3>
      <div class="scrollbox"><table class="w-full text-xs"><tbody>${t.map((f, i) => `<tr><td>${i + 1}</td><td>${esc(f.n || f.equipo || '')}</td><td>${esc(f.pj != null ? f.pj : '')}</td><td>${esc(f.pg != null ? f.pg : '')}</td><td>${esc(f.pp != null ? f.pp : '')}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function bloqueFixture(paq) {
    const ps = CI.partidosDe(paq);
    if (!ps.length) return vacio('Sin partidos validados.');
    const vs = CI.ventanas(paq, CI.PARTIDOS_POR_CICLO);
    const cicloDe = (id) => { const v = vs.find(x => (x.ids || []).indexOf(id) >= 0); return v ? v.numero : null; };
    const filas = ps.slice().reverse().map((p) => {
      const c = cicloDe(p.id);
      const g = p.final[0] > p.final[1];
      return `<tr><td>${dia(p.fecha)}</td><td>${esc(p.rival)}</td><td>${p.condicion === 'LOCAL' ? 'L' : 'V'}</td><td class="whitespace-nowrap">${p.final[0]} - ${p.final[1]}</td>
        <td><span class="zona-texto ${g ? 'zona-exito' : 'zona-peligro'}">${g ? '✓ G' : '✗ P'}</span></td><td>${c === null ? '—' : 'Ciclo ' + c}</td></tr>`;
    }).join('');
    return `<div class="rend-card" style="grid-column:1/-1"><h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">Partidos jugados · ${ps.length} validados</h3>
      <div class="scrollbox"><table class="w-full text-xs"><thead><tr class="text-muted"><th>Fecha</th><th>Rival</th><th>Cond.</th><th>Marcador</th><th>Res.</th><th>Ciclo</th></tr></thead><tbody>${filas}</tbody></table></div>
      <p class="text-[11px] text-muted mt-2">Solo lo jugado y validado. El calendario por jugar está en la sección Fixture del panel.</p></div>`;
  }

  /** El plan sale de lo medido en el ciclo: cada punto cita su número. No hay consejos que el dato no sostenga. */
  function bloquePlan(c) {
    const P = CI.planIntervencion(c);
    const b = P.balance, e = P.escenarios;
    const sg1 = (v) => (v === null || v === undefined) ? '—' : signo(v);
    const barra = (t, pts, pct, tono) => `<div class="mb-2"><div class="flex justify-between text-xs"><span class="font-semibold">${t}</span><span>${pct === null ? '—' : f1(pct)} % · +${f2(pts)} pts por partido</span></div>
      <div class="h-3 rounded bg-surface2 overflow-hidden" role="img" aria-label="${t} ${pct === null ? 'sin dato' : f1(pct) + ' por ciento'}"><div class="h-3 ${tono}" style="width:${pct === null ? 0 : Math.max(2, pct)}%;background:${tono === 'a' ? 'var(--acento)' : '#94a3b8'}"></div></div></div>`;
    const balance = b && b.total ? `<div class="mb-4"><h4 class="font-display uppercase tracking-wide text-[11px] text-muted mb-2">Balance estructural · dónde está el margen de mejora</h4>
        ${barra('Ataque', b.ataque, b.pctAtaque, 'a')}${barra('Defensa', b.defensa, b.pctDefensa, 'd')}
        <p class="text-[11px] text-muted">Peso de cada lado sobre el total de puntos por partido recuperables (+${f2(b.total)}) al llevar cada meta a lo que rinde la liga.</p></div>` : '';
    const tabla = P.metas.length ? `<div class="scrollbox mb-4"><table class="w-full text-xs"><thead><tr class="text-muted"><th>Lado</th><th>Meta táctica</th><th>Cambio</th><th>Pts por partido</th><th>Base</th></tr></thead><tbody>${
      P.metas.map(m => `<tr><td><span class="zona-texto ${m.lado === 'Defensa' ? 'zona-peligro' : 'zona-aviso'}">◆ ${m.lado}</span></td>
        <td>${CA ? CA.enlazarZonas(m.zona ? esc(m.meta).replace(m.zona, '{{' + m.zona + '}}') : esc(m.meta)) : esc(m.meta)}${m.muestraChica ? ' <span class="text-muted">(muestra chica)</span>' : ''}</td>
        <td class="whitespace-nowrap">${esc(m.cambio)}</td><td class="whitespace-nowrap font-semibold">+${f2(m.ptsPP)}</td><td class="text-muted">${esc(m.base)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="text-xs text-muted mb-4">El ciclo no deja metas que se separen de la liga con el peso mínimo (' + P.criterio.minPP + ' pts por partido).</p>';
    const esc2 = e && b && b.total ? `<div class="mb-4"><h4 class="font-display uppercase tracking-wide text-[11px] text-muted mb-2">Escenarios y solapes</h4>
        <div class="grid gap-2 sm:grid-cols-3 text-xs">
          <div class="rend-card"><div class="text-muted">Sumatoria teórica</div><div class="text-lg font-semibold">+${f1(e.teorico)} pts</div><div class="text-[11px] text-muted">Todas las metas a la vez. No es un pronóstico: se pisan entre sí.</div></div>
          <div class="rend-card"><div class="text-muted">Escenario prudente</div><div class="text-lg font-semibold">+${f1(e.prudente)} pts</div><div class="text-[11px] text-muted">${Math.round(P.criterio.solape * 100)} % de la teórica, por solape entre metas (criterio declarado).</div></div>
          <div class="rend-card"><div class="text-muted">Margen hacia ${e.siguiente === null ? 'el próximo corte' : 'el Ciclo ' + e.siguiente}</div><div class="text-lg font-semibold">${sg1(e.margenActual)} → ${sg1(e.margenPrudente)}</div><div class="text-[11px] text-muted">Margen por partido de hoy, y con el escenario prudente${e.margenTeorico === null ? '' : ' (teórico ' + sg1(e.margenTeorico) + ')'}.</div></div>
        </div></div>` : '';
    const cuartos = c.cuartos.filter(q => q.parcial.dif < 0);
    const extra = cuartos.length ? `<p class="text-xs"><span class="zona-texto zona-aviso">◆ Cuartos</span> ${cuartos.map(q => `Q${q.cuarto}: ${signo(q.parcial.dif)} (${q.parcial.favor}-${q.parcial.contra})`).join(' · ')}. No suman a la tabla: son el mismo partido visto por tiempo.</p>` : '';
    return `<div class="rend-card" style="grid-column:1/-1" data-cancha-bloque><h3 class="font-display uppercase tracking-wide text-xs text-ink mb-3">Plan de intervención · ciclo ${c.meta.numero}</h3>${balance}${tabla}${esc2}${extra}
      <p class="text-[11px] text-muted mt-2">Cada meta sale de un número del ciclo ${c.meta.numero} y se mide contra la liga. Cómo se trabaja lo decide el cuerpo técnico.${P.sinVara ? ' El paquete no trae la vara de transición de la liga: esas metas no se calculan.' : ''}</p></div>`;
  }


  /* ---- 4 Factores del ciclo, arquetipos del reloj y escenarios (2026-11-04) ---- */

  const FACTORES_CICLO = [
    { id: 'eFG%', opp: 'eFG Opp%', t: 'Eficiencia de tiro (eFG%)', inv: false },
    { id: 'PePP%', opp: 'PP Opp%', t: 'Cuidado de la pelota (pérdidas / jugada)', inv: true },
    { id: 'RO%', opp: 'RO Opp%', t: 'Rebote ofensivo (RO%)', inv: false },
    { id: 'RTL%', opp: 'RTL Opp%', t: 'Libres: ir a la línea (RTL%)', inv: false },
  ];
  const isoLocal = (d) => (d instanceof Date && !isNaN(d)) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;
  const pc = (v) => (v === null || v === undefined || !isFinite(v)) ? '—' : f1(v * 100) + ' %';

  /** Los partidos del ciclo en el libro abierto: en una fecha un equipo juega UN partido, así que cruza por fecha. */
  function partidosDelCiclo(idx, c) {
    const lista = (idx && idx.lista && idx.lista()) || [];
    const e = lista.find(x => x.nombre === estado.equipo);
    if (!e || !idx.agregarPartidos) return null;
    const fechas = new Set(c.resultados.partidos.map(p => p.fecha));
    const parts = (e.partidos || []).filter(p => fechas.has(isoLocal(p.__fecha)));
    return { e, parts };
  }

  function bloque4Factores(idx, c) {
    const x = partidosDelCiclo(idx, c);
    if (!x || x.parts.length < Math.ceil(c.meta.partidos / 2)) {
      return vacio(`Los 4 Factores del ciclo salen del libro de la categoría abierta, y ese libro no trae los partidos del ciclo ${c.meta.numero} (${dia(c.meta.desde)} al ${dia(c.meta.hasta)}). Elegí la categoría de esa temporada en el selector de arriba y se calculan solos.`);
    }
    const aC = idx.agregarPartidos(x.e.clave, x.parts), aT = idx.agregarPartidos(x.e.clave, x.e.partidos);
    const tono = (d, bueno) => (d === null || Math.abs(d) < 0.005) ? ['zona-neutro', '●'] : (d * bueno > 0 ? ['zona-exito', '▲'] : ['zona-peligro', '▼']);
    const fila = (f) => {
      const a = aC.factores[f.id], at = aT.factores[f.id], r = aC.factores[f.opp], rt = aT.factores[f.opp];
      const da = (a === null || at === null) ? null : a - at, dr = (r === null || rt === null) ? null : r - rt;
      const [ca, ga] = tono(da, f.inv ? -1 : 1), [cr, gr] = tono(dr, f.inv ? 1 : -1);
      const celda = (v, t, d, cl, g) => `<td>${pc(v)}</td><td class="text-muted">${pc(t)}</td><td><span class="zona-texto ${cl}">${g} ${d === null ? '—' : signo(d * 100)} pp</span></td>`;
      return `<tr><td>${esc(f.t)}</td>${celda(a, at, da, ca, ga)}${celda(r, rt, dr, cr, gr)}</tr>`;
    };
    return `<div class="rend-card" style="grid-column:1/-1"><h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">Los 4 Factores del ciclo ${c.meta.numero}</h3>
      <div class="scrollbox"><table class="w-full text-xs"><thead><tr class="text-muted"><th></th><th colspan="3">Lo que hace el equipo</th><th colspan="3">Lo que le hacen</th></tr>
        <tr class="text-muted"><th>Factor</th><th>Ciclo</th><th>Temporada</th><th>Δ</th><th>Ciclo</th><th>Temporada</th><th>Δ</th></tr></thead><tbody>${FACTORES_CICLO.map(fila).join('')}</tbody></table></div>
      <p class="text-[11px] text-muted mt-2">${x.parts.length} partidos del ciclo contra la temporada del libro abierto. ▲ es a favor del equipo: en «lo que le hacen» pesa al revés (que el rival tire peor es bueno; que pierda más pelotas también).</p></div>`;
  }

  function bloqueArquetipos(paq) {
    const P = (typeof SGADD_PBP !== 'undefined') ? SGADD_PBP : null;
    const a = P && P.relojArquetipos ? P.relojArquetipos(paq) : null;
    if (!a) return vacio('El paquete de este equipo no trae el reloj de posesión: los arquetipos llegan con la próxima subida del análisis.');
    const lista = (xs, tit) => xs.length ? `<div><div class="text-[10px] uppercase tracking-wider text-muted font-display mb-1">${tit}</div>${xs.map(r =>
      `<div class="mb-2 text-xs"><b>${esc(r.emoji || '')} ${esc(r.label)}</b><br><span class="text-muted">${esc(r.texto)}</span><br><span class="text-[11px]">${esc(r.detalle)}</span></div>`).join('')}</div>` : '';
    const cuerpo = lista(a.ofensivos, 'Cómo ataca') + lista(a.defensivos, 'Cómo defiende');
    return `<div class="rend-card" style="grid-column:1/-1"><h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">Arquetipos del reloj de posesión · temporada</h3>
      ${cuerpo || `<p class="text-xs text-muted">${a.muestra ? 'Ningún arquetipo del reloj se separa de la competencia: el equipo reparte como el resto.' : 'La muestra de finales con reloj todavía no alcanza para clasificar.'}</p>`}
      <p class="text-[11px] text-muted mt-2">Se miden contra los cuartiles de la competencia en cada franja (0-7 · 8-17 · 18-24 s). Describen, no juzgan.</p></div>`;
  }

  function bloqueEscenarios(idx) {
    const C = (typeof SGADD_CONCLUSIONES !== 'undefined') ? SGADD_CONCLUSIONES : null;
    const lista = (idx && idx.lista && idx.lista()) || [];
    const e = lista.find(x => x.nombre === estado.equipo);
    if (!C || !C.proyeccionEquipo || !e) return '';
    try {
      const h = C.proyeccionHtml(C.proyeccionEquipo(idx, e), 'equipo');
      return h ? `<div class="rend-card" style="grid-column:1/-1"><h3 class="font-display uppercase tracking-wide text-xs text-ink mb-2">Escenarios tácticos · qué vale llevar cada métrica al percentil 70</h3>${h}
        <p class="text-[11px] text-muted mt-2">Cada palanca se mide sola, con los números de la temporada del libro abierto; no se suman.</p></div>` : '';
    } catch (err) { return ''; }
  }

  /* ---- EL INFORME DE CICLO (2026-11-06) ----
     Las seis secciones salen de SGADD_CICLOINFORME, la réplica nativa del
     Artifact «Jujuy Básquet · Ciclo 0»: cada card vive en su función y dice de
     dónde sale. Las herramientas de ADMIN (auditoría, sello, comparar contra
     otro ciclo, historial) van al pie de Principal: son gestión, no informe.
     Sin el módulo (o si el informe no se puede armar) quedan los bloques
     anteriores, que siguen en este archivo. */
  function informe(idx, c, reg) {
    const CIN = (typeof SGADD_CICLOINFORME !== 'undefined') ? SGADD_CICLOINFORME : null;
    pedirDoc();
    const idxC = idxAlCierre(idx, c);
    const previo = CIN ? previoDe(idx, c, CIN) : null;
    const modelo = CIN ? CIN.armar({ idx: idxC, paq: estado.paq, ciclo: c, doc: estado.doc, anterior: estado.anterior || null, previo }) : null;
    const admin = esAdmin() ? `<div class="rend-grid" style="margin-top:12px">${bloqueAuditoria(c, estado.paq)}${bloqueSello(c, reg, estado.paq)}${bloqueComparar(estado.paq, c)}${bloqueHistorial(estado.paq)}</div>` : '';
    estado.modelo = modelo && modelo.ok ? { modelo, ciclo: c } : null;
    if (modelo && modelo.ok) {
      return `<div style="grid-column:1/-1">${CIN.html(modelo, estado.seccion)}${estado.seccion === 'principal' ? admin : ''}</div>`;
    }
    return ({
      principal: () => bloqueAuditoria(c, estado.paq) + bloqueSello(c, reg, estado.paq) + bloqueResultados(c) + bloqueTransicion(c) + bloqueCuartos(c) + bloqueMapa(c) + bloqueCausas(c) + bloqueComparar(estado.paq, c) + bloqueHistorial(estado.paq),
      equipos: () => bloque4Factores(idx, c) + bloqueArquetipos(estado.paq) + bloqueEquipos(estado.paq),
      jugadores: () => bloqueJugadores(estado.paq),
      clasificacion: () => bloqueClasificacion(estado.paq, idx),
      fixture: () => bloqueFixture(estado.paq),
      plan: () => bloquePlan(c) + bloqueEscenarios(idx),
    }[estado.seccion] || (() => ''))();
  }
  /** La liga se mide al CIERRE del ciclo: un ciclo cerrado no cambia cuando la liga sigue jugando. */
  function idxAlCierre(idx, c) {
    try { if (c.meta.cerrado && SGADD_APP.idxPrevio) { const d = new Date(c.meta.hasta + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); const r = SGADD_APP.idxPrevio(d.toISOString().slice(0, 10)); if (r && r.idx) return r.idx; } } catch (e) { /* la liga de hoy */ }
    return idx;
  }
  /* LAS METAS DEL CICLO ANTERIOR (Evolución, 2026-11-08): las que se congelaron al publicarlo;
     si se publicó sin ellas (el Ciclo 0), se reconstruyen UNA vez con los datos de su cierre
     y se rotulan «reconstruidas». Sin ciclo anterior cerrado no hay Evolución. */
  function previoDe(idx, c, CIN) {
    const num = c && c.meta && c.meta.numero;
    if (typeof num !== 'number' || num < 1 || !CIN.metasDelCiclo) return null;
    const pub = (estado.publicados || []).find(p => p.meta && p.meta.numero === num - 1 && p.metas && Array.isArray(p.metas.metas));
    if (pub) return pub.metas;
    const ficha = String((SGADD_APP.estado && SGADD_APP.estado.planillaId) || '') + '|' + estado.equipo + '|' + (num - 1);
    estado.reconstruidas = estado.reconstruidas || {};
    if (Object.prototype.hasOwnProperty.call(estado.reconstruidas, ficha)) return estado.reconstruidas[ficha];
    let r = null;
    try {
      const reg = selladoDe(num - 1);
      const c0 = reg ? reg.ciclo : CI.armarCiclo(estado.paq, num - 1, { n: CI.PARTIDOS_POR_CICLO });
      if (c0 && c0.meta.cerrado) {
        const m0 = CIN.armar({ idx: idxAlCierre(idx, c0), paq: estado.paq, ciclo: c0, doc: estado.doc, anterior: estado.anterior || null });
        const M = m0 && m0.ok ? CIN.metasDelCiclo(m0) : null;
        if (M) r = Object.assign(M, { reconstruidas: true });
      }
    } catch (e) { r = null; }
    /* Sin el archivo del torneo ni la tabla anterior todavía, no se congela: se vuelve a intentar. */
    if (estado.doc) estado.reconstruidas[ficha] = r;
    return r;
  }
  /** El archivo del torneo (calendario y formato) para Fixture, SOS y escenarios: se pide una vez. */
  function pedirDoc() {
    if (typeof SGADD_FIXTURE === 'undefined' || !SGADD_FIXTURE.cargarTorneo) return;
    let pl = null;
    try { pl = SGADD.CATALOGO.planillas.find(p => p.id === SGADD_APP.estado.planillaId); } catch (e) { pl = null; }
    if (!pl || !pl.torneoId || estado.docPedido === pl.torneoId) return;
    estado.docPedido = pl.torneoId; estado.doc = null;
    estado.anterior = null;
    Promise.resolve(SGADD_FIXTURE.cargarTorneo(pl.torneoId)).then((d) => { if (d) { estado.doc = Object.assign({}, d, { vivo: estado.doc && estado.doc.vivo }); pintar(); pedirAnterior(d); } }).catch(() => {});
    /* El fixture VIVO de la liga (sede, hora, próximos partidos): el archivo del torneo publica solo las primeras fechas. */
    if (typeof SGADD_DATA !== 'undefined' && SGADD_DATA.fixtureDeTorneo) {
      Promise.resolve(SGADD_DATA.fixtureDeTorneo(pl.torneoId, pl.zonaId)).then((r) => {
        const z = r && r.zonas && (r.zonas[pl.zonaId] || Object.values(r.zonas)[0]);
        if (z && Array.isArray(z.partidos)) { estado.doc = Object.assign({}, estado.doc || {}, { vivo: z.partidos }); pintar(); }
      }).catch(() => {});
    }
  }

  /** La tabla final de la temporada anterior (escenarios de Clasificación). El archivo del torneo
      declara, por club, la categoría que la tiene (`temporadaAnterior.categoriaPorClub`); se lee
      ese libro, se arma su índice y su tabla con el mismo motor de Clasificación. Sin la
      declaración, sin backend o si falla, los escenarios quedan sin puestos y lo dicen. */
  function pedirAnterior(doc) {
    const ta = doc && doc.temporadaAnterior;
    const club = (typeof CLUB !== 'undefined' && CLUB.estado) ? CLUB.estado.id : null;
    const slug = ta && ta.categoriaPorClub && club ? ta.categoriaPorClub[club] : null;
    if (!slug || typeof SGADD_DATA === 'undefined' || !SGADD_DATA.cargarDelBackend || typeof SGADD_CLASIF === 'undefined') return;
    const ficha = club + '/' + slug;
    if (estado.anteriorDe === ficha) return;
    estado.anteriorDe = ficha;
    Promise.resolve(SGADD_DATA.cargarDelBackend(club, slug)).then((r) => {
      if (!r || !r.hojas || estado.anteriorDe !== ficha) return;
      const t = SGADD.tramoPorDefecto(SGADD.combinacionesTorneoFase(r.hojas));
      const ia = t ? SGADD.construirIndice(r.hojas, { fase: t.fase, torneo: t.torneo }) : null;
      const filas = ia ? SGADD_CLASIF.tabla(ia, { orden: ['PCT', 'DIF', 'PF'] }) : null;
      if (Array.isArray(filas) && filas.length) { estado.anterior = { label: ta.label, temporada: ta.temporada, filas }; pintar(); }
    }).catch(() => {});
  }

  /** Se abre por el último ciclo CERRADO: uno abierto con 1 de 4 partidos no es un informe. Sin cerrados, el último. */
  function cicloPorDefecto(vs) {
    if (!vs || !vs.length) return null;
    const c = vs.filter(v => v.cerrado);
    return (c.length ? c[c.length - 1] : vs[vs.length - 1]).numero;
  }

  function tabsSecciones() {
    const secs = estado.modelo && estado.modelo.modelo && estado.modelo.modelo.secciones;
    const vis = SECCIONES.filter(([id]) => id !== 'evolucion' || (secs && secs.evolucion));
    if (!vis.some(([id]) => id === estado.seccion)) estado.seccion = 'principal';
    return `<div class="flex flex-wrap gap-1 border-b border-hairline" role="tablist" aria-label="Secciones del ciclo">${vis.map(([id, t]) =>
      `<button type="button" role="tab" aria-selected="${estado.seccion === id}" onclick="SGADD_CICLOSUI.verSeccion('${id}')"
        class="px-3 py-2 text-xs font-semibold ${estado.seccion === id ? 'text-ink border-b-2 border-[color:var(--acento)]' : 'text-muted hover:text-ink'}">${t}</button>`).join('')}</div>`;
  }

  /* ===================================================== LA SECCIÓN */

  function equiposDe(idx) {
    const lista = (idx && idx.lista && idx.lista()) || [];
    const vis = (typeof SGADD_AUTH !== 'undefined' && SGADD_AUTH.equiposVisibles) ? SGADD_AUTH.equiposVisibles(lista) : lista;
    return vis.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  function equipoInicial(idx) {
    const l = equiposDe(idx);
    if (estado.equipo && l.some(e => e.nombre === estado.equipo)) return estado.equipo;
    const propio = l.find(e => typeof SGADD !== 'undefined' && SGADD.esEquipoPropio && SGADD.esEquipoPropio(e.nombre));
    return (propio || l[0] || {}).nombre || null;
  }

  function cabecera(idx, paq) {
    const lista = equiposDe(idx);
    const vs = paq ? CI.ventanas(paq, CI.PARTIDOS_POR_CICLO) : [];
    const sel = estado.ciclo === null ? cicloPorDefecto(vs) : estado.ciclo;
    return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h2 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Ciclos de ${CI.PARTIDOS_POR_CICLO} partidos</h2>
      <p class="text-xs text-muted mb-3">Cada ciclo agrupa cuatro partidos seguidos del equipo. Se lee la transición del rival en los primeros 7 segundos, el rendimiento por cuarto y las zonas de la cancha donde se concede.</p>
      <div class="flex flex-wrap items-end gap-3">
        ${lista.length > 1 && (esAdmin() || lista.length <= 24) ? `<label class="block"><span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Equipo</span>
          <select onchange="SGADD_CICLOSUI.elegirEquipo(this.value)" class="bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink min-w-[12rem]">
            ${lista.map(e => `<option value="${esc(e.nombre)}"${e.nombre === estado.equipo ? ' selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></label>` : ''}
        ${vs.length ? `<div><span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Ciclo</span>
          <div class="inline-flex flex-wrap rounded-md border border-hairline overflow-hidden" role="group" aria-label="Elegir ciclo">
            ${vs.map(v => `<button type="button" onclick="SGADD_CICLOSUI.elegirCiclo(${v.numero})" aria-pressed="${v.numero === sel}"
              title="${dia(v.desde)} al ${dia(v.hasta)}${v.cerrado ? '' : ' · abierto'}"
              class="px-3 py-2 text-[11px] font-semibold ${v.numero === sel ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}">Ciclo ${v.numero}${v.cerrado ? '' : ' ◆'}</button>`).join('')}
          </div></div>` : ''}
      </div></div>`;
  }

  /* ===================================================== LO QUE VE EL CUERPO TÉCNICO
     Solo los ciclos PUBLICADOS, tal cual se publicaron (la foto): el ciclo en
     curso no se muestra, y lo publicado no cambia aunque la liga siga jugando. */
  function htmlCliente(idx, src) {
    src = src || estado;
    const equipo = equipoInicial(idx);
    estado.equipo = equipo;
    const cab = (extra) => `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h2 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Ciclos de ${CI.PARTIDOS_POR_CICLO} partidos</h2>
      <p class="text-xs text-muted mb-3">Cada informe cubre cuatro partidos seguidos de ${esc(equipo || 'tu equipo')}. Aparece acá cuando el cuerpo de análisis de MotorStats cierra el ciclo; el que está en curso se publica al completarse.</p>${extra || ''}</div>`;
    if (!equipo) return cab('<p class="text-xs text-muted">No hay equipo asignado.</p>');
    if (src.cargando) return cab() + SGADD_UI.cargando('Cargando los ciclos…', equipo);
    if (src.error) return cab(`<p class="text-xs"><b>No se pudieron leer los ciclos.</b> <span class="text-muted">${esc(src.error)}</span></p>`);
    if (!src.publicados.length) return cab('<p class="text-xs"><b>Todavía no hay ciclos publicados.</b> <span class="text-muted">El primero aparece cuando se cierre el ciclo de cuatro partidos.</span></p>');
    const sel = src.publicados.some(p => p.clave === src.pubClave) ? src.pubClave : src.publicados[src.publicados.length - 1].clave;
    const botones = `<div class="inline-flex flex-wrap rounded-md border border-hairline overflow-hidden" role="group" aria-label="Elegir ciclo">${src.publicados.map(p => {
      const m = p.meta || {};
      return `<button type="button" onclick="SGADD_CICLOSUI.elegirPublicado('${esc(p.clave)}')" aria-pressed="${p.clave === sel}" title="${dia(m.desde)} al ${dia(m.hasta)}"
        class="px-3 py-2 text-[11px] font-semibold ${p.clave === sel ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}">Ciclo ${m.numero === undefined || m.numero === null ? '' : m.numero}</button>`; }).join('')}</div>`;
    let cuerpo;
    if (src.fotoError) cuerpo = `<div class="card rounded-xl p-4 border border-hairline text-xs"><b>No se pudo leer el informe.</b> <span class="text-muted">${esc(src.fotoError)}</span></div>`;
    else if (!src.foto || src.fotoDe !== sel) cuerpo = SGADD_UI.cargando('Cargando el informe…', '');
    else {
      const f = src.foto, m = f.meta || {};
      const secs = SECCIONES.filter(([id]) => f.foto.secciones[id]);
      if (!secs.some(([id]) => id === estado.seccion)) estado.seccion = 'principal';
      cuerpo = `<style data-ci-foto>${f.foto.estilo || ''}</style>
        <div class="rend-card"><div class="flex flex-wrap items-baseline gap-x-3"><h3 class="font-display uppercase tracking-wide text-sm text-ink">${esc(f.foto.titulo || 'Ciclo')}</h3>
          <span class="text-xs text-muted">${dia(m.desde)} al ${dia(m.hasta)}${m.record ? ' · ' + esc(m.record) : ''}${f.publicado ? ' · publicado el ' + fechaCorta(f.publicado) : ''}</span></div></div>
        <div class="flex flex-wrap gap-1 border-b border-hairline" role="tablist" aria-label="Secciones del ciclo">${secs.map(([id, t]) =>
          `<button type="button" role="tab" aria-selected="${estado.seccion === id}" onclick="SGADD_CICLOSUI.verSeccion('${id}')"
            class="px-3 py-2 text-xs font-semibold ${estado.seccion === id ? 'text-ink border-b-2 border-[color:var(--acento)]' : 'text-muted hover:text-ink'}">${t}</button>`).join('')}</div>
        <div>${f.foto.secciones[estado.seccion] || ''}</div>`;
    }
    return `<div class="space-y-5">${cab(`<span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Ciclo</span>${botones}`)}${cuerpo}</div>`;
  }

  /* ===================================================== VISTA PREVIA DEL CUERPO TÉCNICO (admin, 2026-11-06)
     El admin ve la sección tal cual la ve el cliente, con la MISMA función
     (htmlCliente): «hoy» es lo publicado de verdad; «si publicás» agrega el
     ciclo abierto en pantalla con la foto que se mandaría. No escribe nada. */
  function fuenteVista() {
    const v = estado.vistaCliente;
    const base = { cargando: false, error: null, publicados: estado.publicados.slice(), pubClave: estado.pubClave, foto: null, fotoDe: null, fotoError: null };
    if (v === 'simulado') {
      const x = estado.modelo, foto = fotoDelInforme();
      if (!x || !foto) return Object.assign(base, { error: 'Abrí un ciclo cerrado en la vista de admin: la simulación usa el informe que estás viendo.' });
      const clave = claveDe(x.ciclo.meta.numero, CI.PARTIDOS_POR_CICLO), m = x.ciclo.meta, r = x.ciclo.resultados;
      const meta = { numero: m.numero, desde: m.desde, hasta: m.hasta, record: r.record.g + '-' + r.record.p };
      base.publicados = base.publicados.filter(p => p.clave !== clave).concat([{ clave, publicado: new Date().toISOString(), meta, simulado: true }])
        .sort((a, b) => String((a.meta && a.meta.desde) || '').localeCompare(String((b.meta && b.meta.desde) || '')));
      if (!base.publicados.some(p => p.clave === base.pubClave)) base.pubClave = clave;
      if (base.pubClave === clave) return Object.assign(base, { foto: { foto, meta, publicado: new Date().toISOString() }, fotoDe: clave });
    }
    if (!base.publicados.length) return base;
    const sel = base.publicados.some(p => p.clave === base.pubClave) ? base.pubClave : base.publicados[base.publicados.length - 1].clave;
    if (estado.vistaFotoDe === sel && estado.vistaFoto) return Object.assign(base, { foto: estado.vistaFoto, fotoDe: sel });
    if (estado.vistaFotoError) return Object.assign(base, { fotoError: estado.vistaFotoError });
    pedirFotoVista(sel);
    return base;
  }
  function pedirFotoVista(clave) {
    if (estado.vistaPidiendo === clave || typeof SGADD_DATA === 'undefined' || !SGADD_DATA.cicloFoto) return;
    const club = (typeof CLUB !== 'undefined' && CLUB.estado) ? CLUB.estado.id : null;
    const pl = (SGADD.CATALOGO.planillas || []).filter(x => x.id === SGADD_APP.estado.planillaId)[0];
    if (!club || !pl) return;
    estado.vistaPidiendo = clave;
    SGADD_DATA.cicloFoto(club, pl.slug, estado.equipo, clave)
      .then((r) => { estado.vistaFoto = r; estado.vistaFotoDe = clave; estado.vistaFotoError = null; })
      .catch((e) => { estado.vistaFotoError = (e && e.message) || 'Sin conexión.'; })
      .then(() => { estado.vistaPidiendo = null; pintar(); });
  }
  function barraVista() {
    const v = estado.vistaCliente;
    const b = (val, txt) => `<button type="button" onclick="SGADD_CICLOSUI.verComoCliente(${val === null ? 'null' : "'" + val + "'"})" aria-pressed="${v === val}"
      class="px-3 py-2 text-[11px] font-semibold ${v === val ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}">${txt}</button>`;
    return `<div class="rend-card" data-vista-cliente style="border-color:var(--acento)"><div class="flex flex-wrap items-center gap-3">
      <span class="text-[10px] uppercase tracking-wider text-muted font-display">Vista</span>
      <div class="inline-flex flex-wrap rounded-md border border-hairline overflow-hidden" role="group" aria-label="Elegir la vista">
        ${b(null, 'Admin')}${b('hoy', '👁 Cuerpo técnico · hoy')}${b('simulado', '👁 Cuerpo técnico · si publicás este ciclo')}</div></div>
      ${v ? `<p class="text-[11px] text-muted mt-2">${v === 'hoy' ? 'Es exactamente lo que ve el cuerpo técnico ahora: solo los ciclos publicados.' : 'Simulación: el ciclo abierto en la vista de admin aparece como publicado, con el informe que se mandaría. No se publica nada.'}</p>` : ''}</div>`;
  }
  function verComoCliente(v) {
    estado.vistaCliente = (v === 'hoy' || v === 'simulado') ? v : null;
    estado.vistaFoto = null; estado.vistaFotoDe = null; estado.vistaFotoError = null; estado.pubClave = null;
    if (estado.vistaCliente) estado.seccion = 'principal';
    pintar();
  }

  function html(idx) {
    if (!CI) return '';
    if (!idx || !idx.liga) {
      const app = (typeof SGADD_APP !== 'undefined') ? SGADD_APP.estado : null;
      /* Una categoría que falló NO se queda «cargando»: se dice el motivo real. */
      if (app && app.error && !app.cargando) return `<div class="card rounded-xl p-4 border border-hairline text-xs"><b>No se pudo cargar la categoría.</b><br><span class="text-muted">${esc(app.error)}</span></div>`;
      return (typeof SGADD_UI !== 'undefined') ? SGADD_UI.cargando('Cargando la categoría…', 'Los ciclos necesitan los partidos del torneo.') : '';
    }
    if (!esAdmin()) return htmlCliente(idx);
    if (estado.vistaCliente) return `<div class="space-y-5">${barraVista()}${htmlCliente(idx, fuenteVista())}</div>`;
    const equipo = equipoInicial(idx);
    estado.equipo = equipo;
    let cuerpo;
    if (!equipo) cuerpo = '<div class="card rounded-xl p-4 border border-hairline text-xs text-muted">No hay equipos para mostrar.</div>';
    else if (estado.cargando) cuerpo = SGADD_UI.cargando('Cargando los ciclos…', equipo);
    else if (estado.error) cuerpo = `<div class="card rounded-xl p-4 border border-hairline text-xs"><b>No se pudo leer el análisis de ${esc(equipo)}.</b><br><span class="text-muted">${esc(estado.error)}</span></div>`;
    else if (!estado.paq) cuerpo = '';
    else if (!CI.partidosDe(estado.paq).length) {
      cuerpo = `<div class="card rounded-xl p-4 border border-hairline text-xs"><b>Todavía no hay ciclos de ${esc(equipo)}.</b><br>
        <span class="text-muted">El paquete de este equipo no trae el bloque de ciclos: llega con la próxima subida del análisis, o el equipo no tiene partidos validados.</span></div>`;
    } else {
      const vs = CI.ventanas(estado.paq, CI.PARTIDOS_POR_CICLO);
      const num = estado.ciclo === null ? cicloPorDefecto(vs) : estado.ciclo;
      const reg = selladoDe(num);
      const c = reg ? reg.ciclo : CI.armarCiclo(estado.paq, num, { n: CI.PARTIDOS_POR_CICLO });
      if (!c) cuerpo = '<div class="card rounded-xl p-4 border border-hairline text-xs">Ese ciclo no existe.</div>';
      else cuerpo = `<div class="rend-grid" data-ciclo="${c.meta.numero}">
          <div class="rend-card" style="grid-column:1/-1">
            <div class="flex flex-wrap items-baseline gap-x-3"><h3 class="font-display uppercase tracking-wide text-sm text-ink">Ciclo ${c.meta.numero} · ${esc(c.meta.equipo || equipo)}</h3>
              <span class="text-xs text-muted">${dia(c.meta.desde)} al ${dia(c.meta.hasta)} · ${c.resultados.record.g}-${c.resultados.record.p}${c.meta.cerrado ? '' : ' · <b>ciclo abierto</b>: ' + c.meta.partidos + ' de ' + c.meta.n + ' partidos'}</span></div>
          </div>
          ${informe(idx, c, reg)}
        </div>`;
    }
    return `<div class="space-y-5">${estado.paq && !estado.error && !estado.cargando ? barraVista() : ''}${cabecera(idx, estado.paq)}${estado.paq && !estado.error && !estado.cargando ? tabsSecciones() : ''}${cuerpo}</div>`;
  }

  function pintar() {
    const r = (typeof document !== 'undefined') ? document.getElementById('view-root') : null;
    if (!r) return;
    const idx = (typeof SGADD_APP !== 'undefined') ? SGADD_APP.estado.idx : null;
    r.innerHTML = (typeof SGADD_APP !== 'undefined' && SGADD_APP.barra ? SGADD_APP.barra() : '') + html(idx);
    if (CA && CA.activar) CA.activar();
    cargarPaquete(idx);
  }

  /** El ciclo que pidió el link del mail: el cliente lo abre publicado; el admin, en su vista. */
  function abrirPendiente() {
    const C = typeof CLUB !== 'undefined' ? CLUB : null;
    const pend = C && C.cicloPendiente ? C.cicloPendiente() : null;
    if (!pend) return;
    const p = (estado.publicados || []).find(x => x.clave === pend);
    if (!p) return;
    if (esAdmin()) { if (p.meta && typeof p.meta.numero === 'number') estado.ciclo = p.meta.numero; }
    else estado.pubClave = p.clave;
    estado.seccion = SECCIONES.some(x => x[0] === 'evolucion') && p.meta && p.meta.numero > 0 ? 'evolucion' : 'principal';
    if (C.consumirCiclo) C.consumirCiclo();
  }
  /** Pide el paquete del equipo elegido una sola vez por equipo y repinta al llegar. */
  /** El cliente: la lista de ciclos publicados y el informe del elegido. */
  function cargarPublicados() {
    const eq = estado.equipo;
    const club = (typeof CLUB !== 'undefined' && CLUB.estado) ? CLUB.estado.id : null;
    const pl = (SGADD.CATALOGO.planillas || []).filter(x => x.id === SGADD_APP.estado.planillaId)[0];
    const ficha = String(SGADD_APP.estado.planillaId || '') + '|' + eq;
    if (!eq || !club || !pl || typeof SGADD_DATA === 'undefined' || !SGADD_DATA.ciclosPublicados) return;
    if (estado.paqDe !== ficha) {
      estado.paqDe = ficha; estado.cargando = true; estado.error = null; estado.publicados = []; estado.foto = null; estado.fotoDe = null; estado.pubClave = null;
      SGADD_DATA.ciclosPublicados(club, pl.slug, eq).then((r) => { if (estado.paqDe !== ficha) return; estado.publicados = r.publicados || []; estado.cargando = false; abrirPendiente(); pintar(); })
        .catch((e) => { if (estado.paqDe === ficha) { estado.error = (e && e.message) || 'Sin conexión con el servidor.'; estado.cargando = false; pintar(); } });
      return;
    }
    if (estado.cargando || !estado.publicados.length) return;
    const clave = estado.pubClave || estado.publicados[estado.publicados.length - 1].clave;
    if (estado.fotoDe === clave || estado.fotoPidiendo === clave) return;
    estado.fotoPidiendo = clave; estado.fotoError = null;
    SGADD_DATA.cicloFoto(club, pl.slug, eq, clave).then((r) => { if (estado.paqDe !== ficha) return; estado.foto = r; estado.fotoDe = clave; estado.fotoPidiendo = null; pintar(); })
      .catch((e) => { estado.fotoPidiendo = null; estado.fotoError = (e && e.message) || 'Sin conexión.'; pintar(); });
  }

  function cargarPaquete(idx) {
    if (!esAdmin()) { cargarPublicados(); return; }
    const eq = estado.equipo;
    const paqDeCiclos = typeof SGADD_DATA !== 'undefined' && SGADD_DATA.ciclosPaquete;
    /* La ficha es CATEGORÍA + EQUIPO: con el nombre solo, pasar de «Apertura 2025» a «LAB 2026-27»
       (mismo equipo) dejaba el paquete de la temporada anterior en pantalla (medido el 2026-11-06). */
    const ficha = String(SGADD_APP.estado.planillaId || '') + '|' + eq;
    if (!eq || estado.paqDe === ficha || (!paqDeCiclos && (typeof SGADD_PBP === 'undefined' || !SGADD_PBP.pedir))) return;
    estado.paqDe = ficha; estado.cargando = true; estado.error = null; estado.paq = null; estado.ciclo = null; estado.sellados = [];
    const r = document.getElementById('view-root');
    if (r) r.innerHTML = (SGADD_APP.barra ? SGADD_APP.barra() : '') + html(idx);
    const club = (typeof CLUB !== 'undefined' && CLUB.estado) ? CLUB.estado.id : null;
    const pl = (SGADD.CATALOGO.planillas || []).filter(x => x.id === SGADD_APP.estado.planillaId)[0];
    const pedirSellos = (typeof SGADD_DATA !== 'undefined' && SGADD_DATA.ciclosSellados && club && pl)
      ? SGADD_DATA.ciclosSellados(club, pl.slug, eq).catch(() => []) : Promise.resolve([]);
    if (typeof SGADD_DATA !== 'undefined' && SGADD_DATA.ciclosPublicados && club && pl) {
      SGADD_DATA.ciclosPublicados(club, pl.slug, eq).then((r) => { if (estado.paqDe === ficha) { estado.publicados = r.publicados || []; estado.envioClientes = !!r.envioClientes; abrirPendiente(); pintar(); } }).catch(() => {});
    }
    /* El paquete de CICLOS (plan ORO): no pasa por la capa de laboratorio. */
    const pedirPaq = paqDeCiclos && club && pl ? SGADD_DATA.ciclosPaquete(club, pl.slug, eq) : SGADD_PBP.pedir(eq);
    Promise.all([pedirPaq, pedirSellos]).then(([p, sl]) => { if (estado.paqDe === ficha) { estado.paq = p; estado.sellados = sl; estado.cargando = false; pintar(); } })
      .catch((e) => { if (estado.paqDe === ficha) { estado.error = (e && e.message) || 'Sin conexión con el servidor.'; estado.cargando = false; pintar(); } });
  }

  function elegirEquipo(n) { estado.equipo = n || null; estado.ciclo = null; estado.comparar = null; estado.paqDe = null; estado.paq = null; pintar(); }
  function elegirCiclo(n) { estado.ciclo = Number(n); estado.comparar = null; pintar(); }
  function elegirComparar(v) { estado.comparar = (v === '' || v === null) ? null : Number(v); pintar(); }
  /** Sellar el ciclo: confirma con el modal, y el servidor recalcula (no acepta lo que arma el navegador). */
  function sellar(num) {
    const eq = estado.equipo, n = CI.PARTIDOS_POR_CICLO;
    const club = CLUB.estado.id;
    const pl = (SGADD.CATALOGO.planillas || []).filter(x => x.id === SGADD_APP.estado.planillaId)[0];
    SGADD_CONFIRMAR.abrir({
      titulo: 'Sellar el ciclo ' + num, confirmar: 'Sellar',
      aviso: 'Un ciclo sellado no se reemplaza ni se borra.',
      cambios: [{ label: 'Equipo', antes: '—', despues: eq }, { label: 'Ciclo', antes: 'sin sellar', despues: 'Ciclo ' + num + ' · sellado' }],
      alConfirmar: () => {
        estado.sellando = true;
        return SGADD_DATA.sellarCiclo(club, pl.slug, eq, { tipo: 'ciclo', numero: num, n }).then(() => SGADD_DATA.ciclosSellados(club, pl.slug, eq))
          .then((sl) => { estado.sellados = sl; })
          .catch((e) => { estado.error = null; if (typeof SGADD_BUZON !== 'undefined' && SGADD_BUZON.toast) SGADD_BUZON.toast('No se selló: ' + e.message, 6000); })
          .then(() => { estado.sellando = false; pintar(); });
      },
    });
  }
  /* ===================================================== CERRAR UN CICLO (admin)
     Un modal con dos decisiones: publicarlo en la plataforma y mandarlo por
     mail. «Solo a mi mail» no sella ni publica: es la prueba de punta a punta. */
  function mailAdmin() { try { const s = SGADD_AUTH.sesion && SGADD_AUTH.sesion(); return (s && s.email) || ''; } catch (e) { return ''; } }
  function modalCierre() {
    const m = estado.cierre;
    if (!m) return '';
    const pub = publicadoDe(m.num);
    const op = (val, txt, sub, hab) => `<label class="flex items-start gap-2 text-xs ${hab ? '' : 'opacity-50'}"><input type="radio" name="ciEnviar" value="${val}" ${m.enviar === val ? 'checked' : ''} ${hab && !m.yendo ? '' : 'disabled'}
      onchange="SGADD_CICLOSUI.cierreCampo('enviar', this.value)"><span><b>${txt}</b>${sub ? `<br><span class="text-muted">${sub}</span>` : ''}</span></label>`;
    const acc = !m.publicar && m.enviar === 'no' ? '' : (m.publicar ? (m.enviar === 'no' ? 'Sellar y publicar' : 'Sellar, publicar y enviar') : 'Enviar');
    const res = m.resultado ? `<div class="text-xs zona-texto zona-exito">✓ ${esc(m.resultado)}</div>` : '';
    const err = m.error ? `<div class="text-xs zona-texto zona-peligro">✗ ${esc(m.error)}</div>` : '';
    return `<div class="login-fondo" role="dialog" aria-modal="true" aria-labelledby="ciCierreT" onclick="if(event.target===this)SGADD_CICLOSUI.cerrarModal()">
      <div class="login-caja"><div class="p-5 space-y-3">
        <h2 id="ciCierreT" class="font-display uppercase tracking-wide text-sm text-ink">Ciclo ${m.num} · ${esc(estado.equipo || '')}</h2>
        <label class="flex items-start gap-2 text-xs ${pub ? 'opacity-50' : ''}"><input type="checkbox" ${m.publicar ? 'checked' : ''} ${pub || m.yendo ? 'disabled' : ''} onchange="SGADD_CICLOSUI.cierreCampo('publicar', this.checked)">
          <span><b>${pub ? 'Ya está publicado' : 'Sellarlo y publicarlo en la plataforma'}</b><br><span class="text-muted">El cuerpo técnico lo ve en Ciclos tal cual está ahora. Lo sellado no se reemplaza.</span></span></label>
        <div class="space-y-2"><div class="text-[10px] uppercase tracking-wider text-muted font-display">Mail con el informe en PDF</div>
          ${op('no', 'No mandar mail', '', true)}
          ${op('prueba', 'Solo a mi mail (prueba)', esc(mailAdmin() || 'el mail de tu sesión') + (m.publicar ? '' : ' · sin sellar ni publicar nada'), true)}
          ${op('equipo', 'A los usuarios del club', estado.envioClientes ? 'Cada mail del padrón de acceso del club.' : 'Apagado en el servidor hasta que confirmes la prueba (CICLOS_ENVIO_CLIENTES=si).', estado.envioClientes)}</div>
        ${res}${err}
        <div class="flex justify-end gap-2 pt-2"><button type="button" onclick="SGADD_CICLOSUI.cerrarModal()" class="px-3 py-2 text-xs rounded-md border border-hairline text-ink">${m.resultado ? 'Cerrar' : 'Cancelar'}</button>
          ${m.resultado ? '' : `<button type="button" ${acc && !m.yendo ? '' : 'disabled'} onclick="SGADD_CICLOSUI.confirmarCierre()" class="px-3 py-2 text-xs font-semibold rounded-md bg-accent text-base disabled:opacity-40">${m.yendo ? 'Trabajando…' : acc || 'Elegí una opción'}</button>`}</div>
      </div></div></div>`;
  }
  function pintarModal() {
    if (typeof document === 'undefined') return;
    let n = document.getElementById('ciCierre');
    if (!estado.cierre) { if (n) n.remove(); return; }
    if (!n) { n = document.createElement('div'); n.id = 'ciCierre'; document.body.appendChild(n); }
    n.innerHTML = modalCierre();
  }
  function abrirCierre(num) {
    const pub = publicadoDe(num);
    estado.cierre = { num: Number(num), publicar: !pub, enviar: 'prueba', yendo: false, resultado: null, error: null };
    pintarModal();
  }
  function cerrarModal() { const hubo = estado.cierre && estado.cierre.resultado; estado.cierre = null; pintarModal(); if (hubo) pintar(); }
  function cierreCampo(k, v) { if (!estado.cierre || estado.cierre.yendo) return; estado.cierre[k] = v; estado.cierre.error = null; pintarModal(); }
  /** La foto: las 6 secciones del informe que se ve, ya armadas, con su estilo. */
  function fotoDelInforme() {
    const CIN = (typeof SGADD_CICLOINFORME !== 'undefined') ? SGADD_CICLOINFORME : null;
    const x = estado.modelo;
    if (!CIN || !x || !x.modelo) return null;
    const secciones = {};
    SECCIONES.forEach(([id]) => { if (x.modelo.secciones && x.modelo.secciones[id]) secciones[id] = CIN.html(x.modelo, id); });
    return { titulo: 'Ciclo ' + x.ciclo.meta.numero + ' · ' + (x.ciclo.meta.equipo || estado.equipo || ''), estilo: CIN.CSS || '', secciones, generado: new Date().toISOString() };
  }
  const CIN = () => (typeof SGADD_CICLOINFORME !== 'undefined' ? SGADD_CICLOINFORME : null);
  function confirmarCierre() {
    const m = estado.cierre;
    if (!m || m.yendo) return;
    const x = estado.modelo;
    if (!x || x.ciclo.meta.numero !== m.num) { m.error = 'Abrí ese ciclo en la pantalla antes de cerrarlo: el informe que se publica es el que ves.'; pintarModal(); return; }
    const foto = fotoDelInforme();
    if (!foto) { m.error = 'El informe no está armado todavía.'; pintarModal(); return; }
    const club = CLUB.estado.id;
    const pl = (SGADD.CATALOGO.planillas || []).filter(p => p.id === SGADD_APP.estado.planillaId)[0];
    m.yendo = true; m.error = null; pintarModal();
    SGADD_DATA.cerrarCiclo(club, pl.slug, { equipo: estado.equipo, criterio: { tipo: 'ciclo', numero: m.num, n: CI.PARTIDOS_POR_CICLO }, huella: CI.huella(x.ciclo), foto, metas: (CIN() && CIN().metasDelCiclo) ? CIN().metasDelCiclo(x.modelo) : null, publicar: !!m.publicar, enviar: m.enviar })
      .then((r) => {
        const partes = [];
        if (r.publicado && m.publicar) partes.push('Sellado y publicado: el cuerpo técnico ya lo ve');
        if (r.envio) partes.push('Mail enviado a ' + r.envio.a.join(', ') + (r.envio.fallidos.length ? ' (fallaron ' + r.envio.fallidos.length + ')' : ''));
        m.resultado = partes.join(' · ') || 'Listo.';
        return SGADD_DATA.ciclosPublicados(club, pl.slug, estado.equipo).then((l) => { estado.publicados = l.publicados || []; }).catch(() => {})
          .then(() => SGADD_DATA.ciclosSellados(club, pl.slug, estado.equipo).then((sl) => { estado.sellados = sl; }).catch(() => {}));
      })
      .catch((e) => { m.error = (e && e.message) || 'No se pudo.'; })
      .then(() => { m.yendo = false; pintarModal(); });
  }
  function elegirPublicado(clave) { estado.pubClave = String(clave); estado.seccion = 'principal'; estado.vistaFotoError = null; pintar(); }

  function verSeccion(s) { estado.seccion = SECCIONES.some(x => x[0] === s) ? s : 'principal'; pintar(); }
  function verLado(l) { estado.lado = l === 'favor' ? 'favor' : 'contra'; pintar(); }

  return {
    estado, html, pintar, elegirEquipo, elegirCiclo, elegirComparar, verLado, verSeccion, sellar, SECCIONES,
    abrirCierre, cerrarModal, cierreCampo, confirmarCierre, elegirPublicado, abrirPendiente, previoDe, htmlCliente, modalCierre, fotoDelInforme, verComoCliente, fuenteVista,
    bloqueEquipos, bloque4Factores, bloqueArquetipos, bloqueEscenarios, bloqueJugadores, bloqueClasificacion, bloqueFixture, bloquePlan,
    bloqueSello, bloqueHistorial, selladoDe,
    bloqueResultados, bloqueTransicion, bloqueCuartos, bloqueMapa, bloqueCausas, bloqueComparar, bloqueAuditoria, lecturaZonas,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CICLOSUI;
