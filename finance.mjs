import {calculatePreclosing} from './preclosing.mjs?v=18';
/**
 * Housing purchase model. Money is EUR; annual loan rates are percentages (3.7),
 * loan-to-value and ownership shares are fractions (0.8 / 0.5), tax rates are
 * fractions (0.05). No bank approval or insurance quote is inferred.
 *
 * calculateScenario({...DEFAULT_SCENARIO, ...overrides}) returns:
 * { validation, warnings, tax, mortgage, familyLoan, motherTransfer, icf, cash, budget, stress,
 *   bonuses, timeline, lifetime }. Nested defaults are merged by the calculator.
 * Missing recurring costs are not silently treated as confirmed free products:
 * budget.incomplete and warnings identify quotes still required.
 * cash.depositFundingMode: pending keeps nominal capital but marks advance
 * release risk; offset-confirmed assumes it is offset/released at signing;
 * no-release limits bank and then ICF funding to the vendor balance outstanding.
 */

export const DEFAULT_SCENARIO = Object.freeze({
  purchasePrice: 250000,
  appraisalValue: null,
  referenceValue: null,
  declaredValue: null,
  propertyType: 'house',
  tax: {
    mode: 'used',
    buyers: [
      { id: 'buyer-1', label: 'Comprador 1', share: 0.5, rate: 0.1, eligibilityConfirmed: false, eligibilityAssumed: false },
      { id: 'buyer-2', label: 'Comprador 2', share: 0.5, rate: 0.1, eligibilityConfirmed: false, eligibilityAssumed: false },
    ],
    vatRate: 0.1,
    ajdRate: 0.015,
  },
  mortgage: {
    ltv: 0.8,
    years: 30,
    baseRate: 3.7,
    maxDiscountPoints: 1,
    originationFeePercent: 0,
    originationFeeFixed: 0,
    discounts: [
      { id: 'payroll', label: 'Nómina', enabled: false, points: 0.4, cost: 0, frequency: 'monthly', quoteKnown: true },
      { id: 'life', label: 'Seguro de vida', enabled: false, points: 0.4, cost: null, frequency: 'annual', quoteKnown: false },
      { id: 'home', label: 'Seguro de hogar Sabadell', enabled: false, points: null, cost: null, frequency: 'annual', quoteKnown: false },
      { id: 'protection', label: 'Protección de pagos', enabled: false, points: null, cost: null, frequency: 'upfront', coverageYears: 5, quoteKnown: false },
    ],
  },
  icf: { enabled: false, ltv: 0.2, maxAmount: 50000, repaymentYears: 5, eligibilityConfirmed: false },
  cash: { savings: 0, depositPercent: 0.1, preClosingLoanPayments: 0, familyLoanAvailableBeforeDeposit: false, depositFundingMode: 'pending' },
  purchaseCosts: {
    mode: 'itemized', provisionAmount: 5000, provisionBeforeSigning: 0,
    appraisal: 0, legal: 0, notary: 0, registry: 0, agency: 0,
    broker: 0, other: 0, renovations: 0, moving: 0, reserve: 0, vat: {}, brokerQuotePending: false,
  },
  familyLoan: { enabled: false, amount: null, maxAmount: 60000, rate: null, years: null, extraBuffer: 3000, assumedTerms: false, coverEarlyLiquidity: false, originationFeePercent: 0, originationFeeFixed: 0 },
  motherTransfer: {
    mode: 'family-loan',
    repaymentMode: 'custom',
    allocations: [
      { share: 0.5, giftReductionEligible: false, preExistingWealth: 0 },
      { share: 0.5, giftReductionEligible: false, preExistingWealth: 0 },
    ],
    familyRate: 0, familyYears: null, giftPublicDeed: true, giftNotaryCost: 0,
  },
  budget: {
    incomes: [],
    householdIncomes: [
      { id: 'mother', monthly: 0, payments: 14 },
      { id: 'sister', monthly: 0, payments: 12 },
    ],
    existingDebtMonthly: 0, familyIncomeMonthly: 0, familyExistingDebtMonthly: 0,
    utilitiesMonthly: 0, carMonthly: 0, foodMonthly: 0, otherMonthly: 0, storageMonthly: 0,
    sharedLivingCosts: true,
    propertyCostsEstimated: false, propertyCostsConfirmed: false, ibiLiquidableBase: null, ibiRatePercent: null,
    utilityBreakdown: { waterMonthly: 0, energyMonthly: 0, internetMonthly: 0, otherMonthly: 0 },
    ibiAnnual: 0, wasteAnnual: 0, maintenanceAnnual: 0, communityMonthly: 0,
    externalHomeInsuranceAnnual: null, currentRent: 1014.35,
    currentUtilitiesMonthly: 0, currentOtherMonthly: 0, debtRatioLimit: 0.35,
    currentUtilityBreakdown: { waterMonthly: 0, energyMonthly: 0, internetMonthly: 0, otherMonthly: 0 },
  },
  stress: { incomeDropPercent: 10, expenseIncreasePercent: 10, loseDiscounts: true, unexpectedCost: 3000 },
});

const COST_KEYS = ['appraisal', 'legal', 'notary', 'registry', 'agency', 'broker', 'other', 'renovations', 'moving', 'reserve'];
const VAT_COST_KEYS = ['appraisal', 'legal', 'notary', 'registry', 'agency', 'broker', 'renovations', 'moving'];
const UTILITY_KEYS = ['waterMonthly', 'energyMonthly', 'internetMonthly', 'otherMonthly'];
const FREQUENCIES = new Set(['monthly', 'quarterly', 'annual', 'upfront']);
const isNumericPrimitive = (value) => (typeof value === 'number' || typeof value === 'string') && !(typeof value === 'string' && value.trim() === '');
const n = (value, fallback = 0) => isNumericPrimitive(value) && Number.isFinite(Number(value)) ? Number(value) : fallback;
const nonnegative = (value) => Math.max(0, n(value));
const rounded = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export function normalizeScenario(input = {}) {
  const base = structuredClone(DEFAULT_SCENARIO);
  const structureErrors = [];
  if (!isRecord(input)) {
    structureErrors.push('El cálculo debe ser un objeto con sus apartados, no un valor vacío ni una lista.');
    input = {};
  }
  // Keep shape errors through repeated normalization so a rejected import never
  // becomes a seemingly valid scenario just because its arrays were repaired.
  if (Array.isArray(input._structureErrors)) {
    structureErrors.push(...input._structureErrors.filter((error) => typeof error === 'string'));
  }
  const result = { ...base, ...input };
  for (const key of ['tax', 'mortgage', 'icf', 'cash', 'purchaseCosts', 'familyLoan', 'motherTransfer', 'budget', 'stress']) {
    const provided = Object.hasOwn(input, key);
    if (provided && !isRecord(input[key])) structureErrors.push(`El apartado ${key} debe ser un objeto válido.`);
    result[key] = { ...base[key], ...(provided && isRecord(input[key]) ? input[key] : {}) };
  }
  // Saved amounts have always meant final prices. Only an explicit net quote
  // adds VAT; neither a mixed provision nor an old scenario gets a blanket tax.
  let costVat = result.purchaseCosts.vat;
  if (!isRecord(costVat)) {
    structureErrors.push('El IVA de los presupuestos debe ser un objeto válido.');
    costVat = {};
  }
  result.purchaseCosts.vat = Object.fromEntries(VAT_COST_KEYS.map((key) => {
    let quote = costVat[key];
    if (quote !== undefined && !isRecord(quote)) {
      structureErrors.push(`El IVA del presupuesto ${key} debe ser un objeto válido.`);
      quote = {};
    }
    return [key, { mode: 'total', rate: 21, untaxed: 0, ...quote }];
  }));
  for (const [section, key, label] of [
    ['tax', 'buyers', 'Los compradores'],
    ['mortgage', 'discounts', 'Las bonificaciones'],
    ['budget', 'incomes', 'Los ingresos'],
    ['budget', 'householdIncomes', 'Los ingresos de los demás convivientes'],
    ['motherTransfer', 'allocations', 'El reparto de la entrega de la madre'],
  ]) {
    const value = result[section][key];
    if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) {
      structureErrors.push(`${label} deben ser una lista de objetos válidos; no se admiten elementos vacíos.`);
      result[section][key] = structuredClone(base[section][key]);
    } else {
      // Copy records so normalizing never aliases the caller's editable rows.
      result[section][key] = value.map((entry) => ({ ...entry }));
    }
  }
  result.tax.buyers = result.tax.buyers.map((buyer) => ({ eligibilityAssumed: false, ...buyer }));
  const householdRoles = ['mother', 'sister'];
  const householdRows = result.budget.householdIncomes;
  const identifiedHouseholdRows = new Map();
  const positionalHouseholdRows = [];
  householdRows.forEach((income, index) => {
    if (householdRoles.includes(income.id)) {
      if (identifiedHouseholdRows.has(income.id)) structureErrors.push('Cada conviviente (madre y hermana) debe aparecer una sola vez.');
      else identifiedHouseholdRows.set(income.id, income);
    } else if (income.id == null || income.id === '') positionalHouseholdRows.push([income, index]);
    else structureErrors.push('Los ingresos de convivientes solo admiten los perfiles mother y sister; usa otras aportaciones para otros ingresos.');
  });
  positionalHouseholdRows.forEach(([income, index]) => {
    const role = householdRoles[index];
    if (!role) structureErrors.push('Solo se admiten dos perfiles de convivientes: madre y hermana.');
    else if (identifiedHouseholdRows.has(role)) structureErrors.push('Hay un ingreso sin perfil que se solapa con un conviviente identificado; revisa el reparto.');
    else identifiedHouseholdRows.set(role, income);
  });
  result.budget.householdIncomes = base.budget.householdIncomes.map((income) => ({
    ...income, ...(identifiedHouseholdRows.get(income.id) || {}), id: income.id,
  }));
  for (const key of ['utilityBreakdown', 'currentUtilityBreakdown']) {
    const value = result.budget[key];
    if (!isRecord(value)) {
      structureErrors.push(`El desglose de suministros ${key} debe ser un objeto válido.`);
      result.budget[key] = structuredClone(base.budget[key]);
    } else result.budget[key] = { ...base.budget[key], ...value };
  }
  // Modes intentionally have no public default property: older saved scenarios
  // with one aggregate amount must retain that amount on first normalization.
  for (const [modeKey, aggregateKey, breakdownKey] of [
    ['utilitiesMode', 'utilitiesMonthly', 'utilityBreakdown'],
    ['currentUtilitiesMode', 'currentUtilitiesMonthly', 'currentUtilityBreakdown'],
  ]) {
    if (result.budget[modeKey] === undefined) {
      const hasDetail = UTILITY_KEYS.some((key) => nonnegative(result.budget[breakdownKey][key]) > 0);
      result.budget[modeKey] = hasDetail || nonnegative(result.budget[aggregateKey]) === 0 ? 'detailed' : 'aggregate';
    }
  }
  if (!isRecord(input.budget) || input.budget.sharedLivingCosts === undefined) {
    const effectiveUtility = (modeKey, aggregateKey, breakdownKey) => result.budget[modeKey] === 'aggregate'
      ? nonnegative(result.budget[aggregateKey])
      : sum(UTILITY_KEYS.map((key) => nonnegative(result.budget[breakdownKey][key])));
    const futureUtility = effectiveUtility('utilitiesMode', 'utilitiesMonthly', 'utilityBreakdown');
    const currentUtility = effectiveUtility('currentUtilitiesMode', 'currentUtilitiesMonthly', 'currentUtilityBreakdown');
    // One set of living costs is the default for both new and saved scenarios.
    // When the only known bills were entered as current bills, reuse them as
    // the canonical shared inputs. The original current inputs stay intact.
    result.budget.sharedLivingCosts = true;
    if (futureUtility === 0 && currentUtility > 0) {
      result.budget.utilitiesMode = result.budget.currentUtilitiesMode;
      result.budget.utilitiesMonthly = result.budget.currentUtilitiesMonthly;
      result.budget.utilityBreakdown = { ...result.budget.currentUtilityBreakdown };
    }
  }
  if (structureErrors.length) result._structureErrors = [...new Set(structureErrors)];
  else delete result._structureErrors;
  return result;
}

