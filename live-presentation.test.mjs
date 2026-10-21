import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLiveSlides,renderLivePresentation} from './live-presentation.mjs';
import {normalizeScenario} from './finance.mjs';
import {calculateMortgageSearch} from './mortgage-search.mjs';

function fixture(){return {
 settings:{referenceMonth:'2026-10',purchaseMonth:'2027-06',cashSavings:0,motherLoanCap:21000,ownership:{ibiAnnual:1500,wasteAnnual:300,communityMonthly:100,maintenanceAnnual:0},purchase:{provisionPercent:2,moving:600,buffer:3000,depositPercent:.1}},
 currentBudget:{month:'2026-10',totalMonthly:3800,incomeMonthly:5000,remainingMonthly:1200,components:{rent:1100,food:800,familyInsurance:270},people:[{id:'buyer1',label:'Persona A',income:2200,cost:1600,remaining:600}]},
 scenarios:[{bankId:'a',bankName:'Banco A'},{bankId:'b',bankName:'Banco B'}],
 selected:{bankId:'a',bankName:'Banco A',financingMode:'icf',available:true,maxPriceKnownCosts:188000,mortgagePrincipal:150400,icfPrincipal:37600,motherLoanRequired:18800,monthly:{living:2400,mortgage:620,motherBank:260,ownership:250,insurance:null,insuranceEquivalent:null,total:3530},limits:{spending:{ceiling:3800,maximumMortgageMonthlyBeforeUnknownInsurance:890},debt:{ratio:.32,limit:.35},finalCash:{gap:0},earlyCash:{gap:0}},bindingConstraint:'spending',incomplete:true,missingQuotes:['Seguro de vida'],bonuses:{payrollRate:3.2,fullRate:2.6,interestSavingMonthly:50,productMonthly:null,productEquivalentMonthly:null,netSavingMonthly:null,missingQuotes:['Seguro de vida']},comparisonPeople:[{id:'buyer1',label:'Persona A',purchaseCost:1700,purchaseRemaining:500}]},
 comparisonPrice:180000,atCommonPrice:[{bankId:'a',bankName:'Banco A',monthly:{mortgage:600,insurance:null,insuranceEquivalent:null,total:3500},incomplete:true}],missingQuotes:['Seguro de vida'],errors:[]
};}

test('story derives a stable 16-slide sequence with affordability before price and dynamic scripts',()=>{
 const model=fixture(),before=structuredClone(model),slides=buildLiveSlides(model);
 assert.equal(slides.length,16);
 assert.equal(new Set(slides.map(s=>s.id)).size,16);
 assert.ok(slides.findIndex(s=>s.id==='cuota-disponible')<slides.findIndex(s=>s.id==='precio-maximo'));
 for(const slide of slides){assert.ok(slide.title&&slide.body&&slide.notes&&slide.takeaway);assert.ok(slide.notes.split(/\s+/).length>=85,slide.id);}
 assert.deepEqual(model,before);
 const changed=fixture();changed.currentBudget.totalMonthly=4100;changed.currentBudget.incomeMonthly=5500;changed.selected.maxPriceKnownCosts=201000;
 const fresh=buildLiveSlides(changed);
 assert.notEqual(slides.find(s=>s.id==='hoy').body,fresh.find(s=>s.id==='hoy').body);
 assert.notEqual(slides.find(s=>s.id==='hoy').notes,fresh.find(s=>s.id==='hoy').notes);
 assert.notEqual(slides.find(s=>s.id==='precio-maximo').notes,fresh.find(s=>s.id==='precio-maximo').notes);
 assert.ok(!slides.some(s=>s.body.includes('215.000')));
});

test('unknown insurance remains pending and prevents a definitive affordability claim',()=>{
 const slides=buildLiveSlides(fixture()),bonus=slides.find(s=>s.id==='bonificaciones'),end=slides.find(s=>s.id==='decision');
 assert.match(bonus.body,/Pendiente/);assert.match(bonus.notes,/no ponemos cero/);
 assert.match(end.body,/Faltan presupuestos/);
 assert.doesNotMatch(bonus.body,/<strong>0,00(?:\s|&nbsp;|€)/);
 const known=fixture();known.missingQuotes=[];known.selected.missingQuotes=[];known.selected.incomplete=false;known.selected.monthly.insurance=70;known.selected.monthly.insuranceEquivalent=70;known.selected.bonuses.missingQuotes=[];known.selected.bonuses.productEquivalentMonthly=70;known.selected.bonuses.netSavingMonthly=-20;
 assert.match(buildLiveSlides(known).find(s=>s.id==='decision').body,/Encaja en el cálculo actual/);
});

