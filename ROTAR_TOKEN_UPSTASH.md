# Rotar el token de Upstash sin cortar el servicio

Cinco pasos. El servicio **no se interrumpe en ninguno**: el backend acepta
dos tokens a la vez durante la transición y prueba el nuevo primero.

Antes de empezar conviene entender por qué hace falta la variable de más.
Rotar una credencial de un servicio que está sirviendo tiene un agujero
conocido: entre que se genera la nueva y que el servidor la lee hay
peticiones en vuelo. Y en Vercel «el servidor» son varias instancias que se
reciclan cuando quieren, así que la ventana **no es un instante** — puede
durar minutos. Con un segundo nombre de variable esa ventana desaparece.

---

## 0 · La foto de antes

```bash
node server/bin/kv-salud.js --escribir
```

Tiene que dar **todo verde**. Si algo ya estaba roto, arreglalo antes: no
conviene rotar sobre un problema que después va a parecer culpa de la
rotación.

Anotá la huella del token que imprime (`gQAAAA…NjMQ`): sirve para confirmar
más adelante que de verdad cambió.

---

## 1 · Copiar el token actual al slot LEGACY

**Esto va PRIMERO, antes de generar nada.** Es el paso que hace que la
rotación sea sin corte: cuando el token nuevo entre, el viejo va a seguir
estando disponible como respaldo.

```bash
npx vercel env add UPSTASH_REDIS_REST_TOKEN_LEGACY production
```

Pegá **el token que hoy tiene `UPSTASH_REDIS_REST_TOKEN`**. Se puede leer
con:

```bash
npx vercel env pull .env.produccion
```

Y redesplegá para que las instancias lo tomen:

```bash
cd server && npx vercel deploy --prod --yes
```

Comprobá que sigue todo verde: `node server/bin/kv-salud.js`

---

## ⚠ Antes del paso 2 · leer esto

**En Upstash, «Rotate token» REVOCA el viejo en el acto.** No hay periodo de
gracia: en cuanto se genera el nuevo, el que está en producción empieza a
contestar `401 WRONGPASS`.

Eso rompe la premisa del paso 1: el legacy solo sirve si el token viejo
**sigue vivo**. Si ya rotaste en la consola, el legacy no aporta nada y el
orden correcto es el corto:

1. poner el token nuevo en `UPSTASH_REDIS_REST_TOKEN`,
2. desplegar,
3. verificar,
4. **no** configurar ningún legacy.

Pasó en la rotación del 2026-09-01: el token nuevo llegó ya generado, así
que el viejo estaba muerto antes de empezar y producción estuvo sirviendo
desde el respaldo (`origen: codigo`) hasta que entró el nuevo. **Nadie se
quedó sin panel** —para eso está la cascada— pero durante esa ventana el
login por clave, el alta de clientes y publicar zonas no funcionaban.

El slot legacy sigue teniendo sentido para el caso en que Upstash permita
**dos tokens vivos a la vez** (crear uno nuevo sin revocar el anterior).
Si tu plan lo permite, usá el procedimiento largo. Si no, el corto.

Y en los dos casos, la regla no cambia: **generá el token nuevo recién
cuando estés en la máquina lista para ponerlo**, no antes.

---

## 2 · Generar el token nuevo en Upstash

En la consola de Upstash, en la base de datos del proyecto:
**Details → REST API → Rotate token** (o *Create new token*).

Copialo. Upstash lo muestra **una sola vez**.

> **No revoques el viejo todavía.** Ese es el que está sirviendo.

---

## 3 · Poner el token nuevo

```bash
npx vercel env rm UPSTASH_REDIS_REST_TOKEN production
npx vercel env add UPSTASH_REDIS_REST_TOKEN production
cd server && npx vercel deploy --prod --yes
```

Desde este momento el backend prueba **el nuevo primero** y cae al legacy
solo si el nuevo falla por permisos. Un timeout o un 500 **no** disparan el
fallback: ahí el token está bien y reintentar solo duplicaría la espera.

---

## 4 · Verificar que el nuevo es el que trabaja

```bash
node server/bin/kv-salud.js --escribir
```

Tiene que decir `token que respondió: completo` y **la huella tiene que ser
distinta** de la del paso 0.

Probá también contra el servidor desplegado, que es el que importa:

```bash
curl -s -H "Authorization: Bearer <TOKEN_DE_ADMIN>" \
  https://estadisticas-backend.vercel.app/api/v1/clientes | head -c 200
```

Si contesta el JSON con los clubes y sus cupos, el servidor está leyendo KV
con el token nuevo.

---

## 5 · Cerrar la rotación

**Los dos pasos, y en este orden.** Si se revoca el viejo antes de borrar la
variable, el servidor va a seguir intentándolo y a gastar una petición
fallida por cada operación.

```bash
npx vercel env rm UPSTASH_REDIS_REST_TOKEN_LEGACY production
cd server && npx vercel deploy --prod --yes
```

Y recién ahí, en la consola de Upstash, **revocá el token viejo**.

Última comprobación:

```bash
node server/bin/kv-salud.js --escribir
```

Ya no tiene que aparecer la advertencia del legacy.

---

## Si algo sale mal

**El servicio no se cae**: mientras el legacy esté puesto, el viejo sigue
sirviendo. Y aunque los dos fallaran, el panel **no queda en blanco** — el
catálogo y las zonas se caen al JSON del repo (`clubes/<club>.json`), que es
exactamente como funcionaba antes de que existiera KV.

Lo que **sí** deja de andar con KV caído:

- dar de alta o de baja un cliente,
- publicar zonas,
- el login por mail y clave (el padrón vive en KV),
- las alertas del buzón que calcula el servidor.

Los links firmados siguen funcionando: no tocan KV.

Para volver atrás en cualquier punto, alcanza con poner el token viejo de
vuelta en `UPSTASH_REDIS_REST_TOKEN` y redesplegar.

---

## Los nombres que acepta el backend

Upstash bautiza distinto según por dónde se cree la base, así que se aceptan
los tres juegos —y sus variantes `_LEGACY`:

| | Producción | Transición |
|---|---|---|
| completo | `UPSTASH_REDIS_REST_TOKEN` | `UPSTASH_REDIS_REST_TOKEN_LEGACY` |
| | `UPSTASH_KV_REST_API_TOKEN` | `UPSTASH_KV_REST_API_TOKEN_LEGACY` |
| | `KV_REST_API_TOKEN` | `KV_REST_API_TOKEN_LEGACY` |
| solo lectura | `UPSTASH_REDIS_REST_READONLY_TOKEN` | `…_READONLY_TOKEN_LEGACY` |
| | `KV_REST_API_READ_ONLY_TOKEN` | `KV_REST_API_READ_ONLY_TOKEN_LEGACY` |

El de **solo lectura** sigue siendo una opción abierta y hoy **no** se usa:
la API de escritura del Panel Master necesita el token completo del lado del
servidor. Ver el punto 18 bis de `CLAUDE.md` para el criterio original y por
qué cambió.
