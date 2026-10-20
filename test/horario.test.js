import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horasDelDia, medianocheMadrid, tramosDelDia } from '../lib/horario.js';

test('medianoche de Madrid en invierno (UTC+1) y en verano (UTC+2)', () => {
  assert.equal(new Date(medianocheMadrid('2026-01-15')).toISOString(), '2026-01-14T23:00:00.000Z');
  assert.equal(new Date(medianocheMadrid('2026-07-15')).toISOString(), '2026-07-14T22:00:00.000Z');
});

test('los días de cambio de hora tienen 25 y 23 horas', () => {
  assert.equal(horasDelDia('2026-10-20'), 24);
  assert.equal(horasDelDia('2026-10-25'), 25);
  assert.equal(horasDelDia('2027-03-28'), 23);
});

test('el día de 25 horas repite la hora de reloj de las 2', () => {
  const reloj = (ms) =>
    Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));
  const horas = tramosDelDia('2026-10-25', 25).map((t) => reloj(t.inicio));
  assert.deepEqual(horas.slice(0, 5), [0, 1, 2, 2, 3]);
  assert.equal(horas[24], 23);
});

test('el día de 23 horas se salta las 2', () => {
  const reloj = (ms) =>
    Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));
  assert.deepEqual(tramosDelDia('2027-03-28', 23).slice(0, 4).map((t) => reloj(t.inicio)), [0, 1, 3, 4]);
});
