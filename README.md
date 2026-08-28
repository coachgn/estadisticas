# SGADD · Sistema de Gestión y Análisis de Datos Deportivos

Panel de scouting de básquet, multi-cliente y **sin backend**: un sitio
estático que lee las planillas que escribe MotorStats y las convierte en
informes que el cuerpo técnico usa en la cancha.

**En vivo:** https://coachgn.github.io/estadisticas/
· `?club=<id>` elige el cliente.

---

## Por dónde empezar

| | |
|---|---|
| [`HOJA_DE_RUTA.md`](HOJA_DE_RUTA.md) | Qué está hecho, qué falta y por qué ese orden. **La vista de producto** |
| [`CLAUDE.md`](CLAUDE.md) | Cómo funciona por dentro, y sobre todo **por qué** cada decisión es la que es. Empezar por el punto 1 |

El resto de los `.md` son auditorías puntuales: la integración con el motor,
la especificación del adaptador, el glosario de etiquetas de jugador.

## Correr los tests

Todo desde la raíz del repo. **Los 2406 tienen que dar verde antes de
commitear** — es la única red de seguridad que tiene el proyecto, porque el
push va directo a `main`.

```bash
node test-core.js && node test-config.js && node test-scouting.js
```

La lista completa está en el punto 1 de `CLAUDE.md`.

## Lo que hay que saber antes de tocar nada

- **No hay bundler.** Se edita, se sube, se ve. La única pieza generada es
  `sgadd.css`, y se genera a mano con `node generar-css.js`: al agregar una
  clase de Tailwind nueva **hay que acordarse de correrlo**.
- **Subir el `?v=` del `index.html` en cada entrega**, o el navegador sirve
  la versión vieja y se pierden horas persiguiendo fantasmas.
- **El dato manda siempre.** La configuración declara reglas que el box
  score no puede saber; cuando las dos se contradicen, gana el libro y el
  panel lo dice.
- **Un dato ausente se muestra ausente.** Nunca se inventa uno para llenar
  un hueco: un `—` es información, un cero inventado es una mentira que no
  se nota.
