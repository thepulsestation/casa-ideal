import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScenario, calculateScenario } from './finance.mjs';
import { createHousingScenario, updateHousingDetails, validateHousingDetails, safeImageUrl, getHousingDetails } from './housing.mjs';

const details = overrides => ({ name: 'Piso de prueba', url: 'https://example.com/anuncio/1', purchasePrice: 190000, ...overrides });
const existing = () => normalizeScenario({
  id: 'saved-house', name: 'Anterior', url: 'https://example.com/old', notes: 'Nota antigua',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z',
  purchasePrice: 220000, appraisalValue: 230000, referenceValue: 225000, declaredValue: 221000,
  images: ['https://example.com/old.jpg'], listingDetails: { city: 'Localidad anterior' },
  budget: {
    incomes: [{ monthly: 2100, payments: 12 }, { monthly: 1700, payments: 14 }],
    householdIncomes: [{ id: 'mother', monthly: 800, payments: 14 }, { id: 'sister', monthly: 300, payments: 12 }],
    foodMonthly: 523, carMonthly: 117, storageMonthly: 63, existingDebtMonthly: 91,
    familyExistingDebtMonthly: 32, familyIncomeMonthly: 50, currentRent: 987,
    utilitiesMode: 'detailed', utilityBreakdown: { waterMonthly: 29, energyMonthly: 71, internetMonthly: 31, otherMonthly: 9 },
    ibiAnnual: 765, wasteAnnual: 233, communityMonthly: 85, maintenanceAnnual: 610,
    propertyCostsEstimated: false, propertyCostsConfirmed: true,
    ibiLiquidableBase: 150000, ibiRatePercent: 0.51, externalHomeInsuranceAnnual: 350,
  },
  mortgage: { amount: 170000, baseRate: 3.5, ltv: 0.8, years: 25, discounts: [
    { id: 'payroll', enabled: true, points: 0.4, cost: 0, frequency: 'monthly', quoteKnown: true },
    { id: 'life', enabled: true, points: 0.4, cost: 350, frequency: 'annual', quoteKnown: true },
    { id: 'home', enabled: true, points: 0.1, cost: 250, frequency: 'annual', quoteKnown: true },
  ] },
  tax: { mode: 'new', ajdRate: 0, buyers: [
    { id: 'buyer-1', share: 0.6, rate: 0.05, eligibilityConfirmed: true },
    { id: 'buyer-2', share: 0.4, rate: 0.1, eligibilityConfirmed: false },
  ] },
  cash: { savings: 4200, depositAmount: 22000, depositPercent: 0.15, familyLoanAvailableBeforeDeposit: true },
  purchaseCosts: { appraisal: 425, legal: 900, notary: 830, registry: 410, agency: 200, broker: 550, other: 73, renovations: 18500, reserve: 2500 },
  familyLoan: { enabled: false, amount: 24000, rate: 8, years: 7, maxAmount: 40000 },
  motherTransfer: { familyRate: 0, familyYears: 12, giftNotaryCost: 400 },
  icf: { enabled: true, eligibilityConfirmed: true },
});

test('housing validation normalizes editable listing fields without inferring anything', () => {
  const checked = validateHousingDetails(details({ name: '  Piso de prueba  ', purchasePrice: '190000', listingDetails: { city: ' Localidad ', surfaceM2: '82.5', beds: '3', baths: 1, reference: ' ref-1 ', title: ' Anuncio ', sourceReadAt: '2026-01-02T10:30:00Z' } }));
  assert.equal(checked.valid, true);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.details.name, 'Piso de prueba');
  assert.equal(checked.details.purchasePrice, 190000);
  assert.equal(checked.details.propertyType, 'flat');
  assert.equal(checked.details.taxMode, 'used');
  assert.equal(checked.details.listingDetails.surfaceM2, 82.5);
  assert.equal(checked.details.listingDetails.city, 'Localidad');
  assert.equal(checked.details.listingDetails.sourceReadAt, '2026-01-02T10:30:00.000Z');
});

