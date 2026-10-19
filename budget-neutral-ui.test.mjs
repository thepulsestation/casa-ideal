import test from 'node:test';
import assert from 'node:assert/strict';
import {renderBudgetNeutral, renderMonthlyCostComparison} from './budget-neutral-ui.mjs';

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const helpers = {euro: (value, digits = 2) => new Intl.NumberFormat('es-ES', {useGrouping: 'always', minimumFractionDigits: digits, maximumFractionDigits: digits}).format(value) + ' €', pct: value => (value * 100).toFixed(0) + ' %', esc};
const person = (id, label, currentCost, purchaseCost, income) => ({id, label, income, currentCost, purchaseCost, difference: purchaseCost - currentCost, currentRemaining: income - currentCost, purchaseRemaining: income - purchaseCost});
function fixture() {
  const comparison = {month: '2026-10', currentTotal: 3000, purchaseTotal: 3000, difference: 0, people: [person('buyer1', 'Tú', 1500, 1000, 2000), person('buyer2', 'Tu hermano', 1100, 1000, 1430.06), person('mother', 'Tu madre', 400, 800, 1200), person('sister', 'Tu hermana', 0, 200, 500)]};
  return {
    scenario: {name: 'Piso de referencia', budget: {debtRatioLimit: .35}},
    capacity: {valid: true, month: '2026-10', maxPrice: 180000, maxIndividualPrice: 0, bankCapacity: {maxPrice: 215000}, summary: {mortgageMonthly: 600, motherLoanRequired: 18000, motherBankMonthly: 243, comparison}, individualSummary: null, comparison, pendingAssumptions: ['Tasación por confirmar'], missingQuotes: ['Seguro de vida sin prima']},
  };
}

test('family ceiling stays separate from debt ceiling and shows the full recurring cost', () => {
  const {scenario, capacity} = fixture();
  const html = renderBudgetNeutral(scenario, capacity, helpers);
  assert.match(html, /Hasta 180\.000 € sin subir el gasto de la familia/);
  assert.match(html, /Tope por deuda y dinero inicial · separado<\/small><strong>215\.000 €/);
  assert.match(html, /Hipoteca \/ mes<\/small><strong>600,00 €/);
  assert.match(html, /Capital del préstamo de mamá<\/small><strong>18\.000 €/);
  assert.match(html, /Cuota bancaria de mamá \/ mes<\/small><strong>243,00 €/);
  assert.match(html, /octubre de 2026/);
  assert.match(html, /Faltan precios por confirmar/);
  assert.match(html, /Ninguna de estas cifras equivale a financiación aprobada/);
});

test('a stable household total does not imply nobody pays more', () => {
  const {scenario, capacity} = fixture();
  const html = renderBudgetNeutral(scenario, capacity, helpers);
  assert.match(html, /Tu madre, Tu hermana pagarían más con este reparto/);
  assert.match(html, /class="negative">\+400,00 €/);
  assert.match(html, /class="positive">−500,00 €/);
  assert.match(html, /Le queda de su nómina/);
  assert.match(html, /no presupone que ese dinero se ahorre/);
  assert.match(html, /data-budget-neutral-mode="household" aria-pressed="true"/);
  assert.match(html, /data-budget-neutral-mode="individual" aria-pressed="false"/);
});

test('individual mode explains a zero ceiling without advertising a free house or a false financing amount', () => {
  const {scenario, capacity} = fixture();
  const html = renderBudgetNeutral(scenario, capacity, {...helpers, mode: 'individual'});
  assert.match(html, /Con este reparto, alguien pagaría más/);
  assert.match(html, /incluso con una vivienda más barata/);
  assert.match(html, /El reparto de la vivienda de referencia/);
  assert.match(html, /data-budget-neutral-mode="individual" aria-pressed="true"/);
  assert.doesNotMatch(html, /Hasta 0|Capital del préstamo de mamá<|Hipoteca \/ mes<\/small>/);
});

test('individual mode uses its own ceiling, metrics and personal comparison', () => {
  const {scenario, capacity} = fixture();
  capacity.maxIndividualPrice = 120000;
  capacity.individualSummary = {mortgageMonthly: 400, loanRequired: 15000, motherBankMonthly: 200, comparison: {...capacity.comparison, purchaseTotal: 2400, difference: -600, people: [person('buyer1', 'Tú', 1500, 1200, 2000), person('mother', 'Tu madre', 400, 300, 1200)]}};
  const html = renderBudgetNeutral(scenario, capacity, {...helpers, mode: 'individual'});
  assert.match(html, /Hasta 120\.000 € sin que nadie pague más/);
  assert.match(html, /Hipoteca \/ mes<\/small><strong>400,00 €/);
  assert.match(html, /Compra · en este precio máximo<\/small><strong>2\.400,00 €/);
  assert.match(html, /class="positive">−600,00 €/);
  assert.doesNotMatch(html, /pagaría más con este reparto|pagarían más con este reparto|180\.000/);
});

test('unknown capacity and amounts remain visibly unknown', () => {
  const html = renderBudgetNeutral({}, {maxPrice: null, bankCapacity: {}, comparison: {people: [{label: 'Tú', currentCost: null, purchaseCost: null, difference: null, purchaseRemaining: null}]}}, helpers);
  assert.match(html, /Faltan datos para calcular este límite/);
  assert.match(html, /Por completar/);
  assert.doesNotMatch(html, /NaN|undefined|null|Hasta 0|−0,00/);
  assert.match(renderMonthlyCostComparison(null, helpers), /Completa el presupuesto/);
});

test('comparison labels, reference name and pending explanations are escaped', () => {
  const {scenario, capacity} = fixture();
  scenario.name = '<img src=x onerror=alert(1)>';
  capacity.summary.comparison.people[0].label = '<script>alert(1)</script>';
  capacity.pendingAssumptions = ['<svg onload=alert(1)>'];
  const html = renderBudgetNeutral(scenario, capacity, helpers);
  assert.doesNotMatch(html, /<script>|<img |<svg /);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img /);
  assert.match(html, /&lt;svg /);
});

test('overview comparison can stay compact while retaining net costs and individual increases', () => {
  const {capacity} = fixture();
  const html = renderMonthlyCostComparison(capacity.comparison, {...helpers, compact: true});
  assert.match(html, /Lo que pagaría cada persona al mes/);
  assert.match(html, /Total de la familia/);
  assert.match(html, /Tu madre, Tu hermana pagarían más/);
  assert.doesNotMatch(html, /Le queda de su nómina|no presupone que ese dinero se ahorre/);
});

test('snapshot assumptions disclose unchanged costs, ordinary income and reference property estimates', () => {
  const {scenario, capacity} = fixture();
  const html = renderBudgetNeutral(scenario, capacity, helpers);
  assert.match(html, /Comida, suministros, transporte, trastero, seguros/);
  assert.match(html, /No se eliminan gastos para hacer encajar la compra: se usa el calendario indicado en ambos casos/);
  assert.match(html, /Las pagas extra, cobros extraordinarios y ahorros acumulados no amplían el presupuesto mensual ordinario/);
  assert.match(html, /IBI, residuos, comunidad y seguros de compra se toman de Piso de referencia/);
  assert.match(html, /35 % de los titulares/);
  assert.match(html, /el préstamo familiar no se cuenta dos veces/);
  assert.match(html, /Seguro de vida sin prima/);
});
