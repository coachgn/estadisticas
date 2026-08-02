// ====================================================================================
// ✅ SCRIPT INTEGRAL: ANALISIS LIGA ARGENTINA (FORMATOS Y ALINEACIÓN FINAL)
// ====================================================================================

const CONFIG = {
  CARPETA_RAIZ: "2025",
  TORNEO: "LIGA ARGENTINA",
  CATEGORIA: "CONFERENCIA NORTE",
  SUB_CARPETA_MADRE: "APERTURA",
  NOMBRE_ARCHIVO_MADRE: "CONFERENCIA NORTE - APERTURA",
  HOJA_ORIGEN: "4 FACTORES",
  HOJA_ORIGEN_B: "Base Datos E", 
  HOJA_DESTINO: "DB_PROCESADA",
  HOJA_JUGADORES: "Base Datos J" // Agregamos la solapa de jugadores
};

/**
 * 🏀 MENÚ DE CONTROL: ANALISIS LIGA (VERSIÓN INTEGRAL 2026)
 * Basado en instrucciones de memoria: Mirada 360°, robustez y flexibilidad.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏀 ANALISIS LIGA')
      // --- BLOQUE 0: INGESTA Y PARCHEO DE DATOS ---
      .addItem('📥 0. Carga Manual Alternativa (Emergencia)', 'ejecutarCargaMasiva')
      .addItem('🔄 Sincronizar Reales desde DB (Auto-Completar)', 'sincronizarResultadosDesdeDB')
      .addSeparator()

      // --- BLOQUE 1: PROCESAMIENTO DE DATOS ---
      .addItem('🔄 1. Actualizar Datos desde MADRE', 'actualizarEstudioFactores')
      .addItem('📊 2. Generar Ranking y Tendencias', 'generarRankingEquipos')
      .addItem('🎯 3. Calcular Peso de Factores', 'calcularInfluenciaFactores')
      .addItem('⚡ 4. Calcular Power Rating Predictivo', 'calcularPowerRating')
      
      // --- EJECUCIÓN MAESTRA ---
      .addItem('🚀 EJECUTAR PROCESO COMPLETO (1 a 4)', 'ejecutarCadenaAnalisis')
      .addSeparator()
      
      // --- BLOQUE 2: SIMULACIÓN Y PREDICCIÓN ---
      .addItem('🔬 5. Ejecutar Simulación Integral', 'ejecutarSimulacion')
      .addItem('🏁 6. Validar y Aprender (Post-Sincro)', 'validarResultadosHistorial')
      .addItem('🧠 7. Recalibrar Pesos (Aprendizaje)', 'retroalimentarSimulador')
      .addSeparator()
      
      // --- BLOQUE 3: NAVEGACIÓN Y CONFIGURACIÓN ---
      .addItem('📈 Ver Dashboard de Rendimiento', 'generarGraficoRendimiento')
      .addItem('📋 Ir al Historial de Predicciones', 'irAlHistorial')
      .addItem('⚙️ Configurar Hoja Simulador', 'configurarEstructuraSimulador')
      .addSeparator()
      
      // --- BLOQUE 4: ANALISIS EVOLUTIVO ---
      .addItem('📈 ACTUALIZAR REPORTE EVOLUTIVO', 'actualizarAnalisisEvolutivo')
      .addItem('🛠️ Configurar Panel Evolutivo', 'configurarPanelEvolutivo')
      .addSeparator()

      // --- BLOQUE 5: ANALISIS DE JUGADORES ---
      .addItem('👤 ACTUALIZAR PERFIL JUGADOR', 'ejecutarAnalisisCompleto')
      .addItem('🛠️ Inicializar Panel Jugadores', 'inicializarHojaAnalisis')
      .addToUi();
}

// --- FUNCIONES DE NAVEGACIÓN ---

function irAlHistorial() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("HISTORIAL");
  if (sheet) {
    sheet.activate();
  } else {
    SpreadsheetApp.getUi().alert("⚠️ La hoja HISTORIAL aún no ha sido creada.");
  }
}

// ====================================================================================
// 🔗 CADENA DE ANÁLISIS AUTOMATIZADA (VERSIÓN ROBUSTA)
// ====================================================================================

function ejecutarCadenaAnalisis() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
  // Notificación inicial en la barra de estado
  ss.toast("🚀 Iniciando procesamiento integral...", "SISTEMA NBA", 3);

  try {
    // PASO 1: Ingesta de Datos
    ss.toast("🔄 Paso 1/4: Sincronizando con DB Madre...", "PROCESANDO");
    actualizarEstudioFactores();
    SpreadsheetApp.flush(); // Asegura que los datos impacten en la hoja

    // PASO 2: Ranking
    ss.toast("📊 Paso 2/4: Generando Rankings y Tendencias...", "PROCESANDO");
    generarRankingEquipos();
    SpreadsheetApp.flush();

    // PASO 3: Influencia (Z-Score)
    ss.toast("🎯 Paso 3/4: Calculando Pesos Dinámicos...", "PROCESANDO");
    calcularInfluenciaFactores();
    SpreadsheetApp.flush();

    // PASO 4: Power Rating
    ss.toast("⚡ Paso 4/4: Finalizando Power Rating Predictivo...", "PROCESANDO");
    calcularPowerRating();
    SpreadsheetApp.flush();

    // Éxito final
    ss.toast("✅ Todo actualizado correctamente.", "SISTEMA NBA", 5);
    ui.alert('🏆 Proceso Finalizado\n\nEl sistema ha procesado la DB Madre, actualizado los Rankings y recalibrado el Power Rating exitosamente.');

  } catch (e) {
    // Reporte de error detallado
    Logger.log("Error en cadena: " + e.stack);
    ui.alert('❌ ERROR EN LA CADENA\n\nDetalle: ' + e.message + '\n\nRevisá la consola para más información.');
  }
}

function ejecutarCargaMasiva() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetCarga = ss.getSheetByName("CARGA_MASIVA");
  const sheetDB = ss.getSheetByName("DB_PROCESADA");
  
  if (!sheetCarga || !sheetDB) return;

  const datos = sheetCarga.getDataRange().getValues();
  if (datos.length < 2) return;

  const filasParaDB = [];
  for (let i = 1; i < datos.length; i++) {
    const [fecha, eqL, eqV, ptsL, ptsV, efgL, toL, rtlL, roL, efgV, toV, rtlV, roV, pace, min] = datos[i];
    if (!eqL || !eqV) continue;

    const pppL = ptsL / pace;
    const pppV = ptsV / pace;

    // Perspectiva LOCAL
    filasParaDB.push([
      fecha, `${eqL} vs ${eqV}`, eqL, "REGULAR", "LOCAL", `${ptsL}-${ptsV}`, min, pace, pace, (pace * pppL), 
      ptsL, ptsV, (pppL * 100), (pppV * 100), (pppL - pppV) * 100, pppL, pppV, (pppL - pppV),
      efgL, toL, rtlL, roL, efgV, toV, rtlV, roV, (ptsL > ptsV ? 1 : 0), 1.0 // 1.0 es el peso temporal base
    ]);

    // Perspectiva VISITANTE
    filasParaDB.push([
      fecha, `${eqL} vs ${eqV}`, eqV, "REGULAR", "VISITANTE", `${ptsV}-${ptsL}`, min, pace, pace, (pace * pppV), 
      ptsV, ptsL, (pppV * 100), (pppL * 100), (pppV - pppL) * 100, pppV, pppL, (pppV - pppL),
      efgV, toV, rtlV, roV, efgL, toL, rtlL, roL, (ptsV > ptsL ? 1 : 0), 1.0
    ]);
  }

  if (filasParaDB.length > 0) {
    sheetDB.getRange(sheetDB.getLastRow() + 1, 1, filasParaDB.length, 28).setValues(filasParaDB);
    SpreadsheetApp.getUi().alert("✅ DB Cargada con " + (datos.length - 1) + " partidos.");
  }
}

function sincronizarResultadosDesdeDB() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetHist = ss.getSheetByName("HISTORIAL");
  const sheetDB = ss.getSheetByName("DB_PROCESADA");
  
  if (!sheetHist || !sheetDB) {
    SpreadsheetApp.getUi().alert("⚠️ No se encuentran las hojas necesarias.");
    return;
  }

  const dataHist = sheetHist.getDataRange().getValues();
  const dataDB = sheetDB.getDataRange().getValues();
  
  // 1. Mapeamos la DB usando la columna PARTIDO (Columna B)
  const mapaResultados = {};
  
  for (let j = 1; j < dataDB.length; j++) {
    const partidoTexto = String(dataDB[j][1]).trim(); // Col B: PARTIDO
    const condicion = String(dataDB[j][4]).trim();    // Col E: CONDICION
    
    // Solo procesamos la fila donde el equipo es LOCAL para obtener ambos puntajes de una vez
    if (condicion === "LOCAL") {
      const ptsLocal = dataDB[j][10];  // Col K: PTS
      const ptsVis = dataDB[j][11];    // Col L: PTSopp
      
      // La llave es el nombre exacto del enfrentamiento
      mapaResultados[partidoTexto] = { loc: ptsLocal, vis: ptsVis };
    }
  }

  let cambios = 0;
  
  // 2. Recorremos el HISTORIAL para completar REAL LOC y REAL VIS
  for (let i = 1; i < dataHist.length; i++) {
    const fila = i + 1;
    
    // Verificamos si las columnas I (9) y J (10) están vacías
    if (dataHist[i][8] === "" || dataHist[i][9] === "") {
      const localH = String(dataHist[i][1]).trim();     // Col B: LOCAL
      const visitanteH = String(dataHist[i][2]).trim(); // Col C: VISITANTE
      
      // Reconstruimos el formato de la DB: "LOCAL vs VISITANTE"
      const llaveBusqueda = localH + " vs " + visitanteH;

      if (mapaResultados[llaveBusqueda]) {
        // Pegamos los datos en REAL LOC (Col I) y REAL VIS (Col J)
        sheetHist.getRange(fila, 9).setValue(mapaResultados[llaveBusqueda].loc);
        sheetHist.getRange(fila, 10).setValue(mapaResultados[llaveBusqueda].vis);
        
        // Estética: Centrado medio y formato número
        sheetHist.getRange(fila, 9, 1, 2)
                 .setHorizontalAlignment("center")
                 .setVerticalAlignment("middle")
                 .setNumberFormat("0");
        
        cambios++;
      }
    }
  }

  if (cambios > 0) {
    SpreadsheetApp.getUi().alert("✅ Sincronizados " + cambios + " resultados. Iniciando validación...");
    validarResultadosHistorial(); 
  } else {
    SpreadsheetApp.getUi().alert("⚠️ No se encontraron coincidencias.\n\nRevisá que en HISTORIAL el cruce sea: '" + 
                                  dataHist[1][1] + " vs " + dataHist[1][2] + 
                                  "'\ny que en DB_PROCESADA (Col B) figure exactamente igual.");
  }
}

// ====================================================================================
// 🔄 FUNCION 1: ACTUALIZAR DB_PROCESADA (ALINEACIÓN A-F Y PORCENTAJES)
// ====================================================================================

function actualizarEstudioFactores() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const carpetaCategoria = obtenerCarpetaDestino();
  const carpetaApertura = carpetaCategoria.getFoldersByName(CONFIG.SUB_CARPETA_MADRE).next();
  const archivoMadre = carpetaApertura.getFilesByName(CONFIG.NOMBRE_ARCHIVO_MADRE).next();
  const spreadsheetMadre = SpreadsheetApp.open(archivoMadre);
  
  const hoja4F = spreadsheetMadre.getSheetByName(CONFIG.HOJA_ORIGEN);
  const hojaBDE = spreadsheetMadre.getSheetByName(CONFIG.HOJA_ORIGEN_B);
  
  const datos4F = hoja4F.getDataRange().getValues();
  const datosBDE = hojaBDE.getDataRange().getValues();
  const headers4F = datos4F[0];
  const headersBDE = datosBDE[0];

  const mapaBDE = {};
  const idxBDE = {
    fecha: headersBDE.indexOf("FECHA"), partido: headersBDE.indexOf("PARTIDO"),
    equipo: headersBDE.indexOf("EQUIPO"), min: headersBDE.indexOf("MIN"),
    pos: headersBDE.indexOf("POS"), pace: headersBDE.indexOf("PACE"), plays: headersBDE.indexOf("PLAYS")
  };

  datosBDE.slice(1).forEach(fila => {
    const key = fila[idxBDE.fecha] + "_" + fila[idxBDE.partido] + "_" + fila[idxBDE.equipo];
    mapaBDE[key] = { min: fila[idxBDE.min], pos: fila[idxBDE.pos], pace: fila[idxBDE.pace], plays: fila[idxBDE.plays] };
  });

  const idx4F = {
    resultado: headers4F.indexOf("RESULTADO"), pts: headers4F.indexOf("PTS"),
    fecha: headers4F.indexOf("FECHA"), partido: headers4F.indexOf("PARTIDO"),
    equipo: headers4F.indexOf("EQUIPO"), condicion: headers4F.indexOf("CONDICION")
  };

  const totalPartidos = datos4F.length - 1;
  const datosProcesados = datos4F.slice(1).map((fila, index) => {
    const key = fila[idx4F.fecha] + "_" + fila[idx4F.partido] + "_" + fila[idx4F.equipo];
    const extras = mapaBDE[key] || { min: 0, pos: 0, pace: 0, plays: 0 };
    const resBinario = (fila[idx4F.resultado] === "GANADO") ? 1 : 0;
    const pesoTemporal = 0.8 + (0.4 * (index / totalPartidos));
    
    let nuevaFila = fila.slice(0, idx4F.resultado + 1);
    nuevaFila.push(extras.min, extras.pos, extras.pace, extras.plays);
    nuevaFila = nuevaFila.concat(fila.slice(idx4F.pts));
    nuevaFila.push(resBinario, pesoTemporal);
    return nuevaFila;
  });

  let nuevosEncab = headers4F.slice(0, idx4F.resultado + 1);
  nuevosEncab.push("MIN", "POS", "PACE", "PLAYS");
  nuevosEncab = nuevosEncab.concat(headers4F.slice(idx4F.pts));
  nuevosEncab.push("WIN_BIN", "PESO_TEMPORAL");

  let hojaDestino = ss.getSheetByName(CONFIG.HOJA_DESTINO) || ss.insertSheet(CONFIG.HOJA_DESTINO);
  hojaDestino.clear();
  
  hojaDestino.getRange(1, 1, 1, nuevosEncab.length)
    .setValues([nuevosEncab]).setFontWeight("bold").setBackground("#d9ead3").setHorizontalAlignment("center");

  hojaDestino.getRange(2, 1, datosProcesados.length, nuevosEncab.length).setValues(datosProcesados);
  hojaDestino.getRange(2, 1, datosProcesados.length, 6).setHorizontalAlignment("left");
  hojaDestino.getRange(2, 7, datosProcesados.length, nuevosEncab.length - 6).setHorizontalAlignment("center");

  nuevosEncab.forEach((nombre, index) => {
    const col = index + 1;
    const rangoCol = hojaDestino.getRange(2, col, datosProcesados.length, 1);
    if (nombre.includes("%")) rangoCol.setNumberFormat("0.00%");
    else if (["MIN", "PTS", "WIN_BIN"].includes(nombre)) rangoCol.setNumberFormat("0");
    else if (["POS", "PACE", "PLAYS", "RTNG OFF", "RTNG DEF", "NET RTG", "PESO_TEMPORAL"].includes(nombre)) rangoCol.setNumberFormat("0.00");
  });

  // --- CÁLCULO DE LOCALÍA (Sólido y persistente) ---
  const idxCond = nuevosEncab.indexOf("CONDICION");
  const idxWin = nuevosEncab.indexOf("WIN_BIN");
  let winsLocal = 0, totalPartidosLocal = 0;
  datosProcesados.forEach(f => {
    if (f[idxCond] === "LOCAL") { totalPartidosLocal++; if (f[idxWin] === 1) winsLocal++; }
  });

  const ventajaRealLocalia = totalPartidosLocal > 0 ? (winsLocal / totalPartidosLocal) - 0.50 : 0.05;
  const sheetPeso = ss.getSheetByName("PESO_FACTORES");
  
  // Seteamos solo las celdas necesarias para no pisar el resto de la tabla
  sheetPeso.getRange("A10").setValue("LOCALIA").setFontWeight("bold");
  sheetPeso.getRange("B10").setValue(ventajaRealLocalia).setNumberFormat("0.00");
  if (sheetPeso.getRange("C10").isBlank()) sheetPeso.getRange("C10").setValue(1.0).setNumberFormat("0.00");

  SpreadsheetApp.getUi().alert("🚀 DB Actualizada y Localía calculada.");
}

// ====================================================================================
// 📊 FUNCION 2: RANKING (AJUSTE FINO DE FORMATOS G|P Y PORCENTAJES)
// ====================================================================================

function generarRankingEquipos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetDB = ss.getSheetByName("DB_PROCESADA");
  const datos = sheetDB.getDataRange().getValues();
  const headers = datos[0];
  const filas = datos.slice(1);
  const statsEquipos = {};

  const i = {
    eq: headers.indexOf("EQUIPO"), win: headers.indexOf("WIN_BIN"), cond: headers.indexOf("CONDICION"),
    pos: headers.indexOf("POS"), pace: headers.indexOf("PACE"), plays: headers.indexOf("PLAYS"),
    efg: headers.indexOf("eFG%"), pp: headers.indexOf("PP%"), ro: headers.indexOf("RO%"), rtl: headers.indexOf("RTL%"),
    efgO: headers.indexOf("eFG Opp%"), ppO: headers.indexOf("PP Opp%"), roO: headers.indexOf("RO Opp%"), rtlO: headers.indexOf("RTL Opp%"),
    off: headers.indexOf("RTNG OFF"), def: headers.indexOf("RTNG DEF"), peso: headers.indexOf("PESO_TEMPORAL") 
  };

  filas.forEach(fila => {
    const nombre = fila[i.eq];
    if (!nombre) return;
    const p = fila[i.peso] || 1; 
    if (!statsEquipos[nombre]) {
      statsEquipos[nombre] = { partidos: 0, victorias: 0, posS: 0, paceS: 0, playsS: 0, efg: 0, pp: 0, ro: 0, rtl: 0, efgO: 0, ppO: 0, roO: 0, rtlO: 0, offR: 0, defR: 0, vicsLoc: 0, ptsLoc: 0, pesoAcumulado: 0 };
    }
    const s = statsEquipos[nombre];
    s.partidos++; s.pesoAcumulado += p; s.victorias += fila[i.win];
    if (fila[i.cond] === "LOCAL") { s.ptsLoc++; if (fila[i.win] === 1) s.vicsLoc++; }
    s.posS += (fila[i.pos]*p); s.paceS += (fila[i.pace]*p); s.playsS += (fila[i.plays]*p);
    s.efg += (fila[i.efg]*p); s.pp += (fila[i.pp]*p); s.ro += (fila[i.ro]*p); s.rtl += (fila[i.rtl]*p);
    s.efgO += (fila[i.efgO]*p); s.ppO += (fila[i.ppO]*p); s.roO += (fila[i.roO]*p); s.rtlO += (fila[i.rtlO]*p);
    s.offR += (fila[i.off]*p); s.defR += (fila[i.def]*p);
  });

  const tablaRanking = Object.keys(statsEquipos).map(eq => {
    const s = statsEquipos[eq]; const n = s.pesoAcumulado; const winRateGral = s.victorias / s.partidos;
    const winRateLoc = s.ptsLoc > 0 ? s.vicsLoc / s.ptsLoc : winRateGral;
    return [eq, s.victorias, s.partidos - s.victorias, s.posS/n, s.paceS/n, s.playsS/n, s.efg/n, s.pp/n, s.ro/n, s.rtl/n, s.efgO/n, s.ppO/n, s.roO/n, s.rtlO/n, s.offR/n, s.defR/n, (s.offR/n) - (s.defR/n), 0, winRateLoc - winRateGral];
  });

  let sheetRank = ss.getSheetByName("RANKING Y TENDENCIAS");
  sheetRank.clear();
  const headersRank = ["EQUIPO", "G", "P", "POS", "PACE", "PLAYS", "eFG%", "PP%", "RO%", "RTL%", "Opp eFG%", "Opp PP%", "Opp RO%", "Opp RTL%", "OFF RTG", "DEF RTG", "NET RTG", "POWER RATING", "EXTRA_LOC"];
  sheetRank.getRange(1, 1, 1, headersRank.length).setValues([headersRank]).setFontWeight("bold").setBackground("#cfe2f3").setHorizontalAlignment("center");
  sheetRank.getRange(2, 1, tablaRanking.length, 19).setValues(tablaRanking);

  const uFilaE = tablaRanking.length + 1;
  sheetRank.getRange(2, 1, uFilaE, 1).setHorizontalAlignment("left");
  sheetRank.getRange(2, 2, uFilaE, 17).setHorizontalAlignment("center");
  sheetRank.getRange(2, 2, uFilaE, 2).setNumberFormat("0");
  sheetRank.getRange(2, 4, uFilaE, 3).setNumberFormat("0.00");
  sheetRank.getRange(2, 7, uFilaE, 8).setNumberFormat("0.00%");
  sheetRank.getRange(2, 15, uFilaE, 4).setNumberFormat("0.00");

  // --- FILA PROMEDIO LIGA (Formato 0.00 / 0.00%) ---
  const filaPromedio = uFilaE + 2;
  sheetRank.getRange(filaPromedio, 1).setValue("PROMEDIO LIGA").setHorizontalAlignment("left").setBackground("#444444").setFontColor("white").setFontWeight("bold");
  for(let c = 2; c <= 18; c++) {
    let cell = sheetRank.getRange(filaPromedio, c);
    cell.setFormulaR1C1(`=AVERAGE(R2C:R[${-(filaPromedio-1)}]C)`).setBackground("#444444").setFontColor("white").setFontWeight("bold");
    if (c <= 3) cell.setNumberFormat("0");
    else if (c >= 7 && c <= 14) cell.setNumberFormat("0.00%");
    else cell.setNumberFormat("0.00");
  }

  sheetRank.hideColumns(19); 
  aplicarReglasColorRobusto(sheetRank, tablaRanking.length);
  calcularPowerRating(tablaRanking.length);
}

function aplicarReglasColorRobusto(sheet, cantEquipos) {
  sheet.clearConditionalFormatRules();
  const rules = [];
  const uFila = cantEquipos + 1; 
  
  const config = [
    { col: "D", mejor: "MAX" }, { col: "E", mejor: "MAX" }, { col: "F", mejor: "MAX" },
    { col: "G", mejor: "MAX" }, { col: "H", mejor: "MIN" }, { col: "I", mejor: "MAX" }, { col: "J", mejor: "MAX" },
    { col: "K", mejor: "MIN" }, { col: "L", mejor: "MAX" }, { col: "M", mejor: "MIN" }, { col: "N", mejor: "MIN" },
    { col: "O", mejor: "MAX" }, { col: "P", mejor: "MIN" }, { col: "Q", mejor: "MAX" }
  ];

  config.forEach(c => {
    let rango = sheet.getRange(c.col + "2:" + c.col + uFila);
    let refRango = "$" + c.col + "$2:$" + c.col + "$" + uFila;
    let peor = (c.mejor === "MAX") ? "MIN" : "MAX";
    
    // VERDE: Mejor
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied("=" + c.col + "2=" + c.mejor + "(" + refRango + ")")
      .setBackground("#b7e1cd").setFontColor("#008647").setBold(true).setRanges([rango]).build());
    
    // ROJO: Peor
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied("=" + c.col + "2=" + peor + "(" + refRango + ")")
      .setBackground("#f4cccc").setFontColor("#990000").setBold(true).setRanges([rango]).build());

    // AMARILLO: El valor que representa el promedio (Benchmark)
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied("=" + c.col + "2=MEDIAN(" + refRango + ")")
      .setBackground("#fff2cc").setFontColor("#854307").setBold(true).setRanges([rango]).build());
  });

  sheet.setConditionalFormatRules(rules);
}

// ====================================================================================
// 🎯 FUNCION 3: PESO (PEARSON MEJORADO + FILTRO DE RUIDO)
// ====================================================================================

function calcularInfluenciaFactores() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetDB = ss.getSheetByName("DB_PROCESADA");
  const sheetPeso = ss.getSheetByName("PESO_FACTORES");
  
  const datos = sheetDB.getDataRange().getValues();
  const headers = datos[0];
  const filas = datos.slice(1);
  const colWin = headers.indexOf("WIN_BIN");
  const factores = ["eFG%", "PP%", "RO%", "RTL%", "eFG Opp%", "PP Opp%", "RO Opp%", "RTL Opp%"];

  const filasRecientes = filas.length > 40 ? filas.slice(-40) : filas;

  const resultadosBase = factores.map(f => {
    const idx = headers.indexOf(f);
    if (idx === -1) return [f, 0.00];
    const winData = filasRecientes.map(r => parseFloat(r[colWin]) || 0);
    const factorData = filasRecientes.map(r => parseFloat(r[idx]) || 0);
    return [f, Math.abs(calcularPearson(factorData, winData))];
  });

  // Solo actualizamos encabezados, Factores (A) y Correlación (B)
  sheetPeso.getRange("A1:C1").setValues([["FACTOR", "CORRELACION_BASE", "PESO_APRENDIZAJE"]]).setFontWeight("bold").setBackground("#444444").setFontColor("white");
  sheetPeso.getRange(2, 1, resultadosBase.length, 2).setValues(resultadosBase);
  
  // Columna C: Si está vacía le ponemos 1.0, si no, la dejamos intacta (Aprendizaje)
  const rangoC = sheetPeso.getRange(2, 3, resultadosBase.length, 1);
  const valoresC = rangoC.getValues();
  const nuevosC = valoresC.map(f => (f[0] === "" || isNaN(f[0])) ? [1.0] : [f[0]]);
  rangoC.setValues(nuevosC);
  
  sheetPeso.getRange("B2:B11").setNumberFormat("0.00");
  sheetPeso.getRange("C2:C11").setNumberFormat("0.00");

  // PROMEDIO LIGA al final (Fila 12) para no molestar a la localía de la fila 10
  const filaProm = 12;
  sheetPeso.getRange(filaProm, 1).setValue("PROMEDIO LIGA").setFontWeight("bold").setBackground("#efefef");
  sheetPeso.getRange(filaProm, 2).setFormula(`=AVERAGE(B2:B9)`).setNumberFormat("0.00");
  sheetPeso.getRange(filaProm, 3).setFormula(`=AVERAGE(C2:C9)`).setNumberFormat("0.00%");
}

function calcularPearson(x, y) {
  const n = x.length;
  if (n === 0) return 0;
  const sumX = x.reduce((a, b) => a + b, 0), sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + (b * y[i]), 0);
  const sumX2 = x.reduce((a, b) => a + (b * b), 0), sumY2 = y.reduce((a, b) => a + (b * b), 0);
  const num = (n * sumXY) - (sumX * sumY);
  const den = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));
  return den === 0 ? 0 : num / den;
}

// ====================================================================================
// ⚡ FUNCION 4: POWER RATING (NORMALIZADO CON Z-SCORE)
// ====================================================================================

function calcularPowerRating(cantEquipos) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRank = ss.getSheetByName("RANKING Y TENDENCIAS");
  const sheetPeso = ss.getSheetByName("PESO_FACTORES");
  const sheetHist = ss.getSheetByName("HISTORIAL");
  const n = cantEquipos || (sheetRank.getLastRow() - 3);

  // 1. Carga de Pesos y Datos
  const datosPesos = sheetPeso.getRange("A2:C9").getValues();
  let pesosFinales = datosPesos.map(fila => (Math.abs(parseFloat(fila[1])) || 0.5) * (parseFloat(fila[2]) || 1.0));
  const rangoDatos = sheetRank.getRange(2, 1, n, 18); // Traemos desde la col A para tener nombres
  const valoresRank = rangoDatos.getValues();

  // 2. Obtener Rendimiento Real del Historial (Últimos 10 partidos por equipo)
  const dataHist = sheetHist.getDataRange().getValues();
  let balanceReal = {};
  dataHist.slice(1).forEach(f => {
    const loc = f[0]; const vis = f[1]; const realL = f[8]; const realV = f[9];
    if (realL !== "" && realL !== null) {
      const ganoLoc = parseFloat(realL) > parseFloat(realV);
      balanceReal[loc] = (balanceReal[loc] || 0) + (ganoLoc ? 1 : -1);
      balanceReal[vis] = (balanceReal[vis] || 0) + (ganoLoc ? -1 : 1);
    }
  });

  // 3. Normalización Z-Score
  const statsNormalizadas = [];
  for (let col = 6; col < 14; col++) { // Columnas G a N (stats de juego)
    const valoresCol = valoresRank.map(f => parseFloat(f[col]) || 0);
    const media = valoresCol.reduce((a, b) => a + b, 0) / n;
    const desviacion = Math.sqrt(valoresCol.reduce((a, b) => a + Math.pow(b - media, 2), 0) / n);
    statsNormalizadas.push({ media, desviacion: desviacion || 1 });
  }

  // 4. Cálculo del Rating con "Factor Inercia"
  const nuevosRatings = valoresRank.map(fila => {
    const nombreEq = fila[0];
    let scoreZ = 0;
    for (let j = 0; j < 8; j++) {
      let direccion = (j === 1 || j === 4 || j === 6 || j === 7) ? -1 : 1;
      let valorZ = (parseFloat(fila[j+6]) - statsNormalizadas[j].media) / statsNormalizadas[j].desviacion;
      scoreZ += valorZ * pesosFinales[j] * direccion;
    }
    
    // El Power Rating ahora suma el balance del historial (dividido para no romper la escala)
    const bonusInercia = (balanceReal[nombreEq] || 0) * 0.25;
    const netRating = parseFloat(fila[16]) || 0;
    return [scoreZ + (netRating / 10) + bonusInercia]; 
  });

  // 5. Volcado y Orden
  sheetRank.getRange(2, 18, n, 1).setValues(nuevosRatings).setNumberFormat("0.00").setFontWeight("bold");
  sheetRank.getRange(2, 1, n, 18).sort({column: 18, ascending: false});

  // Actualización Promedio Liga
  const filaProm = sheetRank.getRange("A:A").getValues().findIndex(r => r[0] === "PROMEDIO LIGA") + 1;
  if (filaProm > 0) sheetRank.getRange(filaProm, 18).setFormula(`=AVERAGE(R2:R${filaProm-2})`).setNumberFormat("0.00");

  aplicarReglasColorRobusto(sheetRank, n);
}

// ====================================================================================
// ⚡ FUNCION: EJECUTAR SIMULACIÓN (VERSIÓN FINAL OPTIMIZADA 70% ACIERTO)
// ====================================================================================

function configurarEstructuraSimulador() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetSim = ss.getSheetByName("SIMULADOR") || ss.insertSheet("SIMULADOR");
  const sheetRank = ss.getSheetByName("RANKING Y TENDENCIAS");

  if (!sheetRank) {
    SpreadsheetApp.getUi().alert("❌ Primero debés generar el Ranking (Paso 2).");
    return;
  }

  sheetSim.clear();
  sheetSim.getRange("A1:Z100").setDataValidation(null);

  const encabezados = [[
    "LOCAL", "CONFIDENCIA", "VISITANTE", "GANADOR PROBABLE", "FACTOR CLAVE", "TANTEADOR EST.", "JUSTIFICACIÓN TÉCNICA"
  ]];

  sheetSim.getRange(1, 1, 1, 7).setValues(encabezados)
    .setFontWeight("bold").setBackground("#444444").setFontColor("white")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");

  const datosColA = sheetRank.getRange("A:A").getValues();
  let numEquipos = 0;
  for (let i = 1; i < datosColA.length; i++) {
    if (datosColA[i][0] === "--- PROMEDIO LIGA ---" || datosColA[i][0] === "") {
      numEquipos = i - 1;
      break;
    }
  }

  const rangoNombres = sheetRank.getRange(2, 1, numEquipos, 1);
  const regla = SpreadsheetApp.newDataValidation().requireValueInRange(rangoNombres).setAllowInvalid(false).build();
 
  sheetSim.getRange("A2").setDataValidation(regla).setBackground("#e6f3ff");
  sheetSim.getRange("C2").setDataValidation(regla).setBackground("#ffe6e6");
  sheetSim.getRange("B2:F2").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheetSim.getRange("G2").setWrap(true).setHorizontalAlignment("left").setVerticalAlignment("top");

  sheetSim.setColumnWidth(1, 150);
  sheetSim.setColumnWidth(3, 150);
  sheetSim.setColumnWidth(6, 120);
  sheetSim.setColumnWidth(7, 450); // Un poco más ancho para el reporte

  sheetSim.activate();
}

function ejecutarSimulacion() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSim = ss.getSheetByName("SIMULADOR");
  const sheetDB = ss.getSheetByName("DB_PROCESADA");
  const sheetPeso = ss.getSheetByName("PESO_FACTORES");
  const sheetRank = ss.getSheetByName("RANKING Y TENDENCIAS");

  const eqLoc = sheetSim.getRange("A2").getValue();
  const eqVis = sheetSim.getRange("C2").getValue();

  if (!eqLoc || !eqVis || eqLoc === eqVis) return;

  const statsL = obtenerPromediosEquipo(eqLoc, sheetDB, "LOCAL", sheetRank);
  const statsV = obtenerPromediosEquipo(eqVis, sheetDB, "VISITANTE", sheetRank);
  
  if (!statsL || !statsV) return;

  // 1. CARGA DE PESOS (Incluyendo Fila 10)
  const datosPesos = sheetPeso.getRange("A2:C10").getValues();
  let pesos = {};
  let factorBaseLocal = 0.05;
  let aprendizajeLocal = 1.0;

  datosPesos.forEach(f => {
    if (f[0] === "LOCALIA") {
      factorBaseLocal = parseFloat(f[1]) || 0.05;
      aprendizajeLocal = parseFloat(f[2]) || 1.0;
    } else {
      pesos[f[0]] = (Math.abs(parseFloat(f[1])) || 0.5) * (parseFloat(f[2]) || 1.0);
    }
  });

  // AJUSTE CLAVE: Reducimos el multiplicador de localía para evitar el sesgo
  // Antes usábamos 0.75 para extraLoc, bajamos a 0.35 para dar más peso a la estadística táctica.
  const bonusLocaliaFinal = 1 + (factorBaseLocal * aprendizajeLocal) + (statsL.extraLoc * 0.35);

  // 2. DUELOS TÁCTICOS (Misma lógica 360)
  const nombresLargos = { "eFG%": "Eficiencia (eFG%)", "PP%": "Pérdidas (PP%)", "RO%": "Rebote Ofensivo", "RTL%": "Tiros Libres (RTL%)" };
  const duelos = [
    { id: "eFG%", idOpp: "eFG Opp%", atqL: statsL.efg, defV: statsV.efgO, atqV: statsV.efg, defL: statsL.efgO, inv: false },
    { id: "PP%", idOpp: "PP Opp%", atqL: statsL.pp, defV: statsV.ppO, atqV: statsV.pp, defL: statsL.ppO, inv: true },
    { id: "RO%", idOpp: "RO Opp%", atqL: statsL.ro, defV: statsV.roO, atqV: statsV.ro, defL: statsL.roO, inv: false },
    { id: "RTL%", idOpp: "RTL Opp%", atqL: statsL.rtl, defV: statsV.rtlO, atqV: statsV.rtl, defL: statsL.rtlO, inv: false }
  ];

  let diffAcumL = 0, diffAcumV = 0, sumaImpactoTotal = 0, influencias = [], desgLoc = "", desgVis = "";

  duelos.forEach(d => {
    let ventL = (d.atqL - d.defV) * (d.inv ? -1 : 1);
    let ventV = (d.atqV - d.defL) * (d.inv ? -1 : 1);
    let pesoDuelo = (pesos[d.id] + pesos[d.idOpp]) / 2;
    
    let impL = ventL * pesoDuelo * 100;
    let impV = ventV * pesoDuelo * 100;

    diffAcumL += impL; diffAcumV += impV;
    let absDuelo = Math.abs(impL) + Math.abs(impV);
    influencias.push({ nombre: nombresLargos[d.id], valor: absDuelo });
    sumaImpactoTotal += absDuelo;

    desgLoc += `${ventL >= 0 ? "✅" : "❌"} ${nombresLargos[d.id]}: ${(d.atqL*100).toFixed(1)}% vs Def ${(d.defV*100).toFixed(1)}%\n`;
    desgVis += `${ventV >= 0 ? "✅" : "❌"} ${nombresLargos[d.id]}: ${(d.atqV*100).toFixed(1)}% vs Def ${(d.defL*100).toFixed(1)}%\n`;
  });

  // 3. SCORE FINAL
  const playsColectivas = (statsL.plays + statsV.plays) / 2;
  const pppMedioL = (statsL.pppOff + statsV.pppDef) / 2;
  const pppMedioV = (statsV.pppOff + statsL.pppDef) / 2;

  // El bonus de localía se aplica AL FINAL del cálculo de puntos proyectados del local
  const scoreL = ((playsColectivas * pppMedioL) + (diffAcumL / 2)) * bonusLocaliaFinal;
  const scoreV = (playsColectivas * pppMedioV) + (diffAcumV / 2);
  
  const ganador = scoreL > scoreV ? eqLoc : eqVis;
  const margen = Math.abs(scoreL - scoreV);
  let confianza = Math.min(Math.max(50 + (margen * 2.8), 51), 94.8); 

  // 4. REPORTE Y VOLCADO
  influencias.sort((a, b) => b.valor - a.valor);
  let reporte = `🏀 ANÁLISIS INTEGRAL 360°: ${eqLoc} vs ${eqVis}\n🏠 Bonus Localía Aplicado: ${((bonusLocaliaFinal-1)*100).toFixed(1)}%\n`;
  reporte += `--------------------------------------------------\n📊 DESGLOSE DE INFLUENCIA:\n`;
  influencias.forEach(inf => {
    let pct = sumaImpactoTotal > 0 ? ((inf.valor / sumaImpactoTotal) * 100).toFixed(1) : 0;
    reporte += `• ${inf.nombre}: ${pct}%\n`;
  });
  reporte += `--------------------------------------------------\n⚔️ DUELOS TÁCTICOS:\n> Cuando ${eqLoc} Ataca:\n${desgLoc}\n> Cuando ${eqVis} Ataca:\n${desgVis}\n--------------------------------------------------\n🏆 GANADOR ESTIMADO: ${ganador}\n🎯 CONFIANZA: ${confianza.toFixed(1)}%\n📏 MARGEN: ${margen.toFixed(1)} pts.`;

  sheetSim.getRange("B2").setValue(confianza.toFixed(2) + "%");
  sheetSim.getRange("D2").setValue(ganador);
  sheetSim.getRange("E2").setValue(influencias[0].nombre);
  sheetSim.getRange("F2").setValue(Math.round(scoreL) + " - " + Math.round(scoreV));
  sheetSim.getRange("G2").setValue(reporte).setWrap(true);

  registrarEnHistorial({
    local: eqLoc, visitante: eqVis, ganadorPred: ganador, 
    confianza: confianza.toFixed(2), estLocal: Math.round(scoreL), 
    estVis: Math.round(scoreV), reporte: reporte, factor: influencias[0].nombre
  });
}

function obtenerPromediosEquipo(nombreEquipo, sheetDB, condicion, sheetRank) {
  const datos = sheetDB.getDataRange().getValues();
  const headers = datos[0];
  const filas = datos.slice(1);

  const idx = {
    equipo: headers.indexOf("EQUIPO"), cond: headers.indexOf("CONDICION"),
    plays: headers.indexOf("PLAYS"), pppO: headers.indexOf("PPP OF"), pppD: headers.indexOf("PPP DEF"),
    efg: headers.indexOf("eFG%"), pp: headers.indexOf("PP%"), rtl: headers.indexOf("RTL%"), ro: headers.indexOf("RO%"),
    efgO: headers.indexOf("eFG Opp%"), ppO: headers.indexOf("PP Opp%"), rtlO: headers.indexOf("RTL Opp%"), roO: headers.indexOf("RO Opp%"),
    pace: headers.indexOf("PACE"), peso: headers.indexOf("PESO_TEMPORAL")
  };

  // Filtrado con lógica de consistencia
  let filtrados = filas.filter(f => f[idx.equipo] === nombreEquipo && f[idx.cond] === condicion);
  
  // Si tiene pocos datos en esa condición (menos de 3 partidos), usamos toda su historia
  if (filtrados.length < 3) {
    filtrados = filas.filter(f => f[idx.equipo] === nombreEquipo);
  }
  
  if (filtrados.length === 0) return null;

  // Promediado Ponderado (usa el PESO_TEMPORAL de la Función 1)
  const promediarPonderado = (colIdx) => {
    let sumaPonderada = 0;
    let sumaPesos = 0;
    filtrados.forEach(fila => {
      const p = parseFloat(fila[idx.peso]) || 1.0;
      sumaPonderada += (parseFloat(fila[colIdx]) || 0) * p;
      sumaPesos += p;
    });
    return sumaPonderada / sumaPesos;
  };

  // Buscamos el factor de localía individual en el Ranking (Columna 19 / S)
  let extraLoc = 0;
  if (sheetRank) {
    const datosRank = sheetRank.getRange("A2:S" + sheetRank.getLastRow()).getValues();
    const filaEq = datosRank.find(r => r[0] === nombreEquipo);
    if (filaEq) extraLoc = parseFloat(filaEq[18]) || 0;
  }

  return {
    efg: promediarPonderado(idx.efg), pp: promediarPonderado(idx.pp), 
    ro: promediarPonderado(idx.ro), rtl: promediarPonderado(idx.rtl),
    efgO: promediarPonderado(idx.efgO), ppO: promediarPonderado(idx.ppO), 
    roO: promediarPonderado(idx.roO), rtlO: promediarPonderado(idx.rtlO),
    plays: promediarPonderado(idx.plays), pppOff: promediarPonderado(idx.pppO), 
    pppDef: promediarPonderado(idx.pppD), pace: promediarPonderado(idx.pace), 
    extraLoc: extraLoc
  };
}

function registrarEnHistorial(datos) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetHist = ss.getSheetByName("HISTORIAL") || ss.insertSheet("HISTORIAL");
  
  if (sheetHist.getLastRow() === 0) {
    const header = [["FECHA SIM", "LOCAL", "VISITANTE", "PREDICCIÓN", "CONF %", "EST. LOC", "EST. VIS", "FACTOR CLAVE", "REAL LOC", "REAL VIS", "DIF. SCORE", "ACIERTO", "JUSTIFICACIÓN TÉCNICA", "DUELOS TÁCTICOS"]];
    sheetHist.getRange(1, 1, 1, 14).setValues(header).setBackground("#444444").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  }

  // --- PROCESAMIENTO ESTÉTICO DEL REPORTE ---
  const reporte = datos.reporte;
  
  // 1. COLUMNA M: ANÁLISIS E INFLUENCIA
  // Extraemos desde el inicio hasta el primer separador (incluye Título y Localía) + el bloque de influencia
  let partes = reporte.split("--------------------------------------------------");
  let bloqueCabezal = partes[0].trim(); // "🏀 ANÁLISIS... 🏠 Bonus..."
  let bloqueInfluencia = "📊 INFLUENCIA:\n" + partes[1].replace("📊 DESGLOSE DE INFLUENCIA:", "").trim();
  
  const columnaJustificacion = bloqueCabezal + "\n\n" + bloqueInfluencia;

  // 2. COLUMNA N: DUELOS Y RESULTADO FINAL
  // Extraemos el bloque de duelos tácticos y el cierre del ganador
  let bloqueDuelos = "⚔️ DUELOS TÁCTICOS:" + partes[2].split("⚔️ DUELOS TÁCTICOS:")[1] || partes[2];
  let bloqueGanador = "\n--------------------------------------------------\n" + partes[3].trim(); 
  // Nota: Si partes[3] no existe por el formato del split, buscamos el final del reporte
  if (!partes[3]) {
     bloqueGanador = "\n--------------------------------------------------\n" + reporte.split("--------------------------------------------------").pop().trim();
  }

  const columnaDuelos = bloqueDuelos.trim() + "\n" + bloqueGanador;

  const fila = [
    new Date(), 
    datos.local, 
    datos.visitante, 
    datos.ganadorPred, 
    parseFloat(datos.confianza) / 100, 
    datos.estLocal, 
    datos.estVis, 
    datos.factor, 
    "", "", "", "", 
    columnaJustificacion, 
    columnaDuelos
  ];
  
  sheetHist.appendRow(fila);
  const uFila = sheetHist.getLastRow();
  
  // --- APLICACIÓN DE FORMATOS Y CENTRADO ---
  sheetHist.getRange(uFila, 1).setNumberFormat("dd/mm/yyyy HH:mm");
  sheetHist.getRange(uFila, 5).setNumberFormat("0.00%"); // Regla de memoria: 0.00%
  
  // 1. Alineación de Identificación (Columnas A a D: Fecha, Local, Vis, Predicción)
  // Las mantenemos a la izquierda o con alineación estándar para lectura rápida
  sheetHist.getRange(uFila, 1, 1, 4).setVerticalAlignment("middle");

  // 2. CENTRADO INTEGRAL (Columnas E a L)
  // Desde CONF % hasta ACIERTO, centramos todo para que destaque el dato numérico
  const rangoDatos = sheetHist.getRange(uFila, 5, 1, 8); 
  rangoDatos.setHorizontalAlignment("center")
             .setVerticalAlignment("middle")
             .setFontWeight("normal");

  // 3. Estilo para columnas técnicas (M y N)
  const rangoTecnico = sheetHist.getRange(uFila, 13, 1, 2);
  rangoTecnico.setWrap(true)
              .setVerticalAlignment("top") // Top para que el reporte empiece arriba
              .setHorizontalAlignment("left")
              .setFontSize(8)
              .setFontFamily("Consolas");

  // Ajuste de altura final para asegurar que se vea todo el reporte sin cortes
  sheetHist.setRowHeight(uFila, 180);
}

// --- FUNCIÓN 8: VALIDAR RESULTADOS (ACTUALIZADA CON GRÁFICO) ---
function validarResultadosHistorial() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetHist = ss.getSheetByName("HISTORIAL");
  if (!sheetHist) return;

  const data = sheetHist.getDataRange().getValues();
  let huboCambios = false;

  for (let i = 1; i < data.length; i++) {
    const fila = i + 1;
    const estLoc = parseFloat(data[i][5]); 
    const estVis = parseFloat(data[i][6]); 
    const realLoc = data[i][8]; 
    const realVis = data[i][9]; 
    
    // Si hay resultados reales y la columna K está vacía, validamos
    if (realLoc !== "" && realVis !== "" && (data[i][10] === "" || data[i][11] === "")) {
      const errorTotal = Math.abs(estLoc - realLoc) + Math.abs(estVis - realVis);
      const ganoPred = estLoc > estVis;
      const ganoReal = realLoc > realVis;
      const acierto = (ganoPred === ganoReal) ? "✅ SI" : "❌ NO";
      
      // Volcado de validación
      sheetHist.getRange(fila, 11).setValue(errorTotal).setNumberFormat("0.00"); 
      sheetHist.getRange(fila, 12).setValue(acierto);    
      sheetHist.getRange(fila, 12).setBackground((ganoPred === ganoReal) ? "#d9ead3" : "#f4cccc")
                                 .setFontColor((ganoPred === ganoReal) ? "#008647" : "#990000")
                                 .setFontWeight("bold");
      huboCambios = true;
    }
  }

  if (huboCambios) {
    // 1. Ejecuta el aprendizaje de pesos (Función 9 corregida abajo)
    retroalimentarSimulador(); 
    // 2. Actualiza el gráfico de evolución en la hoja de pesos
    actualizarGraficoEvolucion(); 
    // 3. Actualiza el Dashboard de métricas
    generarGraficoRendimiento();
    
    SpreadsheetApp.getUi().alert("✅ Historial Validado: El simulador acaba de aprender de estos resultados.");
  }
}

function actualizarGraficoEvolucion() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetHist = ss.getSheetByName("HISTORIAL");
  const sheetPeso = ss.getSheetByName("PESO_FACTORES");
  
  if (!sheetHist || !sheetPeso) return;
  
  const data = sheetHist.getDataRange().getValues();
  if (data.length < 2) return;

  // 1. EXTRACCIÓN Y LIMPIEZA DE DATOS
  let filasGrafico = [];
  for (let i = 1; i < data.length; i++) {
    let fecha = data[i][0];
    // Leemos la justificación técnica de la columna M (índice 12)
    let reporte = data[i][12] ? data[i][12].toString() : ""; 
    if (reporte === "" || !reporte.includes("%")) continue;

    const extraerPct = (clave) => {
      // Regex mejorada para capturar decimales correctamente
      const regex = new RegExp(clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ".*:\\s*(\\d+\\.?\\d*)%", "i");
      const match = reporte.match(regex);
      return match ? parseFloat(match[1]) : 0;
    };

    filasGrafico.push([
      fecha,
      extraerPct("Eficiencia"),
      extraerPct("Pérdidas"),
      extraerPct("Rebote Ofensivo"),
      extraerPct("Tiros Libres")
    ]);
  }

  if (filasGrafico.length > 0) {
    // 2. VOLCADO DE DATOS (Columnas E a I en PESO_FACTORES)
    // Limpiamos solo el área de datos para no borrar encabezados
    const ultimaFilaExistente = Math.max(sheetPeso.getLastRow(), 2);
    sheetPeso.getRange("E2:I" + ultimaFilaExistente).clearContent(); 
    
    sheetPeso.getRange(2, 5, filasGrafico.length, 5).setValues(filasGrafico);
    sheetPeso.getRange(2, 5, filasGrafico.length, 1).setNumberFormat("dd/mm HH:mm");
    
    // Formato 0.00 para los porcentajes de influencia en la tabla
    sheetPeso.getRange(2, 6, filasGrafico.length, 4).setNumberFormat("0.00");

    // 3. GESTIÓN DINÁMICA DEL GRÁFICO
    const rangoDatos = sheetPeso.getRange(1, 5, filasGrafico.length + 1, 5); 
    const graficos = sheetPeso.getCharts();
    let graficoExistente = null;

    // Buscamos si ya existe el gráfico comparando el título
    for (let g of graficos) {
      if (g.getOptions().get('title') === 'EVOLUCIÓN TÉCNICA DE FACTORES') {
        graficoExistente = g;
        break;
      }
    }

    let builder = graficoExistente ? graficoExistente.modify() : sheetPeso.newChart();

    builder
      .setChartType(Charts.ChartType.AREA)
      .clearRanges()
      .addRange(rangoDatos)
      .setOption('title', 'EVOLUCIÓN TÉCNICA DE FACTORES')
      .setOption('isStacked', true) // Esto hace que las áreas se apilen hasta el 100%
      .setOption('colors', ['#4285F4', '#DB4437', '#F4B400', '#0F9D58'])
      .setOption('legend', {position: 'bottom', textStyle: {fontSize: 10}})
      .setOption('hAxis', {title: 'Línea de Tiempo', textStyle: {fontSize: 9}, slantedText: true})
      .setOption('vAxis', {title: '% Influencia Total', minValue: 0, maxValue: 100})
      .setOption('areaOpacity', 0.7)
      .setOption('interpolateNulls', true);

    if (graficoExistente) {
      sheetPeso.updateChart(builder.build());
    } else {
      // Si es nuevo, lo ponemos a la derecha de la tabla de pesos (Columna K)
      builder.setPosition(1, 11, 5, 5);
      sheetPeso.insertChart(builder.build());
    }
  }
}

function gestionarGraficoAutomatizado() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetPeso = ss.getSheetByName("PESO_FACTORES");
  if (!sheetPeso) return;

  // 1. Identificar el rango de datos (Columna E a I)
  const ultimaFila = sheetPeso.getLastRow();
  if (ultimaFila < 2) return; // No hay datos para graficar
  const rangoDatos = sheetPeso.getRange(1, 5, ultimaFila, 5); // E1:I

  // 2. Buscar si ya existe un gráfico en esta hoja
  const graficos = sheetPeso.getCharts();
  let graficoExistente = null;
  
  for (let g of graficos) {
    // Si el gráfico está cerca de la columna E, asumimos que es el de evolución
    if (g.getContainerInfo().getAnchorColumn() >= 5) {
      graficoExistente = g;
      break;
    }
  }

  // 3. Crear o Actualizar el gráfico
  let builder = graficoExistente ? graficoExistente.modify() : sheetPeso.newChart();
  
  builder
    .setChartType(Charts.ChartType.AREA_STACKED) // Áreas apiladas para ver el 100% de impacto
    .addRange(rangoDatos)
    .setOption('title', 'EVOLUCIÓN TÉCNICA DE FACTORES')
    .setOption('legend', {position: 'bottom'})
    .setOption('hAxis', {title: 'Partidos / Fechas'})
    .setOption('vAxis', {title: '% de Influencia'})
    .setOption('colors', ['#4285F4', '#DB4437', '#F4B400', '#0F9D58']) // Colores sólidos
    .setOption('interpolateNulls', true);

  if (!graficoExistente) {
    // Si es nuevo, lo ubicamos en la celda A11 (debajo de la tabla de pesos)
    builder.setPosition(11, 1, 0, 0);
    sheetPeso.insertChart(builder.build());
  } else {
    // Si existe, actualizamos su definición con los nuevos rangos
    sheetPeso.updateChart(builder.build());
  }
}

/**
 * 🧠 RETROALIMENTACIÓN INTEGRAL 360° (VERSIÓN MASIVA 2026 - AUTOMATIZADA)
 * Procesa partidos, calibra pesos y actualiza Ranking/Power Rating automáticamente.
 */