test('invalid name, price, kind, tax mode, and metadata are rejected before creating anything', () => {
  for (const bad of [
    { name: '' }, { name: 'x'.repeat(121) }, { name: 3 },
    { purchasePrice: 0 }, { purchasePrice: -1 }, { purchasePrice: Infinity }, { purchasePrice: null }, { purchasePrice: true },
    { propertyType: 'unknown' }, { taxMode: 'unknown' }, { notes: {} },
    { listingDetails: { city: {} } }, { listingDetails: { surfaceM2: -1 } },
    { listingDetails: { beds: 1.5 } }, { listingDetails: { baths: NaN } },
    { listingDetails: { sourceReadAt: 'not a date' } }, { listingDetails: { unrecognized: 'value' } },
  ]) {
    const checked = validateHousingDetails(details(bad));
    assert.equal(checked.valid, false);
    assert.equal(checked.details, null);
    assert.throws(() => createHousingScenario({}, details(bad)));
  }
});

test('listing URLs are optional HTTP/HTTPS, while image URLs require HTTPS and no credentials', () => {
  assert.equal(validateHousingDetails(details({ url: '', images: [] })).valid, true);
  assert.equal(validateHousingDetails(details({ url: 'http://example.com/listing' })).valid, true);
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'https://user:password@example.com', '/relative']) {
    assert.equal(validateHousingDetails(details({ url })).valid, false);
  }
  assert.equal(safeImageUrl(' https://example.com/photo.jpg '), 'https://example.com/photo.jpg');
  for (const image of ['http://example.com/photo.jpg', 'data:image/png;base64,fictional', 'javascript:alert(1)', 'https://user:password@example.com/p.jpg', null, {}, '']) {
    assert.equal(safeImageUrl(image), null);
    assert.equal(validateHousingDetails(details({ images: [image] })).valid, false);
  }
  assert.equal(validateHousingDetails(details({ images: Array.from({ length: 9 }, (_, i) => `https://example.com/${i}.jpg`) })).valid, false);
  const deduplicated = validateHousingDetails(details({ images: ['https://example.com/image.jpg', 'https://example.com/image.jpg'] }));
  assert.deepEqual(deduplicated.details.images, ['https://example.com/image.jpg']);
});

test('a new housing scenario preserves family bills, incomes, current rent, debts, and savings', () => {
  const current = existing();
  const fresh = createHousingScenario(current, details());
  for (const key of ['incomes', 'householdIncomes', 'foodMonthly', 'carMonthly', 'storageMonthly', 'existingDebtMonthly', 'familyExistingDebtMonthly', 'familyIncomeMonthly', 'currentRent', 'utilitiesMode', 'utilityBreakdown']) {
    assert.deepEqual(fresh.budget[key], current.budget[key]);
  }
  assert.equal(fresh.cash.savings, current.cash.savings);
  assert.equal(fresh.cash.depositAmount, undefined);
  assert.equal(fresh.cash.familyLoanAvailableBeforeDeposit, true);
  fresh.budget.incomes[0].monthly = 1;
  assert.equal(current.budget.incomes[0].monthly, 2100, 'the family budget must not be aliased');
});

test('a new property resets property-specific amounts, confirmations, and identity', () => {
  const current = existing();
  const snapshot = structuredClone(current);
  const fresh = createHousingScenario(current, details({ propertyType: 'house', taxMode: 'new', images: ['https://example.com/new.jpg'], listingDetails: { city: 'Nueva localidad' } }));
  assert.deepEqual(current, snapshot);
  for (const key of ['id', 'createdAt', 'updatedAt']) assert.equal(fresh[key], undefined);
  for (const key of ['appraisalValue', 'referenceValue', 'declaredValue']) assert.equal(fresh[key], null);
  for (const key of ['appraisal', 'legal', 'notary', 'registry', 'agency', 'broker', 'other', 'renovations', 'reserve']) assert.equal(fresh.purchaseCosts[key], 0);
  assert.equal(fresh.purchaseCosts.mode, 'provision');
  assert.equal(fresh.purchaseCosts.provisionAmount, 5000);
  assert.equal(fresh.purchaseCosts.provisionBeforeSigning, 0);
  for (const key of ['ibiAnnual', 'wasteAnnual', 'communityMonthly', 'maintenanceAnnual']) assert.equal(fresh.budget[key], 0);
  assert.equal(fresh.budget.propertyCostsEstimated, false);
  assert.equal(fresh.budget.propertyCostsConfirmed, false);
  assert.equal(fresh.budget.ibiLiquidableBase, null);
  assert.equal(fresh.budget.ibiRatePercent, null);
  assert.equal(fresh.budget.externalHomeInsuranceAnnual, null);
  assert.equal(fresh.icf.eligibilityConfirmed, false);
  assert.equal(fresh.name, 'Piso de prueba');
  assert.deepEqual(fresh.images, ['https://example.com/new.jpg']);
  assert.equal(fresh.notes, '');
  assert.deepEqual(fresh.listingDetails, { city: 'Nueva localidad' });
});

