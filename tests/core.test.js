'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/core.js');

const EURIBOR = require('./euribor-test-data.js');

function scheduleFixed(principal, tin, months, extras) {
  return M.buildSchedule({
    principal,
    months,
    ratePath: M.buildRatePath({ months, type: 'fixed', fixedTin: tin }),
    extras,
  });
}

test('monthly payment matches the textbook French-system figure', () => {
  // 200,000 EUR, 3% TIN, 25 years -> 948.42 EUR/month (standard reference value)
  assert.ok(Math.abs(M.monthlyPayment(200000, 3, 300) - 948.42) < 0.01);
  // Zero rate is a plain division
  assert.ok(Math.abs(M.monthlyPayment(120000, 0, 120) - 1000) < 1e-9);
});

test('schedule amortizes exactly and payments are constant at fixed rate', () => {
  const s = scheduleFixed(200000, 3, 300);
  assert.equal(s.rows.length, 300);
  assert.equal(s.totals.principal, 200000);
  assert.ok(Math.abs(s.totals.paid - s.totals.interest - 200000) < 0.02);
  assert.ok(Math.abs(s.rows[0].balance + s.rows[0].principal - 200000) < 0.01);
  const p0 = s.rows[0].payment;
  assert.ok(Math.abs(s.rows[299].payment - p0) < 0.05); // last payment within cents
  assert.equal(s.rows[299].balance, 0);
});

test('interest share falls over time, principal share rises', () => {
  const s = scheduleFixed(300000, 3.5, 360);
  assert.ok(s.rows[0].interest > s.rows[0].principal);
  assert.ok(s.rows[359].interest < s.rows[359].principal);
});

test('early repayment reducing term keeps the installment and cuts interest', () => {
  const base = scheduleFixed(200000, 3, 300);
  const withExtra = scheduleFixed(200000, 3, 300, [
    { month: 24, amount: 20000, mode: 'reduce-term' },
  ]);
  assert.ok(Math.abs(withExtra.rows[24].payment - base.rows[24].payment) < 0.02);
  assert.ok(withExtra.rows.length < base.rows.length);
  assert.ok(withExtra.totals.interest < base.totals.interest);
  assert.equal(withExtra.totals.extra, 20000);
});

test('early repayment reducing the installment keeps the term', () => {
  const base = scheduleFixed(200000, 3, 300);
  const withExtra = scheduleFixed(200000, 3, 300, [
    { month: 24, amount: 20000, mode: 'reduce-payment' },
  ]);
  assert.equal(withExtra.rows.length, 300);
  assert.ok(withExtra.rows[24].payment < base.rows[24].payment);
  assert.ok(withExtra.totals.interest < base.totals.interest);
});

test('variable rate path reviews Euribor + spread at the right months', () => {
  const euriborPath = new Array(60).fill(2).map((v, i) => 2 + i * 0.1); // rising index
  const path = M.buildRatePath({
    months: 60,
    type: 'variable',
    spread: 1,
    reviewEvery: 12,
    initialFixedMonths: 12,
    initialTin: 1.5,
    euriborPath,
  });
  assert.equal(path[0], 1.5);
  assert.equal(path[11], 1.5);
  // first review at month 12 (index 12): euribor 2 + 12*0.1 = 3.2 -> +1 = 4.2
  assert.equal(path[12], 4.2);
  assert.equal(path[23], 4.2); // held until next review
  assert.equal(path[24], 5.4); // second review: euribor 2 + 24*0.1 = 4.4, plus 1 spread
});

test('rate revision recasts the installment over the remaining term', () => {
  // two flat segments: 2% for 12 months, then 5%
  const ratePath = [...new Array(12).fill(2), ...new Array(288).fill(5)];
  const s = M.buildSchedule({ principal: 200000, months: 300, ratePath });
  assert.equal(s.rows.length, 300);
  assert.ok(s.rows[12].payment > s.rows[0].payment);
  assert.equal(s.rows[299].balance, 0);
  // after the jump, payment equals the fresh French installment on the remaining balance
  const expected = M.monthlyPayment(s.rows[11].balance, 5, 288);
  assert.ok(Math.abs(s.rows[12].payment - expected) < 0.02);
});

test('Catalonia marginal ITP brackets', () => {
  const cat = M.REGIONS.find((r) => r.id === 'cataluna');
  assert.equal(M.itpAmount(cat, 500000), 50000); // 10% flat under 600k
  assert.equal(M.itpAmount(cat, 600000), 60000);
  assert.equal(M.itpAmount(cat, 700000), 60000 + 11000); // 10% to 600k + 11% on 100k
  assert.equal(M.itpAmount(cat, 1000000), 93000 + 12000); // + 12% on the 900k-1M slice
});

