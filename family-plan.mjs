import {calculateScenario as calculateDefaultScenario, normalizeScenario} from './finance.mjs?v=22';

// This plan allocates cash between residents. It never changes the bank's
// definition of debt or silently makes one resident cover another's deficit.
export const DEFAULT_FAMILY_PLAN = Object.freeze({
  sharedCostMode: 'equal', personalDebtOwner: 'buyer1', personalDebtEndMonth: null,
  university: {amount: 0, startMonth: null, endMonth: null},
  sisterJob: {enabled: false, amount: 0, startMonth: null},
  currentAllocation: {enabled: false, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'unassigned'},
  purchaseMonth: null, motherLoanStartMonth: null,
});

const ROLES = ['buyer1', 'buyer2', 'mother', 'sister'];
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
const monthValid = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900;
const monthIndex = value => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
const monthString = index => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const total = values => values.some(value => value === null) ? null : money(values.reduce((sum, value) => sum + value, 0));

/** Shape normalization retains invalid-input errors across repeated calls. */
export function normalizeFamilyPlan(raw = {}) {
  const errors = [];
  if (!isRecord(raw)) { errors.push('El reparto familiar debe ser un objeto válido.'); raw = {}; }
  if (Array.isArray(raw._errors)) errors.push(...raw._errors.filter(value => typeof value === 'string'));
  const plan = {...structuredClone(DEFAULT_FAMILY_PLAN), ...structuredClone(raw)};
  for (const key of ['university', 'sisterJob', 'currentAllocation']) {
    if (Object.hasOwn(raw, key) && !isRecord(raw[key])) errors.push(`El apartado ${key} debe ser un objeto válido.`);
    plan[key] = {...DEFAULT_FAMILY_PLAN[key], ...(isRecord(raw[key]) ? raw[key] : {})};
  }
  if (!['income', 'equal', 'borrowers', 'workers'].includes(plan.sharedCostMode)) errors.push('Elige un reparto común entre cuatro, entre quienes tienen ingresos, según ingresos o entre titulares.');
  if (typeof plan.currentAllocation.enabled !== 'boolean') errors.push('Indica si se utiliza el reparto actual de alquiler, comida y suministros.');
  if (!ROLES.includes(plan.currentAllocation.rentPayer)) errors.push('El alquiler actual debe asignarse a una de las cuatro personas.');
  if (!finite(plan.currentAllocation.brotherLivingShare) || Number(plan.currentAllocation.brotherLivingShare) < 0 || Number(plan.currentAllocation.brotherLivingShare) > 1) errors.push('El porcentaje de comida y suministros del hermano debe estar entre el 0 % y el 100 %.');
  if (finite(plan.currentAllocation.brotherLivingShare)) plan.currentAllocation.brotherLivingShare = Number(plan.currentAllocation.brotherLivingShare);
  if (!['unassigned', 'income', 'equal', 'borrowers', 'workers', ...ROLES].includes(plan.currentAllocation.otherCostMode)) errors.push('Elige cómo repartir los demás gastos actuales.');
  if (!['buyer1','buyer2'].includes(plan.personalDebtOwner)) errors.push('La deuda personal de los titulares debe pertenecer a uno de los dos compradores.');
  for (const [value, label] of [[plan.university.amount, 'La cuota universitaria'], [plan.sisterJob.amount, 'El ingreso futuro de la hermana']]) {
    if (!finite(value) || Number(value) < 0) errors.push(`${label} debe ser un importe no negativo.`);
  }
  if (finite(plan.university.amount)) plan.university.amount = Number(plan.university.amount);
  if (finite(plan.sisterJob.amount)) plan.sisterJob.amount = Number(plan.sisterJob.amount);
  for (const [value, label] of [
    [plan.purchaseMonth, 'La compra'], [plan.motherLoanStartMonth, 'El préstamo de mamá'],
    [plan.personalDebtEndMonth, 'El final de la deuda personal'],
    [plan.university.startMonth, 'El inicio de la universidad'], [plan.university.endMonth, 'El final de la universidad'],
    [plan.sisterJob.startMonth, 'El inicio del trabajo de la hermana'],
  ]) if (value !== null && !monthValid(value)) errors.push(`${label} necesita un mes válido con formato AAAA-MM.`);
  if (typeof plan.sisterJob.enabled !== 'boolean') errors.push('Indica si se simula el futuro trabajo de la hermana.');
  if (finite(plan.university.amount) && Number(plan.university.amount) > 0 && plan.university.endMonth === null) errors.push('Indica el último mes de pago de la universidad.');
  if (plan.sisterJob.enabled === true && (plan.sisterJob.startMonth === null || !finite(plan.sisterJob.amount) || Number(plan.sisterJob.amount) <= 0)) errors.push('El trabajo futuro necesita un mes de inicio y un ingreso mayor que cero.');
  if (monthValid(plan.university.startMonth) && monthValid(plan.university.endMonth) && monthIndex(plan.university.startMonth) > monthIndex(plan.university.endMonth)) errors.push('El inicio de la universidad debe ser anterior o igual a su último mes de pago.');
  if (errors.length) plan._errors = [...new Set(errors)]; else delete plan._errors;
  return plan;
}

