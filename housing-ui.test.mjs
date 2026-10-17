import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario,calculateScenario} from './finance.mjs';
import {renderRentalComparison,renderPropertyGallery,renderHousingList} from './housing-ui.mjs';
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const euro=n=>Number.isFinite(n)?n.toFixed(2):'Pendiente';
test('rental comparison includes utilities and living costs on both sides and the mother loan once',()=>{
 const s=normalizeScenario({budget:{incomes:[{monthly:4000,payments:12}],utilitiesMonthly:180,foodMonthly:400,carMonthly:100,storageMonthly:60},familyLoan:{enabled:true,rate:5,years:10,assumedTerms:true}});
 const r=calculateScenario(s),html=renderRentalComparison(s,r,{euro,esc});
 assert.ok(html.includes(euro(r.budget.currentRent+180)));
 assert.ok(html.includes(euro(r.budget.homeMonthly+r.familyLoan.monthlyPayment)));
 assert.ok(html.includes(euro(r.budget.currentComparable)));assert.ok(html.includes(euro(r.budget.totalMonthly)));
 assert.ok(html.includes('Total familiar'));assert.ok(!html.includes('Alquiler actual · sin suministros'));
 assert.ok(html.includes('≈ '));
});
test('property photos are HTTPS only and do not disclose the referrer',()=>{
 const html=renderPropertyGallery(['javascript:alert(1)','data:image/png;base64,a','https://example.com/photo.jpg'],'Piso <test>',esc);
 assert.ok(!html.includes('javascript:'));assert.ok(!html.includes('data:image'));
 assert.ok(html.includes('referrerpolicy="no-referrer"'));assert.ok(html.includes('Piso &lt;test&gt;'));
});
test('the overview shows editable apartment cards and comparable family totals',()=>{
 const s=normalizeScenario({id:'piso',name:'Piso Navàs',propertyType:'flat',purchasePrice:175000,images:['https://example.com/image.jpg'],budget:{utilitiesMonthly:120}});
 const html=renderHousingList([s],{calculateScenario,euro,esc,selected:new Set(),cloudConnected:true,comparisonHtml:'',hasDraft:false});
 for(const text of ['PISO','175000.00','Añadir vivienda','Editar vivienda','Ver cálculo','Alquiler + vida + deudas','Compra + vida + deudas'])assert.ok(html.includes(text),text);
});
