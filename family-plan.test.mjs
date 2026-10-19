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
  assert.equal(plan.currentAllocation.enabled, false);
  assert.equal(plan.currentAllocation.otherCostMode, 'unassigned');
  assert.equal(validateFamilyPlan({}).valid, true);
});

test('invalid money, dates, modes and nested shapes remain invalid after normalization', () => {
  for (const raw of [null, [], {sharedCostMode: 'free'}, {personalDebtOwner: 'someone'}, {personalDebtOwner:'mother'}, {university: []}, {university: {amount: -2}},
    {university: {amount: '', endMonth: '2027-06'}}, {university: {amount: null}}, {sisterJob: {amount: Infinity}},
    {purchaseMonth: '2026-13'}, {motherLoanStartMonth: 'tomorrow'}, {sisterJob: {enabled: 'yes'}},
    {sisterJob: {enabled: true, amount: 400}}, {university: {amount: 450}},
    {university: {amount: 1, startMonth: '2027-07', endMonth: '2027-06'}},
    {currentAllocation: []}, {currentAllocation: {enabled: 'yes'}}, {currentAllocation: {rentPayer: 'unknown'}},
    {currentAllocation: {brotherLivingShare: -0.1}}, {currentAllocation: {brotherLivingShare: 1.1}},
    {currentAllocation: {brotherLivingShare: null}}, {currentAllocation: {otherCostMode: 'unknown'}},
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

test('current actual allocation assigns rent to its payer and living costs only to mother and brother', () => {
  const source = fixture();
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'unassigned'};
  const timeline = calculateFamilyTimeline(source), october = timeline.months[0], december = timeline.months[2];
  assert.equal(october.currentAllocationApplied, true);
  assert.equal(october.people.buyer1.rent, 1000);
  assert.equal(october.people.buyer1.food, 0);
  assert.equal(october.people.buyer1.utilities, 0);
  for (const role of ['buyer2', 'mother']) {
    assert.equal(october.people[role].rent, 0);
    assert.equal(october.people[role].food, 200);
    assert.equal(october.people[role].utilities, 100);
  }
  assert.equal(october.people.sister.common, 0);
  assert.equal(october.people.sister.remaining, 0);
  assert.equal(october.people.buyer1.fixedPersonalDebt, 200);
  assert.equal(october.people.buyer2.university, 450);
  assert.equal(october.household.common, 1600);
  assert.equal(december.currentAllocationApplied, false);
  assert.equal(december.people.buyer1.rent, 0);
  assert.equal(october.bankDebtRatio, calculateFamilyTimeline(fixture()).months[0].bankDebtRatio);
});

test('unassigned current costs remain in the household once without inventing a personal payer', () => {
  const source = fixture();
  source.budget.carMonthly = 90.01; source.budget.storageMonthly = 9.02;
  source.familyPlan.sharedCostMode = 'workers';
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'unassigned'};
  const timeline = calculateFamilyTimeline(source), october = timeline.months[0];
  assert.equal(october.hasUnassignedExpenses, true);
  assert.equal(october.household.unassignedExpenses, 99.03);
  assert.equal(october.household.commonOther, 99.03);
  assert.equal(timeline.incomplete, true);
  assert.ok(timeline.warnings.some(warning => warning.includes('sin pagador asignado')));
  for (const person of Object.values(october.people)) assert.equal(person.commonOther, 0);
  for (const row of timeline.months) {
    close(Object.values(row.people).reduce((sum, person) => sum + person.expenses, 0) + row.household.unassignedExpenses - row.household.internalTransfers, row.household.expenses, .001);
    close(Object.values(row.people).reduce((sum, person) => sum + person.remaining, 0) - row.household.unassignedExpenses, row.household.remaining, .001);
    for (const person of Object.values(row.people)) close(person.rent + person.food + person.utilities + person.commonOther, person.common, .001);
  }
  assert.equal(timeline.months[2].hasUnassignedExpenses, false);
  assert.equal(timeline.months[2].household.unassignedExpenses, 0);
});

test('worker shares are equal among positive ordinary incomes and update when a job begins', () => {
  const source = fixture(); source.familyPlan.sharedCostMode = 'workers';
  const timeline = calculateFamilyTimeline(source), december = timeline.months[2], january = timeline.months[3];
  assert.equal(december.people.sister.common, 0);
  // Each separate bill conserves cents; summing several bills can differ by
  // a few cents from rounding the aggregate once.
  for (const role of ['buyer1', 'buyer2', 'mother']) close(december.people[role].common, december.household.common / 3, .031);
  for (const person of Object.values(january.people)) close(person.common, january.household.common / 4, .031);
  source.familyPlan.sisterJob.enabled = false;
  assert.equal(calculateFamilyTimeline(source).months[3].people.sister.common, 0);
  source.budget.incomes[1].monthly = 0;
  const unemployedBrother = calculateFamilyTimeline(source).months[2];
  assert.equal(unemployedBrother.people.buyer2.common, 0);
  close(unemployedBrother.people.buyer1.common, unemployedBrother.household.common / 2, .031);
  close(unemployedBrother.people.mother.common, unemployedBrother.household.common / 2, .031);
});

test('current food split and explicitly assigned other bills conserve every cent', () => {
  const source = fixture(); source.budget.foodMonthly = 400.01; source.budget.utilitiesMonthly = 200.02; source.budget.carMonthly = 90.01;
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .3, otherCostMode: 'mother'};
  for (const mode of ['mother', 'buyer1', 'buyer2', 'sister', 'workers', 'income', 'borrowers', 'equal']) {
    source.familyPlan.currentAllocation.otherCostMode = mode;
    const october = calculateFamilyTimeline(source).months[0];
    assert.equal(october.household.unassignedExpenses, 0);
    assert.equal(october.hasUnassignedExpenses, false);
    for (const key of ['rent', 'food', 'utilities', 'commonOther', 'common']) close(Object.values(october.people).reduce((sum, person) => sum + person[key], 0), october.household[key], .001);
    if (['mother', 'buyer1', 'buyer2', 'sister'].includes(mode)) assert.equal(october.people[mode].commonOther, 90.01);
    if (mode === 'workers') assert.equal(october.people.sister.commonOther, 0);
  }
});

test('a new job before purchase does not silently replace the agreed current bill payers', () => {
  const source = fixture(); source.familyPlan.sharedCostMode = 'workers';
  source.familyPlan.purchaseMonth = '2027-03'; source.familyPlan.motherLoanStartMonth = '2027-01';
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'unassigned'};
  const rows = calculateFamilyTimeline(source).months;
  const january = rows.find(row => row.month === '2027-01'), march = rows.find(row => row.month === '2027-03');
  assert.equal(january.people.sister.income, 400);
  assert.equal(january.currentAllocationApplied, true);
  assert.equal(january.people.sister.common, 0);
  assert.equal(january.people.buyer1.rent, 1000);
  assert.equal(january.people.buyer2.food, 200);
  assert.equal(january.people.mother.food, 200);
  assert.equal(march.currentAllocationApplied, false);
  assert.equal(march.people.buyer1.rent, 0);
  assert.ok(march.people.sister.common > 0);
  for (const person of Object.values(march.people)) close(person.common, march.household.common / 4, .031);
});