/** French amortization, no fees and no insurance. Throws on invalid terms. */
export function monthlyPayment(principal, annualRate, years) {
  const p = Number(principal);
  const rate = Number(annualRate);
  const months = Number(years) * 12;
  if (![p, rate, months].every(Number.isFinite) || p < 0 || rate < 0 || months <= 0 || !Number.isInteger(months)) {
    throw new RangeError('Capital y tipo deben ser no negativos y el plazo un número entero de meses mayor que cero.');
  }
  if (p === 0) return 0;
  const r = rate / 1200;
  if (r === 0) return p / months;
  return p * r / -Math.expm1(-months * Math.log1p(r));
}

/** Full monthly schedule with unrounded balances; rounded figures are for display. */
export function amortizeLoan(principal, annualRate, years, { includeSchedule = false } = {}) {
  const payment = monthlyPayment(principal, annualRate, years);
  let balance = Number(principal);
  let totalInterest = 0;
  let totalPaid = 0;
  const months = Number(years) * 12;
  const schedule = [];
  for (let month = 1; month <= months && balance > 1e-8; month += 1) {
    const interest = balance * Number(annualRate) / 1200;
    const paid = Math.min(payment, balance + interest);
    const capital = paid - interest;
    balance = Math.max(0, balance - capital);
    totalInterest += interest;
    totalPaid += paid;
    if (includeSchedule) schedule.push({ month, payment: paid, interest, principal: capital, balance });
  }
  return {
    principal: Number(principal), rate: Number(annualRate), years: Number(years), months,
    monthlyPayment: payment, totalInterest, totalPaid, ...(includeSchedule ? { schedule } : {}),
  };
}

/** Catalonia general progressive TPO tariff; calculate before applying ownership %. */
export function standardCataloniaTransferTax(taxableValue) {
  const value = nonnegative(taxableValue);
  return Math.min(value, 600000) * 0.1
    + Math.min(Math.max(value - 600000, 0), 300000) * 0.11
    + Math.min(Math.max(value - 900000, 0), 600000) * 0.12
    + Math.max(value - 1500000, 0) * 0.13;
}

/** Reduced tax can be confirmed or explicitly simulated, retaining that distinction. */
export function calculateTransferTax({ purchasePrice, referenceValue = 0, declaredValue = 0, buyers = [], mode = 'used', vatRate = 0.1, ajdRate = 0.015 } = {}) {
  const price = nonnegative(purchasePrice);
  const base = Math.max(price, nonnegative(referenceValue), nonnegative(declaredValue));
  if (mode === 'new') {
    // IVA taxes the purchase consideration; AJD can use the higher reference base.
    const vat = price * nonnegative(vatRate);
    const ajd = base * nonnegative(ajdRate);
    return { mode, base, vatBase: price, vat, ajd, total: vat + ajd, buyers: [], warnings: [] };
  }
  const generalTax = standardCataloniaTransferTax(base);
  const warnings = [];
  const rows = buyers.map((buyer, index) => {
    const requestedRate = buyer.rate == null ? 0.1 : nonnegative(buyer.rate);
    const reduced = requestedRate < 0.1;
    const confirmed = !reduced || buyer.eligibilityConfirmed === true;
    const assumed = buyer.eligibilityAssumed === true;
    const reducedRateAppliedAsHypothesis = reduced && !confirmed && assumed;
    const eligibilityStatus = !reduced ? 'not-required' : confirmed ? 'confirmed' : assumed ? 'assumed' : 'pending';
    if (reducedRateAppliedAsHypothesis) warnings.push(`${buyer.label || `Comprador ${index + 1}`}: tipo reducido simulado como hipótesis; requisitos pendientes de comprobar con la documentación fiscal.`);
    else if (!confirmed) warnings.push(`${buyer.label || `Comprador ${index + 1}`}: tipo reducido sin confirmar; se calcula la tarifa general.`);
    const share = nonnegative(buyer.share);
    const applyRequestedRate = reduced ? confirmed || assumed : buyer.customRateConfirmed === true;
    const fullTax = applyRequestedRate ? base * requestedRate : generalTax;
    const amount = fullTax * share;
    return { ...buyer, share, requestedRate, appliedRate: base ? fullTax / base : 0, eligibilityConfirmed: confirmed, eligibilityAssumed: assumed, eligibilityStatus, reducedRateAppliedAsHypothesis, taxableShare: base * share, amount };
  });
  return { mode, base, total: sum(rows.map((row) => row.amount)), vat: 0, ajd: 0, buyers: rows, warnings };
}

function progressiveTax(base, brackets) {
  let tax = 0;
  let previous = 0;
  for (const [limit, rate] of brackets) {
    tax += Math.max(0, Math.min(base, limit) - previous) * rate;
    if (base <= limit) break;
    previous = limit;
  }
  return tax;
}

/** Catalonia parent-to-child cash gift, assuming no prior gifts to accumulate.
 * residenceConfirmed must be checked outside this model: cash gifts are taxed
 * by the recipient's applicable habitual-residence jurisdiction, not the house.
 */
export function calculateGiftTax(amount, {
  publicDeed = true, preExistingWealth = 0, reductionEligible = false,
  reductionOwnershipAllowed = false, reductionCap = 60000, reductionAlreadyUsed = 0,
} = {}) {
  const gross = nonnegative(amount);
  const reduction = reductionEligible && reductionOwnershipAllowed && publicDeed
    ? Math.min(gross * 0.95, Math.max(0, nonnegative(reductionCap) - nonnegative(reductionAlreadyUsed))) : 0;
  const taxableBase = Math.max(0, gross - reduction);
  const brackets = publicDeed
    ? [[200000, 0.05], [600000, 0.07], [Infinity, 0.09]]
    : [[50000, 0.07], [150000, 0.11], [400000, 0.17], [800000, 0.24], [Infinity, 0.32]];
  const quotaBeforeCoefficient = progressiveTax(taxableBase, brackets);
  const wealth = nonnegative(preExistingWealth);
  const wealthBands = [[500000, 1], [2000000, 1.1], [4000000, 1.15], [Infinity, 1.2]];
  const index = wealthBands.findIndex(([limit]) => wealth <= limit);
  const coefficient = wealthBands[index][1];
  const quota = quotaBeforeCoefficient * coefficient;
  const marginalRelief = index > 0
    ? Math.max(0, quotaBeforeCoefficient * (coefficient - wealthBands[index - 1][1]) - (wealth - wealthBands[index - 1][0])) : 0;
  return {
    gross, reduction, taxableBase, quotaBeforeCoefficient, coefficient, marginalRelief,
    total: quota - marginalRelief, publicDeed: !!publicDeed,
  };
}

/** The mother's bank loan is external debt; this transfer is an internal flow.
 * Ownership shares guard against using the first-home gift reduction for a
 * normal 50/50 purchase by siblings. A separate explicit spouse confirmation
 * exists only for the statutory co-ownership exception.
 */
export function calculateMotherTransfer({
  amount = 0, mode = 'family-loan', allocations = DEFAULT_SCENARIO.motherTransfer.allocations,
  familyRate = 0, familyYears = null, giftPublicDeed = true, giftNotaryCost = 0,
  ownershipShares = [], coOwnerSpouseConfirmed = false,
  repaymentMode = 'custom', bankLoanRate = null, bankLoanYears = null, bankLoanTermsAssumed = false,
} = {}) {
  const gross = nonnegative(amount);
  const warnings = [];
  if (mode === 'family-loan') {
    const effectiveFamilyRate = repaymentMode === 'same-as-bank' ? bankLoanRate : familyRate;
    const effectiveFamilyYears = repaymentMode === 'same-as-bank' ? bankLoanYears : familyYears;
    const termsKnown = gross === 0 || (effectiveFamilyRate != null && effectiveFamilyYears != null);
    const repayment = gross > 0 && termsKnown ? amortizeLoan(gross, n(effectiveFamilyRate), n(effectiveFamilyYears)) : null;
    const repaymentTermsAssumed = repaymentMode === 'same-as-bank' && bankLoanTermsAssumed === true;
    const familyMonthlyRepayment = gross === 0 ? 0 : repayment?.monthlyPayment ?? null;
    const rows = allocations.map((allocation) => ({
      ...allocation, share: nonnegative(allocation.share), amount: gross * nonnegative(allocation.share),
      monthlyRepayment: familyMonthlyRepayment == null ? null : familyMonthlyRepayment * nonnegative(allocation.share),
    }));
    if (gross > 0) {
      warnings.push('El préstamo entre madre e hijos requiere contrato, calendario y devoluciones reales; modelo 600 exento, generalmente dentro de un mes.');
      if (!termsKnown) warnings.push('Falta plazo o interés del préstamo interno: no se puede completar la carga contractual de los titulares ante el banco.');
      if (repaymentMode === 'same-as-bank') warnings.push('Por elección expresa, la devolución de los hijos replica el interés y el plazo bancarios de la madre. Debe acordarse y documentarse; no acredita aprobación de la operación.');
      if (nonnegative(effectiveFamilyRate) > 0) warnings.push('Los intereses del préstamo familiar pueden tributar para la madre; ese IRPF no se calcula.');
    }
    return { mode, repaymentMode, amount: gross, giftTax: 0, notaryCost: 0, totalCosts: 0, allocations: rows,
      familyMonthlyRepayment, effectiveFamilyRate, effectiveFamilyYears, repaymentTermsAssumed,
      termsKnown, costsIncomplete: false, repayment, warnings };
  }
  const rows = allocations.map((allocation, index) => {
    const share = nonnegative(allocation.share);
    const ownershipAllowed = n(ownershipShares[index]) === 1 || coOwnerSpouseConfirmed === true;
    if (gross > 0 && allocation.giftReductionEligible && !ownershipAllowed) warnings.push(`Donatario ${index + 1}: la reducción por primera vivienda no se aplica a la compra de una mitad indivisa entre hermanos.`);
    const gift = calculateGiftTax(gross * share, {
      publicDeed: giftPublicDeed, preExistingWealth: allocation.preExistingWealth,
      reductionEligible: allocation.giftReductionEligible === true,
      reductionOwnershipAllowed: ownershipAllowed,
      reductionCap: allocation.disability65Confirmed ? 120000 : 60000,
      reductionAlreadyUsed: allocation.reductionAlreadyUsed,
    });
    return { ...allocation, share, ...gift, reductionOwnershipAllowed: ownershipAllowed };
  });
  const giftTax = sum(rows.map((row) => row.total));
  const notaryCost = gross > 0 ? nonnegative(giftNotaryCost) : 0;
  if (gross > 0) {
    warnings.push('Donación de dinero estimada con reglas de Cataluña para madre e hijos y sin donaciones previas acumulables: confirma residencia fiscal del donatario, parentesco, patrimonio y donaciones de los últimos tres años.');
    warnings.push(giftPublicDeed ? 'La tarifa reducida de donación exige escritura pública dentro del plazo legal; el notario tiene un coste adicional.' : 'Sin escritura pública se usa la tarifa general de donaciones.');
    warnings.push('Donación: el modelo 651 y su pago tienen, con carácter general, plazo de un mes desde la entrega. La donación no elimina la deuda bancaria de la madre.');
    if (rows.some((row) => row.reduction > 0)) warnings.push('Reducción por primera vivienda: confirma edad hasta 36 años o discapacidad, IRPF, propiedad íntegra o excepción legal, escritura en un mes con destino expreso, compra en seis meses y límites acumulados de todas las donaciones.');
  }
  return { mode, repaymentMode, amount: gross, giftTax, notaryCost, totalCosts: giftTax + notaryCost,
    allocations: rows, familyMonthlyRepayment: 0, termsKnown: true,
    effectiveFamilyRate: null, effectiveFamilyYears: null, repaymentTermsAssumed: false,
    costsIncomplete: gross > 0 && giftPublicDeed && notaryCost === 0, repayment: null, warnings };
}

