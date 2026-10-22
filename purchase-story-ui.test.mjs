import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPurchaseStory} from './purchase-story-ui.mjs';

const euro=(value,digits=0)=>Number(value).toFixed(digits)+' €';
const pct=value=>(value*100).toFixed(0)+' %';
const helpers={euro,pct};
function fixture(){
 const settings={mode:'fixed',selectedBank:'sabadell',selectedCase:'principal',referenceMonth:'2026-10',purchaseMonth:'2027-06',debtRatioLimit:.35,bankDebtMonthly:250,referenceMotherAmount:20000,motherLoanCap:20000,motherRate:7,motherYears:8,allowedExtraMonthly:0,ownershipAnnual:2100,wasteAnnual:120,communityMonthly:0,provisionPercent:2,buffer:3000,cashSavings:0,moving:600,depositPercent:.1,icfLtv:.2,icfMaxAmount:50000,itpRate:.05,homeInsuranceAnnual:300,homeInsuranceConfirmed:false,offers:{sabadell:{rate:3.35,ltv:.8,years:30},santander:{rate:3.45,ltv:.75,years:30}}};
 const actual={purchasePrice:170000,mortgagePrincipal:136000,monthlyMortgage:600,motherRequired:18000,motherPrincipal:20000,motherMonthly:280,bankDebtRatio:.3,budgetTotal:3600,budgetChange:-100,priceContribution:0,tax:8500,fees:3400,buffer:3000,missingQuotes:['Seguro de hogar'],people:[{id:'buyer1',label:'Persona A',purchaseCost:1300,purchaseRemaining:900}]};
 const rows=['sabadell','santander'].flatMap(bankId=>['gift','interest','principal'].map((caseId,index)=>({bankId,caseId,maxPrice:170000,reference:{purchasePrice:260000+index*1000,mortgagePrincipal:208000,mortgageCapacityMonthly:1000-index*100,icfPrincipal:50000,priceContribution:2000,tax:13000,fees:5200,motherRequired:24000,shortfall:4000},actual,reason:'Limita el dinero inicial.'})));
 return {settings,bankIncome:4000,bankDebtMonthly:250,debtLimitMonthly:1400,currentBudget:{incomeMonthly:5200,totalMonthly:3700,remainingMonthly:1500,components:{rent:1100,food:750,familyInsurance:260},people:[{id:'buyer1',label:'Persona A',income:2200,cost:1600,remaining:600}]},referenceMother:{principal:20000,monthly:280,principalOnlyMonthly:20000/96},hypotheses:[{id:'gift',mortgageCapacityMonthly:1150,repaymentMonthly:0},{id:'interest',mortgageCapacityMonthly:870,repaymentMonthly:280},{id:'principal',mortgageCapacityMonthly:941.67,repaymentMonthly:208.33}],rows,selected:rows[2],errors:[]};
}

test('six ordered steps explain budget, rules, banks, cases, theory, then feasible purchase',()=>{
 const model=fixture(),before=structuredClone(model),html=renderPurchaseStory(model,helpers);
 const steps=['budget','rules','banks','hypotheses','theory','result'];
 let previous=-1;
 for(const step of steps){const index=html.indexOf('id="purchase-story-'+step+'"');assert.ok(index>previous,step);previous=index;}
 assert.equal((html.match(/class="ps-step-number"/g)||[]).length,6);
 assert.match(html,/Ingresos ordinarios \/ mes/);assert.match(html,/No significa que todo se ahorre/);
 assert.deepEqual(model,before);
});

test('three cases show their calculated quotas and preserve the mother bank cost in all cases',()=>{
 const html=renderPurchaseStory(fixture(),helpers);
 for(const value of ['1150.00 €','870.00 €','941.67 €'])assert.ok(html.includes(value),value);
 for(const id of ['gift','interest','principal'])assert.ok(html.includes('data-field="purchaseStory.selectedCase" value="'+id+'"'));
 assert.match(html,/Su cuota bancaria permanece/);assert.match(html,/no es el interés bancario exacto de cada mes/);
 assert.match(html,/Devolución conjunta a mamá/);
});