function retroalimentarSimulador() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetHist = ss.getSheetByName("HISTORIAL");
  const sheetPeso = ss.getSheetByName("PESO_FACTORES");
  
  const dataHist = sheetHist.getDataRange().getValues();
  if (dataHist.length < 2) return; 

  // Cargamos los pesos (A2:C10) para recalibrar Localía y Factores
  const rangoPesos = sheetPeso.getRange("A2:C10"); 
  const valoresPesos = rangoPesos.getValues();
  const tasaAprendizaje = 0.025; 

  let cambiosRealizados = false;

  for (let i = 1; i < dataHist.length; i++) {
    const fila = dataHist[i];
    const realLoc = fila[8]; 
    const aciertoRaw = fila[11] ? fila[11].toString().toUpperCase() : "";
    const yaAprendido = fila[14]; 

    if (realLoc !== "" && realLoc !== null && yaAprendido !== "APRENDIDO") {
      const reporte = fila[12] ? fila[12].toString() : "";
      const aciertoLimpio = (aciertoRaw.includes("SI") || aciertoRaw === "SÍ") ? "SI" : "NO";

      valoresPesos.forEach((reg, idx) => {
        let nombreFactor = reg[0];
        let aprendizajeActual = parseFloat(reg[2]) || 1.0;

        if (nombreFactor === "LOCALIA") {
          // Ajuste agresivo para romper el sesgo: castigamos más de lo que premiamos
          let ajusteLoc = (aciertoLimpio === "SI") ? 0.005 : -0.025;
          valoresPesos[idx][2] = Math.max(0.5, Math.min(2.0, aprendizajeActual + ajusteLoc));
        } 
        else {
          let nombreBase = nombreFactor.replace(" Opp%", "");
          let nombreLargoBusqueda = mapearNombre(nombreBase);
          
          const regex = new RegExp(nombreLargoBusqueda.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ": (\\d+\\.\\d+)%", "i");
          const match = reporte.match(regex);

          if (match) {
            let impactoPartido = parseFloat(match[1]) / 100;
            let ajusteEfectivo = tasaAprendizaje * impactoPartido;
            
            aprendizajeActual = (aciertoLimpio === "SI") ? (aprendizajeActual + ajusteEfectivo) : (aprendizajeActual - ajusteEfectivo);
            valoresPesos[idx][2] = Math.max(0.3, Math.min(3.0, aprendizajeActual));
          }
        }
      });

      // Marcamos como APRENDIDO y centramos para mantener la prolijidad
      sheetHist.getRange(i + 1, 15).setValue("APRENDIDO")
        .setFontColor("#cccccc")
        .setHorizontalAlignment("center");
      cambiosRealizados = true;
    }
  }

  if (cambiosRealizados) {
    // 1. Guardamos los nuevos pesos
    sheetPeso.getRange(2, 3, valoresPesos.length, 1).setValues(valoresPesos.map(f => [f[2]]));
    
    // 2. 🔥 AUTOMATIZACIÓN INTEGRAL: Actualizamos el Ranking y Power Rating
    // Esto garantiza que la "Inercia de Victoria" se calcule con los datos recién aprendidos.
    console.log("Actualizando Ranking y Power Rating con inercia real...");
    generarRankingEquipos(); 
    
    SpreadsheetApp.getUi().alert("🚀 Proceso 360° Completado:\n1. Pesos recalibrados.\n2. Inercia de equipos actualizada.\n3. Power Rating reordenado.");
  } else {
    SpreadsheetApp.getUi().alert("ℹ️ No hay partidos nuevos para aprender en el HISTORIAL.");
  }
}