export function validateScenario(input = {}) {
  const s = normalizeScenario(input);
  const errors = [...(s._structureErrors || [])];
  const warnings = [];
  const numeric = (value, label, min = 0, max = Infinity, allowMissing = false) => {
    if (allowMissing && (value == null || value === '')) return;
    if (!isNumericPrimitive(value) || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) errors.push(`${label}: indica un valor entre ${min} y ${max === Infinity ? 'un máximo válido' : max}.`);
  };
  const optionalText = (value, label) => { if (value != null && typeof value !== 'string') errors.push(`${label}: debe ser texto.`); };
  const optionalBoolean = (value, label) => { if (value !== undefined && typeof value !== 'boolean') errors.push(`${label}: debe ser verdadero o falso.`); };
  for (const [key, label] of [['name', 'Nombre de la vivienda'], ['url', 'Enlace de la vivienda'], ['notes', 'Notas de la vivienda'], ['id', 'Identificador de la vivienda']]) optionalText(s[key], label);
  optionalBoolean(s.familyLoan.enabled, 'Activación del préstamo de la madre');
  optionalBoolean(s.familyLoan.assumedTerms, 'Condiciones hipotéticas del préstamo de la madre');
  optionalBoolean(s.familyLoan.coverEarlyLiquidity, 'Cubrir la liquidez anterior a las arras con el préstamo');
  numeric(s.familyLoan.extraBuffer, 'Colchón adicional del préstamo de la madre');
  optionalBoolean(s.icf.enabled, 'Activación del ICF');
  optionalBoolean(s.cash.familyLoanAvailableBeforeDeposit, 'Disponibilidad del préstamo antes de las arras');
  optionalBoolean(s.stress.loseDiscounts, 'Pérdida de bonificaciones');
  optionalBoolean(s.motherTransfer.giftPublicDeed, 'Escritura de donación');
  optionalBoolean(s.motherTransfer.coOwnerSpouseConfirmed, 'Excepción de copropiedad entre cónyuges');
  optionalBoolean(s.budget.sharedLivingCosts, 'Gastos de vida compartidos entre alquiler y compra');
  optionalBoolean(s.budget.propertyCostsEstimated, 'Importes orientativos de la casa');
  optionalBoolean(s.budget.propertyCostsConfirmed, 'Recibos y cuotas de la casa comprobados');
  optionalBoolean(s.purchaseCosts.brokerQuotePending, 'Honorarios de agencia pendientes');
  if(s.budget.propertyCostsEstimated && s.budget.propertyCostsConfirmed)errors.push('Una provisión orientativa no puede figurar también como importe confirmado.');
  numeric(s.budget.ibiLiquidableBase, 'Base liquidable del IBI', 0, Infinity, true);
  numeric(s.budget.ibiRatePercent, 'Tipo municipal del IBI', 0, 100, true);
  numeric(s.purchasePrice, 'Precio de compra', 1);
  numeric(s.appraisalValue, 'Tasación', 0, Infinity, true);
  numeric(s.referenceValue, 'Valor de referencia', 0, Infinity, true);
  numeric(s.declaredValue, 'Valor declarado', 0, Infinity, true);
  numeric(s.mortgage.ltv, 'Porcentaje de financiación', 0, 1);
  numeric(s.mortgage.years, 'Plazo hipotecario Sabadell (máximo 30 años)', 1 / 12, 30);
  if (!Number.isInteger(n(s.mortgage.years) * 12)) errors.push('El plazo hipotecario debe ser un número entero de meses.');
  numeric(s.mortgage.baseRate, 'TIN hipotecario', 0, 30);
  numeric(s.mortgage.maxDiscountPoints, 'Bonificación hipotecaria máxima', 0, 30);
  numeric(s.mortgage.originationFeePercent, 'Comisión hipotecaria', 0, 100);
  numeric(s.mortgage.originationFeeFixed, 'Comisión hipotecaria fija');
  numeric(s.cash.savings, 'Ahorros');
  numeric(s.cash.preClosingLoanPayments, 'Cuotas de mamá antes de la firma', 0, 60);
  if(!Number.isInteger(n(s.cash.preClosingLoanPayments)))errors.push('Las cuotas anteriores a la firma deben ser un número entero.');
  numeric(s.cash.depositPercent, 'Arras', 0, 1);
  if (!['pending', 'offset-confirmed', 'no-release'].includes(s.cash.depositFundingMode)) errors.push('Selecciona si la financiación de las arras está pendiente, compensada o no se libera.');
  if (s.cash.depositAmount != null) numeric(s.cash.depositAmount, 'Importe arras', 0, nonnegative(s.purchasePrice));
  if (s.mortgage.amount != null) numeric(s.mortgage.amount, 'Capital hipotecario', 0, nonnegative(s.purchasePrice));
  if (n(s.mortgage.ltv) > 0.8) warnings.push('La financiación supera el 80% citado por el gestor: requiere otra aprobación expresa de Sabadell.');
  for (const key of COST_KEYS) numeric(s.purchaseCosts[key], `Gasto ${key}`);
  for (const key of VAT_COST_KEYS) {
    const quote = s.purchaseCosts.vat[key];
    if (!['total', 'net'].includes(quote.mode)) errors.push(`Selecciona importe final o sin IVA para ${key}.`);
    numeric(quote.rate, `Tipo de IVA ${key}`, 0, 25);
    numeric(quote.untaxed, `Parte sin recargo de IVA ${key}`, 0, quote.mode === 'net' ? nonnegative(s.purchaseCosts[key]) : Infinity);
  }
  if (!['itemized', 'provision'].includes(s.purchaseCosts.mode)) errors.push('Selecciona gastos de compra desglosados o provisión general.');
  numeric(s.purchaseCosts.provisionAmount, 'Provisión general de gastos de compra');
  numeric(s.purchaseCosts.provisionBeforeSigning, 'Parte de la provisión anterior a la firma', 0, nonnegative(s.purchaseCosts.provisionAmount));
  const buyers = Array.isArray(s.tax.buyers) ? s.tax.buyers : [];
  if (s.tax.mode === 'used') {
    if (!buyers.length || Math.abs(sum(buyers.map((b) => n(b.share))) - 1) > 0.000001) errors.push('Las cuotas de propiedad deben sumar el 100%.');
    buyers.forEach((buyer, index) => {
      numeric(buyer.share, `Propiedad comprador ${index + 1}`, 0, 1);
      numeric(buyer.rate, `ITP comprador ${index + 1}`, 0, 0.25, true);
      optionalText(buyer.label, `Nombre comprador ${index + 1}`);
      optionalBoolean(buyer.eligibilityConfirmed, `Requisitos fiscales comprador ${index + 1}`);
      optionalBoolean(buyer.eligibilityAssumed, `Hipótesis fiscal comprador ${index + 1}`);
      if (n(buyer.rate, 0.1) < 0.1 && buyer.eligibilityConfirmed !== true) warnings.push(buyer.eligibilityAssumed === true
        ? `Comprador ${index + 1}: tipo reducido simulado como hipótesis pendiente de documentación; no acredita el derecho fiscal.`
        : `Comprador ${index + 1}: confirma todos los requisitos fiscales antes de aplicar el tipo reducido.`);
    });
  }
  if (!['used', 'new'].includes(s.tax.mode)) errors.push('El tipo de compra debe ser used (segunda mano) o new (primera entrega).');
  numeric(s.tax.vatRate, 'IVA', 0, 0.25);
  numeric(s.tax.ajdRate, 'AJD', 0, 0.25);
  if (!Array.isArray(s.mortgage.discounts)) errors.push('Las bonificaciones deben ser una lista.');
  for (const discount of Array.isArray(s.mortgage.discounts) ? s.mortgage.discounts : []) {
    optionalText(discount.label, 'Nombre del producto bonificador');
    optionalText(discount.id, 'Identificador del producto bonificador');
    optionalBoolean(discount.enabled, 'Activación del producto bonificador');
    optionalBoolean(discount.quoteKnown, 'Prima confirmada del producto bonificador');
    const name = typeof discount.label === 'string' ? discount.label : typeof discount.id === 'string' ? discount.id : 'producto';
    numeric(discount.points, `Bonificación ${name}`, 0, 3, true);
    numeric(discount.cost, `Prima ${name}`, 0, Infinity, true);
    if (!FREQUENCIES.has(discount.frequency || 'annual')) errors.push(`Periodicidad no válida para ${name}.`);
    if (discount.frequency === 'upfront') numeric(discount.coverageYears ?? 5, 'Años cubiertos por prima única', 1 / 12, 50);
  }
  if (s.familyLoan.enabled) {
    numeric(s.familyLoan.amount, 'Préstamo de la madre', 0, 60000, true);
    numeric(s.familyLoan.maxAmount, 'Límite préstamo madre', 0, 60000);
    numeric(s.familyLoan.rate, 'TIN préstamo madre', 0, 100, true);
    numeric(s.familyLoan.years, 'Plazo préstamo madre', 1 / 12, 40, true);
    if (s.familyLoan.years != null && !Number.isInteger(n(s.familyLoan.years) * 12)) errors.push('El plazo del préstamo de la madre debe ser un número entero de meses.');
    numeric(s.familyLoan.originationFeePercent, 'Comisión préstamo madre', 0, 100);
    numeric(s.familyLoan.originationFeeFixed, 'Comisión fija préstamo madre');
    if (s.familyLoan.rate == null || s.familyLoan.years == null) warnings.push('Falta el TIN o plazo real del préstamo de la madre: la cuota y el presupuesto quedan incompletos.');
    if (s.familyLoan.assumedTerms) warnings.push('El interés y el plazo del préstamo de la madre son una hipótesis editable, pendiente de oferta y aprobación. La cuota calculada no es una financiación concedida.');
    if (n(s.familyLoan.amount) > n(s.familyLoan.maxAmount)) errors.push('El préstamo de la madre supera el límite introducido.');
    warnings.push('El origen de los fondos y la deuda familiar deben comunicarse al banco. Préstamo familiar y donación tienen trámites distintos.');
    if (!['family-loan', 'gift'].includes(s.motherTransfer.mode)) errors.push('Indica si la entrega de la madre es un préstamo familiar o una donación.');
    if (!['custom', 'same-as-bank'].includes(s.motherTransfer.repaymentMode)) errors.push('Selecciona calendario familiar propio o devolución igual a la cuota bancaria de la madre.');
    const allocations = s.motherTransfer.allocations;
    if (!allocations.length || Math.abs(sum(allocations.map((allocation) => n(allocation.share))) - 1) > 0.000001) errors.push('El reparto de la entrega a los hijos debe sumar el 100%.');
    allocations.forEach((allocation, index) => {
      numeric(allocation.share, `Reparto entre hijos ${index + 1}`, 0, 1);
      optionalText(allocation.label, `Nombre receptor ${index + 1}`);
    });
    if (s.motherTransfer.mode === 'family-loan') {
      numeric(s.motherTransfer.familyRate, 'Interés del préstamo entre madre e hijos', 0, 100, true);
      numeric(s.motherTransfer.familyYears, 'Plazo del préstamo entre madre e hijos', 1 / 12, 50, true);
      if (s.motherTransfer.familyYears != null && !Number.isInteger(n(s.motherTransfer.familyYears) * 12)) errors.push('El préstamo entre madre e hijos debe tener un número entero de meses.');
    } else {
      numeric(s.motherTransfer.giftNotaryCost, 'Notaría de la donación');
      allocations.forEach((allocation, index) => {
        numeric(allocation.share, `Porcentaje donación ${index + 1}`, 0, 1);
        numeric(allocation.preExistingWealth, `Patrimonio previo donatario ${index + 1}`);
        numeric(allocation.reductionAlreadyUsed, `Reducción previa donatario ${index + 1}`, 0, 120000, true);
        optionalBoolean(allocation.giftReductionEligible, `Requisitos reducción donatario ${index + 1}`);
        optionalBoolean(allocation.disability65Confirmed, `Discapacidad donatario ${index + 1}`);
      });
    }
  }
  if (s.icf.enabled) {
    numeric(s.icf.ltv, 'Porcentaje ICF', 0, 0.2);
    numeric(s.icf.maxAmount, 'Máximo ICF', 0, 50000);
    numeric(s.icf.repaymentYears, 'Plazo de devolución ICF', 1 / 12, 5);
    if (!s.icf.eligibilityConfirmed) warnings.push('ICF es una hipótesis pendiente de elegibilidad y resolución; no equivale a fondos concedidos.');
    if (n(s.mortgage.ltv) > 0.8) warnings.push('Revisa la compatibilidad del porcentaje bancario con ICF.');
    warnings.push('ICF incorpora obligaciones y protección oficial de la vivienda; consulta sus condiciones antes de comprometer arras.');
  }
  const monthlyKeys = ['existingDebtMonthly', 'familyIncomeMonthly', 'familyExistingDebtMonthly', 'utilitiesMonthly', 'carMonthly', 'foodMonthly', 'otherMonthly', 'storageMonthly', 'ibiAnnual', 'wasteAnnual', 'maintenanceAnnual', 'communityMonthly', 'externalHomeInsuranceAnnual', 'currentRent', 'currentUtilitiesMonthly', 'currentOtherMonthly'];
  for (const key of monthlyKeys) numeric(s.budget[key], `Presupuesto ${key}`, 0, Infinity, key === 'externalHomeInsuranceAnnual');
  numeric(s.budget.debtRatioLimit, 'Límite endeudamiento', 0.01, 1);
  if (!Array.isArray(s.budget.incomes)) errors.push('Los ingresos deben ser una lista.');
  if (s.budget.incomes.length > 2) errors.push('Solo hay dos titulares hipotecarios. Añade los ingresos de madre y hermana en sus perfiles de convivientes.');
  for (const [index, income] of (Array.isArray(s.budget.incomes) ? s.budget.incomes : []).entries()) {
    numeric(income.monthly, `Ingreso ${index + 1}`);
    numeric(income.payments ?? 12, `Pagas ingreso ${index + 1}`, 1, 24);
    if (income.id === 'mother' || income.id === 'sister') errors.push('Los ingresos de madre y hermana pertenecen al presupuesto del hogar y no al de titulares hipotecarios.');
  }
  for (const [index, income] of s.budget.householdIncomes.entries()) {
    numeric(income.monthly, `Ingreso conviviente ${index + 1}`);
    numeric(income.payments ?? 12, `Pagas conviviente ${index + 1}`, 1, 24);
    optionalText(income.id, `Identificador conviviente ${index + 1}`);
  }
  for (const breakdownKey of ['utilityBreakdown', 'currentUtilityBreakdown']) {
    for (const utilityKey of UTILITY_KEYS) numeric(s.budget[breakdownKey][utilityKey], `Suministros ${breakdownKey}.${utilityKey}`);
  }
  if (!['aggregate', 'detailed'].includes(s.budget.utilitiesMode)) errors.push('Selecciona suministros futuros como importe conjunto o desglose.');
  if (!['aggregate', 'detailed'].includes(s.budget.currentUtilitiesMode)) errors.push('Selecciona suministros actuales como importe conjunto o desglose.');
  numeric(s.stress.incomeDropPercent, 'Reducción de ingresos', 0, 100);
  numeric(s.stress.expenseIncreasePercent, 'Aumento de gastos', 0, 500);
  numeric(s.stress.unexpectedCost, 'Imprevisto');
  if (!['house', 'flat'].includes(s.propertyType)) errors.push('Selecciona casa o piso.');
  if (s.propertyType === 'house' && !s.budget.communityMonthly) warnings.push('Una casa puede pertenecer a una urbanización o entidad de conservación: confirma comunidad y cuotas antes de dar por hecho que son cero.');
  return { valid: errors.length === 0, errors, warnings };
}

