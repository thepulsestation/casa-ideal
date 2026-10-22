// One shared household budget; property taxes, mortgage insurance and upkeep stay per home.
export const FAMILY_PROFILE_ID = 'casa-ideal-family-budget-v1';
const BUDGET_KEYS = ['incomes','householdIncomes','existingDebtMonthly','familyIncomeMonthly','familyExistingDebtMonthly','utilitiesMode','utilitiesMonthly','utilityBreakdown','sharedLivingCosts','currentUtilitiesMode','currentUtilitiesMonthly','currentUtilityBreakdown','currentRent','currentOtherMonthly','carMonthly','foodMonthly','storageMonthly','otherMonthly','familyInsuranceMonthly','debtRatioLimit'];
export const isFamilyProfile = row => row?.id === FAMILY_PROFILE_ID && row?.kind === 'family-budget';
export function isFamilyField(path) { return path === 'purchaseStory' || path.startsWith('purchaseStory.') || path === 'homeSearch' || path.startsWith('homeSearch.') || path === 'familyPlan' || path.startsWith('familyPlan.') || path === 'cash.savings' || path.startsWith('stress.') || BUDGET_KEYS.some(key => path === 'budget.'+key || path.startsWith('budget.'+key+'.')); }
export function extractFamilyProfile(s, previous = null) {
 const budget = Object.fromEntries(BUDGET_KEYS.filter(key=>Object.hasOwn(s.budget||{},key)).map(key=>[key,structuredClone(s.budget[key])]));
 // Old already-open clients do not know this record type. Explicit invalid
 // property metadata prevents them inventing a 250000-euro default example.
 const homeSearch=s.homeSearch??previous?.homeSearch;
 const purchaseStory=s.purchaseStory??previous?.purchaseStory;
 return {id:FAMILY_PROFILE_ID,kind:'family-budget',version:1,name:'Presupuesto familiar · recarga Casa Ideal',purchasePrice:0,budget,cash:{savings:s.cash?.savings??0},stress:structuredClone(s.stress||{}),...(s.familyPlan!==undefined?{familyPlan:structuredClone(s.familyPlan)}:{}),...(homeSearch&&typeof homeSearch==='object'&&!Array.isArray(homeSearch)?{homeSearch:structuredClone(homeSearch)}:{}),...(purchaseStory&&typeof purchaseStory==='object'&&!Array.isArray(purchaseStory)?{purchaseStory:structuredClone(purchaseStory)}:{}),...(previous?.createdAt?{createdAt:previous.createdAt}:{}),...(previous?.updatedAt?{updatedAt:previous.updatedAt}:{})};
}
export function applyFamilyProfile(s, profile) {
 if(!isFamilyProfile(profile))return s;
 const safe=extractFamilyProfile(profile);
 const budget={...s.budget,...safe.budget},rules=safe.purchaseStory;
 // Only an explicitly linked estimate follows the shared reserve. A receipt or
 // a manual property amount remains local; community never follows the generic one.
 if(budget.ownershipProvisionFromRules===true&&budget.propertyCostsConfirmed!==true&&rules){
  for(const [key,rule] of [['ibiAnnual','ownershipAnnual'],['wasteAnnual','wasteAnnual']]){
   if(typeof rules[rule]==='number'&&Number.isFinite(rules[rule])&&rules[rule]>=0)budget[key]=rules[rule];
  }
  budget.maintenanceAnnual=0;budget.ownershipProvisionCombined=true;budget.propertyCostsEstimated=true;
 }
 return {...s,budget,cash:{...s.cash,...safe.cash},stress:{...s.stress,...safe.stress},...(safe.familyPlan!==undefined?{familyPlan:safe.familyPlan}:{}),...(safe.homeSearch!==undefined?{homeSearch:safe.homeSearch}:{}),...(safe.purchaseStory!==undefined?{purchaseStory:safe.purchaseStory}:{})};
}
