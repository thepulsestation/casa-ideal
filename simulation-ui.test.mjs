import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSimulation,renderSimulationResults} from './simulation-ui.mjs';
import {normalizeSimulation,calculateSimulation} from './simulation.mjs';
import {normalizeScenario} from './finance.mjs';

const euro=(value,digits=0)=>Number(value).toFixed(digits)+' €';
const helpers={euro,num:(value,digits=2)=>Number(value).toFixed(digits),pct:value=>(value*100).toFixed(2)+' %'};
function fixture(){
 const settings=normalizeSimulation({referenceMonth:'2026-10',purchaseMonth:'2027-06',evaluationMonth:'2027-06',depositFundingMode:'offset-confirmed'});
 const evaluation={valid:true,purchasePrice:180000,monthlyMortgage:632.25,mortgagePrincipal:144000,icfPrincipal:36000,bankDebtRatio:.31,
  monthlyTotal:3500,remainingMonthly:1208.06,monthlyChange:-200,monthlyIncome:4708.06,familyTotal:3500,
  fitsBank:true,fitsCash:true,fitsBudget:true,fitsResources:true,transitionFits:true,
  motherRequired:16200,motherPrincipal:21500,motherMonthly:293.02,priceContribution:0,tax:9000,fees:3600,buffer:3000,moving:600,
  insurance:{rate:3.35,payrollRate:3.35,monthly:25,baselineMonthly:25,estimated:false,netSavingMonthly:0},
  people:[{id:'buyer1',label:'Tú',income:2078,cost:1300,remaining:778,resident:true},{id:'buyer2',label:'Tu hermano',income:1430.06,cost:1100,remaining:330.06,resident:true},{id:'mother',label:'Tu madre',income:1200,cost:1100,remaining:100,resident:true},{id:'sister',label:'Tu hermana',income:0,cost:0,remaining:0,resident:true}],
  components:{mortgage:632.25,motherLoan:293.02,ibi:1000/12,repairs:1000/12,waste:100/12,insurance:25,familyInsurance:270,food:800,utilities:200,personal:800,otherShared:304.73},
  result:{cash:{fundingGap:0,beforeMortgageGap:0},motherTransfer:{totalCosts:0}}};
 return {kind:'simulation',valid:true,settings,evaluation,result:evaluation,currentRental:{totalMonthly:3700,incomeMonthly:4708.06,remainingMonthly:1008.06,components:{rent:1064,food:800,utilities:200,existingDebt:262,personalExpenses:1374},people:[{id:'buyer1',cost:1500},{id:'buyer2',cost:1200},{id:'mother',cost:1000},{id:'sister',cost:0}]},baseline:{settings:structuredClone(settings),capacity:{maxPrice:170000},evaluation:{...evaluation,purchasePrice:170000,monthlyTotal:3450}},capacity:{maxPrice:180000,reason:'Limita el dinero inicial.'},comparison:{maxPrice:10000,mortgageMonthly:30,totalMonthly:50,remainingMonthly:-50},pending:[],notes:[],errors:[]};
}
const status=(html,id)=>html.split('data-sim-status="'+id+'"')[0].split('<div class="sim-status ').pop();

test('two investigation modes and independent results preserve the input model',()=>{
 const model=fixture(),before=structuredClone(model),html=renderSimulation(model,helpers);
 assert.match(html,/¿Qué vivienda podemos permitirnos\?/);assert.match(html,/¿Encaja esta vivienda\?/);
 assert.equal((html.match(/id="simulation-results"/g)||[]).length,1);
 assert.ok(!renderSimulationResults(model,helpers).includes('id="simulation-results"'));
 assert.match(html,/id="sim-group-property"/);assert.match(html,/id="sim-group-departures"/);
 assert.match(html,/Volver a la referencia/);assert.deepEqual(model,before);
});

