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
 const personalDebtSelector=html.match(/<select data-field="familyPlan.personalDebtOwner">(.*?)<\/select>/s)?.[1];
 assert.ok(personalDebtSelector);
 assert.ok(!personalDebtSelector.includes('<option value="mother"'),'borrower debt cannot be moved to a non-borrower through its selector');
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
  assert.match(html, /has-deficit/);
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

test('current rent and living roles are editable separately from equal sharing between future earners', () => {
  const {scenario, result} = fixture();
  result.plan.sharedCostMode = 'workers';
  result.plan.currentAllocation = {enabled: true, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'unassigned'};
  result.months[0].currentAllocationApplied = true;
  const html = renderFamilyPlan(scenario, result, {...helpers, selectedMonth: '2026-12'});
  assert.match(html, /Mientras seguís de alquiler · hasta el mes de compra/);
  assert.match(html, /data-field="familyPlan.currentAllocation.enabled" checked/);
  assert.match(html, /data-field="familyPlan.currentAllocation.rentPayer"><option value="buyer1" selected/);
  assert.match(html, /data-scale="100" data-field="familyPlan.currentAllocation.brotherLivingShare" value="50"/);
  assert.match(html, /value="unassigned" selected/);
  assert.match(html, /data-field="familyPlan.sharedCostMode"><option value="workers" selected>Entre quienes tienen ingresos/);
  assert.match(html, /reparto actual no cambia automáticamente antes de comprar/);
  assert.match(html, /Mes de alquiler: se usa vuestro reparto actual/);
  assert.match(html, /Después de comprar · gastos comunes/);
  const owning = renderFamilyPlan(scenario, result, {...helpers, selectedMonth: '2027-01'});
  assert.match(owning, /Quien no cobra no tiene parte asignada/);
});

test('an enabled current allocation opens the current rental month and offers explicit phase shortcuts', () => {
  const {scenario, result} = fixture();
  result.plan.currentAllocation = {enabled: true};
  const html = renderFamilyPlan(scenario, result, helpers);
  assert.match(html, /value="2026-12" selected/);
  assert.match(html, /data-action="plan-month" data-id="2026-12" aria-pressed="true">Ahora · alquiler/);
  assert.match(html, /data-action="plan-month" data-id="2027-01" aria-pressed="false">Después de comprar/);
  const future = renderFamilyPlan(scenario, result, {...helpers, selectedMonth: '2027-07'});
  assert.match(future, /value="2027-07" selected/);
  result.months = result.months.filter(row => row.phase !== 'renting');
  const alreadyOwns = renderFamilyPlan(scenario, result, helpers);
  assert.doesNotMatch(alreadyOwns, /data-action="plan-month"/);
});

test('component breakdown shows rent, food, utilities and other costs without adding the common subtotal twice', () => {
  const {scenario, result} = fixture();
  result.months[0].currentAllocationApplied = true;
  for (const id of ids) Object.assign(result.months[0].people[id], {rent: 0, food: 0, utilities: 0, commonOther: 0});
  Object.assign(result.months[0].people.buyer1, {rent: 650, fixedPersonalDebt: 70});
  Object.assign(result.months[0].people.buyer2, {food: 200, utilities: 80, university: 350});
  Object.assign(result.months[0].people.mother, {food: 200, utilities: 80, commonOther: 90});
  const html = renderFamilyPlan(scenario, result, {...helpers, selectedMonth: '2026-12'});
  const rent = html.match(/<th scope="row">Alquiler actual<\/th>(.*?)<\/tr>/s)?.[1];
  const food = html.match(/<th scope="row">Comida<\/th>(.*?)<\/tr>/s)?.[1];
  const utilities = html.match(/<th scope="row">Suministros<\/th>(.*?)<\/tr>/s)?.[1];
  assert.equal(rent, '<td class="number">650.00 €</td><td class="number">0.00 €</td><td class="number">0.00 €</td><td class="number">0.00 €</td>');
  assert.equal(food, '<td class="number">0.00 €</td><td class="number">200.00 €</td><td class="number">200.00 €</td><td class="number">0.00 €</td>');
  assert.equal(utilities, '<td class="number">0.00 €</td><td class="number">80.00 €</td><td class="number">80.00 €</td><td class="number">0.00 €</td>');
  assert.match(html, /<th scope="row">Otros gastos comunes<\/th>/);
  assert.doesNotMatch(html, /<th scope="row">Gastos comunes asignados<\/th>/);
  const legacy = fixture();
  assert.match(renderFamilyPlan(legacy.scenario, legacy.result, helpers), /<th scope="row">Gastos comunes asignados<\/th>/);
});

