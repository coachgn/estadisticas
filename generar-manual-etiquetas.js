/* =====================================================================
   SGADD · Generador del MANUAL DE ETIQUETADO para cuerpos técnicos

       node generar-manual-etiquetas.js
       → escribe MANUAL_ETIQUETADO_SGADD.html

   El HTML se abre en cualquier navegador y se imprime a PDF con Ctrl+P.
   Se eligió esa vía y no una librería de PDF por la misma razón que el
   resto del proyecto: sin dependencias nuevas, y el navegador ya sabe
   paginar, numerar y respetar saltos.

   POR QUÉ SE GENERA Y NO SE ESCRIBE A MANO
   ----------------------------------------
   Todas las tablas se leen de los módulos reales (`PERFILES_TECNICOS`,
   `PERFILES_MARCA`, `CATALOGO_DEFENSOR`, …). Un manual escrito a mano
   queda desactualizado en la primera recalibración de umbrales y termina
   contradiciendo al panel — que es exactamente el problema que este
   proyecto viene cerrando en los motores. Acá el documento no puede
   mentir: si cambia el umbral, cambia el manual.

   Los umbrales SÍ están escritos a mano en la columna "corte", porque
   viven dentro de funciones `calza`/`test` y no son introspectables. Hay
   un test que verifica que los valores citados coincidan con las
   constantes reales.
   ===================================================================== */

const fs = require('fs');
const path = require('path');

global.SGADD = require('./js/sgadd-core.js');
const J = require('./js/sgadd-jugadores.js');
const S = require('./js/sgadd-scouting.js');

const SALIDA = path.join(__dirname, 'MANUAL_ETIQUETADO_SGADD.html');

/* --------------------------------------------------------------------
   Umbrales citados en el manual. Se declaran acá porque viven adentro de
   closures y no se pueden leer del objeto; el test los amarra contra las
   constantes reales para que no puedan divergir.
   -------------------------------------------------------------------- */
const U = J.JUGADORES_UMBRALES;
const SU = S.UMBRALES;

const CORTES_ARQUETIPO = {
  terminador: 'PLAYS > promedio de liga · eFG% > 1,15× promedio · PPP > 1,05',
  generador: 'AST-PP > 1,40',
  puntal: 'RO+RD > 1,20× el promedio de la liga',
  amenaza: 'T3I > 3,0 y T3% > 34%',
  especialistaDef: 'PR > 1,30× el promedio de la liga',
  buscadorContacto: 'RTL% ≥ ' + U.rtlContacto + ' y FR ≥ ' + U.frContacto +
    ' y PT1% ≥ ' + U.usoLibreContacto + ' y T1% ≥ ' + U.t1Contacto,
};

const CORTES_ROL = {
  'generador-primario': 'AST-PP ≥ ' + U.astPPGenerador + ' · AST ≥ ' + U.astVolumenGenerador + ' · MIN ≥ ' + U.minutosClave,
  'finalizador-corto': 'interior · PPT2 ≥ ' + U.pptDobleAlto,
  'ancla-defensiva': 'interior · RD rel ≥ ' + U.reboteInterior + ' y RD rel > RO rel',
  'rim-runner': 'interior · RO rel ≥ ' + U.reboteOfensivoAlto,
  'poste-bajo': 'interior sin dimensión dominante (fallback interior)',
  spacing: 'perimetral · PT3% ≥ ' + U.usoTripleAlto,
  slasher: 'perimetral · PPT2 ≥ 1,00',
  'manejador-secundario': 'AST-PP ≥ 1,00 · MIN ≥ ' + U.minutosClave,
  'perimetral-media': 'perimetral, sin volumen de triple',
  complementario: 'fallback: ninguna función domina',
};

