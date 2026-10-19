const ROLES = ['buyer1', 'buyer2', 'mother', 'sister'];
const SERIES = [...ROLES, 'household'];
const DEFAULT_LABELS = ['Tú', 'Tu hermano', 'Tu madre', 'Tu hermana'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const monthValid = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900;
const monthIndex = value => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
const monthString = index => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
const money = value => typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
const balances = value => Object.fromEntries(SERIES.map(role => [role, value]));

/**
 * Potential savings from the displayed calendar, starting with no opening cash.
 * cashRemaining already nets dated pay, settlements, reserves and transfers.
 * Loan principal and any pre-existing savings stock are never new savings here.
 * The signing month is excluded: its receipts may arrive after the purchase.
 */
export function buildSavingsProjection(timeline) {
  const sourcePersons = Array.isArray(timeline?.persons) ? timeline.persons : [];
  const persons = ROLES.map((id, index) => ({id, label: sourcePersons.find(person => person?.id === id)?.label || DEFAULT_LABELS[index]}));
  const result = {
    valid: false, errors: [], warnings: [], incomplete: true, persons,
    startMonth: null, purchaseMonth: null, cutoffMonth: null, completeThroughMonth: null,
    openingBalance: 0, includesPurchaseMonth: false, points: [], totals: balances(null),
  };
  if (!record(timeline) || timeline.valid !== true || !Array.isArray(timeline.months)) {
    result.errors = [...(Array.isArray(timeline?.validation?.errors) ? timeline.validation.errors.filter(value => typeof value === 'string') : []), 'Completa el calendario familiar para calcular el ahorro acumulado.'];
    return result;
  }
  if (!monthValid(timeline.purchaseMonth)) {
    result.errors.push('Indica un mes de compra válido para delimitar el ahorro anterior a la firma.');
    return result;
  }
  result.purchaseMonth = timeline.purchaseMonth;
  result.cutoffMonth = monthString(monthIndex(timeline.purchaseMonth) - 1);
  if (!timeline.months.length || !monthValid(timeline.months[0]?.month)) {
    result.errors.push('El calendario necesita un primer mes válido.');
    return result;
  }
  result.startMonth = timeline.months[0].month;
  const start = monthIndex(result.startMonth), purchase = monthIndex(result.purchaseMonth);
  if (purchase - start > 1200) {
    result.errors.push('El ahorro anterior a la compra no puede superar un horizonte de 1.200 meses.');
    return result;
  }
  let previous = -Infinity;
  const rows = new Map();
  for (const row of timeline.months) {
    if (!record(row) || !monthValid(row.month) || monthIndex(row.month) <= previous) {
      result.errors.push('Los meses del calendario deben ser válidos, estar ordenados y no repetirse.');
      return result;
    }
    previous = monthIndex(row.month);
    rows.set(row.month, row);
  }
  const cumulative = balances(0);
  let hasMissingMonths = false, hasMissingAmounts = false, hasUnassignedExpenses = false;
  let complete = true;
  for (let index = start; index < purchase; index++) {
    const month = monthString(index), row = rows.get(month);
    if (!row) hasMissingMonths = true;
    const monthly = Object.fromEntries(SERIES.map(role => [role, money(role === 'household' ? row?.household?.cashRemaining : row?.people?.[role]?.cashRemaining)]));
    for (const role of SERIES) {
      if (monthly[role] === null) hasMissingAmounts = true;
      cumulative[role] = cumulative[role] === null || monthly[role] === null ? null : Math.round((cumulative[role] + monthly[role]) * 100) / 100;
    }
    const unassigned = Boolean(row?.hasUnassignedExpenses);
    hasUnassignedExpenses ||= unassigned;
    complete &&= SERIES.every(role => cumulative[role] !== null) && !unassigned;
    if (complete) result.completeThroughMonth = month;
    result.points.push({month, monthly, cumulative: {...cumulative}, hasUnassignedExpenses: unassigned});
  }
  result.valid = true;
  result.totals = {...cumulative};
  result.incomplete = Boolean(timeline.incomplete || hasMissingMonths || hasMissingAmounts || hasUnassignedExpenses);
  result.warnings = Array.isArray(timeline.warnings) ? timeline.warnings.filter(value => typeof value === 'string') : [];
  result.warnings.push('Proyección desde cero: supone conservar todo el disponible mensual. No añade ahorros previos ni el dinero prestado por mamá.');
  result.warnings.push('El mes de compra queda fuera: sus nóminas y pagas extra podrían cobrarse después de firmar.');
  if (hasMissingMonths) result.warnings.push('Faltan meses antes de la compra; no se inventa ahorro para cubrir los huecos del calendario.');
  if (hasMissingAmounts) result.warnings.push('Hay importes pendientes: el acumulado afectado queda por completar desde ese mes.');
  if (hasUnassignedExpenses) result.warnings.push('El total familiar descuenta los gastos sin pagador; los acumulados personales aún no descuentan esa parte y no deben sumarse como ahorro disponible.');
  if (result.points.some(point => SERIES.some(role => point.cumulative[role] !== null && point.cumulative[role] < 0))) result.warnings.push('Los saldos negativos se conservan: indican dinero que falta, no ahorro disponible.');
  if (!result.points.length) result.warnings.push('No hay meses completos anteriores a la compra dentro del calendario mostrado.');
  result.warnings = [...new Set(result.warnings)];
  return result;
}
