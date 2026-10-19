const ROLES = ['buyer1', 'buyer2', 'mother', 'sister'];
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
const validMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900;
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const byRole = () => Object.fromEntries(ROLES.map(role => [role, 0]));
const activeAt = (item, month) => (item.startMonth === null || item.startMonth <= month) && (item.endMonth === null || item.endMonth >= month);

/** Extra personal payments, independent of the existing master loan. */
export function normalizePersonalCommitments(rawPlan = {}) {
  const errors = [], raw = isRecord(rawPlan) ? rawPlan : {};
  if (!isRecord(rawPlan)) errors.push('La planificación de los pagos personales debe ser un objeto válido.');
  if (raw.personalCommitments !== undefined && !Array.isArray(raw.personalCommitments)) errors.push('Los pagos personales deben ser una lista.');
  const seen = new Set();
  const personalCommitments = (Array.isArray(raw.personalCommitments) ? raw.personalCommitments : []).map((value, index) => {
    if (!isRecord(value)) { errors.push(`El pago personal ${index + 1} debe ser un objeto válido.`); return value; }
    const item = {owner: 'buyer1', kind: 'debt', startMonth: null, endMonth: null, settleWithReceipt: false, payoffEstimate: null, payoffFeeRate: 0, ...structuredClone(value)};
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || seen.has(item.id)) errors.push('Cada pago personal necesita un identificador válido y distinto.');
    seen.add(item.id);
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 120) errors.push('Cada pago personal necesita un nombre de hasta 120 caracteres.');
    if (!ROLES.includes(item.owner)) errors.push('Asigna cada pago personal a una de las cuatro personas.');
    if (!['debt', 'expense'].includes(item.kind)) errors.push('Distingue cada pago personal entre deuda y gasto.');
    if (!finite(item.monthly) || Number(item.monthly) < 0) errors.push('La cuota de cada pago personal debe ser un importe no negativo.');
    if (finite(item.monthly)) item.monthly = Number(item.monthly);
    for (const key of ['startMonth', 'endMonth']) if (item[key] !== null && !validMonth(item[key])) errors.push('Los pagos personales necesitan meses válidos con formato AAAA-MM.');
    if (validMonth(item.startMonth) && validMonth(item.endMonth) && item.startMonth > item.endMonth) errors.push('El inicio de un pago personal no puede ser posterior a su final.');
    if (typeof item.settleWithReceipt !== 'boolean') errors.push('Indica si cada deuda se cancelaría con el cobro extraordinario.');
    if (item.kind !== 'debt' && item.settleWithReceipt === true) errors.push('El cobro extraordinario solo puede cancelar pagos clasificados como deuda.');
    if (item.payoffEstimate !== null && (!finite(item.payoffEstimate) || Number(item.payoffEstimate) < 0)) errors.push('El capital estimado de cancelación debe ser no negativo o quedar pendiente.');
    if (finite(item.payoffEstimate)) item.payoffEstimate = Number(item.payoffEstimate);
    if (!finite(item.payoffFeeRate) || Number(item.payoffFeeRate) < 0 || Number(item.payoffFeeRate) > 1) errors.push('La comisión estimada de cancelación debe estar entre el 0 % y el 100 %.');
    if (finite(item.payoffFeeRate)) item.payoffFeeRate = Number(item.payoffFeeRate);
    return item;
  });
  if (raw.extraordinaryReceipt !== undefined && !isRecord(raw.extraordinaryReceipt)) errors.push('El cobro extraordinario debe ser un objeto válido.');
  const extraordinaryReceipt = {enabled: false, month: null, amount: 0, taxReserve: 0, owner: 'buyer1', confirmed: false, ...(isRecord(raw.extraordinaryReceipt) ? structuredClone(raw.extraordinaryReceipt) : {})};
  if (typeof extraordinaryReceipt.enabled !== 'boolean' || typeof extraordinaryReceipt.confirmed !== 'boolean') errors.push('Indica si el cobro extraordinario se simula y si está confirmado.');
  if (!ROLES.includes(extraordinaryReceipt.owner)) errors.push('Asigna el cobro extraordinario a una de las cuatro personas.');
  if (!finite(extraordinaryReceipt.amount) || Number(extraordinaryReceipt.amount) < 0) errors.push('El cobro extraordinario debe ser un importe no negativo.');
  if (finite(extraordinaryReceipt.amount)) extraordinaryReceipt.amount = Number(extraordinaryReceipt.amount);
  if (!finite(extraordinaryReceipt.taxReserve) || Number(extraordinaryReceipt.taxReserve) < 0 || extraordinaryReceipt.enabled && Number(extraordinaryReceipt.taxReserve) > Number(extraordinaryReceipt.amount)) errors.push('La reserva fiscal del cobro extraordinario debe ser no negativa y no superar el cobro simulado.');
  if (finite(extraordinaryReceipt.taxReserve)) extraordinaryReceipt.taxReserve = Number(extraordinaryReceipt.taxReserve);
  if (extraordinaryReceipt.month !== null && !validMonth(extraordinaryReceipt.month)) errors.push('El cobro extraordinario necesita un mes válido con formato AAAA-MM.');
  if (extraordinaryReceipt.enabled && (!validMonth(extraordinaryReceipt.month) || !finite(extraordinaryReceipt.amount) || Number(extraordinaryReceipt.amount) <= 0)) errors.push('Para simular el cobro extraordinario indica su mes y un importe mayor que cero.');
  if (extraordinaryReceipt.enabled && personalCommitments.some(item => isRecord(item) && item.settleWithReceipt === true && item.owner !== extraordinaryReceipt.owner)) errors.push('Las deudas canceladas deben pertenecer a la persona que recibe el cobro extraordinario.');
  if (raw.publicTransport !== undefined && !isRecord(raw.publicTransport)) errors.push('El transporte público debe ser un objeto válido.');
  const publicTransport = {buyer2Monthly: 0, motherMonthly: 0, sisterMonthly: 0, sisterBeforePurchaseMotherShare: .5, ...(isRecord(raw.publicTransport) ? structuredClone(raw.publicTransport) : {})};
  for (const key of ['buyer2Monthly', 'motherMonthly', 'sisterMonthly']) {
    if (!finite(publicTransport[key]) || Number(publicTransport[key]) < 0) errors.push('Las provisiones mensuales de transporte público deben ser importes no negativos.');
    if (finite(publicTransport[key])) publicTransport[key] = Number(publicTransport[key]);
  }
  if (!finite(publicTransport.sisterBeforePurchaseMotherShare) || Number(publicTransport.sisterBeforePurchaseMotherShare) < 0 || Number(publicTransport.sisterBeforePurchaseMotherShare) > 1) errors.push('La parte del transporte de la hermana pagada por mamá antes de comprar debe estar entre el 0 % y el 100 %.');
  if (finite(publicTransport.sisterBeforePurchaseMotherShare)) publicTransport.sisterBeforePurchaseMotherShare = Number(publicTransport.sisterBeforePurchaseMotherShare);
  return {personalCommitments, extraordinaryReceipt, publicTransport, errors: [...new Set(errors)]};
}

