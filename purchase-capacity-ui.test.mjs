import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPurchaseCapacity} from './purchase-capacity-ui.mjs';

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const helpers = {euro: value => Number(value).toFixed(2) + ' €', pct: value => (Number(value) * 100).toFixed(1) + ' %', esc};
function fixture() {
  const scenario = {tax: {buyers: [{rate: .05, eligibilityConfirmed: true}, {rate: .05, eligibilityAssumed: true}]}, budget: {debtRatioLimit: .35}};
  const result = {valid: true, maxPrice: 180000, maxByDebt: 200000, maxByCash: 180000, bindingConstraint: 'cash', priceStep: 500, financingAssumptions: {bankLtv: .8, icfLtv: .2, icfEnabled: true, icfMaxAmount: 50000, loanLimit: 20000, loanYears: 8, loanRate: 7, familyRate: 0, familyYears: 8}, summary: {borrowerRegularIncome: 4000, debtLimitRatio: .35, debtLimitMonthly: 1400, existingDebtMonthly: 200, loanLimit: 20000, mortgageMonthly: 600, familyRepaymentMonthly: 190, loanRequired: 18200, borrowerDebtRatio: .2475, mortgagePrincipal: 144000, icfPrincipal: 36000, tax: 9000, fees: 4000, moving: 700, buffer: 2500, cashRequired: 16200, savings: 0, earlyCashRequired: 18000, motherBankMonthly: 250}, pendingAssumptions: ['Financiación por confirmar'], missingQuotes: ['Seguro de vida pendiente']};
  return {scenario, result};
}

test('capacity summary distinguishes bank/ICF percentages, debt limit and provisional search price', () => {
  const {scenario, result} = fixture();
  const html = renderPurchaseCapacity(scenario, result, helpers);
  assert.match(html, /Hasta 180000.00 € de precio · orientativo/);
  assert.match(html, /Hipoteca: 80.0 %/);
  assert.match(html, /ICF: hasta 20.0 %/);
  assert.match(html, /35.0 %/);
  assert.match(html, /liquidez inicial y el límite de mamá/);
  assert.match(html, /no equivale a aprobación/);
  assert.match(html, /pagas extra y el futuro sueldo de tu hermana no elevan el límite bancario/);
});

test('tax checks and unknown quotes remain visible rather than treating pending expenses as free', () => {
  const {scenario, result} = fixture();
  const html = renderPurchaseCapacity(scenario, result, helpers);
  assert.match(html, /requisitos marcados como revisados/);
  assert.match(html, /tipo reducido como hipótesis/);
  assert.match(html, /Seguro de vida pendiente/);
  assert.match(html, /no se tratan como gastos confirmados a cero/);
  assert.match(html, /Las arras son parte del precio y no se añaden una segunda vez/);
});

test('missing or infeasible capacity does not display an invented price or approved financing', () => {
  const {scenario} = fixture();
  const unknown = renderPurchaseCapacity(scenario, {maxPrice: null, summary: null, borrowerRegularIncome: null, loanLimit: 20000, financingAssumptions: {}}, helpers);
  assert.match(unknown, /Faltan datos para calcular un precio máximo/);
  assert.match(unknown, /Por completar/);
  assert.doesNotMatch(unknown, /Hasta 0|NaN|undefined|null/);
  const zero = renderPurchaseCapacity(scenario, {maxPrice: 0, reason: 'Falta caja', summary: null}, helpers);
  assert.match(zero, /la compra necesita ajustes/);
  assert.match(zero, /Falta caja/);
});

test('capacity renderer escapes external reasons and pending notices', () => {
  const {scenario, result} = fixture();
  result.maxPrice = null;
  result.reason = '<script>bad()</script>';
  result.missingQuotes = ['<img src=x>'];
  const html = renderPurchaseCapacity(scenario, result, helpers);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
});

test('overview shows percentage provision and bank, ICF and tax capital before any disclosure', () => {
  const {scenario, result} = fixture();
  scenario.purchaseCosts = {mode: 'provision', provisionBasis: 'percent', provisionPercent: 2};
  result.maxPrice = 210000;
  Object.assign(result.summary, {mortgagePrincipal: 168000, icfPrincipal: 42000, tax: 10500, fees: 4200, moving: 600, buffer: 3000, cashRequired: 18300, savings: 0, loanRequired: 21000, earlyCashRequired: 21000, priceContribution: 0, otherInitialCosts: 0, upfrontFundingExtra: 2700});
  result.financingAssumptions.loanReferenceLimit = 21500;
  const html = renderPurchaseCapacity(scenario, result, helpers);
  const visible = html.split('<details')[0];
  assert.match(visible, /Provisión de compra y honorarios · 2.0 % del precio/);
  assert.match(visible, /Hipoteca · 80.0 % de la base financiable<\/small><strong>168000.00 €/);
  assert.match(visible, /ICF · hasta 20.0 %<\/small><strong>42000.00 €/);
  assert.match(visible, /ITP · 5.0 % por titular<\/small><strong>10500.00 €/);
  assert.match(visible, /Colchón conservado<\/dt><dd>3000.00 €/);
  assert.match(visible, /Necesidad final de compra<\/strong><\/dt><dd><strong>18300.00 €/);
  assert.match(visible, /Liquidez adicional antes de firmar<\/dt><dd>2700.00 €/);
  assert.match(visible, /Capital del préstamo necesario<\/strong><\/dt><dd><strong>21000.00 €/);
  assert.match(visible, /Límite de referencia de mamá: <strong>21500.00 €/);
  assert.match(visible, /Su compensación depende del desembolso confirmado/);
  assert.doesNotMatch(visible, /se devuelve automáticamente|dinero libre en vuestra cuenta/);
});

test('overview respects an ICF cap and does not label a mixed or unverified tax as 5 percent', () => {
  const {scenario, result} = fixture();
  result.maxPrice = 300000;
  Object.assign(result.summary, {mortgagePrincipal: 240000, icfPrincipal: 50000, tax: 22500, priceContribution: 10000});
  scenario.tax.buyers[1] = {rate: .05, eligibilityConfirmed: false, eligibilityAssumed: false};
  const visible = renderPurchaseCapacity(scenario, result, helpers).split('<details')[0];
  assert.match(visible, /ICF · hasta 20.0 %<\/small><strong>50000.00 €/);
  assert.match(visible, /Precio sin financiar<\/dt><dd>10000.00 €/);
  assert.match(visible, /ITP · según cada titular<\/small><strong>22500.00 €/);
  assert.doesNotMatch(visible, /ITP · 5.0 % por titular/);
  assert.doesNotMatch(visible, /21500.00/);
});

test('fixed and itemized expenses do not advertise a percentage provision', () => {
  const {scenario, result} = fixture();
  scenario.purchaseCosts = {mode: 'provision', provisionBasis: 'fixed', provisionAmount: 5000, provisionPercent: 2};
  assert.doesNotMatch(renderPurchaseCapacity(scenario, result, helpers), /2.0 % del precio/);
  scenario.purchaseCosts.mode = 'itemized';
  assert.match(renderPurchaseCapacity(scenario, result, helpers), /Gastos introducidos/);
  assert.doesNotMatch(renderPurchaseCapacity(scenario, result, helpers), /2.0 % del precio/);
});
