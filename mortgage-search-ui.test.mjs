import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMortgageSearch} from './mortgage-search-ui.mjs';
import {normalizeScenario} from './finance.mjs';
import {calculateMortgageSearch, normalizeMortgageSearch} from './mortgage-search.mjs';

const helpers = {euro: (value, digits = 0) => `EUR${value.toFixed(digits)}`, num: value => String(value)};
const products = () => [
  {id: 'life', label: 'Vida', cost: null, frequency: 'annual', coverageYears: 1, quoteKnown: false, enabled: false, points: .1, annualThreshold: 200},
  {id: 'home', label: 'Hogar', cost: null, frequency: 'annual', coverageYears: 1, quoteKnown: false, enabled: true, points: .2, annualThreshold: 300},
  {id: 'protection', label: 'Protección de pagos', cost: null, frequency: 'upfront', coverageYears: 5, quoteKnown: false, enabled: true, points: .3, annualThreshold: 300}
];

function fixture() {
  const settings = {
    referenceMonth: '2026-10', purchaseMonth: '2027-06', cashSavings: 0, motherLoanCap: 21500, motherRate: 12, motherYears: 10,
    mortgageYears: 30, selectedBank: 'sabadell', financingMode: 'icf', bonusMode: 'full', conditional90Enabled: false,
    appraisalRatio: 1.125, testPrice: null,
    ownership: {ibiAnnual: 1500, wasteAnnual: null, communityMonthly: 0, maintenanceAnnual: null},
    purchase: {provisionPercent: 2, moving: 600, buffer: 3000, depositPercent: .1},
    offers: {
      sabadell: {baseRate: 3.75, payrollOnlyRate: 3.3, fullRate: 2.7, products: products(), externalHomeInsuranceAnnual: null},
      santander: {baseRate: 3.95, payrollOnlyRate: 3.45, fullRate: 2.95, products: products(), externalHomeInsuranceAnnual: null}
    }
  };
  const scenarios = [
    ['sabadell', 'icf', 182400], ['sabadell', 'standard', 71500],
    ['santander', 'icf', 148200], ['santander', 'standard', 70200], ['santander', 'conditional90', null]
  ].map(([bankId, financingMode, maxPriceKnownCosts]) => ({
    id: `${bankId}-${financingMode}`, bankId, bankName: bankId === 'sabadell' ? 'Sabadell' : 'Santander', financingMode,
    available: maxPriceKnownCosts != null, maxPriceKnownCosts, mortgagePrincipal: 145920, icfPrincipal: financingMode === 'icf' ? 36480 : 0,
    ownPriceContribution: financingMode === 'icf' && bankId === 'santander' ? 7410 : 0, motherLoanRequired: 21500,
    monthly: {mortgage: 591.4, motherBank: 308.5, ownership: 125, insurance: null, insuranceEquivalent: null, living: 2800, total: 3824.9},
    incomplete: true, missingQuotes: [`Seguro de hogar ${bankId}`], bindingConstraint: 'cash',
    limits: {spending: {fits: true}, debt: {fits: true}, finalCash: {fits: true}, earlyCash: {fits: true}},
    bonuses: {payrollRate: bankId === 'sabadell' ? 3.3 : 3.45, fullRate: bankId === 'sabadell' ? 2.7 : 2.95,
      interestSavingMonthly: 50, productMonthly: null, productEquivalentMonthly: null, netSavingMonthly: null, missingQuotes: [`Seguro de hogar ${bankId}`]},
    comparisonPeople: [{id: 'buyer1', label: 'Persona A', income: 2200, currentCost: 1300, purchaseCost: 1400, purchaseRemaining: 678}]
  }));
  return {
    settings, currentBudget: {month: '2026-10', totalMonthly: 3904, incomeMonthly: 5200, remainingMonthly: 1296, components: {rent: 1400, food: 800}, people: []},
    scenarios, selected: scenarios[0], comparisonPrice: 148200,
    atCommonPrice: scenarios.map(item => ({...item, mortgagePrincipal: 118560, motherLoanRequired: item.bankId === 'santander' ? 21200 : 19400})),
    errors: [], missingQuotes: ['Seguro de hogar sabadell', 'Seguro de hogar santander']
  };
}

const tagFor = (html, path) => html.match(new RegExp(`<input[^>]*data-field="${path.replaceAll('.', '\\.')}"[^>]*>`))?.[0];