test('worker allocation with no incomes stays pending instead of assigning a free household budget', () => {
  const source = fixture(); source.familyPlan.sharedCostMode = 'workers';
  source.familyPlan.sisterJob.enabled = false; source.budget.incomes.forEach(row => { row.monthly = 0; });
  source.budget.householdIncomes.forEach(row => { row.monthly = 0; });
  const timeline = calculateFamilyTimeline(source), december = timeline.months[2];
  assert.equal(timeline.valid, true);
  assert.ok(december.household.common > 0);
  assert.equal(december.people.buyer1.common, null);
  assert.equal(december.people.buyer1.remaining, null);
  assert.ok(timeline.warnings.some(warning => warning.includes('Sin ninguna persona con ingresos')));
});

test('current university and living pool share the cost between mother and brother without charging the rent payer', () => {
  const source = fixture(); source.budget.storageMonthly = 40;
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'living-pool', includeUniversity: true};
  const october = calculateFamilyTimeline(source).months[0];
  assert.equal(october.people.buyer1.common, 1000);
  assert.equal(october.people.buyer1.university, 0);
  for (const role of ['buyer2', 'mother']) {
    assert.equal(october.people[role].common, 320);
    assert.equal(october.people[role].university, 225);
  }
  assert.equal(october.household.unassignedExpenses, 0);
  close(Object.values(october.people).reduce((sum, person) => sum + person.remaining, 0), october.household.remaining, .001);
});