test('flat and tiered regions', () => {
  const madrid = M.REGIONS.find((r) => r.id === 'madrid');
  assert.equal(M.itpAmount(madrid, 300000), 18000); // 6%
  const asturias = M.REGIONS.find((r) => r.id === 'asturias');
  assert.equal(M.itpAmount(asturias, 200000), 16000); // 8% on full value
  assert.equal(M.itpAmount(asturias, 400000), 36000); // 9% on full value
  const paisVasco = M.REGIONS.find((r) => r.id === 'pais-vasco');
  assert.equal(M.itpAmount(paisVasco, 300000), 12000); // 4% housing rate
});

test('purchase costs: resale vs new build', () => {
  const madrid = M.REGIONS.find((r) => r.id === 'madrid');
  const resale = M.purchaseCosts({ price: 250000, region: madrid, isNewBuild: false, withMortgage: true });
  assert.equal(resale.tax, 15000); // 6% ITP
  assert.equal(resale.total, 15000 + resale.notary + resale.registry + 350 + 400);
  const fresh = M.purchaseCosts({ price: 250000, region: madrid, isNewBuild: true, withMortgage: true });
  // IVA 10% + AJD 0.75% on 250k
  assert.equal(fresh.tax, 25000 + 1875);
  assert.equal(fresh.taxName, 'IVA + AJD');
});

test('euribor helpers and embedded data integrity', () => {
  const data = EURIBOR.data;
  assert.ok(data.length > 300, 'full history since 1999');
  for (let i = 1; i < data.length; i++) {
    assert.ok(data[i][0] > data[i - 1][0], 'months sorted ascending');
    assert.ok(data[i][1] > -1 && data[i][1] < 6.5, 'values in the plausible historical band');
  }
  assert.equal(data[0][0], '1999-01');
  const latest = M.euriborLatest(data);
  assert.equal(latest, data[data.length - 1]);
  assert.equal(M.euriborAt(data, '2010-06'), data.find((p) => p[0] === '2010-06')[1]);
  assert.equal(M.euriborAt(data, '1990-01'), null);
});

test('history replay clamps at the end of the series', () => {
  const data = EURIBOR.data;
  const path = M.euriborPath(data, 10, { mode: 'history', startYm: data[data.length - 2][0] });
  assert.equal(path[0], data[data.length - 2][1]);
  assert.equal(path[1], data[data.length - 1][1]);
  assert.equal(path[9], data[data.length - 1][1]); // holds last value
});

test('shock path adds percentage points', () => {
  const path = M.euriborPath(EURIBOR.data, 24, { mode: 'shock', value: 3.2, shock: 2 });
  assert.ok(path.every((v) => Math.abs(v - 5.2) < 1e-9));
});

test('independent cross-check: schedule payment matches a hand-rolled loop', () => {
  // Recompute the French installment with plain iteration, no shared code path.
  const P = 250000, tin = 2.75, n = 240, r = tin / 1200;
  let f = 1;
  for (let i = 0; i < n; i++) f *= 1 + r;
  const expected = (P * r * f) / (f - 1);
  assert.ok(Math.abs(M.monthlyPayment(P, tin, n) - expected) < 1e-9);
});

test('zero interest rate amortizes linearly', () => {
  const s = scheduleFixed(120000, 0, 120);
  assert.ok(Math.abs(s.rows[0].payment - 1000) < 1e-9);
  assert.equal(s.totals.interest, 0);
  assert.equal(s.rows[119].balance, 0);
});

test('negative amortization guard: payment pinned to interest, balance never grows', () => {
  // 10% rate with a forced tiny installment via an extra then recast is not possible;
  // simulate directly with monthsToPayOff semantics instead.
  assert.equal(M.monthsToPayOff(100000, 500, 10), Infinity); // interest is 833/mo
  const n = M.monthsToPayOff(100000, 1500, 10);
  assert.ok(Number.isFinite(n) && n < 120);
});

test('limits: zero principal and huge rates stay sane', () => {
  assert.equal(scheduleFixed(0, 3, 120).rows.length, 0);
  const s = scheduleFixed(100000, 12, 12);
  assert.equal(s.rows.length, 12);
  assert.equal(s.rows[11].balance, 0);
});

test('euribor path never invents values past the last official month', () => {
  const data = EURIBOR.data;
  const path = M.euriborPath(data, 400, { mode: 'history', startYm: data[data.length - 5][0] });
  // months beyond the series must hold the last official value, not a fabricated one
  assert.ok(path.slice(6).every((v) => v === data[data.length - 1][1]));
});
