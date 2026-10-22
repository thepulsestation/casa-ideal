import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario,monthlyPayment,calculateScenario} from './finance.mjs';
import {calculatePurchaseStory,normalizePurchaseStory} from './purchase-story.mjs';

const close=(actual,expected,tolerance=.011)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const fixture=()=>normalizeScenario({purchasePrice:999999,appraisalValue:1234567,referenceValue:1900000,
 tax:{buyers:[{share:.5,rate:.1,eligibilityConfirmed:false},{share:.5,rate:.1,eligibilityConfirmed:false}]},
 mortgage:{amount:1,baseRate:1,years:10},familyLoan:{enabled:true,amount:1,maxAmount:60000,rate:6.99,years:8},
 motherTransfer:{mode:'family-loan',repaymentMode:'custom',familyRate:0,familyYears:8,giftPublicDeed:true,giftNotaryCost:250},
 cash:{savings:999999,depositAmount:1,preClosingLoanPayments:2},
 budget:{incomes:[{monthly:2100,payments:12},{monthly:1300,payments:14}],
 householdIncomes:[{id:'mother',monthly:1500,payments:14},{id:'sister',monthly:0,payments:12}],
 existingDebtMonthly:262,currentRent:1200,foodMonthly:800,utilitiesMonthly:200,familyInsuranceMonthly:270,
 ibiAnnual:12345,wasteAnnual:12345,maintenanceAnnual:12345,communityMonthly:9999},
 familyPlan:{purchaseMonth:'2027-06',motherLoanStartMonth:'2027-04',sharedCostMode:'workers',purchaseAllocation:'shared-household',
  sisterJob:{enabled:true,amount:500,startMonth:'2027-01'},university:{amount:500,endMonth:'2027-06'},
  currentAllocation:{enabled:true,rentPayer:'buyer1',otherCostMode:'living-pool',motherContributionMonthly:1000,contributionIncludesUniversity:true},
  personalCommitments:[{id:'other-debt',label:'Other debt',kind:'debt',owner:'buyer1',monthly:100}],
 },
});
const raw={referenceMonth:'2026-10',purchaseMonth:'2027-06'};
const row=(model,bank='sabadell',caseId='principal')=>model.rows.find(item=>item.bankId===bank&&item.caseId===caseId);

test('story rules form a generic editable plan, retain source data and combine ownership reserve once',()=>{
 const source=fixture(),before=structuredClone(source),settings=normalizePurchaseStory(raw,source);
 assert.equal(settings.ownershipAnnual,2000);assert.equal(settings.wasteAnnual,100);assert.equal(settings.provisionPercent,2);
 assert.equal(settings.bankDebtMonthly,262);assert.equal(settings.motherLoanCap,21500);assert.equal(settings.referenceMotherAmount,21500);
 const model=calculatePurchaseStory(source,raw);
 assert.equal(model.valid,true);assert.deepEqual(model.errors,[]);assert.equal(model.rows.length,6);
 assert.deepEqual(source,before);
 for(const item of model.rows){
  const scenario=item.reference.scenario;
  assert.equal(scenario.budget.ibiAnnual,2000);assert.equal(scenario.budget.maintenanceAnnual,0);assert.equal(scenario.budget.wasteAnnual,100);
  assert.equal(scenario.budget.communityMonthly,0);assert.equal(scenario.cash.savings,0);
  assert.equal(scenario.budget.ownershipProvisionCombined,true);assert.ok(!item.reference.result.budget.missingEstimates.includes('Mantenimiento de la casa'));
  assert.equal(scenario.purchaseCosts.provisionPercent,2);assert.equal(scenario.purchaseCosts.provisionBasis,'percent');
  assert.ok(scenario.tax.buyers.every(buyer=>buyer.rate===.05&&buyer.eligibilityAssumed&&!buyer.eligibilityConfirmed));
  assert.equal(scenario.mortgage.discounts.length,1);assert.equal(scenario.mortgage.discounts[0].points,0);
  close(item.reference.ownershipMonthly,175);
 }
});