test('shared ownership costs equalize the common burden while preserving legal borrower debt and personal costs', () => {
  const source = fixture(); source.familyPlan.sharedCostMode = 'workers';
  source.familyPlan.purchaseAllocation = 'shared-household';
  source.familyPlan.personalCommitments = [{id: 'profession', label: 'Cuota profesional', owner: 'buyer1', monthly: 80, kind: 'expense'}];
  const timeline = calculateFamilyTimeline(source), december = timeline.months[2], january = timeline.months[3];
  for (const row of [december, january]) {
    const workerCount = row.people.sister.income > 0 ? 4 : 3;
    const pooled = row.household.common + row.household.university + row.household.mortgage + row.household.motherBankPayment + row.household.icfRepayment;
    for (const role of ['buyer1', 'buyer2', 'mother', ...(workerCount === 4 ? ['sister'] : [])]) {
      const person = row.people[role];
      close(person.expenses - person.internalReceived - person.fixedPersonalDebt - person.personalExpense, pooled / workerCount, .011);
    }
    close(Object.values(row.people).reduce((sum, person) => sum + person.householdRedistribution, 0), 0, .001);
    close(Object.values(row.people).reduce((sum, person) => sum + person.expenses - person.internalReceived, 0), row.household.expenses, .001);
    close(Object.values(row.people).reduce((sum, person) => sum + person.remaining, 0), row.household.remaining, .001);
  }
  assert.equal(december.people.sister.expenses, 0);
  const original = structuredClone(source); original.familyPlan.purchaseAllocation = 'owners';
  const legal = calculateFamilyTimeline(original).months[2];
  assert.equal(december.bankDebtMonthly, legal.bankDebtMonthly);
  assert.equal(december.people.buyer1.mortgage, legal.people.buyer1.mortgage);
  assert.equal(december.people.buyer1.familyRepayment, legal.people.buyer1.familyRepayment);
  assert.equal(december.people.mother.motherBankPayment, legal.people.mother.motherBankPayment);
  assert.equal(december.people.buyer1.personalExpense, 80);
});

test('personal transport is removed from common costs and charged once to its owner', () => {
  const source = fixture(); source.budget.carMonthly = 90.03; source.familyPlan.transportOwner = 'buyer1';
  const personal = calculateFamilyTimeline(source), shared = structuredClone(source); shared.familyPlan.transportOwner = null;
  const baseline = calculateFamilyTimeline(shared);
  for (let index = 0; index < personal.months.length; index++) {
    const row = personal.months[index], prior = baseline.months[index];
    assert.equal(row.people.buyer1.transportExpense, 90.03);
    assert.equal(row.people.buyer2.transportExpense, 0);
    close(row.household.common, prior.household.common - 90.03, .001);
    assert.equal(row.household.expenses, prior.household.expenses);
    assert.equal(row.bankDebtMonthly, prior.bankDebtMonthly);
    close(Object.values(row.people).reduce((sum, person) => sum + person.remaining, 0), row.household.remaining, .001);
  }
});

