import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario} from './finance.mjs';
import {FAMILY_PROFILE_ID,isFamilyProfile,isFamilyField,extractFamilyProfile,applyFamilyProfile} from './family-profile.mjs';

const scenario=()=>normalizeScenario({id:'home-a',name:'Casa A',purchasePrice:190000,
 budget:{incomes:[{monthly:2300,payments:12},{monthly:1700,payments:14}],householdIncomes:[{id:'mother',monthly:1200,payments:14},{id:'sister',monthly:0,payments:12}],foodMonthly:500,storageMonthly:65,utilitiesMode:'detailed',utilityBreakdown:{waterMonthly:30,energyMonthly:80,internetMonthly:40},ibiAnnual:850,wasteAnnual:180,communityMonthly:25,maintenanceAnnual:300,propertyCostsConfirmed:true},
 cash:{savings:2500,depositPercent:.1},stress:{incomeDropPercent:15}});

test('the reserved profile requires both its exact identifier and kind',()=>{
 assert.equal(isFamilyProfile({id:FAMILY_PROFILE_ID,kind:'family-budget'}),true);
 for(const row of [null,{}, {id:FAMILY_PROFILE_ID},{id:'home-a',kind:'family-budget'},{id:FAMILY_PROFILE_ID,kind:'home'}])assert.equal(isFamilyProfile(row),false);
});

test('the guided purchase rules follow the shared family without replacing a saved home',()=>{
 const first=scenario();first.purchaseStory={revision:1,mode:'fixed',ownershipAnnual:2000,wasteAnnual:100,selectedCase:'principal'};
 const profile=extractFamilyProfile(first),other=scenario();other.id='other-home';other.purchasePrice=220000;
 assert.equal(isFamilyField('purchaseStory.ownershipAnnual'),true);
 const applied=applyFamilyProfile(other,profile);
 assert.deepEqual(applied.purchaseStory,first.purchaseStory);assert.equal(applied.purchasePrice,220000);
 profile.purchaseStory.ownershipAnnual=1750;assert.equal(first.purchaseStory.ownershipAnnual,2000);
 const preserved=extractFamilyProfile(other,profile);assert.equal(preserved.purchaseStory.ownershipAnnual,1750);
});

test('family fields include nested income and bill edits, while property costs stay per home',()=>{
 for(const path of ['budget.incomes.0.monthly','budget.householdIncomes.0.payments','budget.utilityBreakdown.energyMonthly','budget.foodMonthly','budget.currentRent','budget.storageMonthly','budget.debtRatioLimit','cash.savings','stress.unexpectedCost'])assert.equal(isFamilyField(path),true,path);
 for(const path of ['budget.ibiAnnual','budget.wasteAnnual','budget.communityMonthly','budget.maintenanceAnnual','budget.propertyCostsEstimated','budget.externalHomeInsuranceAnnual','budget.foodMonthlyExtra','cash.depositAmount','mortgage.years','familyLoan.rate','favorite','purchasePrice'])assert.equal(isFamilyField(path),false,path);
});

test('profile extraction is whitelisted, detached and preserves only previous server revisions',()=>{
 const source=scenario(),before=structuredClone(source);
 const profile=extractFamilyProfile(source,{createdAt:'created',updatedAt:'revision',name:'Old house',favorite:true});
 assert.equal(profile.id,FAMILY_PROFILE_ID);assert.equal(profile.kind,'family-budget');assert.equal(profile.version,1);
 assert.equal(profile.createdAt,'created');assert.equal(profile.updatedAt,'revision');
 assert.equal(profile.budget.foodMonthly,500);assert.equal(profile.budget.storageMonthly,65);
 assert.deepEqual(profile.cash,{savings:2500});assert.equal(profile.stress.incomeDropPercent,15);
 for(const key of ['ibiAnnual','wasteAnnual','communityMonthly','maintenanceAnnual','propertyCostsConfirmed','externalHomeInsuranceAnnual'])assert.equal(Object.hasOwn(profile.budget,key),false,key);
 assert.equal(profile.purchasePrice,0);assert.equal(profile.name,'Presupuesto familiar · recarga Casa Ideal');
 for(const key of ['mortgage','tax','familyLoan','motherTransfer','images','favorite'])assert.equal(Object.hasOwn(profile,key),false,key);
 profile.budget.incomes[0].monthly=1;profile.budget.utilityBreakdown.waterMonthly=2;profile.stress.incomeDropPercent=3;
 assert.deepEqual(source,before);
});

test('applying common data retains each property financial conditions, IBI and identity',()=>{
 const source=scenario(),profile=extractFamilyProfile(source);
 const other=normalizeScenario({id:'home-b',name:'Casa B',purchasePrice:225000,budget:{foodMonthly:100,ibiAnnual:1350,wasteAnnual:250,communityMonthly:55,maintenanceAnnual:900},cash:{savings:0,depositAmount:12000},familyLoan:{rate:7,years:12}});
 const before=structuredClone(other),applied=applyFamilyProfile(other,profile);
 assert.equal(applied.id,'home-b');assert.equal(applied.name,'Casa B');assert.equal(applied.purchasePrice,225000);
 assert.equal(applied.budget.foodMonthly,500);assert.equal(applied.budget.ibiAnnual,1350);
 assert.equal(applied.budget.wasteAnnual,250);assert.equal(applied.budget.communityMonthly,55);assert.equal(applied.budget.maintenanceAnnual,900);
 assert.equal(applied.cash.savings,2500);assert.equal(applied.cash.depositAmount,12000);
 assert.deepEqual(applied.mortgage,other.mortgage);assert.deepEqual(applied.familyLoan,other.familyLoan);assert.deepEqual(applied.tax,other.tax);
 applied.budget.incomes[0].monthly=0;
 assert.equal(profile.budget.incomes[0].monthly,2300);assert.deepEqual(other,before);
});

