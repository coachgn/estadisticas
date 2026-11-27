# Plan · el sistema operativo con IA de MotorStats

Validado con decisiones (2026-11-27). Implementado: el bloque 0 y el 1. El resto espera el OK final.
Fuentes: la transcripción del video «Cómo crear un Sistema Operativo con IA» (Jordi GPT) y la guía
del plugin small-business. La guía no trae estructura de agentes ni hooks: solo el flujo diario y los
conectores. El video sí aporta el método de 6 pasos, usado abajo.

## 0 · Hecho hoy: los cuatro agentes del bucle (`.claude/agents/`)

| Archivo | Nombre | Modelo | Herramientas | Rol |
|---|---|---|---|---|
| `explore.md` | Explore | haiku | Read, Grep, Glob | lee y resume, no edita. Pisa al Explore integrado |
| `implementer.md` | implementer | sonnet | Read, Edit, Write, Grep, Glob, Bash | implementa el plan y corre los tests |
| `revisor.md` | revisor | opus | Read, Grep, Glob, Bash | revisa el diff: bugs, reglas, seguridad. No escribe |
| `puntuador.md` | puntuador | sonnet | Read, Grep, Glob | nota 0-10 por criterio; decide si hay otra vuelta |

El que escribe nunca revisa ni puntúa. Los 12 agentes `mkt-*` siguen igual.
Se activan en la próxima sesión (Claude Code lee `.claude/agents/` al arrancar).

## 1 · El problema de rendimiento número uno: el `CLAUDE.md` · HECHO (2026-11-27)

Quedó en 640 líneas (59 KB) con la orquestación y un mapa de 189 puntos; el detalle vive en 11 archivos de
`docs/claude/`. Verificado: el original se reconstruye byte a byte y no falta ninguna línea.

982 KB y 17.381 líneas, que entran enteras en CADA sesión y en cada subagente. Haiku leyendo eso
para buscar un archivo es lento y caro, y deja poco lugar para el trabajo.

**Propuesta**: `CLAUDE.md` pasa a ser un índice de ~300 líneas (cómo correr, arquitectura, reglas que
no se negocian, orquestación, y una tabla «tema → archivo»). El detalle de cada punto se muda tal cual
a `docs/claude/<tema>.md` (fases y llaves, PDF, scouting, simulador, pbp, ciclos, cortesías, mails…).
Los agentes leen el archivo del tema cuando lo necesitan. Sin perder una línea: es mudar, no resumir.
Lo hace el implementer, lo revisa el revisor contando que no se pierda contenido.

## 2 · Los 5 pilares, con el método de 6 pasos del video

### Pilar 1 · Configurar Claude y conectarlo
Ya conectado: Gmail, Google Drive, Calendar (por la Service Account), Canva, Vercel, Notion, Chrome,
la memoria del proyecto, y las tareas de Windows (vigía, agencia, Centro de Mando).
Falta: GitHub (aparece pidiendo autorización en `/mcp`), y una ficha corta «qué es MotorStats»
(producto, planes, clientes, ligas, voz) para que cualquier agente la lea sin abrir el CLAUDE.md técnico.

### Pilar 2 · Skills: las tareas repetidas como receta
Candidatas que veo en el historial (hay que confirmar cuáles te comen más tiempo):

| Skill | Hoy se hace con | Pasos que fija |
|---|---|---|
| `/entregar` | git, tests, generar-css, sincronizar-compartido | suite entera, `?v=`, CSS, compartido, commit, push, deploy del backend, verificar Pages |
| `/alta-cliente` | Panel Master, KV, mails | catálogo, equipo propio, enganche al torneo, acceso, bienvenida |
| `/subir-paquetes` | motorstats-ingestion | regenerar, ensayo, subir, verificar en el panel |
| `/cerrar-ciclo` | Ciclos, mail | sellar, foto, metas, publicar, mail de prueba, mail al club |
| `/fecha-manual` | calendario, Panel Master | partidos jugados ayer, carga, control |
| `/auditar` | ecosistema.js, Diagnóstico | catálogo ↔ libros ↔ licencias ↔ escudos |
| `/agencia`, `/equipo` | ya existen | se pasan a skill con su contexto |