test('pending quotes from another bank do not contaminate the selected quoted offer',()=>{
 const model=fixture();model.missingQuotes=['Santander: seguro pendiente'];model.selected.missingQuotes=[];model.selected.bonuses.missingQuotes=[];model.selected.monthly.insurance=70;model.selected.monthly.insuranceEquivalent=0;model.selected.bonuses.productEquivalentMonthly=70;model.selected.bonuses.netSavingMonthly=-20;
 const slides=buildLiveSlides(model),end=slides.find(s=>s.id==='decision'),bonus=slides.find(s=>s.id==='bonificaciones');
 assert.match(end.body,/Encaja con lo cotizado/);assert.doesNotMatch(end.body,/Santander|Faltan presupuestos/);
 assert.doesNotMatch(bonus.body,/Faltan primas/);
 model.selected.limits.debt.ratio=.4;
 assert.match(buildLiveSlides(model).find(s=>s.id==='decision').body,/Necesita ajustes/);
});

test('IBI is annual and monthly once, and the property figure does not absorb mortgage insurance',()=>{
 const slide=buildLiveSlides(fixture()).find(s=>s.id==='propiedad');
 assert.match(slide.body,/1[.\s]?500/);assert.match(slide.body,/125/);
 assert.match(slide.body,/Incluido una vez/);assert.match(slide.body,/No incluye las primas/);
 assert.match(slide.notes,/una sola vez/);
});

test('native controls expose navigation, bank selection, notes and clamped indices',()=>{
 const model=fixture(),html=renderLivePresentation(model,{index:999,notesOpen:true});
 for(const action of ['story-prev','story-next','story-notes','story-fullscreen','story-go'])assert.ok(html.includes(`data-action="${action}"`));
 assert.match(html,/id="story-slide-selector"/);assert.match(html,/id="story-bank-select"/);
 assert.match(html,/data-story-index="15"/);assert.match(html,/aria-expanded="true"/);
 assert.match(html,/value="a" selected/);
 assert.ok(!html.includes('<script'));assert.ok(!html.includes('<svg'));
 assert.match(renderLivePresentation(model,{index:-4}),/data-story-index="0"/);
});

test('comparison uses a common price and escapes untrusted source labels and scripts',()=>{
 const model=fixture();model.selected.bankName='<img src=x onerror=alert(1)>';model.currentBudget.people[0].label='<script>bad</script>';
 const slides=buildLiveSlides(model),comparison=slides.find(s=>s.id==='bancos');
 assert.match(comparison.body,/180[.\s]?000/);
 assert.match(comparison.body,/Pendiente/);
 const html=renderLivePresentation(model,{index:1,notesOpen:true});
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotThrow(()=>renderLivePresentation({}));
});

test('real mortgage search feeds the live narrative without depending on a preset property price',()=>{
 const source=normalizeScenario({purchasePrice:170000,mortgage:{baseRate:2.7,years:30},icf:{enabled:true},familyLoan:{enabled:true,maxAmount:21500,rate:6.99,years:8,coverEarlyLiquidity:true},cash:{familyLoanAvailableBeforeDeposit:true},budget:{incomes:[{label:'A',monthly:2300,payments:12},{label:'B',monthly:1700,payments:12}],householdIncomes:[{id:'mother',monthly:1200,payments:12}],currentRent:1100,foodMonthly:800,utilitiesMonthly:300,familyInsuranceMonthly:270,existingDebtMonthly:200,sharedLivingCosts:true},familyPlan:{purchaseMonth:'2027-06',savingsStartMonth:'2026-10',motherLoanStartMonth:'2027-04',university:{amount:565.63,endMonth:'2027-06'}}});
 const settings={referenceMonth:'2026-10',purchaseMonth:'2027-06',selectedBank:'sabadell',financingMode:'icf',cashSavings:0};
 const options={asOfMonth:'2026-10',step:1000,searchCeiling:400000};
 const model=calculateMortgageSearch(source,settings,options),slides=buildLiveSlides({...model,source});
 assert.deepEqual(model.errors,[]);assert.ok(model.selected);assert.equal(slides.length,16);
 assert.ok(slides.find(s=>s.id==='precio-maximo').notes.includes(new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0,minimumFractionDigits:0}).format(model.selected.maxPriceKnownCosts)));
 assert.match(slides.find(s=>s.id==='bonificaciones').body,/Pendiente/);
 assert.match(slides.find(s=>s.id==='decision').body,/presupuestos|ajustes/);
 const differentSeed=structuredClone(source);differentSeed.purchasePrice=310000;
 const second=calculateMortgageSearch(differentSeed,settings,options);
 assert.equal(second.selected.maxPriceKnownCosts,model.selected.maxPriceKnownCosts);
 const changed=structuredClone(source);changed.budget.foodMonthly+=123;
 const updated=buildLiveSlides({...calculateMortgageSearch(changed,settings,options),source:changed});
 assert.notEqual(updated.find(s=>s.id==='hoy').notes,slides.find(s=>s.id==='hoy').notes);
 assert.match(renderLivePresentation({...model,source},{index:10}),/Cuota hipotecaria disponible/);
});

