import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario, calculateScenario} from './finance.mjs';
import {calculateMonthlyCostComparison, calculateBudgetNeutralCapacity} from './budget-neutral.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= .011, `${actual} != ${expected}`);
const roles = ['buyer1', 'buyer2', 'mother', 'sister'];
const fixture = () => normalizeScenario({
  purchasePrice: 170000,
  mortgage: {baseRate: 2.7, years: 30}, icf: {enabled: true},
  tax: {buyers: [{share: .5, rate: .05, eligibilityConfirmed: true}, {share: .5, rate: .05, eligibilityConfirmed: true}]},
  familyLoan: {enabled: true, maxAmount: 21500, rate: 6.99, years: 8, coverEarlyLiquidity: true},
  motherTransfer: {mode: 'family-loan', repaymentMode: 'custom', familyYears: 8, familyRate: 0},
  cash: {familyLoanAvailableBeforeDeposit: true},
  purchaseCosts: {mode: 'provision', provisionBasis: 'percent', provisionPercent: 2},
  budget: {
    incomes: [{label: 'A', monthly: 2200, payments: 12}, {label: 'B', monthly: 1600, payments: 14}],
    householdIncomes: [{id: 'mother', monthly: 1200, payments: 14}, {id: 'sister', monthly: 500, payments: 12}],
    currentRent: 1000, foodMonthly: 500, utilitiesMonthly: 300, familyInsuranceMonthly: 243,
    existingDebtMonthly: 262, externalHomeInsuranceAnnual: 0, ibiAnnual: 900, wasteAnnual: 240, communityMonthly: 80,
    maintenanceAnnual: 600, sharedLivingCosts: true,
  },
  familyPlan: {
    purchaseMonth: '2027-06', motherLoanStartMonth: '2027-04', sharedCostMode: 'workers', purchaseAllocation: 'shared-household',
    currentAllocation: {enabled: true, rentPayer: 'buyer1', otherCostMode: 'living-pool', motherContributionMonthly: 1100, contributionIncludesUniversity: true},
    university: {amount: 565.63, endMonth: '2027-06'},
    extraPayMonths: {buyer2: [6,12], mother: [6,12]},
    sisterSupport: {enabled: true, savingsAtPurchase: 0},
  },
});

test('comparison uses one ordinary purchase month and nets internal family payments and living contributions once', () => {
  const s = fixture(), before = structuredClone(s), comparison = calculateMonthlyCostComparison(s);
  assert.equal(comparison.valid, true);
  assert.equal(comparison.month, '2027-06');
  assert.equal(comparison.currentTotal, 1000 + 500 + 300 + 243 + 262 + 565.63);
  const current = calculateScenario(s, {asOfMonth: comparison.month});
  close(comparison.purchaseTotal, 500 + 300 + 243 + 262 + 565.63 + 75 + 20 + 80 + 50 + current.mortgage.monthlyPayment + current.familyLoan.monthlyPayment);
  close(comparison.people.reduce((sum, person) => sum + person.currentCost, 0), comparison.currentTotal);
  close(comparison.people.reduce((sum, person) => sum + person.purchaseCost, 0), comparison.purchaseTotal);
  assert.equal(comparison.people.find(person => person.id === 'buyer2').currentCost, 1100);
  assert.equal(comparison.people.find(person => person.id === 'mother').currentCost, 500 + 300 + 243 - (1100 - 565.63));
  assert.equal(comparison.people.find(person => person.id === 'buyer2').income, 1600); // June has an extra salary, excluded here.
  assert.equal(comparison.people.find(person => person.id === 'mother').income, 1200);
  for (const person of comparison.people) {
    close(person.currentRemaining, person.income - person.currentCost);
    close(person.purchaseRemaining, person.income - person.purchaseCost);
  }
  assert.deepEqual(s, before);
});