### Pilar 3 · La herramienta propia con Cloudflare
Paso «integrar o reemplazar» del video. Hoy hay Vercel + Upstash + Pages andando con clientes.
**No propongo migrar**: propongo que Cloudflare sume lo que falta, sin tocar producción:
- una **mesa de control** (Worker + D1) que muestre en pantallas accionables el estado de todo:
  partidos sin cargar, paquetes viejos, ciclos por publicar, vencimientos, pases, leads;
- **Cron Triggers** que corran los chequeos aunque la PC esté apagada (hoy dependen de Windows);
- más adelante, si se vende como software, esto es la base multi-cliente.
Decisión tuya: arrancar con la mesa de control o dejar Cloudflare para después del verano.

### Pilar 4 · El equipo de agentes
Líder: Opus (planifica, audita, decide). Explore (haiku) lee, implementer (sonnet) escribe,
revisor (opus) revisa, puntuador (sonnet) puntúa. Los `mkt-*` para contenido.
Se les da órdenes con un comando `/bucle <tarea>` (pilar «ingeniería de bucle», abajo).

### Pilar 5 · La memoria («cerebro agéntico»)
El repo es **público**, así que el contexto de negocio (clientes, precios, leads, decisiones) no
puede ir ahí. Propuesta: un repo **privado** `motorstats-cerebro` con `contexto/` (negocio, clientes,
decisiones fechadas, pendientes), que cualquier agente lea; el repo público guarda solo lo técnico.

## 3 · Ingeniería de bucle

```
ENCONTRAR  la tarea sale de una cola (archivo de pendientes o issues de GitHub)
PLANEAR    Opus arma el plan; Explore le trae el contexto
HACER      implementer en un worktree propio (varias tareas a la vez sin pisarse)
REVISAR    revisor sobre el diff
PUNTUAR    puntuador: ≥ 8 termina · 5-7 otra vuelta con la lista · < 5 o repetido → escala
CERRAR     PR o commit + aviso; lo que pide una decisión tuya queda marcado, no se hace solo
```

Tope de 3 vueltas por tarea. Lo que siempre pide tu OK: push a main, deploy, escribir en KV o en
planillas, mandar mails a clientes, permisos de Drive.

**Automatizaciones**: rutinas programadas (`/schedule`, en la nube) para lo que no necesita tu PC;
tareas de Windows para lo que lee archivos locales; un hook que corre los tests al terminar.

## 3 bis · El Centro de Mando: qué ya es, y cómo se vuelve la mesa de control

Auditado el 2026-11-27 (solo lectura). El Centro de Mando ya es un sistema de agentes, pero solo para contenido:

| Pieza | Qué hace hoy | Motor |
|---|---|---|
| `motor.js`, `explorador.js`, `libre.js` | números, tablas, anomalías, placas, interpretación local | sin modelo |
| `llm.js` | interpreta la pregunta táctica y redacta, con guardas después de la respuesta | `claude -p` (Opus) o API |
| `agencia.js` | circuito de puertas con los 12 `mkt-*` como subagentes, audita que cada puerta corrió, produce piezas | `claude -p --model sonnet` |
| `correr.ps1` + tareas de Windows | rutina diaria (08:06) y semanal (lunes): vigila, digiere y propone 5 ideas | `claude -p` sonnet |
| `servidor.js` (127.0.0.1:8770) | pestañas Agencia, Bandeja, Explorador, A medida, Aprendizaje, Conectores | — |

**Lo que ya resuelve del bucle**: separación de roles (un agente por puerta, vetos en P3 y P5), auditoría de que el
trabajo se hizo de verdad (`auditarCorrida` mira el stream, no lo que dice el agente), estado en disco
(`banco.json`, `trabajos/`), rutinas sin sesión abierta y el tablero con decisiones humanas.

