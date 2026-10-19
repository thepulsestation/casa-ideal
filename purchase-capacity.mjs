import {calculateScenario, getPurchaseProvisionAmount, normalizeScenario} from './finance.mjs?v=28';

const unique = values => [...new Set(values.filter(Boolean))];
const moneyTolerance = 0.005;

/**
 * Price ceiling under the configured borrowers' debt ratio and acquisition
 * cash limits. This is a generic-price illustration, not a property valuation,
 * a bank decision, or a guarantee that the household can afford its living costs.
 *
 * A saved home's manual mortgage, appraisal, cadastral value, fixed deposit and
 * manual mother-loan amount cannot be extrapolated to every other home. The
 * search instead uses the configured financing/deposit percentages, automatic
 * mother borrowing, and assumes appraisal/reference values equal the price.
 * Operational loan limits and repayment terms are never increased by the search.
 * Costs, unknown quotes and eligibility flags stay as supplied in the template.
 */
export function calculatePurchaseCapacity(input = {}, options = {}) {
  const step = options.step ?? 500;
  const searchCeiling = options.searchCeiling ?? 1000000;
  const empty = {
    valid: false, maxPrice: null, maxByDebt: null, maxByCash: null,
    bindingConstraint: 'unknown', reason: 'Revisa los datos antes de calcular un precio orientativo.',
    limitedBySearchCeiling: false, debtLimitedBySearchCeiling: false,
    cashLimitedBySearchCeiling: false, priceStep: step, searchCeiling,
    summary: null, borrowerRegularIncome: null, existingDebtMonthly: null,
    debtLimitMonthly: null, loanLimit: null, pendingAssumptions: [], missingQuotes: [],
    financingAssumptions: null, preclosing: null, errors: [],
    provisional: true, noApproval: true, householdBudgetChecked: false,
  };
  if (!Number.isSafeInteger(step) || step <= 0 || !Number.isSafeInteger(searchCeiling)
    || searchCeiling < step) {
    return {...empty, errors: ['La búsqueda necesita un paso y un techo en euros enteros positivos, con techo igual o mayor al paso.']};
  }

  const template = normalizeScenario(input);
  template.appraisalValue = null;
  template.referenceValue = null;
  template.declaredValue = null;
  template.mortgage.amount = null;
  template.familyLoan.amount = null;
  template.cash.depositAmount = null;
  const maxIndex = Math.floor(searchCeiling / step);
  const cache = new Map();
  const evaluate = index => {
    if (!cache.has(index)) cache.set(index,
      calculateScenario({...template, purchasePrice: index * step}, options.asOfMonth === undefined ? {} : {asOfMonth: options.asOfMonth}));
    return cache.get(index);
  };
  // A fixed advance cannot exceed the provision that includes it. With a
  // percentage provision, very cheap synthetic prices can therefore be invalid
  // even though real candidates are valid. Start at the first grid price that
  // can contain the advance, without reducing it or changing the search ceiling.
  let minIndex = 1;
  const provisionPercent = Number(template.purchaseCosts.provisionPercent);
  const prepaidProvision = Number(template.purchaseCosts.provisionBeforeSigning);
  if (template.purchaseCosts.provisionBasis === 'percent'
    && Number.isFinite(provisionPercent) && provisionPercent > 0 && provisionPercent <= 100
    && Number.isFinite(prepaidProvision) && prepaidProvision > 0) {
    const containsAdvance = index => getPurchaseProvisionAmount({...template, purchasePrice: index * step}) >= prepaidProvision;
    if (containsAdvance(maxIndex)) {
      let low = 1;
      let high = maxIndex;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if (containsAdvance(middle)) high = middle;
        else low = middle + 1;
      }
      minIndex = low;
    } else {
      // Evaluation at the actual ceiling reports the incompatible advance;
      // silently clipping it would overstate available cash.
      minIndex = maxIndex;
    }
  }
  const first = evaluate(minIndex);
  if (!first.valid) return {...empty, errors: first.validation?.errors || ['Los datos del cálculo no son válidos.']};

  // Monotone conditions: financing percentages and progressive taxes cannot
  // reduce the known purchase cash need or the mortgage as the price rises.
  const debtKnown = first.budget.regularIncome > 0 && !first.budget.borrowerDebtRatioIncomplete;
  const debtFits = result => result.valid && debtKnown
    && result.budget.borrowerDebtMonthly <= result.budget.regularIncome * result.budget.debtRatioLimit + 1e-8;
  const cashFits = result => result.valid
    && result.cash.fundingGap <= moneyTolerance
    && result.cash.beforeMortgageGap <= moneyTolerance;
  const search = predicate => {
    if (!predicate(first)) return {index: 0, ceilingReached: false};
    if (predicate(evaluate(maxIndex))) return {index: maxIndex, ceilingReached: true};
    let low = minIndex;
    let high = maxIndex;
    while (low + 1 < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (predicate(evaluate(middle))) low = middle;
      else high = middle;
    }
    return {index: low, ceilingReached: false};
  };
  const cashSearch = search(cashFits);
  const debtSearch = debtKnown ? search(debtFits) : null;
  const combined = debtKnown ? search(result => cashFits(result) && debtFits(result)) : null;
  const maxPrice = combined ? combined.index * step : null;
  const atMaximum = maxPrice > 0 ? evaluate(combined.index) : null;
  const reference = atMaximum || first;
  const maxByCash = cashSearch.index * step;
  const maxByDebt = debtSearch ? debtSearch.index * step : null;

  let bindingConstraint = 'unknown';
  let reason = first.budget.regularIncome <= 0
    ? 'Faltan los ingresos ordinarios de los titulares; los ingresos de madre y hermana no sustituyen esos datos.'
    : 'Falta el calendario de devolución a mamá para comprobar la deuda de los titulares.';
  if (combined) {
    if (combined.ceilingReached) {
      bindingConstraint = 'search-ceiling';
      reason = 'Se alcanza el techo de búsqueda: no es un máximo financiero acreditado.';
    } else if (maxByCash === maxByDebt) {
      bindingConstraint = 'cash-and-debt';
      reason = 'El efectivo inicial y el límite de deuda coinciden en este intervalo de precios.';
    } else if (maxByCash < maxByDebt) {
      bindingConstraint = 'cash';
      reason = 'Limita el efectivo disponible para compra y arras, con el préstamo actual de mamá.';
    } else {
      bindingConstraint = 'debt';
      reason = 'Limita la suma de hipoteca, deuda personal y devolución a mamá de los titulares.';
    }
    if (maxPrice === 0) reason = 'Ningún precio positivo del intervalo cumple a la vez el efectivo y la deuda configurados. ' + reason;
  }

  const preclosing = atMaximum ? {
    requestedInstallments: reference.preclosing.requestedInstallments,
    monthlyRemaining: reference.preclosing.monthlyRemaining,
    additionalCashToKeepBuffer: reference.preclosing.additionalCashToKeepBuffer,
    preclosingLiquidityGap: reference.preclosing.preclosingLiquidityGap,
    timingConsistent: reference.preclosing.timingConsistent,
    incomplete: reference.preclosing.incomplete,
  } : null;
  const financingAssumptions = {
    bankLtv: template.mortgage.ltv, icfLtv: template.icf.ltv,
    icfEnabled: template.icf.enabled, icfMaxAmount: template.icf.maxAmount,
    loanLimit: template.familyLoan.enabled ? template.familyLoan.maxAmount : 0,
    loanYears: template.familyLoan.years, loanRate: template.familyLoan.rate,
    familyRate: template.motherTransfer.familyRate,
    familyYears: template.motherTransfer.familyYears,
    familyRepaymentMode: template.motherTransfer.repaymentMode,
    depositPercent: template.cash.depositPercent,
    depositFundingMode: template.cash.depositFundingMode,
    appraisalAtLeastPrice: true, referenceValueAtPrice: true,
    manualPropertyAmountsIgnored: true,
  };
  const missingQuotes = unique([
    ...reference.budget.missingQuotes,
    ...(template.purchaseCosts.brokerQuotePending ? ['Honorarios de agencia sin presupuesto final'] : []),
  ]);
  const pendingAssumptions = unique([
    ...(reference.budget.bankDebtProjected ? [`El esfuerzo usa las deudas previstas para ${reference.budget.bankDebtAsOfMonth}, tras las cancelaciones simuladas; el banco necesita comprobar su cancelación real.`] : []),
    ...(reference.budget.personalDebtCancellationAssumed ? ['El cobro extraordinario y las cancelaciones de deudas están pendientes. Antes de ese mes se mantienen las cuotas; el resultado posterior es una hipótesis condicionada al cobro y a los saldos reales.'] : []),
    'Tasación igual o superior al precio y valor fiscal sin incremento sobre ese precio; hay que comprobar cada vivienda.',
    'Se conservan los costes del escenario usado como referencia; otras viviendas pueden exigir más gastos o reformas.',
    'El resultado comprueba deuda de titulares y capital inicial; el reparto familiar, el gasto de vida y la espera hasta la firma se revisan aparte.',
    ...(template.icf.enabled && !template.icf.eligibilityConfirmed ? ['ICF incluido como hipótesis, pendiente de requisitos y concesión.'] : []),
    ...(reference.cash.depositReleasePending ? ['Pendiente confirmar cómo se compensan o liberan las arras al firmar; la financiación nominal no garantiza ese efectivo.'] : []),
    ...(template.cash.depositFundingMode === 'no-release' ? ['Se simula que banco e ICF solo desembolsan el saldo pendiente al vendedor.'] : []),
    ...(reference.cash.purchaseFeesEstimated ? ['La provisión de gastos de compra no es un máximo y falta confirmar presupuestos con su IVA.'] : []),
    ...(reference.budget.assumedLoanTerms ? ['Condiciones del préstamo de mamá simuladas; no equivalen a una oferta concedida.'] : []),
    ...(reference.tax.buyers.some(buyer => buyer.eligibilityStatus === 'assumed') ? ['ITP reducido simulado; faltan comprobaciones de elegibilidad.'] : []),
    ...(reference.tax.buyers.some(buyer => buyer.eligibilityStatus === 'pending') ? ['ITP reducido pendiente: este cálculo aplica la tarifa general a quien no tenga comprobación ni hipótesis marcada.'] : []),
    ...missingQuotes.map(quote => `Falta importe confirmado: ${quote}.`),
    ...reference.budget.missingEstimates,
    ...(preclosing?.additionalCashToKeepBuffer > moneyTolerance || preclosing?.preclosingLiquidityGap > moneyTolerance
      ? ['La espera pagando alquiler y préstamo requiere dinero adicional; ese déficit no aumenta automáticamente el capital calculado.'] : []),
    ...(preclosing && !preclosing.timingConsistent ? ['Revisa el calendario: se han indicado cuotas antes de disponer del préstamo para las arras.'] : []),
  ]);
  const summary = atMaximum ? {
    purchasePrice: maxPrice,
    loanRequired: reference.familyLoan.principal,
    loanLimit: financingAssumptions.loanLimit,
    loanYears: template.familyLoan.years, loanRate: template.familyLoan.rate,
    motherBankMonthly: reference.familyLoan.monthlyPayment,
    mortgagePrincipal: reference.mortgage.principal,
    mortgageMonthly: reference.mortgage.monthlyPayment,
    borrowerRegularIncome: reference.budget.regularIncome,
    debtLimitRatio: reference.budget.debtRatioLimit,
    debtLimitMonthly: reference.budget.regularIncome * reference.budget.debtRatioLimit,
    existingDebtMonthly: reference.budget.bankExistingDebtMonthly ?? reference.budget.existingDebtMonthly,
    familyRepaymentMonthly: reference.budget.borrowerFamilyRepaymentMonthly,
    borrowerDebtMonthly: reference.budget.borrowerDebtMonthly,
    borrowerDebtRatio: reference.budget.debtRatio,
    icfPrincipal: reference.icf.principal,
    tax: reference.tax.total, fees: reference.cash.purchaseFees,
    moving: reference.cash.moving, buffer: reference.cash.totalReserve,
    cashRequired: reference.cash.totalRequired, savings: reference.cash.savings,
    earlyCashRequired: reference.cash.beforeMortgageRequired,
    fundingGap: reference.cash.fundingGap, earlyCashGap: reference.cash.beforeMortgageGap,
    householdRemaining: reference.budget.remainingRegular,
    preclosing,
  } : null;

  return {
    ...empty, valid: true, maxPrice, maxByCash, maxByDebt, bindingConstraint, reason,
    limitedBySearchCeiling: combined?.ceilingReached ?? false,
    cashLimitedBySearchCeiling: cashSearch.ceilingReached,
    debtLimitedBySearchCeiling: debtSearch?.ceilingReached ?? false,
    searchMaximumPrice: maxIndex * step,
    borrowerRegularIncome: first.budget.regularIncome,
    existingDebtMonthly: first.budget.bankExistingDebtMonthly ?? first.budget.existingDebtMonthly,
    debtLimitMonthly: first.budget.regularIncome * first.budget.debtRatioLimit,
    loanLimit: financingAssumptions.loanLimit,
    summary, missingQuotes, pendingAssumptions, financingAssumptions, preclosing,
  };
}