test('unknown insurance remains pending while a known-cost ceiling is explicitly conditional', () => {
  const html = renderMortgageSearch(fixture(), helpers);
  assert.match(html, /Techo con costes conocidos/);
  assert.match(html, /Coste completo pendiente/);
  assert.match(html, /faltan primas o presupuestos que pueden reducir este precio/);
  assert.match(html, /Gasto mensual con compra[\s\S]*?≥ EUR3824\.90/);
  assert.match(html, /Seguros · recibos mensuales[\s\S]*?<span class="ms-pending">Pendiente/);
  assert.match(html, /Sin cotizaciones completas no sabemos si compensa bonificar/);
  assert.doesNotMatch(html, /NaN|undefined|EURNaN|EURnull/);
});

test('bank-specific pending quotes do not contaminate a completed selected bank', () => {
  const m = fixture();
  m.selected.incomplete = false;
  m.selected.missingQuotes = [];
  m.selected.bonuses.missingQuotes = [];
  m.selected.bonuses.netSavingMonthly = 20;
  m.selected.bonuses.productEquivalentMonthly = 30;
  m.selected.monthly.insurance = 30;
  const html = renderMortgageSearch(m, helpers);
  const hero = html.split('<section class="ms-hero">')[1].split('</section>')[0];
  assert.match(hero, /Simulación condicionada/);
  assert.doesNotMatch(hero, /Coste completo pendiente|faltan primas|≥/);
  assert.doesNotMatch(html, /Presupuestos pendientes · 1/);
  assert.match(html, /Seguro de hogar santander|Primas pendientes/);
});

test('each maximum stays distinct from the common-price comparison and manual price starts blank', () => {
  const m = fixture(), html = renderMortgageSearch(m, helpers);
  for (const amount of [182400, 71500, 148200, 70200]) assert.ok(html.includes(`EUR${amount}`));
  assert.match(html, /La misma compra: EUR148200/);
  assert.match(html, /Precio común derivado de los límites calculados/);
  assert.match(html, /Comparación de los cinco modos para una misma compra/);
  assert.match(tagFor(html, 'homeSearch.testPrice'), /data-nullable="true"[^>]*value=""/);
  assert.doesNotMatch(html, /250\.000|250000/);
  m.settings.testPrice = 188888;
  m.comparisonPrice = 188888;
  const manual = renderMortgageSearch(m, helpers);
  assert.match(manual, /La misma compra: EUR188888/);
  assert.match(manual, /Precio introducido para comprobar si cabe/);
});

test('nested spending and cash failures are shown before a provisional insurance status', () => {
  const m = fixture();
  m.atCommonPrice[0].limits.spending.fits = false;
  const html = renderMortgageSearch(m, helpers);
  const common = html.split('Comparación de los cinco modos para una misma compra')[1];
  assert.match(common, /Supera un límite/);
  assert.match(html, /su aceptación por el banco está pendiente/);
  assert.match(html, /Las arras no se suman dos veces/);
});

test('a false search-ceiling metadata flag is not treated as a failed financial limit', () => {
  const m = fixture();
  m.atCommonPrice.forEach(item => {item.limits.limitedBySearchCeiling = false;});
  const html = renderMortgageSearch(m, helpers);
  assert.doesNotMatch(html, /Supera un límite/);
});

test('all adjustable fields follow homeSearch paths and nullable numeric inputs preserve missing quotes', () => {
  const html = renderMortgageSearch(fixture(), helpers);
  for (const path of ['selectedBank', 'financingMode', 'bonusMode', 'referenceMonth', 'purchaseMonth', 'cashSavings', 'motherLoanCap', 'motherRate', 'motherYears', 'conditional90Enabled', 'appraisalRatio', 'testPrice', 'ownership.ibiAnnual', 'ownership.wasteAnnual', 'ownership.communityMonthly', 'ownership.maintenanceAnnual', 'purchase.provisionPercent', 'purchase.moving', 'purchase.buffer', 'purchase.depositPercent']) {
    assert.ok(html.includes(`data-field="homeSearch.${path}"`), path);
  }
  const appraisal = tagFor(html, 'homeSearch.appraisalRatio');
  assert.match(appraisal, /data-scale="100"/);
  assert.match(appraisal, /value="112.5"/);
  for (const bank of ['sabadell', 'santander']) {
    for (const field of ['baseRate', 'payrollOnlyRate', 'fullRate', 'externalHomeInsuranceAnnual']) assert.match(tagFor(html, `homeSearch.offers.${bank}.${field}`), /data-nullable="true"/);
    for (let i = 0; i < 3; i++) {
      assert.match(tagFor(html, `homeSearch.offers.${bank}.products.${i}.cost`), /data-nullable="true"[^>]*value=""/);
      assert.ok(html.includes(`data-field="homeSearch.offers.${bank}.products.${i}.frequency"`));
      assert.ok(html.includes(`data-field="homeSearch.offers.${bank}.products.${i}.quoteKnown"`));
    }
  }
  assert.match(html, /data-view="presentacion"/);
  assert.doesNotMatch(html, /data-field="homeSearch\.mortgageYears"/);
});

