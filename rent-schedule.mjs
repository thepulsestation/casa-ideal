const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
const isMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900;
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const DEFAULT_RENT_CHANGE = Object.freeze({enabled: false, fromMonth: null, monthly: 0});

/** An optional dated replacement of the base rent, never a new expense. */
export function normalizeRentChange(raw) {
  const errors = [];
  if (raw === undefined) raw = {};
  if (!isRecord(raw)) { errors.push('La actualización del alquiler debe ser un objeto válido.'); raw = {}; }
  const rentChange = {...DEFAULT_RENT_CHANGE, ...raw};
  if (typeof rentChange.enabled !== 'boolean') errors.push('Indica si se utiliza la actualización del alquiler.');
  if (rentChange.fromMonth !== null && !isMonth(rentChange.fromMonth)) errors.push('La actualización del alquiler necesita un mes válido con formato AAAA-MM.');
  if (rentChange.enabled === true && !isMonth(rentChange.fromMonth)) errors.push('Indica desde qué mes cambia el alquiler.');
  if (!finite(rentChange.monthly) || Number(rentChange.monthly) < 0) errors.push('El nuevo alquiler debe ser un importe no negativo.');
  else rentChange.monthly = money(rentChange.monthly);
  return {rentChange, errors};
}

export function currentRentForMonth(baseRent, rawChange, asOfMonth) {
  const {rentChange, errors} = normalizeRentChange(rawChange);
  return errors.length === 0 && rentChange.enabled && isMonth(asOfMonth) && asOfMonth >= rentChange.fromMonth
    ? rentChange.monthly : money(baseRent);
}
