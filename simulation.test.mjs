import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario,monthlyPayment} from './finance.mjs';
import {calculateSimulation,normalizeSimulation} from './simulation.mjs';

const close=(actual,expected,tolerance=.02)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const dates={referenceMonth:'2026-10',purchaseMonth:'2027-06',evaluationMonth:'2027-06'};
const options={searchCeiling:350000};
const fixture=()=>normalizeScenario({purchasePrice:999999,appraisalValue:1234567,cash:{savings:999999,depositAmount:1,preClosingLoanPayments:2},
 tax:{buyers:[{share:.5,rate:.05,eligibilityConfirmed:true},{share:.5,rate:.05,eligibilityConfirmed:true}]},
 motherTransfer:{mode:'family-loan',repaymentMode:'custom',familyRate:0,familyYears:8,giftPublicDeed:true,giftNotaryCost:250},
 budget:{incomes:[{monthly:2300,payments:12},{monthly:1300,payments:14}],householdIncomes:[{id:'mother',monthly:1500,payments:14},{id:'sister',monthly:0,payments:12}],existingDebtMonthly:262,currentRent:1064,foodMonthly:800,familyInsuranceMonthly:270,
  utilitiesMode:'detailed',utilityBreakdown:{waterMonthly:30,energyMonthly:100,internetMonthly:50,otherMonthly:20},storageMonthly:80,ibiAnnual:9000,wasteAnnual:999,maintenanceAnnual:999,communityMonthly:999},
 familyPlan:{purchaseMonth:'2027-06',motherLoanStartMonth:'2027-04',personalDebtOwner:'buyer1',sharedCostMode:'workers',purchaseAllocation:'shared-household',transportOwner:'buyer1',
  sisterJob:{enabled:true,amount:500,startMonth:'2027-01'},sisterSupport:{enabled:true,savingsAtPurchase:0},university:{amount:565.63,endMonth:'2027-06'},
  currentAllocation:{enabled:true,rentPayer:'buyer1',otherCostMode:'living-pool',motherContributionMonthly:1100,contributionIncludesUniversity:true},
  personalCommitments:[{id:'personal-autonomous',label:'Autónoma',kind:'expense',owner:'buyer1',monthly:100},{id:'temporary-insurance',label:'Seguro temporal',kind:'expense',owner:'buyer1',monthly:30,endMonth:'2027-02'}],
  extraPayMonths:{buyer2:[6,12],mother:[6,12]}}});
const model=(raw={},source=fixture())=>calculateSimulation(source,{...dates,...raw},options);

test('separate normalized experiments preserve household data and the two-thousand annual reserve',()=>{
 const source=fixture(),before=structuredClone(source),s=normalizeSimulation(dates,source),m=model({},source);
 assert.equal(m.valid,true);assert.deepEqual(m.errors,[]);assert.deepEqual(source,before);
 assert.equal(s.ibiAnnual+s.repairsAnnual,2000);assert.equal(s.wasteAnnual,100);assert.equal(s.sister.enabled,false);
 assert.equal(s.offers.sabadell.payrollRate,3.35);assert.equal(s.offers.santander.ltv,.75);
 assert.equal(m.evaluation.scenario.familyLoan.amount,21500);assert.equal(m.evaluation.scenario.cash.savings,0);
 close(m.evaluation.ownershipMonthly,175);assert.equal(m.evaluation.scenario.budget.maintenanceAnnual,1000);
 assert.ok(m.notes.some(n=>n.includes('separación provisional')));
});

test('reference bank and transfer hypothesis stay fixed when the combination changes',()=>{
 const source=fixture();source.purchaseStory={selectedBank:'sabadell',selectedCase:'principal'};
 const m=model({selectedBank:'santander',selectedCase:'gift'},source);
 assert.equal(m.settings.selectedBank,'santander');assert.equal(m.settings.selectedCase,'gift');
 assert.equal(m.baseline.settings.selectedBank,'sabadell');assert.equal(m.baseline.settings.selectedCase,'principal');
});

test('three legal-transfer hypotheses alter borrower debt but count the external loan once',()=>{
 const gift=model({selectedCase:'gift'}),interest=model({selectedCase:'interest'}),principal=model({selectedCase:'principal'});
 for(const m of [gift,interest,principal]){
  assert.ok(m.evaluation);const e=m.evaluation;
  close(e.motherMonthly,monthlyPayment(21500,6.99,8));
  close(e.borrowerDebtMonthly,e.result.mortgage.monthlyPayment+262+e.internalRepaymentMonthly);
  close(e.bankIncome,3600);assert.ok(e.bankDebtRatio<=.35+1e-8);
  close(e.people.reduce((sum,p)=>sum+p.cost,0),e.monthlyTotal);
 }
 assert.equal(gift.evaluation.internalRepaymentMonthly,0);close(interest.evaluation.internalRepaymentMonthly,293.0179);close(principal.evaluation.internalRepaymentMonthly,21500/96);
 assert.ok(gift.evaluation.result.motherTransfer.giftTax>0);
});

