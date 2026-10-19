import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario, calculateScenario} from './finance.mjs';
import {DEFAULT_FAMILY_PLAN, normalizeFamilyPlan, validateFamilyPlan, calculateFamilyTimeline} from './family-plan.mjs';

const close = (actual, expected, tolerance = 0.011) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('extra salaries enter only scheduled months and leave ordinary income and the banking ratio unchanged',()=>{
 const source=fixture();source.familyPlan.extraPayMonths={buyer2:[6,12],mother:[6,12]};
 const result=calculateFamilyTimeline(source,{startMonth:'2027-05',months:8});
 const baseline=structuredClone(source);delete baseline.familyPlan.extraPayMonths;
 const comparison=calculateFamilyTimeline(baseline,{startMonth:'2027-05',months:8});
 assert.equal(result.valid,true);
 for(const [index,row]of result.months.entries()){
  const expected=['2027-06','2027-12'].includes(row.month)?2800:0;
  assert.equal(row.household.salaryExtra,expected);
  assert.equal(row.household.externalIncome,row.household.income+expected);
  close(row.household.cashRemaining-row.household.remaining,expected);
  assert.equal(row.bankDebtRatio,comparison.months[index].bankDebtRatio);
 }
 assert.equal(result.annualExtras.unallocatedTotal,0);
 const june=result.months[1];assert.equal(june.people.buyer2.externalIncome,3400);assert.equal(june.people.mother.externalIncome,2200);
});

test('partial extra-pay schedules stay editable and pending, while invalid schedules are rejected',()=>{
 const source=fixture();source.familyPlan.extraPayMonths={buyer2:[null,'12']};source.familyPlan.extraPayAmounts={buyer2:1250};
 const result=calculateFamilyTimeline(source,{startMonth:'2026-12',months:7});
 assert.equal(result.valid,true);assert.equal(result.months[0].people.buyer2.salaryExtra,1250);
 assert.equal(result.months[6].people.buyer2.salaryExtra,0);
 assert.equal(result.annualExtras.unallocatedPeople.buyer2,1250);assert.equal(result.incomplete,true);
 for(const bad of [[6,6],[0],[13],['wrong']])assert.equal(validateFamilyPlan({extraPayMonths:{buyer2:bad}}).valid,false);
 source.familyPlan.extraPayMonths.buyer2=[1,6,12];assert.equal(calculateFamilyTimeline(source).valid,false);
});
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

test('the rent change takes effect in November only and remains the agreed rent payer\'s expense', () => {
  const source = fixture();
  source.budget.currentRent = 1014.35;
  source.familyPlan.purchaseMonth = '2027-06';
  source.familyPlan.motherLoanStartMonth = '2027-06';
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'living-pool'};
  source.familyPlan.rentChange = {enabled: true, fromMonth: '2026-11', monthly: '1064'};
  const withChange = calculateFamilyTimeline(source, {startMonth: '2026-10', months: 10});
  const baselineSource = structuredClone(source); baselineSource.familyPlan.rentChange.enabled = false;
  const baseline = calculateFamilyTimeline(baselineSource, {startMonth: '2026-10', months: 10});
  assert.equal(withChange.valid, true);
  assert.equal(withChange.plan.rentChange.monthly, 1064);
  assert.equal(withChange.months[0].people.buyer1.rent, 1014.35);
  assert.equal(withChange.months[0].household.rent, 1014.35);
  for (let i = 1; i < 8; i++) {
    const row = withChange.months[i], before = baseline.months[i];
    assert.equal(row.household.rent, 1064);
    assert.equal(row.people.buyer1.rent, 1064);
    close(row.people.buyer1.expenses - before.people.buyer1.expenses, 49.65);
    close(row.household.expenses - before.household.expenses, 49.65);
    close(before.household.cashRemaining - row.household.cashRemaining, 49.65);
    for (const role of ['buyer2', 'mother', 'sister']) assert.equal(row.people[role].expenses, before.people[role].expenses);
    assert.equal(row.household.income, before.household.income);
    assert.equal(row.bankDebtRatio, before.bankDebtRatio);
  }
  for (let i = 8; i < 10; i++) {
    const row = withChange.months[i], before = baseline.months[i];
    assert.equal(row.phase, 'owning');
    assert.equal(row.household.rent, 0);
    assert.equal(row.people.buyer1.rent, 0);
    assert.equal(row.household.expenses, before.household.expenses);
    assert.equal(row.household.cashRemaining, before.household.cashRemaining);
  }
});