test('the three notebook ceilings follow ordinary borrowers income rather than a rounded hardcoded quota',()=>{
 const model=calculatePurchaseStory(fixture(),raw);
 close(model.bankIncome,3400);close(model.debtLimitMonthly,1190);
 close(model.referenceMother.monthly,293.01793558);close(model.referenceMother.principalOnlyMonthly,223.95833333);
 for(const [id,quota]of [['gift',928],['interest',634.98206442],['principal',704.04166667]]){
  close(model.hypotheses.find(item=>item.id===id).mortgageCapacityMonthly,quota);
  for(const bank of ['sabadell','santander'])close(row(model,bank,id).reference.monthlyMortgage,quota);
 }
 const actual=fixture();actual.budget.incomes=[{monthly:2200,payments:12},{monthly:1400,payments:14}];
 const changed=calculatePurchaseStory(actual,raw);
 close(changed.hypotheses[0].mortgageCapacityMonthly,998);
 const override=calculatePurchaseStory(actual,{...raw,bankIncomeOverride:3400});close(override.hypotheses[0].mortgageCapacityMonthly,928);
});

test('the bank-only step exposes 80/75 percent finance, the ICF cap and the missing entry and taxes',()=>{
 const model=calculatePurchaseStory(fixture(),raw),s=row(model,'sabadell','gift').reference,t=row(model,'santander','gift').reference;
 close(s.mortgagePrincipal,210567.62156);close(s.purchasePrice,263209.52695);
 close(t.mortgagePrincipal,207951.31665);close(t.purchasePrice,277268.42220);
 assert.equal(s.icfPrincipal,50000);assert.equal(t.icfPrincipal,50000);
 close(s.priceContribution,s.purchasePrice-s.mortgagePrincipal-50000);
 close(t.priceContribution,t.purchasePrice-t.mortgagePrincipal-50000);
 close(s.tax,s.purchasePrice*.05);close(t.tax,t.purchasePrice*.05);
 close(s.fees,Math.round(s.purchasePrice*.02*100)/100);
 assert.ok(s.motherRequired>21500&&t.motherRequired>21500);assert.ok(s.shortfall>0&&t.shortfall>0);
 assert.ok(s.giftTax>0);assert.equal(s.giftNotaryCost,250);
});

test('fixed mode actually borrows the full reference capital and household costs retain the mother bank payment in every case',()=>{
 const model=calculatePurchaseStory(fixture(),raw);
 for(const item of model.rows){
  if(!item.actual)continue;
  assert.equal(item.actual.motherPrincipal,21500);close(item.actual.motherMonthly,293.01793558);
  const r=item.actual.result;
  assert.ok(r.budget.totalMonthly>=r.familyLoan.monthlyPayment);
  close(item.actual.people.reduce((sum,person)=>sum+person.purchaseCost,0),item.actual.budgetTotal);
  if(item.caseId==='gift')assert.equal(item.actual.internalRepaymentMonthly,0);
  if(item.caseId==='interest')close(item.actual.internalRepaymentMonthly,item.actual.motherMonthly);
  if(item.caseId==='principal')close(item.actual.internalRepaymentMonthly,21500/96);
 }
 const changed=calculatePurchaseStory(fixture(),{...raw,mode:'fixed',motherLoanCap:60000});
 assert.ok(changed.rows.every(item=>item.limits.loanCap===21500));
});

