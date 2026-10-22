import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateAnnualIbi,PROPERTY_COST_PROVISION,renderPropertyCosts,getPropertyCostProvision} from './property-costs.mjs';

test('IBI uses its own liquidable base and municipal percent, with cent rounding',()=>{
 assert.equal(estimateAnnualIbi(100000,0.7),700);
 assert.equal(estimateAnnualIbi('123456.78','0.565'),697.53);
 assert.equal(estimateAnnualIbi(100000,0),0);
});
test('unknown IBI inputs stay unknown and malformed or negative values are rejected',()=>{
 for(const missing of [null,undefined,'']){assert.equal(estimateAnnualIbi(missing,.7),null);assert.equal(estimateAnnualIbi(100000,missing),null);}
 for(const invalid of [-1,NaN,Infinity,{},[],true,' ','no'])assert.throws(()=>estimateAnnualIbi(invalid,.7));
 assert.throws(()=>estimateAnnualIbi(100000,-1));assert.throws(()=>estimateAnnualIbi(100000,101));
});
test('provision is a labelled budget exercise and is not derived from purchase price or surface',()=>{
 assert.equal((PROPERTY_COST_PROVISION.ibiAnnual+PROPERTY_COST_PROVISION.wasteAnnual)/12+PROPERTY_COST_PROVISION.communityMonthly,175);
 assert.equal(PROPERTY_COST_PROVISION.maintenanceAnnual,0);
 const html=renderPropertyCosts({purchasePrice:250000,budget:{propertyCostsEstimated:true}}, {}, {field:()=>'',check:()=>'',notice:t=>t,row:(l,v)=>l+v,euro:n=>String(n)});
 assert.ok(html.includes('No son un máximo'));assert.ok(html.includes('hipótesis editable'));assert.ok(html.includes('bonificaciones o recargos'));
});

test('the joint reserve follows editable search rules without replacing a real community payment',()=>{
 const provision=getPropertyCostProvision({purchaseStory:{ownershipAnnual:1700,wasteAnnual:150},budget:{communityMonthly:45}});
 assert.equal(provision.ibiAnnual,1700);assert.equal(provision.wasteAnnual,150);assert.equal(provision.communityMonthly,45);
 assert.equal(provision.maintenanceAnnual,0);assert.equal(provision.ownershipProvisionCombined,true);
});


test('IBI numeric overflow is rejected before it can become a persisted null',()=>{
 assert.throws(()=>estimateAnnualIbi(1e308,100),/rango numérico/);
});

test('municipal notes are tied to the property and do not replace or confirm its user budget',()=>{
 const helpers={field:()=>'',check:()=>'',notice:t=>t,row:(l,v)=>l+v,euro:n=>String(n)};
 const s={listingDetails:{city:'Vilafranca del Penedès'},budget:{ibiAnnual:934,wasteAnnual:270,communityMonthly:25,propertyCostsConfirmed:false}};
 const before=structuredClone(s),html=renderPropertyCosts(s,{},helpers);
 assert.deepEqual(s,before);assert.ok(html.includes('0,907 % de la base liquidable'));
 assert.ok(html.includes('295 €/año es una provisión editable'));assert.ok(html.includes('no un recibo ni un máximo'));
 assert.ok(html.includes('of_26_0.pdf'));assert.ok(html.includes('of_06_0.pdf'));assert.ok(!html.includes('Referencia municipal de Navàs'));
 const neighborhood=renderPropertyCosts({...s,listingDetails:{city:'Vilafranca del Penedès · Centre Vila'}},{},helpers);
 assert.ok(neighborhood.includes('0,907 % de la base liquidable'),'a neighborhood in the saved city label must not hide the municipal reference');
 const elsewhere=renderPropertyCosts({...s,listingDetails:{city:'Otro municipio'}},{},helpers);
 assert.ok(!elsewhere.includes('0,907 %'));
});