test('dated rent defaults are detached and reject malformed amounts or dates', () => {
  assert.deepEqual(DEFAULT_FAMILY_PLAN.rentChange, {enabled: false, fromMonth: null, monthly: 0});
  assert.equal(DEFAULT_FAMILY_PLAN.savingsStartMonth, null);
  const raw = {rentChange: {enabled: true, fromMonth: '2026-11', monthly: 1064}, savingsStartMonth: '2026-10'};
  const normalized = normalizeFamilyPlan(raw);
  normalized.rentChange.monthly = 100;
  assert.equal(raw.rentChange.monthly, 1064);
  assert.equal(validateFamilyPlan(raw).valid, true);
  for (const value of [null, [], {enabled: 'yes'}, {enabled: true}, {enabled: true, fromMonth: '2026-13', monthly: 1064},
    {enabled: true, fromMonth: '2026-11', monthly: -1}, {monthly: null}, {monthly: Infinity}, {monthly: ''}]) {
    assert.equal(validateFamilyPlan({rentChange: value}).valid, false, JSON.stringify(value));
    assert.equal(validateFamilyPlan(normalizeFamilyPlan({rentChange: value})).valid, false, JSON.stringify(value));
  }
  assert.equal(validateFamilyPlan({rentChange: {enabled: true, fromMonth: '2026-11', monthly: 0}}).valid, true);
  assert.equal(validateFamilyPlan({savingsStartMonth: '2026-13'}).valid, false);
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
  assert.deepEqual(DEFAULT_FAMILY_PLAN.sisterSupport, {enabled: false, savingsAtPurchase: 0});
  const raw = {university: {amount: 450, endMonth: '2027-06'}};
  const plan = normalizeFamilyPlan(raw);
  plan.university.amount = 1;
  assert.equal(raw.university.amount, 450);
  assert.equal(plan.sisterJob.enabled, false);
  assert.equal(plan.currentAllocation.enabled, false);
  assert.equal(plan.currentAllocation.otherCostMode, 'unassigned');
  assert.equal(plan.currentAllocation.motherContributionMonthly, 0);
  assert.equal(plan.currentAllocation.contributionIncludesUniversity, false);
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
    {currentAllocation: {motherContributionMonthly: -1}}, {currentAllocation: {motherContributionMonthly: null}},
    {currentAllocation: {motherContributionMonthly: Infinity}}, {currentAllocation: {motherContributionMonthly: ''}},
    {currentAllocation: {contributionIncludesUniversity: 'yes'}}, {currentAllocation: {contributionIncludesUniversity: null}},
    {sisterSupport: []}, {sisterSupport: {enabled: 'yes'}}, {sisterSupport: {savingsAtPurchase: -1}},
    {sisterSupport: {savingsAtPurchase: null}}, {sisterSupport: {savingsAtPurchase: Infinity}},
    {sisterSupport: {savingsAtPurchase: ''}},
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
  assert.equal(timeline.annualExtras.scheduledTotal, 0);
  assert.equal(timeline.annualExtras.unallocatedTotal, 5600);
  assert.deepEqual(timeline.annualExtras.pendingPeople, ['buyer2', 'mother']);
  assert.ok(timeline.months.every(row => row.household.salaryExtra === 0));
  assert.ok(timeline.warnings.some(warning => warning.includes('sin meses de cobro')));
});

test('explicit June and December extra pays increase real cash only on the scheduled dates', () => {
  const source = fixture(), original = calculateFamilyTimeline(source, {startMonth: '2027-01', months: 24});
  source.familyPlan.extraPayMonths = {buyer2: [6, 12], mother: [12, 6]};
  const before = structuredClone(source), timeline = calculateFamilyTimeline(source, {startMonth: '2027-01', months: 24});
  assert.equal(timeline.valid, true);
  assert.equal(timeline.annualExtras.scheduledTotal, 5600);
  assert.equal(timeline.annualExtras.unallocatedTotal, 0);
  assert.deepEqual(timeline.annualExtras.pendingPeople, []);
  assert.deepEqual(timeline.persons.find(person => person.id === 'mother').extraPaymentMonths, [6, 12]);
  for (const [index, row] of timeline.months.entries()) {
    const extraMonth = row.month.endsWith('-06') || row.month.endsWith('-12'), ordinary = original.months[index];
    assert.equal(row.people.buyer2.salaryExtra, extraMonth ? 1700 : 0);
    assert.equal(row.people.mother.salaryExtra, extraMonth ? 1100 : 0);
    assert.equal(row.household.salaryExtra, extraMonth ? 2800 : 0);
    assert.equal(row.household.income, ordinary.household.income);
    assert.equal(row.household.expenses, ordinary.household.expenses);
    assert.equal(row.household.remaining, ordinary.household.remaining);
    assert.equal(row.bankDebtMonthly, ordinary.bankDebtMonthly);
    assert.equal(row.bankDebtRatio, ordinary.bankDebtRatio);
    for (const role of ['buyer1', 'buyer2', 'mother', 'sister']) {
      const person = row.people[role];
      assert.equal(person.common, ordinary.people[role].common);
      close(person.externalIncome, person.income + person.salaryExtra + person.extraordinaryIncome, .001);
      close(person.cashRemaining, ordinary.people[role].cashRemaining + person.salaryExtra, .001);
    }
    close(row.household.externalIncome, row.household.income + row.household.salaryExtra, .001);
    close(Object.values(row.people).reduce((sum, person) => sum + person.externalIncome, 0), row.household.externalIncome, .001);
    close(Object.values(row.people).reduce((sum, person) => sum + person.cashRemaining, 0), row.household.cashRemaining, .001);
  }
  close(timeline.months.reduce((sum, row) => sum + row.household.salaryExtra, 0), 11200, .001);
  assert.deepEqual(source, before);
});

