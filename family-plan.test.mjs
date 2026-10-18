import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario, calculateScenario} from './finance.mjs';
import {DEFAULT_FAMILY_PLAN, normalizeFamilyPlan, validateFamilyPlan, calculateFamilyTimeline} from './family-plan.mjs';

const close = (actual, expected, tolerance = 0.011) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const fixture = (overrides = {}) => normalizeScenario({
  purchasePrice: 160000, tax: {buyers: [{share: .5, rate: .05, eligibilityConfirmed: true}, {share: .5, rate: .05, eligibilityConfirmed: true}]},
  icf: {enabled: true}, mortgage: {years: 30},
  familyLoan: {enabled: true, rate: 8, years: 8, maxAmount: 21000, coverEarlyLiquidity: true},
  motherTransfer: {mode: 'family-loan', repaymentMode: 'custom', familyRate: 0, familyYears: 8},
  purchaseCosts: {mode: 'provision', provisionAmount: 5000},
  cash: {preClosingLoanPayments: 2, familyLoanAvailableBeforeDeposit: true},
  budget: {incomes: [{label: 'A', monthly: 2300, payments: 12}, {label: 'B', monthly: 1700, payments: 14}],
    householdIncomes: [{id: 'mother', monthly: 1100, payments: 14}, {id: 'sister', monthly: 0, payments: 12}],
    existingDebtMonthly: 200, currentRent: 1000, foodMonthly: 400, utilitiesMode: 'aggregate', utilitiesMonthly: 200,
    ibiAnnual: 900, wasteAnnual: 240, communityMonthly: 30, maintenanceAnnual: 600,
  },
  familyPlan: {sharedCostMode: 'equal', university: {amount: 450, endMonth: '2027-06'}, sisterJob: {enabled: true, amount: 400, startMonth: '2027-01'}},
  ...overrides,
});

test('a positive monthly balance does not conceal a purchase funding gap',()=>{
 const source=fixture();source.familyLoan.maxAmount=5000;
 const result=calculateFamilyTimeline(source);
 assert.equal(result.valid,true);assert.ok(result.purchaseFundingGap>0);assert.equal(result.incomplete,true);
 assert.ok(result.warnings.some(warning=>warning.includes('déficit inicial')));
});

test('family plan defaults contain no private monetary figures and normalization is detached', () => {
  assert.equal(DEFAULT_FAMILY_PLAN.university.amount, 0);
  assert.equal(DEFAULT_FAMILY_PLAN.sisterJob.amount, 0);
  const raw = {university: {amount: 450, endMonth: '2027-06'}};
  const plan = normalizeFamilyPlan(raw);
  plan.university.amount = 1;
  assert.equal(raw.university.amount, 450);
  assert.equal(plan.sisterJob.enabled, false);
  assert.equal(validateFamilyPlan({}).valid, true);
});

test('invalid money, dates, modes and nested shapes remain invalid after normalization', () => {
  for (const raw of [null, [], {sharedCostMode: 'free'}, {personalDebtOwner: 'someone'}, {personalDebtOwner:'mother'}, {university: []}, {university: {amount: -2}},
    {university: {amount: '', endMonth: '2027-06'}}, {university: {amount: null}}, {sisterJob: {amount: Infinity}},
    {purchaseMonth: '2026-13'}, {motherLoanStartMonth: 'tomorrow'}, {sisterJob: {enabled: 'yes'}},
    {sisterJob: {enabled: true, amount: 400}}, {university: {amount: 450}},
    {university: {amount: 1, startMonth: '2027-07', endMonth: '2027-06'}},
  ]) {
    assert.equal(validateFamilyPlan(raw).valid, false, JSON.stringify(raw));
    assert.equal(validateFamilyPlan(normalizeFamilyPlan(raw)).valid, false, JSON.stringify(raw));
  }
});

test('personal debt belongs only to its owner and tuition only to the brother', () => {
  const timeline = calculateFamilyTimeline(fixture());
  assert.equal(timeline.valid, true);
  const october = timeline.months[0];
  assert.equal(october.people.buyer1.fixedPersonalDebt, 200);
  assert.equal(october.people.buyer2.fixedPersonalDebt, 0);
  assert.equal(october.people.mother.fixedPersonalDebt, 0);
  assert.equal(october.people.buyer2.university, 450);
  assert.equal(october.people.buyer1.university, 0);
  assert.equal(october.household.university, 450);
});

test('equal quarters do not silently subsidize the sister when she has no salary', () => {
  const october = calculateFamilyTimeline(fixture()).months[0];
  assert.equal(october.household.common, 1600);
  for (const person of Object.values(october.people)) assert.equal(person.common, 400);
  assert.equal(october.people.sister.income, 0);
  assert.equal(october.people.sister.remaining, -400);
  assert.equal(october.needsFamilyTopUp, true);
});

