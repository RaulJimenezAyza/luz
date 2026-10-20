// Horas del día eléctrico peninsular como instantes reales (milisegundos UTC).
//
// Red Eléctrica numera las filas del día ("00-01", "01-02"…), no las nombra por hora de reloj: el
// día del cambio de hora de octubre hay 25 filas ("24-25" incluida) y el de marzo, 23. Por eso cada
// fila se convierte en un instante: la fila i empieza i horas después de la medianoche de Madrid.
// A partir de ahí la web pinta la hora de reloj en la zona que toque (península o Canarias).

const HORA = 3_600_000;

/** Instante (ms UTC) de las 00:00 de `fecha` (AAAA-MM-DD) en Madrid. */
export function medianocheMadrid(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  const aproximada = Date.UTC(a, m - 1, d);
  // El cambio de hora en España es de madrugada (2:00/3:00), así que el desfase a medianoche UTC
  // es el mismo que a medianoche de Madrid.
  return aproximada - desfaseMadrid(aproximada);
}

/** Cuántas horas tiene ese día en Madrid: 24, o 23/25 los días de cambio de hora. */
export function horasDelDia(fecha) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return Math.round((medianocheMadrid(d.toISOString().slice(0, 10)) - medianocheMadrid(fecha)) / HORA);
}

/** Inicio y fin (ms UTC) de cada una de las `n` filas del día. */
export function tramosDelDia(fecha, n) {
  const cero = medianocheMadrid(fecha);
  return Array.from({ length: n }, (_, i) => ({ inicio: cero + i * HORA, fin: cero + (i + 1) * HORA }));
}

function desfaseMadrid(ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Madrid', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ms)).map((x) => [x.type, x.value])
  );
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
}