test('a partial extra-pay calendar credits only its known month and discloses the unallocated remainder', () => {
  const source = fixture(); source.familyPlan.extraPayMonths = {buyer2: [6], mother: [6, 12]};
  const result = calculateFamilyTimeline(source, {startMonth: '2027-01', months: 12});
  assert.equal(result.valid, true);
  assert.equal(result.annualExtras.people.buyer2, 3400);
  assert.equal(result.annualExtras.scheduledPeople.buyer2, 1700);
  assert.equal(result.annualExtras.unallocatedPeople.buyer2, 1700);
  assert.equal(result.annualExtras.scheduledTotal, 3900);
  assert.equal(result.annualExtras.unallocatedTotal, 1700);
  assert.deepEqual(result.annualExtras.pendingPeople, ['buyer2']);
  assert.equal(result.months[5].people.buyer2.salaryExtra, 1700);
  assert.equal(result.months[11].people.buyer2.salaryExtra, 0);
  assert.equal(result.months[11].people.mother.salaryExtra, 1100);
});

test('a separate net extra-pay amount leaves ordinary salary, sharing and bank debt unchanged', () => {
  const source = fixture(); source.budget.familyIncomeMonthly = 93;
  source.familyPlan.extraPayMonths = {buyer2: [6, 12], mother: [6, 12]};
  source.familyPlan.extraPayAmounts = {buyer2: 1500.25, mother: 1075};
  const result = calculateFamilyTimeline(source, {startMonth: '2027-06', months: 1}), row = result.months[0];
  assert.equal(result.valid, true);
  assert.equal(row.people.buyer2.income, 1700);
  assert.equal(row.people.buyer2.salaryExtra, 1500.25);
  assert.equal(row.people.mother.income, 1193);
  assert.equal(row.people.mother.salaryExtra, 1075);
  assert.equal(row.people.mother.externalIncome, 2268);
  assert.equal(result.annualExtras.people.buyer2, 3000.50);
  assert.equal(result.annualExtras.people.mother, 2150);
  assert.equal(result.persons.find(person => person.id === 'buyer2').extraPayAmountEstimated, false);
  assert.ok(!result.warnings.some(warning => warning.includes('mismo neto')));
});

