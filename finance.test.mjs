import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCENARIO, normalizeScenario, monthlyPayment, amortizeLoan, calculateScenario,
  calculateTransferTax, standardCataloniaTransferTax, validateScenario,
  calculateGiftTax, calculateMotherTransfer,
} from './finance.mjs';

const close = (actual, expected, tolerance = 0.005) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
const youngBuyers = [
  { label: 'A', share: 0.5, rate: 0.05, eligibilityConfirmed: true },
  { label: 'B', share: 0.5, rate: 0.05, eligibilityConfirmed: true },
];

test('French amortization matches bank illustration and reconciles principal', () => {
  close(monthlyPayment(200000, 2.7, 30), 811.1964);
  close(monthlyPayment(200000, 3.7, 30), 920.56597);
  const loan = amortizeLoan(200000, 2.7, 30, { includeSchedule: true });
  assert.equal(loan.schedule.length, 360);
  close(loan.schedule.reduce((total, row) => total + row.principal, 0), 200000);
  close(loan.totalPaid, loan.principal + loan.totalInterest);
  close(loan.schedule.at(-1).balance, 0);
});

test('zero interest, zero capital, and invalid terms have defined behavior', () => {
  close(monthlyPayment(60000, 0, 10), 500);
  assert.equal(monthlyPayment(0, 8, 5), 0);
  assert.throws(() => monthlyPayment(-1, 3, 30), RangeError);
  assert.throws(() => monthlyPayment(1, -1, 30), RangeError);
  assert.throws(() => monthlyPayment(1, 3, 0), RangeError);
  assert.throws(() => monthlyPayment(1, 3, 30.01), RangeError);
});

test('tax follows reference value, ownership shares, and confirmed relief', () => {
  const tax = calculateTransferTax({ purchasePrice: 250000, referenceValue: 280000, buyers: [youngBuyers[0], { share: 0.5, rate: 0.1 }] });
  assert.equal(tax.base, 280000);
  assert.equal(tax.buyers[0].amount, 7000);
  assert.equal(tax.buyers[1].amount, 14000);
  assert.equal(tax.total, 21000);
  const unconfirmed = calculateTransferTax({ purchasePrice: 250000, buyers: [{ share: 1, rate: 0.05, eligibilityConfirmed: false }] });
  assert.equal(unconfirmed.total, 25000);
  assert.equal(unconfirmed.warnings.length, 1);
});

test('Catalonia progressive general tariff includes boundaries and marginal brackets', () => {
  assert.equal(standardCataloniaTransferTax(250000), 25000);
  assert.equal(standardCataloniaTransferTax(600000), 60000);
  assert.equal(standardCataloniaTransferTax(900000), 93000);
  assert.equal(standardCataloniaTransferTax(1500000), 165000);
  assert.equal(standardCataloniaTransferTax(1600000), 178000);
  const half = calculateTransferTax({ purchasePrice: 900000, buyers: [{ share: 0.5, rate: 0.1 }, { share: 0.5, rate: 0.05, eligibilityConfirmed: true }] });
  assert.equal(half.total, 69000);
});

test('first delivery uses purchase VAT and AJD base, never ITP on top', () => {
  const tax = calculateTransferTax({ purchasePrice: 250000, referenceValue: 280000, mode: 'new', vatRate: 0.1, ajdRate: 0.015 });
  assert.equal(tax.vat, 25000);
  assert.equal(tax.ajd, 4200);
  assert.equal(tax.total, 29200);
});

test('financing uses lower appraisal but tax does not use appraisal', () => {
  const result = calculateScenario({ purchasePrice: 250000, appraisalValue: 220000, referenceValue: 260000, tax: { buyers: youngBuyers } });
  assert.equal(result.mortgage.principal, 176000);
  assert.equal(result.tax.total, 13000);
  assert.equal(result.cash.priceContribution, 74000);
});

test('deposit is an advance against price, not an extra acquisition cost', () => {
  const base = { purchasePrice: 250000, tax: { buyers: youngBuyers }, purchaseCosts: { appraisal: 500, legal: 1000, notary: 1000, registry: 500, agency: 500, other: 1500 } };
  const one = calculateScenario({ ...base, cash: { depositPercent: 0.05 } });
  const two = calculateScenario({ ...base, cash: { depositPercent: 0.1 } });
  assert.equal(one.cash.totalRequired, 67500);
  assert.equal(two.cash.totalRequired, one.cash.totalRequired);
  assert.equal(two.cash.beforeMortgageRequired - one.cash.beforeMortgageRequired, 12500);
  assert.equal(one.cash.beforeMortgageRequired + one.cash.closingNetPayment, one.cash.totalRequired);
  assert.equal(two.cash.beforeMortgageRequired + two.cash.closingNetPayment, two.cash.totalRequired);
});

