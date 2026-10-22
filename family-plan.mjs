import {calculateScenario as calculateDefaultScenario, normalizeScenario} from './finance.mjs?v=38';
import {normalizePersonalCommitments, calculatePersonalCommitments, calculatePublicTransport} from './personal-commitments.mjs?v=38';
import {DEFAULT_RENT_CHANGE, normalizeRentChange, currentRentForMonth} from './rent-schedule.mjs?v=38';

// This plan allocates cash between residents. It never changes the bank's
// definition of debt. Covering a resident's deficit requires an explicit plan.
export const DEFAULT_FAMILY_PLAN = Object.freeze({
  sharedCostMode: 'equal', personalDebtOwner: 'buyer1', personalDebtEndMonth: null,
  university: {amount: 0, startMonth: null, endMonth: null},
  sisterJob: {enabled: false, amount: 0, startMonth: null},
  sisterSupport: {enabled: false, savingsAtPurchase: 0},
  rentChange: {...DEFAULT_RENT_CHANGE},
  currentAllocation: {enabled: false, rentPayer: 'buyer1', brotherLivingShare: .5, otherCostMode: 'unassigned', includeUniversity: false, motherContributionMonthly: 0, contributionIncludesUniversity: false},
  purchaseAllocation: 'owners', transportOwner: null, personalCommitments: [],
  extraordinaryReceipt: {enabled: false, month: null, amount: 0, taxReserve: 0, owner: 'buyer1', confirmed: false},
  extraPayMonths: {buyer1: [], buyer2: [], mother: [], sister: []},
  extraPayAmounts: {buyer1: null, buyer2: null, mother: null, sister: null},
  publicTransport: {buyer2Monthly: 0, motherMonthly: 0, sisterMonthly: 0, buyer2Quarterly: null, sisterQuarterly: null,
    sisterPayerMode: 'legacy', sisterWithoutIncomeMotherShare: .5, sisterBeforePurchaseMotherShare: .5},
  purchaseMonth: null, motherLoanStartMonth: null, savingsStartMonth: null, usePurchaseDebtDate: false,
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
  const personalPlanning = normalizePersonalCommitments(raw);
  plan.personalCommitments = personalPlanning.personalCommitments;
  plan.extraordinaryReceipt = personalPlanning.extraordinaryReceipt;
  plan.publicTransport = personalPlanning.publicTransport;
  errors.push(...personalPlanning.errors);
  const rentPlanning = normalizeRentChange(raw.rentChange);
  plan.rentChange = rentPlanning.rentChange;
  errors.push(...rentPlanning.errors);
  for (const key of ['university', 'sisterJob', 'sisterSupport', 'currentAllocation']) {
    if (Object.hasOwn(raw, key) && !isRecord(raw[key])) errors.push(`El apartado ${key} debe ser un objeto válido.`);
    plan[key] = {...DEFAULT_FAMILY_PLAN[key], ...(isRecord(raw[key]) ? raw[key] : {})};
  }
  if (Object.hasOwn(raw, 'extraPayMonths') && !isRecord(raw.extraPayMonths)) errors.push('El calendario de pagas extra debe ser un objeto válido.');
  const extraPayMonths = isRecord(raw.extraPayMonths) ? raw.extraPayMonths : {};
  plan.extraPayMonths = Object.fromEntries(ROLES.map(role => {
    const rawValues = Object.hasOwn(extraPayMonths, role) ? extraPayMonths[role] : [];
    const values = Array.isArray(rawValues) ? rawValues.map(value => value === null ? null : finite(value) ? Number(value) : value) : rawValues;
    const assigned = Array.isArray(values) ? values.filter(value => value !== null) : [];
    if (!Array.isArray(values) || assigned.some(value => !Number.isInteger(value) || value < 1 || value > 12) || new Set(assigned).size !== assigned.length) {
      errors.push(`Las pagas extra de ${role} necesitan meses distintos del 1 al 12.`);
    }
    return [role, Array.isArray(values) ? [...values] : []];
  }));
  if (Object.hasOwn(raw, 'extraPayAmounts') && !isRecord(raw.extraPayAmounts)) errors.push('Los importes de pagas extra deben ser un objeto válido.');
  const extraPayAmounts = isRecord(raw.extraPayAmounts) ? raw.extraPayAmounts : {};
  plan.extraPayAmounts = Object.fromEntries(ROLES.map(role => {
    const value = Object.hasOwn(extraPayAmounts, role) ? extraPayAmounts[role] : null;
    if (value !== null && (!finite(value) || Number(value) < 0)) errors.push(`La paga extra neta de ${role} debe ser un importe no negativo o quedar sin indicar.`);
    return [role, value === null ? null : finite(value) ? money(value) : value];
  }));
  if (!['income', 'equal', 'borrowers', 'workers'].includes(plan.sharedCostMode)) errors.push('Elige un reparto común entre cuatro, entre quienes tienen ingresos, según ingresos o entre titulares.');
  if (!['owners', 'shared-household'].includes(plan.purchaseAllocation)) errors.push('Elige si los pagos de la vivienda se atribuyen a sus titulares o se comparten en casa.');
  if (plan.transportOwner !== null && !ROLES.includes(plan.transportOwner)) errors.push('Asigna el transporte a una persona o mantenlo como gasto compartido.');
  if (typeof plan.currentAllocation.enabled !== 'boolean') errors.push('Indica si se utiliza el reparto actual de alquiler, comida y suministros.');
  if (typeof plan.currentAllocation.includeUniversity !== 'boolean') errors.push('Indica si la universidad forma parte de los gastos compartidos actuales.');
  if (typeof plan.currentAllocation.contributionIncludesUniversity !== 'boolean') errors.push('Indica si el presupuesto de aportación del hermano ya incluye la universidad.');
  if (!ROLES.includes(plan.currentAllocation.rentPayer)) errors.push('El alquiler actual debe asignarse a una de las cuatro personas.');
  if (!finite(plan.currentAllocation.brotherLivingShare) || Number(plan.currentAllocation.brotherLivingShare) < 0 || Number(plan.currentAllocation.brotherLivingShare) > 1) errors.push('El porcentaje de comida y suministros del hermano debe estar entre el 0 % y el 100 %.');
  if (finite(plan.currentAllocation.brotherLivingShare)) plan.currentAllocation.brotherLivingShare = Number(plan.currentAllocation.brotherLivingShare);
  if (!finite(plan.currentAllocation.motherContributionMonthly) || Number(plan.currentAllocation.motherContributionMonthly) < 0) errors.push('La aportación mensual del hermano a mamá debe ser un importe no negativo.');
  else plan.currentAllocation.motherContributionMonthly = money(plan.currentAllocation.motherContributionMonthly);
  if (!['unassigned', 'living-pool', 'income', 'equal', 'borrowers', 'workers', ...ROLES].includes(plan.currentAllocation.otherCostMode)) errors.push('Elige cómo repartir los demás gastos actuales.');
  if (!['buyer1','buyer2'].includes(plan.personalDebtOwner)) errors.push('La deuda personal de los titulares debe pertenecer a uno de los dos compradores.');
  for (const [value, label] of [[plan.university.amount, 'La cuota universitaria'], [plan.sisterJob.amount, 'El ingreso futuro de la hermana']]) {
    if (!finite(value) || Number(value) < 0) errors.push(`${label} debe ser un importe no negativo.`);
  }
  if (finite(plan.university.amount)) plan.university.amount = Number(plan.university.amount);
  if (finite(plan.sisterJob.amount)) plan.sisterJob.amount = Number(plan.sisterJob.amount);
  for (const [value, label] of [
    [plan.purchaseMonth, 'La compra'], [plan.motherLoanStartMonth, 'El préstamo de mamá'], [plan.savingsStartMonth, 'El inicio de la previsión de ahorro'],
    [plan.personalDebtEndMonth, 'El final de la deuda personal'],
    [plan.university.startMonth, 'El inicio de la universidad'], [plan.university.endMonth, 'El final de la universidad'],
    [plan.sisterJob.startMonth, 'El inicio del trabajo de la hermana'],
  ]) if (value !== null && !monthValid(value)) errors.push(`${label} necesita un mes válido con formato AAAA-MM.`);
  if (typeof plan.sisterJob.enabled !== 'boolean') errors.push('Indica si se simula el futuro trabajo de la hermana.');
  if (typeof plan.usePurchaseDebtDate !== 'boolean') errors.push('Indica si el esfuerzo hipotecario utiliza las deudas previstas para el mes de compra.');
  if (typeof plan.sisterSupport.enabled !== 'boolean') errors.push('Indica si se cubre el déficit de la hermana después de comprar.');
  if (!finite(plan.sisterSupport.savingsAtPurchase) || Number(plan.sisterSupport.savingsAtPurchase) < 0) errors.push('Los ahorros disponibles de la hermana deben ser un importe no negativo.');
  else plan.sisterSupport.savingsAtPurchase = money(plan.sisterSupport.savingsAtPurchase);
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
 * Annual extra salary payments appear only in explicitly scheduled months.
 * Ordinary income remains separate for debt ratios and recurring comparisons.
 * Internal repayments cancel in the household total.
 */
export function calculateFamilyTimeline(input, {startMonth = '2026-10', months = 24, calculateScenario = calculateDefaultScenario} = {}) {
  const scenario = normalizeScenario(input), plan = normalizeFamilyPlan(scenario.familyPlan);
  const errors = [...(plan._errors || [])];
  if (!monthValid(startMonth)) errors.push('El calendario necesita un mes inicial válido con formato AAAA-MM.');
  if (!Number.isInteger(months) || months < 1 || months > 1200) errors.push('El horizonte debe ser un número entero de uno a 1.200 meses.');
  if (scenario.budget.incomes.length > 2) errors.push('El reparto de cuatro personas admite dos titulares; revisa los ingresos adicionales.');
  if (scenario.tax.buyers.length !== 2 || scenario.motherTransfer.allocations.length !== 2) errors.push('El calendario familiar necesita el reparto de los dos titulares.');
  const incomeRows = [scenario.budget.incomes[0], scenario.budget.incomes[1], ...['mother', 'sister'].map(id => scenario.budget.householdIncomes.find(row => row.id === id))];
  for (const [index, role] of ROLES.entries()) {
    const count = Math.max(0, Number(incomeRows[index]?.payments || 12) - 12), scheduled = plan.extraPayMonths[role].filter(value => value !== null);
    if (scheduled.length > count) errors.push(`El calendario de pagas extra de ${role} no puede superar ${count} meses.`);
  }
  const calculated = calculateScenario(scenario, {asOfMonth: startMonth});
  if (!calculated?.valid) errors.push(...(calculated?.validation?.errors || ['Revisa los datos de la vivienda.']));
  if (errors.length) return {valid: false, validation: {valid: false, errors: [...new Set(errors)]}, warnings: [], plan, persons: [], months: []};

  const start = monthIndex(startMonth), wait = Number(scenario.cash.preClosingLoanPayments);
  const purchase = plan.purchaseMonth === null ? start + wait : monthIndex(plan.purchaseMonth);
  const loanStart = plan.motherLoanStartMonth === null ? purchase - wait : monthIndex(plan.motherLoanStartMonth);
  if (loanStart > purchase && calculated.familyLoan.principal > 0) return {valid: false, validation: {valid: false, errors: ['El préstamo de mamá necesario para comprar no puede empezar después de la compra.']}, warnings: [], plan, persons: [], months: []};
  const warnings = [];
  const initialCommitments = calculatePersonalCommitments(plan, {asOfMonth: startMonth});
  const extraordinarySettlement = initialCommitments.extraordinarySettlement;
  if (extraordinarySettlement.planned) {
    warnings.push('El cobro extraordinario y la cancelación son una hipótesis separada del sueldo. Se utilizan los saldos de cancelación facilitados, sin restar cuotas como si fueran todo capital; pide el importe exacto al cancelar.');
    if (!extraordinarySettlement.confirmed) warnings.push('El cobro extraordinario todavía no está confirmado; desactívalo para comprobar el presupuesto si no llega.');
    if (!extraordinarySettlement.canSettle && extraordinarySettlement.items.length) warnings.push('El cobro extraordinario no cubre todas las cancelaciones o faltan sus importes. Las cuotas se mantienen: no se cancela ninguna deuda automáticamente.');
  }
  const purchaseFundingGap=Math.max(calculated.cash.fundingGap,calculated.cash.beforeMortgageGap);
  if(purchaseFundingGap>.01)warnings.push('Falta efectivo para la compra o para anticipar sus pagos. El reparto mensual no resuelve ese déficit inicial.');
  if (plan.purchaseMonth === null) warnings.push('La fecha de compra es una hipótesis: inicio del calendario más los meses de espera indicados.');
  if (plan.sisterJob.enabled) warnings.push('El trabajo futuro de la hermana es una hipótesis; sustituye su ingreso actual desde el mes indicado.');
  if (Number(scenario.budget.existingDebtMonthly) > 0 && plan.personalDebtEndMonth === null) warnings.push('La deuda personal se mantiene porque todavía no se ha indicado su último mes de pago.');
  if (Number(scenario.budget.familyExistingDebtMonthly) > 0) warnings.push('Las otras deudas de convivientes se atribuyen provisionalmente a mamá; confirma su titular.');
  if (Number(scenario.budget.familyIncomeMonthly) > 0) warnings.push('La aportación familiar adicional anterior se atribuye a mamá una sola vez; revisa su origen.');
  if (plan.sharedCostMode === 'equal') warnings.push('Los gastos comunes se dividen entre cuatro incluso si alguien no tiene ingresos. La cobertura de un saldo negativo solo se aplica cuando se ha activado expresamente.');
  if (plan.sharedCostMode === 'workers') warnings.push('En el reparto general, los gastos comunes se dividen por igual entre quienes tengan ingresos ese mes; una persona sin ingresos no recibe una parte.');
  if (plan.currentAllocation.enabled) warnings.push(plan.currentAllocation.motherContributionMonthly > 0
    ? plan.currentAllocation.contributionIncludesUniversity
      ? 'Durante el alquiler, el presupuesto del hermano incluye la universidad que paga directamente y el resto que transfiere a mamá. Mamá paga comida y suministros; esto sustituye el reparto por porcentajes de esos gastos. Al terminar la universidad, el presupuesto completo pasa a mamá hasta comprar. La transferencia es interna, no un ingreso nuevo ni otra deuda.'
      : 'Durante el alquiler, mamá paga comida y suministros y recibe la aportación fija del hermano; esto sustituye el reparto por porcentajes de esos gastos. La universidad la paga el hermano. La aportación es una transferencia interna, no un ingreso nuevo ni otra deuda, y termina al comprar.'
    : 'Antes de comprar se aplica vuestro reparto actual: alquiler a su pagador, y comida y suministros entre mamá y el hermano. El reparto de los demás gastos actuales es una hipótesis editable.');
  if (plan.currentAllocation.enabled && plan.currentAllocation.includeUniversity && plan.currentAllocation.motherContributionMonthly === 0) warnings.push('La universidad también se comparte entre mamá y el hermano antes de comprar; el reparto muestra el coste a cargo de cada uno, aunque el recibo lo pague el hermano.');
  if (plan.purchaseAllocation === 'shared-household') warnings.push('Después de comprar se comparte el coste neto de vivienda, universidad y vida común según el reparto elegido. Las deudas y gastos personales conservan su titular; las obligaciones legales de hipoteca y préstamo familiar no cambian.');
  if (plan.sisterSupport.enabled) {
    warnings.push('Después de comprar, el déficit mensual de la hermana utiliza primero sus ahorros indicados y el resto se reparte entre los dos titulares y mamá. Son movimientos del presupuesto familiar: no cambian la deuda bancaria ni generan ingresos nuevos.');
    warnings.push('Los ahorros de la hermana se consumen una sola vez desde el primer mes de vivienda comprada mostrado. Los márgenes positivos futuros no se añaden automáticamente a esos ahorros.');
  }
  if (['buyer2Monthly', 'motherMonthly', 'sisterMonthly'].some(key => plan.publicTransport[key] > 0)) {
    warnings.push('El transporte público figura como provisión mensual. Los abonos trimestrales pueden cobrarse de una vez; sin fechas de renovación no se asignan a un mes de cobro concreto.');
    if (plan.publicTransport.sisterPayerMode === 'income-dependent') warnings.push('Mientras la hermana no tenga ingresos, mamá y el hermano cubren su transporte según el reparto acordado. Cuando tenga ingresos, lo paga ella, tanto de alquiler como después de comprar.');
    else warnings.push('El reparto de transporte conserva los pagadores acordados, aunque una persona todavía no tenga sueldo.');
  }
  warnings.push('IBI, residuos, seguros y mantenimiento anuales son provisiones mensuales; las fechas de cobro reales pueden ser distintas.');
  if (calculated.budget.incomplete) warnings.push('El presupuesto conserva importes pendientes de comprobar o cotizar; los saldos no son una aprobación bancaria.');

  const persons = ROLES.map((id, index) => ({
    id, label: incomeRows[index]?.label || ['Tú', 'Tu hermano', 'Tu madre', 'Tu hermana'][index],
    annualExtraIncome: money(money(plan.extraPayAmounts[id] ?? Number(incomeRows[index]?.monthly || 0)) * Math.max(0, Number(incomeRows[index]?.payments || 12) - 12)),
    extraPaymentAmount: plan.extraPayAmounts[id] ?? money(Number(incomeRows[index]?.monthly || 0)),
    extraPayAmountEstimated: plan.extraPayAmounts[id] === null,
    extraPaymentMonths: plan.extraPayMonths[id].filter(value => value !== null).sort((a,b)=>a-b),
    extraPaySchedulePending: Math.max(0, Number(incomeRows[index]?.payments || 12) - 12) > plan.extraPayMonths[id].filter(value => value !== null).length,
  }));
  const annualExtras = {
    people: Object.fromEntries(persons.map(person => [person.id, person.annualExtraIncome])),
    total: total(persons.map(person => person.annualExtraIncome)),
    scheduledPeople: Object.fromEntries(persons.map(person => [person.id, money(person.extraPaymentAmount * person.extraPaymentMonths.length)])),
    scheduledTotal: total(persons.map(person => money(person.extraPaymentAmount * person.extraPaymentMonths.length))),
    unallocatedPeople: Object.fromEntries(persons.map(person => [person.id, money(person.annualExtraIncome - person.extraPaymentAmount * person.extraPaymentMonths.length)])),
    unallocatedTotal: total(persons.map(person => money(person.annualExtraIncome - person.extraPaymentAmount * person.extraPaymentMonths.length))),
    pendingPeople: persons.filter(person => person.extraPaySchedulePending).map(person => person.id),
  };
  if (annualExtras.pendingPeople.length) warnings.push('Hay pagas extra sin meses de cobro indicados: se muestran como importe anual pendiente y no se suman a ningún mes del calendario.');
  if (persons.some(person => person.extraPaymentMonths.length && person.extraPayAmountEstimated)) warnings.push('Las pagas extra sin importe propio se estiman con el mismo neto que una nómina ordinaria. Comprueba el neto real del recibo: puede variar por retenciones u otros conceptos.');
  const mortgageSchedule = paymentSchedule(calculated.mortgage), motherSchedule = paymentSchedule(calculated.familyLoan);
  const transferSchedule = calculated.motherTransfer.mode === 'family-loan' ? paymentSchedule(calculated.motherTransfer.repayment || {principal: calculated.motherTransfer.amount, monthlyPayment: null}) : [];
  const mortgageShares = scenario.tax.buyers.map(buyer => Number(buyer.share));
  const transferShares = scenario.motherTransfer.allocations.map(allocation => Number(allocation.share));
  const icfStart = purchase + calculated.mortgage.months, icfMonths = calculated.icf.repaymentYears * 12;
  const icfSchedule = paymentSchedule({principal: calculated.icf.principal, months: icfMonths, monthlyPayment: calculated.icf.deferredMonthlyPayment, rate: 0});
  // The core budget may already include today's university payment. Remove
  // that aggregate before assigning this calendar's payment to its real payer.
  const sharedLife = money(calculated.budget.householdMonthly - Number(calculated.budget.universityMonthly || 0));
  const personalTransport = plan.transportOwner === null ? 0 : money(scenario.budget.carMonthly);
  const familyInsurance = money(calculated.budget.familyInsuranceMonthly || 0);
  const foodMonthly = money(scenario.budget.foodMonthly), otherLife = money(sharedLife - foodMonthly - personalTransport - familyInsurance);
  const currentCosts = {food: foodMonthly, utilities: calculated.budget.currentUtilitiesMonthly,
    commonOther: total([otherLife, Number(scenario.budget.currentOtherMonthly)]), familyInsurance};
  const ownedCosts = {rent: 0, food: foodMonthly, utilities: calculated.budget.utilitiesMonthly,
    commonOther: total([calculated.budget.propertyOverheadMonthly, otherLife]), familyInsurance};
  const missingPayments = motherSchedule === null || calculated.motherTransfer.mode === 'family-loan' && calculated.motherTransfer.amount > 0 && transferSchedule === null;
  let sisterSavingsBalance = plan.sisterSupport.enabled ? plan.sisterSupport.savingsAtPurchase : 0;
  const rows = Array.from({length: months}, (_, offset) => {
    const month = start + offset, owning = month >= purchase;
    const commitmentState = calculatePersonalCommitments(plan, {asOfMonth: monthString(month)});
    const phase = !owning ? 'renting' : calculated.icf.principal > 0 && month >= icfStart && month < icfStart + icfMonths ? 'icf' : 'owning';
    const incomes = incomeRows.map(row => money(Number(row?.monthly || 0)));
    incomes[2] = money(incomes[2] + Number(scenario.budget.familyIncomeMonthly));
    if (plan.sisterJob.enabled && month >= monthIndex(plan.sisterJob.startMonth)) incomes[3] = money(plan.sisterJob.amount);
    const salaryExtras = persons.map((person, index) => person.extraPaymentMonths.includes(month % 12 + 1)
      ? money(plan.extraPayAmounts[person.id] ?? (index === 3 && plan.sisterJob.enabled && month >= monthIndex(plan.sisterJob.startMonth) ? plan.sisterJob.amount : Number(incomeRows[index]?.monthly || 0))) : 0);
    const publicTransport = calculatePublicTransport(plan, {owning, sisterHasIncome: incomes[3] > 0});
    const shares = costShares(plan.sharedCostMode, incomes), costs = owning ? ownedCosts : {...currentCosts, rent: currentRentForMonth(scenario.budget.currentRent, plan.rentChange, monthString(month))};
    const currentAllocationApplied = !owning && plan.currentAllocation.enabled;
    const university = month <= (plan.university.endMonth === null ? -Infinity : monthIndex(plan.university.endMonth)) && (plan.university.startMonth === null || month >= monthIndex(plan.university.startMonth)) ? money(plan.university.amount) : 0;
    const contributionApplied = currentAllocationApplied && plan.currentAllocation.motherContributionMonthly > 0;
    const livingContribution = contributionApplied ? money(Math.max(0, plan.currentAllocation.motherContributionMonthly - (plan.currentAllocation.contributionIncludesUniversity ? university : 0))) : 0;
    const livingShares = contributionApplied ? [0, 0, 1, 0] : [0, plan.currentAllocation.brotherLivingShare, 1 - plan.currentAllocation.brotherLivingShare, 0];
    const rentShares = ROLES.map(role => role === plan.currentAllocation.rentPayer ? 1 : 0);
    const hasUnassignedMode = currentAllocationApplied && plan.currentAllocation.otherCostMode === 'unassigned';
    const componentParts = Object.fromEntries(Object.entries(costs).map(([key, amount]) => [key,
      hasUnassignedMode && key === 'commonOther' ? ROLES.map(() => 0) : allocate(amount,
        key === 'familyInsurance' ? owning ? costShares('workers', incomes) : [0, 0, 1, 0] : !currentAllocationApplied ? shares : key === 'rent' ? rentShares : key === 'food' || key === 'utilities' || plan.currentAllocation.otherCostMode === 'living-pool' ? livingShares : costShares(plan.currentAllocation.otherCostMode, incomes))]));
    const unassignedExpenses = hasUnassignedMode ? costs.commonOther : 0;
    const hasUnassignedExpenses = unassignedExpenses === null || unassignedExpenses > 0;
    const common = total(Object.values(costs)), commonParts = ROLES.map((role, index) => total(Object.values(componentParts).map(parts => parts[index])));
    const mortgage = installmentAt(mortgageSchedule, month - purchase, calculated.mortgage.principal > 0), mortgageParts = allocate(mortgage, [...mortgageShares, 0, 0]);
    const familyRepayment = installmentAt(transferSchedule, month - loanStart, calculated.motherTransfer.mode === 'family-loan' && calculated.motherTransfer.amount > 0);
    const familyParts = allocate(familyRepayment, [...transferShares, 0, 0]);
    const motherBankPayment = installmentAt(motherSchedule, month - loanStart, calculated.familyLoan.principal > 0);
    const icf = installmentAt(icfSchedule, month - icfStart, calculated.icf.principal > 0), icfParts = allocate(icf, [...mortgageShares, 0, 0]);
    const universityParts = allocate(university, currentAllocationApplied && !contributionApplied && plan.currentAllocation.includeUniversity ? livingShares : [0, 1, 0, 0]);
    const personal = plan.personalDebtEndMonth === null || month <= monthIndex(plan.personalDebtEndMonth) ? money(scenario.budget.existingDebtMonthly) : 0;
    const people = Object.fromEntries(persons.map((person, index) => {
      const fixedPersonalDebt = total([person.id === plan.personalDebtOwner ? personal : 0, person.id === 'mother' ? money(scenario.budget.familyExistingDebtMonthly) : 0, commitmentState.debtByOwner[person.id]]);
      const entry = {income: incomes[index], salaryExtra: salaryExtras[index], common: commonParts[index], rent: componentParts.rent[index], food: componentParts.food[index],
        utilities: componentParts.utilities[index], commonOther: componentParts.commonOther[index], familyInsurance: componentParts.familyInsurance[index], fixedPersonalDebt, university: universityParts[index],
        personalCommitments: commitmentState.activeByOwner[person.id], personalCommitmentDebt: commitmentState.debtByOwner[person.id], personalExpense: commitmentState.expenseByOwner[person.id],
        transportExpense: person.id === plan.transportOwner ? personalTransport : 0,
        publicTransportExpense: publicTransport.byOwner[person.id],
        mortgage: mortgageParts[index], familyRepayment: familyParts[index], motherBankPayment: person.id === 'mother' ? motherBankPayment : 0,
        internalReceived: person.id === 'mother' ? familyRepayment : 0, icfRepayment: icfParts[index], householdRedistribution: 0,
        livingContributionPaid: person.id === 'buyer2' ? livingContribution : 0, livingContributionReceived: person.id === 'mother' ? livingContribution : 0,
        familySupportPaid: 0, familySupportReceived: 0, savingsUsed: 0, savingsBalance: 0,
        extraordinaryIncome: commitmentState.extraordinaryIncomeByOwner[person.id], debtSettlement: commitmentState.debtSettlementByOwner[person.id], reservedExtraordinary: commitmentState.reservedExtraordinaryByOwner[person.id]};
      entry.externalIncome = total([entry.income, entry.salaryExtra, entry.extraordinaryIncome]);
      entry.expenses = total([entry.common, entry.fixedPersonalDebt, entry.personalExpense, entry.transportExpense, entry.publicTransportExpense, entry.university, entry.mortgage, entry.familyRepayment, entry.motherBankPayment, entry.icfRepayment, entry.livingContributionPaid]);
      entry.remaining = entry.expenses === null || entry.internalReceived === null ? null : money(entry.income + entry.internalReceived + entry.livingContributionReceived - entry.expenses);
      entry.cashRemaining = entry.remaining === null ? null : money(entry.remaining + entry.salaryExtra + entry.extraordinaryIncome - entry.debtSettlement - entry.reservedExtraordinary);
      return [person.id, entry];
    }));
    if (owning && plan.purchaseAllocation === 'shared-household') {
      // The family policy keeps its explicit equal-among-earners allocation,
      // independent of the selected distribution of other shared costs.
      const sharedTargets = allocate(total([common === null ? null : money(common - familyInsurance), university, mortgage, motherBankPayment, icf]), shares);
      persons.forEach((person, index) => {
        const entry = people[person.id];
        const originalShared = total([entry.common === null || entry.familyInsurance === null ? null : money(entry.common - entry.familyInsurance), entry.university, entry.mortgage, entry.familyRepayment, entry.motherBankPayment, entry.icfRepayment]);
        entry.householdRedistribution = sharedTargets[index] === null || originalShared === null || entry.internalReceived === null ? null : money(sharedTargets[index] - originalShared + entry.internalReceived);
        entry.expenses = total([entry.expenses, entry.householdRedistribution]);
        entry.remaining = entry.expenses === null || entry.internalReceived === null ? null : money(entry.income + entry.internalReceived + entry.livingContributionReceived - entry.expenses);
        entry.cashRemaining = entry.remaining === null ? null : money(entry.remaining + entry.salaryExtra + entry.extraordinaryIncome - entry.debtSettlement - entry.reservedExtraordinary);
      });
    }
    // Dated extra income can cover this month's deficit before using savings.
    // The stock is explicit savings,
    // separate from purchase savings and from uncommitted monthly margins.
    for (const entry of Object.values(people)) {
      entry.remainingBeforeSupport = entry.remaining;
      entry.cashBeforeSupport = entry.cashRemaining;
      entry.remainingWithoutSavings = entry.remaining;
    }
    const sisterSupportApplied = owning && plan.sisterSupport.enabled;
    if (sisterSupportApplied && people.sister.cashRemaining !== null && people.sister.cashRemaining < 0) {
      const deficit = money(-people.sister.cashRemaining);
      const savingsUsed = Math.min(sisterSavingsBalance, deficit);
      sisterSavingsBalance = money(sisterSavingsBalance - savingsUsed);
      const familySupport = money(deficit - savingsUsed);
      const donorParts = allocate(familySupport, [1, 1, 1]);
      for (const [index, role] of ['buyer1', 'buyer2', 'mother'].entries()) {
        const entry = people[role];
        entry.familySupportPaid = donorParts[index];
        entry.expenses = total([entry.expenses, entry.familySupportPaid]);
        entry.remaining = entry.remaining === null ? null : money(entry.remaining - entry.familySupportPaid);
        entry.remainingWithoutSavings = entry.remaining;
        entry.cashRemaining = entry.cashRemaining === null ? null : money(entry.cashRemaining - entry.familySupportPaid);
      }
      people.sister.familySupportReceived = familySupport;
      people.sister.savingsUsed = savingsUsed;
      people.sister.remainingWithoutSavings = money(people.sister.remaining + familySupport);
      people.sister.remaining = money(people.sister.remainingWithoutSavings + savingsUsed);
      people.sister.cashRemaining = people.sister.cashRemaining === null ? null : money(people.sister.cashRemaining + familySupport + savingsUsed);
    }
    people.sister.savingsBalance = sisterSavingsBalance;
    const commitmentDebt = total(Object.values(commitmentState.debtByOwner)), commitmentExpense = total(Object.values(commitmentState.expenseByOwner));
    const householdExpenses = total([common, personal, money(scenario.budget.familyExistingDebtMonthly), commitmentDebt, commitmentExpense, personalTransport, publicTransport.total, university, mortgage, motherBankPayment, icf]);
    const householdIncome = total(incomes), borrowerIncome = money(incomes[0] + incomes[1]);
    const borrowerDebt = total([mortgage, ['buyer1', 'buyer2'].includes(plan.personalDebtOwner) ? personal : 0, commitmentState.debtByOwner.buyer1, commitmentState.debtByOwner.buyer2, familyRepayment, icf]);
    const household = {income: householdIncome, salaryExtra: total(salaryExtras), expenses: householdExpenses, remaining: householdExpenses === null ? null : money(householdIncome - householdExpenses),
      internalTransfers: familyRepayment, livingContributionTransfers: livingContribution, common, ...costs, unassignedExpenses, mortgage, motherBankPayment, fixedPersonalDebt: money(personal + Number(scenario.budget.familyExistingDebtMonthly) + commitmentDebt), university, icfRepayment: icf,
      personalCommitmentDebt: commitmentDebt, personalExpense: commitmentExpense, transportExpense: personalTransport,
      publicTransportExpense: publicTransport.total,
      familySupportTransfers: people.sister.familySupportReceived, savingsUsed: people.sister.savingsUsed,
      extraordinaryIncome: total(Object.values(commitmentState.extraordinaryIncomeByOwner)), debtSettlement: total(Object.values(commitmentState.debtSettlementByOwner)), reservedExtraordinary: total(Object.values(commitmentState.reservedExtraordinaryByOwner))};
    household.externalIncome = total([household.income, household.salaryExtra, household.extraordinaryIncome]);
    household.cashRemaining = household.remaining === null ? null : money(household.remaining + household.salaryExtra + household.extraordinaryIncome - household.debtSettlement - household.reservedExtraordinary + household.savingsUsed);
    const motherNetBankCost = motherBankPayment === null || familyRepayment === null ? null : money(motherBankPayment - familyRepayment);
    return {month: monthString(month), phase, currentAllocationApplied, hasUnassignedExpenses, sisterSupportApplied, purchaseAllocationApplied: owning && plan.purchaseAllocation === 'shared-household', people, household, motherNetBankCost, bankDebtMonthly: borrowerDebt,
      bankDebtRatio: borrowerDebt === null || borrowerIncome <= 0 ? null : borrowerDebt / borrowerIncome,
      needsFamilyTopUp: persons.some(person => people[person.id].cashRemaining !== null && people[person.id].cashRemaining < 0)};
  });
  if (plan.sharedCostMode === 'income' && rows.some(row => row.household.income <= 0)) warnings.push('Sin ingresos no puede calcularse el reparto proporcional; los saldos personales quedan pendientes.');
  if (rows.some(row => row.household.income <= 0 && row.household.common > 0 && (plan.sharedCostMode === 'workers' || row.currentAllocationApplied && plan.currentAllocation.otherCostMode === 'workers'))) warnings.push('Sin ninguna persona con ingresos no puede repartirse el gasto entre quienes cobran; los saldos correspondientes quedan pendientes.');
  if (rows.some(row => row.hasUnassignedExpenses)) warnings.push('Hay otros gastos actuales sin pagador asignado. Se cuentan en el total familiar, pero los saldos individuales todavía no descuentan esa parte: no todo ese saldo está disponible para ahorrar.');
  if (rows.some(row => row.currentAllocationApplied && plan.currentAllocation.motherContributionMonthly > 0 && row.people.buyer2.cashRemaining !== null && row.people.buyer2.cashRemaining < 0)) warnings.push('La universidad, los pagos personales y la aportación a mamá superan los ingresos del hermano en algún mes de alquiler. Su déficit queda visible: no se cubre automáticamente ni se presume otro ingreso.');
  if (plan.currentAllocation.contributionIncludesUniversity && rows.some(row => row.currentAllocationApplied && plan.currentAllocation.motherContributionMonthly > 0 && row.household.university > plan.currentAllocation.motherContributionMonthly)) warnings.push('La universidad supera el presupuesto combinado del hermano en algún mes de alquiler: la transferencia a mamá queda en cero y la universidad sigue íntegra a cargo del hermano.');
  if (plan.sisterSupport.enabled && rows.some(row => row.sisterSupportApplied && row.people.sister.remaining === null)) warnings.push('Faltan importes para calcular el déficit de la hermana. No se consumen ahorros ni se inventa una aportación familiar para esos meses.');
  if (rows.some(row => row.household.familySupportTransfers > 0 && ['buyer1', 'buyer2', 'mother'].some(role => row.people[role].cashRemaining !== null && row.people[role].cashRemaining < 0))) warnings.push('El reparto de ayuda a la hermana deja a otra persona con saldo negativo en algún mes. La ayuda no resuelve la falta de dinero del conjunto familiar.');
  return {valid: true, validation: {valid: true, errors: []}, warnings, plan, persons, months: rows, annualExtras, extraordinarySettlement,
    purchaseMonth: monthString(purchase), motherLoanStartMonth: monthString(loanStart), purchaseMonthAssumed: plan.purchaseMonth === null,
    purchaseFundingGap,
    incomplete: Boolean(calculated.budget.incomplete || missingPayments || plan.sisterJob.enabled || annualExtras.unallocatedTotal > 0 || extraordinarySettlement.planned && (!extraordinarySettlement.confirmed || !extraordinarySettlement.canSettle) || plan.purchaseMonth === null || purchaseFundingGap>.01 || rows.some(row => row.hasUnassignedExpenses)),
    bankDebtRatio: calculated.budget.debtRatio, bankDebtRatioLimit: calculated.budget.debtRatioLimit};
}