function insuranceCost(discount) {
  const cost = nonnegative(discount.cost);
  const frequency = discount.frequency || 'annual';
  if (frequency === 'upfront') return { recurring: 0, upfront: cost, equivalent: cost / (nonnegative(discount.coverageYears || 5) * 12) };
  const recurring = frequency === 'monthly' ? cost : frequency === 'quarterly' ? cost / 3 : cost / 12;
  return { recurring, upfront: 0, equivalent: recurring };
}

function emptyLoan() {
  return { principal: 0, rate: 0, years: 0, months: 0, monthlyPayment: 0, totalInterest: 0, totalPaid: 0 };
}

export function calculateScenario(input = {}, { includeSchedule = false } = {}) {
  const s = normalizeScenario(input);
  const validation = validateScenario(s);
  if (!validation.valid) return { valid: false, validation, warnings: validation.warnings };
  const warnings = [...validation.warnings];
  const price = n(s.purchasePrice);
  const appraisal = nonnegative(s.appraisalValue) || price;
  if (!nonnegative(s.appraisalValue)) warnings.push('Falta tasación: se usa el precio como base provisional de financiación.');
  if (!nonnegative(s.referenceValue) && s.tax.mode === 'used') warnings.push('Falta valor de referencia catastral: el impuesto se estima con el mayor de precio y valor declarado; confírmalo antes de comprar.');
  const lendingBase = Math.min(price, appraisal);
  const depositAmount = s.cash.depositAmount == null ? price * n(s.cash.depositPercent) : n(s.cash.depositAmount);
  const priceStillDueToSeller = Math.max(0, price - depositAmount);
  const nominalMortgageFunding = s.mortgage.amount == null ? lendingBase * n(s.mortgage.ltv) : n(s.mortgage.amount);
  const nominalIcfFunding = s.icf.enabled ? Math.min(lendingBase * n(s.icf.ltv), n(s.icf.maxAmount), Math.max(0, price - nominalMortgageFunding)) : 0;
  const depositFundingMode = s.cash.depositFundingMode;
  // In the conservative case funds pay only the outstanding vendor balance.
  // Bank funds are allocated first; ICF is limited to what remains. This is an
  // explicit alternative disbursement assumption, never an approval claim.
  const principal = depositFundingMode === 'no-release' ? Math.min(nominalMortgageFunding, priceStillDueToSeller) : nominalMortgageFunding;
  const icfPrincipal = depositFundingMode === 'no-release' ? Math.min(nominalIcfFunding, Math.max(0, priceStillDueToSeller - principal)) : nominalIcfFunding;
  const nominalDepositReleaseAtRisk = Math.min(depositAmount, Math.max(0, nominalMortgageFunding + nominalIcfFunding - priceStillDueToSeller));
  const depositReleaseAtRisk = depositFundingMode === 'pending' ? nominalDepositReleaseAtRisk : 0;
  const depositReleasePending = depositReleaseAtRisk > 0.01;
  if (nominalMortgageFunding > lendingBase * n(s.mortgage.ltv) + 0.01) warnings.push('El capital manual supera la financiación por el porcentaje y la tasación introducidos.');
  const enabledDiscounts = s.mortgage.discounts.filter((d) => d.enabled);
  const points = Math.min(nonnegative(s.mortgage.maxDiscountPoints), sum(enabledDiscounts.map((d) => nonnegative(d.points))));
  const rate = Math.max(0, n(s.mortgage.baseRate) - points);
  const mortgage = { ...amortizeLoan(principal, rate, n(s.mortgage.years), { includeSchedule }), nominalPrincipal: nominalMortgageFunding, disbursementReducedByDeposit: nominalMortgageFunding - principal, lendingBase, ltv: price ? principal / price : 0, baseRate: n(s.mortgage.baseRate), discountPoints: points };
  const noBonusMortgage = amortizeLoan(principal, n(s.mortgage.baseRate), n(s.mortgage.years));
  const tax = calculateTransferTax({ purchasePrice: price, referenceValue: s.referenceValue, declaredValue: s.declaredValue, ...s.tax });
  warnings.push(...tax.warnings);
  const icf = { enabled: !!s.icf.enabled, principal: icfPrincipal, nominalPrincipal: nominalIcfFunding, disbursementReducedByDeposit: nominalIcfFunding - icfPrincipal, rate: 0, monthlyPaymentNow: 0, deferredMonthlyPayment: icfPrincipal / Math.max(1, n(s.icf.repaymentYears) * 12), repaymentYears: n(s.icf.repaymentYears), startsAfterMortgageYears: n(s.mortgage.years), eligibilityConfirmed: s.icf.eligibilityConfirmed === true, hypothetical: s.icf.enabled && s.icf.eligibilityConfirmed !== true };
  const products = enabledDiscounts.map((d) => ({ ...d, ...insuranceCost(d) }));
  const recurringInsuranceMonthly = sum(products.map((p) => p.recurring));
  const upfrontInsurance = sum(products.map((p) => p.upfront));
  const upfrontInsuranceMonthlyEquivalent = sum(products.filter((p) => p.frequency === 'upfront').map((p) => p.equivalent));
  const unquotedProducts = products.filter((p) => p.cost == null || p.quoteKnown === false);
  for (const product of products) {
    if (product.points == null) warnings.push(`${product.label || product.id}: bonificación sin desglose confirmado; no se resta del TIN.`);
  }
  if (unquotedProducts.length) warnings.push(`Faltan primas reales: ${unquotedProducts.map((p) => p.label || p.id).join(', ')}. Los totales conocidos son un mínimo.`);
  const bankHome = products.some((p) => p.id === 'home');
  const externalHomeMonthly = bankHome ? 0 : nonnegative(s.budget.externalHomeInsuranceAnnual) / 12;
  const homeQuoteMissing = !bankHome && s.budget.externalHomeInsuranceAnnual == null;
  if (homeQuoteMissing) warnings.push('Falta presupuesto del seguro de daños/hogar externo; la prima no está incluida.');
  if (bankHome && nonnegative(s.budget.externalHomeInsuranceAnnual)) warnings.push('Se ha elegido hogar Sabadell: no se suma también el seguro de hogar externo.');
  const cost = Object.fromEntries(COST_KEYS.map((key) => [key, nonnegative(s.purchaseCosts[key])]));
  const costVat = Object.fromEntries(VAT_COST_KEYS.map((key) => {
    const quote = s.purchaseCosts.vat[key];
    const inputAmount = cost[key];
    const untaxed = nonnegative(quote.untaxed);
    const taxableBase = quote.mode === 'net' ? Math.max(0, inputAmount - untaxed) : 0;
    const vatAdded = quote.mode === 'net' ? rounded(taxableBase * nonnegative(quote.rate) / 100) : 0;
    const total = inputAmount + vatAdded;
    cost[key] = total;
    return [key, { inputAmount, mode: quote.mode, rate: nonnegative(quote.rate), untaxed, taxableBase, vatAdded, total }];
  }));
  const mortgageOriginationFee = principal * nonnegative(s.mortgage.originationFeePercent) / 100 + nonnegative(s.mortgage.originationFeeFixed);
  const purchaseFeesItemized = sum(['appraisal', 'legal', 'notary', 'registry', 'agency', 'broker', 'other'].map((key) => cost[key]));
  const purchaseFeesMode = s.purchaseCosts.mode;
  const purchaseFeesEstimated = purchaseFeesMode === 'provision';
  const purchaseFeesVatAdded = purchaseFeesEstimated ? 0 : sum(['appraisal', 'legal', 'notary', 'registry', 'agency', 'broker'].map((key) => costVat[key].vatAdded));
  const purchaseFeesProvision = nonnegative(s.purchaseCosts.provisionAmount);
  const purchaseFees = purchaseFeesEstimated ? purchaseFeesProvision : purchaseFeesItemized;
  const prepaidPurchaseFees = purchaseFeesEstimated ? nonnegative(s.purchaseCosts.provisionBeforeSigning) : cost.appraisal + cost.legal;
  const beforeMortgageBaseRequired = depositAmount + prepaidPurchaseFees;
  const priceContribution = price - principal - icfPrincipal;
  const familyExtraBuffer = s.familyLoan.enabled ? nonnegative(s.familyLoan.extraBuffer) : 0;
  const totalReserve = cost.reserve + familyExtraBuffer;
  const beforeFamilyLoanRequired = priceContribution + tax.total + purchaseFees + mortgageOriginationFee + upfrontInsurance + cost.renovations + cost.moving + totalReserve;
  const savings = nonnegative(s.cash.savings);
  const loanFeeRate = nonnegative(s.familyLoan.originationFeePercent) / 100;
  const loanFeeFixed = nonnegative(s.familyLoan.originationFeeFixed);
  const loanMax = Math.min(60000, nonnegative(s.familyLoan.maxAmount));
  const transferForAmount = (amount) => calculateMotherTransfer({ ...s.motherTransfer, amount,
    ownershipShares: (s.tax.buyers || []).map((buyer) => buyer.share),
    bankLoanRate: s.familyLoan.rate, bankLoanYears: s.familyLoan.years,
    bankLoanTermsAssumed: s.familyLoan.assumedTerms,
  });
  const loanFeeForAmount = (amount) => amount > 0 ? amount * loanFeeRate + loanFeeFixed : 0;
  // Donation tax depends on the donated amount. Solve the minimum gross bank
  // loan that covers both acquisition and its tax/fees. Bisection is bounded
  // and deterministic; if 60k is insufficient, use the cap and show the gap.
  const finalFundingBalance = (amount) => savings + amount - beforeFamilyLoanRequired
    - loanFeeForAmount(amount) - transferForAmount(amount).totalCosts;
  const coversEarlyLiquidity = s.familyLoan.enabled && s.familyLoan.coverEarlyLiquidity && s.cash.familyLoanAvailableBeforeDeposit;
  const earlyFundingBalance = (amount) => savings + amount - beforeMortgageBaseRequired
    - loanFeeForAmount(amount) - transferForAmount(amount).totalCosts;
  const fundingBalance = (amount) => coversEarlyLiquidity
    ? Math.min(finalFundingBalance(amount), earlyFundingBalance(amount)) : finalFundingBalance(amount);
  let autoLoan = 0;
  if (s.familyLoan.enabled && fundingBalance(0) < 0) {
    if (fundingBalance(loanMax) < 0) autoLoan = loanMax;
    else {
      let low = 0;
      let high = loanMax;
      for (let step = 0; step < 80; step += 1) {
        const middle = (low + high) / 2;
        if (fundingBalance(middle) >= 0) high = middle;
        else low = middle;
      }
      autoLoan = Math.min(loanMax, Math.ceil((high - 1e-8) * 100) / 100);
    }
  }
  const familyPrincipal = s.familyLoan.enabled ? Math.min(s.familyLoan.amount == null ? autoLoan : nonnegative(s.familyLoan.amount), loanMax) : 0;
  const familyLoanFee = s.familyLoan.enabled ? loanFeeForAmount(familyPrincipal) : 0;
  const motherTransfer = transferForAmount(familyPrincipal);
  warnings.push(...motherTransfer.warnings);
  const familyTermsKnown = !s.familyLoan.enabled || (s.familyLoan.rate != null && s.familyLoan.years != null);
  const assumedLoanTerms = s.familyLoan.enabled && s.familyLoan.assumedTerms === true;
  const familyLoan = s.familyLoan.enabled && familyTermsKnown
    ? { ...amortizeLoan(familyPrincipal, n(s.familyLoan.rate), n(s.familyLoan.years), { includeSchedule }), fee: familyLoanFee, termsKnown: true, termsAssumed: assumedLoanTerms, extraBuffer: familyExtraBuffer }
    : { ...emptyLoan(), principal: familyPrincipal, monthlyPayment: s.familyLoan.enabled ? null : 0, totalInterest: s.familyLoan.enabled ? null : 0, totalPaid: s.familyLoan.enabled ? null : 0, fee: familyLoanFee, termsKnown: familyTermsKnown, termsAssumed: assumedLoanTerms, extraBuffer: familyExtraBuffer };
  const totalRequired = beforeFamilyLoanRequired + familyLoanFee + motherTransfer.totalCosts;
  const availableFunds = savings + familyPrincipal;
  const earlyLoanFee = s.cash.familyLoanAvailableBeforeDeposit ? familyLoanFee : 0;
  const earlyTransferCosts = s.cash.familyLoanAvailableBeforeDeposit ? motherTransfer.totalCosts : 0;
  const beforeMortgageRequired = beforeMortgageBaseRequired + earlyLoanFee + earlyTransferCosts;
  const beforeMortgageAvailable = savings + (s.cash.familyLoanAvailableBeforeDeposit ? familyPrincipal : 0);
  const closingCosts = tax.total + purchaseFees - prepaidPurchaseFees + mortgageOriginationFee + upfrontInsurance + familyLoanFee - earlyLoanFee + motherTransfer.totalCosts - earlyTransferCosts;
  const closingNetPayment = price - depositAmount - principal - icfPrincipal + closingCosts;
  const fundingGap = Math.max(0, totalRequired - availableFunds);
  const beforeMortgageGap = Math.max(0, beforeMortgageRequired - beforeMortgageAvailable);
  const earlyLiquidityExtraBorrowing = coversEarlyLiquidity && s.familyLoan.enabled && s.familyLoan.amount == null
    ? Math.min(familyPrincipal, Math.max(0, availableFunds - totalRequired)) : 0;
  const insuranceFirstPaymentEstimate = sum(products.filter((p) => p.frequency !== 'upfront').map((p) => nonnegative(p.cost)))
    + (bankHome ? 0 : nonnegative(s.budget.externalHomeInsuranceAnnual));
  const financing = {
    purchasePrice: price, lendingBase,
    bankMortgage: principal, bankShareOfPrice: principal / price,
    icf: icfPrincipal, icfShareOfPrice: icfPrincipal / price,
    totalPriceFunding: principal + icfPrincipal, uncoveredPurchasePrice: priceContribution,
    icfHypothetical: icf.hypothetical,
    nominalBankMortgage: nominalMortgageFunding, nominalIcf: nominalIcfFunding,
    priceStillDueToSeller, depositFundingMode,
  };
  const motherFundingNeed = {
    uncoveredPurchasePrice: priceContribution, purchaseTax: tax.total, purchaseFees,
    mortgageFees: mortgageOriginationFee, upfrontInsurance, renovations: cost.renovations, moving: cost.moving,
    purchaseReserve: cost.reserve, extraBuffer: familyExtraBuffer,
    bankLoanFee: familyLoanFee, giftTax: motherTransfer.giftTax, giftNotaryCost: motherTransfer.notaryCost,
    grossBeforeSavings: totalRequired, savingsUsed: Math.min(savings, totalRequired),
    netAfterSavings: Math.max(0, totalRequired - savings), borrowed: familyPrincipal, fundingGap,
    earlyLiquidityExtraBorrowing,
  };
  const cash = {
    totalRequired, availableFunds, savings, fundingGap, surplus: Math.max(0, availableFunds - totalRequired),
    priceContribution, tax: tax.total, purchaseFees, mortgageOriginationFee, upfrontInsurance, familyLoanFee,
    purchaseFeesMode, purchaseFeesEstimated, purchaseFeesItemized, purchaseFeesProvision, prepaidPurchaseFees,
    costVat, purchaseFeesVatAdded,
    serviceVatAdded: purchaseFeesVatAdded + costVat.renovations.vatAdded + costVat.moving.vatAdded,
    motherTransferTax: motherTransfer.giftTax, motherTransferCosts: motherTransfer.totalCosts, giftNotaryCost: motherTransfer.notaryCost,
    renovations: cost.renovations, moving: cost.moving, reserve: cost.reserve, familyExtraBuffer, totalReserve, depositAmount,
    beforeMortgageRequired, beforeMortgageAvailable, beforeMortgageGap, closingNetPayment,
    purchasePrice: price, mortgageFunding: principal, icfFunding: icfPrincipal, debtFunding: familyPrincipal,
    totalAcquisitionCost: price + tax.total + purchaseFees + mortgageOriginationFee + upfrontInsurance + familyLoanFee + motherTransfer.totalCosts + cost.renovations + cost.moving,
    insuranceFirstPaymentEstimate,
    priceFinancing: financing, motherFundingNeed,
    potentialClosingSurplus: Math.max(0, -closingNetPayment),
    fundingTimingRequiresConfirmation: s.icf.enabled || closingNetPayment < 0,
    earlyLiquidityExtraBorrowing, coversEarlyLiquidity,
    depositFundingMode, depositReleaseAtRisk, depositReleasePending, nominalDepositReleaseAtRisk,
    nominalMortgageFunding, nominalIcfFunding, priceStillDueToSeller,
  };
  if (fundingGap > 0.01) warnings.push(`Faltan ${rounded(fundingGap).toFixed(2)} € para cubrir la compra y el colchón previsto.`);
  if (beforeMortgageGap > 0.01) warnings.push(`Antes de firmar la hipoteca faltan ${rounded(beforeMortgageGap).toFixed(2)} € para arras, tasación y asesoramiento.`);
  if (depositReleasePending) warnings.push(`La caja depende de confirmar cómo se liberan o compensan ${rounded(depositReleaseAtRisk).toFixed(2)} € de arras ya pagadas. La suficiencia nominal del préstamo no garantiza liquidez para impuestos, gastos y colchón.`);
  if (depositFundingMode === 'no-release' && nominalDepositReleaseAtRisk > 0.01) warnings.push('Hipótesis de menor financiación: se mantiene primero la hipoteca y se reduce el ICF hasta el saldo pendiente al vendedor. Es una decisión del simulador, no una regla acreditada del ICF ni una consecuencia automática de pagar arras. No representa su pérdida. Confirma los capitales realmente concedidos.');
  if (s.familyLoan.coverEarlyLiquidity && !s.cash.familyLoanAvailableBeforeDeposit) warnings.push('El préstamo no está marcado como disponible antes de las arras: no se usa para cubrir esa fase y la falta de liquidez sigue visible.');
  if (earlyLiquidityExtraBorrowing > 0.01) warnings.push('El préstamo automático incorpora liquidez adicional para anticipar las arras. No es un gasto de compra adicional ni garantiza recuperar ese anticipo: hay que confirmar la liquidación y los desembolsos de banco e ICF.');
  if (purchaseFeesEstimated) warnings.push('Se usan gastos de compra orientativos como importe final previsto: falta confirmar si la estimación del gestor cubre IVA y todos los servicios. La provisión no es un máximo ni incluye ITP/IVA de la vivienda, reformas, reservas o seguros. Confirma presupuestos y qué parte debe pagarse antes de firmar.');
  if (purchaseFeesEstimated && purchaseFeesItemized > 0) warnings.push('Se conserva el desglose de gastos de compra como referencia, pero solo se suma la provisión general seleccionada.');
  if (s.purchaseCosts.brokerQuotePending) warnings.push('Falta el presupuesto final de honorarios de agencia, con su IVA cuando corresponda. No se presume cubierto por la provisión de gastos ni gratuito; el dinero inicial puede aumentar.');
  if (s.icf.enabled && priceContribution > 0.01) warnings.push('El ICF estimado no cubre toda la aportación al precio por su límite o por la tasación. La parte no financiada sigue incluida en la necesidad de caja.');
  if (closingNetPayment < 0) warnings.push('La liquidación de firma muestra un saldo teórico a favor. No presupone que el banco o el ICF reintegren las arras; confirma importes, destinatarios y fechas de desembolso antes de comprometerlas.');
  if (totalReserve === 0) warnings.push('No se ha reservado colchón de emergencia.');
  if (insuranceFirstPaymentEstimate > 0) warnings.push(`Las primas recurrentes se provisionan mensualmente. Confirma cuándo se cobran: una primera prima puede exigir hasta ${rounded(insuranceFirstPaymentEstimate).toFixed(2)} € adicionales de liquidez al inicio; no está sumada a los costes de adquisición.`);
  if (s.cash.depositPercent > 0 || depositAmount > 0) warnings.push('Las arras se descuentan del precio. Confirma financiación y condiciones de devolución antes de firmarlas.');
  if (cost.notary || cost.registry || cost.agency) warnings.push('Notaría, registro y gestoría introducidos deben corresponder a la compraventa. Los gastos de constitución de la hipoteca que paga el banco no se añaden.');
  const regularIncome = sum(s.budget.incomes.map((income) => nonnegative(income.monthly)));
  const averagedIncome = sum(s.budget.incomes.map((income) => nonnegative(income.monthly) * n(income.payments, 12) / 12));
  // Only the two borrowers' incomes above are used for the bank's ratio.
  // Other residents improve the household budget, never mortgage qualification.
  const householdRegularIncome = sum(s.budget.householdIncomes.map((income) => nonnegative(income.monthly)));
  const householdAveragedIncome = sum(s.budget.householdIncomes.map((income) => nonnegative(income.monthly) * n(income.payments, 12) / 12));
  const householdIncomeRows = s.budget.householdIncomes.map((income) => ({
    id: income.id, monthly: nonnegative(income.monthly), payments: n(income.payments, 12),
    averagedMonthly: nonnegative(income.monthly) * n(income.payments, 12) / 12,
    extraPaysAnnual: nonnegative(income.monthly) * (n(income.payments, 12) - 12),
  }));
  // Legacy contribution is preserved once as additional money with 12 payments.
  // No automatic copy into mother/sister rows: that would double count imports.
  const familyIncome = nonnegative(s.budget.familyIncomeMonthly);
  const actualRegularIncome = regularIncome + householdRegularIncome + familyIncome;
  const actualAveragedIncome = averagedIncome + householdAveragedIncome + familyIncome;
  const annualHomeCostsMonthly = (nonnegative(s.budget.ibiAnnual) + nonnegative(s.budget.wasteAnnual) + nonnegative(s.budget.maintenanceAnnual)) / 12;
  const propertyOverheadMonthly = annualHomeCostsMonthly + nonnegative(s.budget.communityMonthly) + recurringInsuranceMonthly + externalHomeMonthly;
  const utilityBreakdown = Object.fromEntries(UTILITY_KEYS.map((key) => [key, nonnegative(s.budget.utilityBreakdown[key])]));
  const currentUtilityBreakdown = Object.fromEntries(UTILITY_KEYS.map((key) => [key, nonnegative(s.budget.currentUtilityBreakdown[key])]));
  const utilitiesUnitemizedMonthly = nonnegative(s.budget.utilitiesMonthly);
  const currentUtilitiesUnitemizedMonthly = nonnegative(s.budget.currentUtilitiesMonthly);
  const utilitiesDetailedMonthly = sum(Object.values(utilityBreakdown));
  const currentUtilitiesDetailedMonthly = sum(Object.values(currentUtilityBreakdown));
  const utilityMode = s.budget.utilitiesMode;
  const currentUtilityMode = s.budget.currentUtilitiesMode;
  const utilitiesMonthly = utilityMode === 'aggregate' ? utilitiesUnitemizedMonthly : utilitiesDetailedMonthly;
  const currentUtilitiesIndependentMonthly = currentUtilityMode === 'aggregate' ? currentUtilitiesUnitemizedMonthly : currentUtilitiesDetailedMonthly;
  const sharedLivingCosts = s.budget.sharedLivingCosts;
  const currentUtilitiesMonthly = sharedLivingCosts ? utilitiesMonthly : currentUtilitiesIndependentMonthly;
  if (utilitiesUnitemizedMonthly > 0 && utilitiesDetailedMonthly > 0) warnings.push(`Se conservan un importe conjunto y un desglose de suministros futuros: solo se cuenta ${utilityMode === 'aggregate' ? 'el importe conjunto' : 'el desglose'}.`);
  if (currentUtilitiesUnitemizedMonthly > 0 && currentUtilitiesDetailedMonthly > 0 && !sharedLivingCosts) warnings.push(`Se conservan un importe conjunto y un desglose de suministros actuales: solo se cuenta ${currentUtilityMode === 'aggregate' ? 'el importe conjunto' : 'el desglose'}.`);
  if (sharedLivingCosts && (currentUtilitiesUnitemizedMonthly > 0 || currentUtilitiesDetailedMonthly > 0) && Math.abs(currentUtilitiesIndependentMonthly - utilitiesMonthly) > 0.005) warnings.push('Se usan los mismos suministros en alquiler y compra. Los importes actuales anteriores, distintos, se conservan como referencia y no se suman.');
  const storageMonthly = nonnegative(s.budget.storageMonthly);
  const householdMonthly = nonnegative(s.budget.carMonthly) + nonnegative(s.budget.foodMonthly) + nonnegative(s.budget.otherMonthly) + storageMonthly;
  const knownFamilyPayment = nonnegative(familyLoan.monthlyPayment);
  const existingDebt = nonnegative(s.budget.existingDebtMonthly);
  const familyExistingDebt = nonnegative(s.budget.familyExistingDebtMonthly);
  const mortgageOnly = mortgage.monthlyPayment;
  const homeMonthly = mortgageOnly + propertyOverheadMonthly + utilitiesMonthly;
  const internalRepayment = nonnegative(motherTransfer.familyMonthlyRepayment);
  const borrowerDebtMonthly = mortgageOnly + existingDebt + internalRepayment;
  const totalDebtMonthly = mortgageOnly + existingDebt + knownFamilyPayment + familyExistingDebt;
  const totalMonthly = homeMonthly + knownFamilyPayment + existingDebt + familyExistingDebt + householdMonthly;
  const debtRatio = regularIncome > 0 ? borrowerDebtMonthly / regularIncome : null;
  const familyDebtRatio = actualRegularIncome > 0 ? totalDebtMonthly / actualRegularIncome : null;
  const currentRent = nonnegative(s.budget.currentRent);
  const currentComparable = currentRent + currentUtilitiesMonthly + existingDebt + familyExistingDebt + householdMonthly + nonnegative(s.budget.currentOtherMonthly);
  const missingEstimates = [
    ...(purchaseFeesEstimated ? ['Provisión de gastos de compra sin presupuestos individuales'] : []),
    ...(s.purchaseCosts.brokerQuotePending ? ['Honorarios de agencia sin presupuesto final'] : []),
    ...(purchaseFees === 0 ? ['Gastos de compraventa y tasación'] : []),
    ...(!s.budget.propertyCostsConfirmed ? ['IBI, residuos y comunidad / conservación sin comprobar'] : []),
    ...(nonnegative(s.budget.maintenanceAnnual) === 0 ? ['Mantenimiento de la casa'] : []),
    ...(nonnegative(s.budget.foodMonthly) === 0 ? ['Alimentación'] : []),
    ...(utilitiesMonthly === 0 ? ['Suministros'] : []),
    ...(motherTransfer.costsIncomplete ? ['Notaría de la donación'] : []),
  ];
  if (missingEstimates.length) warnings.push(`Hay partidas pendientes de completar o comprobar: ${missingEstimates.join(', ')}.`);
  if(s.budget.propertyCostsEstimated)warnings.push('Se incluyen importes orientativos de IBI, residuos o comunidad: son una provisión de presupuesto, no un máximo. Sustitúyelos por los recibos y comprueba también posibles derramas.');
  const incomplete = !familyTermsKnown || !motherTransfer.termsKnown || motherTransfer.costsIncomplete || unquotedProducts.length > 0 || homeQuoteMissing || actualRegularIncome === 0 || missingEstimates.length > 0;
  const budget = {
    regularIncome, averagedIncome, familyIncomeMonthly: familyIncome,
    householdRegularIncome, householdAveragedIncome, householdIncomeRows,
    actualRegularIncome, actualAveragedIncome, extraPaysAnnual: (actualAveragedIncome - actualRegularIncome) * 12,
    borrowerExtraPaysAnnual: (averagedIncome - regularIncome) * 12,
    householdExtraPaysAnnual: (householdAveragedIncome - householdRegularIncome) * 12,
    mortgageOnly, homeMonthly, propertyOverheadMonthly, annualHomeCostsMonthly,
    insuranceMonthly: recurringInsuranceMonthly + externalHomeMonthly,
    upfrontInsuranceMonthlyEquivalent, utilitiesMonthly, householdMonthly,
    storageMonthly, sharedLivingCosts, currentUtilitiesIndependentMonthly,
    propertyCostsEstimated:s.budget.propertyCostsEstimated, propertyCostsConfirmed:s.budget.propertyCostsConfirmed,
    purchaseFeesEstimated,
    utilityBreakdown, utilitiesUnitemizedMonthly, currentUtilitiesMonthly,
    currentUtilityBreakdown, currentUtilitiesUnitemizedMonthly,
    utilityMode, currentUtilityMode, utilitiesMode: utilityMode, currentUtilitiesMode: currentUtilityMode,
    utilitiesAggregateMonthly: utilitiesUnitemizedMonthly, currentUtilitiesAggregateMonthly: currentUtilitiesUnitemizedMonthly,
    utilitiesDetailedMonthly, currentUtilitiesDetailedMonthly,
    existingDebtMonthly: existingDebt, familyExistingDebtMonthly: familyExistingDebt,
    familyLoanMonthly: familyLoan.monthlyPayment, totalDebtMonthly, totalMonthly,
    assumedLoanTerms,
    borrowerFamilyRepaymentMonthly: motherTransfer.familyMonthlyRepayment, borrowerDebtMonthly,
    borrowerDebtRatioIncomplete: !motherTransfer.termsKnown,
    motherBankLoanMonthly: familyLoan.monthlyPayment,
    motherNetExternalCostMonthly: familyTermsKnown && motherTransfer.termsKnown ? knownFamilyPayment - internalRepayment : null,
    remainingRegular: actualRegularIncome - totalMonthly, remainingAveraged: actualAveragedIncome - totalMonthly,
    currentRemainingRegular: actualRegularIncome - currentComparable,
    currentRemainingAveraged: actualAveragedIncome - currentComparable,
    debtRatio, familyDebtRatio, debtRatioLimit: n(s.budget.debtRatioLimit),
    maximumMortgageByRatio: Math.max(0, regularIncome * n(s.budget.debtRatioLimit) - existingDebt - internalRepayment),
    currentRent, currentComparable, comparisonToRent: homeMonthly - currentRent,
    mortgageComparedToRent: mortgageOnly - currentRent,
    allInDifference: totalMonthly - currentComparable,
    incomplete, missingEstimates, missingQuotes: [...unquotedProducts.map((p) => p.label || p.id), ...(homeQuoteMissing ? ['Seguro de hogar externo'] : []), ...(!familyTermsKnown ? ['Condiciones préstamo madre'] : []), ...(!motherTransfer.termsKnown ? ['Calendario préstamo entre madre e hijos'] : [])],
  };
  const preclosing=calculatePreclosing(s,{budget,familyLoan,cash},amortizeLoan);
  if(preclosing.additionalCashToKeepBuffer>.01)warnings.push('La espera antes de firmar consumiría dinero reservado para la compra o el colchón. Revisa el presupuesto de alquiler más el préstamo de mamá; ese déficit no aumenta automáticamente el préstamo calculado.');
  if(preclosing.preclosingLiquidityGap>.01)warnings.push('Después de las arras y pagos previos falta efectivo para la espera. Un excedente previsto al firmar no puede pagar recibos anteriores.');
  if(!preclosing.timingConsistent)warnings.push('El calendario indica cuotas de mamá antes de la firma, pero el préstamo no figura disponible antes de las arras. Revisa fechas de disposición y pagos.');
  if (actualRegularIncome === 0) warnings.push('Añade ingresos netos para valorar el presupuesto y el endeudamiento.');
  if (debtRatio != null && debtRatio > n(s.budget.debtRatioLimit)) warnings.push('La hipoteca y las deudas de los titulares superan el límite orientativo de endeudamiento elegido.');
  if (s.familyLoan.enabled && familyIncome + householdRegularIncome === 0) warnings.push('El préstamo de la madre se incluye como salida de caja familiar; no se presupone capacidad de pago ni aprobación de la madre.');
  if (familyPrincipal > 0) warnings.push('El presupuesto familiar suma una sola vez la cuota bancaria de la madre. Las devoluciones entre hijos y madre son transferencias internas; su cuota contractual sí afecta al ratio de los titulares.');
  const bonuses = {
    products,
    monthlyMortgageSaving: noBonusMortgage.monthlyPayment - mortgageOnly,
    monthlyProductCost: recurringInsuranceMonthly + upfrontInsuranceMonthlyEquivalent,
    // A premium paid before signing is never charged a second time each month.
    netMonthlyEquivalentSaving: noBonusMortgage.monthlyPayment - mortgageOnly - recurringInsuranceMonthly - upfrontInsuranceMonthlyEquivalent,
    noBonusMortgage, missingDiscountBreakdown: products.some((p) => p.points == null),
  };
  const stressMortgage = s.stress.loseDiscounts ? noBonusMortgage.monthlyPayment : mortgageOnly;
  const stressIncome = actualRegularIncome * (1 - n(s.stress.incomeDropPercent) / 100);
  const nonDebtExpenses = Math.max(0, totalMonthly - totalDebtMonthly);
  const stressExpenses = stressMortgage + existingDebt + knownFamilyPayment + familyExistingDebt + nonDebtExpenses * (1 + n(s.stress.expenseIncreasePercent) / 100);
  const stress = {
    regularIncome: stressIncome, totalMonthly: stressExpenses,
    remainingRegular: stressIncome - stressExpenses,
    mortgageMonthly: stressMortgage, incomeDropPercent: n(s.stress.incomeDropPercent),
    expenseIncreasePercent: n(s.stress.expenseIncreasePercent), losesDiscounts: !!s.stress.loseDiscounts,
    unexpectedCost: n(s.stress.unexpectedCost), reserveAfterUnexpectedCost: totalReserve - n(s.stress.unexpectedCost),
    incomplete,
  };
  const timeline = [
    ...(preclosing.requestedInstallments>0?[{id:'waiting',label:'Mientras esperáis la firma',cashOut:preclosing.monthlyOutflow,cashIn:actualRegularIncome,balance:preclosing.monthlyRemaining,note:'Alquiler y gastos actuales más una cuota de mamá; todavía sin hipoteca. Las cuotas ya pertenecen al plazo original del préstamo.'}]:[]),
    { id: 'before', label: 'Antes de la hipoteca', cashOut: beforeMortgageRequired, cashIn: beforeMortgageAvailable, balance: beforeMortgageAvailable - beforeMortgageRequired, note: 'Arras, tasación y asesoramiento; la hipoteca todavía no se desembolsa.' },
    { id: 'signing', label: 'Firma', cashOut: price - depositAmount + closingCosts, cashIn: principal + icfPrincipal + (s.cash.familyLoanAvailableBeforeDeposit ? 0 : familyPrincipal), balance: preclosing.deficit==null?null:savings + familyPrincipal - beforeMortgageRequired - closingNetPayment - preclosing.deficit, note: 'El precio pendiente ya descuenta las arras. Liquidación teórica: fondos ICF, destinatarios y eventual devolución de anticipos sujetos a resolución y desembolsos confirmados.' },
    { id: 'after', label: 'Después de la firma', cashOut: cost.renovations + cost.moving, cashIn: 0, balance: preclosing.deficit==null?null:availableFunds - totalRequired + totalReserve - preclosing.deficit, note: 'Reformas y mudanza previstas. Las reservas no son gastos; revisa aparte si la espera consume parte del colchón.' },
    { id: 'monthly', label: 'Cada mes', cashOut: totalMonthly, cashIn: actualRegularIncome, balance: budget.remainingRegular, note: 'Primas anuales, IBI y mantenimiento se reparten entre 12 como provisión; sus fechas reales de cobro pueden variar.' },
    ...(icfPrincipal ? [{ id: 'icf', label: 'Después de pagar la hipoteca', cashOut: icf.deferredMonthlyPayment, cashIn: 0, balance: null, note: `ICF: devolución sin intereses durante ${icf.repaymentYears} años, según resolución y contrato.` }] : []),
  ];
  const lifetime = {
    mortgagePrincipal: principal, mortgageInterest: mortgage.totalInterest,
    mortgageTotal: mortgage.totalPaid, familyPrincipal, familyInterest: familyLoan.totalInterest,
    familyTotal: familyLoan.totalPaid, icfPrincipal,
    totalDebtPrincipal: principal + familyPrincipal + icfPrincipal,
    knownDebtInterest: mortgage.totalInterest + nonnegative(familyLoan.totalInterest),
    acquisitionAndKnownInterest: cash.totalAcquisitionCost + mortgage.totalInterest + nonnegative(familyLoan.totalInterest),
    // Future annual premiums, bills and repairs cannot be guaranteed for 30 years.
    futureOperatingCostsIncluded: false, incomplete: !familyTermsKnown || !motherTransfer.termsKnown,
    internalFamilyLoanPrincipal: motherTransfer.mode === 'family-loan' ? familyPrincipal : 0,
    internalFamilyLoanInterest: motherTransfer.repayment?.totalInterest ?? (motherTransfer.termsKnown ? 0 : null),
    internalFamilyLoanExcludedFromConsolidatedDebt: true,
  };
  return { valid: true, validation, warnings: [...new Set(warnings)], tax, mortgage, familyLoan, motherTransfer, icf, financing, cash, budget, preclosing, stress, bonuses, timeline, lifetime };
}