// Función auxiliar indispensable (debe estar en el script)
function mapearNombre(corto) {
  const diccionario = {
    "eFG%": "Eficiencia (eFG%)",
    "PP%": "Pérdidas (PP%)",
    "RO%": "Rebote Ofensivo",
    "RTL%": "Tiros Libres (RTL%)"
  };
  return diccionario[corto] || corto;
}

// Auxiliar para que el script sepa qué buscar en el reporte según la tabla de pesos
function mapearNombreLargoParaReporte(corto) {
  const dic = {
    "eFG%": "Eficiencia (eFG%)",
    "PP%": "Pérdidas (PP%)",
    "RO%": "Rebote Ofensivo",
    "RTL%": "Tiros Libres (RTL%)",
    "eFG Opp%": "Eficiencia (eFG%)",
    "PP Opp%": "Pérdidas (PP%)",
    "RO Opp%": "Rebote Ofensivo",
    "RTL Opp%": "Tiros Libres (RTL%)"
  };
  return dic[corto] || corto;
}

// Auxiliar para reconocer nombres largos vs cortos
const nombresLargosSimples = {
  "eFG%": "Eficiencia (eFG%)",
  "PP%": "Pérdidas (PP%)",
  "RO%": "Rebote Ofensivo",
  "RTL%": "Tiros Libres (RTL%)"
};

