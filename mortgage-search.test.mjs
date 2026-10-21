import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario,monthlyPayment} from './finance.mjs';
import {normalizeMortgageSearch,calculateMortgageSearch} from './mortgage-search.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<=.011,`${a} != ${b}`);
const options={asOfMonth:'2026-10',step:500};
const fixture=()=>normalizeScenario({
  purchasePrice:999999,appraisalValue:1200000,referenceValue:1100000,
  tax:{buyers:[{share:.5,rate:.05,eligibilityConfirmed:true},{share:.5,rate:.05,eligibilityConfirmed:true}]},
  mortgage:{baseRate:1,amount:1,years:12,discounts:[{id:'home',enabled:false,points:.7,cost:480,frequency:'annual',quoteKnown:true}]},
  familyLoan:{enabled:true,rate:6.99,years:8,amount:1,maxAmount:60000},
  motherTransfer:{familyRate:0,familyYears:8},cash:{savings:900000,depositAmount:1,preClosingLoanPayments:2},
  budget:{incomes:[{monthly:2400,payments:12},{monthly:1600,payments:14}],
    householdIncomes:[{id:'mother',monthly:1200,payments:14},{id:'sister',monthly:0,payments:12}],
    currentRent:1000,foodMonthly:600,utilitiesMonthly:200,familyInsuranceMonthly:100,existingDebtMonthly:120,
    ibiAnnual:99999,wasteAnnual:99999,communityMonthly:99999,maintenanceAnnual:99999,externalHomeInsuranceAnnual:null},
  familyPlan:{purchaseMonth:'2027-06',motherLoanStartMonth:'2027-04',personalDebtEndMonth:'2029-06',
    sisterJob:{enabled:true,amount:500,startMonth:'2027-01'},university:{amount:500,endMonth:'2027-06'},
    sharedCostMode:'workers',purchaseAllocation:'shared-household',
    currentAllocation:{enabled:true,rentPayer:'buyer1',otherCostMode:'living-pool',motherContributionMonthly:900,contributionIncludesUniversity:true},
    extraPayMonths:{buyer2:[6,12],mother:[6,12]},
    personalCommitments:[{id:'credit',label:'Crédito',owner:'buyer1',kind:'debt',monthly:100,payoffEstimate:1000,settleWithReceipt:true}],
    extraordinaryReceipt:{enabled:true,month:'2027-01',amount:1400,owner:'buyer1',confirmed:false},
  },
});
const withPrice=(source,raw={})=>calculateMortgageSearch(source,{testPrice:100000,...raw},options);
const row=(model,id)=>model.scenarios.find(s=>s.id===id);
const at=(model,id)=>model.atCommonPrice.find(s=>s.id===id);

test('normalization starts from a generic zero-savings plan and inherits only Sabadell quotes once',()=>{
  const source=fixture(),before=structuredClone(source),s=normalizeMortgageSearch({},source);
  assert.equal(s.cashSavings,0);assert.equal(s.motherLoanCap,21500);assert.equal(s.motherYears,8);
  assert.deepEqual(s.ownership,{ibiAnnual:1500,wasteAnnual:300,communityMonthly:100,maintenanceAnnual:0});
  assert.equal(s.offers.sabadell.products.find(p=>p.id==='home').cost,480);
  assert.ok(s.offers.sabadell.products.every(p=>p.enabled));
  assert.ok(s.offers.santander.products.every(p=>p.cost===null));
  assert.equal(s.offers.santander.payrollOnlyRate,3.45);
  assert.equal(s.offers.santander.products.find(p=>p.id==='life').enabled,false);
  const initialized=normalizeMortgageSearch({offers:{sabadell:{products:null}}},source);
  assert.equal(initialized.offers.sabadell.products.find(p=>p.id==='home').cost,null);
  assert.deepEqual(source,before);
  source.familyLoan.years=10;source.familyLoan.rate=null;
  assert.equal(normalizeMortgageSearch({},source).motherYears,8);
  assert.equal(normalizeMortgageSearch({},source).motherRate,6.99);
});

