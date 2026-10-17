import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario,calculateScenario} from './finance.mjs';
import {adoptFamilyFinancingPlan,adoptDiscountBreakdown,renderFinancingBreakdown,renderBorrowerDebt,renderFamilyLoanTerms} from './financing-ui.mjs';

const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const helpers={esc,euro:(v)=>v==null?'Pendiente':Number(v).toFixed(2),pct:v=>v==null?'—':(v*100).toFixed(2)+'%',row:(l,v)=>`<div>${l}: ${v}</div>`,notice:t=>`<p>${t}</p>`};

test('the requested plan upgrades legacy financing once without changing personal budget or tax eligibility',()=>{
 const old=normalizeScenario({id:'synthetic',purchasePrice:175000,icf:{enabled:true,eligibilityConfirmed:true},motherTransfer:{mode:'gift'},budget:{foodMonthly:467,incomes:[{monthly:2000,payments:12},{monthly:1500,payments:12}]}});
 const s=adoptFamilyFinancingPlan(old),r=calculateScenario(s);
 assert.equal(s.icf.enabled,true);assert.equal(s.icf.eligibilityConfirmed,false);assert.equal(s.motherTransfer.mode,'family-loan');assert.equal(s.motherTransfer.repaymentMode,'same-as-bank');
 assert.equal(r.mortgage.principal,140000);assert.equal(r.icf.principal,35000);assert.equal(r.familyLoan.principal,20500);
 assert.equal(s.budget.foodMonthly,467);assert.deepEqual(s.tax,old.tax);assert.equal(old.motherTransfer.mode,'gift');
 s.icf.enabled=false;s.mortgage.ltv=.75;s.motherTransfer.repaymentMode='custom';
 assert.deepEqual(adoptFamilyFinancingPlan(s),s);
});

test('the funding explanation includes deferred ICF debt without calling it a grant',()=>{
 const s=adoptFamilyFinancingPlan(normalizeScenario({purchasePrice:175000})),r=calculateScenario(s);
 const html=renderFinancingBreakdown(s,r,helpers);
 for(const text of ['140000.00','35000.00','583.33','no una subvención','concesión'])assert.ok(html.includes(text));
 s.icf.enabled=false;assert.ok(!renderFinancingBreakdown(s,calculateScenario(s),helpers).includes('Plan actualizado:'));
});

test('borrower debt explanation uses borrower income and escapes imported buyer names',()=>{
 const s=adoptFamilyFinancingPlan(normalizeScenario({purchasePrice:175000,budget:{incomes:[{monthly:2000,payments:12},{monthly:1500,payments:12}],householdIncomes:[{id:'mother',monthly:1200,payments:14}]}}));
 s.tax.buyers[0].label='<img src=x onerror=alert(1)>';
 const r=calculateScenario(s),html=renderBorrowerDebt(s,r,helpers);
 assert.ok(html.includes('3500.00'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
 assert.ok(html.includes(helpers.euro(r.familyLoan.monthlyPayment)));assert.ok(html.includes(helpers.pct(r.budget.debtRatio)));
});

test('loan comparison exposes hypothetical terms and never assumes a cleared TIN',()=>{
 const s=adoptFamilyFinancingPlan(normalizeScenario({purchasePrice:175000})),r=calculateScenario(s);
 const html=renderFamilyLoanTerms(s,r,helpers);
 for(const text of ['8 años','10 años','15 años','20 años','217.43','135.29','hipótesis','ofrezca','TIN o TAE'])assert.ok(html.includes(text));
 s.familyLoan.rate=null;assert.ok(renderFamilyLoanTerms(s,calculateScenario(s),helpers).includes('Introduce el TIN'));
});

test('the verbal discount breakdown fills missing points once without activating products or inventing premiums',()=>{
 const s=normalizeScenario({});const original=structuredClone(s);
 s.mortgage.discounts.find(d=>d.id==='home').points=.15;
 const next=adoptDiscountBreakdown(s);
 assert.equal(next.mortgage.discounts.find(d=>d.id==='home').points,.15);
 assert.equal(next.mortgage.discounts.find(d=>d.id==='protection').points,.1);
 assert.ok(next.mortgage.discounts.every(d=>!d.enabled));
 assert.equal(next.mortgage.discounts.find(d=>d.id==='protection').cost,null);
 assert.equal(original.mortgage.discounts.find(d=>d.id==='protection').points,null);
 next.mortgage.discounts.find(d=>d.id==='protection').points=null;
 assert.equal(adoptDiscountBreakdown(next).mortgage.discounts.find(d=>d.id==='protection').points,null);
});