/** Explicit hypothetical comparison; never changes the saved scenario or
 * silently enables ICF. Rates come from the entered bank loan, or 5% as a
 * labelled assumption when unknown. Every alternative still needs approval.
 */
export function compareFamilyLoanTerms(input = {}, yearsOptions = [10, 15, 20]) {
  if (!Array.isArray(yearsOptions)) return [];
  const scenario = normalizeScenario(input);
  const rate = n(scenario.familyLoan.rate, 5);
  return yearsOptions.map((years) => {
    const result = calculateScenario({ ...scenario, familyLoan: {
      ...scenario.familyLoan, enabled: true, years, rate, assumedTerms: true,
    } });
    return {
      years, rate, valid: result.valid, approvalRequired: true, termsAssumed: true,
      principal: result.familyLoan?.principal ?? null,
      monthlyPayment: result.familyLoan?.monthlyPayment ?? null,
      totalInterest: result.familyLoan?.totalInterest ?? null,
      totalPaid: result.familyLoan?.totalPaid ?? null,
      familyMonthlyRepayment: result.motherTransfer?.familyMonthlyRepayment ?? null,
      repaymentMode: scenario.motherTransfer.repaymentMode,
      borrowerDebtRatio: result.budget?.debtRatio ?? null,
      borrowerDebtRatioIncomplete: result.budget?.borrowerDebtRatioIncomplete ?? true,
      familyDebtRatio: result.budget?.familyDebtRatio ?? null,
      totalMonthly: result.budget?.totalMonthly ?? null,
      remainingRegular: result.budget?.remainingRegular ?? null,
      fundingGap: result.cash?.fundingGap ?? null,
      affordability: getAffordability(scenario, result),
      errors: result.validation.errors, warnings: result.warnings, result,
    };
  });
}

