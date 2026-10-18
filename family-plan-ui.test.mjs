import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFamilyPlan, familyPlanMonthLabel} from './family-plan-ui.mjs';

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const helpers = {euro: value => Number(value).toFixed(2) + ' €', esc};
const ids = ['buyer1', 'buyer2', 'mother', 'sister'];
const person = (overrides = {}) => ({income: 1500, common: 200, fixedPersonalDebt: 0, university: 0, mortgage: 200, familyRepayment: 50, motherBankPayment: 0, internalReceived: 0, icfRepayment: 0, expenses: 450, remaining: 1050, ...overrides});
function fixture() {
  const plan = {sharedCostMode: 'equal', personalDebtOwner: 'buyer1', university: {amount: 300, endMonth: '2027-06'}, sisterJob: {enabled: true, amount: 450, startMonth: '2027-01'}, purchaseMonth: null, motherLoanStartMonth: null, personalDebtEndMonth: null};
  const month = (value, phase, overrides = {}) => ({month: value, phase, people: Object.fromEntries(ids.map(id => [id, person(overrides[id])])), household: {income: 6000, expenses: 1800, remaining: 4200, internalTransfers: 100}});
  return {scenario: {familyPlan: plan}, result: {valid: true, plan, persons: ids.map(id => ({id, label: id, annualExtraIncome: 0})), months: [month('2026-12', 'renting'), month('2027-01', 'owning', {sister: {income: 0, mortgage: 0, familyRepayment: 0, expenses: 200, remaining: -200}}), month('2027-07', 'owning')], annualExtras: {total: 0, people: {}}, warnings: [], validation: [], purchaseMonth: '2027-01', motherLoanStartMonth: '2026-12', purchaseMonthAssumed: true}};
}

test('the allocation view prominently separates missing purchase capital from monthly savings',()=>{
 const {scenario,result}=fixture();result.purchaseFundingGap=2500;
 const html=renderFamilyPlan(scenario,result,helpers);
 assert.ok(html.includes('Faltan 2500.00 € para la compra o sus pagos previos'));
 assert.ok(html.includes('hipótesis hasta resolver el dinero inicial'));
 assert.ok(!html.includes('<option value="mother"'),'borrower debt cannot be moved to a non-borrower through this selector');
});

test('monthly view defaults to the first owning month, with a local month selector and all four people', () => {
  const {scenario, result} = fixture();
  const html = renderFamilyPlan(scenario, result, helpers);
  assert.match(html, /id="family-plan-month"/);
  assert.match(html, /value="2027-01" selected/);
  assert.doesNotMatch(html, /data-field="familyPlan.displayMonth"/);
  for (const id of ids) assert.ok(html.includes(`<h3>${id}</h3>`));
  assert.match(html, /necesita ayuda para cubrir su parte/);
  assert.match(html, /no redistribuye ese importe automáticamente/);
  assert.match(html, /family-plan-negative/);
});

test('month selection and end dates remain editable and university is distinguished from debt', () => {
  const {scenario, result} = fixture();
  const html = renderFamilyPlan(scenario, result, {...helpers, selectedMonth: '2026-12'});
  assert.match(html, /value="2026-12" selected/);
  for (const field of ['sharedCostMode', 'personalDebtOwner', 'personalDebtEndMonth', 'university.amount', 'university.endMonth', 'sisterJob.enabled', 'sisterJob.amount', 'sisterJob.startMonth', 'purchaseMonth', 'motherLoanStartMonth']) assert.ok(html.includes(`data-field="familyPlan.${field}"`), field);
  assert.match(html, /Es un gasto personal, no una cuota de préstamo/);
  assert.match(html, /value="2027-06"/);
  assert.match(html, /type="month" data-nullable="true" data-field="familyPlan.purchaseMonth"/);
  assert.match(html, /value="equal" selected/);
  assert.match(html, /siguen los porcentajes configurados en Compra y financiación/);
});

test('unknown cash-flow amounts remain incomplete, with no fabricated zero or savings', () => {
  const {scenario, result} = fixture();
  result.incomplete = true;
  result.months[1].people.mother = person({motherBankPayment: null, expenses: null, remaining: null});
  result.months[1].household.expenses = null;
  result.months[1].household.remaining = null;
  const html = renderFamilyPlan(scenario, result, helpers);
  assert.ok((html.match(/Por completar/g) || []).length >= 4);
  assert.match(html, /Resultado provisional/);
  assert.match(html, /todavía no es ahorro acumulado/);
  assert.match(html, /No se reparten entre los doce meses/);
  assert.doesNotMatch(html, /\bNaN\b|\bundefined\b|\bnull\b/);
});

test('internal transfers are described as internal and retain the full mother bank payment', () => {
  const {scenario, result} = fixture();
  result.months[1].people.mother = person({mortgage: 0, familyRepayment: 0, motherBankPayment: 140, internalReceived: 100, expenses: 340, remaining: 1260});
  const html = renderFamilyPlan(scenario, result, helpers);
  assert.match(html, /Devolución recibida de los hijos/);
  assert.match(html, /Cuota de mamá al banco/);
  assert.match(html, /se cuenta una sola vez/);
  assert.match(html, /140.00 €/);
});

test('rendering escapes labels and warnings and tolerates an empty timeline', () => {
  const {scenario, result} = fixture();
  result.persons[0].label = '<script>bad()</script>';
  result.warnings = ['<img src=x onerror=bad()>'];
  const html = renderFamilyPlan(scenario, result, helpers);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
  const empty = renderFamilyPlan({familyPlan: {}}, {valid: false, months: [], validation: {valid: false, errors: ['<error>']}}, helpers);
  assert.match(empty, /Completa los ingresos/);
  assert.match(empty, /&lt;error&gt;/);
  assert.doesNotMatch(empty, /NaN|undefined/);
});

test('month labels use Spanish names and reject malformed dates', () => {
  assert.equal(familyPlanMonthLabel('2027-01'), 'enero de 2027');
  assert.equal(familyPlanMonthLabel('2027-13'), 'Fecha pendiente');
  assert.equal(familyPlanMonthLabel('<bad>'), 'Fecha pendiente');
});
