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
      { id: 'buyer-1', label: 'Comprador 1', share: 0.5, rate: 0.1, eligibilityConfirmed: false },
      { id: 'buyer-2', label: 'Comprador 2', share: 0.5, rate: 0.1, eligibilityConfirmed: false },
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
  cash: { savings: 0, depositPercent: 0.1, familyLoanAvailableBeforeDeposit: false },
  purchaseCosts: {
    appraisal: 0, legal: 0, notary: 0, registry: 0, agency: 0,
    broker: 0, other: 0, renovations: 0, reserve: 0,
  },
  familyLoan: { enabled: false, amount: null, maxAmount: 60000, rate: null, years: null, originationFeePercent: 0, originationFeeFixed: 0 },
  motherTransfer: {
    mode: 'family-loan',
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

const COST_KEYS = ['appraisal', 'legal', 'notary', 'registry', 'agency', 'broker', 'other', 'renovations', 'reserve'];
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

/** Lower selected buyer tax requires an explicit eligibility confirmation. */
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
    if (!confirmed) warnings.push(`${buyer.label || `Comprador ${index + 1}`}: tipo reducido sin confirmar; se calcula la tarifa general.`);
    const share = nonnegative(buyer.share);
    const fullTax = (reduced && confirmed) || buyer.customRateConfirmed === true ? base * requestedRate : generalTax;
    const amount = fullTax * share;
    return { ...buyer, share, requestedRate, appliedRate: base ? fullTax / base : 0, eligibilityConfirmed: confirmed, taxableShare: base * share, amount };
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
} = {}) {
  const gross = nonnegative(amount);
  const warnings = [];
  if (mode === 'family-loan') {
    const termsKnown = gross === 0 || (familyRate != null && familyYears != null);
    const repayment = gross > 0 && termsKnown ? amortizeLoan(gross, n(familyRate), n(familyYears)) : null;
    if (gross > 0) {
      warnings.push('El préstamo entre madre e hijos requiere contrato, calendario y devoluciones reales; modelo 600 exento, generalmente dentro de un mes.');
      if (!termsKnown) warnings.push('Falta plazo o interés del préstamo interno: no se puede completar la carga contractual de los titulares ante el banco.');
      if (nonnegative(familyRate) > 0) warnings.push('Los intereses del préstamo familiar pueden tributar para la madre; ese IRPF no se calcula.');
    }
    return { mode, amount: gross, giftTax: 0, notaryCost: 0, totalCosts: 0, allocations: [],
      familyMonthlyRepayment: gross === 0 ? 0 : repayment?.monthlyPayment ?? null,
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
  return { mode, amount: gross, giftTax, notaryCost, totalCosts: giftTax + notaryCost,
    allocations: rows, familyMonthlyRepayment: 0, termsKnown: true,
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
  optionalBoolean(s.icf.enabled, 'Activación del ICF');
  optionalBoolean(s.cash.familyLoanAvailableBeforeDeposit, 'Disponibilidad del préstamo antes de las arras');
  optionalBoolean(s.stress.loseDiscounts, 'Pérdida de bonificaciones');
  optionalBoolean(s.motherTransfer.giftPublicDeed, 'Escritura de donación');
  optionalBoolean(s.motherTransfer.coOwnerSpouseConfirmed, 'Excepción de copropiedad entre cónyuges');
  optionalBoolean(s.budget.sharedLivingCosts, 'Gastos de vida compartidos entre alquiler y compra');
  optionalBoolean(s.budget.propertyCostsEstimated, 'Importes orientativos de la casa');
  optionalBoolean(s.budget.propertyCostsConfirmed, 'Recibos y cuotas de la casa comprobados');
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
  numeric(s.cash.depositPercent, 'Arras', 0, 1);
  if (s.cash.depositAmount != null) numeric(s.cash.depositAmount, 'Importe arras', 0, nonnegative(s.purchasePrice));
  if (s.mortgage.amount != null) numeric(s.mortgage.amount, 'Capital hipotecario', 0, nonnegative(s.purchasePrice));
  if (n(s.mortgage.ltv) > 0.8) warnings.push('La financiación supera el 80% citado por el gestor: requiere otra aprobación expresa de Sabadell.');
  for (const key of COST_KEYS) numeric(s.purchaseCosts[key], `Gasto ${key}`);
  const buyers = Array.isArray(s.tax.buyers) ? s.tax.buyers : [];
  if (s.tax.mode === 'used') {
    if (!buyers.length || Math.abs(sum(buyers.map((b) => n(b.share))) - 1) > 0.000001) errors.push('Las cuotas de propiedad deben sumar el 100%.');
    buyers.forEach((buyer, index) => {
      numeric(buyer.share, `Propiedad comprador ${index + 1}`, 0, 1);
      numeric(buyer.rate, `ITP comprador ${index + 1}`, 0, 0.25, true);
      optionalText(buyer.label, `Nombre comprador ${index + 1}`);
      optionalBoolean(buyer.eligibilityConfirmed, `Requisitos fiscales comprador ${index + 1}`);
      if (n(buyer.rate, 0.1) < 0.1 && !buyer.eligibilityConfirmed) warnings.push(`Comprador ${index + 1}: confirma todos los requisitos fiscales antes de aplicar el tipo reducido.`);
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
    if (n(s.familyLoan.amount) > n(s.familyLoan.maxAmount)) errors.push('El préstamo de la madre supera el límite introducido.');
    warnings.push('El origen de los fondos y la deuda familiar deben comunicarse al banco. Préstamo familiar y donación tienen trámites distintos.');
    if (!['family-loan', 'gift'].includes(s.motherTransfer.mode)) errors.push('Indica si la entrega de la madre es un préstamo familiar o una donación.');
    if (s.motherTransfer.mode === 'family-loan') {
      numeric(s.motherTransfer.familyRate, 'Interés del préstamo entre madre e hijos', 0, 100, true);
      numeric(s.motherTransfer.familyYears, 'Plazo del préstamo entre madre e hijos', 1 / 12, 50, true);
      if (s.motherTransfer.familyYears != null && !Number.isInteger(n(s.motherTransfer.familyYears) * 12)) errors.push('El préstamo entre madre e hijos debe tener un número entero de meses.');
    } else {
      numeric(s.motherTransfer.giftNotaryCost, 'Notaría de la donación');
      const allocations = Array.isArray(s.motherTransfer.allocations) ? s.motherTransfer.allocations : [];
      if (!allocations.length || Math.abs(sum(allocations.map((allocation) => n(allocation.share))) - 1) > 0.000001) errors.push('El reparto de la donación debe sumar el 100%.');
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
  const principal = s.mortgage.amount == null ? lendingBase * n(s.mortgage.ltv) : n(s.mortgage.amount);
  if (principal > lendingBase * n(s.mortgage.ltv) + 0.01) warnings.push('El capital manual supera la financiación por el porcentaje y la tasación introducidos.');
  const enabledDiscounts = s.mortgage.discounts.filter((d) => d.enabled);
  const points = Math.min(nonnegative(s.mortgage.maxDiscountPoints), sum(enabledDiscounts.map((d) => nonnegative(d.points))));
  const rate = Math.max(0, n(s.mortgage.baseRate) - points);
  const mortgage = { ...amortizeLoan(principal, rate, n(s.mortgage.years), { includeSchedule }), lendingBase, ltv: price ? principal / price : 0, baseRate: n(s.mortgage.baseRate), discountPoints: points };
  const noBonusMortgage = amortizeLoan(principal, n(s.mortgage.baseRate), n(s.mortgage.years));
  const tax = calculateTransferTax({ purchasePrice: price, referenceValue: s.referenceValue, declaredValue: s.declaredValue, ...s.tax });
  warnings.push(...tax.warnings);
  const icfPrincipal = s.icf.enabled ? Math.min(lendingBase * n(s.icf.ltv), n(s.icf.maxAmount), Math.max(0, price - principal)) : 0;
  const icf = { enabled: !!s.icf.enabled, principal: icfPrincipal, rate: 0, monthlyPaymentNow: 0, deferredMonthlyPayment: icfPrincipal / Math.max(1, n(s.icf.repaymentYears) * 12), repaymentYears: n(s.icf.repaymentYears), startsAfterMortgageYears: n(s.mortgage.years), eligibilityConfirmed: s.icf.eligibilityConfirmed === true };
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
  const mortgageOriginationFee = principal * nonnegative(s.mortgage.originationFeePercent) / 100 + nonnegative(s.mortgage.originationFeeFixed);
  const purchaseFees = sum(['appraisal', 'legal', 'notary', 'registry', 'agency', 'broker', 'other'].map((key) => cost[key]));
  const priceContribution = price - principal - icfPrincipal;
  const beforeFamilyLoanRequired = priceContribution + tax.total + purchaseFees + mortgageOriginationFee + upfrontInsurance + cost.renovations + cost.reserve;
  const savings = nonnegative(s.cash.savings);
  const loanFeeRate = nonnegative(s.familyLoan.originationFeePercent) / 100;
  const loanFeeFixed = nonnegative(s.familyLoan.originationFeeFixed);
  const loanMax = Math.min(60000, nonnegative(s.familyLoan.maxAmount));
  const transferForAmount = (amount) => calculateMotherTransfer({ ...s.motherTransfer, amount,
    ownershipShares: (s.tax.buyers || []).map((buyer) => buyer.share),
  });
  const loanFeeForAmount = (amount) => amount > 0 ? amount * loanFeeRate + loanFeeFixed : 0;
  // Donation tax depends on the donated amount. Solve the minimum gross bank
  // loan that covers both acquisition and its tax/fees. Bisection is bounded
  // and deterministic; if 60k is insufficient, use the cap and show the gap.
  const fundingBalance = (amount) => savings + amount - beforeFamilyLoanRequired
    - loanFeeForAmount(amount) - transferForAmount(amount).totalCosts;
  let autoLoan = 0;
  if (s.familyLoan.enabled && beforeFamilyLoanRequired > savings) {
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
  const familyLoan = s.familyLoan.enabled && familyTermsKnown
    ? { ...amortizeLoan(familyPrincipal, n(s.familyLoan.rate), n(s.familyLoan.years), { includeSchedule }), fee: familyLoanFee, termsKnown: true }
    : { ...emptyLoan(), principal: familyPrincipal, monthlyPayment: s.familyLoan.enabled ? null : 0, totalInterest: s.familyLoan.enabled ? null : 0, totalPaid: s.familyLoan.enabled ? null : 0, fee: familyLoanFee, termsKnown: familyTermsKnown };
  const totalRequired = beforeFamilyLoanRequired + familyLoanFee + motherTransfer.totalCosts;
  const availableFunds = savings + familyPrincipal;
  const depositAmount = s.cash.depositAmount == null ? price * n(s.cash.depositPercent) : n(s.cash.depositAmount);
  const earlyLoanFee = s.cash.familyLoanAvailableBeforeDeposit ? familyLoanFee : 0;
  const earlyTransferCosts = s.cash.familyLoanAvailableBeforeDeposit ? motherTransfer.totalCosts : 0;
  const beforeMortgageRequired = depositAmount + cost.appraisal + cost.legal + earlyLoanFee + earlyTransferCosts;
  const beforeMortgageAvailable = savings + (s.cash.familyLoanAvailableBeforeDeposit ? familyPrincipal : 0);
  const closingCosts = tax.total + purchaseFees - cost.appraisal - cost.legal + mortgageOriginationFee + upfrontInsurance + familyLoanFee - earlyLoanFee + motherTransfer.totalCosts - earlyTransferCosts;
  const closingNetPayment = price - depositAmount - principal - icfPrincipal + closingCosts;
  const fundingGap = Math.max(0, totalRequired - availableFunds);
  const beforeMortgageGap = Math.max(0, beforeMortgageRequired - beforeMortgageAvailable);
  const insuranceFirstPaymentEstimate = sum(products.filter((p) => p.frequency !== 'upfront').map((p) => nonnegative(p.cost)))
    + (bankHome ? 0 : nonnegative(s.budget.externalHomeInsuranceAnnual));
  const cash = {
    totalRequired, availableFunds, savings, fundingGap, surplus: Math.max(0, availableFunds - totalRequired),
    priceContribution, tax: tax.total, purchaseFees, mortgageOriginationFee, upfrontInsurance, familyLoanFee,
    motherTransferTax: motherTransfer.giftTax, motherTransferCosts: motherTransfer.totalCosts, giftNotaryCost: motherTransfer.notaryCost,
    renovations: cost.renovations, reserve: cost.reserve, depositAmount,
    beforeMortgageRequired, beforeMortgageAvailable, beforeMortgageGap, closingNetPayment,
    purchasePrice: price, mortgageFunding: principal, icfFunding: icfPrincipal, debtFunding: familyPrincipal,
    totalAcquisitionCost: price + tax.total + purchaseFees + mortgageOriginationFee + upfrontInsurance + familyLoanFee + motherTransfer.totalCosts + cost.renovations,
    insuranceFirstPaymentEstimate,
  };
  if (fundingGap > 0.01) warnings.push(`Faltan ${rounded(fundingGap).toFixed(2)} € para cubrir la compra y el colchón previsto.`);
  if (beforeMortgageGap > 0.01) warnings.push(`Antes de firmar la hipoteca faltan ${rounded(beforeMortgageGap).toFixed(2)} € para arras, tasación y asesoramiento.`);
  if (cost.reserve === 0) warnings.push('No se ha reservado colchón de emergencia.');
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
    utilityBreakdown, utilitiesUnitemizedMonthly, currentUtilitiesMonthly,
    currentUtilityBreakdown, currentUtilitiesUnitemizedMonthly,
    utilityMode, currentUtilityMode, utilitiesMode: utilityMode, currentUtilitiesMode: currentUtilityMode,
    utilitiesAggregateMonthly: utilitiesUnitemizedMonthly, currentUtilitiesAggregateMonthly: currentUtilitiesUnitemizedMonthly,
    utilitiesDetailedMonthly, currentUtilitiesDetailedMonthly,
    existingDebtMonthly: existingDebt, familyExistingDebtMonthly: familyExistingDebt,
    familyLoanMonthly: familyLoan.monthlyPayment, totalDebtMonthly, totalMonthly,
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
    unexpectedCost: n(s.stress.unexpectedCost), reserveAfterUnexpectedCost: cost.reserve - n(s.stress.unexpectedCost),
    incomplete,
  };
  const timeline = [
    { id: 'before', label: 'Antes de la hipoteca', cashOut: beforeMortgageRequired, cashIn: beforeMortgageAvailable, balance: beforeMortgageAvailable - beforeMortgageRequired, note: 'Arras, tasación y asesoramiento; la hipoteca todavía no se desembolsa.' },
    { id: 'signing', label: 'Firma', cashOut: price - depositAmount + closingCosts, cashIn: principal + icfPrincipal + (s.cash.familyLoanAvailableBeforeDeposit ? 0 : familyPrincipal), balance: savings + familyPrincipal - beforeMortgageRequired - closingNetPayment, note: 'El precio pendiente ya descuenta las arras. Fondos ICF sujetos a resolución y desembolso.' },
    { id: 'after', label: 'Después de la firma', cashOut: cost.renovations, cashIn: 0, balance: availableFunds - totalRequired + cost.reserve, note: 'Reformas y efectivo restante, que incluye el colchón reservado.' },
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
  return { valid: true, validation, warnings: [...new Set(warnings)], tax, mortgage, familyLoan, motherTransfer, icf, cash, budget, stress, bonuses, timeline, lifetime };
}