test('extra-pay calendar shapes and amounts reject invalid values without losing errors on normalization', () => {
  for (const raw of [
    {extraPayMonths: []}, {extraPayMonths: {buyer2: null}}, {extraPayMonths: {buyer2: [6, 6]}},
    {extraPayMonths: {buyer2: [0, 12]}}, {extraPayMonths: {buyer2: [6, 13]}},
    {extraPayMonths: {buyer2: [6.5]}}, {extraPayMonths: {buyer2: ['unknown']}},
    {extraPayAmounts: []}, {extraPayAmounts: {buyer2: -1}}, {extraPayAmounts: {buyer2: ''}},
    {extraPayAmounts: {buyer2: Infinity}},
  ]) {
    assert.equal(validateFamilyPlan(raw).valid, false, JSON.stringify(raw));
    assert.equal(validateFamilyPlan(normalizeFamilyPlan(raw)).valid, false, JSON.stringify(raw));
  }
  const source = fixture(); source.familyPlan.extraPayMonths = {buyer1: [6]};
  assert.equal(calculateFamilyTimeline(source).valid, false);
  source.familyPlan.extraPayMonths = {buyer2: [6, 11, 12]};
  assert.equal(calculateFamilyTimeline(source).valid, false);
  source.familyPlan.extraPayMonths = {buyer2: [6, 12]};
  source.familyPlan.extraPayAmounts = {buyer2: 0};
  assert.equal(calculateFamilyTimeline(source).valid, true);
  const raw = {extraPayMonths: {buyer2: [6, 12]}, extraPayAmounts: {buyer2: 1700}};
  const normalized = normalizeFamilyPlan(raw); normalized.extraPayMonths.buyer2.push(1); normalized.extraPayAmounts.buyer2 = 1;
  assert.deepEqual(raw, {extraPayMonths: {buyer2: [6, 12]}, extraPayAmounts: {buyer2: 1700}});
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

test('a fixed contribution to mother replaces the renting pool without counting the money twice', () => {
  const source = fixture();
  source.budget.foodMonthly = 500.01; source.budget.utilitiesMonthly = 200.02; source.budget.storageMonthly = 40.03;
  source.familyPlan.purchaseMonth = '2027-03'; source.familyPlan.motherLoanStartMonth = '2027-01';
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'living-pool', includeUniversity: true, motherContributionMonthly: '1100.01'};
  const baseline = structuredClone(source); baseline.familyPlan.currentAllocation.motherContributionMonthly = 0;
  const timeline = calculateFamilyTimeline(source, {startMonth: '2026-10', months: 8});
  const original = calculateFamilyTimeline(baseline, {startMonth: '2026-10', months: 8});
  assert.equal(timeline.valid, true);
  assert.equal(timeline.plan.currentAllocation.motherContributionMonthly, 1100.01);
  assert.ok(timeline.warnings.some(warning => warning.includes('sustituye el reparto por porcentajes')));
  const october = timeline.months[0];
  assert.equal(october.people.buyer1.rent, 1000);
  for (const [field, expected] of [['food', 500.01], ['utilities', 200.02], ['commonOther', 40.03]]) {
    assert.equal(october.people.mother[field], expected);
    assert.equal(october.people.buyer2[field], 0);
  }
  assert.equal(october.people.buyer2.university, 450);
  assert.equal(october.people.mother.university, 0);
  assert.equal(october.people.buyer2.livingContributionPaid, 1100.01);
  assert.equal(october.people.mother.livingContributionReceived, 1100.01);
  assert.equal(october.people.mother.internalReceived, 0);
  assert.equal(october.people.sister.expenses, 0);
  for (const [index, row] of timeline.months.entries()) {
    assert.deepEqual(row.household.externalIncome, original.months[index].household.externalIncome);
    assert.equal(row.household.expenses, original.months[index].household.expenses);
    assert.equal(row.household.cashRemaining, original.months[index].household.cashRemaining);
    assert.equal(row.bankDebtMonthly, original.months[index].bankDebtMonthly);
    assert.equal(row.bankDebtRatio, original.months[index].bankDebtRatio);
    close(Object.values(row.people).reduce((sum, person) => sum + person.expenses - person.internalReceived - person.livingContributionReceived, 0), row.household.expenses, .001);
    close(Object.values(row.people).reduce((sum, person) => sum + person.cashRemaining, 0), row.household.cashRemaining, .001);
  }
});

test('renting contributions conserve the household cash while revealing the brother ordinary-month deficit', () => {
  const source = fixture(); source.budget.incomes[1].monthly = 1430.06;
  source.familyPlan.purchaseMonth = '2027-03'; source.familyPlan.motherLoanStartMonth = '2027-01';
  source.familyPlan.university.amount = 565.63;
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: 0, otherCostMode: 'living-pool', includeUniversity: false, motherContributionMonthly: 1100};
  source.familyPlan.personalCommitments = [
    {id: 'apple-tv', label: 'Apple TV', owner: 'buyer2', kind: 'expense', monthly: 10},
    {id: 'gym', label: 'Gimnasio', owner: 'buyer2', kind: 'expense', monthly: 15},
    {id: 'crunchyroll', label: 'Crunchyroll de la hermana', owner: 'buyer2', kind: 'expense', monthly: 5},
  ];
  source.familyPlan.publicTransport = {buyer2Quarterly: 50, sisterQuarterly: 50, motherMonthly: 70, sisterPayerMode: 'income-dependent'};
  const withoutContribution = structuredClone(source); withoutContribution.familyPlan.currentAllocation.motherContributionMonthly = 0;
  const october = calculateFamilyTimeline(source, {startMonth: '2026-10', months: 1}).months[0];
  const baseline = calculateFamilyTimeline(withoutContribution, {startMonth: '2026-10', months: 1}).months[0];
  assert.equal(october.people.buyer2.personalExpense, 30);
  assert.equal(october.people.buyer2.fixedPersonalDebt, 0);
  assert.equal(october.people.buyer2.publicTransportExpense, 25);
  assert.equal(october.people.buyer2.expenses, 1720.63);
  assert.equal(october.people.buyer2.cashRemaining, -290.57);
  assert.equal(october.needsFamilyTopUp, true);
  assert.equal(october.people.sister.expenses, 0);
  assert.equal(october.people.sister.cashRemaining, 0);
  close(october.people.buyer2.cashRemaining - baseline.people.buyer2.cashRemaining, -1100, .001);
  close(october.people.mother.cashRemaining - baseline.people.mother.cashRemaining, 1100, .001);
  assert.equal(october.household.externalIncome, baseline.household.externalIncome);
  assert.equal(october.household.expenses, baseline.household.expenses);
  assert.equal(october.household.cashRemaining, baseline.household.cashRemaining);
  assert.equal(october.bankDebtMonthly, baseline.bankDebtMonthly);
  const result = calculateFamilyTimeline(source, {startMonth: '2026-10', months: 1});
  assert.ok(result.warnings.some(warning => warning.includes('Su déficit queda visible')));
});

