import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoPago, generarPlan, sumarMeses, resumenGeneral, hoyColombia,
  normalizarFecha, normalizarNumero,
} from '../lib/logic.ts';

const HOY = '2026-09-25';
const p = (fp: string, vp: number, fr: string | null, vr: number | null) =>
  ({ id: 'x', lote_id: 'l', fecha_programada: fp, valor_programado: vp, fecha_real: fr, valor_real: vr });

test('estados de pago', () => {
  assert.equal(estadoPago(p('2026-09-24', 100, null, null), HOY).label, 'Retrasado');
  assert.equal(estadoPago(p('2026-09-25', 100, null, null), HOY).label, 'Pendiente');
  assert.equal(estadoPago(p('2026-10-01', 100, null, null), HOY).label, 'Pendiente');
  assert.equal(estadoPago(p('2026-09-01', 100, '2026-09-10', 50), HOY).label, 'Pago parcial');
  assert.equal(estadoPago(p('2026-09-01', 100, '2026-09-10', 100), HOY).label, 'Pagado con retraso');
  assert.equal(estadoPago(p('2026-09-01', 100, '2026-09-01', 100), HOY).label, 'Al día');
  assert.equal(estadoPago(p('2026-09-01', 100, '2026-08-20', 120), HOY).label, 'Al día');
});

test('resumen general', () => {
  const infos = [
    { lote_id: 'a', nombre_propietario: 'A', valor_venta: 1000, fecha_venta: null },
    { lote_id: 'b', nombre_propietario: 'B', valor_venta: 500, fecha_venta: null },
  ];
  const pagos = [
    p('2026-01-01', 100, '2026-01-01', 100), // al día
    p('2026-02-01', 100, '2026-02-01', 60),  // parcial → 40 retrasado
    p('2026-03-01', 100, null, null),        // retrasado → 100
    p('2027-03-01', 100, null, null),        // pendiente
  ];
  assert.deepEqual(resumenGeneral(infos, pagos, HOY), { totalVentas: 1500, totalPagado: 160, totalRetrasado: 140 });
});

test('sumar meses sin desbordes', () => {
  assert.equal(sumarMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(sumarMeses('2028-01-31', 1), '2028-02-29');
  assert.equal(sumarMeses('2026-11-15', 3), '2027-02-15');
  assert.equal(sumarMeses('2026-01-31', 2), '2026-03-31');
});

test('plan mensual reparte y suma exacto', () => {
  const r = generarPlan('2026-01-15', 10_000_000, 1, '2026-12-15', 5_000_000, 100_000_000);
  assert.equal(r.cuotas.length, 12); // inicial + 10 intermedias (feb..nov) + final
  assert.equal(r.cuotas[1].fecha_programada, '2026-02-15');
  assert.equal(r.cuotas[10].fecha_programada, '2026-11-15');
  assert.equal(r.cuotas[1].valor_programado, 8_500_000);
  assert.equal(r.cuotas.reduce((s, c) => s + c.valor_programado, 0), 100_000_000);
  assert.equal(r.restanteSumadoAFinal, false);
});

test('plan con redondeo: el total sigue igual al valor de venta', () => {
  const r = generarPlan('2026-01-10', 0, 1, '2026-05-10', 0, 1000);
  // intermedias feb, mar, abr → 333, 333, 334
  assert.deepEqual(r.cuotas.map(c => c.valor_programado), [0, 333, 333, 334, 0]);
});

test('sin cuotas intermedias: restante va a la final', () => {
  const r = generarPlan('2026-01-10', 100, 12, '2026-06-10', 100, 1000);
  assert.equal(r.cuotas.length, 2);
  assert.equal(r.cuotas[1].valor_programado, 900);
  assert.equal(r.restanteSumadoAFinal, true);
});

test('fecha de hoy en Colombia', () => {
  // 2026-09-26 02:00 UTC = 2026-09-25 21:00 en Bogotá
  assert.equal(hoyColombia(new Date('2026-09-26T02:00:00Z')), '2026-09-25');
});

test('normalizar datos de Excel', () => {
  assert.equal(normalizarFecha(new Date('2026-03-05T00:00:00Z')), '2026-03-05');
  assert.equal(normalizarFecha('5/3/2026'), '2026-03-05');
  assert.equal(normalizarFecha('2026-3-5'), '2026-03-05');
  assert.equal(normalizarFecha(46086), '2026-03-05');
  assert.equal(normalizarFecha(''), null);
  assert.equal(normalizarNumero('$ 1.500.000'), 1500000);
  assert.equal(normalizarNumero('1500000'), 1500000);
  assert.equal(normalizarNumero('1.500.000,50'), 1500000.5);
  assert.equal(normalizarNumero(250), 250);
  assert.equal(normalizarNumero(''), null);
});

import { ligarPagosRealizados } from '../lib/logic.ts';

test('ligar pagos realizados con sus compromisos', () => {
  const c = (l: string, f: string, v: number) =>
    ({ numero_lote: l, fecha_programada: f, valor_programado: v, fecha_real: null, valor_real: null });
  const r = (l: string, f: string, v: number | null, fr: string, vr: number) =>
    ({ numero_lote: l, fecha_programada: f, valor_programado: v, fecha_real: fr, valor_real: vr });
  const res = ligarPagosRealizados(
    [c('1', '2026-01-15', 100), c('1', '2026-02-15', 200), c('2', '2026-01-15', 300), c('2', '2026-01-15', 400)],
    [
      r('1', '2026-02-15', 200, '2026-02-20', 150),
      r('2', '2026-01-15', 400, '2026-01-10', 400), // dos con la misma fecha: elige por valor
      r('3', '2026-01-15', 100, '2026-01-15', 100), // lote sin compromiso
      r('1', '2026-03-15', null, '2026-03-15', 50), // fecha que no existe
    ],
  );
  assert.equal(res.ligados, 2);
  assert.equal(res.sinCompromiso, 2);
  assert.deepEqual(res.pagos.map((p) => p.valor_real), [null, 150, null, 400]);
  assert.equal(res.pagos[1].fecha_real, '2026-02-20');
});
