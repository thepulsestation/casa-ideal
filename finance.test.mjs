import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCENARIO, normalizeScenario, monthlyPayment, amortizeLoan, calculateScenario,
  calculateTransferTax, standardCataloniaTransferTax, validateScenario,
  calculateGiftTax, calculateMotherTransfer,
  compareFamilyLoanTerms,
  getAffordability, suggestFamilyLoanTerm,
} from './finance.mjs';

const close = (actual, expected, tolerance = 0.005) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
const youngBuyers = [
  { label: 'A', share: 0.5, rate: 0.05, eligibilityConfirmed: true },
  { label: 'B', share: 0.5, rate: 0.05, eligibilityConfirmed: true },
];

const vatHome = (purchaseCosts = {}) => normalizeScenario({
  purchasePrice: 175000, icf: { enabled: true },
  cash: { depositAmount: 3000, familyLoanAvailableBeforeDeposit: true, depositFundingMode: 'offset-confirmed' },
  familyLoan: { enabled: true, rate: 12, years: 8 },
  purchaseCosts: { mode: 'itemized', ...purchaseCosts },
});

test('a net appraisal adds VAT once to early cash and the automatic family loan', () => {
  const base = calculateScenario(vatHome({ appraisal: 500 }));
  const gross = calculateScenario(vatHome({ appraisal: 500, vat: { appraisal: { mode: 'net', rate: 21 } } }));
  assert.equal(gross.valid, true);
  assert.equal(gross.cash.purchaseFees, 605);
  assert.equal(gross.cash.prepaidPurchaseFees, 605);
  assert.equal(gross.cash.purchaseFeesVatAdded, 105);
  close(gross.familyLoan.principal - base.familyLoan.principal, 105);
  close(gross.cash.beforeMortgageRequired - base.cash.beforeMortgageRequired, 105);
  close(gross.cash.closingNetPayment, base.cash.closingNetPayment);
});

test('existing final prices and mixed provisions do not receive a blanket VAT charge', () => {
  const final = calculateScenario(vatHome({ appraisal: 605, moving: 600 }));
  assert.equal(final.cash.purchaseFees, 605);
  assert.equal(final.cash.moving, 600);
  assert.equal(final.cash.serviceVatAdded, 0);
  const provision = calculateScenario(vatHome({ mode: 'provision', appraisal: 500, vat: { appraisal: { mode: 'net' } } }));
  assert.equal(provision.cash.purchaseFees, 5000);
  assert.equal(provision.cash.purchaseFeesVatAdded, 0);
  assert.equal(provision.cash.serviceVatAdded, 0);
  assert.equal(provision.cash.purchaseFeesItemized, 605);
});

test('a net signing fee includes its VAT at signing and in required borrowing', () => {
  const before = calculateScenario(vatHome({ notary: 1000 }));
  const after = calculateScenario(vatHome({ notary: 1000, vat: { notary: { mode: 'net', rate: 21 } } }));
  close(after.cash.closingNetPayment - before.cash.closingNetPayment, 210);
  close(after.familyLoan.principal - before.familyLoan.principal, 210);
  close(after.cash.beforeMortgageRequired, before.cash.beforeMortgageRequired);
});

test('included disbursements are part of the quote and do not receive a second VAT charge', () => {
  const r = calculateScenario(vatHome({ notary: 1000, vat: { notary: { mode: 'net', rate: 21, untaxed: 200 } } }));
  assert.equal(r.cash.costVat.notary.taxableBase, 800);
  assert.equal(r.cash.costVat.notary.vatAdded, 168);
  assert.equal(r.cash.purchaseFees, 1168);
});

test('renovation and moving quote VAT is funded once and paid after signing', () => {
  const r = calculateScenario(vatHome({
    renovations: 1000, moving: 600,
    vat: { renovations: { mode: 'net', rate: 10 }, moving: { mode: 'net', rate: 21 } },
  }));
  assert.equal(r.cash.renovations, 1100);
  assert.equal(r.cash.moving, 726);
  assert.equal(r.cash.serviceVatAdded, 226);
  assert.equal(r.cash.purchaseFees, 0);
  assert.equal(r.timeline.find(t => t.id === 'after').cashOut, 1826);
  close(r.familyLoan.principal, 17500 + 3000 + 1826);
  assert.equal(r.tax.vat, 0);
});

test('exempt quotes, reserves, taxes, and other mixed expenses get no automatic VAT', () => {
  const r = calculateScenario(vatHome({ broker: 1000, other: 300, reserve: 200, vat: { broker: { mode: 'net', rate: 0 } } }));
  assert.equal(r.cash.purchaseFees, 1300);
  assert.equal(r.cash.reserve, 200);
  assert.equal(r.cash.purchaseFeesVatAdded, 0);
  assert.equal(r.tax.total, 17500);
});

test('quote VAT respects the family loan cap and exposes the funding shortfall', () => {
  const s = vatHome({ legal: 40000, vat: { legal: { mode: 'net', rate: 21 } } });
  const r = calculateScenario(s);
  assert.equal(r.familyLoan.principal, 60000);
  assert.equal(r.cash.fundingGap, 17500 + 48400 + 3000 - 60000);
});