test('arras display a normalized fraction as percent and serialize back to the same engine fraction', () => {
  const m = fixture(), html = renderMortgageSearch(m, helpers);
  const deposit = tagFor(html, 'homeSearch.purchase.depositPercent');
  assert.match(deposit, /data-scale="100"/);
  assert.match(deposit, /max="100"/);
  assert.match(deposit, /value="10"/);
  const inputValue = Number(deposit.match(/\bvalue="([^"]*)"/)[1]);
  const inputScale = Number(deposit.match(/\bdata-scale="([^"]*)"/)[1]);
  const normalized = normalizeMortgageSearch({purchase: {...m.settings.purchase, depositPercent: inputValue / inputScale}});
  assert.equal(normalized.purchase.depositPercent, .1);
  assert.deepEqual(normalized._errors ?? [], []);
  assert.equal(normalized.purchase.provisionPercent, 2);
});

test('nullable external premiums and explicit quote flags survive normalization and render without broken labels', () => {
  const m = fixture();
  m.settings.offers.sabadell.externalHomeInsuranceAnnual = null;
  m.settings.offers.sabadell.products[0].label = null;
  m.settings.offers.sabadell.products[0].cost = null;
  m.settings.offers.sabadell.products[0].quoteKnown = false;
  m.settings = normalizeMortgageSearch(m.settings);
  let html;
  assert.doesNotThrow(() => {html = renderMortgageSearch(m, helpers);});
  assert.match(tagFor(html, 'homeSearch.offers.sabadell.externalHomeInsuranceAnnual'), /data-nullable="true"[^>]*value=""/);
  assert.doesNotMatch(tagFor(html, 'homeSearch.offers.sabadell.products.0.quoteKnown'), /checked/);
  assert.match(tagFor(html, 'homeSearch.offers.sabadell.products.0.cost'), /data-nullable="true"[^>]*value=""/);
  m.settings.offers.sabadell.externalHomeInsuranceAnnual = 180;
  m.settings.offers.sabadell.products[0].cost = 360;
  m.settings.offers.sabadell.products[0].quoteKnown = true;
  m.settings = normalizeMortgageSearch(m.settings);
  html = renderMortgageSearch(m, helpers);
  assert.match(tagFor(html, 'homeSearch.offers.sabadell.externalHomeInsuranceAnnual'), /value="180"/);
  assert.match(tagFor(html, 'homeSearch.offers.sabadell.products.0.quoteKnown'), /checked/);
  assert.match(tagFor(html, 'homeSearch.offers.sabadell.products.0.cost'), /value="360"/);
});

test('Santander eligibility thresholds are references rather than invented premiums, and products are independently selectable', () => {
  const html = renderMortgageSearch(fixture(), helpers);
  assert.match(html, /Bonifica 0.2 puntos si la prima anual supera EUR300/);
  assert.match(html, /El umbral no es el coste contratado/);
  assert.match(html, /Estos umbrales no son presupuestos de primas/);
  assert.match(html, /cuota estable desde el mes 7; TIN de los primeros seis meses pendiente/);
  assert.doesNotMatch(tagFor(html, 'homeSearch.offers.santander.products.0.enabled'), /checked/);
  assert.match(tagFor(html, 'homeSearch.offers.santander.products.1.enabled'), /checked/);
  assert.match(tagFor(html, 'homeSearch.offers.santander.products.2.enabled'), /checked/);
  assert.match(tagFor(html, 'homeSearch.offers.santander.products.1.cost'), /value=""/);
  assert.match(html, /Prima inicial total/);
  assert.match(html, /equivalente no se suma otra vez como recibo/);
});