function obtenerCarpetaDestino() {
  const c = DriveApp.getFoldersByName(CONFIG.CARPETA_RAIZ).next();
  const t = c.getFoldersByName(CONFIG.TORNEO).next();
  return t.getFoldersByName(CONFIG.CATEGORIA).next();
}

function generarGraficoRendimiento() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetHist = ss.getSheetByName("HISTORIAL");
  let sheetDash = ss.getSheetByName("DASHBOARD_METRICAS") || ss.insertSheet("DASHBOARD_METRICAS");
  
  if (!sheetHist) return;

  const data = sheetHist.getDataRange().getValues();
  let puntosGrafico = [];
  let aciertosAcumulados = 0;
  let errorAcumuladoTotal = 0;
  let conteoValidados = 0;

  for (let i = 1; i < data.length; i++) {
    const fecha = data[i][0];
    const errorFila = parseFloat(data[i][10]); 
    const acierto = data[i][11]; 
    
    if (acierto !== "" && !isNaN(errorFila)) {
      conteoValidados++;
      if (acierto === "✅ SI") aciertosAcumulados++;
      errorAcumuladoTotal += errorFila;
      
      let tasaActual = (aciertosAcumulados / conteoValidados); // Guardamos como decimal para el %
      let errorPromedio = errorAcumuladoTotal / conteoValidados;
      
      puntosGrafico.push([fecha, tasaActual, errorPromedio]);
    }
  }

  if (puntosGrafico.length === 0) return;

  sheetDash.clear();
  const charts = sheetDash.getCharts();
  charts.forEach(c => sheetDash.removeChart(c));

  // Volcado de datos para el gráfico
  sheetDash.getRange(1, 1, 1, 3).setValues([["Fecha", "Tasa Acierto", "Error Score Prom."]]).setFontWeight("bold");
  sheetDash.getRange(2, 1, puntosGrafico.length, 3).setValues(puntosGrafico);
  
  // Aplicar formatos 0.00% y 0.00
  sheetDash.getRange(2, 2, puntosGrafico.length, 1).setNumberFormat("0.00%");
  sheetDash.getRange(2, 3, puntosGrafico.length, 1).setNumberFormat("0.00");

  // Crear gráfico de Doble Eje
  const chart = sheetDash.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(sheetDash.getRange(1, 1, puntosGrafico.length + 1, 3))
    .setPosition(2, 5, 0, 0)
    .setOption('title', 'EFICACIA PREDICTIVA Y ERROR DE SCORE')
    .setOption('series', {
      0: {targetAxisIndex: 0, color: '#4285F4', lineWidth: 3}, // Tasa Acierto
      1: {targetAxisIndex: 1, color: '#DB4437', lineWidth: 2, lineDashStyle: [2, 2]} // Error
    })
    .setOption('vAxes', {
      0: {title: 'Acierto (%)', format: '0%', minValue: 0, maxValue: 1},
      1: {title: 'Error (Pts)', format: '0.00'}
    })
    .setOption('width', 850).setOption('height', 400)
    .build();

  sheetDash.insertChart(chart);
  sheetDash.activate();
}