test('ICF replaces own contribution, remains debt, and does not invent 250000 cap', () => {
  const result = calculateScenario({ purchasePrice: 300000, icf: { enabled: true, eligibilityConfirmed: true }, tax: { buyers: youngBuyers }, purchaseCosts: { appraisal: 500 } });
  assert.equal(result.valid, true);
  assert.equal(result.mortgage.principal, 240000);
  assert.equal(result.icf.principal, 50000);
  close(result.icf.deferredMonthlyPayment, 50000 / 60);
  assert.equal(result.cash.priceContribution, 10000);
  assert.equal(result.cash.totalRequired, 25500);
  assert.equal(result.lifetime.totalDebtPrincipal, 290000);
});

test('full financing at deed still requires money for deposit before deed', () => {
  const result = calculateScenario({ tax: { buyers: youngBuyers }, icf: { enabled: true }, familyLoan: { enabled: true, amount: 12500, rate: 8, years: 7 }, cash: { savings: 0, depositPercent: 0.1, familyLoanAvailableBeforeDeposit: false } });
  assert.equal(result.cash.fundingGap, 0);
  assert.equal(result.cash.beforeMortgageGap, 25000);
  assert.equal(result.cash.closingNetPayment, -12500);
  assert.equal(result.timeline.find((row) => row.id === 'signing').balance, 0);
});

test('auto-sized mother loan is capped, and own upfront fee is financed once', () => {
  const result = calculateScenario({ familyLoan: { enabled: true, rate: 8, years: 10, originationFeePercent: 1 }, cash: { savings: 20000 } });
  close(result.familyLoan.principal, 55000 / 0.99);
  close(result.cash.fundingGap, 0);
  assert.ok(result.budget.familyLoanMonthly > 0);
  const capped = calculateScenario({ familyLoan: { enabled: true, rate: 8, years: 10 } });
  assert.equal(capped.familyLoan.principal, 60000);
  assert.equal(capped.cash.fundingGap, 15000);
});

test('unknown mother loan terms never become an invented zero-interest loan', () => {
  const result = calculateScenario({ familyLoan: { enabled: true, amount: 20000 } });
  assert.equal(result.familyLoan.monthlyPayment, null);
  assert.equal(result.familyLoan.totalInterest, null);
  assert.equal(result.budget.incomplete, true);
  assert.equal(result.lifetime.incomplete, true);
});

test('regular salary and annualized 14 payments are shown separately', () => {
  const result = calculateScenario({ budget: { incomes: [{ monthly: 2000, payments: 12 }, { monthly: 1500, payments: 14 }], externalHomeInsuranceAnnual: 360, existingDebtMonthly: 250 } });
  assert.equal(result.budget.regularIncome, 3500);
  assert.equal(result.budget.averagedIncome, 3750);
  assert.equal(result.budget.extraPaysAnnual, 3000);
  assert.equal(result.budget.remainingAveraged - result.budget.remainingRegular, 250);
  close(result.budget.debtRatio, (result.mortgage.monthlyPayment + 250) / 3500, 0.00001);
});

test('annual and quarterly products are provisioned; upfront premium is not charged twice monthly', () => {
  const result = calculateScenario({ mortgage: { discounts: [
    { id: 'life', label: 'Vida', enabled: true, points: 0.4, cost: 240, frequency: 'annual' },
    { id: 'home', label: 'Hogar', enabled: true, points: 0.1, cost: 90, frequency: 'quarterly' },
    { id: 'protection', enabled: true, points: 0.1, cost: 1800, frequency: 'upfront', coverageYears: 5 },
  ] }, budget: { externalHomeInsuranceAnnual: 1000 } });
  assert.equal(result.mortgage.rate, 3.1);
  assert.equal(result.cash.upfrontInsurance, 1800);
  assert.equal(result.budget.insuranceMonthly, 50);
  assert.equal(result.budget.upfrontInsuranceMonthlyEquivalent, 30);
  assert.equal(result.bonuses.monthlyProductCost, 80);
  close(result.budget.homeMonthly, result.mortgage.monthlyPayment + 50);
});