/** Numeric planning conditions, not bank approval. The optional precomputed
 * result keeps renderers from recalculating the same scenario several times.
 */
export function getAffordability(input = {}, calculatedResult = null) {
  const r = calculatedResult || calculateScenario(input);
  const empty = {
    valid: false, withinDebtLimit: null, maximumMotherMonthly: null, capacityBeforeMother: null,
    debtRatio: null, minimumKnownDebtRatio: null, debtRatioLimit: null,
    cashFundingGap: null, earlyCashGap: null, householdRemaining: null,
    incomplete: true, provisional: true, noApproval: true, approvalRequired: true,
    meetsKnownLimits: false, blockedReasons: ['invalid-input'],
    errors: r.validation?.errors || ['No se puede calcular este escenario.'],
  };
  if (!r.valid) return empty;
  const b = r.budget;
  const incomeKnown = b.regularIncome > 0;
  const debtKnown = incomeKnown && !b.borrowerDebtRatioIncomplete;
  const capacityBeforeMother = incomeKnown ? b.regularIncome * b.debtRatioLimit - b.existingDebtMonthly - r.mortgage.monthlyPayment : null;
  const withinDebtLimit = debtKnown ? b.debtRatio <= b.debtRatioLimit + 1e-10 : null;
  const householdRemaining = b.actualRegularIncome > 0 && r.familyLoan.termsKnown ? b.remainingRegular : null;
  const blockedReasons = [];
  if (!incomeKnown) blockedReasons.push('missing-borrower-income');
  if (incomeKnown && !debtKnown) blockedReasons.push('unknown-family-repayment');
  if (withinDebtLimit === false) blockedReasons.push('debt-limit');
  if (r.cash.fundingGap > 0.01) blockedReasons.push('purchase-cash-gap');
  if (r.cash.beforeMortgageGap > 0.01) blockedReasons.push('early-cash-gap');
  if (householdRemaining == null) blockedReasons.push('unknown-household-margin');
  else if (householdRemaining < -0.01) blockedReasons.push('negative-household-margin');
  if(r.preclosing.additionalCashToKeepBuffer>.01)blockedReasons.push('preclosing-buffer-shortfall');
  if(r.preclosing.requestedInstallments>0&&r.preclosing.additionalCashToKeepBuffer==null)blockedReasons.push('unknown-preclosing-budget');
  if(r.preclosing.preclosingLiquidityGap>.01)blockedReasons.push('preclosing-liquidity-gap');
  if(!r.preclosing.timingConsistent)blockedReasons.push('inconsistent-preclosing-timing');
  const incomplete = b.incomplete || r.icf.hypothetical || r.cash.depositReleasePending || r.preclosing.incomplete;
  return {
    valid: true, withinDebtLimit, maximumMotherMonthly: capacityBeforeMother == null ? null : Math.max(0, capacityBeforeMother),
    capacityBeforeMother, capacityAppliesTo: 'internal-family-repayment',
    debtRatio: debtKnown ? b.debtRatio : null, minimumKnownDebtRatio: b.debtRatio,
    debtRatioLimit: b.debtRatioLimit, borrowerIncome: b.regularIncome,
    mortgageMonthly: r.mortgage.monthlyPayment, existingDebtMonthly: b.existingDebtMonthly,
    motherBankMonthly: r.familyLoan.monthlyPayment, internalRepaymentMonthly: r.motherTransfer.familyMonthlyRepayment,
    cashFundingGap: r.cash.fundingGap, earlyCashGap: r.cash.beforeMortgageGap, householdRemaining,
    preclosingFundingNeed:r.preclosing.additionalCashToKeepBuffer,preclosingLiquidityGap:r.preclosing.preclosingLiquidityGap,
    depositReleaseAtRisk: r.cash.depositReleaseAtRisk, depositReleasePending: r.cash.depositReleasePending,
    fundingTimingRequiresConfirmation: r.cash.fundingTimingRequiresConfirmation || (r.cash.purchaseFeesEstimated && r.cash.prepaidPurchaseFees === 0),
    incomplete, provisional: incomplete || b.assumedLoanTerms || b.propertyCostsEstimated || r.cash.purchaseFeesEstimated,
    noApproval: true, approvalRequired: true,
    meetsKnownLimits: withinDebtLimit === true && r.cash.fundingGap <= 0.01 && r.cash.beforeMortgageGap <= 0.01 && householdRemaining != null && householdRemaining >= -0.01 && r.preclosing.additionalCashToKeepBuffer!=null && r.preclosing.additionalCashToKeepBuffer<=.01 && r.preclosing.preclosingLiquidityGap!=null && r.preclosing.preclosingLiquidityGap<=.01 && r.preclosing.timingConsistent,
    blockedReasons, errors: [],
  };
}