test('actual rental reference excludes future job, assumed cancellations, extras and purchase loan',()=>{
  const m=withPrice(fixture());assert.deepEqual(m.errors,[]);
  assert.equal(m.currentBudget.month,'2026-10');assert.equal(m.currentBudget.totalMonthly,2620);
  assert.equal(m.currentBudget.incomeMonthly,5200);
  assert.equal(m.currentBudget.people.find(p=>p.id==='sister').income,0);
  assert.equal(m.currentBudget.components.existingDebt,220);
  close(Object.values(m.currentBudget.components).reduce((s,v)=>s+v,0),m.currentBudget.totalMonthly);
  const june=at(m,'sabadell-icf');
  assert.equal(june.result.budget.existingDebtMonthly,120);
  assert.equal(june.comparisonPeople.find(p=>p.id==='sister').purchaseIncome,500);
  assert.equal(june.comparisonPeople.find(p=>p.id==='sister').currentIncome,0);
  assert.ok(june.notes.some(n=>n.includes('cancelaciones')));
  // Even once a hypothetical date has passed, it does not become current fact.
  const later=calculateMortgageSearch(fixture(),{referenceMonth:'2027-03'},options);
  assert.equal(later.currentBudget.people.find(p=>p.id==='sister').income,0);
  assert.equal(later.currentBudget.components.existingDebt,220);
  const confirmed=fixture();confirmed.familyPlan.extraordinaryReceipt.confirmed=true;
  assert.equal(calculateMortgageSearch(confirmed,{referenceMonth:'2027-03'},options).currentBudget.components.existingDebt,120);
});

test('a saved property price, appraisal, manual capitals and local bills never set the generic search',()=>{
  const source=fixture(),before=structuredClone(source),a=withPrice(source);
  source.purchasePrice=130000;source.appraisalValue=50000;source.referenceValue=600000;
  source.mortgage.amount=999;source.familyLoan.amount=999;source.cash.depositAmount=999;
  source.budget.ibiAnnual=2;source.budget.wasteAnnual=3;source.budget.communityMonthly=4;
  const b=withPrice(source);
  assert.deepEqual(a.scenarios.map(x=>x.maxPriceKnownCosts),b.scenarios.map(x=>x.maxPriceKnownCosts));
  assert.equal(at(a,'sabadell-icf').monthly.ownership,250);
  assert.equal(at(a,'sabadell-icf').scenario.budget.ibiAnnual,1500);
  assert.equal(at(a,'sabadell-icf').scenario.mortgage.years,30);
  const original=fixture();calculateMortgageSearch(original,{},options);assert.deepEqual(original,before);
});

test('Santander ICF leaves five percent of price, standard leaves twenty, with taxes and fees added',()=>{
  const m=withPrice(fixture());const icf=at(m,'santander-icf'),standard=at(m,'santander-standard');
  close(icf.mortgagePrincipal,75000);close(icf.icfPrincipal,20000);close(icf.ownPriceContribution,5000);
  assert.equal(icf.motherLoanRequired,15600); //5000price+5000ITP+2000costs+600moving+3000buffer
  assert.equal(icf.result.cash.savings,0);close(standard.ownPriceContribution,20000);
  assert.equal(standard.motherLoanRequired,21500);assert.equal(standard.limits.finalCash.gap,9100);
  assert.ok(icf.notes.some(n=>n.includes('prestado')));
});

test('unknown premiums and alternate home cost remain null, with no invented net advantage',()=>{
  const m=withPrice(fixture()),s=at(m,'sabadell-icf'),t=at(m,'santander-icf');
  assert.equal(s.monthly.insurance,null);assert.equal(s.bonuses.productMonthly,null);assert.equal(s.bonuses.netSavingMonthly,null);
  assert.equal(t.monthly.insurance,null);assert.equal(t.bonuses.fullRate,2.95);
  assert.ok(t.missingQuotes.includes('Protección de pagos'));
  assert.ok(t.notes.some(n=>n.includes('mes7')));
  const premium=t.scenario.mortgage.discounts.find(p=>p.id==='protection');
  assert.equal(premium.cost,null);assert.notEqual(premium.cost,300);
  close(t.bonuses.interestSavingMonthly,monthlyPayment(75000,3.45,30)-monthlyPayment(75000,2.95,30));
  assert.ok(at(withPrice(fixture(),{bonusMode:'payroll'}),'santander-icf').notes.some(n=>n.includes('mes7')));
});

test('Santander screenshot thresholds are strict, annualized, capped and count one shared policy',()=>{
  const raw={offers:{santander:{externalHomeInsuranceAnnual:240,products:[
    {id:'life',enabled:true,cost:201,frequency:'annual',quoteKnown:true},
    {id:'home',cost:25,frequency:'monthly',quoteKnown:true}, //300/year, not greater
    {id:'protection',cost:75.25,frequency:'quarterly',quoteKnown:true}, //301/year
  ]}}};
  const m=withPrice(fixture(),raw),s=at(m,'santander-icf');
  close(s.result.mortgage.rate,3.05); //3.45-.1life-.3protection; home300 gets no.2
  close(s.monthly.insurance,(201+300+301)/12);
  raw.offers.santander.products[1].cost=25.01;
  const full=at(withPrice(fixture(),raw),'santander-icf');
  close(full.result.mortgage.rate,2.95); //all three cannot exceed total1pp
  close(full.monthly.insurance,(201+300.12+301)/12);
  assert.notEqual(full.monthly.insurance,2*(201+300.12+301)/12);
});

