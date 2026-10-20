import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar, leerCsv } from '../public/consumo.js';

test('lee el CSV de Datadis', () => {
  const csv = '﻿cups;fecha;hora;consumo_kWh;metodoObtencion;energiaVertida_kWh\r\n' +
    'ES0021000000000000AA;2026/09/21;1;0,210;Real;0\r\n' +
    'ES0021000000000000AA;2026/09/21;2;0.150;Real;0\r\n';
  assert.deepEqual(leerCsv(csv), [
    { fecha: '2026-09-21', hora: 1, kwh: 0.21 },
    { fecha: '2026-09-21', hora: 2, kwh: 0.15 },
  ]);
});

test('lee el CSV de e-distribución (AE_kWh y fecha dd/mm/aaaa) y lo ordena', () => {
  const csv = 'CUPS;Fecha;Hora;AE_kWh;REAL/ESTIMADO\n' +
    'ES0031;22/09/2026;1;0,5;R\n' +
    'ES0031;21/09/2026;24;0,3;R\n';
  assert.deepEqual(leerCsv(csv).map((f) => [f.fecha, f.hora, f.kwh]), [['2026-09-21', 24, 0.3], ['2026-09-22', 1, 0.5]]);
});

test('rechaza archivos sin las columnas necesarias', () => {
  assert.throws(() => leerCsv('nombre;apellido\nana;pérez\n'), /formato/);
});

test('calcula coste, precio pagado y ahorro posible', () => {
  // Un día de 4 horas: dos baratas (0,10) y dos caras (0,30); el consumo cae en las caras.
  const filas = [
    { fecha: '2026-09-21', hora: 1, kwh: 0 },
    { fecha: '2026-09-21', hora: 2, kwh: 0 },
    { fecha: '2026-09-21', hora: 3, kwh: 1 },
    { fecha: '2026-09-21', hora: 4, kwh: 1 },
  ];
  const r = analizar(filas, { '2026-09-21': [0.1, 0.1, 0.3, 0.3] }, 1, 2);
  assert.equal(r.kwh, 2);
  assert.ok(Math.abs(r.coste - 0.6) < 1e-9);
  assert.ok(Math.abs(r.precioPagado - 0.3) < 1e-9);
  assert.ok(Math.abs(r.precioMedio - 0.2) < 1e-9);
  assert.ok(Math.abs(r.ahorro - 0.4) < 1e-9); // 2 kWh × (0,30 − 0,10)
  assert.equal(r.reparto.caro, 1);
});

test('aplica los impuestos y salta días sin precios', () => {
  const filas = [{ fecha: '2026-09-21', hora: 1, kwh: 1 }, { fecha: '2026-09-22', hora: 1, kwh: 5 }];
  const r = analizar(filas, { '2026-09-21': [0.2] }, 1.5);
  assert.equal(r.dias, 1);
  assert.ok(Math.abs(r.coste - 0.3) < 1e-9);
});
