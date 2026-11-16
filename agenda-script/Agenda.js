/**
 * MotorStats · Agenda en TU calendario (con popup en el celular)
 *
 * Por qué existe: los eventos que crea el servidor en otro calendario no te
 * suenan. Un evento creado DENTRO de tu cuenta sí. Este script le pide al
 * backend la lista de eventos que corresponden (avisos de partido de Jujuy,
 * día de partido, previa y checklist de carga) y los crea en tu calendario
 * principal con su popup.
 *
 * Se instala UNA vez: abrí este proyecto, elegí la función `instalar` y
 * tocá Ejecutar (te pide permiso para tu calendario y para llamar al
 * backend). Desde ahí corre solo todos los días a la madrugada.
 *
 * La URL y la clave están en Config.js (no va al repositorio).
 */

var PREFIJO_TAG = 'msid';

function sincronizar() {
  var url = CONFIG.URL + '?clave=' + encodeURIComponent(CONFIG.CLAVE);
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('El backend respondió ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
  }
  var feed = JSON.parse(resp.getContentText());
  var cal = CalendarApp.getDefaultCalendar();
  var creados = 0, actualizados = 0, iguales = 0;

  (feed.eventos || []).forEach(function (e) {
    var ini = new Date(e.inicio), fin = new Date(e.fin);
    // Busca el evento por su id estable dentro de ese día.
    var dia = new Date(ini.getTime()); dia.setHours(0, 0, 0, 0);
    var finDia = new Date(dia.getTime() + 24 * 3600 * 1000);
    var existente = cal.getEvents(dia, finDia).filter(function (x) { return x.getTag(PREFIJO_TAG) === e.id; })[0];

    if (!existente) {
      // Un evento con tag que ya existe en OTRO día (se reprogramó el partido): se mueve.
      var ev = cal.createEvent(e.titulo, ini, fin, { description: e.descripcion });
      ev.setTag(PREFIJO_TAG, e.id);
      ev.removeAllReminders();
      (e.recordatorios || [0]).forEach(function (m) { ev.addPopupReminder(m); });
      creados++;
    } else if (existente.getTitle() !== e.titulo || existente.getDescription() !== e.descripcion) {
      existente.setTitle(e.titulo);
      existente.setDescription(e.descripcion);
      actualizados++;
    } else {
      iguales++;
    }
  });

  Logger.log('Agenda: ' + creados + ' creados, ' + actualizados + ' actualizados, ' + iguales + ' sin cambios.' +
    ((feed.avisos || []).length ? ' Avisos del backend: ' + JSON.stringify(feed.avisos) : ''));
}

/** Se corre UNA vez a mano: deja el disparador diario y hace la primera carga. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizar') ScriptApp.deleteTrigger(t);
  });
  // Dos veces por día: de madrugada (avisos y día de partido) y a media mañana
  // (por si el fixture de la liga se actualizó).
  ScriptApp.newTrigger('sincronizar').timeBased().everyDays(1).atHour(5).inTimezone('America/Argentina/Buenos_Aires').create();
  ScriptApp.newTrigger('sincronizar').timeBased().everyDays(1).atHour(10).inTimezone('America/Argentina/Buenos_Aires').create();
  sincronizar();
}
