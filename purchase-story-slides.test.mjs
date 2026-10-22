import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPurchaseStorySlides} from './purchase-story-slides.mjs';
import {buildLiveSlides,renderLivePresentation} from './live-presentation.mjs';
import {normalizeScenario} from './finance.mjs';
import {calculatePurchaseStory} from './purchase-story.mjs';

function fixture(){
 const settings={mode:'fixed',selectedBank:'sabadell',selectedCase:'principal',referenceMonth:'2026-10',purchaseMonth:'2027-06',bankDebtMonthly:200,motherRate:6.5,motherYears:8,referenceMotherAmount:21000,motherLoanCap:21000,ownershipAnnual:2000,wasteAnnual:100,provisionPercent:2,buffer:3000,moving:600,depositPercent:.1,icfLtv:.2,icfMaxAmount:50000,itpRate:.05,homeInsuranceAnnual:300,homeInsuranceConfirmed:false,allowedExtraMonthly:0,offers:{sabadell:{rate:3.35,ltv:.8,years:30},santander:{rate:3.45,ltv:.75,years:30}}};
 const currentBudget={month:'2026-10',incomeMonthly:5000,totalMonthly:3800,remainingMonthly:1200,components:{rent:1100,food:800,familyInsurance:270},people:[{id:'buyer1',label:'Persona A',income:2300,cost:1600,remaining:700},{id:'buyer2',label:'Persona B',income:1600,cost:1300,remaining:300},{id:'mother',label:'Persona C',income:1100,cost:900,remaining:200},{id:'sister',label:'Persona D',income:0,cost:0,remaining:0}]};
 const hypotheses=[{id:'gift',title:'Donación',repaymentMonthly:0,mortgageCapacityMonthly:1165},{id:'interest',title:'Cuota completa',repaymentMonthly:280,mortgageCapacityMonthly:885},{id:'principal',title:'Solo capital',repaymentMonthly:218.75,mortgageCapacityMonthly:946.25}];
 const rows=['sabadell','santander'].flatMap(bankId=>hypotheses.map(h=>({bankId,bankName:bankId==='sabadell'?'Sabadell':'Santander',caseId:h.id,title:h.title,reference:{purchasePrice:290000,mortgagePrincipal:230000,mortgageCapacityMonthly:h.mortgageCapacityMonthly,icfPrincipal:50000,priceContribution:10000,tax:14500,fees:5800,buffer:3000,moving:600,motherRequired:35000,motherPrincipal:21000,motherMonthly:280,shortfall:14000,earlyShortfall:0},actual:{purchasePrice:185000,mortgagePrincipal:148000,mortgageCapacityMonthly:h.mortgageCapacityMonthly,icfPrincipal:37000,priceContribution:0,tax:9250,fees:3700,buffer:3000,moving:600,motherRequired:18500,motherPrincipal:21000,motherMonthly:280,shortfall:0,earlyShortfall:0,monthlyMortgage:650,budgetTotal:3000,budgetChange:-800,spendingCap:3800,fitsBank:true,fitsCash:true,fitsBudget:true,transitionFits:true,missingQuotes:['Seguro de hogar'],people:[{id:'buyer1',label:'Persona A',currentCost:1600,purchaseCost:1000,purchaseRemaining:1300},{id:'buyer2',label:'Persona B',currentCost:1300,purchaseCost:800,purchaseRemaining:800},{id:'mother',label:'Persona C',currentCost:900,purchaseCost:1000,purchaseRemaining:100},{id:'sister',label:'Persona D',currentCost:0,purchaseCost:200,purchaseRemaining:300}]}})));
 return {kind:'purchase-story',settings,currentBudget,bankIncome:3900,debtLimitMonthly:1365,bankDebtMonthly:200,referenceMother:{principal:21000,monthly:280,principalOnlyMonthly:218.75},hypotheses,rows,scenarios:rows,selected:rows[2],errors:[]};
}

test('the live story follows ten steps from budget to terms, cases, financing and decision',()=>{
 const model=fixture(),before=structuredClone(model),slides=buildPurchaseStorySlides(model);
 assert.deepEqual(slides.map(slide=>slide.id),['story-objetivo','story-presupuesto','story-reglas','story-bancos','story-hipotesis','story-teoria','story-entrada','story-viable','story-reparto','story-decision']);
 for(const slide of slides){assert.ok(slide.title&&slide.body&&slide.notes&&slide.takeaway);assert.ok(slide.notes.length>100);}
 assert.deepEqual(model,before);
 assert.deepEqual(buildLiveSlides(model),slides);
});

test('budget, ownership and lender terms are read from the shared model instead of a preset private example',()=>{
 const first=fixture(),changed=fixture();changed.currentBudget.totalMonthly=4321.87;changed.currentBudget.incomeMonthly=6000;
 changed.settings.icfMaxAmount=45000;changed.settings.ownershipAnnual=2200;changed.settings.offers.santander.rate=3.65;
 const original=buildPurchaseStorySlides(first),fresh=buildPurchaseStorySlides(changed);
 assert.notEqual(original[1].body,fresh[1].body);assert.match(fresh[1].body,/4\.321,87/);
 assert.match(fresh[2].body,/45\.000/);assert.match(fresh[2].body,/2\.200/);assert.match(fresh[3].body,/3,65/);
 assert.match(original[2].body,/Una única reserva conjunta/);assert.doesNotMatch(original[2].body,/1\.500|1\.200/);
 assert.match(original[3].body,/reserva de 300/);
});