test('unknown discount points are never guessed and unknown premiums are flagged', () => {
  const result = calculateScenario({ mortgage: { discounts: [{ id: 'home', enabled: true, points: null, cost: null, frequency: 'annual' }] } });
  assert.equal(result.mortgage.rate, 3.7);
  assert.equal(result.bonuses.missingDiscountBreakdown, true);
  assert.equal(result.budget.incomplete, true);
  assert.ok(result.budget.missingQuotes.length > 0);
});

test('all monthly debts, property provisions, and living costs affect disposable money', () => {
  const result = calculateScenario({ familyLoan: { enabled: true, amount: 12000, rate: 0, years: 5 }, budget: { incomes: [{ monthly: 4000, payments: 12 }], existingDebtMonthly: 200, utilitiesMonthly: 200, carMonthly: 100, foodMonthly: 400, otherMonthly: 100, ibiAnnual: 1200, wasteAnnual: 120, maintenanceAnnual: 1200, externalHomeInsuranceAnnual: 360 } });
  const expected = result.mortgage.monthlyPayment + 200 + 200 + 100 + 400 + 100 + 100 + 10 + 100 + 30 + 200;
  close(result.budget.totalMonthly, expected);
  close(result.budget.remainingRegular, 4000 - expected);
  close(result.lifetime.acquisitionAndKnownInterest, result.cash.totalAcquisitionCost + result.mortgage.totalInterest);
});

test('stress lowers regular income and tests lost bonuses without changing a fixed base rate', () => {
  const result = calculateScenario({ mortgage: { discounts: [{ id: 'payroll', enabled: true, points: 0.4, cost: 0, frequency: 'monthly' }] }, budget: { incomes: [{ monthly: 4000, payments: 14 }], utilitiesMonthly: 200, externalHomeInsuranceAnnual: 360 }, stress: { incomeDropPercent: 20, expenseIncreasePercent: 10, loseDiscounts: true } });
  assert.equal(result.stress.regularIncome, 3200);
  close(result.stress.mortgageMonthly, monthlyPayment(200000, 3.7, 30));
  assert.ok(result.stress.remainingRegular < result.budget.remainingRegular);
});

test('invalid shares, negative money, impossible terms, and over-cap loan are rejected without NaN output', () => {
  for (const input of [
    { purchasePrice: -1 }, { mortgage: { years: 30.01 } },
    { tax: { buyers: [{ share: 0.4, rate: 0.05 }] } },
    { familyLoan: { enabled: true, amount: 60001, rate: 8, years: 5 } },
    { purchaseCosts: { renovations: -5 } }, { budget: { utilitiesMonthly: -1 } },
  ]) {
    const result = calculateScenario(input);
    assert.equal(result.valid, false);
    assert.ok(result.validation.errors.length > 0);
  }
});

test('calculator leaves its input and defaults unchanged', () => {
  const scenario = structuredClone(DEFAULT_SCENARIO);
  const before = JSON.stringify(scenario);
  calculateScenario(scenario);
  assert.equal(JSON.stringify(scenario), before);
  assert.equal(DEFAULT_SCENARIO.mortgage.discounts[0].enabled, false);
  assert.equal(validateScenario(scenario).valid, true);
});

test('mother-to-child gift uses notarized tariff and ordinary tariff without deed', () => {
  assert.equal(calculateGiftTax(60000).total, 3000);
  assert.equal(calculateGiftTax(60000, { publicDeed: false }).total, 4600);
  assert.equal(calculateGiftTax(300000).total, 17000);
  const split = calculateMotherTransfer({ amount: 60000, mode: 'gift' });
  assert.equal(split.giftTax, 3000);
  assert.equal(split.allocations[0].total, 1500);
  assert.equal(split.familyMonthlyRepayment, 0);
});

test('gift wealth coefficient applies marginal relief at a threshold', () => {
  const tax = calculateGiftTax(30000, { preExistingWealth: 500001 });
  assert.equal(tax.coefficient, 1.1);
  close(tax.marginalRelief, 149);
  close(tax.total, 1501);
  assert.equal(calculateGiftTax(30000, { preExistingWealth: 1000000 }).total, 1650.0000000000002);
});

