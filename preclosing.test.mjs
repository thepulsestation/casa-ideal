import test from 'node:test';
import assert from 'node:assert/strict';
import { amortizeLoan } from './finance.mjs';
import { calculatePreclosing } from './preclosing.mjs';

const close = (actual, expected, tolerance = 0.005) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
const scenario = { cash: { preClosingLoanPayments: 2, familyLoanAvailableBeforeDeposit: true } };
const loan = () => ({ ...amortizeLoan(25500, 12, 8), termsKnown: true, termsAssumed: false });
const context = () => ({
  budget: { currentComparable: 3500, actualRegularIncome: 4000, incomplete: false },
  familyLoan: loan(), cash: { surplus: 0, familyExtraBuffer: 3000,
    beforeMortgageAvailable: 25500, beforeMortgageRequired: 17500 },
});

test('no waiting installments do not incur a waiting-period deficit', () => {
  const input = context();
  input.budget.actualRegularIncome = 1;
  const r = calculatePreclosing({ cash: {} }, input, () => { throw new Error('not needed'); });
  assert.equal(r.requestedInstallments, 0);
  assert.equal(r.paidInstallments, 0);
  assert.equal(r.paidBeforeSigning, 0);
  assert.equal(r.deficit, 0);
  assert.equal(r.preclosingLiquidityGap, 0);
  assert.equal(r.bufferRemaining, 3000);
  assert.equal(r.remainingPrincipal, 25500);
  assert.equal(r.remainingInstallments, 96);
});

test('without a mother loan there are no preclosing loan payments', () => {
  const input = context();
  input.familyLoan = { principal: 0, months: 0, monthlyPayment: 0, termsKnown: true };
  const r = calculatePreclosing(scenario, input, () => { throw new Error('not needed'); });
  assert.equal(r.paidInstallments, 0);
  assert.equal(r.motherMonthly, 0);
  assert.equal(r.monthlyOutflow, 3500);
  assert.equal(r.monthlyRemaining, 500);
  assert.equal(r.paidBeforeSigning, 0);
  assert.equal(r.remainingPrincipal, 0);
  assert.equal(r.remainingInstallments, 0);
  assert.equal(r.deficit, 0);
  assert.equal(r.preclosingLiquidityGap, 0);
});

test('the waiting month adds the mother loan once to the current household spending', () => {
  const input = context();
  input.budget.homeMonthly = 1234;
  input.budget.borrowerFamilyRepaymentMonthly = input.familyLoan.monthlyPayment;
  const before = structuredClone(input);
  const r = calculatePreclosing(scenario, input, amortizeLoan);
  close(r.monthlyOutflow, 3500 + 414.4474563563362);
  close(r.monthlyRemaining, 85.5525436436638);
  assert.equal(r.deficit, 0);
  assert.equal(r.bufferRemaining, 3000);
  assert.deepEqual(input, before);
});

test('payments before signing belong to the existing amortization, not extra lifetime costs', () => {
  const input = context();
  const r = calculatePreclosing(scenario, input, amortizeLoan);
  const full = amortizeLoan(25500, 12, 8, { includeSchedule: true });
  close(r.paidBeforeSigning, 828.8949127126724);
  close(r.interestPaid, 508.4055254364367);
  close(r.principalRepaid, 320.48938727623573);
  close(r.remainingPrincipal, 25179.510612723767);
  close(r.paidBeforeSigning, r.interestPaid + r.principalRepaid);
  close(r.paidBeforeSigning + full.schedule.slice(2).reduce((sum, row) => sum + row.payment, 0), full.totalPaid);
  assert.equal(r.remainingInstallments, 94);
  assert.equal(input.familyLoan.totalPaid, full.totalPaid);
});

test('loan installments are capped at the remaining total duration', () => {
  const input = context();
  input.familyLoan = { ...amortizeLoan(1000, 0, 1 / 6), termsKnown: true };
  const r = calculatePreclosing({ cash: { ...scenario.cash, preClosingLoanPayments: 5 } }, input, amortizeLoan);
  assert.equal(r.requestedInstallments, 5);
  assert.equal(r.paidInstallments, 2);
  close(r.paidBeforeSigning, 1000);
  close(r.interestPaid, 0);
  close(r.remainingPrincipal, 0);
  assert.equal(r.remainingInstallments, 0);
});

test('waiting deficit uses extra cash before reducing the emergency buffer', () => {
  const input = context();
  input.budget.actualRegularIncome = 3500;
  input.cash.surplus = 300;
  const r = calculatePreclosing(scenario, input, amortizeLoan);
  close(r.deficit, 828.8949127126724);
  assert.equal(r.surplusUsed, 300);
  close(r.additionalCashToKeepBuffer, 528.8949127126724);
  close(r.bufferUsed, 528.8949127126724);
  close(r.bufferRemaining, 2471.1050872873276);
  assert.equal(r.cashGapAfterBuffer, 0);
});