**Huecos encontrados**: P12 (moderación) y P13 (métricas → ajustes) solo existen en la memoria, no en el código;
P0 es la rutina y P11 la acción «Aprobar». Las dos vías de IA usan modelos distintos (Opus en `llm.js`, Sonnet en la agencia).

**Propuesta de integración** (no reemplazar: extender):
1. **Una sola cola de trabajo.** El banco de la agencia pasa a ser un caso de una cola general `trabajos` con tipo
   (`contenido`, `codigo`, `operacion`, `cliente`). La pestaña Agencia se vuelve «Mesa de control» con lo que espera
   tu decisión arriba, venga de donde venga.
2. **El bucle de código entra al Centro de Mando**: una acción «Lanzar bucle» corre `claude -p` en un worktree con
   Explore → implementer → revisor → puntuador, con la misma auditoría por stream que ya usa `agencia.js`
   (`auditarCorrida`), y deja el diff para aprobar. Reusa `correrClaude`, no se escribe otro lanzador.
3. **Operación como trabajos**: las skills `/entregar`, `/subir-paquetes`, `/cerrar-ciclo`, `/fecha-manual`, `/auditar`
   se vuelven botones que encolan un trabajo; cada uno deja su informe en la mesa.
4. **Señales automáticas que crean trabajos**: el auditor del ecosistema, los partidos sin cargar (punto 164),
   paquetes viejos, ciclos por publicar, vencimientos y pases por vencer escriben en la cola (hoy son mails o eventos sueltos).
5. **Cerrar P12 y P13** con los agentes que ya existen (community-manager y content-manager) leyendo `aprendizaje.json`.
6. **Cloudflare, después**: cuando la mesa local ande, la cola y las pantallas se publican en un Worker + D1 privado
   para verla desde el celular y para que los chequeos corran con la PC apagada. Los trabajos que tocan archivos
   locales siguen en la PC.

## 4 · Orden acordado (2026-11-27)

| # | Paso | Estado |
|---|---|---|
| 1 | Partir el `CLAUDE.md` | HECHO |
| 2 | Comando `/bucle` (Explore → implementer en worktree → revisor → puntuador, tope 3 vueltas) y skill `/entregar` (`.claude/skills/bucle/`, `.claude/skills/entregar/`) | ARMADO, falta la prueba end-to-end |
| 3 | Repo privado `motorstats-cerebro` + ficha «qué es MotorStats» | después del 2 |
| 4 | Skills de las tres tareas que más tiempo comen, en este orden: `/subir-paquetes` + `/cerrar-ciclo` + `/fecha-manual` (entregas y datos), luego contenido (`/agencia` como skill con contexto), luego `/auditar` (datos y clientes) | |
| 5 | Centro de Mando: cola única y «Mesa de control», «Lanzar bucle», botones de operación, señales que crean trabajos | |
| 6 | Cerrar P12 (moderación post-publicación, `mkt-community-manager`) y P13 (métricas → ajustes, `mkt-content-manager`) leyendo `aprendizaje.json` | junto con el 5 |
| 7 | Cloudflare (Worker + D1, Cron Triggers) | cuando 2-6 anden sin errores |

## 5 · Decisiones tomadas (2026-11-27)

1. **Tareas que más tiempo comen**: (a) entregas y actualización de datos y paquetes de clubes y torneos, con cierres de
   ciclo y cargas manuales; (b) armado y publicación de contenido táctico (reels y carruseles); (c) auditoría de datos y clientes.
2. **Repo privado de contexto**: sí, aparte y privado. El repo público guarda solo lo técnico.
3. **Cloudflare**: después, cuando el bucle, los agentes, el cerebro y el Centro de Mando estén sólidos.
4. **Autonomía del bucle**: itera solo (explorar, planear, implementar en worktree, revisar, puntuar) y deja el trabajo
   listo en una rama. **Siempre espera el OK** para: push a `main`, deploy, escribir en KV o en planillas reales,
   mandar mails a clientes, cambiar permisos de Drive. Crear el repo privado también va con OK (es una acción externa).