const CORTES_MARCA = {
  'tirador-elite': 'PT3% ≥ ' + SU.usoTripleAlto + ' y PPT3 ≥ ' + SU.pptTripleElite,
  'volumen-sin-eficiencia': 'concentración ≥ ' + SU.concentracionAlta + ' · sin tiro rentable · eFG% por debajo de la liga',
  'tirador-eficiente-bajo-volumen': 'T3I ≥ 1,0 y tiro externo rentable',
  'interior-dominante': 'interior · PPT2 ≥ ' + SU.pptDobleAlto,
  slasher: 'perimetral · PPT2 ≥ ' + SU.pptDobleAlto,
  'generador-riesgoso': 'pérdidas ≥ ' + SU.perdidasAltas + '× la liga · MIN ≥ ' + SU.minutosClave,
  'tirador-sistematico-frio': 'T3I ≥ ' + SU.volumenTripleSistematico + ' y tiro externo frío',
  'castigable-en-la-linea': 'T1% < ' + SU.t1Regalable + ' y PT2% ≥ ' + SU.usoDobleInterno,
  'tirador-ineficiente': 'PT3% ≥ ' + SU.usoTripleAlto + ' · PPT3 ≤ ' + SU.pptTriplePobre + ' · no rentable · no es la vía principal',
  rebotador: 'RO rel ≥ ' + SU.reboteOfensivoAlto,
  contencion: 'fallback: ninguna amenaza domina',
};

const esc = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const num = (v) => String(v).replace('.', ',');