test('sliders have an exact numeric twin, accessible labels and experiment-only bindings',()=>{
 const html=renderSimulation(fixture(),helpers);
 for(const path of ['ibiAnnual','repairsAnnual','wasteAnnual','communityMonthly','motherAmount','motherRate','motherYears','sister.monthly','reductions.foodMonthly','reductions.waterMonthly','reductions.energyMonthly']){
  assert.equal((html.match(new RegExp('data-field="simulationDraft\\.'+path.replaceAll('.','\\.')+'"','g'))||[]).length,2,path);
 }
 assert.match(html,/type="range" data-field="simulationDraft.ibiAnnual" data-number="true"/);
 assert.match(html,/IBI · importe exacto/);assert.match(html,/IBI · deslizador/);
 assert.match(html,/simulationDraft.itpRate" data-scale="100"/);
 assert.match(html,/simulationDraft.appraisalRatio" data-scale="100"/);
 assert.ok(!html.includes('data-field="purchaseStory.'));assert.ok(!html.includes('data-field="budget.'));
 assert.match(html,/reserva conjunta al 50 %/);
});

test('target price/payment, negotiating the cap and saving goals reveal the matching controls',()=>{
 const model=fixture();model.settings.goal='check-home';model.settings.targetType='payment';model.settings.motherLoanMode='needed';model.settings.objective='min-savings';
 let html=renderSimulation(model,helpers);
 assert.match(html,/Cuota hipotecaria objetivo/);assert.match(html,/data-field="simulationDraft.targetPayment"/);
 assert.ok(!html.includes('data-field="simulationDraft.targetPrice"'));
 assert.match(html,/data-field="simulationDraft.motherLoanCap"/);assert.ok(!html.includes('data-field="simulationDraft.motherAmount"'));
 assert.match(html,/Ahorro mínimo en casa/);assert.match(html,/data-field="simulationDraft.minSavingsMonthly"/);
 model.settings.targetType='price';model.settings.objective='extra-spending';html=renderSimulation(model,helpers);
 assert.match(html,/data-field="simulationDraft.targetPrice"/);assert.match(html,/data-field="simulationDraft.allowedExtraMonthly"/);
});

test('all three transfer cases and automatic/custom insurance modes remain explicit',()=>{
 const model=fixture();let html=renderSimulation(model,helpers);
 for(const id of ['gift','interest','principal'])assert.ok(html.includes('data-field="simulationDraft.selectedCase" value="'+id+'"'));
 assert.match(html,/La cuota bancaria de mamá se cuenta una vez/);
 assert.match(html,/data-field="simulationDraft.bonusMode"/);assert.match(html,/data-sim-effective-rate/);
 for(const field of ['lifeEnabled','homeEnabled','protectionEnabled','lifeAnnual','homeAnnual','protectionAnnual','externalHomeAnnual','quotesConfirmed'])assert.ok(html.includes('data-field="simulationDraft.offers.sabadell.'+field+'"'),field);
 assert.ok(!html.includes('data-field="simulationDraft.offers.sabadell.rate"'));
 model.settings.bonusMode='custom';model.settings.selectedBank='santander';html=renderSimulation(model,helpers);
 assert.match(html,/data-field="simulationDraft.offers.santander.rate"/);
 assert.match(html,/Ahorro neto frente a solo nómina/);assert.match(html,/incremento de primas/);
});

test('bank, cash and household tests are independent, never a single misleading approval',()=>{
 const model=fixture();model.evaluation.fitsCash=false;model.evaluation.fitsBudget=false;
 const html=renderSimulationResults(model,helpers);
 assert.match(status(html,'bank'),/sim-status--pass/);
 assert.match(status(html,'cash'),/sim-status--fail/);assert.match(status(html,'budget'),/sim-status--fail/);
 assert.match(html,/falta dinero para la compra/);assert.ok(!html.includes('Hipoteca aprobada'));
 model.evaluation.fitsCash=true;model.settings.depositFundingMode='pending';model.evaluation.fitsBudget=true;model.evaluation.insurance.estimated=true;
 const pending=renderSimulationResults(model,helpers);
 assert.match(status(pending,'cash'),/sim-status--pending/);assert.match(status(pending,'budget'),/sim-status--pending/);
 assert.match(pending,/primas estimadas/);
 model.evaluation.insurance.estimated=false;model.evaluation.fitsResources=false;
 assert.match(status(renderSimulationResults(model,helpers),'budget'),/sim-status--fail/);
});

test('household cash, external costs and provisional individual balances stay distinct',()=>{
 const model=fixture();model.evaluation.people[1]={...model.evaluation.people[1],resident:false,outsidePending:true,cost:1400,remaining:30.06};model.evaluation.familyTotal=4200;
 const html=renderSimulationResults(model,helpers);
 assert.match(html,/Gasto de la casa/);assert.match(html,/Disponible en casa/);
 assert.match(html,/Su sueldo completo no queda disponible/);assert.match(html,/4200.00 €\/mes/);
 assert.match(html,/Gastos fuera incompletos/);assert.match(html,/Provisional/);
 assert.match(status(html,'budget'),/sim-status--pending/);
 assert.match(html,/3700.00 €/);assert.match(html,/3500.00 €/);assert.match(html,/1208.06 €/);
 assert.match(html,/170000 €/);assert.match(html,/180000 €/);assert.match(html,/\+10000.00 €/);
});

test('funding uses calculated gift costs and the editable provision instead of a fixed percentage',()=>{
 const model=fixture();model.settings.provisionPercent=2.5;model.evaluation.result.motherTransfer.totalCosts=1342.5;
 const html=renderSimulationResults(model,helpers);
 assert.match(html,/Impuesto y formalización de la donación/);assert.match(html,/1342.50 €/);
 assert.match(html,/Provisión de compra · 2.50 %/);assert.ok(!html.includes('Provisión de compra · 2 %'));
 assert.match(html,/Capital necesario de mamá/);assert.match(html,/Capital que pide mamá/);
 assert.match(html,/Las arras son parte del precio/);assert.match(html,/Falta antes de firmar/);
});

test('saved combinations offer explicit open, update, copy and delete without unsafe markup',()=>{
 const model=fixture(),html=renderSimulation(model,helpers,{library:[{id:'a"b',name:'<img src=x>'}],activeId:'a"b',name:'<script>draft</script>',dirty:true});
 assert.match(html,/Actualizar combinación/);assert.match(html,/data-action="simulation-save-copy"/);
 assert.match(html,/data-action="simulation-load"/);assert.match(html,/data-action="simulation-delete"/);
 assert.match(html,/Combinación sin guardar/);assert.match(html,/&lt;img src=x&gt;/);assert.match(html,/a&quot;b/);
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>draft'));
 const nameInput=html.match(/<input id="simulation-name"[^>]+>/)?.[0];assert.ok(nameInput);assert.ok(!nameInput.includes('data-field'));
 assert.ok(html.indexOf('id="simulation-name"')<html.indexOf('class="sim-dashboard"'));
});

test('missing/invalid inputs remain pending and arbitrary model labels are escaped',()=>{
 const empty=renderSimulation({},helpers);assert.ok(!/NaN|undefined/.test(empty));
 for(const id of ['bank','cash','budget'])assert.match(status(empty,id),/sim-status--pending/);
 const model=fixture();model.errors=['<svg onload=x>'];model.pending=['<iframe>'];model.evaluation.people[0].label='<script>x</script>';
 const html=renderSimulation(model,helpers);
 assert.ok(!html.includes('<svg'));assert.ok(!html.includes('<iframe>'));assert.ok(!html.includes('<script>x'));
 assert.match(html,/&lt;svg/);assert.match(html,/&lt;iframe&gt;/);assert.match(html,/&lt;script&gt;/);
});

test('real calculation output renders prices, cash and per-person results without an adapter',()=>{
 const source=normalizeScenario({budget:{incomes:[{monthly:2300,payments:12},{monthly:1300,payments:14}],householdIncomes:[{id:'mother',monthly:1200,payments:14},{id:'sister',monthly:0,payments:12}],currentRent:1064,foodMonthly:800,familyInsuranceMonthly:270,utilitiesMonthly:200,existingDebtMonthly:262},familyPlan:{purchaseMonth:'2027-06',motherLoanStartMonth:'2027-04',purchaseAllocation:'shared-household',sharedCostMode:'workers'}});
 const model=calculateSimulation(source,{referenceMonth:'2026-10',purchaseMonth:'2027-06',evaluationMonth:'2027-06',goal:'check-home',targetPrice:170000,depositFundingMode:'offset-confirmed'},{searchCeiling:250000});
 assert.equal(model.valid,true);assert.ok(model.evaluation);
 const html=renderSimulation(model,helpers);
 assert.ok(html.includes(euro(model.evaluation.purchasePrice)));assert.ok(html.includes(euro(model.evaluation.monthlyMortgage,2)));
 assert.ok(html.includes(euro(model.evaluation.motherRequired)));assert.ok(html.includes(euro(model.evaluation.people[0].cost,2)));
 assert.ok(!/NaN|undefined/.test(html));
});
