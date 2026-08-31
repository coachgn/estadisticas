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
  const PLANES_MAILS = [
    { nombre: 'Bronce', mails: 2, color: '#CD7F32' },
    { nombre: 'Plata', mails: 3, color: '#C0C0C0' },
    { nombre: 'Oro', mails: 4, color: '#FFD700' },
  ];

  /** El orden en que se listan. Es el mismo del menú. */
  const ORDEN = ['principal', 'equipos', 'jugadores', 'clasificacion', 'scouting', 'glosario'];

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

  /** La bienvenida, que es lo que se ve al abrir la URL limpia. */
  function bienvenida() {
    return `
      <div class="card rounded-xl p-6 sm:p-8 border border-hairline text-center">
        <img src="${LOGO_GRANDE}" alt="" width="72" height="72"
             class="mx-auto mb-4 landing-logo">
        <h2 class="font-display uppercase tracking-wide text-lg text-ink mb-2">${esc(MARCA)}</h2>
        <p class="text-sm text-muted max-w-xl mx-auto leading-relaxed">
          Análisis de datos de básquet para cuerpos técnicos. Cada club entra con su
          propio acceso y ve su categoría: equipos, jugadores, posiciones y el informe
          pre-partido, calculados sobre los box scores oficiales.
        </p>
        <p class="text-xs text-muted mt-4">
          Recorré el menú de la izquierda para ver qué hay en cada sección.
        </p>
      </div>

      <div class="grid lg:grid-cols-2 gap-4">
        ${ORDEN.map(tarjetaSeccion).join('')}
      </div>

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

        <div class="mt-5">
          <p class="text-[10px] uppercase tracking-wider text-muted font-display mb-2">
            Cuántas personas del club pueden entrar</p>
          <div class="grid sm:grid-cols-3 gap-2">
            ${PLANES_MAILS.map(p => `<div class="landing-plan"><span class="landing-plan-t">${esc(p.nombre)}</span><span class="landing-plan-n" style="color:${p.color}">${p.mails}</span><span class="landing-plan-d">${p.mails === 1 ? "mail" : "mails"}</span></div>`).join('')}
          </div>
          <p class="text-[11px] text-muted mt-2">
            Cada mail es una persona del cuerpo técnico con su propia clave.
          </p>
        </div>

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
  function vista(seccion) {
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
    activa, vista, bienvenida, tarjetaSeccion, contacto, aplicarMarca,
    SECCIONES, ORDEN, PLANES_MAILS, MARCA, MAIL, INSTAGRAM, ARROBA, LOGO, LOGO_GRANDE,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_LANDING;
