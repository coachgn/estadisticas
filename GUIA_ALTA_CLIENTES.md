# Guía para dar de alta o modificar un cliente

Todo se hace desde el **Panel Master**, en la pestaña **Clientes**, en el
bloque **«Alta o edición de un cliente»**. No hace falta tocar archivos ni
usar la terminal: al guardar, el panel del cliente queda andando en su
próxima carga.

---

## Antes de empezar, tené a mano

- **El nombre del club** tal como lo querés mostrar (ej. *Sud América La Plata*).
- **En qué torneo juega.** Si ya hay otro cliente en el mismo torneo, vas a
  usar su mismo libro y no necesitás nada más.
- **Si es un torneo nuevo:** el link del libro de Google Sheets que arma
  MotorStats. Ese libro tiene que estar compartido como **Lector** con la
  cuenta del sistema; si no lo está, la pantalla te dice con qué mail
  compartirlo.

---

## Dar de alta un cliente nuevo

1. En **«¿Qué querés hacer?»** dejá **«Dar de alta un cliente nuevo»**.

2. **Paso 1 · El club**
   - Escribí el **nombre del club**. El **ID** se completa solo: no lo toques
     salvo que quieras uno más corto (ej. `sud-america`). Ojo: el ID va en el
     link del cliente y **después no se puede cambiar**.
   - En **Liga** poné `la-plata` para los clubes de La Plata (es la carpeta de
     escudos).

3. **Paso 2 · La categoría**
   - Escribí cómo se llama la categoría (ej. *Primera 2026*). Su ID también se
     completa solo.

4. **Paso 3 · El libro y el equipo**
   - Si juega en el mismo torneo que otro cliente: elegí **«Usar un libro ya cargado»**
     y buscá ese torneo en la lista (ej. *Deportivo La Plata · Primera 2026*).
   - Si es un torneo nuevo: elegí **«Pegar el link de un libro nuevo»** y pegá
     el link entero.
   - Tocá **«Leer los equipos del libro»**. Aparece la lista de equipos tal
     como los escribe la planilla, y la pantalla **propone** cuál es el del
     club. **Revisá que sea el correcto** antes de seguir.

5. Tocá **«Dar de alta»**. Se abre un resumen con lo que se va a crear:
   leelo y confirmá.

6. Listo. Aparece **«Abrir su panel →»** para verlo como lo va a ver el club.

7. **Falta darle acceso a las personas.** En la tarjeta del club, abrí
   **«Quiénes pueden entrar»** y cargá sus mails. Ahí mismo se elige el plan
   (Bronce, Plata u Oro): cada plan permite una cantidad de mails distinta.

---

## Modificar un cliente que ya existe

Sirve para corregir un nombre mal escrito, cambiar el equipo o la etiqueta
de una categoría, sin rehacer el alta.

1. En **«¿Qué querés hacer?»** elegí **«Editar · (nombre del club)»**. El
   formulario se llena con lo que ya tiene.
2. En **«Categoría a editar»** elegí cuál.
3. Cambiá lo que haga falta. Para no tocar el libro dejá marcado
   **«Mantener el libro que ya tiene»**.
4. Si vas a cambiar el equipo, tocá **«Leer los equipos del libro»** y elegilo
   de la lista: así no se escapa una letra.
5. Tocá **«Guardar cambios»**, revisá el resumen y confirmá.

**Lo único que no se puede cambiar son los ID** (del club y de la
categoría): los usan los links y los accesos que el club ya tiene.

---

## Agregar otra categoría a un club

Igual que modificar, pero en **«Categoría a editar»** elegí **«＋ Agregar una
categoría nueva»**, y en el paso 3 elegí su libro (uno ya cargado o uno nuevo).

---

## Si la pantalla te frena

| Lo que dice | Qué hacer |
|---|---|
| *El libro existe pero el sistema no lo puede leer* | Compartí el libro como **Lector** con el mail que aparece en el mensaje y volvé a tocar «Leer los equipos del libro». |
| *Ese libro no existe* | El link está mal copiado. Volvé a copiarlo desde Google Sheets. |
| *«…» no figura en el libro* | El equipo no coincide letra por letra con la planilla. Elegilo de la lista después de leer el libro. |
| *Ese ID ya es de…* | Ese club ya está dado de alta. Elegilo en «¿Qué querés hacer?» para editarlo. |
| *Falta …* | La línea al lado del botón dice qué dato falta completar. |

---

## Lo que esta pantalla no hace

- **El escudo y los colores del club.** Sin ellos el panel funciona igual, con
  los colores por defecto y las iniciales del club en lugar del escudo. Para
  sumarlos hay que pedírselo al equipo técnico (van en el archivo de marca del club).
- **Borrar un cliente.** Para cortarle el acceso se usa **Pausar** o **Dar de
  baja** en su tarjeta: los dos conservan toda la configuración.