test('unallocated current costs are already in the household and individual figures are clearly only upper bounds', () => {
  const {scenario, result} = fixture();
  result.months[0].hasUnassignedExpenses = true;
  result.months[0].household.unassignedExpenses = 90;
  const html = renderFamilyPlan(scenario, result, {...helpers, selectedMonth: '2026-12'});
  assert.match(html, /Faltan por asignar 90.00 € de otros gastos actuales/);
  assert.match(html, /El hogar ya los descuenta, pero las tarjetas individuales todavía no/);
  assert.equal((html.match(/GASTO CONOCIDO · FALTA REPARTIR OTROS/g) || []).length, 4);
  assert.equal((html.match(/MÁXIMO PROVISIONAL · FALTA REPARTIR GASTOS/g) || []).length, 0);
  assert.match(html, /<button type="button" class="card-link" data-action="plan-other-costs">Asignar otros gastos actuales<\/button>/);
  assert.match(html, /<select id="family-plan-other-costs"/);
  assert.match(html, /Incluido en gastos · sin pagador todavía/);
  assert.match(html, /90.00 € del hogar · falta elegir quién los paga/);
  assert.match(html, /En los meses con gastos sin asignar, las cifras personales todavía no incluyen esa parte/);
  assert.match(html, /Gastos sin asignar<\/small>/);
  const owning = renderFamilyPlan(scenario, result, {...helpers, selectedMonth: '2027-01'});
  assert.doesNotMatch(owning, /family-plan-unassigned/);
  assert.match(owning, /En los meses con gastos sin asignar, las cifras personales todavía no incluyen esa parte/);
  const remaining = renderFamilyPlan(scenario, result, {...helpers, tableMode: 'remaining'});
  assert.match(remaining, /En los meses con gastos sin asignar, las cifras personales son un máximo provisional/);
  const rentalRemaining = renderFamilyPlan(scenario, result, {...helpers, tableMode: 'remaining', selectedMonth: '2026-12'});
  assert.equal((rentalRemaining.match(/MÁXIMO PROVISIONAL · FALTA REPARTIR GASTOS/g) || []).length, 4);
  assert.equal((rentalRemaining.match(/GASTO CONOCIDO · FALTA REPARTIR OTROS/g) || []).length, 0);
});

test('new person and current allocation selectors escape names without exposing invalid mode values', () => {
  const {scenario, result} = fixture();
  result.persons[0].label = '<img src=x onerror=bad()>';
  result.plan.currentAllocation = {enabled: true, rentPayer: '<unsafe>', otherCostMode: '<bad>'};
  const html = renderFamilyPlan(scenario, result, helpers);
  assert.doesNotMatch(html, /<img|<unsafe>|<bad>/);
  assert.match(html, /&lt;img src=x onerror=bad\(\)&gt;/);
  assert.match(html, /value="unassigned" selected/);
  assert.match(html, /data-field="familyPlan.currentAllocation.rentPayer"><option value="buyer1" selected/);
});

function calendarRow(html, month) {
  const calendar = html.split('<table class="family-plan-monthly-table">')[1] || '';
  const marker = `data-action="toggle-plan-month" data-id="${month}"`;
  const start = calendar.indexOf(marker);
  return start < 0 ? '' : calendar.slice(start, calendar.indexOf('</tr>', start));
}

