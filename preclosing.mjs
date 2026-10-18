const numberOrNull = value => value !== null && value !== undefined && value !== ''
  && Number.isFinite(Number(value)) ? Number(value) : null;
const nonnegative = value => Math.max(0, numberOrNull(value) ?? 0);

/**
 * Cash flow while the family is still renting and the mother's loan has begun.
 * The payments below are part of the loan's existing amortization schedule,
 * never extra acquisition expenses or extra lifetime loan interest.
 *
 * This preview does not increase the loan. Income covers the waiting period
 * first, then any surplus funds, and only then the mother's emergency buffer.
 * The caller validates preClosingLoanPayments as an integer from 0 to 60.
 */
export function calculatePreclosing(s, { budget, familyLoan, cash }, amortizeLoan) {
  const requestedInstallments = Math.min(60, Math.max(0,
    Math.trunc(numberOrNull(s.cash?.preClosingLoanPayments) ?? 0)));
  const principal = nonnegative(familyLoan.principal);
  const hasLoan = principal > 0;
  const hasWait = hasLoan && requestedInstallments > 0;
  const rate = numberOrNull(familyLoan.rate);
  const years = numberOrNull(familyLoan.years);
  const duration = numberOrNull(familyLoan.months)
    ?? (years !== null && years > 0 ? years * 12 : null);
  const durationKnown = duration !== null && duration > 0 && Number.isInteger(duration);
  const quotedMonthly = numberOrNull(familyLoan.monthlyPayment);
  const termsKnown = !hasLoan || (familyLoan.termsKnown !== false
    && rate !== null && rate >= 0 && years !== null && years > 0
    && durationKnown && quotedMonthly !== null && quotedMonthly >= 0);
  const motherMonthly = !hasLoan ? 0 : termsKnown ? quotedMonthly : null;
  const income = nonnegative(budget.actualRegularIncome);
  const incomeKnown = income > 0;
  const monthlyOutflow = motherMonthly === null ? null
    : nonnegative(budget.currentComparable) + motherMonthly;
  const monthlyRemaining = !incomeKnown || monthlyOutflow === null
    ? null : income - monthlyOutflow;
  const paidInstallments = !hasWait ? 0
    : durationKnown ? Math.min(requestedInstallments, duration) : null;
  const timingConsistent = !hasWait || s.cash?.familyLoanAvailableBeforeDeposit === true;

  let paidBeforeSigning = hasWait ? null : 0;
  let principalRepaid = hasWait ? null : 0;
  let interestPaid = hasWait ? null : 0;
  let remainingPrincipal = principal;
  let remainingInstallments = hasLoan && durationKnown ? duration : hasLoan ? null : 0;
  if (hasWait && termsKnown) {
    const loan = amortizeLoan(principal, rate, years, { includeSchedule: true });
    const installments = loan.schedule.slice(0, paidInstallments);
    paidBeforeSigning = installments.reduce((total, installment) => total + installment.payment, 0);
    principalRepaid = installments.reduce((total, installment) => total + installment.principal, 0);
    interestPaid = installments.reduce((total, installment) => total + installment.interest, 0);
    remainingPrincipal = installments.at(-1)?.balance ?? principal;
    remainingInstallments = Math.max(0, duration - paidInstallments);
  } else if (hasWait) {
    remainingPrincipal = null;
    remainingInstallments = paidInstallments === null || !durationKnown
      ? null : Math.max(0, duration - paidInstallments);
  }

  const deficit = !hasWait ? 0 : monthlyRemaining === null || paidInstallments === null
    ? null : paidInstallments * Math.max(0, -monthlyRemaining);
  const surplusAvailable = nonnegative(cash.surplus);
  const bufferAvailable = nonnegative(cash.familyExtraBuffer);
  const surplusUsed = deficit === null ? null : Math.min(surplusAvailable, deficit);
  const additionalCashToKeepBuffer = deficit === null ? null
    : Math.max(0, deficit - surplusAvailable);
  const bufferUsed = additionalCashToKeepBuffer === null ? null
    : Math.min(bufferAvailable, additionalCashToKeepBuffer);
  const bufferRemaining = bufferUsed === null ? null : bufferAvailable - bufferUsed;
  const cashGapAfterBuffer = additionalCashToKeepBuffer === null ? null
    : Math.max(0, additionalCashToKeepBuffer - bufferAvailable);
  // A final surplus may be tied up in the deposit until the deed is signed.
  // Compare the waiting deficit separately with cash left after early payments.
  const earlyAvailable = numberOrNull(cash.beforeMortgageAvailable);
  const earlyRequired = numberOrNull(cash.beforeMortgageRequired);
  const cashAfterEarlyPayments = earlyAvailable === null || earlyRequired === null
    ? hasWait ? null : 0 : Math.max(0, earlyAvailable - earlyRequired);
  const preclosingLiquidityGap = !hasWait ? 0
    : deficit === null || cashAfterEarlyPayments === null ? null
      : Math.max(0, deficit - cashAfterEarlyPayments);
  const incomplete = Boolean(budget.incomplete || familyLoan.termsAssumed
    || !timingConsistent || (hasWait && (!termsKnown || !incomeKnown
      || preclosingLiquidityGap === null)));

  return {
    requestedInstallments, paidInstallments, termsKnown, incomeKnown, timingConsistent,
    motherMonthly, monthlyOutflow, monthlyRemaining,
    paidBeforeSigning, principalRepaid, interestPaid, remainingPrincipal, remainingInstallments,
    deficit, surplusAvailable, surplusUsed, bufferAvailable, bufferUsed, bufferRemaining,
    additionalCashToKeepBuffer, cashGapAfterBuffer, cashAfterEarlyPayments,
    preclosingLiquidityGap, incomplete,
  };
}