test('95% first-home gift reduction is capped and never applied to siblings half-shares', () => {
  const onlyOwner = calculateMotherTransfer({ amount: 60000, mode: 'gift', allocations: [{ share: 1, giftReductionEligible: true }], ownershipShares: [1] });
  assert.equal(onlyOwner.allocations[0].reduction, 57000);
  assert.equal(onlyOwner.giftTax, 150);
  const capped = calculateGiftTax(100000, { reductionEligible: true, reductionOwnershipAllowed: true });
  assert.equal(capped.reduction, 60000);
  assert.equal(capped.total, 2000);
  const siblings = calculateMotherTransfer({ amount: 60000, mode: 'gift', allocations: [{ share: 0.5, giftReductionEligible: true }, { share: 0.5, giftReductionEligible: true }], ownershipShares: [0.5, 0.5] });
  assert.equal(siblings.giftTax, 3000);
  assert.ok(siblings.warnings.some((warning) => warning.includes('hermanos')));
});

test('automatic bank loan grosses up gift tax and notary fee deterministically', () => {
  const input = {
    tax: { buyers: youngBuyers }, icf: { enabled: true },
    purchaseCosts: { other: 5000 },
    familyLoan: { enabled: true, rate: 8, years: 7 },
    motherTransfer: { mode: 'gift', giftNotaryCost: 300 },
  };
  const result = calculateScenario(input);
  assert.equal(result.familyLoan.principal, 18736.85);
  close(result.motherTransfer.giftTax, result.familyLoan.principal * 0.05);
  assert.equal(result.cash.fundingGap, 0);
  assert.ok(result.cash.surplus < 0.01);
  close(result.cash.totalRequired, 17500 + result.motherTransfer.giftTax + 300);
  assert.equal(calculateScenario(input).familyLoan.principal, result.familyLoan.principal);
});

test('mother bank payment is counted once, internal repayment only affects borrower ratio', () => {
  const common = {
    familyLoan: { enabled: true, amount: 20000, rate: 8, years: 5 },
    budget: { incomes: [{ monthly: 4000, payments: 12 }], existingDebtMonthly: 200 },
  };
  const loan = calculateScenario({ ...common, motherTransfer: { mode: 'family-loan', familyRate: 0, familyYears: 5 } });
  close(loan.budget.borrowerFamilyRepaymentMonthly, 20000 / 60);
  close(loan.budget.debtRatio, (loan.mortgage.monthlyPayment + 200 + 20000 / 60) / 4000);
  close(loan.budget.totalMonthly, loan.mortgage.monthlyPayment + 200 + loan.familyLoan.monthlyPayment);
  close(loan.lifetime.totalDebtPrincipal, loan.mortgage.principal + 20000);
  const gift = calculateScenario({ ...common, motherTransfer: { mode: 'gift' } });
  assert.equal(gift.budget.borrowerFamilyRepaymentMonthly, 0);
  close(gift.budget.debtRatio, (gift.mortgage.monthlyPayment + 200) / 4000);
  close(gift.budget.totalMonthly, loan.budget.totalMonthly);
});

test('unknown family repayment calendar leaves bank and consolidated loan calculations available', () => {
  const result = calculateScenario({ familyLoan: { enabled: true, amount: 20000, rate: 8, years: 5 } });
  assert.ok(result.familyLoan.monthlyPayment > 0);
  assert.equal(result.motherTransfer.familyMonthlyRepayment, null);
  assert.equal(result.budget.borrowerDebtRatioIncomplete, true);
  assert.equal(result.budget.incomplete, true);
  const invalid = calculateScenario({ familyLoan: { enabled: true }, motherTransfer: { mode: 'gift', allocations: [{ share: 0.2, preExistingWealth: 0 }] } });
  assert.equal(invalid.valid, false);
});

test('malformed imported structures return readable errors and never crash normalization or calculation', () => {
  const malformed = [
    null, [], 'not a scenario', 42,
    { tax: null }, { mortgage: [] }, { familyLoan: 'yes' }, { budget: false },
    { tax: { buyers: null } }, { tax: { buyers: [null] } }, { tax: { buyers: [[]] } },
    { mortgage: { discounts: {} } }, { mortgage: { discounts: [null] } },
    { budget: { incomes: null } }, { budget: { incomes: [null] } },
    { motherTransfer: { allocations: null } }, { motherTransfer: { allocations: [null] } },
  ];
  for (const input of malformed) {
    const before = JSON.stringify(input);
    const normalized = normalizeScenario(input);
    assert.ok(Array.isArray(normalized.tax.buyers));
    assert.ok(Array.isArray(normalized.mortgage.discounts));
    assert.ok(Array.isArray(normalized.budget.incomes));
    assert.ok(Array.isArray(normalized.motherTransfer.allocations));
    const validation = validateScenario(normalized);
    assert.equal(validation.valid, false, before);
    assert.ok(validation.errors.every((message) => typeof message === 'string'));
    assert.equal(calculateScenario(input).valid, false, before);
    assert.equal(calculateScenario(normalized).valid, false, before);
    assert.equal(JSON.stringify(input), before);
  }
});