/** Monthly reserves for tickets; purchase only changes the agreed payer. */
export function calculatePublicTransport(rawPlan = {}, {owning = false} = {}) {
  const {publicTransport, errors} = normalizePersonalCommitments(rawPlan), byOwner = byRole();
  if (errors.length) return {valid: false, errors, byOwner, total: null};
  const sisterCents = Math.round(publicTransport.sisterMonthly * 100);
  const motherShareCents = owning ? 0 : Math.round(sisterCents * publicTransport.sisterBeforePurchaseMotherShare);
  byOwner.buyer2 = money(publicTransport.buyer2Monthly);
  byOwner.mother = money(publicTransport.motherMonthly + motherShareCents / 100);
  byOwner.sister = money((sisterCents - motherShareCents) / 100);
  return {valid: true, errors: [], byOwner, total: money(Object.values(byOwner).reduce((sum, amount) => sum + amount, 0))};
}

/**
 * A dated cash hypothesis, never salary. Payoff estimates remain the supplied
 * balances: without a lender amortization statement, a whole installment
 * cannot safely be deducted as principal. The actual payoff must be quoted.
 */
export function calculatePersonalCommitments(rawPlan = {}, {asOfMonth} = {}) {
  const normalized = normalizePersonalCommitments(rawPlan), {personalCommitments, extraordinaryReceipt: receipt} = normalized;
  const errors = [...normalized.errors];
  if (!validMonth(asOfMonth)) errors.push('Los pagos personales necesitan un mes de cálculo válido con formato AAAA-MM.');
  const debtByOwner = byRole(), expenseByOwner = byRole(), extraordinaryIncomeByOwner = byRole(), debtSettlementByOwner = byRole(), reservedExtraordinaryByOwner = byRole();
  const activeByOwner = Object.fromEntries(ROLES.map(role => [role, []]));
  if (errors.length) return {valid: false, errors: [...new Set(errors)], debtByOwner, expenseByOwner, activeByOwner, extraordinaryIncomeByOwner, debtSettlementByOwner, reservedExtraordinaryByOwner, extraordinarySettlement: null};
  const selected = receipt.enabled ? personalCommitments.filter(item => item.kind === 'debt' && item.settleWithReceipt && activeAt(item, receipt.month)) : [];
  const knownPayoff = selected.every(item => item.payoffEstimate !== null);
  const fees = selected.map(item => item.payoffEstimate === null ? null : money(item.payoffEstimate * item.payoffFeeRate));
  const feeTotal = knownPayoff ? money(fees.reduce((sum, amount) => sum + amount, 0)) : null;
  const totalPayoffEstimate = knownPayoff ? money(selected.reduce((sum, item) => sum + item.payoffEstimate, 0) + feeTotal) : null;
  const availableForSettlement = money(receipt.amount - receipt.taxReserve);
  const canSettle = receipt.enabled && selected.length > 0 && knownPayoff && availableForSettlement >= totalPayoffEstimate;
  const applied = canSettle && asOfMonth >= receipt.month;
  const extraordinarySettlement = {
    planned: receipt.enabled, month: receipt.month, owner: receipt.owner, receiptAmount: receipt.amount,
    totalPayoffEstimate, feeTotal, taxReserve: receipt.taxReserve, availableForSettlement,
    estimatedRemainder: knownPayoff ? money(availableForSettlement - totalPayoffEstimate) : null,
    fundingGap: knownPayoff ? money(Math.max(0, totalPayoffEstimate - availableForSettlement)) : null,
    canSettle, applied, confirmed: receipt.confirmed, estimated: true,
    items: selected.map((item, index) => ({id: item.id, label: item.label, owner: item.owner, principalEstimate: item.payoffEstimate, feeEstimate: fees[index]})),
  };
  const selectedIds = new Set(selected.map(item => item.id));
  for (const item of personalCommitments) {
    if (!activeAt(item, asOfMonth) || applied && selectedIds.has(item.id)) continue;
    activeByOwner[item.owner].push({...item, amount: money(item.monthly)});
    const amounts = item.kind === 'debt' ? debtByOwner : expenseByOwner;
    amounts[item.owner] = money(amounts[item.owner] + item.monthly);
  }
  if (receipt.enabled && asOfMonth === receipt.month) {
    extraordinaryIncomeByOwner[receipt.owner] = money(receipt.amount);
    reservedExtraordinaryByOwner[receipt.owner] = money(receipt.taxReserve);
    if (canSettle) debtSettlementByOwner[receipt.owner] = totalPayoffEstimate;
  }
  return {valid: true, errors: [], debtByOwner, expenseByOwner, activeByOwner, extraordinaryIncomeByOwner, debtSettlementByOwner, reservedExtraordinaryByOwner, extraordinarySettlement};
}