test('ordinary affordability cannot be enlarged by an extra salary, compensation receipt or sister savings', () => {
  const s = fixture();
  s.familyPlan.sisterSupport.savingsAtPurchase = 50000;
  s.familyPlan.extraPayMonths.sister = [6];
  s.familyPlan.extraPayAmounts = {sister: 100000};
  s.budget.householdIncomes.find(person => person.id === 'sister').payments = 13;
  s.familyPlan.extraordinaryReceipt = {enabled: true, owner: 'sister', month: '2027-06', amount: 90000, taxReserve: 0, confirmed: true};
  const baseline = structuredClone(s);
  baseline.familyPlan.sisterSupport.savingsAtPurchase = 0;
  baseline.familyPlan.extraPayMonths = {};
  baseline.familyPlan.extraordinaryReceipt.enabled = false;
  const result = calculateMonthlyCostComparison(s), withoutWindfalls = calculateMonthlyCostComparison(baseline);
  assert.equal(result.valid, true);
  assert.deepEqual(result.people, withoutWindfalls.people);
  assert.equal(result.purchaseTotal, withoutWindfalls.purchaseTotal);
  const sister = result.people.find(person => person.id === 'sister');
  assert.equal(sister.purchaseRemaining, 0); // Explicit family help, not a fictitious recurring receipt.
  close(result.people.reduce((sum, person) => sum + person.purchaseCost, 0), result.purchaseTotal);
  assert.equal(s.familyPlan.sisterSupport.savingsAtPurchase, 50000);
});

test('dated debts, university and personal insurance are preserved symmetrically and the new mother loan is absent from rental baseline', () => {
  const s = fixture();
  s.familyPlan.personalCommitments = [
    {id: 'policy', label: 'Policy', kind: 'expense', owner: 'buyer1', monthly: 30, endMonth: '2027-02'},
    {id: 'credit', label: 'Credit', kind: 'debt', owner: 'buyer1', monthly: 150, settleWithReceipt: true, payoffEstimate: 1000},
  ];
  s.familyPlan.extraordinaryReceipt = {enabled: true, month: '2027-01', owner: 'buyer1', amount: 1100, confirmed: false};
  const result = calculateMonthlyCostComparison(s);
  assert.equal(result.valid, true);
  assert.equal(result.people[0].currentCost, 1262); // Neither ended policy nor settled credit is reintroduced.
  assert.equal(result.currentTotal, 2870.63);
  assert.ok(result.pendingAssumptions.some(text => text.includes('cancelación')));
  const off = structuredClone(s); off.familyLoan.enabled = false;
  assert.equal(calculateMonthlyCostComparison(off).currentTotal, result.currentTotal);
  const afterUniversity = calculateMonthlyCostComparison(s, {month: '2027-07'});
  close(result.currentTotal - afterUniversity.currentTotal, 565.63);
  // The same dated commitment ends in both alternatives; it is not a discount invented for owning.
  const noUniversity = structuredClone(s); noUniversity.familyPlan.university.amount = 0;
  close(result.purchaseTotal - calculateMonthlyCostComparison(noUniversity).purchaseTotal, 565.63);
});

test('capacity finds an actual household spending boundary, keeps bank and cash constraints, and distinguishes each person', () => {
  const s = fixture();
  s.familyLoan.maxAmount = 60000;
  const c = calculateBudgetNeutralCapacity(s, {searchCeiling: 500000});
  assert.equal(c.valid, true);
  assert.ok(c.maxPrice > 0);
  assert.ok(c.maxPrice < c.bankCapacity.maxPrice);
  assert.equal(c.bindingConstraint, 'household-budget');
  assert.ok(c.summary.purchaseTotal <= c.summary.currentTotal + .005);
  assert.ok(c.summary.borrowerDebtRatio <= .35);
  assert.equal(c.summary.fundingGap, 0);
  assert.equal(c.summary.earlyCashGap, 0);
  const next = normalizeScenario(s);
  next.purchasePrice = c.maxPrice + c.priceStep;
  const nextMonth = calculateMonthlyCostComparison(next);
  assert.ok(nextMonth.purchaseTotal > nextMonth.currentTotal);
  assert.equal(c.maxIndividualPrice, 0); // Sister currently pays nothing, and sharing adds a cost.
  assert.equal(c.individualSummary, null);
  assert.ok(c.individualReason.includes('alguna persona'));
  assert.equal(c.noApproval, true);
  assert.equal(c.householdBudgetChecked, true);
});