test('the calendar starts with expenses and the display selector switches to remaining money without financial fields', () => {
  const {scenario, result} = fixture();
  const expenses = renderFamilyPlan(scenario, result, helpers);
  assert.ok(expenses.includes('<option value="expenses" selected>Gastos · lo que paga cada uno</option>'));
  assert.ok(expenses.includes('<caption>Gasto a cargo de cada uno · 3 meses</caption>'));
  assert.ok(calendarRow(expenses, '2026-12').includes('<td class="number">450.00 €</td>'));
  assert.ok(!calendarRow(expenses, '2026-12').includes('1050.00 €'));
  assert.ok(expenses.includes('GASTO A SU CARGO'));
  assert.ok(!expenses.includes('data-field="familyPlan.tableMode"'));
  const remaining = renderFamilyPlan(scenario, result, {...helpers, tableMode: 'remaining'});
  assert.ok(remaining.includes('<option value="remaining" selected>Dinero que queda · margen para ahorrar</option>'));
  assert.ok(remaining.includes('<caption>Dinero que queda · 3 meses</caption>'));
  assert.ok(calendarRow(remaining, '2026-12').includes('<td class="number">1050.00 €</td>'));
  assert.ok(!calendarRow(remaining, '2026-12').includes('450.00 €'));
  assert.ok(calendarRow(remaining, '2027-01').includes('family-plan-negative">-200.00 €'));
  assert.ok(renderFamilyPlan(scenario, result, {...helpers, tableMode: '<invalid>'}).includes('<option value="expenses" selected>'));
});

test('mother expenses are her own salary cost after the children repayment, while her full payment remains visible', () => {
  const {scenario, result} = fixture();
  result.months[1].people.mother = person({income: 1300, common: 240, mortgage: 0, familyRepayment: 0, motherBankPayment: 300, internalReceived: 200, expenses: 540, remaining: 960});
  const html = renderFamilyPlan(scenario, result, {...helpers, expandedMonths: new Set(['2027-01'])});
  const row = calendarRow(html, '2027-01');
  assert.ok(row.includes('<td class="number">340.00 €</td>'));
  assert.ok(!row.includes('540.00 €'));
  assert.ok(!row.includes('960.00 €'));
  const card = html.match(/<article class="family-plan-person"><h3>mother<\/h3>(.*?)<\/article>/s)?.[1] || '';
  assert.ok(card.includes('GASTO A SU CARGO</span><strong class="family-plan-remainder">340.00 €'));
  assert.ok(card.includes('Pagos completos asignados</span><strong>540.00 €'));
  assert.ok(card.includes('Devolución recibida de los hijos</span><strong>+ 200.00 €'));
  assert.ok(card.includes('Dinero que queda</span><strong>960.00 €'));
  assert.ok(html.includes('Cuota de mamá al banco'));
  assert.ok(html.includes('Gasto a cargo de su nómina · pagos menos devoluciones'));
});

