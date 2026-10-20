// Lógica pura (sin DOM) para buscar la franja más barata. Se usa en la web y en los tests.

/**
 * Busca las `duracion` horas seguidas más baratas a partir de `desde`.
 * @param {number[]} precios precio de cada hora, en €/kWh, en orden
 * @param {number} duracion horas seguidas que necesita el aparato (entero ≥ 1)
 * @param {number} desde índice de la primera hora en la que se puede empezar
 * @param {boolean[]} [permitida] si se pasa, la franja entera tiene que caer en horas permitidas
 * @returns {{inicio: number, media: number} | null} null si no cabe ninguna franja
 */
export function franjaMasBarata(precios, duracion, desde = 0, permitida = null) {
  if (duracion < 1 || desde < 0) return null;
  let mejor = null;
  // Como mucho son 49 horas (hoy y mañana) y 10 de duración: probar cada inicio es de sobra rápido.
  for (let inicio = desde; inicio + duracion <= precios.length; inicio++) {
    let suma = 0;
    let valida = true;
    for (let i = inicio; i < inicio + duracion; i++) {
      if (permitida && !permitida[i]) { valida = false; break; }
      suma += precios[i];
    }
    // Con empate se queda la más temprana: es la que antes termina.
    if (valida && (!mejor || suma < mejor.suma - 1e-12)) mejor = { inicio, suma };
  }
  return mejor && { inicio: mejor.inicio, media: mejor.suma / duracion };
}

/**
 * ¿Cae la hora de reloj `hora` (0–23) dentro del horario {desde, hasta}? Admite horarios que cruzan
 * la medianoche (desde 22 hasta 6) y, si desde === hasta, el día entero.
 */
export function dentroDeHorario(hora, { desde, hasta }) {
  if (desde === hasta) return true;
  return desde < hasta ? hora >= desde && hora < hasta : hora >= desde || hora < hasta;
}

/** Precio medio de `duracion` horas empezando en `inicio`, o null si no hay datos. */
export function mediaDesde(precios, duracion, inicio) {
  if (inicio < 0 || inicio + duracion > precios.length) return null;
  let suma = 0;
  for (let i = inicio; i < inicio + duracion; i++) suma += precios[i];
  return suma / duracion;
}

/**
 * Agrupa horas seguidas del mismo tramo: ['caro','barato','barato'] →
 * [{tramo:'caro', inicio:0, fin:1}, {tramo:'barato', inicio:1, fin:3}] (fin no incluido).
 */
export function periodos(clases) {
  const lista = [];
  clases.forEach((tramo, i) => {
    const ultimo = lista[lista.length - 1];
    if (ultimo && ultimo.tramo === tramo) ultimo.fin = i + 1;
    else lista.push({ tramo, inicio: i, fin: i + 1 });
  });
  return lista;
}

export const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/**
 * Letra de la etiqueta energética para cada hora, lineal por precio entre el mínimo (A) y el máximo (G)
 * del día. Así dos horas casi iguales comparten letra y un pico aislado es G él solo.
 */
export function letras(precios) {
  const min = Math.min(...precios);
  const rango = Math.max(...precios) - min;
  return precios.map((p) => LETRAS[rango === 0 ? 3 : Math.round(((p - min) / rango) * 6)]);
}

/** A–B barata, C–E normal, F–G cara. */
export const tramoDeLetra = (letra) => (letra <= 'B' ? 'barato' : letra >= 'F' ? 'caro' : 'medio');

/** Tramo (barato / medio / caro) de cada hora del día. */
export function tramos(precios) {
  return letras(precios).map(tramoDeLetra);
}
