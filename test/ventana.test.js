import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dentroDeHorario, franjaMasBarata, letras, mediaDesde, periodos, tramos } from '../public/ventana.js';

test('encuentra la franja más barata', () => {
  const precios = [0.3, 0.2, 0.1, 0.1, 0.25, 0.3];
  const r = franjaMasBarata(precios, 2);
  assert.equal(r.inicio, 2);
  assert.ok(Math.abs(r.media - 0.1) < 1e-9);
});

test('respeta la hora desde la que se puede empezar', () => {
  const precios = [0.05, 0.05, 0.3, 0.2, 0.25];
  assert.equal(franjaMasBarata(precios, 1, 2).inicio, 3);
});

test('con empate elige la más temprana', () => {
  assert.equal(franjaMasBarata([0.2, 0.1, 0.2, 0.1], 1).inicio, 1);
});

test('devuelve null si la franja no cabe', () => {
  assert.equal(franjaMasBarata([0.1, 0.2], 3), null);
  assert.equal(franjaMasBarata([0.1, 0.2, 0.3], 2, 2), null);
});

test('media desde una hora concreta', () => {
  assert.ok(Math.abs(mediaDesde([0.1, 0.2, 0.3], 2, 1) - 0.25) < 1e-9);
  assert.equal(mediaDesde([0.1, 0.2], 2, 1), null);
});

test('reparte el día en tres tramos', () => {
  assert.deepEqual(tramos([0.1, 0.2, 0.3]), ['barato', 'medio', 'caro']);
});

test('agrupa horas seguidas del mismo tramo', () => {
  assert.deepEqual(periodos(['caro', 'barato', 'barato', 'medio']), [
    { tramo: 'caro', inicio: 0, fin: 1 },
    { tramo: 'barato', inicio: 1, fin: 3 },
    { tramo: 'medio', inicio: 3, fin: 4 },
  ]);
  assert.deepEqual(periodos([]), []);
});

test('letras lineales por precio, de A a G', () => {
  assert.deepEqual(letras([0.1, 0.4, 0.7]), ['A', 'D', 'G']);
  assert.deepEqual(letras([0.1, 0.1, 0.11, 0.7]), ['A', 'A', 'A', 'G']);
  assert.deepEqual(letras([0.2, 0.2]), ['D', 'D']);
});

test('la franja entera tiene que caer en horas permitidas', () => {
  const precios = [0.05, 0.05, 0.4, 0.2, 0.2, 0.3];
  const permitida = [false, true, true, true, true, true];
  // La más barata (0–1) empieza en una hora no permitida; la mejor válida es 3–4.
  assert.equal(franjaMasBarata(precios, 2, 0, permitida).inicio, 3);
  assert.equal(franjaMasBarata(precios, 2, 0, [false, true, false, true, false, true]), null);
});

test('horario normal, que cruza la medianoche y de día entero', () => {
  const dia = { desde: 8, hasta: 23 };
  assert.equal(dentroDeHorario(7, dia), false);
  assert.equal(dentroDeHorario(8, dia), true);
  assert.equal(dentroDeHorario(22, dia), true);
  assert.equal(dentroDeHorario(23, dia), false);
  const noche = { desde: 22, hasta: 6 };
  assert.equal(dentroDeHorario(23, noche), true);
  assert.equal(dentroDeHorario(3, noche), true);
  assert.equal(dentroDeHorario(12, noche), false);
  assert.equal(dentroDeHorario(5, { desde: 0, hasta: 0 }), true);
});