test('numeric objects and counterfeit boolean imports are rejected without coercion exceptions', () => {
  const hostileNumber = JSON.parse('{"valueOf":null,"toString":null}');
  for (const input of [
    { purchasePrice: hostileNumber },
    { mortgage: { ltv: hostileNumber } },
    { tax: { buyers: [{ share: 1, rate: hostileNumber }] } },
    { mortgage: { discounts: [{ label: hostileNumber, id: 'bad', enabled: true, points: 0.4, cost: 100, frequency: 'annual' }] } },
    { familyLoan: { enabled: true, amount: hostileNumber } },
    { motherTransfer: { giftPublicDeed: 'false' } },
    { name: hostileNumber },
  ]) assert.equal(calculateScenario(input).valid, false);
  assert.equal(calculateScenario().valid, true);
});

test('other household residents and their extra payments improve cash flow without affecting borrower ratio', () => {
  const base = { budget: { incomes: [{ monthly: 2300, payments: 12 }, { monthly: 1700, payments: 12 }], familyIncomeMonthly: 250 } };
  const before = calculateScenario(base);
  const withMother = calculateScenario({ budget: { ...base.budget, householdIncomes: [
    { id: 'mother', monthly: 1600, payments: 14 }, { id: 'sister', monthly: 0, payments: 12 },
  ] } });
  assert.equal(withMother.budget.regularIncome, 4000);
  assert.equal(withMother.budget.averagedIncome, 4000);
  assert.equal(withMother.budget.householdRegularIncome, 1600);
  close(withMother.budget.householdAveragedIncome, 1600 * 14 / 12);
  assert.equal(withMother.budget.actualRegularIncome, 5850);
  close(withMother.budget.extraPaysAnnual, 3200);
  assert.equal(withMother.budget.borrowerExtraPaysAnnual, 0);
  close(withMother.budget.householdExtraPaysAnnual, 3200);
  assert.equal(withMother.budget.debtRatio, before.budget.debtRatio);
  assert.equal(withMother.budget.maximumMortgageByRatio, before.budget.maximumMortgageByRatio);
  close(withMother.budget.remainingRegular - before.budget.remainingRegular, 1600);
  close(withMother.stress.regularIncome - before.stress.regularIncome, 1600 * 0.9);
  const withSister = calculateScenario({ budget: { ...base.budget, householdIncomes: [
    { id: 'mother', monthly: 1600, payments: 14 }, { id: 'sister', monthly: 950, payments: 12 },
  ] } });
  assert.equal(withSister.budget.debtRatio, before.budget.debtRatio);
  assert.equal(withSister.budget.actualRegularIncome, 6800);
  close(withSister.budget.remainingRegular - withMother.budget.remainingRegular, 950);
  assert.ok(withSister.budget.familyDebtRatio < withMother.budget.familyDebtRatio);
});

test('legacy aggregate utility imports retain their exact cost and are not copied into detail', () => {
  const legacy = { budget: { utilitiesMonthly: 275, currentUtilitiesMonthly: 180, familyIncomeMonthly: 600 } };
  const s = normalizeScenario(legacy);
  assert.equal(s.budget.utilitiesMode, 'aggregate');
  assert.equal(s.budget.currentUtilitiesMode, 'aggregate');
  assert.equal(s.budget.utilityBreakdown.waterMonthly, 0);
  assert.equal(s.budget.householdIncomes[0].monthly, 0);
  const r = calculateScenario(s);
  assert.equal(r.budget.utilitiesMonthly, 275);
  assert.equal(r.budget.currentUtilitiesMonthly, 180);
  assert.equal(r.budget.actualRegularIncome, 600);
  assert.equal(r.budget.householdRegularIncome, 0);
  const roundTrip = calculateScenario(JSON.parse(JSON.stringify(s)));
  assert.equal(roundTrip.budget.utilitiesMonthly, 275);
  assert.equal(roundTrip.budget.currentComparable, r.budget.currentComparable);
  assert.equal(roundTrip.budget.actualRegularIncome, 600);
});