// ====================================================================================
// 🚀 FUNCIÓN: ACTUALIZAR ANÁLISIS EVOLUTIVO (MIRADA INTEGRAL 360°)
// ====================================================================================
function configurarPanelEvolutivo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetEv = ss.getSheetByName("ANALISIS_EVOLUTIVO") || ss.insertSheet("ANALISIS_EVOLUTIVO");
  const sheetDB = ss.getSheetByName("DB_PROCESADA");

  if (!sheetDB) return;

  // --- LIMPIEZA TOTAL DE RESIDUOS ---
  sheetEv.clear(); 
  sheetEv.getRange("A1:AZ1").setDataValidation(null); 
  sheetEv.clearFormats();

  // --- ESTILO DE LA HOJA ---
  const azulNoche = "#0d47a1"; 
  const blanco = "#ffffff";
  const negro = "#000000"; // Definimos negro para legibilidad absoluta
  sheetEv.setRowHeight(1, 40);

  // 1. SELECTORES PRINCIPALES (A-F)
  // Fondo azul para etiquetas, fondo clarito con texto negro para el input del usuario
  sheetEv.getRange("A1:F1").setBackground(azulNoche).setFontColor(blanco).setFontWeight("bold").setVerticalAlignment("middle");
  
  sheetEv.getRange("A1").setValue("🏀 EQUIPO:");
  sheetEv.getRange("C1").setValue("🏟️ COND:");
  sheetEv.getRange("E1").setValue("📅 ÚLTIMOS:");

  // Carga de Equipos
  const listaEquipos = [...new Set(sheetDB.getRange("C2:C" + sheetDB.getLastRow()).getValues().flat())].filter(String).sort();
  
  // Aplicamos fondo claro y TEXTO NEGRO a las celdas de entrada (B, D, F)
  const inputs = ["B1", "D1", "F1"];
  inputs.forEach(cell => {
    sheetEv.getRange(cell)
      .setBackground("#f0f4f8")
      .setFontColor(negro)
      .setFontWeight("normal")
      .setHorizontalAlignment("center");
  });

  sheetEv.getRange("B1").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(listaEquipos).build());
  sheetEv.getRange("D1").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["TODOS", "LOCAL", "VISITANTE"]).build());
  sheetEv.getRange("F1").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["5", "10", "15", "20"]).build());

  // 2. MÉTRICAS (Desde G en adelante)
  const metricas = [
    "POS", "PACE", "PLAYS", "PTS", "PTSopp", "RTNG OFF", "RTNG DEF", "NET RTNG", 
    "PPP OF", "PPP DEF", "NET PPP", "eFG%", "PP%", "RTL%", "RO%", 
    "eFG Opp%", "PP Opp%", "RTL Opp%", "RO Opp%"
  ];

  metricas.forEach((m, i) => {
    let col = 7 + (i * 2); 
    
    // Título de métrica (Fondo oscuro, texto blanco)
    sheetEv.getRange(1, col).setValue(m)
      .setBackground("#263238")
      .setFontColor(blanco)
      .setFontSize(8)
      .setHorizontalAlignment("right")
      .setVerticalAlignment("middle");
      
    // Checkbox
    sheetEv.getRange(1, col + 1).insertCheckboxes()
      .setBackground("#263238")
      .setFontColor(blanco);
  });

  sheetEv.setFrozenRows(1);
  sheetEv.getRange("A1:AZ1").setBorder(null, null, null, null, true, null, "#ffffff", SpreadsheetApp.BorderStyle.SOLID);
}

