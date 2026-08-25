/* =====================================================================
   SGADD · Motor de CONFIGURACIÓN de competencia

   Módulo PURO: no toca `document` ni ninguna global del navegador, así
   que se puede require() desde Node y testear entero.

   Contesta lo que el box score NO puede saber: cuántos clasifican a
   playoffs, cuántos descienden, qué significa cada zona de la tabla y
   con qué color se pinta.

   ---------------------------------------------------------------------
   LA LÍNEA QUE NO SE CRUZA: la ESTRUCTURA sale del DATO.

   Este módulo NO declara cuántos equipos hay ni qué torneos existen.
   Eso ya lo dice el libro —`combinacionesTorneoFase()` enumera los
   tramos reales y el índice cuenta los equipos— y declararlo otra vez
   crea una segunda fuente de verdad que se desincroniza en silencio.
   Este proyecto ya se comió ese bug tres veces: el `sheetId` en dos
   lados resucitando un id muerto, el rol funcional en dos módulos
   dando etiquetas distintas, y el Diagnóstico armando su índice sin
   torneo y contando 373 jugadores donde la app usaba 208.

   `equiposEsperados` es la excepción, y es a propósito una ASERCIÓN:
   no manda sobre el dato, solo permite que config y libro se
   contradigan A LOS GRITOS en el Diagnóstico en vez de callados.
   ===================================================================== */