export function validateFamilyPlan(raw = {}) {
  const plan = normalizeFamilyPlan(raw), errors = plan._errors || [];
  return {valid: errors.length === 0, errors, warnings: []};
}

// Allocate integer cents so the four allocations always add up to the bill.
function allocate(amount, shares) {
  if (amount === null) return shares.map(share => share > 0 ? null : 0);
  const cents = Math.round(amount * 100), sum = shares.reduce((a, b) => a + b, 0);
  if (cents === 0) return shares.map(() => 0);
  if (sum <= 0) return shares.map(() => null);
  const exact = shares.map(share => cents * share / sum), allocated = exact.map(Math.floor);
  const order = exact.map((value, index) => ({index, fraction: value - allocated[index]})).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let remaining = cents - allocated.reduce((a, b) => a + b, 0), i = 0; remaining > 0; remaining--, i++) allocated[order[i % order.length].index]++;
  return allocated.map(value => value / 100);
}

const costShares = (mode, incomes) => ROLES.includes(mode) ? ROLES.map(role => role === mode ? 1 : 0) : mode === 'equal' ? [1, 1, 1, 1]
  : mode === 'borrowers' ? [1, 1, 0, 0]
  : mode === 'workers' ? incomes.map(income => income > 0 ? 1 : 0) : incomes;

// A planning schedule in cents: the final installment clears the remaining
// principal instead of adding repeated rounding differences to a 0% contract.
function paymentSchedule(loan) {
  if (!loan || Number(loan.principal) === 0) return [];
  if (loan.monthlyPayment == null || !finite(loan.rate) || !Number.isInteger(Number(loan.months)) || Number(loan.months) <= 0) return null;
  const payments = [], installment = money(loan.monthlyPayment), rate = Number(loan.rate) / 1200;
  let balance = money(loan.principal);
  for (let month = 0; month < Number(loan.months); month++) {
    const interest = money(balance * rate), due = money(balance + interest);
    const payment = month === Number(loan.months) - 1 ? due : Math.min(installment, due);
    payments.push(payment); balance = money(due - payment);
  }
  return payments;
}
const installmentAt = (schedule, offset, hasPrincipal) => offset < 0 || !hasPrincipal ? 0 : schedule === null ? null : schedule[offset] ?? 0;

/**
 * Monthly ordinary cash, plus monthly reserves for annual ownership bills.
 * Annual extra salary payments are disclosed separately, never invented in a
 * particular month. Internal repayments cancel in the household total.
 */