test('sufficient extra cash keeps the entire buffer without increasing the loan', () => {
  const input = context();
  input.budget.actualRegularIncome = 3500;
  input.cash.surplus = 1000;
  const r = calculatePreclosing(scenario, input, amortizeLoan);
  close(r.surplusUsed, 828.8949127126724);
  assert.equal(r.additionalCashToKeepBuffer, 0);
  assert.equal(r.bufferUsed, 0);
  assert.equal(r.bufferRemaining, 3000);
  assert.equal(r.cashGapAfterBuffer, 0);
  assert.equal(input.familyLoan.principal, 25500);
});

test('a deficit exceeding extra cash and buffer stays visible as a funding gap', () => {
  const input = context();
  input.budget.actualRegularIncome = 1000;
  input.cash.surplus = 200;
  const r = calculatePreclosing(scenario, input, amortizeLoan);
  close(r.deficit, 5828.894912712672);
  assert.equal(r.bufferUsed, 3000);
  assert.equal(r.bufferRemaining, 0);
  close(r.cashGapAfterBuffer, 2628.894912712672);
});

test('a final surplus tied up in the deposit cannot pay waiting installments', () => {
  const input = context();
  input.familyLoan = { ...amortizeLoan(17500, 5, 10), termsKnown: true };
  input.budget.currentComparable = 4000 + 50 - input.familyLoan.monthlyPayment;
  input.budget.actualRegularIncome = 4000;
  Object.assign(input.cash, { surplus: 150, beforeMortgageAvailable: 17500,
    beforeMortgageRequired: 17500 });
  const r = calculatePreclosing(scenario, input, amortizeLoan);
  close(r.deficit, 100);
  assert.equal(r.additionalCashToKeepBuffer, 0);
  assert.equal(r.bufferRemaining, 3000);
  assert.equal(r.cashAfterEarlyPayments, 0);
  close(r.preclosingLiquidityGap, 100);
});

test('cash remaining after the deposit can cover the waiting deficit', () => {
  const input = context();
  input.budget.currentComparable = 4000 + 50 - input.familyLoan.monthlyPayment;
  input.budget.actualRegularIncome = 4000;
  const r = calculatePreclosing(scenario, input, amortizeLoan);
  close(r.deficit, 100);
  assert.equal(r.cashAfterEarlyPayments, 8000);
  assert.equal(r.preclosingLiquidityGap, 0);
  close(r.additionalCashToKeepBuffer, 100);
  close(r.bufferRemaining, 2900);
});

test('unknown early funds cannot be inferred from final surplus or the buffer', () => {
  const input = context();
  input.budget.actualRegularIncome = 3500;
  input.cash.beforeMortgageAvailable = null;
  input.cash.surplus = 1000;
  const r = calculatePreclosing(scenario, input, amortizeLoan);
  assert.equal(r.additionalCashToKeepBuffer, 0);
  assert.equal(r.cashAfterEarlyPayments, null);
  assert.equal(r.preclosingLiquidityGap, null);
  assert.equal(r.incomplete, true);
  const noWait = calculatePreclosing({ cash: { preClosingLoanPayments: 0 } }, input, amortizeLoan);
  assert.equal(noWait.preclosingLiquidityGap, 0);
});

test('unknown loan terms keep payment and reserve outcomes unknown rather than zero', () => {
  const input = context();
  input.familyLoan = { principal: 25500, monthlyPayment: null, totalInterest: null, months: 0,
    rate: 0, years: 0, termsKnown: false };
  const r = calculatePreclosing(scenario, input, () => { throw new Error('unknown terms'); });
  assert.equal(r.requestedInstallments, 2);
  for (const key of ['paidInstallments','motherMonthly','monthlyOutflow','monthlyRemaining',
    'paidBeforeSigning','principalRepaid','interestPaid','remainingPrincipal','remainingInstallments',
    'deficit','bufferUsed','bufferRemaining','additionalCashToKeepBuffer','cashGapAfterBuffer',
    'preclosingLiquidityGap']) {
    assert.equal(r[key], null, key);
  }
  assert.equal(r.incomplete, true);
});

test('unknown household income does not produce a fabricated waiting-period deficit', () => {
  const input = context();
  input.budget.actualRegularIncome = 0;
  const r = calculatePreclosing(scenario, input, amortizeLoan);
  assert.equal(r.incomeKnown, false);
  assert.equal(r.monthlyRemaining, null);
  assert.equal(r.deficit, null);
  assert.equal(r.bufferRemaining, null);
  assert.equal(r.preclosingLiquidityGap, null);
  close(r.paidBeforeSigning, 828.8949127126724);
  assert.equal(r.incomplete, true);
});

test('contradictory availability and provisional conditions keep the preview incomplete', () => {
  const input = context();
  input.familyLoan.termsAssumed = true;
  const r = calculatePreclosing({ cash: { ...scenario.cash, familyLoanAvailableBeforeDeposit: false } }, input, amortizeLoan);
  assert.equal(r.timingConsistent, false);
  assert.equal(r.incomplete, true);
  close(r.paidBeforeSigning, 828.8949127126724);
  input.familyLoan.termsAssumed = false;
  input.budget.incomplete = true;
  assert.equal(calculatePreclosing(scenario, input, amortizeLoan).incomplete, true);
});