test('the fixed contribution ends at purchase and leaves the agreed worker ownership allocation unchanged', () => {
  const source = fixture(); source.familyPlan.sharedCostMode = 'workers'; source.familyPlan.purchaseAllocation = 'shared-household';
  source.familyPlan.purchaseMonth = '2027-03'; source.familyPlan.motherLoanStartMonth = '2027-01';
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'living-pool', includeUniversity: true, motherContributionMonthly: 1100};
  const baseline = structuredClone(source); baseline.familyPlan.currentAllocation.motherContributionMonthly = 0;
  const result = calculateFamilyTimeline(source, {startMonth: '2027-02', months: 3});
  const original = calculateFamilyTimeline(baseline, {startMonth: '2027-02', months: 3});
  assert.equal(result.months[0].household.livingContributionTransfers, 1100);
  for (const [index, row] of result.months.entries()) {
    if (!index) continue;
    assert.equal(row.household.livingContributionTransfers, 0);
    for (const person of Object.values(row.people)) {
      assert.equal(person.livingContributionPaid, 0);
      assert.equal(person.livingContributionReceived, 0);
    }
    assert.deepEqual(row, original.months[index]);
  }
  source.familyPlan.currentAllocation.enabled = false;
  assert.equal(calculateFamilyTimeline(source, {startMonth: '2027-02', months: 1}).months[0].household.livingContributionTransfers, 0);
});

test('a combined renting budget pays university first and transfers only the remainder to mother', () => {
  const source = fixture(); source.budget.incomes[1].monthly = 1430.06;
  source.familyPlan.purchaseMonth = '2027-03'; source.familyPlan.motherLoanStartMonth = '2027-01';
  source.familyPlan.university.amount = 565.63;
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'living-pool', includeUniversity: true, motherContributionMonthly: 1100, contributionIncludesUniversity: true};
  source.familyPlan.personalCommitments = [
    {id: 'apple-tv', label: 'Apple TV', owner: 'buyer2', kind: 'expense', monthly: 10},
    {id: 'gym', label: 'Gimnasio', owner: 'buyer2', kind: 'expense', monthly: 15},
    {id: 'crunchyroll', label: 'Crunchyroll', owner: 'buyer2', kind: 'expense', monthly: 5},
  ];
  source.familyPlan.publicTransport = {buyer2Quarterly: 50, sisterQuarterly: 50, motherMonthly: 70, sisterPayerMode: 'income-dependent'};
  const result = calculateFamilyTimeline(source, {startMonth: '2026-10', months: 6}), october = result.months[0];
  assert.equal(result.valid, true);
  assert.equal(october.people.buyer2.university, 565.63);
  assert.equal(october.people.buyer2.livingContributionPaid, 534.37);
  assert.equal(october.people.mother.livingContributionReceived, 534.37);
  assert.equal(october.household.livingContributionTransfers, 534.37);
  assert.equal(october.people.mother.university, 0);
  assert.equal(october.people.buyer2.food, 0);
  assert.equal(october.people.buyer2.utilities, 0);
  assert.equal(october.people.buyer2.expenses, 1155);
  assert.equal(october.people.buyer2.cashRemaining, 275.06);
  assert.equal(october.people.sister.expenses, 0);
  assert.ok(result.warnings.some(warning => warning.includes('presupuesto del hermano incluye la universidad')));
  const netTransfer = structuredClone(source);
  netTransfer.familyPlan.currentAllocation.motherContributionMonthly = 534.37;
  netTransfer.familyPlan.currentAllocation.contributionIncludesUniversity = false;
  const comparison = calculateFamilyTimeline(netTransfer, {startMonth: '2026-10', months: 6});
  for (const [index, row] of result.months.entries()) {
    assert.deepEqual(row, comparison.months[index]);
    close(Object.values(row.people).reduce((sum, person) => sum + person.cashRemaining, 0), row.household.cashRemaining, .001);
  }
});

