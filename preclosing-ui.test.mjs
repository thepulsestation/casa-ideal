import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario,calculateScenario,getAffordability} from './finance.mjs';
import {adoptPreclosingPlan,renderAppraisalFunding,renderPreclosing} from './preclosing-ui.mjs';

const home=()=>normalizeScenario({purchasePrice:175000,icf:{enabled:true},purchaseCosts:{mode:'provision'},cash:{familyLoanAvailableBeforeDeposit:true},familyLoan:{enabled:true,rate:12,years:8,coverEarlyLiquidity:true},motherTransfer:{repaymentMode:'same-as-bank'},budget:{incomes:[{monthly:3500,payments:12}],foodMonthly:500,utilitiesMode:'aggregate',utilitiesMonthly:200}});
const ui={field:(label,path)=>`<input data-field="${path}" aria-label="${label}">`,euro:n=>n==null?'Pendiente':String(Math.round(n*100)/100)};

test('the requested waiting and moving estimates are adopted once without overwriting later edits',()=>{
 const original=home(),s=adoptPreclosingPlan(original);
 assert.equal(original.cash.preClosingLoanPayments,0);assert.equal(original.purchaseCosts.moving,0);
 assert.equal(s.cash.preClosingLoanPayments,2);assert.equal(s.purchaseCosts.moving,600);
 s.cash.preClosingLoanPayments=4;s.purchaseCosts.moving=0;
 assert.deepEqual(adoptPreclosingPlan(s),s);
});

test('moving is added once independently of the fee mode and loan installments are not added to acquisition cost',()=>{
 for(const mode of ['provision','itemized']){
  const s=home();s.purchaseCosts.mode=mode;s.purchaseCosts.appraisal=5000;
  const before=calculateScenario(s);s.purchaseCosts.moving=600;s.cash.preClosingLoanPayments=2;
  const after=calculateScenario(s);
  assert.equal(after.cash.totalRequired-before.cash.totalRequired,600);
  assert.equal(after.cash.totalAcquisitionCost-before.cash.totalAcquisitionCost,600);
  assert.equal(after.familyLoan.principal-before.familyLoan.principal,600);
  assert.equal(after.cash.purchaseFees,5000);
  assert.equal(after.timeline.find(t=>t.id==='after').cashOut,600);
  assert.equal(after.preclosing.remainingInstallments,94);
  assert.ok(after.preclosing.interestPaid<after.familyLoan.totalInterest);
 }
});

test('a higher appraisal cannot raise the borrowing base and a lower one opens a funding gap',()=>{
 const s=adoptPreclosingPlan(home());
 for(const [value,bank,icf,mother] of [[160000,128000,32000,41100],[175000,140000,35000,26100],[190000,140000,35000,26100]]){
  s.appraisalValue=value;const r=calculateScenario(s);
  assert.equal(r.mortgage.principal,bank);assert.equal(r.icf.principal,icf);assert.equal(r.familyLoan.principal,mother);
 }
 const html=renderAppraisalFunding(s,calculateScenario(s),ui);
 assert.ok(html.includes('data-field="appraisalValue"'));
});

test('a waiting shortfall cannot be hidden by an otherwise affordable purchase',()=>{
 const s=adoptPreclosingPlan(home());s.budget.incomes=[{monthly:10000,payments:12}];s.budget.currentOtherMonthly=8400;
 const r=calculateScenario(s),a=getAffordability(s);
 assert.equal(a.withinDebtLimit,true);assert.ok(r.budget.remainingRegular>0);
 assert.ok(r.preclosing.additionalCashToKeepBuffer>0);
 assert.equal(a.meetsKnownLimits,false);assert.ok(a.blockedReasons.includes('preclosing-buffer-shortfall'));
 assert.ok(renderPreclosing(s,r,ui).includes('no aumenta automáticamente el préstamo'));
});

test('an invalid wait count is rejected instead of silently using fractional or negative installments',()=>{
 for(const n of [-1,1.5,61]){const s=home();s.cash.preClosingLoanPayments=n;assert.equal(calculateScenario(s).valid,false);}
});

test('a final loan surplus cannot hide money locked in the arras before signing',()=>{
 const s=adoptPreclosingPlan(home());
 s.tax.buyers=s.tax.buyers.map(b=>({...b,rate:.05,eligibilityConfirmed:true}));
 let r=calculateScenario(s);
 assert.equal(r.familyLoan.principal,17500);assert.equal(r.cash.totalRequired,17350);
 assert.equal(r.cash.surplus,150);assert.equal(r.preclosing.cashAfterEarlyPayments,0);
 s.budget.currentOtherMonthly=r.preclosing.monthlyRemaining+50;
 r=calculateScenario(s);
 assert.ok(Math.abs(r.preclosing.deficit-100)<.001);
 assert.equal(r.preclosing.additionalCashToKeepBuffer,0);
 assert.ok(Math.abs(r.preclosing.preclosingLiquidityGap-100)<.001);
 const a=getAffordability(s);
 assert.equal(a.meetsKnownLimits,false);assert.ok(a.blockedReasons.includes('preclosing-liquidity-gap'));
 assert.ok(renderPreclosing(s,r,ui).includes('El dinero que pueda compensarse en la firma'));
});
