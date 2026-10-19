import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario,calculateScenario} from './finance.mjs';
import {renderBudget} from './budget-ui.mjs';

function render(input={}){
 const s=normalizeScenario(input);if(!s.budget.incomes.length)s.budget.incomes=[{monthly:0,payments:12},{monthly:0,payments:12}];
 const paths=[];
 const control=(label,path)=>{assert.notEqual(path.split('.').reduce((v,k)=>v?.[k],s),undefined,path);paths.push(path);return '<label>'+label+'</label>'};
 const html=renderBudget(s,calculateScenario(s),{field:control,select:control,check:control,section:(t,st,body)=>t+st+body,notice:t=>t,row:(l,v)=>l+v,euro:n=>String(n),pct:n=>String(n),resultSidebar:()=>''});
 return {s,paths,html};
}
test('the default family budget asks for bills and storage only once without a second current-bills form',()=>{
 const {paths,html}=render();
 for(const path of ['budget.utilityBreakdown.waterMonthly','budget.utilityBreakdown.energyMonthly','budget.utilityBreakdown.internetMonthly','budget.storageMonthly','budget.foodMonthly','budget.carMonthly','budget.familyInsuranceMonthly'])assert.equal(paths.filter(p=>p===path).length,1,path);
 assert.ok(!paths.some(p=>p.startsWith('budget.currentUtilityBreakdown')));
 assert.ok(!paths.includes('budget.currentUtilitiesMonthly'));
 assert.ok(html.includes('No tienes que volver a rellenar'));
 assert.ok(html.includes('Trastero al mes'));
});
test('different current utility bills appear only after an explicit opt-out from shared bills',()=>{
 const shared=render({budget:{utilitiesMonthly:220,currentUtilitiesMonthly:190}});
 assert.ok(!shared.paths.includes('budget.currentUtilitiesMonthly'));
 assert.ok(shared.html.includes('Importe actual anterior conservado: 190'));
 const independent=render({budget:{sharedLivingCosts:false,utilitiesMonthly:220,currentUtilitiesMonthly:190}});
 assert.ok(independent.paths.includes('budget.currentUtilitiesMonthly'));
 assert.ok(independent.html.includes('Has activado suministros distintos'));
});
test('legacy current-only bills are reused in the one visible household budget',()=>{
 const {s,paths}=render({budget:{currentUtilityBreakdown:{waterMonthly:35,energyMonthly:95,internetMonthly:30}}});
 assert.equal(s.budget.utilityBreakdown.waterMonthly,35);
 assert.equal(s.budget.utilityBreakdown.energyMonthly,95);
 assert.equal(s.budget.utilityBreakdown.internetMonthly,30);
 assert.ok(!paths.some(p=>p.startsWith('budget.currentUtilityBreakdown')));
});