test('the whole combined budget reaches mother after university ends if purchase has not occurred', () => {
  const source = fixture(); source.familyPlan.purchaseMonth = '2027-09'; source.familyPlan.motherLoanStartMonth = '2027-09';
  source.familyPlan.university = {amount: 565.63, endMonth: '2027-06'};
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'living-pool', includeUniversity: true, motherContributionMonthly: 1100, contributionIncludesUniversity: true};
  const rows = calculateFamilyTimeline(source, {startMonth: '2027-06', months: 4}).months;
  assert.equal(rows[0].people.buyer2.university, 565.63);
  assert.equal(rows[0].people.buyer2.livingContributionPaid, 534.37);
  for (const row of rows.slice(1, 3)) {
    assert.equal(row.people.buyer2.university, 0);
    assert.equal(row.people.buyer2.livingContributionPaid, 1100);
    assert.equal(row.people.mother.livingContributionReceived, 1100);
    assert.equal(row.people.buyer2.food, 0);
    close(row.people.buyer2.university + row.people.buyer2.livingContributionPaid, 1100, .001);
    close(Object.values(row.people).reduce((sum, person) => sum + person.expenses - person.internalReceived - person.livingContributionReceived, 0), row.household.expenses, .001);
  }
  assert.equal(rows[3].household.livingContributionTransfers, 0);
});

