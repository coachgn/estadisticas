/* =====================================================================
   SGADD · Landing neutra · lo que ve quien entra sin club

   EL PROBLEMA QUE RESUELVE. Hasta acá, la URL limpia cargaba Reconquista
   por defecto (`POR_DEFECTO` en `sgadd-club.js`) y, sin token, mostraba un
   panel lleno de carteles rojos pidiendo un link de acceso. O sea que la
   dirección que uno comparte para presentar el producto mostraba el
   producto roto, y encima con la marca de un cliente que no es el que
   estaba mirando.

   Ahora esa URL abre una bienvenida con la marca de MotorStats y, en cada
   sección del menú, una explicación de qué se ve ahí. Sigue siendo el
   mismo panel: no es una página aparte que haya que mantener en paralelo
   —eso se desincroniza— sino un modo del mismo router.

   NO SE PIDEN DATOS EN ESTE MODO. Sin club no hay planilla que bajar, así
   que no se llama al backend ni a GViz: la landing carga instantánea y no
   puede fallar por red.
   ===================================================================== */

const SGADD_LANDING = (function () {
  'use strict';

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc)
    ? SGADD_UI.esc(v) : String(v == null ? '' : v);

  const MARCA = 'MotorStats.ar';
  const MAIL = 'motorstats.ar@gmail.com';
  const INSTAGRAM = 'https://www.instagram.com/motorstats.ar/';
  const ARROBA = '@motorstats.ar';
  const LOGO = 'logos/motorlogo-64.png';
  const LOGO_GRANDE = 'logos/motorlogo-128.png';

  /* LA DEMO PUBLICA. Es una CARPETA con un redirect adentro y no un
     `?demo=1` pelado, porque lo que se comparte en un WhatsApp es una
     ruta: `motorstats.ar/demo` se lee y se dicta, y un query string se
     corta al pegarlo. El redirect deja la app en un solo archivo. */
  const RUTA_DEMO = 'demo/index.html';

  /* =====================================================================
     MOTOR · puro
     ===================================================================== */

  /**
   * ¿Estamos en la landing?
   *
   * SE DECIDE POR LA AUSENCIA DE `?club=`, no por si hay sesión. Un admin
   * logueado que entra a la URL limpia también ve la landing: todavía no
   * eligió cliente, y mostrarle los datos de uno cualquiera sería peor que
   * preguntarle. Desde ahí elige con el selector del header.
   */
  function activa(busqueda) {
    /* SE DELEGA EN `CLUB.esLanding()`, que es donde vive la decisión.
       `sgadd-club.js` carga PRIMERO y se auto-arranca, así que necesita
       contestarse esto antes de que este módulo exista; tener la respuesta
       en los dos lados garantiza que un día divergan. */
    if (busqueda === undefined && typeof CLUB !== 'undefined' && CLUB.esLanding) {
      return CLUB.esLanding();
    }
    try {
      const q = new URLSearchParams(
        busqueda !== undefined ? busqueda
          : (typeof window !== 'undefined' ? window.location.search : ''));
      return !q.get('club');
    } catch (e) { return false; }
  }

  /**
   * Qué se explica en cada sección.
   *
   * EL TEXTO DESCRIBE LO QUE LA SECCIÓN HACE DE VERDAD, no lo que suena
   * bien: cada uno sale de mirar qué pinta ese módulo. Una landing que
   * promete algo que la app no tiene se nota en el primer click y quema la
   * confianza justo cuando se la está construyendo.
   */
  const SECCIONES = {
    principal: {
      titulo: 'Principal',
      que: 'La foto de la categoría en una pantalla.',
      detalle: 'Cuántos equipos, cuántos jugadores y cuántos partidos lleva el torneo, '
        + 'los líderes en puntos, rebotes y asistencias, la tabla de posiciones y el '
        + 'cruce de rating ofensivo contra defensivo de todos los equipos.',
      items: ['Resumen del torneo', 'Líderes por métrica', 'Tabla de posiciones', 'Ataque vs defensa'],
    },
    equipos: {
      titulo: 'Equipos',
      que: 'La ficha completa de un equipo, en ocho pestañas.',
      detalle: 'Rating neto, ofensivo y defensivo con su percentil contra la liga; los '
        + 'cuatro factores; el rendimiento de local y de visitante; ocho ejes de identidad '
        + 'táctica; el plantel; y el detalle partido a partido con box score.',
      items: ['Percentiles contra la liga', '4 Factores', 'Local vs visitante',
        'Identidad táctica', 'Detalle de cada partido'],
    },
    jugadores: {
      titulo: 'Jugadores',
      que: 'El perfil 360° de cada jugador del torneo.',
      detalle: 'Rol por minutos, arquetipos técnicos y jerarquía dentro del plantel; el '
        + 'perfil de tiro por zona; la evolución partido a partido con banda de desvío y '
        + 'picos atípicos marcados; y los rankings de la liga.',
      items: ['ADN del jugador', 'Perfil de tiro', 'Evolución con atípicos',
        'Rankings de la liga', 'Ficha en PDF'],
    },
    fixture: {
      titulo: 'Fixture',
      que: 'El calendario del torneo, con lo jugado y lo que viene.',
      detalle: 'Los partidos del mes con su resultado, los de tu equipo resaltados y el '
        + 'próximo rival de un vistazo: cómo le fue y qué tiene después. Aparece cuando '
        + 'tu torneo publica su calendario.',
      items: ['Partidos del mes', 'Tu próximo rival', 'Lo jugado y lo que falta'],
    },
    clasificacion: {
      titulo: 'Clasificación',
      que: 'La tabla de posiciones, con las zonas del torneo.',
      detalle: 'Récord, diferencia de puntos y desglose de local y visitante, con las '
        + 'franjas de ascenso, repechaje y descenso que declare cada competencia. El '
        + 'desempate sigue el orden que fija el club, no el alfabético.',
      items: ['Zonas por competencia', 'Desglose local/visitante', 'Desempate configurable'],
    },
    scouting: {
      titulo: 'Scouting',
      que: 'El informe pre-partido, calculado.',
      detalle: 'La matriz de métricas avanzadas contra el rival, el plan defensivo '
        + 'colectivo con la marca sugerida jugador por jugador, las claves estratégicas '
        + 'que activan los datos, y la ficha de cada rival. Todo exportable a PDF.',
      items: ['Matriz contra el rival', 'Plan defensivo y marcas',
        'Claves estratégicas', 'Informe en PDF'],
      plan: 'Plata',
    },
    glosario: {
      titulo: 'Glosario',
      que: 'Qué mide cada columna, en castellano.',
      detalle: 'Las métricas del panel con su nombre completo, su fórmula y cómo se '
        + 'lee cada número. Sale del mismo manual con el que se audita la planilla, '
        + 'así que dice exactamente lo que el dato significa. Se busca por sigla o '
        + 'por palabra suelta.',
      items: ['Buscador', 'Fórmula de cada métrica', 'Cómo leer el número'],
    },
  };

  /**
   * Cuántos mails admite cada plan.
   *
   * SE MUESTRA EN LA LANDING PORQUE ES LO QUE EL CLIENTE PREGUNTA: "¿lo
   * puede usar mi ayudante?". Está acá y no en el motor de permisos porque
   * HOY NO SE HACE CUMPLIR EN NINGÚN LADO: es la condición comercial
   * escrita, no un límite que el sistema imponga.
   *
   * Cuando el alta de clientes lo controle, el número tiene que salir de
   * un solo lugar y esta tabla pasa a leerlo de ahí — dos listas de cupos
   * que digan cosas distintas es exactamente el reclamo que uno no quiere
   * tener con un cliente que paga.
   */
  /* CADA PLAN CON SU METAL, y no con un tono del semáforo: verde/amarillo
     significan «bien/atención» en todo el panel, y un plan no es mejor ni
     peor — es otro. Los tres pasan AA sobre la tarjeta (#1b1b1b), medido
     con la misma `contraste()` que usa el resto: bronce 5,48 · plata 9,47 ·
     oro 12,28. Hay un test que lo vuelve a medir. */
  /* EL NUMERO DE MAILS NO SE ESCRIBE ACA: sale de `SGADD_AUTH.CUPO_MAILS`,
     que es la misma tabla que el servidor hace cumplir al dar de alta un
     mail. Con dos listas, la landing le prometeria al cliente un cupo que
     el backend no respeta — y el que se relaja es siempre el que decide. */
  const CUPOS = (typeof SGADD_AUTH !== 'undefined' && SGADD_AUTH.CUPO_MAILS)
    ? SGADD_AUTH.CUPO_MAILS : { BRONCE: 2, PLATA: 3, ORO: 4 };
  const PLANES_MAILS = [
    { nombre: 'Bronce', mails: CUPOS.BRONCE, color: '#CD7F32' },
    { nombre: 'Plata', mails: CUPOS.PLATA, color: '#C0C0C0' },
    { nombre: 'Oro', mails: CUPOS.ORO, color: '#FFD700' },
  ];

  /* =====================================================================
     QUE INCLUYE CADA PLAN · SE DERIVA, NO SE ESCRIBE

     La tentacion es listar a mano lo que trae cada card. No se hace: la
     matriz de que pide cada seccion ya vive en `SGADD_AUTH.MODULOS`, que
     es la que el panel HACE CUMPLIR. Con una segunda lista, la landing le
     promete al cliente un modulo que el gate le niega —o al reves, le
     esconde uno que ya tiene— y la que se relaja es siempre la de la
     pantalla. Es el bug del rol funcional (punto 8) con un cliente que
     paga del otro lado.

     Lo unico que se escribe aca es el SERVICIO del plan Oro, que no es un
     modulo del panel sino trabajo humano: no hay ningun `MODULOS` que lo
     pueda declarar. Su numero de partidos si sale del codigo.
     ===================================================================== */

  /* LO QUE EL PLAN BASE TRAE ADEMÁS DE LAS PANTALLAS. Sale del documento
     de bienvenida y es lo que el club cuenta al vender: no se deriva del
     gate porque no son secciones del menú. Cada texto describe algo que el
     panel hace hoy: la carga automática (la ingesta), los rankings
     (Equipos y Jugadores), la campana (alertas de plantel) y el detalle de
     cada partido (post-partido). SIN PRECIO: varía por tipo de cliente. */
  const EXTRAS_BASE = [
    { titulo: 'Carga automática', extra: true,
      detalle: 'Una vez jugados los partidos, se cargan solos dentro de las próximas 24 hs.' },
    { titulo: 'Rankings de equipos y jugadores', extra: true,
      detalle: 'Tu equipo y tus jugadores contra toda la liga, por métrica.' },
    { titulo: 'Alertas de plantel', extra: true,
      detalle: 'Sabé qué jugadores de tu liga dejaron o volvieron a jugar.' },
    { titulo: 'Análisis post-partido', extra: true,
      detalle: 'Sabé cuáles fueron las claves del partido y ajustá para el próximo.' },
  ];

  /** El plan inmediatamente anterior. `null` para el primero. */
  const ANTERIOR = { BRONCE: null, PLATA: 'BRONCE', ORO: 'PLATA' };

  /**
   * ¿Un plan alcanza para esta seccion? Misma pregunta que se hace el
   * gate, con la misma tabla. Sin `SGADD_AUTH` cargado devuelve `false`,
   * que falla CERRADO: una card que no promete nada es mejor que una que
   * promete lo que no se puede verificar.
   */
  function alcanza(plan, seccionId) {
    if (!plan) return false;
    const A = (typeof SGADD_AUTH !== 'undefined') ? SGADD_AUTH : null;
    if (!A || !A.MODULOS) return false;
    const tiene = Object.prototype.hasOwnProperty.call(A.MODULOS, seccionId);
    const regla = tiene ? A.MODULOS[seccionId] : null;
    if (!regla) return true;                 // seccion abierta
    if (regla.soloAdmin) return false;       // no se ofrece en ningun plan
    if (!regla.plan) return true;
    return A.ORDEN_PLAN[A.normalizarPlan(plan)]
        >= A.ORDEN_PLAN[A.normalizarPlan(regla.plan)];
  }

  /* LOS BLOQUES DE UNA SECCION, con su copia.

     La REGLA —que plan los incluye— vive en `SGADD_AUTH.BLOQUES`, igual
     que la de las secciones vive en `MODULOS`. Aca solo se escribe COMO
     se cuentan, que es exactamente el reparto que ya existe entre
     `SECCIONES` y la matriz: la landing pone las palabras, el motor de
     permisos pone el limite.

     Un bloque declarado en el motor y sin copia aca NO se ofrece, y hay
     un test que lo denuncia: un plan que concede algo que la card no
     nombra es plata que el cliente paga sin saber que la tiene. */
  const BLOQUES = {
    'scouting.fichas': {
      titulo: 'Ficha de análisis por jugador',
      que: 'Rol funcional, fortalezas, puntos de fuga y la decision tactica de cada '
        + 'rival uno por uno, con su defensor sugerido.',
    },
  };

  /**
   * ¿Un plan alcanza para este bloque? Mismo criterio que `alcanza`, con
   * la otra mitad de la matriz — y con la herencia: un bloque no se
   * promete si el plan no llega a la pantalla que lo contiene.
   */
  function alcanzaBloque(plan, id) {
    if (!plan) return false;
    const A = (typeof SGADD_AUTH !== 'undefined') ? SGADD_AUTH : null;
    if (!A || !A.BLOQUES) return false;
    const regla = Object.prototype.hasOwnProperty.call(A.BLOQUES, id) ? A.BLOQUES[id] : null;
    if (!regla || regla.soloAdmin) return false;
    if (regla.seccion && !alcanza(plan, regla.seccion)) return false;
    if (!regla.plan) return true;
    return A.ORDEN_PLAN[A.normalizarPlan(plan)]
        >= A.ORDEN_PLAN[A.normalizarPlan(regla.plan)];
  }

  /** Los bloques que el motor declara Y la landing sabe contar. */
  function idsDeBloques() {
    const A = (typeof SGADD_AUTH !== 'undefined') ? SGADD_AUTH : null;
    if (!A || !A.BLOQUES) return [];
    return Object.keys(A.BLOQUES).filter(id => !!BLOQUES[id]);
  }

  /** El ciclo de informes del plan Oro. Sale del hub, que es el que lo
   *  hace correr; el respaldo es para Node, donde ese modulo no esta. */
  function partidosPorCiclo() {
    return (typeof SGADD_HUB !== 'undefined' && SGADD_HUB.PARTIDOS_POR_CICLO)
      ? SGADD_HUB.PARTIDOS_POR_CICLO : 4;
  }

  /* EL SERVICIO DEL PLAN ORO. No es un modulo: es un informe que escribe
     un scouter de MotorStats. Por eso lleva otro icono que los modulos —
     prometer trabajo humano con el mismo tilde que una pantalla que ya
     esta hecha confunde lo que se entrega. */
  function servicioOro() {
    return {
      titulo: 'Análisis de scouters de MotorStats',
      detalle: 'Un informe por ciclo de ' + partidosPorCiclo() + ' partidos del equipo '
        + 'y de sus jugadores: puntos de fuga, factores de mejora y el plan de '
        + 'ajuste para el ciclo siguiente.',
      servicio: true,
    };
  }

  /**
   * Las tres cards, ya resueltas. PURA y exportada, para poder verificar
   * sin navegador que lo que promete cada plan es lo que el gate concede.
   */
  function planes() {
    return PLANES_MAILS.map((base) => {
      const clave = base.nombre.toUpperCase();
      const previo = ANTERIOR[clave];
      /* NUEVAS = lo que este plan suma sobre el anterior. Para Bronce el
         anterior es `null`, asi que «suma» todo lo abierto: es su base y
         se lee igual de rapido. */
      const nuevas = ORDEN.filter(id => alcanza(clave, id) && !alcanza(previo, id));
      const bloqueadas = ORDEN.filter(id => !alcanza(clave, id));
      const suma = [];
      const falta = [];
      nuevas.forEach(id => suma.push({
        titulo: SECCIONES[id].titulo, detalle: SECCIONES[id].que, seccion: true,
      }));
      bloqueadas.forEach(id => falta.push({
        titulo: SECCIONES[id].titulo, detalle: SECCIONES[id].que, seccion: true,
      }));
      /* Los bloques van DESPUES de las secciones y ANTES del servicio:
         es un pedazo de pantalla, no una pantalla entera ni trabajo
         humano, y la card se lee de lo mas grande a lo mas chico. */
      idsDeBloques().forEach((id) => {
        const item = { titulo: BLOQUES[id].titulo, detalle: BLOQUES[id].que, bloque: true };
        if (alcanzaBloque(clave, id)) {
          if (!alcanzaBloque(previo, id)) suma.push(item);
        } else {
          falta.push(item);
        }
      });
      /* LO QUE TRAE EL PLAN BASE y no es una pantalla propia (la carga, los
         rankings, las alertas, el post-partido): se escribe a mano, como el
         servicio de Oro, porque `MODULOS` no tiene dónde declararlo. Va en
         el primer plan y los demás lo heredan. La carga va PRIMERA: es lo
         que más pesa para quien hoy arma planillas. */
      if (!previo) {
        suma.unshift(EXTRAS_BASE[0]);
        EXTRAS_BASE.slice(1).forEach(x => suma.push(x));
      }
      if (clave === 'ORO') suma.push(servicioOro());
      else falta.push(servicioOro());
      return {
        clave, nombre: base.nombre, color: base.color, mails: base.mails,
        anterior: previo ? PLANES_MAILS[ORDEN_PLANES.indexOf(previo)].nombre : null,
        heredadas: previo ? ORDEN.filter(id => alcanza(previo, id)).length : 0,
        suma, falta,
        destacado: clave === 'PLATA',
        cta: clave === 'PLATA' ? 'Elegir Plata' : ('Consultar por ' + base.nombre),
      };
    });
  }

  const ORDEN_PLANES = ['BRONCE', 'PLATA', 'ORO'];

  /** El orden en que se listan. Es el mismo del menú. */
  const ORDEN = ['principal', 'equipos', 'jugadores', 'clasificacion', 'fixture', 'scouting', 'glosario'];

  /* =====================================================================
     UI
     ===================================================================== */

  function tarjetaSeccion(id) {
    const s = SECCIONES[id];
    if (!s) return '';
    return `
      <div class="card rounded-xl p-5 sm:p-6 border border-hairline">
        <div class="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <h2 class="font-display uppercase tracking-wide text-base text-ink">${esc(s.titulo)}</h2>
          ${s.plan ? `<span class="text-[10px] uppercase tracking-wider zona-texto zona-aviso">
            Incluido en el plan ${esc(s.plan)}</span>` : ''}
        </div>
        <p class="text-sm text-ink mb-2">${esc(s.que)}</p>
        <p class="text-xs text-muted leading-relaxed mb-4">${esc(s.detalle)}</p>
        <div class="flex flex-wrap gap-2">
          ${s.items.map(i => `<span class="text-[11px] px-2 py-1 rounded-md bg-surface2 text-muted">${esc(i)}</span>`).join('')}
        </div>
      </div>`;
  }

  /**
   * Una card de plan.
   *
   * LO QUE EL PLAN AGREGA VA ARRIBA Y EN COLOR; lo que hereda va abajo,
   * atenuado y contado en una linea; y lo que NO tiene va tachado con su
   * flecha. Los tres niveles se distinguen ademas del color por el icono
   * (✓ · ＋ · →), porque ningun estado se comunica solo con color
   * (punto 14): el que no distingue verde de gris tiene que poder leer
   * igual que Plata suma scouting.
   */
  function tarjetaPlan(p) {
    const item = (x, clase, icono) => `
      <li class="plan-item ${clase}">
        <span class="plan-ic" aria-hidden="true">${icono}</span>
        <span><strong>${esc(x.titulo)}</strong>
          <span class="plan-item-d">${esc(x.detalle)}</span></span>
      </li>`;
    /* LAS PANTALLAS SE AGRUPAN EN UNA FILA: «Panel completo de la liga»
       con la lista de lo que incluye. Seis filas de pantallas más cuatro
       de extras eran once renglones en la card del plan base, y lo que se
       quiere leer en tres segundos es la progresión, no el índice. El
       agrupado es solo de presentación: `planes()` sigue listando una por
       sección, que es lo que se verifica contra el gate. */
    const grupo = (lista, clase, icono, titulo) => {
      const secs = lista.filter(x => x.seccion);
      const iconoDe = (x) => (x.servicio ? '＋' : icono);
      const claseDe = (x) => (x.servicio ? 'plan-nuevo plan-servicio' : clase);
      if (secs.length < 2) return lista.map(x => item(x, claseDe(x), iconoDe(x))).join('');
      const resto = lista.filter(x => !x.seccion);
      const agrupada = { titulo: titulo, detalle: secs.map(x => x.titulo).join(', ').replace(/, ([^,]*)$/, ' y $1') + '.' };
      const primeros = resto.filter(x => x.titulo === 'Carga automática');
      const otros = resto.filter(x => x.titulo !== 'Carga automática');
      return primeros.concat([agrupada]).concat(otros)
        .map(x => item(x, x.servicio ? 'plan-nuevo plan-servicio' : clase, x.servicio ? '＋' : icono)).join('');
    };
    return `
      <article class="plan-card${p.destacado ? ' plan-card-pop' : ''}">
        ${p.destacado ? '<span class="plan-badge">Más elegido</span>' : ''}
        <header class="plan-cab">
          <span class="landing-plan-t" style="color:${p.color}">${esc(p.nombre)}</span>
          <span class="plan-metal" style="background:${p.color}" aria-hidden="true"></span>
        </header>

        <p class="plan-suma">${p.anterior
          ? 'Todo lo de ' + esc(p.anterior) + ' <span class="plan-mas">+</span>'
          : 'El panel completo de la liga'}</p>

        <ul class="plan-lista">
          ${grupo(p.suma, 'plan-nuevo', '✓', 'Panel completo de la liga')}
        </ul>

        ${p.heredadas ? `<p class="plan-heredado">
          ✓ Las ${p.heredadas} secciones del plan ${esc(p.anterior)}, incluidas.</p>` : ''}

        ${p.falta.length ? `<ul class="plan-lista plan-lista-falta">
          ${p.falta.map(x => item(x, 'plan-bloq', '→')).join('')}
        </ul>` : ''}

        <p class="plan-mails">
          <span class="landing-plan-n" style="color:${p.color}">${p.mails}</span>
          <span class="landing-plan-d">${p.mails === 1 ? 'mail del cuerpo técnico' : 'mails del cuerpo técnico'}</span>
        </p>

        <button type="button" class="plan-cta${p.destacado ? ' plan-cta-pop' : ''}"
          onclick="SGADD_LANDING.consultar('${esc(p.nombre)}')">${esc(p.cta)}</button>
      </article>`;
  }

  /** La seccion entera de planes. */
  function seccionPlanes() {
    return `
      <div class="card rounded-xl p-5 sm:p-6 border border-hairline">
        <div class="flex items-baseline justify-between gap-3 flex-wrap mb-1">
          <h3 class="font-display uppercase tracking-wide text-sm text-ink">Planes</h3>
          <span class="text-[11px] text-muted">Cada mail es una persona del cuerpo técnico, con su propia clave.</span>
        </div>
        <p class="text-xs text-muted mb-4">Cada plan suma sobre el anterior: nadie pierde nada al subir.
          El valor depende del tipo de cliente y de la categoría: consultanos el tuyo.</p>
        <div class="plan-grid">${planes().map(tarjetaPlan).join('')}</div>
      </div>`;
  }

  /* =====================================================================
     A MEDIDA · lo que no entra en un plan

     DOS FAMILIAS, y la diferencia importa:

       · LO CONTINUO. Un plan a medida para el club —conectar más de un
         equipo o categoría— y el seguimiento de un equipo durante un
         torneo. La intención es elevar el desarrollo y la formación de los
         jugadores y seguir mejor al equipo con datos reales, en contexto.

       · LO PUNTUAL. Los servicios del documento de bienvenida, que se
         piden por separado y SIN el acceso continuo a la plataforma.

     NINGUNO LLEVA PRECIO: se cotiza según el alcance. Cada botón abre el
     mismo modal que la demo, con el tema ya dicho en el mensaje.
     ===================================================================== */
  const A_MEDIDA = [
    { titulo: 'Plan a medida para tu club',
      detalle: 'Conectá más de un equipo o categoría de tu club en el mismo panel, con el mismo criterio y '
        + 'el contexto de cada liga. Para elevar el desarrollo y la formación de tus jugadores y seguir '
        + 'mejor a cada equipo con datos reales.',
      cta: 'Consultar plan a medida', servicio: 'plan a medida para mi club (más de un equipo o categoría)' },
    { titulo: 'Seguimiento de tu equipo en un torneo',
      detalle: 'Acompañamos a tu equipo durante un torneo: cómo viene contra la liga, qué mejoró y qué '
        + 'ajustar, con los datos oficiales de la competencia.',
      cta: 'Consultar seguimiento', servicio: 'seguimiento de mi equipo en un torneo' },
  ];

  const SERVICIOS_PUNTUALES = [
    { titulo: 'Scouting pre-partido',
      detalle: 'El informe táctico de tu próximo rival: matriz comparativa, plan defensivo sugerido y claves, listo para compartir.' },
    { titulo: 'Informes post-partido',
      detalle: 'Qué funcionó, qué no y los números que explican el resultado, para corregir a tiempo.' },
    { titulo: 'Ficha de jugadores',
      detalle: 'Perfil individual de un jugador propio o rival: fortalezas, debilidades y tendencias.' },
    { titulo: 'Análisis de tu equipo',
      detalle: 'Un diagnóstico integral: rendimiento colectivo, rotaciones y puntos de mejora.' },
  ];

  function tarjetaMedida(x, clase) {
    return `<article class="medida-card ${clase || ''}">
      <h4 class="medida-t">${esc(x.titulo)}</h4>
      <p class="medida-d">${esc(x.detalle)}</p>
      <button type="button" class="medida-cta"
        onclick="SGADD_LANDING.consultar(null, '${esc(x.servicio || x.titulo).replace(/'/g, "\\'")}')">${esc(x.cta || 'Consultar')}</button>
    </article>`;
  }

  function seccionAMedida() {
    return `
      <div class="card rounded-xl p-5 sm:p-6 border border-hairline medida-seccion">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-1">A medida para tu club</h3>
        <p class="text-xs text-muted mb-4">Si lo tuyo no entra en un plan, lo armamos con vos.</p>
        <div class="medida-grid medida-grid-2">${A_MEDIDA.map(x => tarjetaMedida(x, 'medida-pop')).join('')}</div>

        <h4 class="medida-sub">Servicios puntuales, sin sumarte a la plataforma</h4>
        <div class="medida-grid">${SERVICIOS_PUNTUALES.map(x => tarjetaMedida(x)).join('')}</div>
        <p class="text-[11px] text-muted mt-3">Precio a cotizar según el alcance de cada pedido.
          ¿Necesitás algo distinto? <button type="button" class="medida-link"
          onclick="SGADD_LANDING.consultar(null, 'otra consulta')">Contanos qué buscás</button>
          y te armamos una propuesta.</p>
      </div>`;
  }

  /**
   * FASE 3 · el mismo modal de captura que usa la demo.
   *
   * SE REUSA Y NO SE ESCRIBE OTRO: son el mismo gesto —dejar tres datos y
   * seguir por WhatsApp— y dos formularios terminan pidiendo cosas
   * distintas. Sin el modulo cargado se cae al mail, que es degradar y no
   * romper: un boton que no hace nada es peor que uno que abre el correo.
   */
  function consultar(plan, servicio) {
    if (typeof SGADD_DEMO !== 'undefined' && SGADD_DEMO.abrirModal) {
      return SGADD_DEMO.abrirModal({ plan: plan, servicio: servicio });
    }
    if (typeof window !== 'undefined') {
      window.location.href = 'mailto:' + MAIL
        + '?subject=' + encodeURIComponent(servicio ? 'Consulta: ' + servicio : 'Consulta por el plan ' + plan);
    }
  }

  /* =====================================================================
     EL GOLPE DE VISTA · qué hacemos, qué dolor resolvemos, cómo

     Quien entra desde una historia de Instagram decide en segundos. Lo que
     tiene que entender, en este orden: QUÉ ES, QUÉ LE DUELE HOY y QUÉ
     SOLUCIÓN le damos. Y recién después, la demo bien a la vista.

     LOS DOLORES NO SE INVENTAN: salen de la investigación con entrenadores
     (planillas y fórmulas que no alcanzan, números sin contexto de liga, no
     saber qué decisión tomar, cuerpos técnicos que trabajan separados). Y
     cada solución dice algo que el panel hace de verdad, hoy.

     Las claves están en un arreglo y no en el markup para poder testear
     que cada dolor tenga su solución: un dolor sin respuesta es una
     promesa a medias.
     ===================================================================== */
  const DOLORES = [
    { hoy: 'Armás planillas y fórmulas a mano, y el tiempo no alcanza.',
      con: 'Las métricas oficiales de tu liga ya están cargadas y procesados. No cargás ni configurás nada.' },
    { hoy: 'Tenés los números de tu equipo, pero aislados: no sabés si son mucho o poco para tu liga.',
      con: 'Cada métrica contra la liga: percentil, tendencia y puesto, con colores que se leen de un vistazo.' },
    { hoy: 'Tenés los datos, pero no sabés qué decisión tomar con ellos.',
      con: 'Interpretaciones y plan de partido: el informe pre-partido te marca dónde atacar y qué marca asignar. Sale en PDF.' },
    { hoy: 'Cada uno del cuerpo técnico mira los números por su lado.',
      con: 'Todo el cuerpo técnico entra al mismo panel, cada uno con su mail y su clave, y se reparten el trabajo.' },
  ];

  /* LAS LIGAS QUE SEGUIMOS. El logo de cada competencia sale de su carpeta
     de escudos (`_liga` en `logos/<liga>/index.json`). SIN CONTENEDOR: van
     sueltos, en escala de grises, y recuperan el color al pasar el mouse
     (o enfocarlos con el teclado). En pantallas SIN hover (el teléfono) van
     a color directo, porque no hay forma de «pasar por encima».

     Cada logo lleva a la demo CON ESA ESTRUCTURA (`?liga=`): el entrenador
     ve la tabla con las zonas de su torneo, aunque los datos sean de
     referencia. */
  const LIGAS = [
    { id: 'lnb', nombre: 'Liga Nacional', sub: 'LNB', logo: 'logos/liga-nacional/liga.png' },
    { id: 'lab', nombre: 'Liga Argentina', sub: 'LAB', logo: 'logos/liga-argentina/liga.png' },
    { id: 'apb', nombre: 'Asociación Platense', sub: 'APdeB · La Plata', logo: 'logos/la-plata/apdb.png' },
    { id: 'abb', nombre: 'Bahía Blanca', sub: 'ABB', logo: 'logos/bahia-blanca/liga.png' },
  ];

  const rutaLiga = (id) => 'index.html?demo=1&liga=' + id;

  function filaDolor(d) {
    return `<div class="hero-par" role="listitem">
      <p class="hero-hoy"><span class="hero-tag">Hoy</span>${esc(d.hoy)}</p>
      <p class="hero-con"><span class="hero-tag hero-tag-ok">Con MotorStats</span>${esc(d.con)}</p>
    </div>`;
  }

  function tiraLigas() {
    return `<div class="liga-tira">
      <p class="liga-tira-t">Realizamos el seguimiento de las siguientes ligas</p>
      <ul class="liga-lista">
        ${LIGAS.map(l => `<li>
          <a href="${rutaLiga(l.id)}" class="liga-logo" title="${esc(l.nombre)} · entrá a ver el panel con su estructura de referencia">
            <img src="${l.logo}" alt="" loading="lazy" decoding="async">
            <span class="liga-nombre">${esc(l.nombre)}</span>
            <span class="liga-sub">${esc(l.sub)}</span>
          </a></li>`).join('')}
      </ul>
      <p class="liga-tira-n">Tocá un logo para recorrer el panel con la estructura de esa competencia y datos de referencia.
        <strong>¿No ves tu liga?</strong>
        <button type="button" class="medida-link" onclick="SGADD_LANDING.consultar(null, 'sumar mi liga o torneo')">Consultanos</button>
        y vemos cómo sumarla.</p>
    </div>`;
  }

  /* NO HACE FALTA SER EXPERTO. Es la objeción que más frena a un cuerpo
     técnico sin formación estadística, y la respuesta tiene tres partes:
     se empieza por lo que ya se mira, cada número se explica solo, y
     sirve igual en cualquier nivel de competencia. El texto sale de lo
     que el panel hace de verdad: percentil contra la liga, glosario en
     castellano y umbrales que se adaptan a la categoría. */
  function bloqueExperto() {
    return `<div class="exp-grid exp-uno">
      <div class="exp-card">
        <p class="exp-eyebrow">Pensado para cualquier nivel</p>
        <h3 class="exp-t">No hace falta ser experto en estadística.</h3>
        <p class="exp-d">Empezá por lo que ya mirás de tu equipo —puntos, rebotes, asistencias, la tabla— y
          sumá herramientas a medida que entendés cada métrica: cada número viene con su explicación en
          castellano y su comparación contra la liga.</p>
        <p class="exp-d">Sirve igual para formativas, torneos locales o ligas nacionales. El panel es intuitivo:
          el Glosario interactivo hace que todo el cuerpo técnico hable el mismo idioma, y vos ponés el ritmo.</p>
      </div>
    </div>`;
  }

  /* LOS BENEFICIOS, en palabras clave: lo que se gana y lo que se deja de
     hacer. Cada chip lleva su tilde: ningún mensaje va solo con color. */
  const BENEFICIOS = ['Ganá tiempo', 'Sin planillas', 'Sin fórmulas', 'Sin cargar nada', 'Sin ser un experto'];
  function beneficios() {
    return `<div class="ben-card" role="list" aria-label="Beneficios">
      ${BENEFICIOS.map(b => `<span class="ben-chip" role="listitem"><span class="ben-ok" aria-hidden="true">&#10003;</span>${esc(b)}</span>`).join('')}
    </div>`;
  }

  /* LA JUGADA: el proceso en cuatro palabras, dibujado como una jugada de
     pizarra. Cada paso es un jugador numerado (la camiseta) y las líneas
     punteadas son el movimiento: entrada, lectura, decisión y regreso. El
     último vuelve a la cancha con la pelota en la mano. */
  const JUGADA = [
    { n: 1, t: 'Entrá', d: 'Abrís el panel: tu liga ya está cargada.' },
    { n: 2, t: 'Analizá', d: 'Ves dónde están tu equipo y tus jugadores contra la competencia.' },
    { n: 3, t: 'Decidí qué mejorar', d: 'Detectás qué ajustar y armás tu plan de acción.' },
    { n: 4, t: 'Volvé a la cancha', d: 'Con el plan en la mano, a jugar.' },
  ];
  function jugada() {
    return `<ol class="jug" aria-label="Cómo funciona, en cuatro pasos">
      ${JUGADA.map((p, i) => `<li class="jug-p">
        <span class="jug-n" aria-hidden="true">${p.n}</span>
        <span class="jug-t">${esc(p.t)}</span>
        <span class="jug-d">${esc(p.d)}</span>
        ${i < JUGADA.length - 1 ? '<span class="jug-fl" aria-hidden="true"></span>' : ''}
      </li>`).join('')}
    </ol>`;
  }

  /** La bienvenida, que es lo que se ve al abrir la URL limpia. */
  function bienvenida() {
    return `
      <div class="card rounded-xl p-6 sm:p-8 border border-hairline hero-landing">
        <div class="hero-marca">
          <img src="${LOGO_GRANDE}" alt="" width="40" height="40" class="landing-logo hero-logo">
          <span>${esc(MARCA)} · Analítica de básquet para cuerpos técnicos</span>
        </div>
        <h2 class="hero-titulo">Tu scouting y el análisis de tu equipo, <span class="hero-resalte">ya armados</span>.</h2>
        <p class="hero-sub hero-quote">
          <strong>Si MotorStats<sup>AR</sup> fuera una persona…</strong><br>
          sería un integrante más de tu cuerpo técnico que trabaja 24/7, procesa los datos
          sin errores y te entrega el informe pre-partido listo antes de salir a la cancha.
        </p>
        ${beneficios()}
        ${jugada()}
        <div class="landing-hero-acciones hero-acciones">
          <a href="${RUTA_DEMO}" class="landing-hero-cta">Probá la demo ahora</a>
          <button type="button" class="landing-hero-sec"
            onclick="SGADD_LANDING.consultar('a medida')">Agendar demo con mis datos</button>
        </div>
        <p class="hero-micro">
          La demo abre el panel entero con datos anónimos de muestra y una guía
          opcional. No pide registro ni clave.
        </p>

        <div class="hero-pares" role="list" aria-label="Lo que resolvemos">
          ${DOLORES.map(filaDolor).join('')}
        </div>
      </div>

      ${bloqueExperto()}

      ${tiraLigas()}

      ${seccionPlanes()}

      ${seccionAMedida()}

      <div class="card rounded-xl p-5 sm:p-6 border border-hairline">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-3">¿Cómo se entra?</h3>

        <ol class="landing-pasos">
          <li>
            <span class="landing-paso-n">1</span>
            <span>Entrá a esta misma dirección y tocá
              <strong class="text-ink">Ingresar</strong>, abajo a la izquierda.</span>
          </li>
          <li>
            <span class="landing-paso-n">2</span>
            <span>Elegí <strong class="text-ink">&laquo;Tengo un código de invitación&raquo;</strong>
              y poné tu mail junto con el código que te pasamos.</span>
          </li>
          <li>
            <span class="landing-paso-n">3</span>
            <span>Definí tu propia clave. Nadie más la conoce, y la podés
              cambiar cuando quieras.</span>
          </li>
        </ol>

        <p class="text-xs text-muted leading-relaxed mt-4">
          El sistema une tu <strong class="text-ink">mail</strong> y el
          <strong class="text-ink">código</strong> con la cuenta de tu club, que ya
          quedó configurada de antemano: no hay que registrar nada ni elegir plan.
          El código sirve <strong class="text-ink">una sola vez</strong> y vence, así
          que si se te pasó la fecha pedinos otro.
        </p>


        ${contacto()}
      </div>`;
  }

  /** El contacto, que se repite en el pie. */
  function contacto() {
    return `<p class="text-xs text-muted mt-3">
      <a href="mailto:${MAIL}" class="text-accent hover:underline">${esc(MAIL)}</a>
      <span class="mx-2">·</span>
      <a href="${INSTAGRAM}" target="_blank" rel="noopener noreferrer"
         class="text-accent hover:underline">${esc(ARROBA)}</a>
    </p>`;
  }

  /**
   * Lo que se pinta en cada sección estando en la landing.
   *
   * En `principal` va la bienvenida entera; en las demás, la tarjeta de esa
   * sección sola y grande. Así el menú se recorre y cada click contesta
   * "¿qué hay acá?" sin prometer datos que sin club no existen.
   */
  /** «hogar-social» → «Hogar Social». Sin sesión no hay catálogo que
      diga el nombre real, y el slug es lo que el cliente ve en el link. */
  function nombreDeSlug(slug) {
    return String(slug || '').split('-').filter(Boolean)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  function enPuerta() {
    try { return typeof CLUB !== 'undefined' && !!CLUB.puertaDeIngreso && CLUB.puertaDeIngreso(); }
    catch (e) { return false; }
  }

  /**
   * LA PUERTA DE INGRESO: `?club=<id>` sin sesión (ver `sgadd-club.js`).
   *
   * Una sola tarjeta, la misma en todas las secciones: no hay datos que
   * mostrar y la vista previa del producto sería ruido para alguien que ya
   * es cliente y solo quiere entrar. El modal se abre solo al arrancar;
   * estos botones son para volver a abrirlo si lo cerró.
   */
  function puerta(slug) {
    const nombre = nombreDeSlug(slug);
    return `<div class="card rounded-xl p-6 sm:p-8 border border-hairline text-center max-w-xl mx-auto">
      <img src="${LOGO_GRANDE}" alt="" width="72" height="72" class="mx-auto mb-4 landing-logo">
      <h2 class="font-display uppercase tracking-wide text-lg text-ink mb-2">Ingresá a tu panel</h2>
      <p class="text-sm text-muted leading-relaxed">
        ${nombre ? 'Este es el panel de <b class="text-ink">' + esc(nombre) + '</b>. ' : ''}Entrá con el mail
        que dio de alta tu club y tu clave. Si es tu primer ingreso, usá el código de invitación que te
        llegó en el mail de bienvenida.
      </p>
      <div class="landing-hero-acciones">
        <button type="button" class="landing-hero-cta" onclick="SGADD_LOGIN.abrir('ingresar')">Ingresar</button>
        <button type="button" class="landing-hero-sec" onclick="SGADD_LOGIN.abrir('fijar')">Tengo un código de invitación</button>
      </div>
      <p class="text-[11px] text-muted mt-4">¿No tenés acceso? Escribinos a
        <a href="mailto:${MAIL}" class="text-accent hover:underline">${MAIL}</a>.</p>
    </div>`;
  }

  function vista(seccion) {
    if (enPuerta() && seccion !== 'glosario') {
      let slug = '';
      try { slug = (typeof CLUB !== 'undefined' && CLUB.estado && CLUB.estado.id) || ''; } catch (e) {}
      return puerta(slug);
    }
    /* EL GLOSARIO SE MUESTRA ENTERO, no como vista previa: es la unica
       seccion que no depende de los datos de ningun club —son
       definiciones— asi que en la landing funciona igual de bien que
       adentro. Darle una vista previa seria esconder algo que ya esta
       listo para usar. */
    if (seccion === 'glosario' && typeof SGADD_GLOSARIOUI !== 'undefined') {
      return SGADD_GLOSARIOUI.html();
    }
    if (seccion === 'principal' || !SECCIONES[seccion]) {
      return '<div class="space-y-5">' + bienvenida() + '</div>';
    }
    return `<div class="space-y-5">
      ${tarjetaSeccion(seccion)}
      <div class="card rounded-xl p-5 border border-hairline">
        <p class="text-xs text-muted">
          Esto es una vista previa: para ver los datos hace falta el acceso de un club.
        </p>
        ${contacto()}
      </div>
    </div>`;
  }

  /**
   * Pone la marca de MotorStats en el sidebar, en vez de la de un club.
   *
   * Se toca el mismo nodo que usa `sgadd-club.js` en vez de agregar uno
   * nuevo: dos marcas en el DOM peleando por el mismo lugar terminan
   * mostrándose las dos cuando alguna ruta se olvida de esconder la otra.
   */
  function aplicarMarca() {
    if (typeof document === 'undefined') return;
    const t = document.getElementById('clubNombre');
    if (t) t.textContent = MARCA;
    const b = document.getElementById('clubBajada');
    if (b) b.textContent = 'SCOUTING · BÁSQUET';
    /* EL QUE ESTA OCULTO ES EL ARO, no la imagen: el `<img>` vive adentro
       de un contenedor con `hidden` que solo se muestra cuando el club
       tiene escudo resuelto. Sacarle la clase a la imagen no alcanzaba —
       quedaba visible dentro de un padre en `display: none`. */
    const img = document.getElementById('clubEscudo');
    if (img) {
      img.src = LOGO;
      img.alt = MARCA;
      img.classList.remove('hidden');
    }
    const aroEl = document.getElementById('clubEscudoAro');
    if (aroEl) {
      aroEl.classList.remove('hidden');
      /* `aro-motorstats` le pone fondo blanco y mas padding: la grafica es
         un circulo que llega al borde del lienzo, asi que dentro de un aro
         redondo del mismo tamaño se le recortaban las puntas. El fondo
         blanco ademas lo despega del sidebar oscuro, donde el azul marino
         de los bordes se perdia. */
      aroEl.classList.add('aro-motorstats');
    }
    /* Y EL TÍTULO DE LA PESTAÑA. `sgadd-club.js` lo pone con el nombre del
       club por defecto, así que sin esto una pestaña abierta en la landing
       dice el nombre de un cliente — y eso es lo que se ve en el historial
       y al compartir el link. */
    try { document.title = MARCA + ' · Análisis de básquet'; } catch (e) {}

  }

  return {
    activa, vista, puerta, nombreDeSlug, bienvenida, tarjetaSeccion, contacto, aplicarMarca,
    planes, tarjetaPlan, seccionPlanes, consultar, alcanza, alcanzaBloque, partidosPorCiclo,
    DOLORES, LIGAS, tiraLigas, bloqueExperto, beneficios, jugada, BENEFICIOS, JUGADA, seccionAMedida, tarjetaMedida, A_MEDIDA, SERVICIOS_PUNTUALES, EXTRAS_BASE, rutaLiga,
    RUTA_DEMO, ANTERIOR, BLOQUES, idsDeBloques,
    SECCIONES, ORDEN, PLANES_MAILS, MARCA, MAIL, INSTAGRAM, ARROBA, LOGO, LOGO_GRANDE,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_LANDING;