function actualizarAnalisisEvolutivo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetEv = ss.getSheetByName("ANALISIS_EVOLUTIVO");
  const sheetDB = ss.getSheetByName("DB_PROCESADA");

  const eqSel = sheetEv.getRange("B1").getValue();
  const condSel = sheetEv.getRange("D1").getValue() || "TODOS";
  const ventana = parseInt(sheetEv.getRange("F1").getValue()) || 5;

  if (!eqSel || !sheetDB) return;

  // --- 1. CONEXIÓN Y CÁLCULO DE MEDIAS DE LIGA (BASE DATOS E) ---
  let dataBaseE, headersBaseE, mediasLigaE = {};
  try {
    const archivos = DriveApp.getFilesByName("CONFERENCIA NORTE - APERTURA");
    if (archivos.hasNext()) {
      const ssMadre = SpreadsheetApp.open(archivos.next());
      const hojaBDE = ssMadre.getSheetByName("Base Datos E");
      dataBaseE = hojaBDE.getDataRange().getValues();
      headersBaseE = dataBaseE[0];
      
      ["T1%", "T2%", "T3%"].forEach(pct => {
        let idx = headersBaseE.indexOf(pct);
        if (idx !== -1) {
          let valores = dataBaseE.slice(1).map(r => r[idx]).filter(v => !isNaN(v) && v !== "");
          mediasLigaE[pct] = valores.reduce((a, b) => a + b, 0) / (valores.length || 1);
        }
      });
    }
  } catch (e) { console.log("Aviso: Falló conexión Base E."); }

  const dataDB = sheetDB.getDataRange().getValues();
  const headersDB = dataDB[0];

  let metricasSel = [];
  for (let c = 7; c <= 45; c += 2) {
    if (sheetEv.getRange(1, c + 1).getValue() === true) {
      metricasSel.push(sheetEv.getRange(1, c).getValue());
    }
  }
  if (metricasSel.length === 0) return;

  let encabezados = ["FECHA", "PARTIDO", "COND", "RES"];
  metricasSel.forEach(m => encabezados.push(m, "vs LIGA"));

  let historial = dataDB.slice(1).filter(f => f[2] === eqSel && (condSel === "TODOS" || f[4] === condSel))
                        .sort((a, b) => new Date(b[0]) - new Date(a[0]))
                        .slice(0, ventana);

  if (historial.length === 0) return;

  let datosG = historial.filter(f => f[5] === "GANADO");
  let datosP = historial.filter(f => f[5] === "PERDIDO");

  let sumasDiffG = {}, sumasDiffP = {}, sumasTotales = {};
  let sumasTirosG = { "T1%": 0, "T2%": 0, "T3%": 0, "count": 0 };
  let sumasTirosP = { "T1%": 0, "T2%": 0, "T3%": 0, "count": 0 };
  let filaProm = ["PROMEDIO", "-", "-", "-"];

  const filas = historial.map(f => {
    let fila = [f[0], f[1], f[4], f[5]]; 
    let esGanado = f[5] === "GANADO";
    let fechaFmt = Utilities.formatDate(new Date(f[0]), Session.getScriptTimeZone(), "dd/MM/yyyy");

    metricasSel.forEach(m => {
      let idx = headersDB.indexOf(m);
      let val = f[idx] || 0;
      let valoresMetrica = dataDB.slice(1).map(r => r[idx]).filter(v => !isNaN(v) && v !== "");
      let promLiga = valoresMetrica.reduce((a,b) => a+b, 0) / (valoresMetrica.length || 1);
      let diff = val - promLiga;
      fila.push(val, diff);
      sumasTotales[m] = (sumasTotales[m] || 0) + diff;
      if (esGanado) sumasDiffG[m] = (sumasDiffG[m] || 0) + diff;
      else sumasDiffP[m] = (sumasDiffP[m] || 0) + diff;
    });

    if (dataBaseE) {
      let filaE = dataBaseE.find(r => {
        let fE = r[0] instanceof Date ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), "dd/MM/yyyy") : r[0];
        return fE === fechaFmt && r[2] === eqSel;
      });
      if (filaE) {
        let objS = esGanado ? sumasTirosG : sumasTirosP;
        ["T1%", "T2%", "T3%"].forEach(pct => {
          let idxE = headersBaseE.indexOf(pct);
          if (idxE !== -1) objS[pct] += (parseFloat(filaE[idxE]) || 0);
        });
        objS.count++;
      }
    }
    return fila;
  });

  const lastRowData = 3 + filas.length;

  // --- 2. FUNCIÓN DE ANÁLISIS TÉCNICO PROFESIONAL (ESTANDARIZADA AST-PP CON RECOMENDACIONES) ---
  function generarInforme(subset, sumas, sumasT, titulo) {
    if (subset.length === 0) return `📋 ${titulo}: Sin registros suficientes para análisis dinámico.`;
    
    let n = subset.length, nT = sumasT.count || 1;
    let net = (sumas["NET RTNG"] || 0) / n; 
    let ro = (sumas["RO%"] || 0) / n;
    let efg = (sumas["eFG%"] || 0) / n; 
    let off = (sumas["RTNG OFF"] || 0) / n; 
    let def = (sumas["RTNG DEF"] || 0) / n;
    let astPP = (sumas["AST-PP"] || 0) / n; 

    let t1 = (sumasT["T1%"] / nT); let diffT1 = t1 - (mediasLigaE["T1%"] || 0);
    let t2 = (sumasT["T2%"] / nT); let diffT2 = t2 - (mediasLigaE["T2%"] || 0);
    let t3 = (sumasT["T3%"] / nT); let diffT3 = t3 - (mediasLigaE["T3%"] || 0);

    let texto = `📋 ${titulo} (${n} part.)\n\n`;

    // --- PUNTOS DE FUGA ---
    texto += `🚩 PUNTOS DE FUGA: `;
    let fugas = [];
    if (off < 0) fugas.push(`Baja producción ofensiva: Se anotaron ${Math.abs(off).toFixed(2)} pts menos que la media (Rating Off).`);
    if (def > 0) fugas.push(`Permisividad defensiva: El rival anotó ${def.toFixed(2)} pts sobre la media (Rating Def).`);
    if (astPP < 0) fugas.push(`Déficit en la circulación: El ratio AST-PP estuvo ${Math.abs(astPP).toFixed(2)} pts bajo la media.`);
    
    if (efg < 0) {
      let debilidad = [];
      if (diffT2 < 0) debilidad.push(`T2 al ${(t2*100).toFixed(1)}% (${(diffT2*100).toFixed(1)}% vs Liga)`);
      if (diffT3 < 0) debilidad.push(`T3 al ${(t3*100).toFixed(1)}% (${(diffT3*100).toFixed(1)}% vs Liga)`);
      fugas.push(`Déficit en eFG%: El rendimiento estuvo ${(Math.abs(efg)*100).toFixed(2)}% bajo la eficiencia esperada por ${debilidad.join(" y ") || "selección de tiro"}.`);
    }
    texto += fugas.length > 0 ? fugas.join(" ") : "Rendimiento alineado o superior a la media de la liga.";
    texto += `\n\n`;

    // --- VALORES DE IDENTIDAD ---
    texto += `✅ VALORES DE IDENTIDAD: `;
    let identidad = [];
    if (ro > 0) identidad.push(`Control del cristal: El equipo capturó un ${(ro*100).toFixed(2)}% más de rebotes ofensivos que la media.`);
    if (net > 0) identidad.push(`Balanza de eficiencia positiva: Net Rating de +${net.toFixed(2)} puntos.`);
    if (astPP > 0) identidad.push(`Fluidez colectiva: El ratio AST-PP fue de +${astPP.toFixed(2)} sobre la media.`);
    if (efg > 0) identidad.push(`Alta efectividad: Rendimiento de tiro ${(efg*100).toFixed(2)}% superior al promedio.`);
    texto += identidad.length > 0 ? identidad.join(" ") : "No se registran indicadores de superioridad estadística marcada.";
    texto += `\n\n`;

    // --- LÍNEA DE TIRO VS LIGA ---
    texto += `📊 LÍNEA DE TIRO VS LIGA: T1: ${(t1*100).toFixed(1)}% (${(diffT1*100)>=0?"+":""}${(diffT1*100).toFixed(1)}%) | T2: ${(t2*100).toFixed(1)}% (${(diffT2*100)>=0?"+":""}${(diffT2*100).toFixed(1)}%) | T3: ${(t3*100).toFixed(1)}% (${(diffT3*100)>=0?"+":""}${(diffT3*100).toFixed(1)}%).\n\n`;

    // --- OBJETIVOS TÁCTICOS Y RECOMENDACIONES ---
    texto += `🎯 OBJETIVOS TÁCTICOS (Foco en:):\n`;
    
    if (net < 0) {
      texto += `• Equilibrar la balanza de eficiencia: Corregir el desbalance entre la producción propia y la facilidad anotadora del rival.\n`;
    }
    
    if (def > 0) {
      texto += `• Reducir el Rating Defensivo: Mejorar el balance defensivo, el box-out o la defensa del 1vs1 para obligar al rival a tomar tiros de bajo porcentaje o forzar pérdidas.\n`;
    }
    
    if (efg < 0) {
      texto += `• Optimizar la calidad de los tiros (eFG%): Revisar si tomamos bandejas/tiros cortos o lanzamientos de media distancia punteados (ineficientes). Reemplazar tiros de "baja calidad" (largos de 2 o apurados) por tiros de "alta calidad" (pintura o triples pies firmes).\n`;
    }
    
    // --- ESTA ES LA PARTE QUE FALTABA ---
    if (astPP < 0) {
      texto += `• Estabilizar el Ratio AST-PP: Priorizar el pase extra y evitar riesgos innecesarios en transición. Mejorar la lectura de las ventajas para reducir pérdidas no forzadas.\n`;
    }

    if (net >= 0 && def <= 0 && efg >= 0 && astPP >= 0) {
      texto += `• Sostener niveles actuales: Mantener la disciplina táctica y la intensidad en los rubros donde el equipo hoy es superior.\n`;
    }
    
    return texto;
  }

  let vozG = generarInforme(datosG, sumasDiffG, sumasTirosG, "ANÁLISIS: PARTIDOS GANADOS");
  let vozP = generarInforme(datosP, sumasDiffP, sumasTirosP, "ANÁLISIS: PARTIDOS PERDIDOS");

  // --- 3. RENDERIZADO, ESTÉTICA Y FORMATOS (0.00 Y 0.00%) ---
  let resumenDescriptivo = `📊 RESUMEN TÉCNICO (${eqSel}):\n`;
  metricasSel.forEach((m, i) => {
    let avgDiff = sumasTotales[m] / filas.length;
    let avgData = filas.map(f => f[4 + (i * 2)]).reduce((a,b) => a+b, 0) / (filas.length || 1);
    filaProm.push(avgData, avgDiff);
    let bueno = (m.includes("Opp") || m.includes("DEF") || m === "PTSopp") ? avgDiff < 0 : avgDiff > 0;
    resumenDescriptivo += `${bueno ? "🟢" : "🔴"} ${m}: ${avgDiff > 0 ? "+" : ""}${m.includes("%") ? (avgDiff * 100).toFixed(2) + "%" : avgDiff.toFixed(2)} vs Liga.\n`;
  });

  sheetEv.getRange("A2:AZ1000").clearContent().clearFormat();
  sheetEv.getRange(3, 1, 1, encabezados.length).setValues([encabezados]).setBackground("#263238").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  sheetEv.getRange(4, 1, filas.length, encabezados.length).setValues(filas);
  sheetEv.getRange(lastRowData + 1, 1, 1, encabezados.length).setValues([filaProm]).setBackground("#cfd8dc").setFontWeight("bold");

  encabezados.forEach((h, i) => {
    let colRange = sheetEv.getRange(4, i + 1, filas.length + 1, 1);
    if (h === "vs LIGA") {
      colRange.setNumberFormat("0.00");
      let metrica = encabezados[i-1];
      let colors = colRange.getValues().map(v => {
        if (v[0] === "-" || v[0] === "" || isNaN(v[0])) return [null];
        let bueno = (metrica.includes("Opp") || metrica.includes("DEF") || metrica === "PTSopp") ? v[0] < 0 : v[0] > 0;
        return [bueno ? "#e8f5e9" : "#ffcdd2"];
      });
      colRange.setBackgrounds(colors);
    } else if (h.includes("%") || h === "eFG%" || h === "RO%") {
      colRange.setNumberFormat("0.00%");
    } else if (i >= 4) {
      colRange.setNumberFormat("0.00");
    }
  });

  let colCoach = encabezados.length - 4;
  sheetEv.getRange(lastRowData + 3, 1, 28, 4).merge().setValue(resumenDescriptivo).setVerticalAlignment("top").setWrap(true).setBackground("#f8f9fa").setBorder(true, true, true, true, null, null);
  sheetEv.getRange(lastRowData + 3, 5, 14, colCoach).merge().setValue(vozG).setVerticalAlignment("top").setWrap(true).setBackground("#e8f5e9").setBorder(true, true, true, true, null, null);
  sheetEv.getRange(lastRowData + 17, 5, 14, colCoach).merge().setValue(vozP).setVerticalAlignment("top").setWrap(true).setBackground("#ffebee").setBorder(true, true, true, true, null, null);
  
  sheetEv.getRange(4, 1, filas.length + 1, 1).setNumberFormat("dd/mm/yyyy").setHorizontalAlignment("center");
}

