import {calculateScenario, normalizeScenario} from './finance.mjs?v=34';
import {calculateFamilyTimeline, normalizeFamilyPlan} from './family-plan.mjs?v=34';
import {calculatePersonalCommitments} from './personal-commitments.mjs?v=34';
import {calculatePurchaseCapacity} from './purchase-capacity.mjs?v=34';

const ROLES = ['buyer1', 'buyer2', 'mother', 'sister'];
const labels = ['Tú', 'Tu hermano', 'Tu madre', 'Tu hermana'];
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
const validMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900;
const monthIndex = value => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
const monthString = index => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
const unique = values => [...new Set(values.filter(Boolean))];
const tolerance = .005;
const madridMonth = () => {
  const parts = new Intl.DateTimeFormat('en', {timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit'}).formatToParts(new Date());
  return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}`;
};

function comparisonMonth(scenario, options) {
  const today = options.asOfMonth ?? madridMonth();
  if (!validMonth(today)) return null;
  return options.month ?? scenario.familyPlan?.purchaseMonth ?? monthString(monthIndex(today) + Number(scenario.cash.preClosingLoanPayments || 0));
}

// The comparison is an ordinary month, not a cash windfall. Keep the dated
// commitment cancellations already assumed by the user, but do not let a June
// extra salary, compensation receipt or savings withdrawal fund recurring bills.
function ordinaryScenario(input, month) {
  const scenario = normalizeScenario(input);
  const plan = normalizeFamilyPlan(scenario.familyPlan);
  const commitments = calculatePersonalCommitments(plan, {asOfMonth: month});
  plan.extraPayMonths = Object.fromEntries(ROLES.map(id => [id, []]));
  if (commitments.valid) {
    plan.personalCommitments = ROLES.flatMap(id => commitments.activeByOwner[id].map(item => ({...item, settleWithReceipt: false})));
    plan.extraordinaryReceipt.enabled = false;
  }
  // The sister's own savings can pay a bill, but cannot reduce its ordinary cost.
  plan.sisterSupport.savingsAtPurchase = 0;
  plan.purchaseMonth = month;
  scenario.familyPlan = plan;
  return scenario;
}

function ownedRow(scenario, month, calculated) {
  return calculateFamilyTimeline(ordinaryScenario(scenario, month), {
    startMonth: month, months: 1, calculateScenario: () => calculated,
  });
}

function rentalRow(scenario, month) {
  const baseline = ordinaryScenario(scenario, month);
  // This counterfactual keeps the same month's living costs, debts and incomes,
  // while continuing to rent. The new acquisition loan does not exist in it.
  baseline.familyLoan.enabled = false;
  baseline.familyLoan.amount = null;
  baseline.familyPlan.purchaseMonth = monthString(monthIndex(month) + 1);
  baseline.familyPlan.motherLoanStartMonth = baseline.familyPlan.purchaseMonth;
  baseline.cash.preClosingLoanPayments = 0;
  const calculated = calculateScenario(baseline, {asOfMonth: month});
  return calculateFamilyTimeline(baseline, {startMonth: month, months: 1, calculateScenario: () => calculated});
}

function netCost(person) {
  const amounts = [person.expenses, person.internalReceived, person.livingContributionReceived, person.familySupportReceived];
  return amounts.some(value => value === null || !Number.isFinite(value)) ? null
    : money(person.expenses - person.internalReceived - person.livingContributionReceived - person.familySupportReceived);
}

function fromRows(scenario, month, calculated, rental, owned) {
  const errors = unique([...(rental.validation?.errors || []), ...(owned.validation?.errors || [])]);
  if (!rental.valid || !owned.valid) return {valid: false, month, purchaseMonth: month, referenceMonth: month, people: [], currentTotal: null, purchaseTotal: null, difference: null, incomplete: true, missingQuotes: [], pendingAssumptions: [], errors};
  const before = rental.months[0], after = owned.months[0];
  const people = ROLES.map((id, index) => {
    const currentCost = netCost(before.people[id]), purchaseCost = netCost(after.people[id]);
    const income = after.people[id].income;
    return {id, label: owned.persons.find(person => person.id === id)?.label || labels[index], income,
      currentIncome: before.people[id].income, purchaseIncome: income, currentCost, purchaseCost,
      difference: currentCost === null || purchaseCost === null ? null : money(purchaseCost - currentCost),
      currentRemaining: currentCost === null ? null : money(before.people[id].income - currentCost),
      purchaseRemaining: purchaseCost === null ? null : money(income - purchaseCost)};
  });
  const currentTotal = before.household.expenses, purchaseTotal = after.household.expenses;
  const missingQuotes = unique(calculated.budget.missingQuotes || []);
  const pendingAssumptions = unique([
    'Se compara continuar de alquiler y comprar en el mismo mes; se conserva el calendario de ingresos, deudas y gastos indicado.',
    'Las pagas extra, los cobros extraordinarios y los ahorros no aumentan el presupuesto mensual ordinario.',
    ...(calculated.budget.personalDebtCancellationAssumed ? ['La cancelación de deudas prevista sigue condicionada al cobro y a sus importes reales.'] : []),
    ...(scenario.familyPlan?.sisterJob?.enabled ? ['Se mantiene la hipótesis de trabajo de la hermana desde el mes indicado.'] : []),
    ...(after.hasUnassignedExpenses || before.hasUnassignedExpenses ? ['Hay gastos sin pagador asignado; el total familiar los incluye, pero el reparto individual no está completo.'] : []),
    ...missingQuotes.map(quote => `Falta importe confirmado: ${quote}.`),
    ...(calculated.budget.missingEstimates || []),
  ]);
  const incomplete = Boolean(calculated.budget.incomplete || before.hasUnassignedExpenses || after.hasUnassignedExpenses
    || people.some(person => person.currentCost === null || person.purchaseCost === null));
  return {valid: true, month, purchaseMonth: month, referenceMonth: month, people, currentTotal, purchaseTotal,
    difference: currentTotal === null || purchaseTotal === null ? null : money(purchaseTotal - currentTotal),
    anyNegativeRemaining: people.some(person => person.purchaseRemaining !== null && person.purchaseRemaining < -.005),
    deficitPersons: people.filter(person => person.purchaseRemaining !== null && person.purchaseRemaining < -.005).map(person => person.id),
    individualAllocationComplete: !before.hasUnassignedExpenses && !after.hasUnassignedExpenses
      && people.every(person => person.currentCost !== null && person.purchaseCost !== null),
    ordinaryMonth: true, noExtraIncome: true, incomplete, provisional: true, missingQuotes, pendingAssumptions, errors};
}

/** Recurring monthly burden per person, with internal transfers counted once. */
export function calculateMonthlyCostComparison(input = {}, options = {}) {
  const scenario = normalizeScenario(input), month = comparisonMonth(scenario, options);
  if (!validMonth(month)) return {valid: false, month: null, purchaseMonth: null, referenceMonth: null, people: [], currentTotal: null, purchaseTotal: null, difference: null, incomplete: true, missingQuotes: [], pendingAssumptions: [], errors: ['La comparación necesita un mes válido con formato AAAA-MM.']};
  const calculated = calculateScenario(scenario, {asOfMonth: month});
  if (!calculated.valid) return {valid: false, month, purchaseMonth: month, referenceMonth: month, people: [], currentTotal: null, purchaseTotal: null, difference: null, incomplete: true, missingQuotes: [], pendingAssumptions: [], errors: calculated.validation.errors};
  return fromRows(scenario, month, calculated, rentalRow(scenario, month), ownedRow(scenario, month, calculated));
}

/**
 * Generic-price ceiling preserving the ordinary rental household budget, as
 * well as the existing cash and borrower debt constraints. A second ceiling
 * requires every person's own burden to stay at or below their rental burden;
 * sharing differently can make that impossible even when the family saves.
 */
export function calculateBudgetNeutralCapacity(input = {}, options = {}) {
  const scenario = normalizeScenario(input), month = comparisonMonth(scenario, options);
  const step = options.step ?? 500, searchCeiling = options.searchCeiling ?? 1000000;
  const empty = {valid: false, month, referenceMonth: month, purchaseMonth: month, maxPrice: null, maxIndividualPrice: null,
    summary: null, individualSummary: null, comparison: null, bankCapacity: null, priceStep: step, searchCeiling,
    limitedBySearchCeiling: false, individualLimitedBySearchCeiling: false, bindingConstraint: 'unknown', reason: '',
    missingQuotes: [], pendingAssumptions: [], errors: [], provisional: true, noApproval: true, householdBudgetChecked: true};
  if (!validMonth(month)) return {...empty, errors: ['La comparación necesita un mes válido con formato AAAA-MM.']};
  const bankCapacity = calculatePurchaseCapacity(scenario, {...options, asOfMonth: month});
  const comparison = calculateMonthlyCostComparison(scenario, {...options, month});
  if (!bankCapacity.valid || !comparison.valid) return {...empty, bankCapacity, comparison, errors: unique([...bankCapacity.errors, ...comparison.errors])};
  if (comparison.currentTotal === null) return {...empty, bankCapacity, comparison, errors: ['Faltan importes del gasto mensual actual para calcular el límite sin aumentar gastos.']};
  if (bankCapacity.maxPrice === null) return {...empty, bankCapacity, comparison, errors: ['Completa los ingresos y las condiciones de deuda de los titulares para comprobar también el límite bancario.']};

  const template = normalizeScenario(scenario);
  template.appraisalValue = null; template.referenceValue = null; template.declaredValue = null;
  template.mortgage.amount = null; template.familyLoan.amount = null; template.cash.depositAmount = null;
  template.familyPlan = {...template.familyPlan, purchaseMonth: month};
  const rental = rentalRow(template, month), cache = new Map();
  const debtFits = result => result.valid && !result.budget.borrowerDebtRatioIncomplete && result.budget.regularIncome > 0
    && result.budget.borrowerDebtMonthly <= result.budget.regularIncome * result.budget.debtRatioLimit + 1e-8;
  const evaluate = index => {
    if (!cache.has(index)) {
      const candidate = {...template, purchasePrice: index * step};
      const result = calculateScenario(candidate, {asOfMonth: month});
      const fitsBank = result.valid && debtFits(result) && result.cash.fundingGap <= tolerance && result.cash.beforeMortgageGap <= tolerance;
      const monthly = fitsBank ? fromRows(candidate, month, result, rental, ownedRow(candidate, month, result)) : null;
      cache.set(index, {candidate, result, comparison: monthly, fitsBank,
        householdFits: Boolean(monthly?.valid && monthly.purchaseTotal !== null && monthly.purchaseTotal <= monthly.currentTotal + tolerance),
        individualFits: Boolean(monthly?.valid && monthly.individualAllocationComplete && monthly.people.every(person => person.difference <= tolerance))});
    }
    return cache.get(index);
  };
  // The price grid is exhaustively checked rather than assuming each person's
  // net burden is monotonic: a custom intrafamily repayment schedule can change
  // the mother's net burden in the opposite direction to another person's.
  let maxIndex = 0, individualIndex = comparison.individualAllocationComplete ? 0 : null;
  const maxBankIndex = Math.floor(bankCapacity.maxPrice / step);
  for (let index = 1; index <= maxBankIndex; index++) {
    const candidate = evaluate(index);
    if (candidate.householdFits) maxIndex = index;
    if (individualIndex !== null && candidate.individualFits) individualIndex = index;
  }
  const summarize = index => {
    if (!(index > 0)) return null;
    const at = evaluate(index), result = at.result;
    return {purchasePrice: index * step, mortgagePrincipal: result.mortgage.principal, mortgageMonthly: result.mortgage.monthlyPayment,
      icfPrincipal: result.icf.principal, motherLoanRequired: result.familyLoan.principal, loanRequired: result.familyLoan.principal,
      motherBankMonthly: result.familyLoan.monthlyPayment, loanYears: template.familyLoan.years, loanRate: template.familyLoan.rate,
      familyRepaymentMonthly: result.budget.borrowerFamilyRepaymentMonthly, borrowerDebtMonthly: result.budget.borrowerDebtMonthly,
      borrowerDebtRatio: result.budget.debtRatio, tax: result.tax.total, fees: result.cash.purchaseFees, buffer: result.cash.totalReserve,
      currentTotal: at.comparison.currentTotal, purchaseTotal: at.comparison.purchaseTotal, householdMonthly: at.comparison.purchaseTotal,
      difference: at.comparison.difference, comparison: at.comparison, depositReleasePending: result.cash.depositReleasePending,
      fundingGap: result.cash.fundingGap, earlyCashGap: result.cash.beforeMortgageGap};
  };
  const maxPrice = maxIndex * step, maxIndividualPrice = individualIndex === null ? null : individualIndex * step;
  const summary = summarize(maxIndex), individualSummary = summarize(individualIndex);
  const bindingConstraint = maxPrice < bankCapacity.maxPrice ? 'household-budget' : bankCapacity.bindingConstraint;
  const reason = maxPrice === 0 ? 'Ningún precio positivo del intervalo permite conservar el gasto familiar y cumplir el efectivo inicial y la deuda configurados.'
    : bindingConstraint === 'household-budget' ? 'Limita el gasto mensual familiar: un precio superior aumentaría el presupuesto frente a seguir de alquiler.'
      : bankCapacity.reason;
  return {...empty, valid: true, maxPrice, maxIndividualPrice, summary, individualSummary, comparison, bankCapacity,
    limitedBySearchCeiling: maxPrice > 0 && maxPrice === bankCapacity.searchMaximumPrice && bankCapacity.limitedBySearchCeiling,
    individualLimitedBySearchCeiling: maxIndividualPrice > 0 && maxIndividualPrice === bankCapacity.searchMaximumPrice && bankCapacity.limitedBySearchCeiling,
    bindingConstraint, reason, individualReason: maxIndividualPrice === null ? 'Faltan asignaciones de gastos para comprobar el límite de cada persona.'
      : maxIndividualPrice === 0 ? 'Con el reparto elegido, ninguna vivienda del intervalo evita que alguna persona pague más que continuando de alquiler.'
        : 'Este límite conserva el gasto de cada persona, además del total familiar y los límites de financiación.',
    incomplete: comparison.incomplete, missingQuotes: unique([...bankCapacity.missingQuotes, ...comparison.missingQuotes]),
    pendingAssumptions: unique([...bankCapacity.pendingAssumptions.filter(text => !text.includes('el reparto familiar, el gasto de vida')),
      ...comparison.pendingAssumptions,
      'Se mantienen los gastos de la vivienda de referencia; IBI, comunidad, seguros y suministros cambian entre viviendas y deben comprobarse.',
      'El límite compara un mes ordinario de compra; no garantiza que los gastos se mantengan iguales durante toda la hipoteca.']), errors: []};
}