test('a university bill larger than the combined budget keeps the transfer nonnegative and all tuition visible', () => {
  const source = fixture(); source.familyPlan.purchaseMonth = '2027-03'; source.familyPlan.motherLoanStartMonth = '2027-03';
  source.familyPlan.university.amount = 565.63;
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'living-pool', includeUniversity: true, motherContributionMonthly: 500, contributionIncludesUniversity: true};
  const result = calculateFamilyTimeline(source, {startMonth: '2026-10', months: 1}), october = result.months[0];
  assert.equal(october.people.buyer2.livingContributionPaid, 0);
  assert.equal(october.people.mother.livingContributionReceived, 0);
  assert.equal(october.people.buyer2.university, 565.63);
  assert.equal(october.people.mother.university, 0);
  assert.equal(october.people.buyer2.food, 0);
  assert.equal(october.people.buyer2.utilities, 0);
  assert.equal(october.people.mother.food, 400);
  assert.equal(october.people.mother.utilities, 200);
  assert.ok(result.warnings.some(warning => warning.includes('universidad supera el presupuesto combinado')));
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
  assert.equal(january.people.buyer1.externalIncome, 5800);
  assert.equal(january.people.buyer1.salaryExtra, 0);
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

const sisterSupportFixture = () => {
  const source = fixture();
  source.familyPlan.sharedCostMode = 'workers';
  source.familyPlan.purchaseAllocation = 'shared-household';
  source.familyPlan.purchaseMonth = '2026-12';
  source.familyPlan.sisterJob.enabled = false;
  source.budget.householdIncomes.find(person => person.id === 'sister').monthly = 100;
  return source;
};

test('after purchase an explicit sister deficit is covered equally by the other three without changing household or bank debt', () => {
  const source = sisterSupportFixture();
  const baseline = calculateFamilyTimeline(source, {months: 6});
  source.familyPlan.sisterSupport = {enabled: true, savingsAtPurchase: 0};
  const before = structuredClone(source), supported = calculateFamilyTimeline(source, {months: 6});
  assert.equal(supported.valid, true);
  for (let index = 0; index < supported.months.length; index++) {
    const row = supported.months[index], original = baseline.months[index];
    const sister = row.people.sister, deficit = Math.max(0, -original.people.sister.remaining);
    assert.equal(row.household.income, original.household.income);
    assert.equal(row.household.expenses, original.household.expenses);
    assert.equal(row.household.remaining, original.household.remaining);
    assert.equal(row.bankDebtMonthly, original.bankDebtMonthly);
    assert.equal(row.bankDebtRatio, original.bankDebtRatio);
    assert.equal(sister.income, original.people.sister.income);
    assert.equal(sister.expenses, original.people.sister.expenses);
    assert.equal(sister.internalReceived, 0);
    assert.equal(sister.remainingBeforeSupport, original.people.sister.remaining);
    if (row.phase === 'renting') {
      assert.equal(row.sisterSupportApplied, false);
      assert.deepEqual(row.people, original.people);
      assert.equal(sister.familySupportReceived, 0);
    } else {
      assert.equal(row.sisterSupportApplied, true);
      assert.ok(deficit > 0);
      assert.equal(sister.remaining, 0);
      assert.equal(sister.familySupportReceived, deficit);
      assert.equal(sister.remainingWithoutSavings, 0);
      for (const role of ['buyer1', 'buyer2', 'mother']) {
        close(row.people[role].familySupportPaid, deficit / 3, .011);
        close(row.people[role].expenses - original.people[role].expenses, row.people[role].familySupportPaid, .001);
        close(original.people[role].remaining - row.people[role].remaining, row.people[role].familySupportPaid, .001);
        assert.equal(row.people[role].internalReceived, original.people[role].internalReceived);
      }
      close(['buyer1', 'buyer2', 'mother'].reduce((sum, role) => sum + row.people[role].familySupportPaid, 0), deficit, .001);
    }
    close(Object.values(row.people).reduce((sum, person) => sum + person.remaining, 0), row.household.remaining, .001);
    close(Object.values(row.people).reduce((sum, person) => sum + person.expenses - person.internalReceived - person.familySupportReceived, 0), row.household.expenses, .001);
  }
  assert.deepEqual(source, before);
});

test('sister savings are drawn once across full, partial and depleted months before the family contributes', () => {
  const source = sisterSupportFixture(), baseline = calculateFamilyTimeline(source, {months: 6});
  const initialDeficit = -baseline.months[2].people.sister.remaining;
  assert.ok(initialDeficit > 0);
  const savings = Math.round(initialDeficit * 150) / 100;
  source.familyPlan.sisterSupport = {enabled: true, savingsAtPurchase: savings};
  const rows = calculateFamilyTimeline(source, {months: 6}).months;
  const first = rows[2], second = rows[3], third = rows[4], fourth = rows[5];
  assert.equal(rows[1].people.sister.savingsUsed, 0);
  assert.equal(rows[1].people.sister.savingsBalance, savings);
  assert.equal(first.people.sister.savingsUsed, initialDeficit);
  assert.equal(first.people.sister.familySupportReceived, 0);
  close(first.people.sister.savingsBalance, savings - initialDeficit, .001);
  assert.equal(first.people.sister.remainingWithoutSavings, -initialDeficit);
  close(second.people.sister.savingsUsed, savings - initialDeficit, .001);
  close(second.people.sister.familySupportReceived + second.people.sister.savingsUsed, -second.people.sister.remainingBeforeSupport, .001);
  assert.equal(second.people.sister.savingsBalance, 0);
  for (const row of [third, fourth]) {
    assert.equal(row.people.sister.savingsUsed, 0);
    assert.equal(row.people.sister.savingsBalance, 0);
    assert.equal(row.people.sister.familySupportReceived, -row.people.sister.remainingBeforeSupport);
  }
  for (const row of [first, second, third, fourth]) {
    assert.equal(row.people.sister.remaining, 0);
    assert.equal(row.people.sister.income, 100);
    assert.equal(row.household.savingsUsed, row.people.sister.savingsUsed);
    close(row.household.cashRemaining, row.household.remaining + row.household.savingsUsed, .001);
    close(Object.values(row.people).reduce((sum, person) => sum + person.remaining, 0), row.household.remaining + row.household.savingsUsed, .001);
    close(Object.values(row.people).reduce((sum, person) => sum + person.cashRemaining, 0), row.household.cashRemaining, .001);
    close(Object.values(row.people).reduce((sum, person) => sum + person.expenses - person.internalReceived - person.familySupportReceived, 0), row.household.expenses, .001);
  }
  close(rows.reduce((sum, row) => sum + row.people.sister.savingsUsed, 0), savings, .001);
});

test('sister support never silently creates savings from a monthly margin or borrows purchase savings', () => {
  const source = sisterSupportFixture();
  source.cash.savings = 10000;
  source.familyPlan.purchaseMonth = '2027-05';
  source.familyPlan.motherLoanStartMonth = '2027-03';
  source.familyPlan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'living-pool', includeUniversity: true};
  source.familyPlan.sisterSupport = {enabled: true, savingsAtPurchase: 0};
  const rows = calculateFamilyTimeline(source, {months: 10}).months;
  assert.ok(rows.slice(0, 7).every(row => row.people.sister.remaining === 100));
  const firstOwned = rows.find(row => row.phase === 'owning');
  assert.ok(firstOwned.people.sister.remainingBeforeSupport < 0);
  assert.equal(firstOwned.people.sister.savingsUsed, 0);
  assert.equal(firstOwned.people.sister.savingsBalance, 0);
  assert.equal(firstOwned.people.sister.familySupportReceived, -firstOwned.people.sister.remainingBeforeSupport);
});

