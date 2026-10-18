import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario,calculateScenario} from './finance.mjs';
import {adoptFamilyFinancingPlan,adoptDiscountBreakdown,renderFinancingBreakdown,renderBorrowerDebt,renderFamilyLoanTerms,renderFamilyLoanReference} from './financing-ui.mjs';
import {renderMotherTransfer} from './transfer-ui.mjs';

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

test('the supplied reference is displayed separately from unapproved negotiation targets and simulation terms',()=>{
 const s=adoptFamilyFinancingPlan(normalizeScenario({purchasePrice:175000}));
 Object.assign(s.familyLoan,{rate:8,years:8,referenceOffer:{amount:20000,years:8,monthlyPayment:282.73,tin:8,tae:8.30,maxAmount:20000},negotiation:{maxAmount:60000,maxYears:10,openingPercent:0,earlyRepaymentPercent:0,confirmed:false}});
 const r=calculateScenario(s),html=renderFamilyLoanTerms(s,r,helpers);
 for(const text of ['20000.00','282.73','8,00 %','8,30 %','Objetivos pendientes de negociar','no condiciones aprobadas','8 años','10 años','calendario independiente'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('15 años'));assert.ok(!html.includes('20 años'));assert.ok(!html.includes('12 %'));
 assert.equal(s.familyLoan.rate,8,'TAE is reference metadata and does not replace the calculation TIN');
 s.familyLoan.referenceOffer.years='<img src=x>';
 assert.ok(!renderFamilyLoanReference(s,helpers).includes('<img'));
});

test('legacy plan adoption keeps a known independently agreed zero-interest family calendar',()=>{
 const s=normalizeScenario({motherTransfer:{mode:'family-loan',repaymentMode:'custom',familyRate:0,familyYears:8}});
 const next=adoptFamilyFinancingPlan(s);
 assert.equal(next.motherTransfer.repaymentMode,'custom');
 assert.equal(next.motherTransfer.familyRate,0);
 assert.equal(next.motherTransfer.familyYears,8);
});

test('independent family zero-interest repayment explains the real mother contribution and counts one household outflow',()=>{
 const s=adoptFamilyFinancingPlan(normalizeScenario({purchasePrice:175000}));
 Object.assign(s.familyLoan,{amount:20000,rate:8,years:8});
 Object.assign(s.motherTransfer,{mode:'family-loan',repaymentMode:'custom',familyRate:0,familyYears:10});
 const r=calculateScenario(s);
 const html=renderMotherTransfer(s,r,{...helpers,field:(label,path,opts)=>`<label>${label} ${path} ${opts?.hint||''}</label>`,check:()=>'',select:()=>'',section:(title,description,content)=>`<section>${title}${description}${content}</section>`,num:String});
 assert.ok(html.includes('mamá soporta los intereses de su banco'));
 assert.ok(html.includes('aportación real de mamá'));
 assert.ok(html.includes('cuenta una sola vez'));
 assert.ok(html.includes(helpers.euro(r.budget.motherNetExternalCostMonthly)));
 assert.ok(html.includes('Cambiar los años del banco no modifica este contrato'));
 assert.ok(r.familyLoan.monthlyPayment>r.motherTransfer.familyMonthlyRepayment);
 assert.equal(r.motherTransfer.familyMonthlyRepayment,20000/120);
});