test('invalid quote VAT structures, modes, rates and disbursements cannot silently become valid', () => {
  for (const vat of [[], { appraisal: [] }, { appraisal: { mode: 'wrong' } },
    { appraisal: { rate: -1 } }, { appraisal: { rate: 99 } },
    { appraisal: { mode: 'net', untaxed: 501 } }]) {
    const s = vatHome({ appraisal: 500, vat });
    assert.equal(calculateScenario(normalizeScenario(s)).valid, false);
  }
  const s = vatHome({ appraisal: 500 });
  const normalized = normalizeScenario(s);
  normalized.purchaseCosts.vat.appraisal.rate = 10;
  assert.equal(s.purchaseCosts.vat.appraisal.rate, 21);
});

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
  const result = calculateScenario({ tax: { buyers: youngBuyers }, icf: { enabled: true }, familyLoan: { enabled: true, amount: 12500, rate: 8, years: 7, extraBuffer: 0 }, cash: { savings: 0, depositPercent: 0.1, familyLoanAvailableBeforeDeposit: false } });
  assert.equal(result.cash.fundingGap, 0);
  assert.equal(result.cash.beforeMortgageGap, 25000);
  assert.equal(result.cash.closingNetPayment, -12500);
  assert.equal(result.timeline.find((row) => row.id === 'signing').balance, 0);
});

test('auto-sized mother loan is capped, and own upfront fee is financed once', () => {
  const result = calculateScenario({ familyLoan: { enabled: true, rate: 8, years: 10, originationFeePercent: 1, extraBuffer: 0 }, cash: { savings: 20000 } });
  close(result.familyLoan.principal, 55000 / 0.99);
  close(result.cash.fundingGap, 0);
  assert.ok(result.budget.familyLoanMonthly > 0);
  const capped = calculateScenario({ familyLoan: { enabled: true, rate: 8, years: 10, extraBuffer: 0 } });
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
    familyLoan: { enabled: true, rate: 8, years: 7, extraBuffer: 0 },
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
  assert.equal(r.budget.currentUtilitiesMonthly, 275);
  assert.equal(r.budget.currentUtilitiesIndependentMonthly, 180);
  assert.equal(s.budget.currentUtilitiesMonthly, 180);
  assert.equal(r.budget.actualRegularIncome, 600);
  assert.equal(r.budget.householdRegularIncome, 0);
  const roundTrip = calculateScenario(JSON.parse(JSON.stringify(s)));
  assert.equal(roundTrip.budget.utilitiesMonthly, 275);
  assert.equal(roundTrip.budget.currentComparable, r.budget.currentComparable);
  assert.equal(roundTrip.budget.actualRegularIncome, 600);
});

