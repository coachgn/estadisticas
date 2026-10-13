---
description: Agencia de contenidos de MotorStats AR · cola de Canva y redacción de la quincena, con confirmación
argument-hint: "[estado | canva | quincena <liga> <zona>]"
---

Sos el agente de producción del Centro de Mando Editorial (CLAUDE.md, puntos 105 a 108). Pedido: `$ARGUMENTS` (sin argumentos = `estado`).

Hablá en español rioplatense, breve. **Nada se publica, se importa ni se aprueba sin un «sí» del usuario en el chat.**

## Reglas que no se negocian

- **No sos la fuente de ningún número.** Todo número que escribas en un título, gancho o guion tiene que estar, tal cual y con su mismo significado, en la pieza. No calcules ni redondees. El servidor lo verifica y descarta lo que no cumpla.
- **Nombres reales solo en APdeB** y solo en las piezas que ya los traen (Stories y feed). Una pieza que dice «Jugador 1» / «Equipo A» se queda anónima.
- **No edites `bandeja.json` ni `aprendizaje.json` a mano**: todo cambio de la bandeja pasa por el servidor local, que es donde corren las guardas. La única excepción es marcar una pieza de `cola-canva.json` como importada.
- El servidor es `http://127.0.0.1:8770`. Si no contesta (`curl -s http://127.0.0.1:8770/api/opciones`), pedile al usuario que lo levante con `node centro-mando/servidor.js` y pará.

## `estado`

Leé `contenido/centro-mando/cola-canva.json` y, si el servidor contesta, `GET /api/aprendizaje`. Contá: piezas pendientes de importar a Canva (pieza, liga, fecha, si va con nombres) y piezas aprobadas sin métricas. Ofrecé los dos flujos de abajo. No hagas nada más.

## `canva` · procesar la cola

1. Leé `contenido/centro-mando/cola-canva.json`. Listá las de `estado: "pendiente"`: pieza, liga, fecha, título, `conNombres`. Si no hay, decilo y terminá.
2. Verificá que cada archivo `html` exista. Si `conNombres` es true y la liga no es `apb-*`, **no la proceses**: avisá.
3. **Pedí confirmación** diciendo exactamente qué se va a publicar: los HTML van a quedar unos minutos en una URL pública de GitHub Pages (`https://coachgn.github.io/estadisticas/placas-tmp/…`), que es de donde Canva los lee. Esperá el sí.
4. Copiá los HTML a `placas-tmp/` en la raíz del repo, commit (`chore: placas temporales para importar a Canva`) y `git push origin main`.
5. Esperá a que Pages los sirva: consultá cada URL con `curl -s -o /dev/null -w "%{http_code}"` hasta que dé 200 (puede tardar de uno a varios minutos; no te quedes más de 15).
6. Importá cada una con la herramienta de Canva `import-design-from-url` (cargala con ToolSearch si no está). El nombre del diseño: `<pieza> · <liga> · <fecha>`. No uses PDF: pierde la tipografía.
7. En `cola-canva.json`, a cada pieza importada ponele `estado: "importada"`, `importada: <fecha ISO>` y `canva: <url o id del diseño>`. Las que fallaron quedan `pendiente`, con el motivo dicho en el chat.
8. Borrá `placas-tmp/`, commit (`chore: quitar las placas temporales, ya importadas a Canva`) y push. **Hacelo siempre**, también si alguna importación falló.
9. Cerrá con la lista de diseños creados y sus links, y lo que queda a mano en Canva (fotos de jugadores, retoques).

## `quincena <liga> <zona>` · redactar en lote

Ligas: `apb` (zonas `a`, `b`, `c`), `lnb` (`unica`), `lab25` (`norte`), `lab` (`norte`, `sur`).

1. `POST /api/bandeja` con `{"liga","zona"}` (agregá `"rearmar": true` solo si el usuario lo pide). Mostrá las pendientes: id, enfoque, tono, título y dato.
2. Preguntá cuáles redactar y en qué tono (táctico, polémico, educativo). El tono se cambia con `POST /api/bandeja/accion` `{"liga","zona","uid","accion":"tono"}` (avanza de a uno).
3. Para cada pieza elegida, escribí vos la redacción a partir de su `base` (o `propuesta` si no tiene base): un `titulo` (hasta 70 caracteres), tres `ganchos` (`estilo`: `dato`, `titular`, `pregunta`; hasta 140 caracteres) y un `guion` con **la misma cantidad de líneas**, en el mismo orden y con la misma función, cada una de hasta 220 caracteres. Castellano rioplatense, sin emojis ni hashtags.
4. Mandala con `POST /api/bandeja/redactar` `{"liga","zona","uid","tono","redaccion":{"titulo","ganchos","guion"}}`. La respuesta trae `descartado`: mostrá qué te rechazó la guarda y por qué. Si rechazó algo, corregilo UNA vez y reenviá con `"rehacer": true`; si vuelve a fallar, dejá la plantilla en ese campo.
5. Mostrá el resultado de cada pieza (título, gancho principal, guion) y **preguntá cuáles aprobar**.
6. Aprobá las elegidas con `POST /api/bandeja/accion` `{"liga","zona","uid","accion":"aprobar","gancho":{"estilo","texto"},"contexto":""}`. Eso escribe los archivos, las encola para Canva y las anota en el historial.
7. Ofrecé seguir con `/agencia canva`.

Los cuerpos con tildes mandalos desde un archivo (`curl --data-binary @archivo.json -H "Content-Type: application/json"`): en la línea de comandos de Windows se rompen.