// ====================================================================================
// 🚀 ANÁLISIS JUGADORES - VERSIÓN ELITE (21 MÉTRICAS + DESVIACIÓN)
// ====================================================================================

function actualizarListaJugadores(e) {
  if (!e) return;
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== "ANALISIS_JUGADORES") return;

  if (range.getA1Notation() === "B1") {
    const equipoSel = range.getValue();
    sheet.getRange("B2").clearContent().clearDataValidations();
    if (!equipoSel) return;

    try {
      const iteradorRaiz = DriveApp.getFoldersByName(CONFIG.CARPETA_RAIZ);
      const carpetaMadre = iteradorRaiz.next().getFoldersByName(CONFIG.TORNEO).next().getFoldersByName(CONFIG.CATEGORIA).next().getFoldersByName(CONFIG.SUB_CARPETA_MADRE).next();
      const archivos = carpetaMadre.getFilesByName(CONFIG.NOMBRE_ARCHIVO_MADRE);
      
      if (archivos.hasNext()) {
        const ssMadre = SpreadsheetApp.open(archivos.next());
        const dataJ = ssMadre.getSheetByName(CONFIG.HOJA_JUGADORES || "Base Datos J").getDataRange().getValues();
        const headersJ = dataJ[0];
        const idxEq = headersJ.indexOf("EQUIPO");
        const idxJug = headersJ.indexOf("NOMBRES");

        const unicos = [...new Set(dataJ.slice(1).filter(f => f[idxEq] === equipoSel).map(f => f[idxJug]))].filter(String).sort();
        if (unicos.length > 0) {
          sheet.getRange("B2").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(unicos).build());
        }
      }
    } catch (err) { SpreadsheetApp.getActive().toast("Error ruta: " + err.message); }
  }

  if (range.getA1Notation() === "B2" && range.getValue() !== "") ejecutarAnalisisCompleto();
}

function inicializarHojaAnalisis() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("ANALISIS_JUGADORES");
  if (!sheet) sheet = ss.insertSheet("ANALISIS_JUGADORES");
  
  configurarEstructuraVisual(sheet);
  SpreadsheetApp.getUi().alert("✅ Estructura 360 configurada y lista.");
}

function configurarEstructuraVisual(sheet) {
  if (!sheet) return; 
  sheet.clear(); 
  sheet.getDataRange().clearDataValidations();

  // 1. PANEL DE CONTROL
  sheet.getRange("A1:H2").setBackground("#f1f3f4").setVerticalAlignment("middle");
  sheet.getRange("A1").setValue("EQUIPO:").setFontWeight("bold");
  sheet.getRange("C1").setValue("VENTANA:").setFontWeight("bold");
  sheet.getRange("E1").setValue("CONDICIÓN:").setFontWeight("bold");
  sheet.getRange("A2").setValue("JUGADOR:").setFontWeight("bold");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbSheet = ss.getSheetByName(CONFIG.HOJA_DESTINO);
  if (dbSheet) {
    const dataDB = dbSheet.getDataRange().getValues();
    const listaEquipos = [...new Set(dataDB.slice(1).map(f => f[2]).filter(String))].sort();
    if (listaEquipos.length > 0) {
      sheet.getRange("B1").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(listaEquipos).build());
    }
  }

  sheet.getRange("D1").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["3", "5", "10", "15", "20"]).build()).setValue("5");
  sheet.getRange("F1").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["TODOS", "LOCAL", "VISITANTE"]).build()).setValue("TODOS");

  // 2. TABLA RENDIMIENTO (8 columnas corregidas)
  const headers = ["MÉTRICA", "PROM JUG", "MÍN (PISO)", "MÁX (TECHO)", "vs EQ", "vs LIGA", "DESV (±)", "REGULARIDAD"];
  sheet.getRange(4, 1, 1, 8).setValues([headers]).setBackground("#1a237e").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  
  // 3. INFORME ESTRATÉGICO
  sheet.getRange("J4").setValue("🗣️ INFORME ESTRATÉGICO").setBackground("#bf360c").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange("J5:N25").merge().setBackground("#fafafa").setBorder(true, true, true, true, null, null).setWrap(true).setVerticalAlignment("top");
  
  sheet.setColumnWidth(1, 110); sheet.setColumnWidth(7, 90); sheet.setColumnWidth(8, 130); 
  sheet.setColumnWidth(9, 30);  sheet.setColumnWidth(10, 550);
}

/**
 * 🚀 SÍNTESIS INTEGRAL MULTIPERFIL - VERSIÓN JERARQUÍA Y PERFIL 2026
 */
function obtenerSintesisPerfil(dataI) {
  const ELITE = 1.15;      
  const d = (m) => dataI[m] || { val: 0, tipoL: 0, reg: "N/A" };
  const perfiles = [];
  const volT3 = d("T3I").val;
  const volRO = d("RO").val;
  const valoracion = d("VAL").val;
  const plays = d("PLAYS").val;

  // --- BLOQUE A: IDENTIFICACIÓN DE PERFIL TÉCNICO ---

  // 1. TERMINADOR DE ÉLITE 🎯
  if (plays > d("PLAYS").tipoL && d("eFG%").val > d("eFG%").tipoL * ELITE && d("PPP").val > 1.05) {
    perfiles.push({ tag: "TERMINADOR DE ÉLITE 🎯", valor: `Eficiencia superior (${(d("eFG%").val * 100).toFixed(1)}% eFG).`, limite: `Punto de Fuga: Puede estancar la fluidez si se obsesiona con el aro.`, conclusion: "Capaz de cargar con el peso ofensivo." });
  }

  // 2. GENERADOR 🧠
  if (d("AST-PP").val > 1.40) {
    perfiles.push({ tag: "GENERADOR 🧠", valor: `Visión de élite (Ratio AST-PP: ${d("AST-PP").val.toFixed(2)}).`, limite: `Punto de Fuga: Sensible a defensas de negación (Denial).`, conclusion: "Director que potencia a sus compañeros." });
  }

  // 3. PUNTAL EN LA PINTURA 🏰
  if ((d("RO").val + d("RD").val) > (d("RO").tipoL + d("RD").tipoL) * 1.20) {
    perfiles.push({ tag: "PUNTAL EN LA PINTURA 🏰", valor: `Dominio del cristal (${(d("RO").val + d("RD").val).toFixed(2)} rebotes).`, limite: `Punto de Fuga: Movilidad limitada en el perímetro.`, conclusion: "Garante de protección y segundas chances." });
  }

  // 4. AMENAZA PERIMETRAL REAL 🎯
  if (volT3 > 3.0 && d("T3%").val > 0.34) {
    perfiles.push({ tag: "AMENAZA PERIMETRAL REAL 🎯", valor: `${volT3.toFixed(1)} triples con ${(d("T3%").val * 100).toFixed(1)}% de acierto.`, limite: `Punto de Fuga: Unidimensional si le quitan el Catch & Shoot.`, conclusion: "Genera spacing real." });
  }

  // 5. ESPECIALISTA DEFENSIVO 🧤
  if (d("RPP").val > d("RPP").tipoL * 1.30) {
    perfiles.push({ tag: "ESPECIALISTA DEFENSIVO 🧤", valor: `Alto volumen de recuperos (${d("RPP").val.toFixed(2)}).`, limite: `Punto de Fuga: Generalmente limitado en creación ofensiva.`, conclusion: "Encargado de anular al generador rival." });
  }

  // 6. BUSCADOR DE CONTACTO 📏
  if (d("PT1%").val > 0.25 && d("T1%").val > 0.80) {
    perfiles.push({ tag: "BUSCADOR DE CONTACTO 📏", valor: `Agresividad (Peso en TL: ${(d("PT1%").val * 100).toFixed(0)}%).`, limite: `Depende de la permisividad arbitral.`, conclusion: "Pone al rival en penalización temprano." });
  }

  // --- BLOQUE B: DETERMINACIÓN DE JERARQUÍA (EL ADN DEL JUGADOR) ---

  let jerarquia = "";
  const minutosElite = d("MIN").val > 28; // Umbral de jugador titular pesado

  // 7. JUGADOR FRANQUICIA ⭐ (Líder absoluto)
  if (plays > d("PLAYS").tipoL * 1.20 && valoracion > 140 && minutosElite) {
    perfiles.unshift({ 
      tag: "JUGADOR FRANQUICIA ⭐", 
      valor: "Eje central del equipo. Todo el sistema orbita sobre su producción.", 
      limite: "Alta dependencia; su fatiga o bache de tiro paraliza al equipo.", 
      conclusion: "Innegociable en el esquema titular." 
    });
  } 
  // 8. REFERENTE OFENSIVO / SEGUNDA ESPADA ⚔️ (Caso Stehli: mucho uso, eficiencia justa)
  else if (plays > d("PLAYS").tipoL * 1.10 || (minutosElite && plays > d("PLAYS").tipoL)) {
    perfiles.unshift({ 
      tag: "REFERENTE OFENSIVO ⚔️", 
      valor: `Alto volumen de decisiones (${plays.toFixed(2)} PLAYS) y presencia extendida.`, 
      limite: "Su rentabilidad (PPP) puede oscilar bajo presión defensiva.", 
      conclusion: "Principal foco de atención para el scouting rival." 
    });
  }
  // 9. PIEZA DE QUINTETO TITULAR 🧱
  else if (minutosElite && perfiles.length > 0) {
    perfiles.unshift({ 
      tag: "PIEZA DE QUINTETO TITULAR 🧱", 
      valor: "Sostiene el nivel de competencia durante la mayor parte del juego.", 
      limite: "Menor capacidad de generar ventajas individuales que las espadas.", 
      conclusion: "Garante de la estabilidad táctica del equipo." 
    });
  }
  // 10. ESPECIALISTA DE ROL 🛠️
  else if (perfiles.length > 0 && d("MIN").val > d("MIN").tipoL * 0.4) {
    perfiles.unshift({ 
      tag: "ESPECIALISTA DE ROL 🛠️", 
      valor: "Ejecutor de tareas específicas (Tiro, Defensa o Rebote).", 
      limite: "Producción condicionada a la generación de juego de terceros.", 
      conclusion: "El complemento ideal para potenciar a los referentes." 
    });
  }

  return perfiles;
}

