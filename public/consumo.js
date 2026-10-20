// Lectura y análisis del consumo horario (CSV de Datadis o de la distribuidora). Funciones puras: el
// archivo se procesa entero en el navegador y no se envía a ningún sitio.
//
// Formatos conocidos (separador ";", decimales con coma o punto):
//   Datadis:         CUPS;Fecha;Hora;Consumo_kWh;Metodo_obtencion;…   Fecha 2026/09/21, Hora 1–24 (o 25)
//   i-DE, UFD…:      CUPS;Fecha;Hora;Consumo_kWh;Metodo_obtencion      Fecha 21/09/2026
//   e-distribución:  CUPS;Fecha;Hora;AE_kWh;REAL/ESTIMADO              Fecha 21/09/2026
// La hora va de 1 a 24 (25 el día del cambio de hora de octubre): es el número de fila del día, igual
// que en Red Eléctrica, así que la hora n se cruza con el precio de la fila n del mismo día.

/**
 * @returns {{ fecha: string, hora: number, kwh: number }[]} filas ordenadas (fecha AAAA-MM-DD, hora 1–25)
 * @throws {Error} si el archivo no tiene columnas de fecha, hora y consumo reconocibles
 */
export function leerCsv(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lineas.length < 2) throw new Error('El archivo está vacío.');
  const sep = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ';' : ',';
  const cabecera = lineas[0].split(sep).map((c) => c.trim().replace(/^"|"$/g, '').toLowerCase());

  const iFecha = cabecera.findIndex((c) => c.startsWith('fecha'));
  const iHora = cabecera.findIndex((c) => c === 'hora' || c.startsWith('hora'));
  const iConsumo = [
    cabecera.findIndex((c) => c.startsWith('consumo')),
    cabecera.findIndex((c) => c.startsWith('ae')),
    cabecera.findIndex((c) => c.includes('kwh') && !c.includes('vertid') && !c.includes('generad')),
  ].find((i) => i >= 0);
  if (iFecha < 0 || iHora < 0 || iConsumo === undefined) {
    throw new Error('No reconozco el formato: necesito las columnas de fecha, hora y consumo.');
  }

  const filas = [];
  for (const linea of lineas.slice(1)) {
    const c = linea.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''));
    const fecha = leerFecha(c[iFecha]);
    const hora = Number.parseInt(c[iHora], 10);
    const kwh = Number(String(c[iConsumo]).replace(',', '.'));
    if (fecha && hora >= 1 && hora <= 25 && Number.isFinite(kwh) && kwh >= 0) filas.push({ fecha, hora, kwh });
  }
  if (!filas.length) throw new Error('No he encontrado ninguna fila de consumo válida.');
  return filas.sort((a, b) => (a.fecha === b.fecha ? a.hora - b.hora : a.fecha < b.fecha ? -1 : 1));
}

/** "2026/09/21", "2026-09-21", "21/09/2026" o "21-09-2026" → "2026-09-21" */
function leerFecha(texto) {
  const t = String(texto ?? '').trim();
  let m = t.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/**
 * Cruza el consumo con los precios.
 * @param {{ fecha: string, hora: number, kwh: number }[]} filas
 * @param {Record<string, number[]>} precios por fecha, el precio (€/kWh, sin impuestos) de cada fila del día
 * @param {number} factor multiplicador de impuestos (1 = sin impuestos)
 * @param {number} [horasMover] horas caras que se pasan a baratas cada día en la estimación de ahorro
 */
export function analizar(filas, precios, factor = 1, horasMover = 4) {
  const porDia = new Map();
  for (const f of filas) {
    const p = precios[f.fecha]?.[f.hora - 1];
    if (p === undefined) continue; // día sin precios: se ignora
    if (!porDia.has(f.fecha)) porDia.set(f.fecha, []);
    porDia.get(f.fecha).push({ hora: f.hora, kwh: f.kwh, precio: p });
  }
  const dias = [...porDia.keys()].sort();
  if (!dias.length) return null;

  let kwh = 0, coste = 0, sumaPrecios = 0, nPrecios = 0, ahorro = 0;
  const porTramo = { barato: 0, medio: 0, caro: 0 };
  for (const fecha of dias) {
    const horas = porDia.get(fecha);
    const delDia = precios[fecha];
    sumaPrecios += delDia.reduce((a, b) => a + b, 0);
    nPrecios += delDia.length;
    const min = Math.min(...delDia), rango = Math.max(...delDia) - min;
    for (const h of horas) {
      kwh += h.kwh;
      coste += h.kwh * h.precio;
      const posicion = rango ? Math.round(((h.precio - min) / rango) * 6) : 3; // 0 = A … 6 = G
      porTramo[posicion <= 1 ? 'barato' : posicion >= 5 ? 'caro' : 'medio'] += h.kwh;
    }
    // Ahorro posible: lo gastado en las horas más caras del día, pagado al precio medio de las más baratas.
    const ordenadas = [...horas].sort((a, b) => b.precio - a.precio);
    const caras = ordenadas.slice(0, horasMover);
    const baratas = [...delDia].sort((a, b) => a - b).slice(0, horasMover);
    const precioBarato = baratas.reduce((a, b) => a + b, 0) / baratas.length;
    for (const h of caras) ahorro += Math.max(0, h.kwh * (h.precio - precioBarato));
  }

  return {
    desde: dias[0],
    hasta: dias.at(-1),
    dias: dias.length,
    kwh,
    coste: coste * factor,
    precioPagado: kwh ? (coste / kwh) * factor : 0, // €/kWh medio que pagaste
    precioMedio: (sumaPrecios / nPrecios) * factor, // €/kWh medio de esos días (todas las horas igual)
    ahorro: ahorro * factor,
    reparto: { barato: porTramo.barato / kwh || 0, medio: porTramo.medio / kwh || 0, caro: porTramo.caro / kwh || 0 },
    porDia,
  };
}