test('missing payroll-only rate is not inferred from public discount points by the renderer', () => {
  const m = fixture();
  m.settings.offers.santander.payrollOnlyRate = null;
  m.scenarios.filter(item => item.bankId === 'santander').forEach(item => {item.bonuses.payrollRate = null; item.bonuses.interestSavingMonthly = null;});
  const html = renderMortgageSearch(m, helpers);
  assert.match(tagFor(html, 'homeSearch.offers.santander.payrollOnlyRate'), /value=""/);
  const bonus = html.split('<h3>Santander</h3>')[1].split('</article>')[0];
  assert.match(bonus, /Solo nómina<\/small><strong><span class="ms-pending">Pendiente/);
  assert.match(bonus, /EUR2\.95|2.95 %/);
});

test('disabled conditional ninety is visible without suggesting approval or a funded zero', () => {
  const html = renderMortgageSearch(fixture(), helpers);
  assert.match(html, /90 % condicionado/);
  assert.match(html, /Desactivado/);
  assert.doesNotMatch(tagFor(html, 'homeSearch.conditional90Enabled'), /checked/);
  assert.match(html, /no garantiza concesión/);
  assert.match(html, /no es una aprobación bancaria/);
});

test('unquoted expenses make disposable income an upper bound, never a lower bound', () => {
  const html = renderMortgageSearch(fixture(), helpers);
  assert.match(html, /≤ EUR678\.00/);
  assert.doesNotMatch(html, /≥ EUR678\.00/);
});

test('rent plus the mother loan before signing has its own visible budget warning', () => {
  const m = fixture();
  m.selected.limits.preclosing = {fits: true, monthlyExpenses: 4200, spendingAboveCurrentCap: true};
  const html = renderMortgageSearch(m, helpers);
  assert.match(html, /Antes de comprar también hay cuotas/);
  assert.match(html, /Alquiler y préstamo de mamá alcanzan EUR4200\.00\/mes/);
  assert.match(html, /El límite de búsqueda compara el mes de compra/);
});

test('provider labels, errors, input values and unknown quote descriptions cannot inject HTML', () => {
  const m = fixture();
  m.selected.bankName = '<img src=x onerror=alert(1)>';
  m.errors = ['<script>alert(1)</script>'];
  m.selected.missingQuotes = [{label: '<svg onload=alert(1)>'}];
  m.settings.offers.sabadell.products[0].label = 'Vida"><img src=x>';
  m.settings.offers.sabadell.products[0].cost = '" autofocus onfocus="alert(1)';
  const html = renderMortgageSearch(m, helpers);
  assert.doesNotMatch(html, /<img|<script|<svg|value="" autofocus/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&quot; autofocus onfocus=&quot;alert\(1\)/);
});

test('the current calculator contract renders five bank modes without leaking objects or treating a zero ceiling as a funded home', () => {
  const source = normalizeScenario({
    budget: {incomes: [{monthly: 2400, payments: 12}, {monthly: 1600, payments: 12}], currentRent: 1000, foodMonthly: 600, utilitiesMonthly: 200},
    familyLoan: {rate: 6.99, years: 8},
    familyPlan: {purchaseMonth: '2027-06'}
  });
  const m = calculateMortgageSearch(source, {}, {asOfMonth: '2026-10', step: 500});
  const html = renderMortgageSearch(m, helpers);
  assert.equal(m.scenarios.length, 5);
  assert.doesNotMatch(html, /NaN|undefined|\[object Object\]/);
  for (const item of m.scenarios) if (item.available && item.maxPriceKnownCosts > 0) assert.ok(html.includes(`EUR${item.maxPriceKnownCosts}`));
  assert.match(html, /homeSearch\.offers\.santander\.products\.1\.enabled/);
  assert.match(html, /costes conocidos/);
});

test('arras displays the stored fraction as a percentage and round-trips through the field scale', () => {
  const html = renderMortgageSearch(fixture(), helpers);
  const tag = tagFor(html, 'homeSearch.purchase.depositPercent');
  assert.match(tag, /data-scale="100"/);
  assert.match(tag, /value="10"/);
  assert.match(tag, /max="100"/);
});

test('bonus cards use the common-purchase evaluation and disclose the principal held constant', () => {
  const m = fixture();
  m.atCommonPrice = m.atCommonPrice.map(item => ({...item, bonuses: {...item.bonuses, interestSavingMonthly: 27.12}}));
  const html = renderMortgageSearch(m, helpers);
  const card = html.split('<h3>Sabadell</h3>')[1].split('</article>')[0];
  assert.match(card, /Capital hipotecario comparado: EUR118560 a 30 años/);
  assert.match(card, /EUR27\.12/);
  assert.doesNotMatch(card, /EUR50\.00/);
});
