import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario,calculateScenario} from './finance.mjs';
import {renderRentalComparison,renderPropertyGallery,renderHousingList,renderHousingComparison} from './housing-ui.mjs';
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
test('the overview shows compact apartment cards with costs, family-loan capital and morning trips',()=>{
 const s=normalizeScenario({id:'piso',name:'Piso Navàs',propertyType:'flat',purchasePrice:175000,images:['https://example.com/image.jpg'],budget:{utilitiesMonthly:120}});
 const html=renderHousingList([s],{calculateScenario,euro,esc,selected:new Set(),cloudConnected:true,comparisonHtml:'',hasDraft:false});
 for(const text of ['PISO','175000.00','Añadir vivienda','Editar vivienda','Abrir vivienda','Coste familiar al comprar /mes','Capital del préstamo de mamá','SALIDA 08:00','Sant Joan','Elisava','Leonardo'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/class="housing-trip /g)||[]).length,3);
 assert.ok(html.includes('data-action="favorite"'));assert.ok(html.includes('aria-pressed="false"'));
 assert.ok(!html.includes('Alquiler + vida + deudas'));assert.ok(!html.includes('Solo hipoteca'));
});

function fixture(id,{monthly=1500,incomplete=false,favorite=false,valid=true,notes=''}={}){
 return {id,name:'Vivienda '+id,purchasePrice:200000,propertyType:'flat',favorite,notes,calculated:{valid,budget:{totalMonthly:monthly,incomplete,remainingRegular:800,debtRatio:.28,debtRatioLimit:.35,borrowerDebtRatioIncomplete:false},familyLoan:{principal:40000},cash:{totalRequired:40000,fundingGap:0}}};
}
const quickOptions={calculateScenario:s=>s.calculated,euro:n=>{assert.ok(Number.isFinite(n),'Only finite monetary values reach the formatter');return n.toFixed(2);},esc,getCommuteIndicators:()=>[
 {id:'sant-joan',label:'Sant Joan <test>',totalMinutesMin:40,totalMinutesMax:50,timeLabel:'≈ 40–50 min',estimated:true},
 {id:'elisava',label:'Elisava',totalMinutesMin:null,totalMinutesMax:null},
 {id:'gran-via',label:'Leonardo Royal',totalMinutesMin:70,totalMinutesMax:90,timeLabel:'≈ 70–90 min',estimated:true,exceedsTarget:true},
]};

test('manual favorite and comparison selection survive card sorting while long notes stay in details',()=>{
 const rows=[fixture('a',{monthly:1000,notes:'Long private note to show only in details'}),fixture('b',{monthly:2500,favorite:true})];
 const html=renderHousingList(rows,{...quickOptions,selected:new Set(['a']),sort:'favorites'});
 assert.ok(html.indexOf('data-home-id="b"')<html.indexOf('data-home-id="a"'));
 assert.match(html,/data-action="favorite" data-id="b" aria-pressed="true"/);
 assert.match(html,/data-compare="a" checked/);
 assert.ok(!html.includes(rows[0].notes));assert.match(html,/<details class="housing-more-options"><summary>Más opciones<\/summary>[\s\S]*?data-action="duplicate"[\s\S]*?data-action="delete"/);
 assert.ok(html.includes('data-housing-sort'));assert.ok(html.includes('Comparar (1)'));
 assert.ok(html.includes('Sant Joan &lt;test&gt;'));assert.ok(!html.includes('Sant Joan <test>'));
});

test('pending and invalid budgets show explicit labels without formatting NaN or undefined',()=>{
 const html=renderHousingList([fixture('pending',{monthly:100,incomplete:true}),fixture('invalid',{valid:false})],quickOptions);
 assert.ok(html.includes('≥ 100.00'));assert.ok(html.includes('Datos pendientes · mínimo conocido'));
 assert.ok(html.includes('Revisa los datos'));assert.ok(html.includes('Por completar'));
 assert.ok(!html.includes('NaN'));assert.ok(!html.includes('undefined'));
});

test('comparison supports arbitrary selection, has no financial table below two, and ignores stale ids',()=>{
 const rows=[fixture('a'),fixture('b'),fixture('c')];
 const one=renderHousingComparison(rows,{...quickOptions,selected:new Set(['a','deleted'])});
 assert.ok(one.includes('Selecciona al menos dos'));assert.ok(!one.includes('<table>'));
 const two=renderHousingComparison(rows,{...quickOptions,selected:new Set(['a','c'])});
 const table=two.match(/<table>([\s\S]*?)<\/table>/)?.[1];
 assert.ok(table);assert.ok(table.includes('Vivienda a'));assert.ok(table.includes('Vivienda c'));assert.ok(!table.includes('Vivienda b'));
 assert.ok(two.includes('data-compare="b"'));assert.ok(two.includes('2 viviendas seleccionadas'));
 const all=renderHousingComparison(rows,quickOptions);
 assert.ok(all.includes('3 viviendas seleccionadas'));
});

test('comparison keeps invalid finances pending and gives each scenario its chosen debt reference',()=>{
 const custom=fixture('custom');custom.calculated.budget.debtRatio=.38;custom.calculated.budget.debtRatioLimit=.4;
 const invalid=fixture('bad',{valid:false});invalid.calculated.budget.totalMonthly=NaN;
 const html=renderHousingComparison([custom,invalid],{...quickOptions,selected:new Set(['custom','bad'])});
 assert.ok(html.includes('Dentro del 40 % simulado'));assert.ok(html.includes('Revisa los datos'));
 assert.ok(html.includes('Por completar'));assert.ok(html.includes('no indica aprobación bancaria'));
 assert.ok(!html.includes('NaN'));assert.ok(!html.includes('undefined'));
 assert.ok(html.includes('Sant Joan &lt;test&gt;'));
});

const comparisonRow=(html,id)=>html.match(new RegExp('<tr data-comparison-criterion="'+id+'">([\\s\\S]*?)<\\/tr>'))?.[1]||'';
const comparisonCells=(html,id)=>[...comparisonRow(html,id).matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map(([,attrs,content])=>({best:attrs.includes('comparison-best'),content}));
test('comparison highlights larger rooms and lower costs per criterion across three homes, including ties',()=>{
 const rows=['a','b','c'].map(id=>fixture(id));
 rows.forEach((s,i)=>{
  s.purchasePrice=[210000,180000,190000][i];
  s.listingDetails={surfaceM2:[60,90,90][i],beds:[2,3,4][i],baths:[1,2,1][i]};
  s.calculated.budget={...s.calculated.budget,mortgageOnly:[700,600,650][i],motherBankLoanMonthly:[300,250,280][i],borrowerFamilyRepaymentMonthly:[250,200,220][i],missingQuotes:[],insuranceMonthly:30};
  s.calculated.cash.totalRequired=[30000,22000,26000][i];
  s.calculated.familyLoan.principal=[30000,22000,26000][i];
 });
 const html=renderHousingComparison(rows,quickOptions);
 assert.deepEqual(comparisonCells(html,'price').map(c=>c.best),[false,true,false]);
 assert.deepEqual(comparisonCells(html,'surface').map(c=>c.best),[false,true,true]);
 assert.deepEqual(comparisonCells(html,'bedrooms').map(c=>c.best),[false,false,true]);
 assert.deepEqual(comparisonCells(html,'bathrooms').map(c=>c.best),[false,true,false]);
 for(const id of ['initial','mother-capital','mortgage','mother-bank','children-repayment'])assert.deepEqual(comparisonCells(html,id).map(c=>c.best),[false,true,false],id);
 assert.deepEqual(comparisonCells(html,'insurance').map(c=>c.best),[false,false,false],'equal figures do not single out a winner');
 assert.ok(comparisonRow(html,'surface').includes('↑ Mayor'));
 assert.ok(comparisonRow(html,'mortgage').includes('↓ Menor'));
 assert.match(html,/data-action="edit-commute" data-id="a"/);
 assert.match(html,/data-action="edit-commute" data-id="c"/);
});

test('unknown expenses, unpriced agency fees and incomplete totals cannot win by omitting costs',()=>{
 const rows=[fixture('pending',{monthly:0,incomplete:true}),fixture('known',{monthly:1600}),fixture('higher',{monthly:1700})];
 rows.forEach((s,i)=>{
  s.budget={ibiAnnual:[0,1200,1500][i],communityMonthly:0,propertyCostsConfirmed:false};
  s.purchaseCosts={brokerQuotePending:i===0};
  s.calculated.cash.totalRequired=[1,20000,30000][i];
  s.calculated.budget.remainingRegular=[5000,900,800][i];
 });
 const html=renderHousingComparison(rows,quickOptions);
 for(const id of ['initial','household-monthly','household-margin','ibi'])assert.deepEqual(comparisonCells(html,id).map(c=>c.best),[false,true,false],id);
 assert.ok(comparisonCells(html,'ibi')[0].content.includes('Por completar'));
 assert.ok(comparisonCells(html,'household-margin')[0].content.includes('≤ '));
 assert.deepEqual(comparisonCells(html,'community').map(c=>c.best),[false,false,false]);
 assert.ok(comparisonRow(html,'purchase-status').includes('Honorarios de agencia pendientes'));
 assert.ok(comparisonRow(html,'receipts-status').includes('Sin comprobar'));
 assert.ok(!comparisonRow(html,'receipts-status').includes('is-checked'));
});

test('comparison exposes each saved buyer checkbox and distinguishes tax hypotheses from reviewed requirements',()=>{
 const rows=[fixture('checked'),fixture('unchecked'),fixture('assumed')];
 rows.forEach((s,i)=>{
  s.tax={mode:'used',buyers:[{rate:.05,eligibilityConfirmed:i===0,eligibilityAssumed:i===2},{rate:.05,eligibilityConfirmed:false,eligibilityAssumed:false}]};
  s.icf={enabled:true,eligibilityConfirmed:i===0};
  s.budget={propertyCostsConfirmed:i===0};
  s.calculated.budget.missingQuotes=i===0?[]:['Seguro de vida'];
  s.calculated.budget.insuranceMonthly=i===0?30:0;
 });
 const html=renderHousingComparison(rows,quickOptions),buyers=comparisonCells(html,'buyer-0');
 assert.match(buyers[0].content,/5 % · requisitos comprobados/);
 assert.match(buyers[1].content,/5 % solicitado · sin comprobar; se aplica tarifa general/);
 assert.match(buyers[2].content,/5 % · hipótesis, sin comprobar/);
 assert.ok(comparisonCells(html,'buyer-1').every(c=>c.content.includes('sin comprobar')));
 assert.match(comparisonCells(html,'icf-status')[0].content,/Requisitos comprobados/);
 assert.match(comparisonCells(html,'icf-status')[1].content,/Pendientes de comprobar/);
 assert.match(comparisonCells(html,'insurance-status')[1].content,/Pendientes: Seguro de vida/);
 assert.ok(comparisonCells(html,'insurance').every(c=>!c.best),'a single quoted premium cannot be compared with missing premiums');
});

test('only full morning trip ranges participate in journey advantages',()=>{
 const rows=['near','partial','far'].map(id=>fixture(id));
 const html=renderHousingComparison(rows,{...quickOptions,getCommuteIndicators:s=>[{id:'sant-joan',totalMinutesMin:s.id==='near'?50:s.id==='partial'?10:80,totalMinutesMax:s.id==='near'?70:s.id==='partial'?null:90,mainLegMinutesMin:10,mainLegMinutesMax:10}]});
 assert.deepEqual(comparisonCells(html,'commute-0').map(c=>c.best),[true,false,false]);
 assert.ok(comparisonCells(html,'commute-1').every(c=>!c.best));
 assert.ok(comparisonCells(html,'commute-2').every(c=>!c.best));
 assert.ok(comparisonRow(html,'commute-0').includes('50–70 min'));
});