function tabla(cabeceras, filas, clase) {
  return `<table class="${clase || ''}">
    <thead><tr>${cabeceras.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map(f => `<tr>${f.map((c, i) =>
      `<td class="${i === 0 ? 'k' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

/* ===================== SECCIONES ===================== */

function seccionMinutos() {
  const filas = J.ROLES_MINUTOS.map((r, i) => {
    const sig = J.ROLES_MINUTOS[i - 1];
    const rango = r.min === -Infinity
      ? 'menos de ' + num(J.ROLES_MINUTOS[i - 1].min)
      : (sig ? num(r.min) + ' a ' + num(sig.min - 0.1) : num(r.min) + ' o más');
    return [`<b>${esc(r.label)}</b>`, `<span class="corte">${esc(rango)}</span>`, esc(r.rol)];
  });
  return `
    <h3>1.1 · Bandas de minutos <span class="sub">¿cuánto juega?</span></h3>
    <p>Cascada excluyente sobre el promedio de <b>MIN</b>. Es la única familia con
    umbrales <b>absolutos</b>: un promedio de 27 minutos es carga alta en cualquier
    categoría. No usa percentiles a pedido del club.</p>
    ${tabla(['Etiqueta', 'Corte de MIN', 'Lectura'], filas)}
    <p class="nota">Dentro de <i>Pocos Minutos</i> hay un matiz extra: por debajo de
    10 minutos la muestra es tan chica que ni esa banda alcanza a describirlo.</p>`;
}

function seccionJerarquia() {
  const cortes = {
    franquicia: 'PLAYS > 1,20× promedio de liga y MIN > 28',
    referente: 'PLAYS > promedio de liga',
    quinteto: 'MIN ≥ 23',
    especialista: 'fallback: siempre calza',
  };
  const filas = J.JERARQUIA.map((n, i) => [
    `<b>${esc(n.emoji + ' ' + n.label)}</b>`,
    `<span class="corte">${esc(cortes[n.id] || '')}</span>`,
    esc(n.descripcion),
  ]);
  return `
    <h3>1.2 · Jerarquía en el plantel <span class="sub">¿cuánto pesa?</span></h3>
    <p><b>Cascada excluyente</b>: gana el primero que calza, de más a menos exigente.</p>
    ${tabla(['Nivel', 'Corte', 'Qué describe'], filas)}
    <p class="aviso"><b>Nunca se dice "titular".</b> La planilla no trae el quinteto
    inicial y 23 minutos los puede hacer un sexto hombre. La etiqueta mide carga de
    minutos, que es lo que el dato sostiene.</p>`;
}

function seccionArquetipos() {
  const filas = J.PERFILES_TECNICOS.map(p => [
    `<b>${esc(p.emoji + ' ' + p.label)}</b>`,
    `<span class="corte">${esc(CORTES_ARQUETIPO[p.id] || '')}</span>`,
    esc(p.detalle),
  ]);
  return `
    <h3>1.3 · Arquetipos técnicos <span class="sub">¿qué sabe hacer?</span></h3>
    <p><b>NO son excluyentes</b>: un jugador puede calzar en varios, en uno o en
    ninguno. Se miden contra el promedio de los jugadores <b>calificados</b> de la
    liga activa, así que el mismo código sirve para cualquier categoría.</p>
    ${tabla(['Arquetipo', 'Corte', 'Qué significa en cancha'], filas)}`;
}

function seccionRoles() {
  const filas = J.JUGADORES_ROLES_FUNCIONALES.map((r, i) => [
    `<b>${i + 1}. ${esc(r.label)}</b>`,
    `<span class="corte">${esc(CORTES_ROL[r.id] || '')}</span>`,
  ]);
  return `
    <h3>1.4 · Rol funcional <span class="sub">¿qué función cumple?</span></h3>
    <p><b>Cascada excluyente, sin base / alero / pivote.</b> El orden importa: gana el
    primero que calza. La planilla no trae talla ni posición, así que el rol sale de
    lo que el jugador hace, no de dónde se para.</p>
    ${tabla(['Rol (en orden de evaluación)', 'Corte'], filas)}
    <div class="caja">
      <b>Cómo se decide si es interior o perimetral.</b> Sobre <b>intentos</b>, no sobre
      aciertos: de dónde tira no depende de si le entra.
      <div class="mono">mezcla = T3I / (T3I + T2I)
menor a ${num(U.mezclaTripleInterior)} → interior
${num(U.mezclaTripleInterior)} a ${num(U.mezclaTripleaPerimetral)} → desempate por rebote total (≥ ${num(U.reboteDesempate)}× la mediana → interior)
${num(U.mezclaTripleaPerimetral)} o más → perimetral
sin tiros de campo → sin origen (no se infiere)</div>
    </div>`;
}

function seccionBandasZ() {
  const filas = S.BANDAS.map(b => [
    `<b>${esc(b.label)}</b>`,
    `<span class="corte">z ${b.z === -Infinity ? '&lt; −1,2' : '≥ ' + num(b.z >= 0 ? '+' + b.z : b.z)}</span>`,
  ]);
  return `
    <h3>2.1 · Bandas contra la liga <span class="sub">el contexto de todo lo demás</span></h3>
    <p>Ninguna decisión táctica individual sale solo de un umbral fijo. Primero se mide
    cuánto se desvía el jugador de la media de <b>esta</b> liga. Un PPT3 de 1,05 es de
    élite en una categoría y del montón en otra.</p>
    ${tabla(['Banda', 'Desvíos estándar'], filas)}
    <p class="nota">En métricas invertidas (pérdidas) el signo se da vuelta, para que
    <i>"muy por encima"</i> signifique siempre lo mismo: mejor que la liga.</p>`;
}

function seccionMarcas() {
  const filas = S.PERFILES_MARCA.map((m, i) => [
    `<b>${i + 1}. ${esc(m.etiqueta)}</b>`,
    `<span class="corte">${esc(CORTES_MARCA[m.id] || '')}</span>`,
    (m.defensores || []).map(c => esc(S.PERFILES_DEFENSOR[c.id])).join('<br>'),
  ]);
  return `
    <h3>2.2 · Marca asignada <span class="sub">cascada de 11, de la amenaza más cara a la más barata</span></h3>
    <p>Un jugador puede disparar varias reglas de análisis, pero <b>recibe una sola
    marca</b>: la de la amenaza que más caro sale conceder. El orden ES la regla.</p>
    ${tabla(['Marca (en orden)', 'Corte', 'Perfiles de defensor candidatos'], filas, 'ancha')}
    <div class="caja">
      <b>Las tres reglas de tiro externo, y por qué están en ese orden.</b>
      <ol>
        <li><b>Tirador eficiente de bajo volumen</b> va arriba de todo lo interno: es el
        especialista que anota poco <i>por volumen, no por eficiencia</i>. Con el criterio
        que mira puntos, quedaba en el montón y se le soltaba. Restricción:
        <b>prohibido flotar</b>.</li>
        <li><b>Tirador sistemático frío</b>: mucho volumen, poca renta. Se le contesta
        igual, pero sin desarmar la estructura por él.</li>
        <li><b>Tirador de volumen sin renta</b> es la única que autoriza flotar, y pide
        <b>tres condiciones acumuladas</b>. Si falla cualquiera, ya cayó en una de las
        dos anteriores.</li>
      </ol>
      <b>Mandar a la línea no es la respuesta para todo.</b> Es un solo perfil y con
      umbral duro (T1% &lt; ${num(SU.t1Regalable)} <i>y</i> volumen interno): a alguien que
      convierte 60% de libres le estás regalando 1,20 puntos por posesión.
    </div>`;
}

function seccionDefensores() {
  const filas = S.CATALOGO_DEFENSOR.map(c => [
    `<b>${esc(c.emoji + ' ' + c.familia)}</b>`,
    c.perfiles.map(p => '<b>' + esc(p.label.split(' / ')[0]) + '</b> · ' + esc(p.detalle)).join('<br>'),
  ]);
  return `
    <h3>2.3 · Catálogo de perfiles de defensor <span class="sub">${S.CATALOGO_DEFENSOR.length} familias, ${S.CATALOGO_DEFENSOR.reduce((a, c) => a + c.perfiles.length, 0)} perfiles</span></h3>
    <p>La columna <i>Defensor nuestro</i> sugiere un <b>perfil táctico, no un nombre
    propio</b>: quién lo cubre depende de quién esté en cancha y de las faltas de cada
    uno. El campo es editable para poner el nombre al armar la rotación.</p>
    <p class="nota">El motor puede sugerir <b>${S.defensoresAlcanzables().length} de los ${S.CATALOGO_DEFENSOR.reduce((a, c) => a + c.perfiles.length, 0)}</b>:
    cada marca declara varios candidatos y desempata con métricas secundarias
    (recuperos, rebote ofensivo, asistencias). El resto está para que el cuerpo técnico
    lo elija a mano.</p>
    ${tabla(['Familia', 'Perfiles'], filas, 'ancha')}`;
}

function seccionPlan() {
  const grupos = [
    ['🎯 Focos · se dobla', 'marca de tirador de élite, referencia interna o slasher; o concentra ≥ ' + num(SU.concentracionAlta) + ' de los plays; o es franquicia', 'su celda dice desde dónde sale la ayuda'],
    ['🚫 Intocables · no se sueltan', 'tiene tiro externo rentable', 'su defensor no participa de las ayudas'],
    ['↩ Fuentes de ayuda', 'tiro frío o sin renta', 'es el lado desde donde se dobla'],
    ['🏰 Box-out asignado', 'RO rel ≥ ' + num(SU.reboteOfensivoAlto), 'su defensor no rota: bloquea'],
  ];
  const filasEsc = S.ESCENARIOS.map(e => [`<b>${esc(e.label)}</b>`, esc({
    'franquicia-solitaria': 'un solo foco y hay fuente de ayuda',
    'spacing-alto': '3 o más tiradores rentables',
    'interior-y-frios': 'foco interior y al menos 2 fuentes',
    'sin-lado-barato': 'hay foco y no hay ninguna fuente',
    distribuido: 'fallback: ningún patrón domina',
  }[e.id] || '')]);
  return `
    <h3>2.4 · Plan defensivo colectivo <span class="sub">las marcas se conectan entre sí</span></h3>
    <p>Una defensa no es la suma de once marcas individuales: si a cuatro rivales les
    ponés <i>"doblar"</i>, te quedaste sin nadie para doblar. El plan clasifica al
    plantel rival y después cada celda se escribe <b>sabiendo qué hacen las otras diez</b>.</p>
    ${tabla(['Grupo', 'Quién entra', 'Qué dice su celda'], grupos.map(g => [`<b>${esc(g[0])}</b>`, `<span class="corte">${esc(g[1])}</span>`, esc(g[2])]), 'ancha')}
    <p class="nota"><b>El orden de los vetos es la lógica del plan.</b> Un intocable
    nunca puede ser fuente de ayuda (soltarlo es el error más caro). Un foco tampoco
    (el que exige doblaje no puede ayudar en otro lado). Un reboteador tampoco: no se
    le puede pedir al mismo defensor que sea el primero en rotar y que no abandone el
    box-out.</p>
    <h4>Escenarios que reconoce</h4>
    ${tabla(['Escenario', 'Se activa cuando'], filasEsc)}
    <p class="aviso"><b>Regla de coherencia:</b> si hay un foco, tiene que haber una
    fuente de ayuda designada. Si el rival no tiene ningún lado barato, el plan lo dice
    en vez de inventar una ayuda que no existe. La única excepción es
    <i>spacing alto</i>: ahí el plan renuncia a ayudar a propósito y pasa a 1×1.</p>`;
}

function seccionClaves() {
  const cortes = {
    'ejes-eficiencia': 'concentra ≥ ' + num(SU.concentracionAlta) + ' de los plays del equipo',
    'clausura-tiradores': 'PT3% ≥ ' + num(SU.usoTripleAlto) + ' y PPT3 ≥ ' + num(SU.pptTripleElite),
    'invitacion-triple': 'PT3% ≥ ' + num(SU.usoTripleAlto) + ' y PPT3 ≤ ' + num(SU.pptTriplePobre),
    'disciplina-bonus': 'PT1% ≥ ' + num(SU.usoLibreAlto) + ' y T1% ≥ ' + num(SU.t1Confiable),
    'castigo-linea': 'PT1% ≥ ' + num(SU.usoLibreAlto) + ' y T1% ≤ ' + num(SU.t1Pobre),
    'presion-conduccion': 'pérdidas ≥ ' + num(SU.perdidasAltas) + '× la liga',
    cristal: 'RO rel ≥ ' + num(SU.reboteOfensivoAlto),
    pintura: 'PPT2 ≥ ' + num(SU.pptDobleAlto) + ' y PT2% ≥ 0,40',
    'lineas-de-pase': 'recuperos por encima de la liga',
    'concesion-perimetral': 'tira entre 1 y ' + num(SU.volumenTripleSistematico) + ' triples sin renta',
  };
  const filas = S.REGLAS_CLAVE.map(r => [
    `<b>${esc(r.icono + ' ' + r.titulo)}</b>`,
    `<span class="corte">${esc(cortes[r.id] || '')}</span>`,
  ]);
  return `
    <h3>2.5 · Claves estratégicas <span class="sub">se activan solas</span></h3>
    <p>No hay lista fija: cada regla mira el plantel del rival y aparece únicamente si
    los datos la justifican. Un informe contra un equipo de tiradores y otro contra uno
    de pintura salen distintos sin tocar nada.</p>
    ${tabla(['Clave', 'Se activa cuando'], filas)}
    <p class="nota"><b>Pares deliberadamente opuestos</b>, que nunca pueden apuntar al
    mismo jugador: <i>clausura de tiradores</i> ↔ <i>invitación al triple</i>, y
    <i>disciplina de bonus</i> ↔ <i>falta táctica rentable</i>.</p>`;
}

function seccionReferencias() {
  const filas = [
    ['Absoluta', 'Un umbral fijo, igual en cualquier liga', 'Bandas de minutos, T1% regalable, PPT3 de élite'],
    ['Promedio de la liga', 'Media de los jugadores calificados', 'Arquetipos técnicos, jerarquía'],
    ['Mediana de calificados', 'El jugador típico <b>de los que juegan</b>', 'Relativos de rebote'],
    ['Banda z', 'Cuántos desvíos se despega de su liga', 'Decisiones de marca, fortalezas y fugas'],
    ['Dentro del plantel rival', 'De estos ocho, ¿a quién marco?', 'Semáforo del cuadro de jugadores clave'],
  ];
  return `
    <h3>3.1 · Contra qué se compara cada cosa</h3>
    <p>El error más fácil al leer el informe es suponer que todas las etiquetas se
    calculan contra lo mismo. <b>No es así, y es a propósito.</b></p>
    ${tabla(['Referencia', 'Qué contesta', 'Dónde se usa'], filas.map(f => [`<b>${f[0]}</b>`, f[1], f[2]]), 'ancha')}
    <div class="caja">
      <b>Cuándo un umbral absoluto es legítimo.</b> Se contrastó el motor contra dos
      ligas de nivel distinto (Primera de La Plata y Conferencia Norte de Liga
      Argentina). Un umbral absoluto vale cuando describe <b>economía del básquet</b>:
      1,20 puntos por triple intentado es caro en cualquier lado, y 40% de libres es
      malo en cualquier lado — esos caen en el mismo percentil ±1 en las dos ligas.
      Cuando en cambio describe <i>"por debajo del promedio"</i>, la brecha entre
      categorías llega a 26 puntos percentiles y la etiqueta pasa a significar cosas
      distintas. Por eso las fortalezas y las fugas se leen contra la banda z.
    </div>`;
}

function seccionLimites() {
  return `
    <h3>3.2 · Lo que el sistema NO sabe</h3>
    <ul>
      <li><b>Quién arranca el partido.</b> La planilla no trae el quinteto inicial. Por
      eso ninguna etiqueta dice "titular" ni "suplente": la jerarquización sale de los
      minutos y del volumen de decisiones.</li>
      <li><b>La talla y la posición.</b> No hay columna de altura, así que el rol sale de
      lo que el jugador hace en cancha.</li>
      <li><b>El calendario.</b> No hay hoja de fixture: la fecha del partido, el torneo y
      el próximo rival se cargan a mano. Un scouting con una fecha inventada es peor que
      uno sin fecha.</li>
      <li><b>Los cuartos.</b> No hay parciales cargados, así que no se puede leer en qué
      tramo del partido pasa cada cosa.</li>
      <li><b>El estado del jugador.</b> Todavía no se distingue a un lesionado de un
      jugador dado de baja o de uno que pasó a otro club. Está en diseño.</li>
    </ul>
    <p class="aviso">Todo lo que el sistema no sabe se deja explícitamente vacío. La
    regla del proyecto es que <b>un dato inventado es peor que un dato ausente</b>: un
    partido sin cruzar se muestra como tal, y un jugador sin muestra suficiente pierde
    el percentil en vez de recibir uno falso.</p>`;
}

/* ===================== DOCUMENTO ===================== */

function documento() {
  const hoy = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const fecha = p2(hoy.getDate()) + '/' + p2(hoy.getMonth() + 1) + '/' + hoy.getFullYear();

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>SGADD · Manual de etiquetado de jugadores</title>
<style>
  @page { size: A4 portrait; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #1a1a1a; background: #fff; margin: 0 auto; max-width: 190mm;
    font-size: 10.5pt; line-height: 1.45;
  }
  header { border-bottom: 3px solid #E87A2A; padding-bottom: 10px; margin-bottom: 18px; }
  h1 { font-size: 21pt; margin: 0 0 2px; letter-spacing: -.3px; }
  .bajada { color: #555; font-size: 10pt; margin: 0; }
  .meta { color: #888; font-size: 8.5pt; margin-top: 6px; }
  h2 {
    font-size: 14pt; margin: 26px 0 8px; padding: 6px 10px;
    background: #1a1a1a; color: #fff; border-radius: 3px;
    page-break-after: avoid;
  }
  h3 {
    font-size: 11.5pt; margin: 18px 0 6px; color: #B85C10;
    border-bottom: 1px solid #e5e5e5; padding-bottom: 3px;
    page-break-after: avoid;
  }
  h4 { font-size: 10.5pt; margin: 14px 0 5px; color: #333; page-break-after: avoid; }
  .sub { font-weight: 400; color: #888; font-size: 9pt; font-style: italic; }
  p { margin: 6px 0; }
  ul, ol { margin: 6px 0; padding-left: 20px; }
  li { margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9pt; page-break-inside: avoid; }
  th {
    background: #f0f0f0; text-align: left; padding: 5px 7px;
    border-bottom: 2px solid #ccc; font-size: 8.5pt;
    text-transform: uppercase; letter-spacing: .4px; color: #444;
  }
  td { padding: 5px 7px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.k { width: 26%; }
  table.ancha td.k { width: 22%; }
  tr:nth-child(even) td { background: #fafafa; }
  .corte {
    font-family: "Consolas", "DM Mono", monospace; font-size: 8.5pt;
    background: #FFF4E8; color: #8A4200; padding: 1px 5px;
    border-radius: 3px; border: 1px solid #F0D5B8; display: inline-block;
  }
  .caja {
    background: #FAFAFA; border-left: 3px solid #E87A2A;
    padding: 9px 12px; margin: 10px 0; font-size: 9.5pt;
    page-break-inside: avoid;
  }
  .nota { font-size: 9pt; color: #666; font-style: italic; }
  .aviso {
    background: #FFF9E6; border-left: 3px solid #E0A800;
    padding: 8px 12px; margin: 10px 0; font-size: 9.5pt;
    page-break-inside: avoid;
  }
  .mono {
    font-family: "Consolas", monospace; font-size: 8.5pt; white-space: pre;
    background: #fff; border: 1px solid #e5e5e5; padding: 7px 9px;
    margin-top: 6px; border-radius: 3px; overflow-x: auto;
  }
  .indice { columns: 2; column-gap: 24px; font-size: 9.5pt; }
  .indice a { color: #B85C10; text-decoration: none; }
  footer {
    margin-top: 26px; padding-top: 10px; border-top: 1px solid #ddd;
    font-size: 8.5pt; color: #888;
  }
  .salto { page-break-before: always; }
  @media print { body { max-width: none; } a { color: inherit; text-decoration: none; } }
</style>
</head>
<body>

<header>
  <h1>Manual de etiquetado de jugadores</h1>
  <p class="bajada">Cómo el panel clasifica a un jugador, con qué métrica y con qué corte exacto.</p>
  <p class="meta">SGADD · Sistema de Gestión y Análisis de Datos Deportivos ·
     Generado el ${fecha} · ${J.ROLES_MINUTOS.length + J.JERARQUIA.length + J.PERFILES_TECNICOS.length + J.JUGADORES_ROLES_FUNCIONALES.length + S.PERFILES_MARCA.length} etiquetas documentadas</p>
</header>

<p>Este documento existe para que <b>dos entrenadores que miran el mismo informe lean lo
mismo</b>. Cada etiqueta que el panel le pone a un jugador sale de una regla explícita
con un número detrás, y acá están todas.</p>

<div class="caja">
  <b>Cómo leerlo.</b> Los cortes van en <span class="corte">recuadro naranja</span>.
  Donde dice <i>"× la liga"</i> el umbral es <b>relativo</b> y se recalcula con cada
  categoría; donde hay un número pelado es <b>absoluto</b> y vale igual en cualquier
  torneo. Esa distinción es la que permite usar el mismo panel en una liga local y en
  una nacional.
</div>

<div class="indice">
  <b>Contenido</b><br>
  1. Clasificación ofensiva<br>
  &nbsp;&nbsp;1.1 Bandas de minutos<br>
  &nbsp;&nbsp;1.2 Jerarquía en el plantel<br>
  &nbsp;&nbsp;1.3 Arquetipos técnicos<br>
  &nbsp;&nbsp;1.4 Rol funcional<br>
  2. Clasificación defensiva<br>
  &nbsp;&nbsp;2.1 Bandas contra la liga<br>
  &nbsp;&nbsp;2.2 Marca asignada<br>
  &nbsp;&nbsp;2.3 Catálogo de defensores<br>
  &nbsp;&nbsp;2.4 Plan defensivo colectivo<br>
  &nbsp;&nbsp;2.5 Claves estratégicas<br>
  3. Cómo leer los números<br>
  &nbsp;&nbsp;3.1 Contra qué se compara cada cosa<br>
  &nbsp;&nbsp;3.2 Lo que el sistema no sabe<br>
</div>

<h2>1 · Clasificación ofensiva</h2>
<p>Cuatro familias de etiquetas que <b>no compiten entre sí</b>: contestan preguntas
distintas y un jugador recibe una de cada una.</p>
${seccionMinutos()}
${seccionJerarquia()}
${seccionArquetipos()}
${seccionRoles()}

<h2 class="salto">2 · Clasificación defensiva</h2>
${seccionBandasZ()}
${seccionMarcas()}
${seccionDefensores()}
${seccionPlan()}
${seccionClaves()}

<h2 class="salto">3 · Cómo leer los números</h2>
${seccionReferencias()}
${seccionLimites()}

<footer>
  Generado automáticamente desde el código del panel
  (<span class="mono" style="display:inline;padding:1px 4px">node generar-manual-etiquetas.js</span>).
  Si un umbral cambia en el motor, cambia acá: el manual no puede contradecir al sistema.
  <br>SGADD · Club Reconquista La Plata.
</footer>

</body>
</html>`;
}

fs.writeFileSync(SALIDA, documento(), 'utf8');
console.log('✓ Manual generado: ' + path.basename(SALIDA));
console.log('  ' + J.ROLES_MINUTOS.length + ' bandas de minutos · ' + J.JERARQUIA.length + ' niveles de jerarquía · ' +
  J.PERFILES_TECNICOS.length + ' arquetipos · ' + J.JUGADORES_ROLES_FUNCIONALES.length + ' roles funcionales');
console.log('  ' + S.PERFILES_MARCA.length + ' marcas · ' + S.CATALOGO_DEFENSOR.reduce((a, c) => a + c.perfiles.length, 0) +
  ' perfiles de defensor (' + S.defensoresAlcanzables().length + ' asignables) · ' +
  S.REGLAS_CLAVE.length + ' claves · ' + S.ESCENARIOS.length + ' escenarios colectivos');
console.log('\n  Abrilo en el navegador y hacé Ctrl+P → Guardar como PDF.');
