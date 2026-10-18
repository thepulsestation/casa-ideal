import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateScenario, normalizeScenario} from './finance.mjs';
import {calculatePurchaseCapacity} from './purchase-capacity.mjs';

const base = overrides => normalizeScenario({
  purchasePrice: 175000,
  tax: {buyers: [
    {share: .5, rate: .05, eligibilityConfirmed: true},
    {share: .5, rate: .05, eligibilityConfirmed: true},
  ]},
  mortgage: {ltv: .8, years: 30, baseRate: 2.7},
  icf: {enabled: true, ltv: .2, maxAmount: 50000},
  cash: {savings: 0, depositPercent: .1, familyLoanAvailableBeforeDeposit: true},
  purchaseCosts: {mode: 'provision', provisionAmount: 5000, moving: 600},
  familyLoan: {enabled: true, maxAmount: 21000, rate: 6.99, years: 8, extraBuffer: 3000, coverEarlyLiquidity: true},
  motherTransfer: {mode: 'family-loan', repaymentMode: 'custom', familyRate: 0, familyYears: 8},
  budget: {
    incomes: [{monthly: 2000, payments: 14}, {monthly: 1500, payments: 14}],
    householdIncomes: [{id: 'mother', monthly: 1200, payments: 14}, {id: 'sister', monthly: 0, payments: 12}],
    existingDebtMonthly: 250, debtRatioLimit: .35,
  },
  ...overrides,
});

test('the operational mother-loan cap and advance deposit constrain the maximum even when final expenses are lower', () => {
  const r = calculatePurchaseCapacity(base());
  assert.equal(r.valid, true);
  assert.equal(r.maxPrice, 210000);
  assert.equal(r.maxByCash, 210000);
  assert.equal(r.bindingConstraint, 'cash');
  assert.equal(r.summary.loanRequired, 21000);
  assert.equal(r.summary.cashRequired, 19100);
  assert.equal(r.summary.earlyCashRequired, 21000);
  assert.equal(r.summary.loanYears, 8);
  assert.equal(r.financingAssumptions.loanLimit, 21000);
  assert.equal(r.summary.tax, 10500);
  assert.equal(r.summary.fees, 5000);
  assert.equal(r.summary.moving, 600);
  assert.equal(r.summary.buffer, 3000);
  assert.equal(r.noApproval, true);
  assert.equal(r.householdBudgetChecked, false);
  assert.ok(r.pendingAssumptions.some(text => text.includes('arras')));
});

test('the bank uses ordinary borrower incomes and counts the personal and internal family debts once', () => {
  const s = base();
  s.budget.incomes = [{monthly: 1700, payments: 14}, {monthly: 1300, payments: 14}];
  const r = calculatePurchaseCapacity(s);
  assert.equal(r.borrowerRegularIncome, 3000);
  assert.equal(r.debtLimitMonthly, 1050);
  assert.equal(r.bindingConstraint, 'debt');
  assert.equal(r.summary.borrowerDebtMonthly,
    r.summary.mortgageMonthly + 250 + r.summary.familyRepaymentMonthly);
  assert.equal(r.summary.familyRepaymentMonthly, r.summary.loanRequired / 96);
  assert.ok(r.summary.motherBankMonthly > r.summary.familyRepaymentMonthly);
  assert.ok(r.summary.borrowerDebtMonthly <= 1050);
  const next = calculateScenario({...s, purchasePrice: r.maxPrice + r.priceStep});
  assert.ok(next.budget.borrowerDebtMonthly > 1050);
  s.budget.householdIncomes = [{id: 'mother', monthly: 12000, payments: 14}, {id: 'sister', monthly: 5000, payments: 12}];
  assert.equal(calculatePurchaseCapacity(s).maxPrice, r.maxPrice);
});

test('the 5 percent checkbox status affects actual tax and capacity; a pending reduction is not silently granted', () => {
  const reduced = calculatePurchaseCapacity(base());
  const pending = base();
  pending.tax.buyers.forEach(buyer => {buyer.eligibilityConfirmed = false; buyer.eligibilityAssumed = false;});
  const general = calculatePurchaseCapacity(pending);
  assert.equal(general.maxPrice, 124000);
  assert.ok(general.maxPrice < reduced.maxPrice);
  assert.equal(general.summary.tax, 12400);
  assert.ok(general.pendingAssumptions.some(text => text.includes('tarifa general')));
});

test('the ICF cap leaves an unfunded part of the price above its coverage range', () => {
  const s = base();
  s.familyLoan.maxAmount = 60000;
  s.budget.incomes = [{monthly: 10000, payments: 12}];
  const r = calculatePurchaseCapacity(s);
  assert.equal(r.maxPrice, 405500);
  assert.equal(r.summary.icfPrincipal, 50000);
  assert.equal(r.summary.mortgagePrincipal, r.maxPrice * .8);
  assert.equal(r.summary.cashRequired, 59975);
  s.icf.maxAmount = 40000;
  assert.equal(calculatePurchaseCapacity(s).maxPrice, 365500);
});

