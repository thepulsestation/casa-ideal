import { DEFAULT_SCENARIO, normalizeScenario } from './finance.mjs?v=34';
import {normalizeCommute,validateCommute,createCommuteForProperty} from './commute.mjs?v=34';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const LISTING_KEYS = new Set(['city', 'surfaceM2', 'beds', 'baths', 'reference', 'title', 'sourceReadAt']);
const PROPERTY_BUDGET_DEFAULTS = Object.freeze({
  ibiAnnual: 0,
  wasteAnnual: 0,
  communityMonthly: 0,
  maintenanceAnnual: 0,
  propertyCostsEstimated: false,
  propertyCostsConfirmed: false,
  ibiLiquidableBase: null,
  ibiRatePercent: null,
  externalHomeInsuranceAnnual: null,
});

function safeUrl(value, protocols) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return protocols.includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** Accepts only absolute HTTPS image URLs without embedded credentials. */
export function safeImageUrl(value) { return safeUrl(value, ['https:']); }

function finiteNumber(value) {
  return ['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isFinite(Number(value));
}

/**
 * Pure metadata validation. Returns {valid, errors, details}; details is null
 * when invalid. Does not fetch a listing, infer facts, or change a scenario.
 */
export function validateHousingDetails(raw = {}) {
  if (!isRecord(raw)) return { valid: false, errors: ['Los datos de la vivienda deben ser un objeto.'], details: null };
  const errors = [];
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > 120) errors.push('El nombre de la vivienda debe tener entre 1 y 120 caracteres.');
  const purchasePrice = finiteNumber(raw.purchasePrice) ? Number(raw.purchasePrice) : null;
  if (purchasePrice === null || purchasePrice <= 0) errors.push('El precio debe ser un número mayor que cero.');
  let url = '';
  if (raw.url !== undefined && raw.url !== '') {
    if (typeof raw.url !== 'string') errors.push('El enlace del anuncio debe ser texto.');
    else if (raw.url.trim()) {
      url = safeUrl(raw.url, ['https:', 'http:']);
      if (!url) errors.push('El anuncio debe usar una dirección HTTP o HTTPS sin contraseñas.');
    }
  }
  const propertyType = raw.propertyType === undefined ? 'flat' : raw.propertyType;
  if (!['flat', 'house'].includes(propertyType)) errors.push('Selecciona piso o casa.');
  const taxMode = raw.taxMode === undefined ? 'used' : raw.taxMode;
  if (!['used', 'new'].includes(taxMode)) errors.push('Selecciona segunda mano u obra nueva.');
  const notes = raw.notes === undefined ? '' : raw.notes;
  if (typeof notes !== 'string' || notes.length > 5000) errors.push('Las notas deben ser texto de hasta 5.000 caracteres.');
  const images = [];
  if (raw.images !== undefined) {
    if (!Array.isArray(raw.images) || raw.images.length > 8) errors.push('Puedes añadir hasta ocho direcciones de imágenes.');
    else for (const image of raw.images) {
      const normalized = safeImageUrl(image);
      if (!normalized) errors.push('Cada imagen debe tener una URL HTTPS válida sin contraseñas.');
      else if (!images.includes(normalized)) images.push(normalized);
    }
  }
  const listingDetails = {};
  const listing = raw.listingDetails === undefined ? {} : raw.listingDetails;
  if (!isRecord(listing)) errors.push('Los detalles del anuncio deben ser un objeto.');
  else {
    if (Object.keys(listing).some(key => !LISTING_KEYS.has(key))) errors.push('Hay detalles del anuncio no admitidos.');
    for (const [key, limit, label] of [['city', 120, 'La localidad'], ['reference', 120, 'La referencia'], ['title', 240, 'El título del anuncio']]) {
      const value = listing[key];
      if (value === null || value === undefined || value === '') continue;
      if (typeof value !== 'string' || value.trim().length > limit) errors.push(`${label} debe ser texto de hasta ${limit} caracteres.`);
      else if (value.trim()) listingDetails[key] = value.trim();
    }
    for (const [key, integer, label] of [['surfaceM2', false, 'La superficie'], ['beds', true, 'Las habitaciones'], ['baths', true, 'Los baños']]) {
      const value = listing[key];
      if (value === null || value === undefined || value === '') continue;
      if (!finiteNumber(value) || Number(value) < 0 || (integer && !Number.isInteger(Number(value)))) errors.push(`${label} deben indicarse con un número no negativo${integer ? ' entero' : ''}.`);
      else listingDetails[key] = Number(value);
    }
    if (listing.sourceReadAt !== undefined && listing.sourceReadAt !== null && listing.sourceReadAt !== '') {
      if (typeof listing.sourceReadAt !== 'string' || !Number.isFinite(Date.parse(listing.sourceReadAt))) errors.push('La fecha de consulta del anuncio no es válida.');
      else listingDetails.sourceReadAt = new Date(listing.sourceReadAt).toISOString();
    }
  }
  const commute=raw.commute===undefined?normalizeCommute({},listingDetails.city||''):raw.commute;
  errors.push(...validateCommute(commute).errors);
  return errors.length ? { valid: false, errors: [...new Set(errors)], details: null } : {
    valid: true,
    errors: [],
    details: { name, url, purchasePrice, propertyType, taxMode, images, notes: notes.trim(), listingDetails,commute:normalizeCommute(commute,listingDetails.city||'') },
  };
}

