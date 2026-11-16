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
// Google limita cuántos eventos se pueden crear de golpe: se crea de a pocos,
// con pausa, y si igual salta el límite se frena y se retoma solo más tarde.
var MAX_CREADOS_POR_CORRIDA = 25;
var PAUSA_MS = 1500;

function sincronizar() {
  var url = CONFIG.URL + '?clave=' + encodeURIComponent(CONFIG.CLAVE) + (CONFIG.ORIGEN ? '&origen=' + encodeURIComponent(CONFIG.ORIGEN) : '');
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('El backend respondió ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
  }
  var feed = JSON.parse(resp.getContentText());
  var cal = CalendarApp.getDefaultCalendar();
  var creados = 0, actualizados = 0, iguales = 0, pendientes = 0, limite = false;

  (feed.eventos || []).forEach(function (e) {
    if (limite) { pendientes++; return; }
    var ini = new Date(e.inicio), fin = new Date(e.fin);
    var dia = new Date(ini.getTime()); dia.setHours(0, 0, 0, 0);
    var finDia = new Date(dia.getTime() + 24 * 3600 * 1000);
    var existente = cal.getEvents(dia, finDia).filter(function (x) { return x.getTag(PREFIJO_TAG) === e.id; })[0];

    if (existente) {
      if (existente.getTitle() !== e.titulo || existente.getDescription() !== e.descripcion) {
        existente.setTitle(e.titulo);
        existente.setDescription(e.descripcion);
        actualizados++;
      } else {
        iguales++;
      }
      return;
    }
    if (creados >= MAX_CREADOS_POR_CORRIDA) { pendientes++; limite = true; return; }
    try {
      var ev = cal.createEvent(e.titulo, ini, fin, { description: e.descripcion });
      ev.setTag(PREFIJO_TAG, e.id);
      ev.removeAllReminders();
      (e.recordatorios || [0]).forEach(function (m) { ev.addPopupReminder(m); });
      creados++;
      Utilities.sleep(PAUSA_MS);
    } catch (err) {
      // «Has creado o eliminado demasiados calendarios o eventos…»: se frena y se retoma.
      pendientes++;
      limite = true;
      Logger.log('Límite de Google: ' + err.message);
    }
  });

  Logger.log('Agenda: ' + creados + ' creados, ' + actualizados + ' actualizados, ' + iguales + ' sin cambios, ' +
    pendientes + ' pendientes.' + ((feed.avisos || []).length ? ' Avisos del backend: ' + JSON.stringify(feed.avisos) : ''));

  limpiarContinuaciones_();
  if (pendientes > 0) {
    // Sigue en 15 minutos, una sola vez (los eventos que ya están no se vuelven a crear).
    ScriptApp.newTrigger('sincronizar').timeBased().after(15 * 60 * 1000).create();
  }
}

/** Borra los disparadores de un solo uso que quedaron de una corrida anterior. */
function limpiarContinuaciones_() {
  // Sin la lista de los diarios (si no se corrió `instalar` con esta versión) no se borra nada.
  if (!PropertiesService.getScriptProperties().getProperty('diarios')) return;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizar' && t.getTriggerSource() === ScriptApp.TriggerSource.CLOCK
        && t.getEventType() === ScriptApp.EventType.CLOCK && !esDiario_(t)) ScriptApp.deleteTrigger(t);
  });
}

/** Los dos disparadores diarios se reconocen porque `instalar` los guarda en una propiedad. */
function esDiario_(t) {
  var ids = (PropertiesService.getScriptProperties().getProperty('diarios') || '').split(',');
  return ids.indexOf(t.getUniqueId()) >= 0;
}

/** Se corre UNA vez a mano: deja el disparador diario y hace la primera carga. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizar') ScriptApp.deleteTrigger(t);
  });
  // Dos veces por día: de madrugada (avisos y día de partido) y a media mañana
  // (por si el fixture de la liga se actualizó).
  var t1 = ScriptApp.newTrigger('sincronizar').timeBased().everyDays(1).atHour(5).inTimezone('America/Argentina/Buenos_Aires').create();
  var t2 = ScriptApp.newTrigger('sincronizar').timeBased().everyDays(1).atHour(10).inTimezone('America/Argentina/Buenos_Aires').create();
  PropertiesService.getScriptProperties().setProperty('diarios', t1.getUniqueId() + ',' + t2.getUniqueId());
  sincronizar();
}