export function calculateFamilyTimeline(input, {startMonth = '2026-10', months = 24, calculateScenario = calculateDefaultScenario} = {}) {
  const scenario = normalizeScenario(input), plan = normalizeFamilyPlan(scenario.familyPlan);
  const errors = [...(plan._errors || [])];
  if (!monthValid(startMonth)) errors.push('El calendario necesita un mes inicial válido con formato AAAA-MM.');
  if (!Number.isInteger(months) || months < 1 || months > 1200) errors.push('El horizonte debe ser un número entero de uno a 1.200 meses.');
  if (scenario.budget.incomes.length > 2) errors.push('El reparto de cuatro personas admite dos titulares; revisa los ingresos adicionales.');
  if (scenario.tax.buyers.length !== 2 || scenario.motherTransfer.allocations.length !== 2) errors.push('El calendario familiar necesita el reparto de los dos titulares.');
  const calculated = calculateScenario(scenario, {asOfMonth: startMonth});
  if (!calculated?.valid) errors.push(...(calculated?.validation?.errors || ['Revisa los datos de la vivienda.']));
  if (errors.length) return {valid: false, validation: {valid: false, errors: [...new Set(errors)]}, warnings: [], plan, persons: [], months: []};

  const start = monthIndex(startMonth), wait = Number(scenario.cash.preClosingLoanPayments);
  const purchase = plan.purchaseMonth === null ? start + wait : monthIndex(plan.purchaseMonth);
  const loanStart = plan.motherLoanStartMonth === null ? purchase - wait : monthIndex(plan.motherLoanStartMonth);
  if (loanStart > purchase && calculated.familyLoan.principal > 0) return {valid: false, validation: {valid: false, errors: ['El préstamo de mamá necesario para comprar no puede empezar después de la compra.']}, warnings: [], plan, persons: [], months: []};
  const warnings = [];
  const purchaseFundingGap=Math.max(calculated.cash.fundingGap,calculated.cash.beforeMortgageGap);
  if(purchaseFundingGap>.01)warnings.push('Falta efectivo para la compra o para anticipar sus pagos. El reparto mensual no resuelve ese déficit inicial.');
  if (plan.purchaseMonth === null) warnings.push('La fecha de compra es una hipótesis: inicio del calendario más los meses de espera indicados.');
  if (plan.sisterJob.enabled) warnings.push('El trabajo futuro de la hermana es una hipótesis; sustituye su ingreso actual desde el mes indicado.');
  if (Number(scenario.budget.existingDebtMonthly) > 0 && plan.personalDebtEndMonth === null) warnings.push('La deuda personal se mantiene porque todavía no se ha indicado su último mes de pago.');
  if (Number(scenario.budget.familyExistingDebtMonthly) > 0) warnings.push('Las otras deudas de convivientes se atribuyen provisionalmente a mamá; confirma su titular.');
  if (Number(scenario.budget.familyIncomeMonthly) > 0) warnings.push('La aportación familiar adicional anterior se atribuye a mamá una sola vez; revisa su origen.');
  if (plan.sharedCostMode === 'equal') warnings.push('Los gastos comunes se dividen entre cuatro incluso si alguien no tiene ingresos. Un saldo negativo necesita una aportación familiar acordada; no se redistribuye automáticamente.');
  if (plan.sharedCostMode === 'workers') warnings.push('En el reparto general, los gastos comunes se dividen por igual entre quienes tengan ingresos ese mes; una persona sin ingresos no recibe una parte.');
  if (plan.currentAllocation.enabled) warnings.push('Antes de comprar se aplica vuestro reparto actual: alquiler a su pagador, y comida y suministros entre mamá y el hermano. El reparto de los demás gastos actuales es una hipótesis editable.');
  warnings.push('IBI, residuos, seguros y mantenimiento anuales son provisiones mensuales; las fechas de cobro reales pueden ser distintas.');
  if (calculated.budget.incomplete) warnings.push('El presupuesto conserva importes pendientes de comprobar o cotizar; los saldos no son una aprobación bancaria.');

  const incomeRows = [scenario.budget.incomes[0], scenario.budget.incomes[1], ...['mother', 'sister'].map(id => scenario.budget.householdIncomes.find(row => row.id === id))];
  const persons = ROLES.map((id, index) => ({
    id, label: incomeRows[index]?.label || ['Tú', 'Tu hermano', 'Tu madre', 'Tu hermana'][index],
    annualExtraIncome: money(Number(incomeRows[index]?.monthly || 0) * Math.max(0, Number(incomeRows[index]?.payments || 12) - 12)),
  }));
  const annualExtras = {people: Object.fromEntries(persons.map(person => [person.id, person.annualExtraIncome])), total: total(persons.map(person => person.annualExtraIncome))};
  const mortgageSchedule = paymentSchedule(calculated.mortgage), motherSchedule = paymentSchedule(calculated.familyLoan);
  const transferSchedule = calculated.motherTransfer.mode === 'family-loan' ? paymentSchedule(calculated.motherTransfer.repayment || {principal: calculated.motherTransfer.amount, monthlyPayment: null}) : [];
  const mortgageShares = scenario.tax.buyers.map(buyer => Number(buyer.share));
  const transferShares = scenario.motherTransfer.allocations.map(allocation => Number(allocation.share));
  const icfStart = purchase + calculated.mortgage.months, icfMonths = calculated.icf.repaymentYears * 12;
  const icfSchedule = paymentSchedule({principal: calculated.icf.principal, months: icfMonths, monthlyPayment: calculated.icf.deferredMonthlyPayment, rate: 0});
  // The core budget may already include today's university payment. Remove
  // that aggregate before assigning this calendar's payment to its real payer.
  const sharedLife = money(calculated.budget.householdMonthly - Number(calculated.budget.universityMonthly || 0));
  const foodMonthly = money(scenario.budget.foodMonthly), otherLife = money(sharedLife - foodMonthly);
  const currentCosts = {rent: calculated.budget.currentRent, food: foodMonthly, utilities: calculated.budget.currentUtilitiesMonthly,
    commonOther: total([otherLife, Number(scenario.budget.currentOtherMonthly)])};
  const ownedCosts = {rent: 0, food: foodMonthly, utilities: calculated.budget.utilitiesMonthly,
    commonOther: total([calculated.budget.propertyOverheadMonthly, otherLife])};
  const missingPayments = motherSchedule === null || calculated.motherTransfer.mode === 'family-loan' && calculated.motherTransfer.amount > 0 && transferSchedule === null;
  const rows = Array.from({length: months}, (_, offset) => {
    const month = start + offset, owning = month >= purchase;
    const phase = !owning ? 'renting' : calculated.icf.principal > 0 && month >= icfStart && month < icfStart + icfMonths ? 'icf' : 'owning';
    const incomes = incomeRows.map(row => money(Number(row?.monthly || 0)));
    incomes[2] = money(incomes[2] + Number(scenario.budget.familyIncomeMonthly));
    if (plan.sisterJob.enabled && month >= monthIndex(plan.sisterJob.startMonth)) incomes[3] = money(plan.sisterJob.amount);
    const shares = costShares(plan.sharedCostMode, incomes), costs = owning ? ownedCosts : currentCosts;
    const currentAllocationApplied = !owning && plan.currentAllocation.enabled;
    const livingShares = [0, plan.currentAllocation.brotherLivingShare, 1 - plan.currentAllocation.brotherLivingShare, 0];
    const rentShares = ROLES.map(role => role === plan.currentAllocation.rentPayer ? 1 : 0);
    const hasUnassignedMode = currentAllocationApplied && plan.currentAllocation.otherCostMode === 'unassigned';
    const componentParts = Object.fromEntries(Object.entries(costs).map(([key, amount]) => [key,
      hasUnassignedMode && key === 'commonOther' ? ROLES.map(() => 0) : allocate(amount,
        !currentAllocationApplied ? shares : key === 'rent' ? rentShares : key === 'food' || key === 'utilities' ? livingShares : costShares(plan.currentAllocation.otherCostMode, incomes))]));
    const unassignedExpenses = hasUnassignedMode ? costs.commonOther : 0;
    const hasUnassignedExpenses = unassignedExpenses === null || unassignedExpenses > 0;
    const common = total(Object.values(costs)), commonParts = ROLES.map((role, index) => total(Object.values(componentParts).map(parts => parts[index])));
    const mortgage = installmentAt(mortgageSchedule, month - purchase, calculated.mortgage.principal > 0), mortgageParts = allocate(mortgage, [...mortgageShares, 0, 0]);
    const familyRepayment = installmentAt(transferSchedule, month - loanStart, calculated.motherTransfer.mode === 'family-loan' && calculated.motherTransfer.amount > 0);
    const familyParts = allocate(familyRepayment, [...transferShares, 0, 0]);
    const motherBankPayment = installmentAt(motherSchedule, month - loanStart, calculated.familyLoan.principal > 0);
    const icf = installmentAt(icfSchedule, month - icfStart, calculated.icf.principal > 0), icfParts = allocate(icf, [...mortgageShares, 0, 0]);
    const university = month <= (plan.university.endMonth === null ? -Infinity : monthIndex(plan.university.endMonth)) && (plan.university.startMonth === null || month >= monthIndex(plan.university.startMonth)) ? money(plan.university.amount) : 0;
    const personal = plan.personalDebtEndMonth === null || month <= monthIndex(plan.personalDebtEndMonth) ? money(scenario.budget.existingDebtMonthly) : 0;
    const people = Object.fromEntries(persons.map((person, index) => {
      const fixedPersonalDebt = total([person.id === plan.personalDebtOwner ? personal : 0, person.id === 'mother' ? money(scenario.budget.familyExistingDebtMonthly) : 0]);
      const entry = {income: incomes[index], common: commonParts[index], rent: componentParts.rent[index], food: componentParts.food[index],
        utilities: componentParts.utilities[index], commonOther: componentParts.commonOther[index], fixedPersonalDebt, university: person.id === 'buyer2' ? university : 0,
        mortgage: mortgageParts[index], familyRepayment: familyParts[index], motherBankPayment: person.id === 'mother' ? motherBankPayment : 0,
        internalReceived: person.id === 'mother' ? familyRepayment : 0, icfRepayment: icfParts[index]};
      entry.expenses = total([entry.common, entry.fixedPersonalDebt, entry.university, entry.mortgage, entry.familyRepayment, entry.motherBankPayment, entry.icfRepayment]);
      entry.remaining = entry.expenses === null || entry.internalReceived === null ? null : money(entry.income + entry.internalReceived - entry.expenses);
      return [person.id, entry];
    }));
    const householdExpenses = total([common, personal, money(scenario.budget.familyExistingDebtMonthly), university, mortgage, motherBankPayment, icf]);
    const householdIncome = total(incomes), borrowerIncome = money(incomes[0] + incomes[1]);
    const borrowerDebt = total([mortgage, ['buyer1', 'buyer2'].includes(plan.personalDebtOwner) ? personal : 0, familyRepayment, icf]);
    const household = {income: householdIncome, expenses: householdExpenses, remaining: householdExpenses === null ? null : money(householdIncome - householdExpenses),
      internalTransfers: familyRepayment, common, ...costs, unassignedExpenses, mortgage, motherBankPayment, fixedPersonalDebt: money(personal + Number(scenario.budget.familyExistingDebtMonthly)), university, icfRepayment: icf};
    const motherNetBankCost = motherBankPayment === null || familyRepayment === null ? null : money(motherBankPayment - familyRepayment);
    return {month: monthString(month), phase, currentAllocationApplied, hasUnassignedExpenses, people, household, motherNetBankCost, bankDebtMonthly: borrowerDebt,
      bankDebtRatio: borrowerDebt === null || borrowerIncome <= 0 ? null : borrowerDebt / borrowerIncome,
      needsFamilyTopUp: persons.some(person => people[person.id].remaining !== null && people[person.id].remaining < 0)};
  });
  if (plan.sharedCostMode === 'income' && rows.some(row => row.household.income <= 0)) warnings.push('Sin ingresos no puede calcularse el reparto proporcional; los saldos personales quedan pendientes.');
  if (rows.some(row => row.household.income <= 0 && row.household.common > 0 && (plan.sharedCostMode === 'workers' || row.currentAllocationApplied && plan.currentAllocation.otherCostMode === 'workers'))) warnings.push('Sin ninguna persona con ingresos no puede repartirse el gasto entre quienes cobran; los saldos correspondientes quedan pendientes.');
  if (rows.some(row => row.hasUnassignedExpenses)) warnings.push('Hay otros gastos actuales sin pagador asignado. Se cuentan en el total familiar, pero los saldos individuales todavía no descuentan esa parte: no todo ese saldo está disponible para ahorrar.');
  return {valid: true, validation: {valid: true, errors: []}, warnings, plan, persons, months: rows, annualExtras,
    purchaseMonth: monthString(purchase), motherLoanStartMonth: monthString(loanStart), purchaseMonthAssumed: plan.purchaseMonth === null,
    purchaseFundingGap,
    incomplete: Boolean(calculated.budget.incomplete || missingPayments || plan.sisterJob.enabled || plan.purchaseMonth === null || purchaseFundingGap>.01 || rows.some(row => row.hasUnassignedExpenses)),
    bankDebtRatio: calculated.budget.debtRatio, bankDebtRatioLimit: calculated.budget.debtRatioLimit};
}