test('personal debt settlement changes monthly bank debt but extraordinary receipt remains separate from recurring salary and savings', () => {
  const source = fixture();
  source.familyPlan.personalCommitments = [
    {id: 'vehicle', label: 'Vehículo', owner: 'buyer1', monthly: 125, kind: 'debt', settleWithReceipt: true, payoffEstimate: 2100, payoffFeeRate: .01},
    {id: 'profession', label: 'Cuota profesional', owner: 'buyer1', monthly: 80, kind: 'expense'},
  ];
  source.familyPlan.extraordinaryReceipt = {enabled: true, month: '2027-01', amount: 3500, taxReserve: 200, owner: 'buyer1', confirmed: false};
  const timeline = calculateFamilyTimeline(source), december = timeline.months[2], january = timeline.months[3], february = timeline.months[4];
  assert.equal(december.people.buyer1.fixedPersonalDebt, 325);
  assert.equal(january.people.buyer1.fixedPersonalDebt, 200);
  assert.equal(january.people.buyer1.personalCommitmentDebt, 0);
  assert.equal(january.people.buyer1.personalExpense, 80);
  assert.equal(january.people.buyer1.income, 2300);
  assert.equal(january.people.buyer1.extraordinaryIncome, 3500);
  assert.equal(january.people.buyer1.debtSettlement, 2121);
  assert.equal(january.people.buyer1.reservedExtraordinary, 200);
  close(january.people.buyer1.cashRemaining - january.people.buyer1.remaining, 1179, .001);
  close(january.household.cashRemaining - january.household.remaining, 1179, .001);
  assert.equal(february.people.buyer1.extraordinaryIncome, 0);
  assert.equal(february.people.buyer1.cashRemaining, february.people.buyer1.remaining);
  close(january.bankDebtMonthly, december.bankDebtMonthly - 125, .001);
  assert.ok(timeline.warnings.some(warning => warning.includes('todavía no está confirmado')));
  assert.equal(timeline.incomplete, true);
});

test('unfunded cancellation hypothesis retains debt installments and warns instead of declaring new borrowing capacity', () => {
  const source = fixture();
  source.familyPlan.personalCommitments = [{id: 'vehicle', label: 'Vehículo', owner: 'buyer1', monthly: 125, kind: 'debt', settleWithReceipt: true, payoffEstimate: 2100}];
  source.familyPlan.extraordinaryReceipt = {enabled: true, month: '2027-01', amount: 2000, owner: 'buyer1', confirmed: false};
  const timeline = calculateFamilyTimeline(source), january = timeline.months[3];
  assert.equal(january.people.buyer1.fixedPersonalDebt, 325);
  assert.equal(january.people.buyer1.debtSettlement, 0);
  assert.equal(timeline.extraordinarySettlement.fundingGap, 100);
  assert.ok(timeline.warnings.some(warning => warning.includes('no cubre todas las cancelaciones')));
});

test('legacy public transport remains personal and preserves the saved before-purchase sister allocation', () => {
  const source = fixture(); source.familyPlan.sisterJob.enabled = false;
  source.familyPlan.sharedCostMode = 'workers'; source.familyPlan.purchaseAllocation = 'shared-household';
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'living-pool', includeUniversity: true};
  source.familyPlan.publicTransport = {buyer2Monthly: 15.25, motherMonthly: 55, sisterMonthly: 19.33, sisterBeforePurchaseMotherShare: .5};
  const timeline = calculateFamilyTimeline(source), current = timeline.months[0], owned = timeline.months[2];
  assert.equal(current.people.buyer2.publicTransportExpense, 15.25);
  assert.equal(current.people.mother.publicTransportExpense, 64.67);
  assert.equal(current.people.sister.publicTransportExpense, 9.66);
  assert.equal(current.people.sister.remaining, -9.66);
  assert.equal(current.needsFamilyTopUp, true);
  assert.equal(owned.people.mother.publicTransportExpense, 55);
  assert.equal(owned.people.sister.publicTransportExpense, 19.33);
  assert.equal(owned.people.sister.remaining, -19.33);
  const withoutTickets = structuredClone(source); delete withoutTickets.familyPlan.publicTransport;
  const baseline = calculateFamilyTimeline(withoutTickets);
  for (let index = 0; index < timeline.months.length; index++) {
    const row = timeline.months[index], prior = baseline.months[index];
    assert.equal(row.household.publicTransportExpense, 89.58);
    close(row.household.expenses - prior.household.expenses, 89.58, .001);
    assert.equal(row.household.common, prior.household.common);
    assert.equal(row.bankDebtMonthly, prior.bankDebtMonthly);
    close(Object.values(row.people).reduce((sum, person) => sum + person.remaining, 0), row.household.remaining, .001);
  }
});