test('bank conditions and personal tax profiles remain, while manual principal and old premiums do not', () => {
  const current = existing();
  const fresh = createHousingScenario(current, details());
  assert.equal(fresh.mortgage.amount, null);
  for (const key of ['baseRate', 'ltv', 'years']) assert.equal(fresh.mortgage[key], current.mortgage[key]);
  assert.deepEqual(fresh.mortgage.discounts[0], current.mortgage.discounts[0]);
  for (const product of fresh.mortgage.discounts.slice(1)) {
    assert.equal(product.enabled, true);
    assert.equal(product.cost, null);
    assert.equal(product.quoteKnown, false);
  }
  assert.deepEqual(fresh.tax.buyers, current.tax.buyers);
  assert.equal(fresh.tax.mode, 'used');
  assert.equal(fresh.tax.ajdRate, 0.015, 'an old property AJD exemption must not silently apply to the new property');
});

test('a new scenario has explicit bank hypotheses while retaining independent family terms', () => {
  const fresh = createHousingScenario(existing(), details());
  for (const [key, expected] of Object.entries({ enabled: true, amount: null, rate: 5, years: 10, assumedTerms: true, extraBuffer: 3000, maxAmount: 60000 })) assert.equal(fresh.familyLoan[key], expected);
  assert.equal(fresh.motherTransfer.familyYears, 12);
  assert.equal(fresh.motherTransfer.familyRate, 0);
  assert.equal(fresh.familyLoan.coverEarlyLiquidity, true);
  assert.equal(fresh.motherTransfer.repaymentMode, 'custom');
  assert.equal(fresh.financingPlanVersion, 2);
  assert.equal(fresh.motherTransfer.giftNotaryCost, 0);
  const withoutCalendar = createHousingScenario({}, details());
  assert.equal(withoutCalendar.motherTransfer.familyYears, null);
  assert.equal(calculateScenario(withoutCalendar).motherTransfer.effectiveFamilyYears, null,'an unknown independent family term is not replaced with the bank term');
});

test('new properties explore 80% mortgage plus ICF without changing saved disabled plans or claiming eligibility', () => {
  const saved = normalizeScenario({ icf: { enabled: false, eligibilityConfirmed: false }, mortgage: { ltv: 0.9 },
    motherTransfer: { repaymentMode: 'custom', familyRate: 0, familyYears: 12 },
  });
  const before = structuredClone(saved);
  const fresh = createHousingScenario(saved, details({ purchasePrice: 200000 }));
  assert.equal(fresh.mortgage.ltv, 0.8);
  assert.equal(fresh.icf.enabled, true);
  assert.equal(fresh.icf.eligibilityConfirmed, false);
  assert.equal(fresh.icf.ltv, 0.2);
  assert.equal(fresh.icf.maxAmount, 50000);
  assert.equal(fresh.motherTransfer.repaymentMode, 'custom');
  assert.equal(fresh.motherTransfer.familyRate, 0);
  assert.equal(fresh.motherTransfer.familyYears, 12);
  const r = calculateScenario(fresh);
  assert.equal(r.financing.bankMortgage, 160000);
  assert.equal(r.financing.icf, 40000);
  assert.equal(r.financing.uncoveredPurchasePrice, 0);
  assert.equal(r.icf.hypothetical, true);
  assert.deepEqual(saved, before);
  assert.equal(normalizeScenario(saved).icf.enabled, false);
  assert.equal(calculateScenario(saved).icf.enabled, false);
  assert.equal(updateHousingDetails(saved, { name: 'Plan guardado', purchasePrice: 200000 }).icf.enabled, false);
});