test('negotiated borrowing recomputes the required capital and its contractual payment at each final price',()=>{
 const source=fixture();source.budget.currentRent=3000;source.budget.householdIncomes.find(row=>row.id==='mother').monthly=5000;
 const fixed=calculatePurchaseStory(source,raw),model=calculatePurchaseStory(source,{...raw,mode:'negotiate',motherLoanCap:60000,motherYears:12});
 assert.ok(row(model,'sabadell','gift').maxPrice>row(fixed,'sabadell','gift').maxPrice);
 for(const item of model.rows){
  const at=item.actual;if(!at)continue;
  assert.ok(at.motherPrincipal<=60000);assert.equal(at.scenario.familyLoan.amount,null);
  assert.ok(at.fitsCash&&at.fitsBank&&at.fitsBudget&&at.transitionFits);
  close(at.motherMonthly,monthlyPayment(at.motherPrincipal,6.99,12));
  close(at.borrowerDebtMonthly,262+at.monthlyMortgage+at.internalRepaymentMonthly);
  assert.ok(at.bankDebtRatio<=.35+1e-8);
  if(item.caseId==='principal')close(at.internalRepaymentMonthly,at.motherPrincipal/144);
  const next=calculateScenario({...at.scenario,purchasePrice:item.maxPrice+500,appraisalValue:item.maxPrice+500},{asOfMonth:'2027-06'});
  const debt=262+next.mortgage.monthlyPayment+next.motherTransfer.familyMonthlyRepayment;
  assert.ok(next.cash.fundingGap>.005||next.cash.beforeMortgageGap>.005||debt>3400*.35||item.bindingConstraint==='spending'||item.bindingConstraint==='transition');
 }
});

test('only the budget mode spends the explicitly allowed monthly headroom and preserves living amounts',()=>{
 const source=fixture();source.budget.currentRent=700;
 const negotiate=calculatePurchaseStory(source,{...raw,mode:'negotiate',motherLoanCap:60000,motherYears:12,allowedExtraMonthly:300});
 const budget=calculatePurchaseStory(source,{...raw,mode:'budget',motherLoanCap:60000,motherYears:12,allowedExtraMonthly:300});
 close(negotiate.spendingCap,negotiate.currentBudget.totalMonthly);close(budget.spendingCap,budget.currentBudget.totalMonthly+300);
 assert.ok(budget.rows.some((item,index)=>item.maxPrice>negotiate.rows[index].maxPrice));
 for(const item of budget.rows){if(!item.actual)continue;assert.equal(item.actual.scenario.budget.foodMonthly,800);assert.equal(item.actual.scenario.budget.familyInsuranceMonthly,270);}
});

test('an explicit community bill increases monthly ownership costs without changing bank-only ceilings',()=>{
 const source=fixture();source.budget.currentRent=700;
 const before=calculatePurchaseStory(source,{...raw,mode:'negotiate',motherLoanCap:60000});
 const after=calculatePurchaseStory(source,{...raw,mode:'negotiate',motherLoanCap:60000,communityMonthly:100});
 assert.equal(before.settings.communityMonthly,0);assert.equal(after.settings.communityMonthly,100);
 for(const [index,item]of after.rows.entries()){
  close(item.reference.purchasePrice,before.rows[index].reference.purchasePrice);
  close(item.reference.ownershipMonthly-before.rows[index].reference.ownershipMonthly,100);
  close(item.reference.budgetTotal-before.rows[index].reference.budgetTotal,100);
  assert.ok(item.maxPrice<=before.rows[index].maxPrice);
 }
 assert.ok(after.rows.some((item,index)=>item.maxPrice<before.rows[index].maxPrice));
});

test('invalid settings and missing borrower income never produce a plausible ceiling',()=>{
 for(const bad of [{mode:'unknown'},{motherYears:0},{offers:{sabadell:{ltv:2}}},{bankIncomeOverride:-1},{referenceMonth:'no'}])
  assert.equal(calculatePurchaseStory(fixture(),{...raw,...bad}).valid,false);
 const source=fixture();source.budget.incomes=[];assert.equal(calculatePurchaseStory(source,raw).valid,false);
 const zero=calculatePurchaseStory(fixture(),{...raw,offers:{sabadell:{rate:0}}});assert.equal(zero.valid,true);
});
