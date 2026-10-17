// One shared household budget; property taxes, insurance and upkeep stay per home.
export const FAMILY_PROFILE_ID = 'casa-ideal-family-budget-v1';
const BUDGET_KEYS = ['incomes','householdIncomes','existingDebtMonthly','familyIncomeMonthly','familyExistingDebtMonthly','utilitiesMode','utilitiesMonthly','utilityBreakdown','sharedLivingCosts','currentUtilitiesMode','currentUtilitiesMonthly','currentUtilityBreakdown','currentRent','currentOtherMonthly','carMonthly','foodMonthly','storageMonthly','otherMonthly','debtRatioLimit'];
export const isFamilyProfile = row => row?.id === FAMILY_PROFILE_ID && row?.kind === 'family-budget';
export function isFamilyField(path) { return path === 'cash.savings' || path.startsWith('stress.') || BUDGET_KEYS.some(key => path === 'budget.'+key || path.startsWith('budget.'+key+'.')); }
export function extractFamilyProfile(s, previous = null) {
 const budget = Object.fromEntries(BUDGET_KEYS.filter(key=>Object.hasOwn(s.budget||{},key)).map(key=>[key,structuredClone(s.budget[key])]));
 // Old already-open clients do not know this record type. Explicit invalid
 // property metadata prevents them inventing a 250000-euro default example.
 return {id:FAMILY_PROFILE_ID,kind:'family-budget',version:1,name:'Presupuesto familiar · recarga Casa Ideal',purchasePrice:0,budget,cash:{savings:s.cash?.savings??0},stress:structuredClone(s.stress||{}),...(previous?.createdAt?{createdAt:previous.createdAt}:{}),...(previous?.updatedAt?{updatedAt:previous.updatedAt}:{})};
}
export function applyFamilyProfile(s, profile) {
 if(!isFamilyProfile(profile))return s;
 const safe=extractFamilyProfile(profile);
 return {...s,budget:{...s.budget,...safe.budget},cash:{...s.cash,...safe.cash},stress:{...s.stress,...safe.stress}};
}
