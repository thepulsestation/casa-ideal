import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSavingsProjection} from './savings-projection.mjs';

const ROLES = ['buyer1', 'buyer2', 'mother', 'sister'];
const row = (month, values = [100, 200, 300, 0], household = values.reduce((sum, value) => sum + value, 0), extra = {}) => ({
  month, people: Object.fromEntries(ROLES.map((role, index) => [role, {cashRemaining: values[index]}])), household: {cashRemaining: household}, ...extra,
});
const timeline = (months, extra = {}) => ({valid: true, purchaseMonth: '2027-06', persons: [{id: 'buyer1', label: 'Compradora'}], months, warnings: [], incomplete: false, ...extra});

test('accumulates monthly net cash through May and excludes June purchase salaries and extras', () => {
  const source = timeline([
    row('2026-10'), row('2026-11'), row('2026-12', [100, 400, 600, 0]),
    row('2027-01'), row('2027-02'), row('2027-03'), row('2027-04'), row('2027-05'),
    row('2027-06', [9000, 9000, 9000, 9000]),
  ]);
  const before = structuredClone(source), result = buildSavingsProjection(source);
  assert.equal(result.valid, true);
  assert.equal(result.startMonth, '2026-10');
  assert.equal(result.cutoffMonth, '2027-05');
  assert.equal(result.purchaseMonth, '2027-06');
  assert.equal(result.includesPurchaseMonth, false);
  assert.equal(result.openingBalance, 0);
  assert.equal(result.points.length, 8);
  assert.equal(result.completeThroughMonth, '2027-05');
  assert.deepEqual(result.totals, {buyer1: 800, buyer2: 1800, mother: 2700, sister: 0, household: 5300});
  assert.equal(result.persons[0].label, 'Compradora');
  assert.equal(result.persons[3].label, 'Tu hermana');
  assert.deepEqual(source, before);
});

test('uses dated cash once, without re-adding extraordinary pay, transfers, loans or savings stock', () => {
  const january = row('2027-01', [700, 100, 100, 0], 900);
  Object.assign(january.people.buyer1, {salaryExtra: 100, extraordinaryIncome: 1000, debtSettlement: 300, reservedExtraordinary: 100, familySupportReceived: 50});
  Object.assign(january.household, {salaryExtra: 100, extraordinaryIncome: 1000, debtSettlement: 300, reservedExtraordinary: 100, internalTransfers: 500, savingsUsed: 100, motherLoanPrincipal: 20000});
  const result = buildSavingsProjection(timeline([january], {purchaseMonth: '2027-02', plan: {sisterSupport: {savingsAtPurchase: 500}}}));
  assert.equal(result.totals.buyer1, 700);
  assert.equal(result.totals.household, 900);
});

test('keeps deficits and uses the authoritative household total when some expenses are unassigned', () => {
  const result = buildSavingsProjection(timeline([
    row('2027-04', [100, -300, 400, 0], 100, {hasUnassignedExpenses: true}),
    row('2027-05', [100, 50, 100, 0], 250),
  ]));
  assert.equal(result.totals.buyer2, -250);
  assert.equal(result.totals.household, 350);
  assert.equal(Object.values(result.totals).slice(0, 4).reduce((sum, value) => sum + value, 0), 450);
  assert.equal(result.incomplete, true);
  assert.equal(result.completeThroughMonth, null);
  assert.ok(result.warnings.some(value => value.includes('gastos sin pagador')));
  assert.ok(result.warnings.some(value => value.includes('negativos')));
});

test('a missing personal amount propagates only that cumulative series, while household remains independent', () => {
  const result = buildSavingsProjection(timeline([
    row('2027-03'), row('2027-04', [null, 200, 300, 0], 400), row('2027-05'),
  ]));
  assert.equal(result.completeThroughMonth, '2027-03');
  assert.equal(result.totals.buyer1, null);
  assert.equal(result.totals.buyer2, 600);
  assert.equal(result.totals.household, 1600);
  assert.equal(result.incomplete, true);
});

test('null, missing, non-numeric and infinite amounts never turn into zero savings', () => {
  for (const value of [null, undefined, '', '15', NaN, Infinity, -Infinity]) {
    const source = row('2027-05');
    source.household.cashRemaining = value;
    const result = buildSavingsProjection(timeline([source]));
    assert.equal(result.totals.household, null);
    assert.equal(result.incomplete, true);
  }
});

test('missing months and a horizon ending too early stay explicit and invalidate subsequent accumulated amounts', () => {
  const result = buildSavingsProjection(timeline([row('2027-02'), row('2027-04')]));
  assert.equal(result.valid, true);
  assert.equal(result.completeThroughMonth, '2027-02');
  assert.equal(result.points.length, 4);
  assert.equal(result.points[1].month, '2027-03');
  assert.equal(result.points[1].monthly.household, null);
  assert.equal(result.totals.household, null);
  assert.equal(result.incomplete, true);
  assert.ok(result.warnings.some(value => value.includes('Faltan meses')));
});

test('invalid calendars and ambiguous dates fail without inventing amounts', () => {
  const sources = [null, {}, timeline([], {valid: false}), timeline([]), timeline([row('2027-05')], {purchaseMonth: null}),
    timeline([row('2027-13')]), timeline([row('2027-05'), row('2027-05')]), timeline([row('2027-05'), row('2027-04')]),
    timeline([row('2027-05')], {purchaseMonth: '2128-06'}),
  ];
  for (const source of sources) {
    const result = buildSavingsProjection(source);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.equal(result.totals.household, null);
  }
});

test('a purchase in the first month has no prior full months and cannot count that month twice', () => {
  const result = buildSavingsProjection(timeline([row('2027-06')], {purchaseMonth: '2027-06'}));
  assert.equal(result.valid, true);
  assert.deepEqual(result.points, []);
  assert.equal(result.totals.household, 0);
  assert.equal(result.cutoffMonth, '2027-05');
  assert.ok(result.warnings.some(value => value.includes('No hay meses completos')));
});

test('rounds monthly accumulation to cents and preserves forecast uncertainties', () => {
  const result = buildSavingsProjection(timeline([
    row('2027-04', [.1, .1, .1, 0], .3), row('2027-05', [.2, .2, .2, 0], .6),
  ], {incomplete: true, warnings: ['Trabajo futuro pendiente.', 'Trabajo futuro pendiente.']}));
  assert.equal(result.totals.buyer1, .3);
  assert.equal(result.totals.household, .9);
  assert.equal(result.incomplete, true);
  assert.equal(result.warnings.filter(value => value === 'Trabajo futuro pendiente.').length, 1);
});