/**
 * 🚀 ANALISIS INTEGRAL - VERSIÓN FINAL OMNI (CORRECCIÓN DE VOLUMEN + ESTRUCTURA 360)
 */
function ejecutarAnalisisCompleto() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetJug = ss.getSheetByName("ANALISIS_JUGADORES");
  const equipoSel = sheetJug.getRange("B1").getValue();
  const jugSel = sheetJug.getRange("B2").getValue();
  const ventana = parseInt(sheetJug.getRange("D1").getValue()) || 5;

  if (!equipoSel || !jugSel) return;

  // --- CONFIGURACIÓN DE UMBRALES DE AMENAZA (Volumen Mínimo) ---
  const UMBRAL = {
    "T3%": 2.5,   // Mínimo de intentos de 3 para no ser "Debajo"
    "T2%": 4.0,   // Mínimo de intentos de 2
    "T1%": 2.5,   // Mínimo de libres para validar efectividad
    "eFG%": 6.0,  // Mínimo de PLAYS para validar eficiencia
    "MIN": 15.0   // Minutos para considerar rol de rotación activa
  };

  try {
    const iteradorRaiz = DriveApp.getFoldersByName(CONFIG.CARPETA_RAIZ);
    const carpetaMadre = iteradorRaiz.next().getFoldersByName(CONFIG.TORNEO).next().getFoldersByName(CONFIG.CATEGORIA).next().getFoldersByName(CONFIG.SUB_CARPETA_MADRE).next();
    const archivos = carpetaMadre.getFilesByName(CONFIG.NOMBRE_ARCHIVO_MADRE);
    
    if (archivos.hasNext()) {
      const ssMadre = SpreadsheetApp.open(archivos.next());
      const dataJ = ssMadre.getSheetByName(CONFIG.HOJA_JUGADORES || "Base Datos J").getDataRange().getValues();
      const headersJ = dataJ[0];
      
      const idxEq = headersJ.indexOf("EQUIPO");
      const idxJug = headersJ.indexOf("NOMBRES");
      const idxMin = headersJ.indexOf("MIN");

      const baseLigaReal = dataJ.slice(1).filter(f => (parseFloat(String(f[idxMin]).replace(',','.')) || 0) > 0);
      const baseEquipoReal = baseLigaReal.filter(f => f[idxEq] === equipoSel);
      
      let historialJugador = baseEquipoReal
        .filter(f => f[idxJug] === jugSel)
        .sort((a, b) => new Date(b[0]) - new Date(a[0])) 
        .slice(0, ventana);

      const cantPartidos = historialJugador.length;
      const metricas = [
        "MIN", "PLAYS", "PTS", "PPP", "eFG%", "TS%", "RTL%", "PT2%", "PT3%", "PT1%", "PePP%", 
        "PPT2", "T2%", "PPT3", "T3%", "PPT1", "T1%", "TC%", "RD", "RO", "AST-PP", 
        "T3I", "T3C", "T2I", "T2C", "T1I", "T1C", "TCI", "TCC", "AST", "PP", "PR"
      ];

      let dI = {}; 

      // 1. PROCESAMIENTO DE DATOS
      metricas.forEach(m => {
        let idx = headersJ.indexOf(m);
        if (idx === -1) return;
        let valoresJ = historialJugador.map(f => {
          let v = f[idx];
          return (typeof v === 'number') ? v : parseFloat(String(v).replace(',', '.')) || 0;
        });
        
        let promJ = valoresJ.reduce((a, b) => a + b, 0) / (valoresJ.length || 1);
        let promE = _calcularMediana(baseEquipoReal.map(f => {
          let v = f[idx];
          return (typeof v === 'number') ? v : parseFloat(String(v).replace(',', '.')) || 0;
        }));
        let promL = _calcularMediana(baseLigaReal.map(f => {
          let v = f[idx];
          return (typeof v === 'number') ? v : parseFloat(String(v).replace(',', '.')) || 0;
        }));

        let desvJ = Math.sqrt(valoresJ.map(x => Math.pow(x - promJ, 2)).reduce((a, b) => a + b, 0) / (valoresJ.length || 1));
        let cvJ = promJ !== 0 ? desvJ / promJ : 0;
        let regLabel = cvJ < 0.15 ? "ALTA ✅" : (cvJ < 0.35 ? "MEDIA ⚠️" : "BAJA 🚨");

        dI[m] = { val: promJ, tipoE: promE, tipoL: promL, reg: regLabel, min: Math.min(...valoresJ), max: Math.max(...valoresJ), desv: desvJ };
      });

      // 2. CÁLCULOS DE PRECISIÓN
      const r = (m) => dI[m] ? dI[m].val : 0;
      const denPT = r("T2I") + r("T3I") + (0.44 * r("T1I")) + r("PP"); 
      const denTS = (2 * (r("TCI") + (0.44 * r("T1I"))));

      if (dI["eFG%"]) dI["eFG%"].val = r("TCI") > 0 ? (r("TCC") + (r("T3C") * 0.5)) / r("TCI") : 0;
      if (dI["TS%"])  dI["TS%"].val  = denTS > 0 ? r("PTS") / denTS : 0;
      if (dI["RTL%"]) dI["RTL%"].val = r("TCI") > 0 ? r("T1C") / r("TCI") : 0;
      if (dI["PPP"])  dI["PPP"].val  = r("PLAYS") > 0 ? r("PTS") / r("PLAYS") : 0;
      if (dI["PT2%"]) dI["PT2%"].val = denPT > 0 ? r("T2I") / denPT : 0;
      if (dI["PT3%"]) dI["PT3%"].val = denPT > 0 ? r("T3I") / denPT : 0;
      if (dI["PT1%"]) dI["PT1%"].val = denPT > 0 ? (0.44 * r("T1I")) / denPT : 0;
      if (dI["PePP%"]) dI["PePP%"].val = denPT > 0 ? r("PP") / denPT : 0;

      const d = (m) => dI[m] || { val: 0, tipoE: 0, tipoL: 0, reg: "N/A" };

      // ✅ FUNCIÓN getS RE-EVOLUCIONADA (Cruza Efectividad con volumen de intentos)
      const getS = (val, ref, metrica, volActual = 99) => {
        if (UMBRAL[metrica] && volActual < UMBRAL[metrica]) return "DEBAJO 📉";
        if (val > ref * 1.15) return "ÉLITE 💎";
        if (val < ref * 0.85) return "DEBAJO 📉";
        return "PROM 🛡️";
      };

      // --- GENERACIÓN DEL INFORME TEXTUAL ---
      let informe = `👤 RADIOGRAFÍA TÉCNICA: ${jugSel.toUpperCase()}\n`;
      informe += `🏟️ PARTIDOS ANALIZADOS: ${cantPartidos} (Ventana: ${ventana})\n`;
      informe += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      informe += `⏳ PRODUCCIÓN [Reg: ${d("PTS").reg}]\n`;
      informe += `• Minutos: ${d("MIN").val.toFixed(2)} [L: ${getS(d("MIN").val, d("MIN").tipoL, "MIN", d("MIN").val)}]\n`;
      informe += `• Puntos: ${d("PTS").val.toFixed(2)} [Eq: ${getS(d("PTS").val, d("PTS").tipoE)} | L: ${getS(d("PTS").val, d("PTS").tipoL)}]\n`;
      informe += `• PLAYS (Uso): ${d("PLAYS").val.toFixed(2)} [L: ${getS(d("PLAYS").val, d("PLAYS").tipoL)}]\n`;
      informe += `• PPP (Rentabilidad): ${d("PPP").val.toFixed(2)} [L: ${getS(d("PPP").val, d("PPP").tipoL)}]\n\n`;

      const perfiles = obtenerSintesisPerfil(dI); 
      informe += `🎯 SÍNTESIS: ${perfiles.map(p => p.tag).join(" + ")}\n`;
      perfiles.forEach((p) => {
        informe += `\n🔸 ${p.tag}\n✅ VALOR: ${p.valor}\n⚠️ LÍMITE: ${p.limite}\n🏀 CONCLUSIÓN: ${p.conclusion}\n`;
      });
      informe += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      informe += `🔥 EFICIENCIA AVANZADA\n`;
      informe += `• eFG%: ${(d("eFG%").val * 100).toFixed(2)}% [Eq: ${getS(d("eFG%").val, d("eFG%").tipoE, "eFG%", d("PLAYS").val)} | L: ${getS(d("eFG%").val, d("eFG%").tipoL, "eFG%", d("PLAYS").val)}]\n`;
      informe += `• TS%: ${(d("TS%").val * 100).toFixed(2)}% [Eq: ${getS(d("TS%").val, d("TS%").tipoE)} | L: ${getS(d("TS%").val, d("TS%").tipoL)}]\n`;
      informe += `• RTL%: ${(d("RTL%").val * 100).toFixed(2)}% [Eq: ${getS(d("RTL%").val, d("RTL%").tipoE)} | L: ${getS(d("RTL%").val, d("RTL%").tipoL)}]\n`;

      informe += `\n🎯 MAPA DE TIRO (PESO | EFEC | PPP | C/I)\n`;
      const tirosDef = [ 
        {l:"3P", pso:"PT3%", e:"T3%", ppp:"PPT3", int:"T3I", conv:"T3C"}, 
        {l:"2P", pso:"PT2%", e:"T2%", ppp:"PPT2", int:"T2I", conv:"T2C"}, 
        {l:"1P", pso:"PT1%", e:"T1%", ppp:"PPT1", int:"T1I", conv:"T1C"} 
      ];
      tirosDef.forEach(t => {
        let vActual = d(t.int).val;
        let efec = vActual > 0 ? (d(t.conv).val / vActual) : 0;
        let pppZ = vActual > 0 ? (d(t.conv).val * (t.l === "3P" ? 3 : (t.l === "2P" ? 2 : 1))) / vActual : 0;
        informe += `• ${t.l}: ${(d(t.pso).val * 100).toFixed(2)}% | ${(efec * 100).toFixed(2)}% | ${pppZ.toFixed(2)} | ${d(t.conv).val.toFixed(2)}/${vActual.toFixed(2)} [L: ${getS(efec, d(t.e).tipoL, t.e, vActual)}]\n`;
      });

      informe += `\n🏀 IMPACTO FÍSICO Y JUEGO\n`;
      informe += `• Rebotes: RO ${d("RO").val.toFixed(2)} | RD ${d("RD").val.toFixed(2)} [RD: ${getS(d("RD").val, d("RD").tipoL)}]\n`;
      informe += `• Ratio AST-PP: ${d("AST-PP").val.toFixed(2)} [${d("AST-PP").val > 1.25 ? 'GENERADOR 🧠' : 'TERMINADOR 🏀'}]\n\n`;

      // --- CONCLUSIÓN FINAL ---
      let rolFinal = d("MIN").val < 15 ? "Jugador de Complemento" : (d("PLAYS").val > 10 ? "Referente Ofensivo" : "Rol de Rotación");
      informe += `📝 CONCLUSIÓN DEL SISTEMA - ${rolFinal}\n`;
      informe += `El sistema identifica a ${jugSel} como un ${perfiles.map(p => p.tag).join(" + ")}.\n\n`;
      informe += `✅ LO BUENO: Su impacto en el rebote defensivo (${d("RD").val.toFixed(2)}) y su frecuencia en libres aseguran posesiones clave.\n`;
      informe += `⚠️ LO MALO: La regularidad es ${d("PTS").reg}, y su volumen de tiro exterior (${d("T3I").val.toFixed(2)}) no es suficiente para ser considerado una amenaza perimetral.`;

      sheetJug.getRange("J5").setValue(informe).setFontFamily("Roboto Mono").setFontSize(9).setWrap(true).setVerticalAlignment("top");
      sheetJug.setRowHeight(5, 300);
      SpreadsheetApp.getActive().toast("Análisis 360 Finalizado", "Coach AI");
    }
  } catch (err) { SpreadsheetApp.getUi().alert("Error: " + err.message); }
}

function _calcularMediana(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