test('new property retains the supplied bank reference and an independent zero-interest family loan', () => {
  const current=existing();
  current.familyLoan={...current.familyLoan,rate:8,years:8,amount:20000,maxAmount:60000,originationFeePercent:0,
    referenceOffer:{amount:20000,years:8,monthlyPayment:282.73,tin:8,tae:8.30,maxAmount:20000,source:'Captura aportada por la familia',verifiedAt:'2026-10-18'},
    negotiation:{maxAmount:60000,maxYears:10,openingPercent:0,earlyRepaymentPercent:0,confirmed:false}};
  current.motherTransfer={...current.motherTransfer,mode:'family-loan',repaymentMode:'custom',familyRate:0,familyYears:10};
  const fresh=createHousingScenario(current,details());
  assert.equal(fresh.familyLoan.amount,null,'new property resizes the bank principal');
  assert.equal(fresh.familyLoan.rate,8);
  assert.equal(fresh.familyLoan.years,8);
  assert.deepEqual(fresh.familyLoan.referenceOffer,current.familyLoan.referenceOffer);
  assert.deepEqual(fresh.familyLoan.negotiation,current.familyLoan.negotiation);
  assert.equal(fresh.motherTransfer.repaymentMode,'custom');
  assert.equal(fresh.motherTransfer.familyRate,0);
  assert.equal(fresh.motherTransfer.familyYears,10);
  fresh.familyLoan.referenceOffer.amount=1;
  assert.equal(current.familyLoan.referenceOffer.amount,20000,'offer metadata is detached');
  fresh.familyLoan.years=10;
  assert.equal(fresh.motherTransfer.familyYears,10,'bank term edits do not rewrite family terms');
});

test('new properties preserve a reported operational cap even without a historical offer',()=>{
 const current=existing();
 current.familyLoan={...current.familyLoan,maxAmount:19000,years:8,rate:8,reportedLimit:{maxAmount:19000,maxYears:8,source:'Confirmación de prueba',reportedAt:'2026-10-18'}};
 const fresh=createHousingScenario(current,details());
 assert.equal(fresh.familyLoan.maxAmount,19000);
 assert.equal(fresh.familyLoan.years,8);
 assert.deepEqual(fresh.familyLoan.reportedLimit,current.familyLoan.reportedLimit);
 fresh.familyLoan.reportedLimit.maxAmount=1;
 assert.equal(current.familyLoan.reportedLimit.maxAmount,19000,'reported metadata is detached');
});

test('partial editing changes metadata without resetting saved financial data or timestamps', () => {
  const current = existing();
  const snapshot = structuredClone(current);
  const edited = updateHousingDetails(current, { name: 'Nombre nuevo', images: ['https://example.com/new.jpg'] });
  assert.equal(edited.name, 'Nombre nuevo');
  assert.deepEqual(edited.images, ['https://example.com/new.jpg']);
  for (const key of ['id', 'createdAt', 'updatedAt', 'purchasePrice', 'appraisalValue', 'referenceValue']) assert.equal(edited[key], current[key]);
  for (const key of ['budget', 'mortgage', 'familyLoan', 'purchaseCosts', 'tax', 'cash', 'motherTransfer']) assert.deepEqual(edited[key], current[key]);
  assert.deepEqual(current, snapshot);
  edited.budget.foodMonthly = 1;
  assert.equal(current.budget.foodMonthly, 523, 'editing returns a detached scenario');
});

test('editing price, type, tax mode, and listing details only updates their own metadata paths', () => {
  const current = existing();
  const edited = updateHousingDetails(current, { purchasePrice: 195000, propertyType: 'flat', taxMode: 'used', listingDetails: { surfaceM2: 95, beds: 3, baths: 2 }, notes: 'Revisar anuncio' });
  assert.equal(edited.purchasePrice, 195000);
  assert.equal(edited.propertyType, 'flat');
  assert.equal(edited.tax.mode, 'used');
  assert.deepEqual(edited.tax.buyers, current.tax.buyers);
  assert.equal(edited.listingDetails.city, current.listingDetails.city, 'a partial listing patch retains other listing metadata');
  assert.equal(edited.listingDetails.surfaceM2, 95);
  assert.deepEqual(edited.purchaseCosts, current.purchaseCosts);
  assert.deepEqual(edited.mortgage, current.mortgage);
  assert.deepEqual(edited.budget, current.budget);
  assert.throws(() => updateHousingDetails(current, { purchasePrice: -1 }));
});

test('editable metadata snapshots are detached from the original scenario', () => {
  const current = existing();
  const form = getHousingDetails(current);
  assert.equal(form.taxMode, current.tax.mode);
  form.images.push('https://example.com/another.jpg');
  form.listingDetails.city = 'Changed';
  assert.equal(current.images.length, 1);
  assert.equal(current.listingDetails.city, 'Localidad anterior');
});