test('a profile cannot smuggle property-specific fields through common-budget application',()=>{
 const source=scenario(),profile=extractFamilyProfile(source);
 profile.budget.ibiAnnual=9999;profile.budget.communityMonthly=9999;profile.cash.depositAmount=9999;
 profile.name='Injected name';profile.mortgage={amount:1};profile.tax={mode:'new'};
 const applied=applyFamilyProfile(source,profile);
 assert.equal(applied.name,source.name);assert.equal(applied.budget.ibiAnnual,850);assert.equal(applied.budget.communityMonthly,25);
 assert.equal(applied.cash.depositAmount,source.cash.depositAmount);assert.deepEqual(applied.mortgage,source.mortgage);assert.deepEqual(applied.tax,source.tax);
 assert.equal(applyFamilyProfile(source,{...profile,id:'other-profile'}),source);
});

test('a dated personal-expense plan is shared and detached without replacing a home loan',()=>{
 const first=scenario();first.familyPlan={sharedCostMode:'equal',personalDebtOwner:'buyer1',university:{amount:425,endMonth:'2027-06'},sisterJob:{enabled:true,amount:450,startMonth:'2027-01'}};
 const profile=extractFamilyProfile(first),other=normalizeScenario({id:'second-home',familyLoan:{maxAmount:18000,years:8}});
 const applied=applyFamilyProfile(other,profile);
 assert.deepEqual(applied.familyPlan,first.familyPlan);
 assert.equal(applied.familyLoan.maxAmount,18000);assert.equal(applied.familyLoan.years,8);
 applied.familyPlan.university.amount=0;assert.equal(profile.familyPlan.university.amount,425);
 for(const path of ['familyPlan.sharedCostMode','familyPlan.university.amount','familyPlan.sisterJob.startMonth'])assert.equal(isFamilyField(path),true);
 assert.equal(isFamilyField('familyPlanExtra.amount'),false);
});

test('family insurance and the expiring personal policy are shared across homes without becoming mortgage insurance or debt', () => {
 const first = scenario(); first.budget.familyInsuranceMonthly = 243;
 first.familyPlan = {personalCommitments: [{id: 'personal-insurance', label: 'Personal policy', owner: 'buyer1', kind: 'expense', monthly: 30, endMonth: '2027-02'}]};
 const profile = extractFamilyProfile(first), other = scenario();
 other.budget.familyInsuranceMonthly = 0; other.budget.externalHomeInsuranceAnnual = 360;
 other.budget.familyExistingDebtMonthly = 40;
 const applied = applyFamilyProfile(other, profile);
 assert.equal(isFamilyField('budget.familyInsuranceMonthly'), true);
 assert.equal(profile.budget.familyInsuranceMonthly, 243);
 assert.equal(applied.budget.familyInsuranceMonthly, 243);
 assert.equal(applied.budget.externalHomeInsuranceAnnual, 360);
 assert.equal(applied.budget.familyExistingDebtMonthly, first.budget.familyExistingDebtMonthly);
 assert.equal(applied.familyPlan.personalCommitments[0].kind, 'expense');
 assert.equal(applied.familyPlan.personalCommitments[0].endMonth, '2027-02');
 applied.familyPlan.personalCommitments[0].monthly = 0;
 assert.equal(profile.familyPlan.personalCommitments[0].monthly, 30);
 assert.equal(other.budget.familyInsuranceMonthly, 0);
});

test('generic bank search and presentation share their settings without changing a saved home',()=>{
 const source=scenario();source.homeSearch={selectedBank:'santander',ownership:{ibiAnnual:1500},offers:{santander:{baseRate:3.95,fullRate:2.95}}};
 const profile=extractFamilyProfile(source),other=scenario(),before=structuredClone(other);
 const applied=applyFamilyProfile(other,profile);
 assert.equal(isFamilyField('homeSearch.ownership.ibiAnnual'),true);
 assert.equal(isFamilyField('homeSearchExtra.value'),false);
 assert.equal(applied.homeSearch.selectedBank,'santander');
 assert.equal(applied.homeSearch.ownership.ibiAnnual,1500);
 assert.deepEqual(applied.mortgage,before.mortgage);
 assert.equal(applied.budget.ibiAnnual,before.budget.ibiAnnual);
 applied.homeSearch.offers.santander.fullRate=1;
 assert.equal(profile.homeSearch.offers.santander.fullRate,2.95);
 const budgetOnly=extractFamilyProfile(other,profile);
 assert.deepEqual(budgetOnly.homeSearch,profile.homeSearch);
});


test('linked unconfirmed property reserves follow shared rules without replacing community or receipts',()=>{
 const first=scenario();first.purchaseStory={ownershipAnnual:1700,wasteAnnual:150};
 const profile=extractFamilyProfile(first),home=scenario();
 home.budget.propertyCostsConfirmed=false;home.budget.ownershipProvisionFromRules=true;
 const applied=applyFamilyProfile(home,profile);
 assert.equal(applied.budget.ibiAnnual,1700);assert.equal(applied.budget.wasteAnnual,150);
 assert.equal(applied.budget.communityMonthly,25);assert.equal(applied.budget.maintenanceAnnual,0);
 assert.equal(applied.budget.ownershipProvisionCombined,true);assert.equal(applied.budget.propertyCostsEstimated,true);
 assert.equal(home.budget.ibiAnnual,850);
 for(const overrides of [{propertyCostsConfirmed:true},{ownershipProvisionFromRules:false}]){
  const manual=applyFamilyProfile({...home,budget:{...home.budget,...overrides}},profile);
  assert.equal(manual.budget.ibiAnnual,850);assert.equal(manual.budget.maintenanceAnnual,300);
 }
});