test('all three contractual cases retain the external mother payment in the narrative',()=>{
 const slides=buildPurchaseStorySlides(fixture()),cases=slides[4];
 assert.match(cases.body,/1\.165,00/);assert.match(cases.body,/885,00/);assert.match(cases.body,/946,25/);
 assert.match(cases.notes,/donación/i);assert.match(cases.notes,/impuesto y notaría/);
 assert.match(cases.notes,/no es el interés exacto de cada recibo/);
 assert.match(cases.body,/hogar sigue pagando la cuota bancaria completa/);
});

test('the bank-only price and failed cash need are distinct from the feasible closed-loop result',()=>{
 const slides=buildPurchaseStorySlides(fixture());
 assert.match(slides[5].body,/290\.000/);assert.match(slides[5].body,/no es todavía una compra viable/);
 assert.match(slides[6].body,/35\.000/);assert.match(slides[6].body,/14\.000/);
 assert.match(slides[7].body,/185\.000/);assert.doesNotMatch(slides[7].body,/290\.000/);
 assert.match(slides[6].notes,/arras ya forman parte del precio/);
 assert.match(slides[7].notes,/cuota se incorpora otra vez/);
});

test('a missing or failed selected result cannot claim that the purchase fits',()=>{
 for(const change of [model=>{model.selected.actual=null;},model=>{model.selected.actual.fitsCash=false;},model=>{model.selected.actual.purchasePrice=0;}]){
  const model=fixture();change(model);const slides=buildPurchaseStorySlides(model);
  assert.match(slides[9].body,/Necesita ajustes/);
 }
 const confirmed=fixture();confirmed.selected.actual.missingQuotes=[];confirmed.settings.homeInsuranceConfirmed=true;
 assert.match(buildPurchaseStorySlides(confirmed)[9].body,/sujeto a aprobación/);
 const unknown=fixture();unknown.selected.reference.shortfall=null;unknown.selected.reference.earlyShortfall=null;
 assert.match(buildPurchaseStorySlides(unknown)[6].body,/Efectivo que faltaría<\/span><strong>Pendiente/);
});

test('pending premiums, donation terms and arras liquidity remain part of the final decision',()=>{
 const slides=buildPurchaseStorySlides(fixture()),end=slides[9];
 assert.match(end.body,/faltan confirmaciones/);assert.match(end.body,/liquidez para arras/);
 assert.match(end.body,/fiscalidad de la donación/);assert.match(end.notes,/300/);
 assert.match(end.notes,/estimación mientras no tengamos prima/);
});

test('all modes and selected-bank controls remain data-driven and native',()=>{
 const model=fixture();model.settings.mode='budget';model.settings.allowedExtraMonthly=150;
 const slides=buildPurchaseStorySlides(model);
 assert.match(slides[7].body,/Negociar préstamo y gasto mensual/);assert.match(slides[7].notes,/150,00/);
 const html=renderLivePresentation(model,{index:999,notesOpen:true});
 assert.match(html,/data-story-index="9"/);assert.match(html,/id="story-bank-select"/);
 assert.match(html,/value="sabadell" selected/);assert.match(html,/aria-expanded="true"/);
 assert.match(html,/id="story-slide-selector"/);assert.match(html,/story-next" disabled/);
});

test('external labels are escaped and an empty story renders pending figures without invalid numbers',()=>{
 const model=fixture();model.selected.bankName='<img src=x onerror=alert(1)>';model.currentBudget.people[0].label='<script>bad</script>';
 const html=buildPurchaseStorySlides(model).map(slide=>slide.body).join('');
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));
 assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);
 const empty=buildPurchaseStorySlides({});assert.equal(empty.length,10);
 assert.doesNotMatch(empty.map(slide=>slide.body+slide.notes).join(''),/NaN|undefined/);
 assert.match(empty[9].body,/Necesita ajustes/);
});

test('the real closed-loop model feeds the same six theory and feasible cases to the slides',()=>{
 const source=normalizeScenario({purchasePrice:170000,budget:{incomes:[{monthly:2300,payments:12},{monthly:1700,payments:14}],householdIncomes:[{id:'mother',monthly:1500,payments:14},{id:'sister',monthly:0,payments:12}],existingDebtMonthly:262,currentRent:1500,foodMonthly:800,utilitiesMonthly:200,familyInsuranceMonthly:270},motherTransfer:{giftPublicDeed:true,giftNotaryCost:250},cash:{preClosingLoanPayments:2,familyLoanAvailableBeforeDeposit:true},familyPlan:{purchaseMonth:'2027-06',motherLoanStartMonth:'2027-04',sharedCostMode:'workers',purchaseAllocation:'shared-household',university:{amount:500,endMonth:'2027-06'}}});
 const model=calculatePurchaseStory(source,{referenceMonth:'2026-10',purchaseMonth:'2027-06'}),slides=buildLiveSlides(model);
 assert.equal(model.valid,true);assert.equal(slides.length,10);
 assert.equal((slides[5].body.match(/<th scope="row">/g)||[]).length,6);
 assert.equal((slides[7].body.match(/<th scope="row">/g)||[]).length,6);
 assert.doesNotMatch(slides.map(slide=>slide.body+slide.notes).join(''),/NaN|undefined/);
 assert.match(slides[4].body,/4\.000,00/);
 assert.match(renderLivePresentation(model,{index:7}),/value="sabadell" selected/);
});