test('each-person limit is attainable with consistent allocations and all costs remain counted', () => {
  const s = fixture();
  s.familyPlan.currentAllocation.enabled = false;
  s.familyPlan.sharedCostMode = 'equal';
  s.familyPlan.sisterSupport.enabled = false;
  s.familyPlan.university.amount = 0;
  s.budget.familyInsuranceMonthly = 0; // Its explicit current mother payer would change the split.
  const c = calculateBudgetNeutralCapacity(s, {searchCeiling: 300000});
  assert.equal(c.valid, true);
  assert.ok(c.maxIndividualPrice > 0);
  assert.equal(c.maxIndividualPrice, c.maxPrice);
  for (const person of c.individualSummary.comparison.people) assert.ok(person.difference <= .005);
  close(c.individualSummary.comparison.people.reduce((sum, person) => sum + person.purchaseCost, 0), c.individualSummary.purchaseTotal);
});

test('a cash-bound budget keeps the operational mother limit and ignores property-specific appraisal/manual balances for generic search', () => {
  const s = fixture(); s.budget.currentRent = 5000;
  const before = structuredClone(s), c = calculateBudgetNeutralCapacity(s);
  assert.equal(c.valid, true);
  assert.equal(c.maxPrice, 215000);
  assert.equal(c.maxPrice, c.bankCapacity.maxPrice);
  assert.equal(c.bindingConstraint, 'cash');
  assert.equal(c.summary.loanRequired, 21500);
  assert.equal(c.summary.fees, 4300);
  assert.equal(c.summary.buffer, 3000);
  const manual = structuredClone(s);
  manual.appraisalValue = 180000; manual.referenceValue = 220000;
  manual.mortgage.amount = 80000; manual.familyLoan.amount = 7000; manual.cash.depositAmount = 5000;
  assert.equal(calculateBudgetNeutralCapacity(manual).maxPrice, c.maxPrice);
  assert.deepEqual(s, before);
});

test('unknown quotes remain provisional and unassigned current spending prevents a fabricated individual ceiling', () => {
  const s = fixture();
  s.budget.externalHomeInsuranceAnnual = null;
  s.budget.currentOtherMonthly = 50;
  s.familyPlan.currentAllocation.otherCostMode = 'unassigned';
  const c = calculateBudgetNeutralCapacity(s, {searchCeiling: 220000});
  assert.equal(c.valid, true);
  assert.equal(c.incomplete, true);
  assert.ok(c.missingQuotes.length > 0);
  assert.equal(c.maxIndividualPrice, null);
  assert.equal(c.individualSummary, null);
  assert.equal(c.comparison.individualAllocationComplete, false);
  assert.ok(c.pendingAssumptions.some(text => text.includes('sin pagador')));
  const withMissing = calculateMonthlyCostComparison(s);
  assert.equal(withMissing.currentTotal, 2920.63);
});

test('no budget fit, invalid dates/search parameters and unknown borrower income are explicit', () => {
  const s = fixture(); s.budget.currentRent = 0; s.budget.ibiAnnual = 100000;
  const c = calculateBudgetNeutralCapacity(s, {searchCeiling: 300000});
  assert.equal(c.valid, true);
  assert.equal(c.maxPrice, 0);
  assert.equal(c.summary, null);
  for (const options of [{month: '2027-13'}, {asOfMonth: 'bad'}, {step: 0}, {step: .5}, {searchCeiling: -1}]) {
    const invalid = calculateBudgetNeutralCapacity(fixture(), options);
    assert.equal(invalid.valid, false, JSON.stringify(options));
    assert.equal(invalid.maxPrice, null);
    assert.ok(invalid.errors.length);
  }
  const noIncome = fixture(); noIncome.budget.incomes = [];
  assert.equal(calculateBudgetNeutralCapacity(noIncome).valid, false);
});

test('without a purchase date the deterministic as-of month and configured wait choose the comparison month', () => {
  const s = fixture(); s.familyPlan.purchaseMonth = null; s.familyPlan.motherLoanStartMonth = null; s.cash.preClosingLoanPayments = 2;
  const c = calculateMonthlyCostComparison(s, {asOfMonth: '2026-10'});
  assert.equal(c.valid, true);
  assert.equal(c.month, '2026-12');
  assert.deepEqual(c.people.map(person => person.id), roles);
});