/** Returns a detached metadata snapshot suitable for an add/edit form. */
export function getHousingDetails(s = {}) {
  return {
    name: s.name ?? '',
    url: s.url ?? '',
    purchasePrice: s.purchasePrice ?? null,
    propertyType: s.propertyType ?? 'flat',
    taxMode: s.tax?.mode ?? 'used',
    images: structuredClone(s.images ?? []),
    notes: s.notes ?? '',
    listingDetails: structuredClone(s.listingDetails ?? {}),
    commute: normalizeCommute(s.commute,s.listingDetails?.city||''),
  };
}

function requireDetails(raw) {
  const validation = validateHousingDetails(raw);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  return validation.details;
}

function applyMetadata(scenario, details) {
  const { taxMode, ...metadata } = details;
  Object.assign(scenario, metadata);
  scenario.tax = { ...scenario.tax, mode: taxMode };
  return scenario;
}

/**
 * Updates metadata only. Partial patches are accepted; existing financial data,
 * identifiers, timestamps, and estimates remain unchanged. No save is performed.
 */
export function updateHousingDetails(scenario, patch = {}) {
  if (!isRecord(scenario) || !isRecord(patch)) throw new Error('La vivienda y sus cambios deben ser objetos válidos.');
  const previous = getHousingDetails(scenario);
  const merged = { ...previous, ...patch };
  if (isRecord(patch.listingDetails)) merged.listingDetails = { ...previous.listingDetails, ...patch.listingDetails };
  if (isRecord(patch.commute)) merged.commute = { ...previous.commute, ...patch.commute };
  const details = requireDetails(merged);
  const updated=applyMetadata(structuredClone(scenario), details);
  if(patch.commute===undefined&&details.listingDetails.city!==previous.listingDetails.city&&!previous.commute.originExact)updated.commute=createCommuteForProperty(details.listingDetails.city||'',previous.commute);
  return updated;
}

/**
 * Starts a different property using the same family budget and editable TIN.
 * New properties explore Sabadell 80% + ICF up to 20%, pending eligibility.
 * The result deliberately has no identity/timestamps until the caller saves it.
 * Property amounts and approvals are reset; no eligibility or price is inferred.
 */
export function createHousingScenario(current = {}, rawDetails = {}) {
  const details = requireDetails(rawDetails);
  const source = normalizeScenario(structuredClone(current));
  if (source._structureErrors?.length) throw new Error('Revisa la estructura del presupuesto familiar antes de añadir otra vivienda.');
  const fresh = normalizeScenario();
  fresh.budget = { ...structuredClone(source.budget), ...PROPERTY_BUDGET_DEFAULTS };
  fresh.mortgage = structuredClone(source.mortgage);
  fresh.mortgage.amount = null;
  fresh.mortgage.ltv = 0.8;
  fresh.mortgage.discounts = fresh.mortgage.discounts.map(product => product.id === 'payroll' ? product : { ...product, cost: null, quoteKnown: false });
  // Personal ownership shares/rates and individually confirmed buyer profiles
  // are retained exactly; property-specific tax settings start from defaults.
  fresh.tax = { ...structuredClone(DEFAULT_SCENARIO.tax), buyers: structuredClone(source.tax.buyers), mode: details.taxMode };
  fresh.cash = { ...structuredClone(DEFAULT_SCENARIO.cash), savings: source.cash.savings, familyLoanAvailableBeforeDeposit: true };
  fresh.purchaseCosts = { ...structuredClone(DEFAULT_SCENARIO.purchaseCosts), mode: 'provision', provisionBasis: 'percent', provisionPercent: 2, provisionAmount: 5000, provisionBeforeSigning: 0 };
  fresh.appraisalValue = null;
  fresh.referenceValue = null;
  fresh.declaredValue = null;
  fresh.familyLoan = {
    ...structuredClone(DEFAULT_SCENARIO.familyLoan),
    enabled: true,
    amount: null,
    rate: 5,
    years: 10,
    assumedTerms: true,
    extraBuffer: 3000,
    maxAmount: 60000,
    coverEarlyLiquidity: true,
  };
  // A family-supplied offer and negotiated hypotheses travel with the family;
  // the amount is resized for the new property instead of copying the old loan.
  if(source.familyLoan.referenceOffer||source.familyLoan.negotiation||source.familyLoan.reportedLimit) {
    fresh.familyLoan={...structuredClone(source.familyLoan),enabled:true,amount:null,coverEarlyLiquidity:true};
  }
  // Preserve the real independent family contract, including a chosen 0% rate.
  // Changing the bank term must not silently change the children's obligation.
  fresh.motherTransfer = structuredClone(source.motherTransfer);
  fresh.motherTransfer.giftNotaryCost = 0;
  fresh.icf = { ...structuredClone(DEFAULT_SCENARIO.icf), enabled: true, eligibilityConfirmed: false };
  fresh.stress = structuredClone(source.stress);
  fresh.financingPlanVersion = 2;
  const created=applyMetadata(fresh, details);
  if(rawDetails.commute===undefined)created.commute=createCommuteForProperty(details.listingDetails.city||'',source.commute);
  return created;
}
