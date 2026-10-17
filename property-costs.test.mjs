import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateAnnualIbi,PROPERTY_COST_PROVISION,renderPropertyCosts} from './property-costs.mjs';

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
 assert.equal(PROPERTY_COST_PROVISION.ibiAnnual/12+PROPERTY_COST_PROVISION.wasteAnnual/12+PROPERTY_COST_PROVISION.communityMonthly,250);
 const html=renderPropertyCosts({purchasePrice:250000,budget:{propertyCostsEstimated:true}}, {}, {field:()=>'',check:()=>'',notice:t=>t,row:(l,v)=>l+v,euro:n=>String(n)});
 assert.ok(html.includes('No son un máximo'));assert.ok(html.includes('hipótesis editable'));assert.ok(html.includes('bonificaciones o recargos'));
});


test('IBI numeric overflow is rejected before it can become a persisted null',()=>{
 assert.throws(()=>estimateAnnualIbi(1e308,100),/rango numérico/);
});