test('an unknown external-home alternative blocks net bonus savings, not the quoted active plan',()=>{
 const model=fixture();model.selected.missingQuotes=[];model.selected.monthly.insurance=70;model.selected.monthly.insuranceEquivalent=0;model.selected.bonuses.productEquivalentMonthly=70;model.selected.bonuses.netSavingMonthly=null;model.selected.bonuses.missingQuotes=['Hogar externo de alternativa sin productos'];
 const slides=buildLiveSlides(model),bonus=slides.find(s=>s.id==='bonificaciones'),end=slides.find(s=>s.id==='decision');
 assert.match(bonus.body,/El plan está cotizado/);assert.match(bonus.body,/Pendiente/);
 assert.match(end.body,/Encaja con lo cotizado/);assert.doesNotMatch(end.body,/Faltan presupuestos/);
});

test('comparison adds recurring insurance to the initial-premium equivalent once without changing real monthly total',()=>{
 const model=fixture();model.atCommonPrice=[{bankId:'a',bankName:'Banco A',financingMode:'icf',available:true,missingQuotes:[],monthly:{mortgage:600,insurance:40,insuranceEquivalent:30,total:3500}}];
 const comparison=buildLiveSlides(model).find(s=>s.id==='bancos');
 assert.match(comparison.body,/70,00/);assert.match(comparison.body,/3[.\s]?500,00/);
 assert.doesNotMatch(comparison.body,/3[.\s]?530,00/);
});

test('zero prices, failed limits and a negative individual margin prevent an affordability claim',()=>{
 const zero=fixture();zero.selected.maxPriceKnownCosts=0;
 let end=buildLiveSlides(zero).find(slide=>slide.id==='decision');
 assert.match(end.body,/Necesita ajustes/);assert.match(end.body,/Ningún precio positivo/);
 for(const limit of ['spending','debt','finalCash','earlyCash','preclosing']){
  const model=fixture();model.selected.limits[limit]={...model.selected.limits[limit],fits:false};
  assert.match(buildLiveSlides(model).find(slide=>slide.id==='decision').body,/Necesita ajustes/,limit);
 }
 const negative=fixture();negative.selected.comparisonPeople[0].purchaseRemaining=-1;
 assert.match(buildLiveSlides(negative).find(slide=>slide.id==='decision').body,/Necesita ajustes/);
 const unknown=fixture();unknown.selected.maxPriceKnownCosts=null;
 assert.match(buildLiveSlides(unknown).find(slide=>slide.id==='decision').body,/Faltan datos para calcular/);
});

test('the bonus script names only enabled policies for the selected bank',()=>{
 const model=fixture();model.selected.bankId='santander';model.selected.bankName='Santander';
 model.settings.offers={santander:{products:[{label:'Vida',enabled:false},{label:'Hogar',enabled:true},{label:'Protección de pagos',enabled:true}]}};
 let notes=buildLiveSlides(model).find(slide=>slide.id==='bonificaciones').notes;
 assert.match(notes,/coste de Hogar, Protección de pagos/);assert.doesNotMatch(notes,/Vida|coste de vida/);
 model.settings.offers.santander.products[0].enabled=true;
 notes=buildLiveSlides(model).find(slide=>slide.id==='bonificaciones').notes;
 assert.match(notes,/coste de Vida, Hogar, Protección de pagos/);
});
