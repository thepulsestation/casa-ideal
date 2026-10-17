import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario,calculateScenario} from './finance.mjs';
import {renderPurchaseFees,renderDepositInputs,renderPurchaseTimeline,setDepositInputMode} from './purchase-ui.mjs';

const helpers={field:(label,path)=>`<input data-field="${path}" aria-label="${label}">`,select:()=>'',check:()=>'',euro:n=>String(n),esc:v=>String(v)};
const home=()=>normalizeScenario({purchasePrice:175000,icf:{enabled:true},purchaseCosts:{mode:'provision'},familyLoan:{enabled:true,rate:12,years:8,coverEarlyLiquidity:true},cash:{familyLoanAvailableBeforeDeposit:true}});

test('fixed arras replace the percent while prepaid fees remain a separate part of the provision',()=>{
 const s=home();setDepositInputMode(s,'fixed');s.cash.depositAmount=3000;s.purchaseCosts.provisionBeforeSigning=500;
 const r=calculateScenario(s);
 assert.equal(r.cash.depositAmount,3000);assert.equal(r.cash.beforeMortgageRequired,3500);
 assert.equal(r.cash.purchaseFees,5000);assert.equal(r.cash.totalRequired,25500);
 assert.equal(r.familyLoan.principal,25500);assert.equal(r.cash.closingNetPayment,19000);
 setDepositInputMode(s,'percent');assert.equal(calculateScenario(s).cash.depositAmount,17500);
 setDepositInputMode(s,'fixed');assert.equal(calculateScenario(s).cash.depositAmount,3000);
});

test('itemized fees are visible immediately and replace rather than add to the provision',()=>{
 const s=home();s.purchaseCosts.mode='itemized';s.purchaseCosts.appraisal=450;s.purchaseCosts.legal=550;
 const r=calculateScenario(s),html=renderPurchaseFees(s,r,helpers);
 assert.equal(r.cash.purchaseFees,1000);assert.equal(r.cash.totalRequired,21500);
 for(const field of ['appraisal','legal','notary','registry','agency','broker','other'])assert.ok(html.includes('purchaseCosts.'+field));
 assert.ok(!html.includes('<details'));
 const deposit=renderDepositInputs(s,helpers);assert.ok(!deposit.includes('data-field="purchaseCosts.provisionBeforeSigning"'));
});

test('the signing timeline distinguishes the gross transaction from the family cash contribution',()=>{
 const r=calculateScenario(home()),html=renderPurchaseTimeline(r,helpers);
 assert.equal(r.timeline.find(t=>t.id==='signing').cashOut,180000);
 assert.equal(r.cash.closingNetPayment,5000);
 assert.ok(html.includes('Financiación de hipoteca + ICF: 175000'));
 assert.ok(html.includes('Aportación neta adicional de la familia: 5000'));
 assert.ok(html.includes('no lo que debéis aportar de vuestro bolsillo'));
});