test('sister income is optional, excluded from borrower income, and cannot raise the same-spending ceiling',()=>{
 const before=model({motherLoanMode:'needed',motherLoanCap:60000});
 const after=model({motherLoanMode:'needed',motherLoanCap:60000,sister:{enabled:true,monthly:1500,payments:14,startMonth:'2027-01'}});
 assert.equal(after.capacity.maxPrice,before.capacity.maxPrice);close(after.evaluation.bankIncome,before.evaluation.bankIncome);
 const sister=after.people.find(p=>p.id==='sister');assert.equal(sister.income,1500);assert.equal(sister.annualExtraIncome,3000);
 close(after.evaluation.monthlyIncome-before.evaluation.monthlyIncome,1500);
 const minBefore=model({objective:'min-savings',minSavingsMonthly:3000,motherLoanMode:'needed',motherLoanCap:60000});
 const minAfter=model({objective:'min-savings',minSavingsMonthly:3000,motherLoanMode:'needed',motherLoanCap:60000,sister:{enabled:true,monthly:1500,payments:14,startMonth:'2027-01'}});
 assert.ok(minAfter.capacity.maxPrice>minBefore.capacity.maxPrice);
});

test('departure retains only agreed contributions and explicitly reduces food, water and energy',()=>{
 const raw={goal:'check-home',targetPrice:180000,objective:'extra-spending',allowedExtraMonthly:1000};
 const before=model(raw),after=model({...raw,departures:{buyer2:{enabled:true,month:'2027-06',keepFixedShare:false,fixedContributionMonthly:200,outsideExpensesMonthly:700,outsideExpensesConfirmed:false}},reductions:{foodMonthly:100,waterMonthly:5,energyMonthly:10}});
 const b=before.evaluation,a=after.evaluation,p=a.people.find(p=>p.id==='buyer2');
 assert.equal(p.resident,false);assert.equal(p.homeContribution,200);assert.equal(p.outsidePending,true);assert.equal(p.outsideExpenses,700);
 close(a.monthlyIncome,3600+1500-1300+200);
 close(b.components.food-a.components.food,100);close(b.components.utilities-a.components.utilities,15);
 close(a.components.familyInsurance,b.components.familyInsurance);close(a.ownershipMonthly,b.ownershipMonthly);close(a.monthlyMortgage,b.monthlyMortgage);
 close(p.remaining,1300-200-p.personalCosts-700);assert.ok(a.pending.some(n=>n.includes('gastos definitivos')));
 close(a.familyTotal,a.monthlyTotal+p.personalCosts+700);
 // Without a departure, moving the consumption sliders has no effect.
 const inactive=model({...raw,reductions:{foodMonthly:100,waterMonthly:5,energyMonthly:10}});
 close(inactive.evaluation.monthlyTotal,b.monthlyTotal);
});

test('automatic bonuses include premiums and replace external home insurance instead of doubling it',()=>{
 const raw={goal:'check-home',targetPrice:175000,objective:'extra-spending',allowedExtraMonthly:1000};
 const payroll=model(raw),products=model({...raw,bonusMode:'products',offers:{sabadell:{lifeEnabled:true,homeEnabled:true,protectionEnabled:true,lifeAnnual:240,homeAnnual:300,protectionAnnual:360}}});
 assert.equal(products.evaluation.insurance.rate,2.75);close(products.evaluation.insuranceMonthly,75);close(payroll.evaluation.insuranceMonthly,25);
 close(products.evaluation.insurance.netSavingMonthly,payroll.evaluation.result.mortgage.monthlyPayment-products.evaluation.result.mortgage.monthlyPayment-50);
 const custom=model({...raw,bonusMode:'custom',offers:{sabadell:{rate:2.75}}});
 assert.ok(custom.evaluation.pending.some(n=>n.includes('pólizas seleccionadas no justifican')));
 assert.equal(custom.evaluation.insurance.estimated,true);
 const santander=model({...raw,selectedBank:'santander',bonusMode:'products',offers:{santander:{lifeEnabled:true,lifeAnnual:200}}});
 close(santander.evaluation.insurance.rate,3.45);assert.ok(santander.evaluation.pending.some(n=>n.includes('umbral')));
});

test('specific price and payment modes expose gaps, lower appraisals and the ICF cap',()=>{
 const s=fixture();s.budget.currentRent=2500;
 const high=model({goal:'check-home',targetPrice:300000,motherLoanMode:'needed',motherLoanCap:21500},s);
 assert.equal(high.evaluation.icfPrincipal,50000);assert.ok(high.evaluation.shortfall>0);assert.equal(high.evaluation.fitsCash,false);
 const lower=model({goal:'check-home',targetPrice:175000,appraisalRatio:.8},s);
 close(lower.evaluation.icfPrincipal,175000*.8*.2);close(lower.evaluation.mortgagePrincipal,175000*.8*.8);
 assert.ok(lower.evaluation.priceContribution>0);
 const payment=model({goal:'check-home',targetType:'payment',targetPayment:700,motherLoanMode:'needed',motherLoanCap:60000},s);
 close(payment.evaluation.result.mortgage.monthlyPayment,700);
 assert.equal(payment.evaluation.purchasePrice,payment.result.purchasePrice);
});