/** Shortest term meeting the entered arithmetic constraints, within an explicit
 * search range. It never lowers price/principal or changes the saved scenario.
 * Missing costs and unapproved ICF/loan conditions remain provisional even when
 * the known numbers fit. Only same-as-bank repayments link this term to the
 * borrowers' debt limit; custom family contracts need their own agreement.
 */
export function suggestFamilyLoanTerm(input = {}, options = {}) {
  const s = normalizeScenario(input);
  const initialResult = calculateScenario(s);
  const initialAffordability = getAffordability(s, initialResult);
  const config = isRecord(options) ? options : {};
  const minYears = n(config.minYears, 1);
  const maxYears = n(config.maxYears, 20);
  const stepMonths = n(config.stepMonths, 12);
  const response = {
    valid: initialResult.valid, found: false, years: null, months: null, monthlyPayment: null,
    minYears, maxYears, stepMonths,
    maximumMotherMonthly: initialAffordability.maximumMotherMonthly,
    minimumDebtTermYears: null, minimumDebtTermMonthlyPayment: null,
    affordability: initialAffordability, result: initialResult, candidates: [],
    provisional: true, noApproval: true, approvalRequired: true,
    reasonCode: 'no-fitting-term', reason: 'Ningún plazo del intervalo cumple todos los límites numéricos introducidos.',
  };
  if (!initialResult.valid) return { ...response, reasonCode: 'invalid-input', reason: 'Revisa los datos del cálculo antes de buscar un plazo.' };
  if (minYears <= 0 || maxYears > 30 || maxYears < minYears || !Number.isInteger(minYears * 12) || !Number.isInteger(maxYears * 12) || !Number.isInteger(stepMonths) || stepMonths <= 0) return { ...response, valid: false, reasonCode: 'invalid-range', reason: 'Indica un intervalo de meses válido entre uno y treinta años.' };
  if (!s.familyLoan.enabled) return { ...response, reasonCode: 'loan-disabled', reason: 'Activa el préstamo de la madre para explorar sus plazos.' };
  if (s.motherTransfer.mode !== 'family-loan' || s.motherTransfer.repaymentMode !== 'same-as-bank') return { ...response, reasonCode: 'custom-family-agreement', reason: 'La búsqueda supone que los hijos devuelven la misma cuota bancaria. El calendario familiar actual es distinto y no se sustituye.' };
  if (s.familyLoan.rate == null) return { ...response, reasonCode: 'missing-rate', reason: 'Introduce un TIN, aunque sea una hipótesis explícita, para buscar el plazo.' };
  if (initialResult.budget.regularIncome <= 0) return { ...response, reasonCode: 'missing-borrower-income', reason: 'Añade los ingresos ordinarios de los dos titulares.' };
  for (let months = minYears * 12; months <= maxYears * 12; months += stepMonths) {
    const years = months / 12;
    const candidateInput = { ...s, familyLoan: { ...s.familyLoan, years, assumedTerms: true } };
    const r = calculateScenario(candidateInput);
    const a = getAffordability(candidateInput, r);
    response.candidates.push({ years, monthlyPayment: r.familyLoan?.monthlyPayment ?? null, withinDebtLimit: a.withinDebtLimit, meetsKnownLimits: a.meetsKnownLimits, cashFundingGap: a.cashFundingGap, earlyCashGap: a.earlyCashGap, householdRemaining: a.householdRemaining });
    if (a.withinDebtLimit && response.minimumDebtTermYears == null) {
      response.minimumDebtTermYears = years;
      response.minimumDebtTermMonthlyPayment = r.familyLoan.monthlyPayment;
    }
    if (a.meetsKnownLimits) return { ...response, found: true, years, months, monthlyPayment: r.familyLoan.monthlyPayment,
      affordability: a, result: r, provisional: true, reasonCode: 'known-limits-fit',
      reason: 'Es el primer plazo del intervalo que encaja en los límites numéricos conocidos. Sigue sujeto a presupuestos, contratos y aprobación bancaria.',
    };
  }
  if (initialAffordability.cashFundingGap > 0.01) return { ...response, reasonCode: 'purchase-cash-gap', reason: 'Ampliar el plazo no cubre la falta de capital para comprar.' };
  if (initialAffordability.earlyCashGap > 0.01) return { ...response, reasonCode: 'early-cash-gap', reason: 'Ampliar el plazo no aporta el dinero que falta antes de las arras.' };
  if (response.minimumDebtTermYears == null) return { ...response, reasonCode: 'debt-limit', reason: 'La cuota no entra en el límite de deuda dentro del intervalo indicado.' };
  return { ...response, reasonCode: 'household-margin', reason: 'El límite de deuda puede encajar, pero el margen familiar sigue sin cubrir todas las salidas introducidas.' };
}