test('exclusive utility modes switch without summing or losing the inactive reference', () => {
  const aggregate = normalizeScenario({ budget: {
    sharedLivingCosts: false,
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

test('one shared set of living costs cancels from the purchase versus rent difference', () => {
  const first = calculateScenario({ budget: { sharedLivingCosts: true, utilitiesMonthly: 200, foodMonthly: 400, carMonthly: 100, otherMonthly: 50 } });
  const second = calculateScenario({ budget: { sharedLivingCosts: true, utilitiesMonthly: 350, foodMonthly: 600, carMonthly: 180, otherMonthly: 50 } });
  assert.equal(first.budget.currentUtilitiesMonthly, 200);
  assert.equal(second.budget.currentUtilitiesMonthly, 350);
  close(second.budget.allInDifference, first.budget.allInDifference);
  close(second.budget.totalMonthly - first.budget.totalMonthly, 430);
  close(second.budget.currentComparable - first.budget.currentComparable, 430);
});

test('storage is one living expense in each home and is never mortgage debt', () => {
  const common = { budget: { sharedLivingCosts: true, incomes: [{ monthly: 4000, payments: 12 }], utilitiesMonthly: 200, foodMonthly: 400 } };
  const first = calculateScenario(common);
  const second = calculateScenario({ ...common, budget: { ...common.budget, storageMonthly: 50 } });
  assert.equal(second.budget.storageMonthly, 50);
  close(second.budget.householdMonthly - first.budget.householdMonthly, 50);
  close(second.budget.totalMonthly - first.budget.totalMonthly, 50);
  close(second.budget.currentComparable - first.budget.currentComparable, 50);
  close(second.budget.remainingRegular - first.budget.remainingRegular, -50);
  close(second.budget.currentRemainingRegular - first.budget.currentRemainingRegular, -50);
  close(second.budget.remainingAveraged - first.budget.remainingAveraged, -50);
  close(second.budget.currentRemainingAveraged - first.budget.currentRemainingAveraged, -50);
  close(second.budget.allInDifference, first.budget.allInDifference);
  assert.equal(second.budget.debtRatio, first.budget.debtRatio);
  assert.equal(second.budget.familyDebtRatio, first.budget.familyDebtRatio);
  assert.equal(second.budget.totalDebtMonthly, first.budget.totalDebtMonthly);
  close(second.stress.totalMonthly - first.stress.totalMonthly, 55);
});

test('shared-cost migration uses common bills while preserving distinct legacy references', () => {
  const legacy = normalizeScenario({ budget: { utilitiesMonthly: 270, currentUtilitiesMonthly: 190 } });
  assert.equal(legacy.budget.sharedLivingCosts, true);
  const previous = calculateScenario(legacy);
  assert.equal(previous.budget.currentUtilitiesMonthly, 270);
  assert.equal(previous.budget.currentUtilitiesIndependentMonthly, 190);
  const shared = normalizeScenario({ ...legacy, budget: { ...legacy.budget, sharedLivingCosts: true } });
  const same = calculateScenario(shared);
  assert.equal(shared.budget.currentUtilitiesMonthly, 190);
  assert.equal(same.budget.currentUtilitiesIndependentMonthly, 190);
  assert.equal(same.budget.currentUtilitiesMonthly, 270);
  assert.equal(same.budget.sharedLivingCosts, true);
  assert.ok(same.warnings.some((warning) => warning.includes('actuales anteriores, distintos')));
  const restored = calculateScenario({ ...shared, budget: { ...shared.budget, sharedLivingCosts: false } });
  assert.equal(restored.budget.currentUtilitiesMonthly, 190);
  assert.equal(calculateScenario(JSON.parse(JSON.stringify(legacy))).budget.sharedLivingCosts, true);
  assert.equal(calculateScenario(JSON.parse(JSON.stringify({ ...legacy, budget: { ...legacy.budget, sharedLivingCosts: false } }))).budget.sharedLivingCosts, false);
  assert.equal(normalizeScenario({ budget: { utilitiesMonthly: 270 } }).budget.sharedLivingCosts, true);
  assert.equal(normalizeScenario({ budget: { utilitiesMonthly: 270, currentUtilitiesMonthly: 270 } }).budget.sharedLivingCosts, true);
  assert.equal(normalizeScenario().budget.sharedLivingCosts, true);
  assert.equal(DEFAULT_SCENARIO.budget.sharedLivingCosts, true);
});

test('shared-cost migration compares the active detailed bills, not discarded aggregates', () => {
  const legacy = normalizeScenario({ budget: {
    utilitiesMonthly: 900, utilityBreakdown: { waterMonthly: 40, energyMonthly: 110 },
    currentUtilitiesMonthly: 900, currentUtilityBreakdown: { waterMonthly: 30, energyMonthly: 90 },
  } });
  assert.equal(legacy.budget.sharedLivingCosts, true);
  assert.equal(calculateScenario(legacy).budget.currentUtilitiesMonthly, 150);
  assert.equal(calculateScenario(legacy).budget.currentUtilitiesIndependentMonthly, 120);
  assert.equal(calculateScenario({ ...legacy, budget: { ...legacy.budget, sharedLivingCosts: false } }).budget.currentUtilitiesMonthly, 120);
  for (const budget of [{ storageMonthly: -1 }, { sharedLivingCosts: 'true' }, { sharedLivingCosts: null }]) {
    assert.equal(calculateScenario({ budget }).valid, false);
  }
});

test('legacy current-only utility inputs become canonical shared costs without losing the original', () => {
  for (const budget of [
    { currentUtilitiesMonthly: 180 },
    { currentUtilityBreakdown: { waterMonthly: 30, energyMonthly: 90, internetMonthly: 30 } },
  ]) {
    const before = JSON.stringify(budget);
    const normalized = normalizeScenario({ budget });
    const r = calculateScenario(normalized);
    const amount = budget.currentUtilitiesMonthly || 150;
    assert.equal(normalized.budget.sharedLivingCosts, true);
    assert.equal(r.budget.utilitiesMonthly, amount);
    assert.equal(r.budget.currentUtilitiesMonthly, amount);
    assert.equal(r.budget.currentUtilitiesIndependentMonthly, amount);
    assert.equal(normalized.budget.utilitiesMode, normalized.budget.currentUtilitiesMode);
    assert.deepEqual(normalized.budget.utilityBreakdown, normalized.budget.currentUtilityBreakdown);
    assert.equal(normalized.budget.utilitiesMonthly, normalized.budget.currentUtilitiesMonthly);
    assert.equal(JSON.stringify(budget), before);
    const again = calculateScenario(JSON.parse(JSON.stringify(normalized)));
    assert.equal(again.budget.utilitiesMonthly, amount);
  }
  const independent = calculateScenario({ budget: { sharedLivingCosts: false, currentUtilitiesMonthly: 180 } });
  assert.equal(independent.budget.utilitiesMonthly, 0);
  assert.equal(independent.budget.currentUtilitiesMonthly, 180);
});

test('automatic mother loan adds the requested buffer once above acquisition need', () => {
  const r = calculateScenario({ purchasePrice: 200000, tax: { buyers: youngBuyers }, familyLoan: { enabled: true, rate: 5, years: 10, assumedTerms: true } });
  assert.equal(r.cash.priceContribution + r.tax.total, 50000);
  assert.equal(r.familyLoan.principal, 53000);
  assert.equal(r.cash.familyExtraBuffer, 3000);
  assert.equal(r.cash.reserve, 0);
  assert.equal(r.cash.totalReserve, 3000);
  assert.equal(r.cash.totalRequired, 53000);
  assert.equal(r.cash.fundingGap, 0);
  assert.equal(r.cash.totalAcquisitionCost, 210000);
  close(r.familyLoan.monthlyPayment, monthlyPayment(53000, 5, 10));
  close(r.timeline.find((item) => item.id === 'after').balance, 3000);
  assert.equal(r.stress.reserveAfterUnexpectedCost, 0);
  assert.equal(r.familyLoan.termsAssumed, true);
  assert.equal(r.budget.assumedLoanTerms, true);
  assert.ok(r.warnings.some((warning) => warning.includes('hipótesis editable')));
});

test('purchase reserve and extra loan buffer stay separate without increasing acquisition cost twice', () => {
  const r = calculateScenario({ purchasePrice: 200000, tax: { buyers: youngBuyers }, purchaseCosts: { reserve: 2000 }, familyLoan: { enabled: true, rate: 5, years: 10 } });
  assert.equal(r.familyLoan.principal, 55000);
  assert.equal(r.cash.reserve, 2000);
  assert.equal(r.cash.familyExtraBuffer, 3000);
  assert.equal(r.cash.totalReserve, 5000);
  assert.equal(r.cash.totalAcquisitionCost, 210000);
  assert.equal(r.cash.totalRequired, 55000);
  assert.equal(r.stress.reserveAfterUnexpectedCost, 2000);
  close(r.timeline.find((item) => item.id === 'after').balance, 5000);
  const otherDeposit = calculateScenario({ purchasePrice: 200000, tax: { buyers: youngBuyers }, purchaseCosts: { reserve: 2000 }, cash: { depositPercent: 0.05 }, familyLoan: { enabled: true, rate: 5, years: 10 } });
  assert.equal(otherDeposit.familyLoan.principal, r.familyLoan.principal);
  assert.equal(otherDeposit.cash.totalRequired, r.cash.totalRequired);
});

test('automatic buffer honors the 60000 ceiling and is omitted when mother loan is disabled', () => {
  const capped = calculateScenario({ familyLoan: { enabled: true, rate: 5, years: 10 } });
  assert.equal(capped.familyLoan.principal, 60000);
  assert.equal(capped.cash.totalRequired, 78000);
  assert.equal(capped.cash.fundingGap, 18000);
  assert.equal(calculateScenario().cash.familyExtraBuffer, 0);
  const noBuffer = calculateScenario({ purchasePrice: 200000, tax: { buyers: youngBuyers }, familyLoan: { enabled: true, rate: 5, years: 10, extraBuffer: 0 } });
  assert.equal(noBuffer.familyLoan.principal, 50000);
});

test('buffer participates once in gift tax and fee gross-up without losing deterministic rounding', () => {
  const input = { purchasePrice: 200000, tax: { buyers: youngBuyers },
    familyLoan: { enabled: true, rate: 5, years: 10, originationFeePercent: 1, originationFeeFixed: 100 },
    motherTransfer: { mode: 'gift', giftNotaryCost: 300 },
  };
  const r = calculateScenario(input);
  assert.equal(r.familyLoan.principal, 56808.52);
  close(r.cash.totalRequired, 50000 + 3000 + r.familyLoan.principal * 0.05 + r.familyLoan.principal * 0.01 + 100 + 300);
  assert.equal(r.cash.fundingGap, 0);
  assert.ok(r.cash.surplus < 0.01);
  assert.equal(calculateScenario(input).familyLoan.principal, r.familyLoan.principal);
});

test('legacy unknown loan terms stay unknown while receiving the new buffer default', () => {
  const s = normalizeScenario({ familyLoan: { enabled: true, amount: null } });
  assert.equal(s.familyLoan.extraBuffer, 3000);
  assert.equal(s.familyLoan.rate, null);
  assert.equal(s.familyLoan.years, null);
  assert.equal(s.familyLoan.assumedTerms, false);
  const r = calculateScenario(s);
  assert.equal(r.familyLoan.monthlyPayment, null);
  assert.equal(r.familyLoan.termsAssumed, false);
  assert.equal(r.budget.assumedLoanTerms, false);
  assert.equal(r.cash.familyExtraBuffer, 3000);
  for (const familyLoan of [{ extraBuffer: -1 }, { assumedTerms: 'true' }]) assert.equal(calculateScenario({ familyLoan }).valid, false);
});

test('80% bank plus 20% ICF leaves the mother only purchase expenses and extra buffer', () => {
  const r = calculateScenario({
    purchasePrice: 250000, tax: { buyers: youngBuyers }, icf: { enabled: true, eligibilityConfirmed: false },
    purchaseCosts: { appraisal: 500, notary: 1000, registry: 500, agency: 1000 },
    familyLoan: { enabled: true, rate: 5, years: 10, assumedTerms: true },
    motherTransfer: { repaymentMode: 'same-as-bank' },
    cash: { familyLoanAvailableBeforeDeposit: true },
  });
  assert.equal(r.financing.bankMortgage, 200000);
  assert.equal(r.financing.icf, 50000);
  assert.equal(r.financing.bankShareOfPrice, 0.8);
  assert.equal(r.financing.icfShareOfPrice, 0.2);
  assert.equal(r.financing.uncoveredPurchasePrice, 0);
  assert.equal(r.financing.icfHypothetical, true);
  assert.equal(r.icf.eligibilityConfirmed, false);
  assert.equal(r.familyLoan.principal, 18500);
  assert.equal(r.cash.motherFundingNeed.uncoveredPurchasePrice, 0);
  assert.equal(r.cash.motherFundingNeed.purchaseTax, 12500);
  assert.equal(r.cash.motherFundingNeed.purchaseFees, 3000);
  assert.equal(r.cash.motherFundingNeed.extraBuffer, 3000);
  assert.equal(r.cash.motherFundingNeed.netAfterSavings, 18500);
  assert.equal(r.cash.fundingGap, 0);
  assert.equal(r.cash.beforeMortgageGap, 7000, 'the mother loan must not silently grow to bridge arras');
  assert.ok(r.cash.closingNetPayment < 0);
  assert.equal(r.cash.potentialClosingSurplus, -r.cash.closingNetPayment);
  assert.equal(r.cash.fundingTimingRequiresConfirmation, true);
  assert.ok(r.warnings.some((warning) => warning.includes('No presupone que el banco o el ICF reintegren las arras')));
});

test('ICF caps and low appraisals remain visible as uncovered price in mother funding needs', () => {
  const lowAppraisal = calculateScenario({ purchasePrice: 250000, appraisalValue: 220000,
    tax: { buyers: youngBuyers }, icf: { enabled: true }, familyLoan: { enabled: true, rate: 5, years: 10 },
  });
  assert.equal(lowAppraisal.financing.bankMortgage, 176000);
  assert.equal(lowAppraisal.financing.icf, 44000);
  assert.equal(lowAppraisal.financing.uncoveredPurchasePrice, 30000);
  assert.equal(lowAppraisal.cash.motherFundingNeed.uncoveredPurchasePrice, 30000);
  assert.equal(lowAppraisal.familyLoan.principal, 45500);
  const capped = calculateScenario({ purchasePrice: 300000, tax: { buyers: youngBuyers }, icf: { enabled: true }, familyLoan: { enabled: true, rate: 5, years: 10 } });
  assert.equal(capped.financing.uncoveredPurchasePrice, 10000);
  assert.equal(capped.familyLoan.principal, 28000);
});

test('explicit same-as-bank family repayment follows bank terms and allocates 50/50 without doubling household debt', () => {
  const input = { familyLoan: { enabled: true, amount: 30000, rate: 5, years: 15, assumedTerms: true },
    motherTransfer: { repaymentMode: 'same-as-bank', familyRate: 0, familyYears: 10 },
    budget: { incomes: [{ monthly: 3500, payments: 12 }], householdIncomes: [{ id: 'mother', monthly: 1000, payments: 14 }], existingDebtMonthly: 100 },
  };
  const r = calculateScenario(input);
  close(r.motherTransfer.familyMonthlyRepayment, r.familyLoan.monthlyPayment);
  assert.equal(r.motherTransfer.effectiveFamilyRate, 5);
  assert.equal(r.motherTransfer.effectiveFamilyYears, 15);
  assert.equal(r.motherTransfer.repaymentTermsAssumed, true);
  close(r.motherTransfer.allocations[0].monthlyRepayment, r.familyLoan.monthlyPayment / 2);
  close(r.motherTransfer.allocations[1].monthlyRepayment, r.familyLoan.monthlyPayment / 2);
  close(r.budget.debtRatio, (r.mortgage.monthlyPayment + 100 + r.familyLoan.monthlyPayment) / 3500);
  close(r.budget.familyDebtRatio, (r.mortgage.monthlyPayment + 100 + r.familyLoan.monthlyPayment) / 4500);
  close(r.budget.totalMonthly, r.budget.homeMonthly + 100 + r.familyLoan.monthlyPayment);
  close(r.budget.motherNetExternalCostMonthly, 0);
  close(r.lifetime.totalDebtPrincipal, r.mortgage.principal + r.familyLoan.principal);
  const longer = calculateScenario({ ...input, familyLoan: { ...input.familyLoan, years: 20 } });
  assert.equal(longer.motherTransfer.effectiveFamilyYears, 20);
  close(longer.motherTransfer.familyMonthlyRepayment, longer.familyLoan.monthlyPayment);
  assert.equal(input.motherTransfer.familyYears, 10, 'custom references are not overwritten');
  const custom = calculateScenario({ ...input, motherTransfer: { ...input.motherTransfer, repaymentMode: 'custom' } });
  close(custom.motherTransfer.familyMonthlyRepayment, 30000 / 120);
  assert.equal(custom.motherTransfer.effectiveFamilyRate, 0);
});

test('same-as-bank never substitutes custom dates when bank terms are unknown', () => {
  const r = calculateScenario({ familyLoan: { enabled: true, amount: 20000 }, motherTransfer: { repaymentMode: 'same-as-bank', familyRate: 0, familyYears: 10 } });
  assert.equal(r.familyLoan.monthlyPayment, null);
  assert.equal(r.motherTransfer.familyMonthlyRepayment, null);
  assert.equal(r.motherTransfer.termsKnown, false);
  assert.equal(r.budget.borrowerDebtRatioIncomplete, true);
  for (const motherTransfer of [{ repaymentMode: 'automatic-approved' }, { allocations: [{ share: 0.4 }] }]) {
    assert.equal(calculateScenario({ familyLoan: { enabled: true }, motherTransfer }).valid, false);
  }
});

test('loan-term comparisons are explicit hypotheses and keep scenario and ICF eligibility unchanged', () => {
  const input = { purchasePrice: 250000, tax: { buyers: youngBuyers }, icf: { enabled: true, eligibilityConfirmed: false },
    familyLoan: { enabled: true, rate: 5, years: 10 }, motherTransfer: { repaymentMode: 'same-as-bank' },
    budget: { incomes: [{ monthly: 4000, payments: 12 }] },
  };
  const snapshot = JSON.stringify(input);
  const rows = compareFamilyLoanTerms(input);
  assert.deepEqual(rows.map((row) => row.years), [10, 15, 20]);
  assert.ok(rows.every((row) => row.valid && row.approvalRequired && row.termsAssumed));
  assert.ok(rows.every((row) => row.rate === 5 && row.principal === 15500));
  assert.ok(rows[0].monthlyPayment > rows[1].monthlyPayment && rows[1].monthlyPayment > rows[2].monthlyPayment);
  assert.ok(rows[0].totalInterest < rows[1].totalInterest && rows[1].totalInterest < rows[2].totalInterest);
  assert.ok(rows[0].borrowerDebtRatio > rows[1].borrowerDebtRatio);
  for (const row of rows) {
    close(row.familyMonthlyRepayment, row.monthlyPayment);
    assert.equal(row.result.icf.eligibilityConfirmed, false);
  }
  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(compareFamilyLoanTerms(input, [12])[0].years, 12);
  assert.equal(compareFamilyLoanTerms(input, [0])[0].valid, false);
  assert.equal(compareFamilyLoanTerms(input, null).length, 0);
  const unknown = compareFamilyLoanTerms({ familyLoan: { rate: null, years: null } }, [15])[0];
  assert.equal(unknown.rate, 5);
  assert.equal(unknown.result.icf.enabled, false, 'comparisons do not silently enable ICF');
});

const planningExample = () => ({
  purchasePrice: 175000,
  tax: { buyers: [{ share: 1, rate: 0.05, eligibilityConfirmed: true }] },
  mortgage: { ltv: 0.8, years: 30, baseRate: 3.7 },
  icf: { enabled: true },
  purchaseCosts: { mode: 'provision', provisionAmount: 5000 },
  cash: { familyLoanAvailableBeforeDeposit: true },
  familyLoan: { enabled: true, rate: 5, years: 10, assumedTerms: true, coverEarlyLiquidity: true },
  motherTransfer: { repaymentMode: 'same-as-bank' },
  budget: { incomes: [{ monthly: 2800, payments: 12 }], existingDebtMonthly: 200, utilitiesMonthly: 200, foodMonthly: 500 },
});

test('purchase provision and itemized fees are exclusive and exclude other acquisition categories', () => {
  const input = { purchasePrice: 200000, tax: { buyers: youngBuyers },
    purchaseCosts: { mode: 'provision', provisionAmount: 5000, appraisal: 500, legal: 200, notary: 800, renovations: 2000, reserve: 1000 },
    mortgage: { discounts: [{ id: 'protection', enabled: true, points: 0, cost: 1200, frequency: 'upfront', coverageYears: 5 }] },
  };
  const provision = calculateScenario(input);
  assert.equal(provision.cash.purchaseFees, 5000);
  assert.equal(provision.cash.purchaseFeesItemized, 1500);
  assert.equal(provision.cash.purchaseFeesEstimated, true);
  assert.equal(provision.cash.totalRequired, 59200);
  assert.equal(provision.cash.totalAcquisitionCost, 218200);
  assert.equal(provision.cash.prepaidPurchaseFees, 0);
  assert.equal(provision.budget.incomplete, true);
  const detail = calculateScenario({ ...input, purchaseCosts: { ...input.purchaseCosts, mode: 'itemized' } });
  assert.equal(detail.cash.purchaseFees, 1500);
  assert.equal(detail.cash.prepaidPurchaseFees, 700);
  assert.equal(detail.cash.totalRequired, 55700);
  assert.equal(detail.cash.purchaseFeesEstimated, false);
  const staged = calculateScenario({ ...input, purchaseCosts: { ...input.purchaseCosts, provisionBeforeSigning: 500 } });
  assert.equal(staged.cash.totalRequired, provision.cash.totalRequired);
  assert.equal(staged.cash.beforeMortgageRequired - provision.cash.beforeMortgageRequired, 500);
  assert.equal(staged.cash.closingNetPayment - provision.cash.closingNetPayment, -500);
  assert.equal(normalizeScenario({ purchaseCosts: { appraisal: 500 } }).purchaseCosts.mode, 'itemized');
  for (const purchaseCosts of [{ mode: 'both' }, { mode: 'provision', provisionAmount: -1 }, { provisionAmount: 100, provisionBeforeSigning: 101 }]) assert.equal(calculateScenario({ purchaseCosts }).valid, false);
});

test('explicit early-liquidity sizing covers arras without turning them into another acquisition expense', () => {
  const input = planningExample();
  const r = calculateScenario(input);
  assert.equal(r.familyLoan.principal, 17500);
  assert.equal(r.cash.totalRequired, 16750);
  assert.equal(r.cash.earlyLiquidityExtraBorrowing, 750);
  assert.equal(r.cash.beforeMortgageGap, 0);
  assert.equal(r.cash.fundingGap, 0);
  assert.equal(r.cash.surplus, 750);
  assert.equal(r.cash.totalAcquisitionCost, 188750);
  close(r.timeline.find((row) => row.id === 'after').balance, 3750);
  const withoutFloor = calculateScenario({ ...input, familyLoan: { ...input.familyLoan, coverEarlyLiquidity: false } });
  assert.equal(withoutFloor.familyLoan.principal, 16750);
  assert.equal(withoutFloor.cash.beforeMortgageGap, 750);
  assert.equal(withoutFloor.cash.totalRequired, r.cash.totalRequired);
  const notEarly = calculateScenario({ ...input, cash: { familyLoanAvailableBeforeDeposit: false } });
  assert.equal(notEarly.familyLoan.principal, 16750);
  assert.equal(notEarly.cash.beforeMortgageGap, 17500);
  const prepaid = calculateScenario({ ...input, purchaseCosts: { ...input.purchaseCosts, provisionBeforeSigning: 500 } });
  assert.equal(prepaid.familyLoan.principal, 18000);
  assert.equal(prepaid.cash.totalRequired, 16750);
  assert.equal(prepaid.cash.beforeMortgageGap, 0);
  assert.equal(prepaid.cash.earlyLiquidityExtraBorrowing, 1250);
});

test('pending release keeps nominal funding but exposes the full advance at risk', () => {
  const input = planningExample();
  const r = calculateScenario(input);
  assert.equal(r.cash.depositFundingMode, 'pending');
  assert.equal(r.mortgage.principal, 140000);
  assert.equal(r.icf.principal, 35000);
  assert.equal(r.familyLoan.principal, 17500);
  assert.equal(r.cash.depositReleaseAtRisk, 17500);
  assert.equal(r.cash.nominalDepositReleaseAtRisk, 17500);
  assert.equal(r.cash.depositReleasePending, true);
  assert.equal(r.cash.priceStillDueToSeller, 157500);
  assert.equal(r.cash.closingNetPayment, -3750);
  const a = getAffordability(input, r);
  assert.equal(a.depositReleaseAtRisk, 17500);
  assert.equal(a.depositReleasePending, true);
  assert.equal(a.incomplete, true);
  assert.equal(a.provisional, true);
  assert.ok(r.warnings.some((warning) => warning.includes('no garantiza liquidez')));
});

test('without release only the outstanding vendor balance is financed and all payments follow actual capital', () => {
  const input = planningExample();
  input.cash.depositFundingMode = 'no-release';
  const r = calculateScenario(input);
  assert.equal(r.valid, true);
  assert.equal(r.mortgage.principal, 140000);
  assert.equal(r.icf.principal, 17500);
  assert.equal(r.icf.nominalPrincipal, 35000);
  assert.equal(r.icf.disbursementReducedByDeposit, 17500);
  assert.equal(r.financing.nominalBankMortgage, 140000);
  assert.equal(r.financing.nominalIcf, 35000);
  assert.equal(r.financing.totalPriceFunding, 157500);
  assert.equal(r.cash.priceContribution, 17500);
  assert.equal(r.familyLoan.principal, 34250);
  assert.equal(r.cash.totalRequired, 34250);
  assert.equal(r.cash.tax, 8750);
  assert.equal(r.cash.purchaseFees, 5000);
  assert.equal(r.cash.familyExtraBuffer, 3000);
  assert.equal(r.cash.totalAcquisitionCost, 188750);
  assert.equal(r.cash.fundingGap, 0);
  assert.equal(r.cash.beforeMortgageGap, 0);
  assert.equal(r.cash.closingNetPayment, 13750);
  assert.equal(r.cash.surplus, 0);
  assert.equal(r.cash.depositReleaseAtRisk, 0);
  assert.equal(r.cash.depositReleasePending, false);
  assert.equal(r.cash.nominalDepositReleaseAtRisk, 17500);
  close(r.icf.deferredMonthlyPayment, 17500 / 60);
  close(r.familyLoan.monthlyPayment, monthlyPayment(34250, 5, 10));
  close(r.motherTransfer.familyMonthlyRepayment, r.familyLoan.monthlyPayment);
  close(r.budget.debtRatio, (200 + r.mortgage.monthlyPayment + r.familyLoan.monthlyPayment) / 2800);
  close(r.budget.totalDebtMonthly, 200 + r.mortgage.monthlyPayment + r.familyLoan.monthlyPayment);
  close(r.timeline.find((row) => row.id === 'after').balance, 3000);
});

test('confirmed advance compensation preserves nominal funding while no-release can reduce the bank first', () => {
  const input = planningExample();
  const confirmed = calculateScenario({ ...input, cash: { ...input.cash, depositFundingMode: 'offset-confirmed' } });
  assert.equal(confirmed.familyLoan.principal, 17500);
  assert.equal(confirmed.mortgage.principal, 140000);
  assert.equal(confirmed.icf.principal, 35000);
  assert.equal(confirmed.cash.depositReleaseAtRisk, 0);
  assert.equal(confirmed.cash.depositReleasePending, false);
  assert.equal(confirmed.cash.nominalDepositReleaseAtRisk, 17500);
  assert.equal(getAffordability(input, confirmed).noApproval, true);
  const largeAdvance = calculateScenario({ ...input, cash: { ...input.cash, depositPercent: 0.5, depositFundingMode: 'no-release' } });
  assert.equal(largeAdvance.mortgage.principal, 87500);
  assert.equal(largeAdvance.mortgage.nominalPrincipal, 140000);
  assert.equal(largeAdvance.mortgage.disbursementReducedByDeposit, 52500);
  assert.equal(largeAdvance.icf.principal, 0);
  assert.equal(largeAdvance.icf.deferredMonthlyPayment, 0);
  close(largeAdvance.mortgage.monthlyPayment, monthlyPayment(87500, 3.7, 30));
  assert.equal(largeAdvance.familyLoan.principal, 60000);
  assert.ok(largeAdvance.cash.fundingGap > 0);
});

test('advance risk is absent when lenders do not exceed the seller balance, and modes agree without arras', () => {
  const input = planningExample();
  const results = ['pending', 'offset-confirmed', 'no-release'].map((depositFundingMode) => calculateScenario({
    ...input, cash: { ...input.cash, depositPercent: 0, depositFundingMode },
  }));
  for (const r of results) {
    assert.equal(r.mortgage.principal, 140000);
    assert.equal(r.icf.principal, 35000);
    assert.equal(r.familyLoan.principal, 16750);
    assert.equal(r.cash.depositReleaseAtRisk, 0);
    assert.equal(r.cash.depositReleasePending, false);
    assert.equal(r.cash.nominalDepositReleaseAtRisk, 0);
  }
  const noIcf = calculateScenario({ ...input, icf: { enabled: false } });
  const conservative = calculateScenario({ ...input, icf: { enabled: false }, cash: { ...input.cash, depositFundingMode: 'no-release' } });
  assert.equal(noIcf.cash.depositReleaseAtRisk, 0);
  assert.equal(noIcf.cash.depositReleasePending, false);
  assert.equal(conservative.mortgage.principal, noIcf.mortgage.principal);
  assert.equal(conservative.familyLoan.principal, noIcf.familyLoan.principal);
  assert.equal(calculateScenario({ cash: { depositFundingMode: 'reimburse-guaranteed' } }).valid, false);
});

test('pending deposit release alone prevents a complete affordability assessment even when known arithmetic fits', () => {
  const input = planningExample();
  input.icf.eligibilityConfirmed = true;
  input.familyLoan.assumedTerms = false;
  input.purchaseCosts = { mode: 'itemized', notary: 5000 };
  input.budget = { ...input.budget, incomes: [{ monthly: 4500, payments: 12 }],
    maintenanceAnnual: 600, externalHomeInsuranceAnnual: 180, propertyCostsConfirmed: true };
  const pending = getAffordability(input);
  const confirmed = getAffordability({ ...input, cash: { ...input.cash, depositFundingMode: 'offset-confirmed' } });
  assert.equal(pending.meetsKnownLimits, true, 'this is an arithmetic reference, not approval');
  assert.equal(pending.incomplete, true);
  assert.equal(pending.provisional, true);
  assert.equal(confirmed.incomplete, false);
  assert.equal(confirmed.provisional, false);
  assert.equal(confirmed.noApproval, true);
});

test('early-liquidity floor gross-ups fees and gift tax once and still honors manual capital and cap', () => {
  const input = planningExample();
  const gifted = calculateScenario({ ...input,
    familyLoan: { ...input.familyLoan, originationFeePercent: 1, originationFeeFixed: 100 },
    motherTransfer: { mode: 'gift', giftNotaryCost: 300 },
  });
  assert.equal(gifted.familyLoan.principal, 19042.56);
  close(gifted.cash.earlyLiquidityExtraBorrowing, 750, 0.01);
  assert.equal(gifted.cash.beforeMortgageGap, 0);
  assert.equal(gifted.cash.fundingGap, 0);
  const manual = calculateScenario({ ...input, familyLoan: { ...input.familyLoan, amount: 16000 } });
  assert.equal(manual.familyLoan.principal, 16000);
  assert.equal(manual.cash.fundingGap, 750);
  assert.equal(manual.cash.beforeMortgageGap, 1500);
  const capped = calculateScenario({ ...input, cash: { familyLoanAvailableBeforeDeposit: true, depositPercent: 0.5 } });
  assert.equal(capped.familyLoan.principal, 60000);
  assert.equal(capped.cash.beforeMortgageGap, 27500);
});

test('affordability separates the borrower debt reference from family income and incomplete approvals', () => {
  const input = planningExample();
  const r = calculateScenario(input);
  const a = getAffordability(input, r);
  close(a.maximumMotherMonthly, 2800 * 0.35 - 200 - r.mortgage.monthlyPayment);
  assert.equal(a.withinDebtLimit, false);
  assert.equal(a.cashFundingGap, 0);
  assert.equal(a.earlyCashGap, 0);
  assert.equal(a.incomplete, true);
  assert.equal(a.noApproval, true);
  const additionalIncome = getAffordability({ ...input, budget: { ...input.budget, householdIncomes: [{ id: 'mother', monthly: 900, payments: 14 }, { id: 'sister', monthly: 1500, payments: 12 }] } });
  assert.equal(additionalIncome.maximumMotherMonthly, a.maximumMotherMonthly);
  assert.equal(additionalIncome.withinDebtLimit, a.withinDebtLimit);
  assert.ok(additionalIncome.householdRemaining > a.householdRemaining);
  const unknown = getAffordability({ ...input, familyLoan: { ...input.familyLoan, rate: null } });
  assert.equal(unknown.withinDebtLimit, null);
  assert.equal(unknown.householdRemaining, null);
  assert.equal(unknown.meetsKnownLimits, false);
  assert.equal(getAffordability({ budget: { incomes: [null] } }).valid, false);
});

test('shortest-term search respects the debt reference without lowering required capital or claiming approval', () => {
  const input = planningExample();
  const before = JSON.stringify(input);
  const suggestion = suggestFamilyLoanTerm(input);
  assert.equal(suggestion.found, true);
  assert.equal(suggestion.years, 16);
  assert.equal(suggestion.result.familyLoan.principal, 17500);
  assert.equal(suggestion.result.cash.purchasePrice, 175000);
  assert.equal(suggestion.affordability.withinDebtLimit, true);
  assert.equal(suggestion.affordability.meetsKnownLimits, true);
  assert.equal(suggestion.affordability.incomplete, true);
  assert.equal(suggestion.provisional, true);
  assert.equal(suggestion.noApproval, true);
  assert.ok(suggestion.candidates.at(-2).withinDebtLimit === false);
  assert.equal(suggestFamilyLoanTerm(input, { maxYears: 10 }).reasonCode, 'debt-limit');
  assert.equal(JSON.stringify(input), before);
  const custom = suggestFamilyLoanTerm({ ...input, motherTransfer: { repaymentMode: 'custom', familyRate: 0, familyYears: 20 } });
  assert.equal(custom.found, false);
  assert.equal(custom.reasonCode, 'custom-family-agreement');
  assert.equal(suggestFamilyLoanTerm(input, { maxYears: 31 }).valid, false);
  assert.equal(suggestFamilyLoanTerm({ ...input, familyLoan: { ...input.familyLoan, rate: null } }).reasonCode, 'missing-rate');
});

test('a debt-fitting term never hides purchase cash gaps, early gaps, or negative household margin', () => {
  const input = planningExample();
  const early = suggestFamilyLoanTerm({ ...input, familyLoan: { ...input.familyLoan, coverEarlyLiquidity: false } });
  assert.equal(early.found, false);
  assert.equal(early.reasonCode, 'early-cash-gap');
  assert.ok(early.minimumDebtTermYears > 0);
  const cap = suggestFamilyLoanTerm({ ...input, purchasePrice: 500000, budget: { ...input.budget, incomes: [{ monthly: 10000, payments: 12 }] } });
  assert.equal(cap.found, false);
  assert.equal(cap.reasonCode, 'purchase-cash-gap');
  assert.equal(cap.result.familyLoan.principal, 60000);
  assert.ok(cap.affordability.cashFundingGap > 0);
  const expenses = suggestFamilyLoanTerm({ ...input, budget: { ...input.budget, incomes: [{ monthly: 4000, payments: 12 }], foodMonthly: 5000 } });
  assert.equal(expenses.found, false);
  assert.equal(expenses.reasonCode, 'household-margin');
});


test('property provisions count once but never imply that municipal and community costs are verified',()=>{
 const base=calculateScenario({budget:{ibiAnnual:0,wasteAnnual:0,communityMonthly:0}});
 const planned=calculateScenario({budget:{ibiAnnual:1500,wasteAnnual:300,communityMonthly:100,propertyCostsEstimated:true}});
 close(planned.budget.totalMonthly-base.budget.totalMonthly,250);
 assert.equal(planned.budget.incomplete,true);
 assert.equal(planned.budget.propertyCostsConfirmed,false);
 assert.ok(planned.budget.missingEstimates.some(x=>x.includes('sin comprobar')));
 assert.ok(planned.warnings.some(x=>x.includes('no un máximo')));
 const checked=calculateScenario({budget:{ibiAnnual:0,wasteAnnual:0,communityMonthly:0,propertyCostsConfirmed:true}});
 assert.ok(!checked.budget.missingEstimates.some(x=>x.includes('sin comprobar')));
 for(const budget of [{propertyCostsEstimated:'yes'},{propertyCostsConfirmed:null},{ibiLiquidableBase:-1},{ibiRatePercent:101},{propertyCostsEstimated:true,propertyCostsConfirmed:true}])assert.equal(calculateScenario({budget}).valid,false);
});