const SGADD_CONFIG = (function () {
  'use strict';

  /* ===================================================================
     TONOS · vocabulario CERRADO, no colores sueltos

     Una zona declara un TONO, no un hex. Es la misma decisión que ya
     tomó `scoutTono()` en el informe, y por los mismos dos motivos:

       1. Un color crudo no sobrevive al aplanado del papel. El modo de
          impresión pisa los colores de pantalla, así que un hex elegido
          para la card oscura sale negro o ilegible en la hoja.
       2. Un color crudo no garantiza contraste. Lo que se lee sobre
          #1F2937 no se lee sobre #f1f5f9.

     Cada tono trae SU variante por superficie, y las diez están
     medidas: todas pasan 4.5 (WCAG AA) contra el fondo que les toca.
     Hay un test que las recalcula con la MISMA función que usa el
     panel para los acentos, y falla si alguna baja.

       tono       pantalla /#1F2937    papel   /#f1f5f9  /#ffffff
       exito      #4ade80     8.42     #15803d    4.58     5.02
       positivo   #5eead4     9.92     #0f766e    5.00     5.47
       aviso      #fbbf24     8.79     #8a5206    5.83     6.38
       peligro    #f87171     5.31     #b91c1c    5.91     6.47
       neutro     #94a3b8     5.72     #475569    6.92     7.58

     El ámbar del papel es #8a5206 y no el #a16207 obvio porque ese
     daba 4.49: dos centésimas por debajo del mínimo. Un tono "casi AA"
     es un tono que no cumple.
     =================================================================== */
  const TONOS = {
    exito:    { id: 'exito',    pantalla: '#4ade80', papel: '#15803d' },
    positivo: { id: 'positivo', pantalla: '#5eead4', papel: '#0f766e' },
    aviso:    { id: 'aviso',    pantalla: '#fbbf24', papel: '#8a5206' },
    peligro:  { id: 'peligro',  pantalla: '#f87171', papel: '#b91c1c' },
    neutro:   { id: 'neutro',   pantalla: '#94a3b8', papel: '#475569' },
  };
  const TONO_POR_DEFECTO = 'neutro';

  /** El color de un tono para la superficie pedida. Un id desconocido
   *  cae a `neutro` en vez de devolver undefined: una zona sin color se
   *  pinta transparente y deja de distinguirse, que es peor que gris. */
  function tono(id, enPapel) {
    const t = TONOS[id] || TONOS[TONO_POR_DEFECTO];
    return enPapel ? t.papel : t.pantalla;
  }

  const TRAMO_CUALQUIERA = '*';

  function texto(v) { return v === null || v === undefined ? '' : String(v); }
  function entero(v) {
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }

  /* ===================================================================
     PARSEO · el bloque `competencia` de clubes/<club>.json

     TODO es opcional y el fallback es SIEMPRE seguro. La regla del
     punto 6 no se negocia: la config de cliente nunca puede tumbar el
     dashboard. Sin bloque, con un bloque roto o con un JSON a medias,
     `parsear()` devuelve null y el panel se comporta exactamente como
     antes de que este módulo existiera.
     =================================================================== */
  function parsear(json) {
    if (!json || typeof json !== 'object') return null;
    const c = json.competencia;
    if (!c || typeof c !== 'object') return null;

    const formatos = {};
    const crudos = c.formatos && typeof c.formatos === 'object' ? c.formatos : {};
    Object.keys(crudos).forEach((id) => {
      const f = crudos[id];
      if (!f || typeof f !== 'object') return;
      formatos[id] = {
        id: id,
        label: texto(f.label) || id,
        equiposEsperados: entero(f.equiposEsperados),
        zonas: normalizarZonas(f.zonas),
      };
    });

    /* `porTramo` guarda el valor TAL CUAL, incluido el null explícito.
       Distinguir "la clave no está" de "la clave dice null" es lo que
       permite apagar las zonas en un tramo puntual —en playoffs no hay
       tabla que pintar— sin que el comodín lo resucite. */
    const porTramo = {};
    const pt = c.porTramo && typeof c.porTramo === 'object' ? c.porTramo : {};
    Object.keys(pt).forEach((k) => { porTramo[k.toUpperCase()] = pt[k]; });

    return {
      ordenTabla: Array.isArray(c.ordenTabla) && c.ordenTabla.length
        ? c.ordenTabla.map(texto) : ['PCT', 'DIF', 'PF'],
      formatos: formatos,
      porTramo: porTramo,
    };
  }

  function normalizarZonas(lista) {
    if (!Array.isArray(lista)) return [];
    const out = [];
    lista.forEach((z) => {
      if (!z || typeof z !== 'object') return;
      const desde = entero(z.desde);
      if (desde === null || desde === 0) return;   // 0 no es un puesto
      out.push({
        id: texto(z.id) || ('zona' + (out.length + 1)),
        label: texto(z.label) || texto(z.id),
        tono: TONOS[z.tono] ? z.tono : TONO_POR_DEFECTO,
        desde: desde,
        hasta: z.hasta === undefined || z.hasta === null ? null : entero(z.hasta),
      });
    });
    return out;
  }

  /* ===================================================================
     RESOLUCIÓN POR TRAMO

     La clave es TORNEO|FASE, EXACTAMENTE la misma que ya produce
     `SGADD.combinacionesTorneoFase()`. Cero traducción entre config y
     datos: si la clave hubiera que construirla distinto, tarde o
     temprano una de las dos formas se queda vieja.

     Orden de búsqueda, de lo específico a lo general:

         TORNEO|FASE   →   TORNEO|*   →   *|FASE   →   *

     Una clave presente GANA aunque valga null, y ese null significa
     "este tramo no lleva zonas". Sin esa distinción, apagar la tabla en
     playoffs sería imposible: el comodín volvería a encenderla.
     =================================================================== */
  function formatoDeTramo(cfg, torneo, fase) {
    if (!cfg) return null;
    const t = texto(torneo).toUpperCase() || TRAMO_CUALQUIERA;
    const f = texto(fase).toUpperCase() || TRAMO_CUALQUIERA;
    const claves = [
      t + '|' + f,
      t + '|' + TRAMO_CUALQUIERA,
      TRAMO_CUALQUIERA + '|' + f,
      TRAMO_CUALQUIERA,
    ];
    for (let i = 0; i < claves.length; i++) {
      const k = claves[i];
      if (!Object.prototype.hasOwnProperty.call(cfg.porTramo, k)) continue;
      const id = cfg.porTramo[k];
      if (id === null || id === undefined) return null;   // apagado a propósito
      return cfg.formatos[id] || null;
    }
    return null;
  }

  /* ===================================================================
     ZONAS · índices negativos y cascada

     `desde`/`hasta` son puestos 1-indexados. Un valor NEGATIVO se
     cuenta desde el fondo: -1 es el último, -2 el penúltimo.

     No es un capricho de sintaxis. La cantidad de equipos cambia entre
     categorías del mismo club —Primera 12, U21 13— y un `desde: 11`
     fijo marca mal en cuanto entra una categoría con otro número, sin
     ningún síntoma: la tabla se ve perfecta y el descenso está corrido
     un puesto.

     `hasta` se puede omitir: con `desde` negativo llega hasta el final
     (el caso natural de "los últimos N"), y con `desde` positivo la
     zona es de un solo puesto.

     GANA LA PRIMERA ZONA QUE CALZA. Es cascada, el mismo idioma que ya
     usan `PERFILES_MARCA` y `JERARQUIA` en este código, así que las
     zonas se escriben de la más específica a la más general: Campeón
     1-1 vive adentro de Playoffs 1-8 y tiene que ir antes.
     =================================================================== */
  function resolverPuesto(v, total) {
    if (v === null || v === undefined) return null;
    return v < 0 ? total + 1 + v : v;
  }

  function rangoDeZona(zona, total) {
    const desde = resolverPuesto(zona.desde, total);
    let hasta;
    if (zona.hasta !== null && zona.hasta !== undefined) hasta = resolverPuesto(zona.hasta, total);
    else hasta = zona.desde < 0 ? total : desde;
    if (desde === null || hasta === null) return null;
    if (desde > hasta) return null;          // rango invertido: no se aplica
    return { desde: desde, hasta: hasta };
  }

  function zonaDePuesto(formato, puesto, total) {
    if (!formato || !formato.zonas || !formato.zonas.length) return null;
    const n = entero(total), p = entero(puesto);
    if (!n || n < 1 || !p || p < 1 || p > n) return null;
    for (let i = 0; i < formato.zonas.length; i++) {
      const z = formato.zonas[i];
      const r = rangoDeZona(z, n);
      if (!r) continue;
      if (p >= r.desde && p <= r.hasta) {
        return { id: z.id, label: z.label, tono: z.tono, desde: r.desde, hasta: r.hasta };
      }
    }
    return null;
  }

  /** La zona de cada puesto, de 1 a `total`. Índice 0 = puesto 1. */
  function zonasDeTabla(formato, total) {
    const n = entero(total) || 0;
    const out = [];
    for (let p = 1; p <= n; p++) out.push(zonaDePuesto(formato, p, n));
    return out;
  }

  /** Las zonas efectivamente alcanzables con `total` equipos, en orden
   *  de tabla y sin repetir: es lo que la leyenda tiene que mostrar.
   *  Una zona tapada enteramente por otra más específica no aparece —
   *  y eso es correcto: si no pinta ningún puesto, explicarla confunde. */
  function leyenda(formato, total) {
    const vistas = [], porId = {};
    zonasDeTabla(formato, total).forEach((z) => {
      if (!z || porId[z.id]) return;
      porId[z.id] = true;
      vistas.push(z);
    });
    return vistas;
  }

  /* ===================================================================
     VALIDACIÓN · para el Diagnóstico

     Denuncia los descuadres entre lo que la config declara y lo que el
     libro trae. NUNCA cambia nada: acá el dato manda siempre.
     =================================================================== */
  function validar(cfg, contexto) {
    const out = [];
    if (!cfg) return out;
    const ctx = contexto || {};
    const equipos = entero(ctx.equipos);

    /* Un formato declarado que ningún tramo usa es config muerta: se
       edita creyendo que hace algo y no hace nada. */
    const usados = {};
    Object.keys(cfg.porTramo).forEach((k) => {
      const v = cfg.porTramo[k];
      if (v) usados[v] = true;
    });
    Object.keys(cfg.formatos).forEach((id) => {
      if (!usados[id]) out.push({ nivel: 'aviso', tema: 'competencia',
        mensaje: 'El formato "' + id + '" no lo usa ningún tramo: es configuración muerta.' });
    });
    Object.keys(cfg.porTramo).forEach((k) => {
      const v = cfg.porTramo[k];
      if (v && !cfg.formatos[v]) out.push({ nivel: 'error', tema: 'competencia',
        mensaje: 'El tramo ' + k + ' apunta al formato "' + v + '", que no está declarado.' });
    });

    const f = formatoDeTramo(cfg, ctx.torneo, ctx.fase);
    if (!f) return out;

    /* LA ASERCIÓN. El dato manda: si no coinciden, se avisa y se sigue
       trabajando con lo que trae el libro. Es error y no aviso porque
       un descuadre acá CORRE las zonas de puesto: con 12 declarados y
       13 reales, el que creías que descendía se salva y nadie lo nota
       mirando la tabla, que se ve perfecta. */
    if (f.equiposEsperados && equipos && f.equiposEsperados !== equipos) {
      out.push({ nivel: 'error', tema: 'competencia',
        mensaje: 'El formato "' + f.id + '" declara ' + f.equiposEsperados +
          ' equipos y el libro trae ' + equipos + '. Las zonas se calculan sobre los ' +
          equipos + ' reales, así que los cortes quedan corridos respecto de lo configurado.' });
    }

    if (!f.zonas.length) {
      out.push({ nivel: 'aviso', tema: 'competencia',
        mensaje: 'El formato "' + f.id + '" no declara ninguna zona: la tabla sale sin colores.' });
      return out;
    }

    if (equipos) {
      /* Una zona que con esta cantidad de equipos no alcanza a ningún
         puesto está declarada y no se ve. Pasa sobre todo con rangos
         fijos heredados de una categoría más grande. */
      const alcanzadas = {};
      leyenda(f, equipos).forEach((z) => { alcanzadas[z.id] = true; });
      f.zonas.forEach((z) => {
        if (alcanzadas[z.id]) return;
        const r = rangoDeZona(z, equipos);
        out.push({ nivel: 'aviso', tema: 'competencia',
          mensaje: 'La zona "' + z.id + '" no alcanza ningún puesto con ' + equipos +
            ' equipos' + (r ? ' (queda ' + r.desde + '–' + r.hasta + ', tapada por una anterior)'
              : ' (el rango se invierte)') + '.' });
      });
    }
    return out;
  }

  return {
    TONOS, TONO_POR_DEFECTO, TRAMO_CUALQUIERA, tono,
    parsear, formatoDeTramo, zonaDePuesto, zonasDeTabla, leyenda, validar,
    _rangoDeZona: rangoDeZona,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CONFIG;