test('future evaluation honors dated tuition, expired mother payments and deferred ICF stage',()=>{
 const raw={goal:'check-home',targetPrice:175000,objective:'extra-spending',allowedExtraMonthly:1000};
 const initial=model(raw),later=model({...raw,evaluationMonth:'2036-06'}),icf=model({...raw,evaluationMonth:'2057-06'});
 close(initial.evaluation.components.university,565.63);assert.equal(later.evaluation.components.university,0);
 assert.ok(initial.evaluation.motherMonthly>0);assert.equal(later.evaluation.motherMonthly,0);
 assert.equal(icf.evaluation.monthlyMortgage,0);assert.ok(icf.evaluation.components.icf>0);
 close(icf.evaluation.borrowerDebtMonthly,initial.evaluation.borrowerDebtMonthly);
});

test('invalid settings and missing borrowers cannot produce a usable capacity',()=>{
 for(const raw of [{motherYears:0},{ibiAnnual:-1},{goal:'unknown'},{evaluationMonth:'2026-01'},{sister:{enabled:true,monthly:0}},{offers:{sabadell:{minRate:10}}}])assert.equal(model(raw).valid,false);
 const source=fixture();source.budget.incomes=[];assert.equal(model({},source).valid,false);
 const expanded=model({objective:'extra-spending',allowedExtraMonthly:1000,motherLoanMode:'needed',motherLoanCap:60000});
 const base=model({motherLoanMode:'needed',motherLoanCap:60000});assert.ok(expanded.capacity.maxPrice>=base.capacity.maxPrice);
});

test('fixed loan caps, impossible outside contributions and pre-purchase departures stay blocked',()=>{
 assert.equal(model({motherAmount:30000,motherLoanCap:21500}).valid,false);
 assert.equal(model({motherLoanCap:60001}).valid,false);
 assert.equal(model({departures:{buyer2:{enabled:true,month:'2027-01'}}}).valid,false);
 const m=model({goal:'check-home',targetPrice:100000,objective:'extra-spending',allowedExtraMonthly:1000,
  departures:{buyer2:{enabled:true,month:'2027-06',keepFixedShare:false,fixedContributionMonthly:3000,outsideExpensesMonthly:200,outsideExpensesConfirmed:true}}});
 assert.equal(m.evaluation.fitsResources,false);assert.equal(m.evaluation.allFits,false);
 const moved=model({goal:'check-home',targetPrice:150000,objective:'extra-spending',allowedExtraMonthly:1000,
  departures:{buyer1:{enabled:true,month:'2027-06',outsideExpensesMonthly:500,outsideExpensesConfirmed:true}}});
 close(Object.values(moved.evaluation.components).reduce((sum,n)=>sum+n,0),moved.evaluation.monthlyTotal);
 const s=fixture();s.familyPlan.personalCommitments[0].monthly=-100;
 assert.equal(model({},s).valid,false);
});

test('fast capacity search matches every price grid for negotiated debt, departures and savings goals',()=>{
 const variants=[{},
  {motherLoanMode:'needed',motherLoanCap:60000,objective:'min-savings',minSavingsMonthly:1000,sister:{enabled:true,monthly:700,startMonth:'2027-01'}},
  {objective:'extra-spending',allowedExtraMonthly:500,motherLoanMode:'needed',motherLoanCap:60000,departures:{mother:{enabled:true,month:'2027-06',keepFixedShare:true,outsideExpensesMonthly:300,outsideExpensesConfirmed:true}},reductions:{foodMonthly:100,waterMonthly:10,energyMonthly:20}},
  {objective:'min-savings',minSavingsMonthly:1000,motherLoanMode:'needed',motherLoanCap:60000,departures:{buyer2:{enabled:true,month:'2027-06',keepFixedShare:false,fixedContributionMonthly:250,outsideExpensesMonthly:500,outsideExpensesConfirmed:true}}},
  {motherRate:0,offers:{sabadell:{rate:0,payrollRate:0,minRate:0}}},
  {objective:'min-savings',minSavingsMonthly:100000}];
 for(const raw of variants){
  const source=fixture(),settings={...dates,...raw},fast=calculateSimulation(source,settings,{searchCeiling:200000}),full=calculateSimulation(source,settings,{searchCeiling:200000,exhaustive:true});
  assert.equal(fast.valid,full.valid);assert.equal(fast.capacity.maxPrice,full.capacity.maxPrice,JSON.stringify(raw));
  assert.equal(fast.capacity.bindingConstraint,full.capacity.bindingConstraint);
 }
});