test('future work starts in January, replaces current sister income and can be disabled', () => {
  const source = fixture({budget: {...fixture().budget, householdIncomes: [{id: 'mother', monthly: 1100, payments: 14}, {id: 'sister', monthly: 100, payments: 12}]}});
  const rows = calculateFamilyTimeline(source).months;
  assert.equal(rows.find(row => row.month === '2026-12').people.sister.income, 100);
  assert.equal(rows.find(row => row.month === '2027-01').people.sister.income, 400);
  source.familyPlan.sisterJob.enabled = false;
  assert.equal(calculateFamilyTimeline(source).months.find(row => row.month === '2027-01').people.sister.income, 100);
});

test('tuition includes June and disappears in July without changing debt qualification', () => {
  const source = fixture(), timeline = calculateFamilyTimeline(source);
  const june = timeline.months.find(row => row.month === '2027-06'), july = timeline.months.find(row => row.month === '2027-07');
  assert.equal(june.people.buyer2.university, 450);
  assert.equal(july.people.buyer2.university, 0);
  close(july.people.buyer2.remaining - june.people.buyer2.remaining, 450);
  assert.equal(june.bankDebtRatio, july.bankDebtRatio);
  const other = structuredClone(source); other.familyPlan.university.amount = 0; other.familyPlan.sisterJob.enabled = false;
  assert.equal(timeline.bankDebtRatio, calculateFamilyTimeline(other).bankDebtRatio);
  assert.equal(timeline.bankDebtRatio, calculateScenario(source).budget.debtRatio);
});

test('waiting months include rent and the mother loan but no mortgage or ownership reserves', () => {
  const source = fixture(), result = calculateScenario(source), timeline = calculateFamilyTimeline(source);
  assert.equal(timeline.purchaseMonth, '2026-12');
  assert.equal(timeline.motherLoanStartMonth, '2026-10');
  assert.equal(timeline.purchaseMonthAssumed, true);
  for (const row of timeline.months.slice(0, 2)) {
    assert.equal(row.phase, 'renting'); assert.equal(row.household.mortgage, 0);
    close(row.household.expenses, result.budget.currentComparable + result.familyLoan.monthlyPayment - Number(result.budget.universityMonthly || 0) + 450);
  }
  const december = timeline.months[2];
  assert.equal(december.phase, 'owning');
  close(december.household.expenses, result.budget.totalMonthly - Number(result.budget.universityMonthly || 0) + 450);
  close(december.household.common, result.budget.propertyOverheadMonthly + result.budget.utilitiesMonthly + result.budget.householdMonthly - Number(result.budget.universityMonthly || 0));
});

test('zero percent family loan and real bank interest produce one external household payment', () => {
  const source = fixture(), timeline = calculateFamilyTimeline(source), october = timeline.months[0], result = calculateScenario(source);
  close(october.people.buyer1.familyRepayment + october.people.buyer2.familyRepayment, result.familyLoan.principal / 96);
  close(october.people.mother.internalReceived, october.household.internalTransfers);
  close(october.motherNetBankCost, october.people.mother.motherBankPayment - october.people.mother.internalReceived);
  assert.ok(october.motherNetBankCost > 0);
  close(october.people.mother.remaining, october.people.mother.income - october.people.mother.common - october.motherNetBankCost);
  for (const row of timeline.months) {
    close(Object.values(row.people).reduce((sum, person) => sum + person.expenses, 0) - row.household.internalTransfers, row.household.expenses);
    close(Object.values(row.people).reduce((sum, person) => sum + person.remaining, 0), row.household.remaining);
  }
});

test('extra salaries are disclosed separately without prorating into ordinary cash', () => {
  const timeline = calculateFamilyTimeline(fixture());
  assert.equal(timeline.annualExtras.people.buyer2, 3400);
  assert.equal(timeline.annualExtras.people.mother, 2200);
  assert.equal(timeline.annualExtras.total, 5600);
  assert.equal(timeline.months[0].household.income, 5100);
  assert.equal(timeline.months[3].household.income, 5500);
  assert.equal(timeline.persons[0].label, 'A');
});

test('known personal debt end month is inclusive and explicit owner is respected', () => {
  const source = fixture(); source.familyPlan.personalDebtEndMonth = '2027-01'; source.familyPlan.personalDebtOwner = 'buyer2';
  const timeline = calculateFamilyTimeline(source);
  assert.equal(timeline.months[3].people.buyer2.fixedPersonalDebt, 200);
  assert.equal(timeline.months[3].people.buyer1.fixedPersonalDebt, 0);
  assert.equal(timeline.months[4].people.buyer2.fixedPersonalDebt, 0);
  assert.equal(timeline.months[4].bankDebtMonthly, timeline.months[3].bankDebtMonthly - 200);
});