test('exclusive utility modes switch without summing or losing the inactive reference', () => {
  const aggregate = normalizeScenario({ budget: {
    utilitiesMonthly: 275, utilitiesMode: 'aggregate',
    utilityBreakdown: { waterMonthly: 35, energyMonthly: 110, internetMonthly: 40, otherMonthly: 10 },
    currentUtilitiesMonthly: 180, currentUtilitiesMode: 'detailed',
    currentUtilityBreakdown: { waterMonthly: 25, energyMonthly: 80, internetMonthly: 30 },
  } });
  const a = calculateScenario(aggregate);
  assert.equal(a.budget.utilitiesMonthly, 275);
  assert.equal(a.budget.currentUtilitiesMonthly, 135);
  assert.equal(a.budget.utilitiesDetailedMonthly, 195);
  assert.ok(a.warnings.some((warning) => warning.includes('solo se cuenta el importe conjunto')));
  const detailed = normalizeScenario({ ...aggregate, budget: { ...aggregate.budget, utilitiesMode: 'detailed', currentUtilitiesMode: 'aggregate' } });
  const d = calculateScenario(detailed);
  assert.equal(d.budget.utilitiesMonthly, 195);
  assert.equal(d.budget.currentUtilitiesMonthly, 180);
  assert.equal(d.budget.utilitiesAggregateMonthly, 275);
  assert.equal(d.budget.currentUtilitiesDetailedMonthly, 135);
  close(d.budget.totalMonthly - a.budget.totalMonthly, -80);
  close(d.budget.currentComparable - a.budget.currentComparable, 45);
  const inferred = calculateScenario({ budget: { utilitiesMonthly: 999, utilityBreakdown: { waterMonthly: 30 } } });
  assert.equal(inferred.budget.utilityMode, 'detailed');
  assert.equal(inferred.budget.utilitiesMonthly, 30);
});

test('new household and utility shapes reject null rows, negative bills, and invalid modes', () => {
  for (const bad of [
    { incomes: [{ monthly: 1 }, { monthly: 2 }, { monthly: 3 }] },
    { incomes: [{ id: 'mother', monthly: 2000, payments: 14 }] },
    { householdIncomes: null }, { householdIncomes: [null] },
    { householdIncomes: [{ id: 'sister', monthly: -1, payments: 12 }] },
    { utilityBreakdown: null }, { currentUtilityBreakdown: [] },
    { utilityBreakdown: { waterMonthly: -1 } },
    { utilitiesMode: 'both' }, { currentUtilitiesMode: null },
  ]) assert.equal(calculateScenario({ budget: bad }).valid, false);
  assert.ok(DEFAULT_SCENARIO.budget.householdIncomes.every((income) => income.monthly === 0));
  assert.equal(Object.hasOwn(DEFAULT_SCENARIO.budget, 'utilitiesMode'), false);
  assert.equal(normalizeScenario().budget.utilitiesMode, 'detailed');
});

test('fixed household roles are normalized by identity with complete zero defaults', () => {
  const reverse = normalizeScenario({ budget: { householdIncomes: [
    { id: 'sister', monthly: 850, payments: 12 }, { id: 'mother', monthly: 1750, payments: 14 },
  ] } });
  assert.equal(reverse.budget.householdIncomes[0].id, 'mother');
  assert.equal(reverse.budget.householdIncomes[0].monthly, 1750);
  assert.equal(reverse.budget.householdIncomes[1].id, 'sister');
  assert.equal(reverse.budget.householdIncomes[1].monthly, 850);
  const partial = normalizeScenario({ budget: { householdIncomes: [{ id: 'sister', monthly: 850 }] } });
  assert.equal(partial.budget.householdIncomes[0].monthly, 0);
  assert.equal(partial.budget.householdIncomes[0].payments, 14);
  assert.equal(partial.budget.householdIncomes[1].monthly, 850);
  assert.equal(partial.budget.householdIncomes[1].payments, 12);
  const positional = normalizeScenario({ budget: { householdIncomes: [{ monthly: 1750 }, { monthly: 850 }] } });
  assert.equal(positional.budget.householdIncomes[0].monthly, 1750);
  assert.equal(positional.budget.householdIncomes[1].monthly, 850);
  assert.equal(calculateScenario({ budget: { householdIncomes: [{ id: 'unknown', monthly: 9000 }] } }).valid, false);
  assert.equal(calculateScenario({ budget: { householdIncomes: [{ id: 'mother', monthly: 10 }, { id: 'mother', monthly: 20 }] } }).valid, false);
});