test('a generic market ceiling does not extrapolate one property valuation or manual loan capitals', () => {
  const s = base();
  const expected = calculatePurchaseCapacity(s);
  s.appraisalValue = 100000;
  s.referenceValue = 300000;
  s.declaredValue = 310000;
  s.mortgage.amount = 10000;
  s.familyLoan.amount = 1000;
  s.cash.depositAmount = 3000;
  const before = structuredClone(s);
  const r = calculatePurchaseCapacity(s);
  assert.equal(r.maxPrice, expected.maxPrice);
  assert.equal(r.summary.mortgagePrincipal, r.maxPrice * .8);
  assert.equal(r.summary.earlyCashRequired, r.maxPrice * .1);
  assert.deepEqual(s, before);
  assert.equal(r.financingAssumptions.appraisalAtLeastPrice, true);
  assert.equal(r.financingAssumptions.referenceValueAtPrice, true);
});

test('deposit release assumptions and price-independent costs keep affecting the cash calculation', () => {
  const s = base();
  s.cash.depositFundingMode = 'no-release';
  const constrained = calculatePurchaseCapacity(s);
  assert.equal(constrained.maxPrice, 82500);
  assert.equal(constrained.summary.icfPrincipal, 8250);
  s.cash.depositFundingMode = 'pending';
  s.purchaseCosts.renovations = 10000;
  const renovations = calculatePurchaseCapacity(s);
  assert.equal(renovations.maxPrice, 48000);
  assert.equal(renovations.summary.cashRequired, 21000);
});

test('net quoted purchase costs add VAT through the existing calculator and preserve a lower capacity', () => {
  const s = base();
  s.purchaseCosts.mode = 'itemized';
  s.purchaseCosts.legal = 5000;
  const total = calculatePurchaseCapacity(s);
  s.purchaseCosts.vat.legal = {mode: 'net', rate: 21, untaxed: 0};
  const net = calculatePurchaseCapacity(s);
  assert.ok(net.maxPrice < total.maxPrice);
  assert.equal(net.summary.fees, 6050);
});

test('missing agency and insurance quotes remain pending instead of being confirmed zero', () => {
  const s = base();
  s.purchaseCosts.brokerQuotePending = true;
  s.mortgage.discounts = [{id: 'life', label: 'Prima vida pendiente', enabled: true, points: .4, cost: null, frequency: 'annual', quoteKnown: false}];
  const r = calculatePurchaseCapacity(s);
  assert.ok(r.missingQuotes.includes('Honorarios de agencia sin presupuesto final'));
  assert.ok(r.missingQuotes.includes('Prima vida pendiente'));
  assert.ok(r.missingQuotes.includes('Seguro de hogar externo'));
  assert.equal(r.provisional, true);
});

test('negotiated limits do not silently replace the current 21000 euros and eight years', () => {
  const s = base();
  s.familyLoan.negotiation = {maxAmount: 60000, maxYears: 10, confirmed: false};
  const r = calculatePurchaseCapacity(s);
  assert.equal(r.maxPrice, 210000);
  assert.equal(r.summary.loanYears, 8);
  assert.equal(r.loanLimit, 21000);
});

test('unknown borrower incomes produce no maximum even if the household receives income', () => {
  const s = base();
  s.budget.incomes = [];
  const r = calculatePurchaseCapacity(s);
  assert.equal(r.valid, true);
  assert.equal(r.maxPrice, null);
  assert.equal(r.maxByDebt, null);
  assert.equal(r.maxByCash, 210000);
  assert.equal(r.summary, null);
  assert.match(r.reason, /Faltan los ingresos/);
});

test('a missing family repayment schedule does not yield a misleading debt maximum', () => {
  const s = base();
  s.motherTransfer.familyYears = null;
  const r = calculatePurchaseCapacity(s);
  assert.equal(r.maxPrice, null);
  assert.match(r.reason, /Falta el calendario/);
});

test('the reported price is rounded down to the grid and a reached search ceiling is explicit', () => {
  const r = calculatePurchaseCapacity(base(), {step: 1000, searchCeiling: 150500});
  assert.equal(r.maxPrice, 150000);
  assert.equal(r.searchMaximumPrice, 150000);
  assert.equal(r.searchCeiling, 150500);
  assert.equal(r.limitedBySearchCeiling, true);
  assert.equal(r.bindingConstraint, 'search-ceiling');
  assert.match(r.reason, /no es un máximo financiero/);
});

test('no feasible price returns zero without inventing a positive result or changing fixed costs', () => {
  const s = base();
  s.purchaseCosts.provisionAmount = 50000;
  const r = calculatePurchaseCapacity(s);
  assert.equal(r.maxPrice, 0);
  assert.equal(r.maxByCash, 0);
  assert.equal(r.summary, null);
});

test('the waiting period is reported separately and does not silently use or increase the emergency buffer', () => {
  const s = base();
  s.cash.preClosingLoanPayments = 2;
  s.budget.currentRent = 10000;
  const r = calculatePurchaseCapacity(s);
  assert.equal(r.maxPrice, 210000);
  assert.equal(r.summary.buffer, 3000);
  assert.ok(r.preclosing.additionalCashToKeepBuffer > 0);
  assert.ok(r.preclosing.preclosingLiquidityGap > 0);
  assert.ok(r.pendingAssumptions.some(text => text.includes('espera pagando alquiler')));
});

test('invalid model data or search settings return a controlled error', () => {
  for (const options of [{step: 0}, {step: 1.5}, {searchCeiling: 50}, {searchCeiling: Infinity}]) {
    const r = calculatePurchaseCapacity(base(), options);
    assert.equal(r.valid, false);
    assert.equal(r.maxPrice, null);
    assert.ok(r.errors.length);
  }
  const s = base();
  s.familyLoan.maxAmount = 61000;
  assert.equal(calculatePurchaseCapacity(s).valid, false);
});