test('bank-only prices remain separate from the closed-loop feasible price and cash shortfall',()=>{
 const html=renderPurchaseStory(fixture(),helpers),theory=html.split('id="purchase-story-theory"')[1].split('id="purchase-story-result"')[0],result=html.split('id="purchase-story-result"')[1];
 assert.ok(theory.includes('262000 €'));assert.ok(theory.includes('4000 €'));
 assert.ok(result.includes('Hasta 170000 €'));assert.ok(!result.includes('Hasta 262000 €'));
 assert.match(html,/Todavía puede faltar dinero para comprar/);
 assert.equal((theory.match(/<tr/g)||[]).length,7);
 assert.match(result,/Capital necesario de mamá/);assert.match(result,/18000 €/);assert.match(result,/20000 €/);
});

test('a failed feasible search does not turn the theoretical price into a buying recommendation',()=>{
 const model=fixture();model.selected={...model.selected,maxPrice:0,actual:null,reason:'Falta dinero antes de firmar.'};
 const html=renderPurchaseStory(model,helpers),result=html.split('id="purchase-story-result"')[1];
 assert.match(result,/Necesitamos ajustar el plan/);assert.match(result,/Falta dinero antes de firmar/);
 assert.ok(!result.includes('Hasta '));assert.match(result,/Por completar/);
});

test('all rule and bank controls bind only to shared purchaseStory settings with correct scales',()=>{
 const html=renderPurchaseStory(fixture(),helpers);
 for(const path of ['bankDebtMonthly','debtRatioLimit','icfLtv','icfMaxAmount','itpRate','provisionPercent','ownershipAnnual','wasteAnnual','communityMonthly','buffer','cashSavings','moving','depositPercent','homeInsuranceAnnual','homeInsuranceConfirmed','referenceMonth','purchaseMonth','offers.sabadell.rate','offers.santander.rate','offers.sabadell.ltv','offers.santander.ltv','offers.sabadell.years','offers.santander.years','selectedBank','selectedCase','mode','motherRate','motherYears'])assert.ok(html.includes('data-field="purchaseStory.'+path+'"'),path);
 assert.match(html,/data-field="purchaseStory.itpRate" data-scale="100"/);
 assert.match(html,/data-field="purchaseStory.offers.santander.ltv" data-scale="100"/);
 assert.ok(!html.includes('ownership.maintenanceAnnual'));
 assert.match(html,/IBI y reparaciones juntos/);
});

test('negotiation controls are conditional and additional monthly spending is explicit',()=>{
 const model=fixture();let html=renderPurchaseStory(model,helpers);
 assert.match(html,/Capital fijo de mamá/);assert.ok(!html.includes('data-field="purchaseStory.motherLoanCap"'));
 model.settings.mode='negotiate';html=renderPurchaseStory(model,helpers);
 assert.ok(html.includes('data-field="purchaseStory.motherLoanCap"'));assert.ok(!html.includes('data-field="purchaseStory.allowedExtraMonthly"'));
 model.settings.mode='budget';html=renderPurchaseStory(model,helpers);
 assert.ok(html.includes('data-field="purchaseStory.allowedExtraMonthly"'));assert.match(html,/hipótesis de negociación/);
});

test('pending confirmations use current editable values and keep insurance separate from bonuses',()=>{
 const model=fixture();model.settings.ownershipAnnual=2600;model.settings.wasteAnnual=150;model.settings.homeInsuranceAnnual=null;
 const html=renderPurchaseStory(model,helpers);
 assert.match(html,/Para confirmar después/);assert.match(html,/2600 €/);assert.match(html,/150 €/);
 assert.match(html,/No es una bonificación añadida al TIN/);assert.match(html,/oferta escrita/);
 assert.match(html,/cómo se compensará el anticipo/);assert.ok(!html.includes('1500 €'));
});

test('untrusted labels, errors and quotes are escaped and incomplete inputs never render NaN or undefined',()=>{
 const model=fixture();model.currentBudget.people[0].label='<img src=x onerror=alert(1)>';model.errors=['<script>alert(1)</script>'];model.selected.actual.missingQuotes=['<iframe src=x>'];
 const html=renderPurchaseStory(model,helpers);
 assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;iframe'));
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<iframe'));
 const empty=renderPurchaseStory({},helpers);assert.ok(!/NaN|undefined/.test(empty));assert.match(empty,/Por completar/);
});