test('month disclosures render compact cost rows aligned with the main table without repeating its headers', () => {
  const {scenario, result} = fixture();
  result.months[0].people.buyer2.university = 315;
  result.months[2].people.buyer2.university = 0;
  for (const tableMode of ['expenses', 'remaining']) {
    const html = renderFamilyPlan(scenario, result, {...helpers, tableMode, selectedMonth: '2027-01', expandedMonths: new Set(['2026-12', '2027-07'])});
    assert.ok(calendarRow(html, '2026-12').includes('aria-expanded="true" aria-controls="family-plan-details-2026-12"'));
    assert.ok(calendarRow(html, '2027-01').includes('aria-expanded="false"'));
    assert.ok(html.includes('<tbody id="family-plan-details-2027-01" class="family-plan-month-detail" hidden></tbody>'));
    const december = html.split('<tbody id="family-plan-details-2026-12"')[1]?.split('</tbody>')[0] || '';
    assert.ok(december.includes('315.00 €'));
    assert.ok(december.includes('Ingresos ordinarios'));
    assert.ok(december.includes('Disponible para ahorrar'));
    assert.doesNotMatch(december, /<table|<caption|<thead|diciembre|Alquiler · antes|<th scope="col"/);
    const rows = [...december.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map(match => match[1]);
    assert.ok(rows.length > 3);
    for (const row of rows) {
      assert.match(row, /^<th scope="row" colspan="2">/);
      assert.equal((row.match(/<td class="number">/g) || []).length, 5, 'four people and household use the parent numeric columns');
    }
    const july = html.split('<tbody id="family-plan-details-2027-07"')[1]?.split('</tbody>')[0] || '';
    assert.ok(!july.includes('315.00 €'));
    assert.doesNotMatch(july, /<table|<caption|julio|Vivienda comprada/);
    const calendar = html.split('<table class="family-plan-monthly-table">')[1]?.split('</table>')[0] || '';
    assert.equal((calendar.match(/<col class=/g) || []).length, 7);
    assert.equal((calendar.match(/<th scope="col"/g) || []).length, 7, 'one shared header aligns every month and its costs');
  }
  const closed = renderFamilyPlan(scenario, result, helpers);
  assert.equal((closed.match(/class="family-plan-month-detail" hidden/g) || []).length, 3);
  assert.equal((closed.match(/class="family-plan-breakdown"/g) || []).length, 1, 'the separate household detail retains its full table');
  assert.doesNotMatch(closed, /family-plan-inline-cost/);
});

test('table-local expense and saving buttons mirror the selected presentation mode without financial fields', () => {
  const {scenario, result} = fixture();
  for (const tableMode of ['expenses', 'remaining']) {
    const html = renderFamilyPlan(scenario, result, {...helpers, tableMode});
    assert.match(html, /class="family-plan-view-switch" role="group" aria-label="Vista de la tabla"/);
    assert.ok(html.includes('data-action="plan-table-mode" data-id="expenses" aria-pressed="' + (tableMode === 'expenses') + '">Gastos</button>'));
    assert.ok(html.includes('data-action="plan-table-mode" data-id="remaining" aria-pressed="' + (tableMode === 'remaining') + '">Ahorro disponible</button>'));
    const buttons = html.match(/<div class="family-plan-view-switch".*?<\/div>/)?.[0] || '';
    assert.doesNotMatch(buttons, /data-field/);
  }
});

test('expense mode keeps unknown incoming repayments incomplete and labels a negative net cost as a credit', () => {
  const {scenario, result} = fixture();
  result.months[0].people.mother = person({expenses: 400, internalReceived: null, remaining: null});
  result.months[2].people.mother = person({expenses: 100, internalReceived: 150, remaining: 1550});
  const html = renderFamilyPlan(scenario, result, helpers);
  assert.ok(calendarRow(html, '2026-12').includes('<td class="number">Por completar</td>'));
  assert.ok(!calendarRow(html, '2026-12').includes('400.00 €'));
  assert.ok(calendarRow(html, '2027-07').includes('family-plan-credit">-50.00 €<small>Saldo a favor</small>'));
  const credit = renderFamilyPlan(scenario, result, {...helpers, selectedMonth: '2027-07'});
  assert.ok(credit.includes('SALDO A FAVOR · DEVOLUCIONES SUPERIORES A PAGOS'));
});

test('the monthly costs split personal commitments once and retain redistribution and one-time cash separately', () => {
  const {scenario, result} = fixture();
  const row = result.months[1];
  for (const id of ids) Object.assign(row.people[id], {rent:0,food:50,utilities:30,commonOther:20,common:100,fixedPersonalDebt:0,personalCommitmentDebt:0,personalExpense:0,transportExpense:0,personalCommitments:[],university:0,mortgage:0,familyRepayment:0,motherBankPayment:0,internalReceived:0,householdRedistribution:0,icfRepayment:0,extraordinaryIncome:0,debtSettlement:0,reservedExtraordinary:0,cashRemaining:1000});
  Object.assign(row.people.buyer1, {
    fixedPersonalDebt:145, personalCommitmentDebt:45, personalExpense:12, transportExpense:9,
    personalCommitments:[{id:'car',label:'Coche de prueba',kind:'debt',amount:45},{id:'fee',label:'Cuota personal de prueba',kind:'expense',amount:12}],
    householdRedistribution:30,expenses:296,income:1000,remaining:704,
    extraordinaryIncome:500,debtSettlement:150,reservedExtraordinary:25,cashRemaining:1029,
  });
  Object.assign(row.household,{extraordinaryIncome:500,debtSettlement:150,reservedExtraordinary:25,cashRemaining:4525});
  const html=renderFamilyPlan(scenario,result,{...helpers,expandedMonths:new Set(['2027-01'])});
  const detail=html.split('<tbody id="family-plan-details-2027-01"')[1]?.split('</tbody>')[0]||'';
  const cost=(label)=>detail.match(new RegExp('<th scope="row" colspan="2">'+label+'</th><td class="number">([^<]+)</td>'))?.[1];
  assert.equal(cost('Deuda personal base'),'100.00 €');
  assert.equal(cost('Coche de prueba'),'45.00 €');
  assert.equal(cost('Cuota personal de prueba'),'12.00 €');
  assert.equal(cost('Transporte personal'),'9.00 €');
  assert.equal(cost('Ajuste del reparto común'),'30.00 €');
  assert.equal(cost('Cobro extraordinario · solo este mes'),'500.00 €');
  assert.equal(cost('Cancelación de deudas · solo este mes'),'150.00 €');
  assert.equal(cost('Reserva fiscal del cobro'),'25.00 €');
  assert.equal(cost('Disponible para ahorrar'),'704.00 €');
  assert.equal(cost('Disponible con el cobro y la cancelación'),'1029.00 €');
  assert.doesNotMatch(detail,/145.00 €|Otros pagos personales/,'debt aggregate and expense aggregate are not counted again alongside their details');
  const ordinary=renderFamilyPlan(scenario,result,{...helpers,expandedMonths:new Set(['2026-12'])}).split('<tbody id="family-plan-details-2026-12"')[1]?.split('</tbody>')[0]||'';
  assert.doesNotMatch(ordinary,/Cobro extraordinario · solo este mes|Cancelación de deudas · solo este mes|Reserva fiscal del cobro/);
});

test('the current pool and future household contribution are editable without changing debt ownership', () => {
  const {scenario,result}=fixture();
  Object.assign(result.plan,{purchaseAllocation:'shared-household',transportOwner:'buyer1'});
  result.plan.currentAllocation={enabled:true,otherCostMode:'living-pool',includeUniversity:true,brotherLivingShare:.5};
  result.months[1].purchaseAllocationApplied=true;
  const html=renderFamilyPlan(scenario,result,{...helpers,selectedMonth:'2027-01'});
  assert.match(html,/data-field="familyPlan.currentAllocation.includeUniversity" checked/);
  assert.match(html,/value="living-pool" selected/);
  assert.match(html,/data-field="familyPlan.purchaseAllocation"/);
  assert.match(html,/value="shared-household" selected/);
  assert.match(html,/La titularidad y las obligaciones con el banco no cambian/);
  assert.match(html,/data-nullable="true" data-field="familyPlan.transportOwner"/);
  assert.match(html,/Las deudas, autónomos y transporte personal conservan su titular/);
  assert.doesNotMatch(html,/La universidad es gasto de tu hermano/);
  assert.match(html,/Mis pagos personales y la cancelación prevista/);
});

function supportedSisterFixture() {
  const data = fixture();
  data.result.plan.sisterSupport = {enabled: true, savingsAtPurchase: 90};
  const row = data.result.months[1];
  for (const id of ids) row.people[id] = person({
    income: 1000, common: 300, fixedPersonalDebt: 0, university: 0, mortgage: 0,
    familyRepayment: 0, motherBankPayment: 0, internalReceived: 0, icfRepayment: 0,
    familySupportPaid: 20, familySupportReceived: 0, savingsUsed: 0, savingsBalance: 0,
    expenses: 320, remaining: 680,
  });
  Object.assign(row.people.sister, {income: 500, common: 650, familySupportPaid: 0,
    familySupportReceived: 60, savingsUsed: 90, savingsBalance: 0, expenses: 650, remaining: 0});
  Object.assign(row.household, {income: 3500, expenses: 1550, remaining: 1950, familySupportTransfers: 60, savingsUsed: 90});
  row.sisterSupportApplied = true;
  return data;
}

test('sister deficit funding is editable and distinguishes available savings from purchase capital or future margins', () => {
  const {scenario, result} = supportedSisterFixture();
  const html = renderFamilyPlan(scenario, result, helpers);
  assert.match(html, /data-field="familyPlan.sisterSupport.enabled" checked/);
  assert.match(html, /data-field="familyPlan.sisterSupport.savingsAtPurchase" value="90"/);
  assert.match(html, /Disponibles al inicio del periodo de vivienda comprada mostrado/);
  assert.match(html, /Solo cubren sus déficits mensuales: no la entrada/);
  assert.match(html, /No se presupone que ahorre automáticamente/);
  assert.match(html, /La parte de tu hermana se cubre primero con sus ahorros y después entre vosotros tres/);
  assert.match(html, /Este mes utiliza 90.00 € de ahorros/);
  assert.match(html, /La ayuda es de 60.00 € en total/);
  assert.doesNotMatch(html, /no redistribuye ese importe automáticamente/);
  assert.doesNotMatch(html, /class="notice error family-plan-deficit"/);
  const renting = renderFamilyPlan(scenario, result, {...helpers, selectedMonth: '2026-12'});
  assert.doesNotMatch(renting, /class="notice family-plan-support"/);
  result.plan.sisterSupport.savingsAtPurchase = null;
  assert.match(renderFamilyPlan(scenario, result, helpers), /data-field="familyPlan.sisterSupport.savingsAtPurchase" value=""/);
});

test('salary cost deducts sister help and her savings while compact rows retain her full expenses and each funding source', () => {
  const {scenario, result} = supportedSisterFixture();
  const html = renderFamilyPlan(scenario, result, {...helpers, expandedMonths: new Set(['2027-01'])});
  const row = calendarRow(html, '2027-01');
  assert.equal((row.match(/<td class="number">320.00 €<\/td>/g) || []).length, 3);
  assert.ok(row.includes('<td class="number">500.00 €</td>'));
  assert.ok(!row.includes('650.00 €'));
  const detail = html.split('<tbody id="family-plan-details-2027-01"')[1]?.split('</tbody>')[0] || '';
  const cost = label => detail.match(new RegExp('<th scope="row" colspan="2">' + label + '</th>(.*?)</tr>'))?.[1];
  assert.equal(cost('Ayuda a tu hermana'), '<td class="number">20.00 €</td>'.repeat(3) + '<td class="number">—</td><td class="number">—</td>');
  assert.equal(cost('Ayuda familiar recibida'), '<td class="number">0.00 €</td>'.repeat(3) + '<td class="number">60.00 €</td><td class="number">—</td>');
  assert.equal(cost('Ahorros de tu hermana utilizados'), '<td class="number">0.00 €</td>'.repeat(3) + '<td class="number">90.00 €</td><td class="number">90.00 €</td>');
  assert.ok(cost('Pagos completos').includes('<td class="number">650.00 €</td>'));
  assert.ok(cost('Disponible para ahorrar').endsWith('<td class="number">1950.00 €</td>'));
  assert.ok(cost('Margen del hogar con ahorros utilizados').endsWith('<td class="number">2040.00 €</td>'));
  assert.ok(cost('Ahorros de tu hermana restantes'));
  assert.doesNotMatch(detail, /<caption|<thead|<table/);
  for (const match of detail.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)) {
    assert.match(match[1], /^<th scope="row" colspan="2">/);
    assert.equal((match[1].match(/<td class="number">/g) || []).length, 5);
  }
  assert.match(html, /Margen conjunto · ingresos ordinarios/);
  assert.match(html, /Margen incluyendo esos ahorros/);
  assert.match(html, /no un ingreso nuevo ni un gasto adicional/);
  const remaining = renderFamilyPlan(scenario, result, {...helpers, tableMode: 'remaining'});
  assert.equal((calendarRow(remaining, '2027-01').match(/680.00 €/g) || []).length, 3);
  assert.ok(calendarRow(remaining, '2027-01').includes('<td class="number">0.00 €</td>'));
});

test('unknown sister funding stays incomplete and donor deficits remain visible after the agreed help', () => {
  const {scenario, result} = supportedSisterFixture();
  result.months[1].people.sister.familySupportReceived = null;
  result.months[1].people.buyer2.remaining = -20;
  const html = renderFamilyPlan(scenario, result, {...helpers, expandedMonths: new Set(['2027-01'])});
  assert.ok(calendarRow(html, '2027-01').includes('<td class="number">Por completar</td>'));
  assert.match(html, /La ayuda a tu hermana ya está aplicada. Queda un déficit en otra persona/);
  assert.doesNotMatch(html, /no redistribuye ese importe automáticamente/);
  const detail = html.split('<tbody id="family-plan-details-2027-01"')[1]?.split('</tbody>')[0] || '';
  const received = detail.match(/Ayuda familiar recibida<\/th>(.*?)<\/tr>/)?.[1] || '';
  assert.ok(received.includes('Por completar'));
  assert.doesNotMatch(html, /\bNaN\b|\bundefined\b/);
});