test('sister support preserves unknown costs and honestly retains a donor deficit', () => {
  const source = sisterSupportFixture();
  source.familyPlan.sisterSupport = {enabled: true, savingsAtPurchase: 500};
  source.familyLoan.rate = null;
  const unknown = calculateFamilyTimeline(source, {months: 4});
  const owned = unknown.months[2];
  assert.equal(owned.people.sister.remaining, null);
  assert.equal(owned.people.sister.familySupportReceived, 0);
  assert.equal(owned.people.sister.savingsUsed, 0);
  assert.equal(owned.people.sister.savingsBalance, 500);
  assert.ok(unknown.warnings.some(warning => warning.includes('No se consumen ahorros')));

  const insufficient = sisterSupportFixture();
  insufficient.budget.incomes[0].monthly = 1;
  insufficient.familyPlan.sisterSupport = {enabled: true, savingsAtPurchase: 0};
  const supported = calculateFamilyTimeline(insufficient, {months: 4});
  assert.equal(supported.months[2].people.sister.remaining, 0);
  assert.ok(supported.months[2].people.buyer1.remaining < 0);
  assert.equal(supported.months[2].needsFamilyTopUp, true);
  assert.ok(supported.warnings.some(warning => warning.includes('deja a otra persona con saldo negativo')));
});

test('explicit sister savings apply at the first owning month shown when purchase is already in the past', () => {
  const source = sisterSupportFixture();
  source.familyPlan.sisterSupport = {enabled: true, savingsAtPurchase: 75.25};
  const result = calculateFamilyTimeline(source, {startMonth: '2027-03', months: 2});
  assert.equal(result.valid, true);
  assert.equal(result.months[0].phase, 'owning');
  assert.equal(result.months[0].people.sister.savingsUsed, 75.25);
  assert.equal(result.months[0].people.sister.savingsBalance, 0);
  assert.equal(result.months[1].people.sister.savingsUsed, 0);
  assert.ok(result.warnings.some(warning => warning.includes('primer mes de vivienda comprada mostrado')));
});

test('a scheduled extra salary covers a sister deficit before using her savings or requesting family support', () => {
  const source = sisterSupportFixture();
  source.familyPlan.sisterSupport = {enabled: true, savingsAtPurchase: 100};
  source.budget.householdIncomes.find(person => person.id === 'sister').payments = 14;
  source.familyPlan.extraPayMonths = {sister: [6, 12]};
  source.familyPlan.extraPayAmounts = {sister: 1000};
  const row = calculateFamilyTimeline(source, {startMonth: '2027-06', months: 1}).months[0], sister = row.people.sister;
  assert.ok(sister.remainingBeforeSupport < 0);
  assert.equal(sister.salaryExtra, 1000);
  assert.ok(sister.cashBeforeSupport > 0);
  assert.equal(sister.cashRemaining, sister.cashBeforeSupport);
  assert.equal(sister.savingsUsed, 0);
  assert.equal(sister.savingsBalance, 100);
  assert.equal(sister.familySupportReceived, 0);
  assert.equal(row.needsFamilyTopUp, false);
  for (const role of ['buyer1', 'buyer2', 'mother']) assert.equal(row.people[role].familySupportPaid, 0);
  close(Object.values(row.people).reduce((sum, person) => sum + person.cashRemaining, 0), row.household.cashRemaining, .001);
});

test('a dated one-off receipt is available before sister support and does not become ordinary recurring income', () => {
  const source = sisterSupportFixture();
  source.familyPlan.sisterSupport = {enabled: true, savingsAtPurchase: 100};
  source.familyPlan.extraordinaryReceipt = {enabled: true, month: '2027-01', amount: 1000, taxReserve: 50, owner: 'sister', confirmed: true};
  const rows = calculateFamilyTimeline(source, {startMonth: '2027-01', months: 2}).months;
  const january = rows[0].people.sister, february = rows[1].people.sister;
  assert.equal(january.income, 100);
  assert.equal(january.externalIncome, 1100);
  assert.equal(january.familySupportReceived, 0);
  assert.equal(january.savingsUsed, 0);
  assert.equal(january.savingsBalance, 100);
  assert.ok(january.cashRemaining > 0);
  assert.equal(february.income, 100);
  assert.equal(february.externalIncome, 100);
  assert.equal(february.extraordinaryIncome, 0);
  assert.equal(february.savingsUsed, 100);
  assert.ok(february.familySupportReceived > 0);
  assert.equal(february.cashRemaining, 0);
  for (const row of rows) close(Object.values(row.people).reduce((sum, person) => sum + person.cashRemaining, 0), row.household.cashRemaining, .001);
});