test('proportional and borrower-only allocations conserve cents and include current income changes', () => {
  for (const mode of ['income', 'borrowers']) {
    const source = fixture(); source.familyPlan.sharedCostMode = mode;
    const timeline = calculateFamilyTimeline(source);
    for (const row of timeline.months) close(Object.values(row.people).reduce((sum, person) => sum + person.common, 0), row.household.common);
    assert.equal(timeline.months[0].people.sister.common, 0);
    if (mode === 'income') assert.ok(timeline.months[3].people.sister.common > 0);
    else { assert.equal(timeline.months[3].people.sister.common, 0); assert.equal(timeline.months[3].people.mother.common, 0); }
  }
});

test('bank and internal loans stop at their own terms and 0% capital clears to the cent', () => {
  const source = fixture(), timeline = calculateFamilyTimeline(source, {months: 100}), result = calculateScenario(source);
  assert.ok(timeline.months[95].household.motherBankPayment > 0);
  assert.equal(timeline.months[96].household.motherBankPayment, 0);
  assert.equal(timeline.months[96].household.internalTransfers, 0);
  close(timeline.months.reduce((sum, row) => sum + row.household.internalTransfers, 0), result.familyLoan.principal, .001);
  source.motherTransfer.familyYears = 1;
  const shorter = calculateFamilyTimeline(source, {months: 14});
  assert.equal(shorter.months[12].household.internalTransfers, 0);
  assert.ok(shorter.months[12].household.motherBankPayment > 0);
});

test('deferred ICF starts after the mortgage, then also ends', () => {
  const source = fixture({mortgage: {years: 1}}), timeline = calculateFamilyTimeline(source, {months: 76});
  assert.ok(timeline.months[13].household.mortgage > 0);
  assert.equal(timeline.months[13].household.icfRepayment, 0);
  assert.equal(timeline.months[14].phase, 'icf');
  assert.equal(timeline.months[14].household.mortgage, 0);
  assert.ok(timeline.months[14].household.icfRepayment > 0);
  assert.equal(timeline.months[74].household.icfRepayment, 0);
  close(timeline.months.reduce((sum, row) => sum + row.household.icfRepayment, 0), calculateScenario(source).icf.principal, .001);
});

test('unknown bank quote remains unknown instead of turning into a free loan', () => {
  const source = fixture(); source.familyLoan.rate = null;
  const timeline = calculateFamilyTimeline(source);
  assert.equal(timeline.valid, true);
  assert.equal(timeline.months[0].household.motherBankPayment, null);
  assert.equal(timeline.months[0].people.mother.remaining, null);
  assert.equal(timeline.months[0].household.remaining, null);
  assert.equal(timeline.incomplete, true);
});

test('unknown internal contract leaves personal balances pending but preserves external total', () => {
  const source = fixture(); source.motherTransfer.familyYears = null;
  const timeline = calculateFamilyTimeline(source);
  assert.equal(timeline.valid, true);
  assert.equal(timeline.months[0].people.buyer1.familyRepayment, null);
  assert.equal(timeline.months[0].people.mother.internalReceived, null);
  assert.equal(timeline.months[0].people.buyer1.remaining, null);
  assert.equal(typeof timeline.months[0].household.remaining, 'number');
});

test('donation has no internal monthly repayment but retains the bank payment', () => {
  const source = fixture(); source.motherTransfer.mode = 'gift';
  const october = calculateFamilyTimeline(source).months[0];
  assert.equal(october.household.internalTransfers, 0);
  assert.ok(october.people.mother.motherBankPayment > 0);
  assert.equal(october.people.mother.internalReceived, 0);
});

test('university already present in the core shared budget is removed before per-person assignment', () => {
  const source = fixture();
  const customCalculator = scenario => {
    const result = calculateScenario(scenario);
    return {...result, budget: {...result.budget, householdMonthly: result.budget.householdMonthly - Number(result.budget.universityMonthly || 0) + 450, universityMonthly: 450}};
  };
  const initial = calculateFamilyTimeline(source), adapted = calculateFamilyTimeline(source, {calculateScenario: customCalculator});
  assert.deepEqual(adapted.months, initial.months);
});

test('month settings apply across year boundaries and reject impossible closing order', () => {
  const source = fixture(); source.familyPlan.purchaseMonth = '2027-02';
  const timeline = calculateFamilyTimeline(source, {startMonth: '2026-12', months: 4});
  assert.equal(timeline.motherLoanStartMonth, '2026-12');
  assert.equal(timeline.months[1].month, '2027-01');
  assert.equal(timeline.months[2].phase, 'owning');
  source.familyPlan.motherLoanStartMonth = '2027-03';
  assert.equal(calculateFamilyTimeline(source).valid, false);
  for (const options of [{startMonth: 'x'}, {months: 0}, {months: 1.2}, {months: 1201}]) assert.equal(calculateFamilyTimeline(fixture(), options).valid, false);
});

test('calculating a family calendar never mutates the saved scenario', () => {
  const source = fixture(), before = structuredClone(source);
  calculateFamilyTimeline(source);
  assert.deepEqual(source, before);
});