test('income-dependent transport charges the sister only from her actual or simulated income month', () => {
  const source = fixture();
  source.familyPlan.sharedCostMode = 'workers';
  source.familyPlan.purchaseAllocation = 'shared-household';
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'living-pool', includeUniversity: true};
  source.familyPlan.purchaseMonth = '2026-12';
  source.familyPlan.sisterJob = {enabled: true, amount: 500, startMonth: '2027-03'};
  source.familyPlan.publicTransport = {buyer2Quarterly: 50, sisterQuarterly: 50, motherMonthly: 70, sisterPayerMode: 'income-dependent'};
  const before = structuredClone(source), timeline = calculateFamilyTimeline(source, {months: 8});
  assert.equal(timeline.valid, true);
  for (const row of timeline.months) {
    const working = row.month >= '2027-03';
    assert.equal(row.people.sister.income, working ? 500 : 0);
    assert.equal(row.people.sister.publicTransportExpense, working ? 16.67 : 0);
    assert.equal(row.people.buyer2.publicTransportExpense, working ? 16.67 : 25);
    assert.equal(row.people.mother.publicTransportExpense, working ? 70 : 78.34);
    assert.equal(row.people.buyer1.publicTransportExpense, 0);
    assert.equal(row.household.publicTransportExpense, 103.34);
    if (!working) assert.equal(row.people.sister.expenses, 0, row.month);
    close(Object.values(row.people).reduce((sum, person) => sum + person.remaining, 0), row.household.remaining, .001);
  }
  assert.equal(timeline.months[2].phase, 'owning');
  assert.equal(timeline.months[2].people.sister.publicTransportExpense, 0);
  assert.ok(timeline.warnings.some(warning => warning.includes('Cuando tenga ingresos, lo paga ella')));
  assert.deepEqual(source, before);

  const disabled = structuredClone(source); disabled.familyPlan.sisterJob.enabled = false;
  const withoutJob = calculateFamilyTimeline(disabled, {months: 8});
  assert.ok(withoutJob.months.every(row => row.people.sister.expenses === 0 && row.people.sister.publicTransportExpense === 0));
  const alreadyWorking = structuredClone(disabled);
  alreadyWorking.budget.householdIncomes.find(person => person.id === 'sister').monthly = 300;
  const employed = calculateFamilyTimeline(alreadyWorking, {months: 8});
  assert.ok(employed.months.every(row => row.people.sister.publicTransportExpense === 16.67));

  const earlyJob = structuredClone(source); earlyJob.familyPlan.sisterJob.startMonth = '2026-11';
  const earlyTimeline = calculateFamilyTimeline(earlyJob, {months: 3});
  assert.equal(earlyTimeline.months[1].phase, 'renting');
  assert.equal(earlyTimeline.months[1].people.sister.publicTransportExpense, 16.67);

  const legacy = structuredClone(source); legacy.familyPlan.publicTransport.sisterPayerMode = 'legacy';
  const legacyTimeline = calculateFamilyTimeline(legacy, {months: 8});
  for (let index = 0; index < timeline.months.length; index++) {
    const row = timeline.months[index], prior = legacyTimeline.months[index];
    assert.equal(row.household.expenses, prior.household.expenses);
    assert.equal(row.household.remaining, prior.household.remaining);
    assert.equal(row.bankDebtMonthly, prior.bankDebtMonthly);
    assert.equal(row.bankDebtRatio, prior.bankDebtRatio);
  }
});