test('full versus payroll compares identical capital and includes real insurance costs and alternate quote',()=>{
  const raw={offers:{sabadell:{externalHomeInsuranceAnnual:240,products:[
    {id:'life',cost:240,frequency:'annual',quoteKnown:true},
    {id:'home',cost:360,frequency:'annual',quoteKnown:true},
    {id:'protection',cost:1200,frequency:'upfront',coverageYears:5,quoteKnown:true},
  ]}}};
  const s=at(withPrice(fixture(),raw),'sabadell-icf');
  close(s.monthly.insurance,50);close(s.monthly.insuranceEquivalent,20);
  close(s.bonuses.productEquivalentMonthly,70);
  close(s.bonuses.netSavingMonthly,s.bonuses.interestSavingMonthly-50);
  const payroll=at(withPrice(fixture(),{...raw,bonusMode:'payroll'}),'sabadell-icf');
  close(payroll.mortgagePrincipal,s.mortgagePrincipal);close(payroll.result.mortgage.rate,3.30);
  close(payroll.monthly.insurance,20);assert.equal(payroll.result.cash.upfrontInsurance,0);
  //Sabadell0.60pp is one block; no guessed points for individual products.
  assert.ok(s.scenario.mortgage.discounts.filter(p=>['life','home','protection'].includes(p.id)).every(p=>p.points===0));
});

test('conditional90 needs explicit enabling and sufficient appraisal, with distinct own contribution',()=>{
  assert.equal(row(withPrice(fixture()),'santander-conditional90').available,false);
  assert.equal(row(withPrice(fixture(),{conditional90Enabled:true,appraisalRatio:1.12}),'santander-conditional90').available,false);
  const s=at(withPrice(fixture(),{conditional90Enabled:true,appraisalRatio:1.125}),'santander-conditional90');
  assert.equal(s.available,true);assert.equal(s.scenario.appraisalValue,112500);
  assert.equal(s.mortgagePrincipal,90000);assert.equal(s.icfPrincipal,0);assert.equal(s.ownPriceContribution,10000);
  assert.ok(s.notes.some(n=>n.includes('aprobación')));
});

test('every positive maximum preserves current budget, bank debt, purchase and early liquidity; next step fails',()=>{
  const m=withPrice(fixture());
  for(const s of m.scenarios.filter(r=>r.available&&r.maxPriceKnownCosts>0)){
    assert.ok(s.monthly.total<=m.currentBudget.totalMonthly+.005);
    assert.ok(s.motherLoanRequired<=21500);
    assert.ok(s.limits.debt.fits&&s.limits.cashFits&&s.limits.transitionFits);
    const next=at(withPrice(fixture(),{testPrice:s.maxPriceKnownCosts+500}),s.id);
    assert.ok(!next.limits.budgetFits||!next.limits.debtFits||!next.limits.cashFits||!next.limits.transitionFits);
  }
  assert.equal(m.comparisonPrice,100000);
  assert.ok(m.atCommonPrice.filter(r=>r.available).every(r=>r.comparisonPrice===100000));
  const automatic=calculateMortgageSearch(fixture(),{},options);
  const current=automatic.scenarios.filter(r=>r.financingMode==='icf'&&r.maxPriceKnownCosts>0);
  assert.equal(automatic.comparisonPrice,Math.min(...current.map(r=>r.maxPriceKnownCosts)));
});

test('the rental plus mother-loan transition is shown separately from the purchase-month spending cap',()=>{
  const s=at(withPrice(fixture()),'sabadell-icf');
  assert.equal(s.limits.preclosing.spendingAboveCurrentCap,true);
  assert.ok(s.limits.preclosing.monthlyExpenses>2620);
  assert.ok(s.limits.preclosing.months.every(row=>row.month<'2027-06'));
  assert.ok(s.limits.preclosing.fits,'income can cover cash flow even when it exceeds the spending policy');
  assert.ok(s.notes.some(n=>n.includes('Antes de firmar')));
});

test('invalid input and missing borrower income produce explicit errors instead of fake maxima',()=>{
  for(const raw of [null,{referenceMonth:'2026-13'},{motherYears:-1},{offers:{santander:{products:[{id:'home',cost:-2}]}}}])
    assert.ok(calculateMortgageSearch(fixture(),raw,options).errors.length);
  assert.ok(calculateMortgageSearch(fixture(),{}, {...options,step:0}).errors.length);
  const noIncome=fixture();noIncome.budget.incomes=[];
  assert.ok(calculateMortgageSearch(noIncome,{},options).errors.length);
});
