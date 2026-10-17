import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHome,rankHomes,getHousingHighlights} from './property-analysis.mjs';

function home(id,{price=200000,monthly=1500,upfront=40000,incomplete=false,favorite=false,ratio=.3,reference=.35,repaymentPending=false,times=[30,40,50],valid=true}={}){
 return {id,name:id,purchasePrice:price,favorite,times,
  calculated:{valid,budget:{incomplete,totalMonthly:monthly,remainingRegular:1000,debtRatio:ratio,debtRatioLimit:reference,borrowerDebtRatioIncomplete:repaymentPending},cash:{totalRequired:upfront,fundingGap:0},familyLoan:{principal:upfront}}};
}
const options={calculateScenario:s=>s.calculated,getCommuteIndicators:s=>s.times.map((time,i)=>({id:['sant-joan','elisava','gran-via'][i],totalMinutesMin:time,totalMinutesMax:time===null?null:time+10,estimated:true}))};
const ids=analyses=>analyses.map(x=>x.scenario.id);

test('unknown commute ranges never become zero and partial sets do not win travel ranking',()=>{
 const partial=home('partial',{times:[10,null,null]}),complete=home('complete',{times:[30,40,50]});
 assert.equal(analyzeHome(partial,options).metrics.commuteMeanMinutes,null);
 assert.equal(analyzeHome(complete,options).metrics.commuteMeanMinutes,45);
 assert.deepEqual(ids(rankHomes([partial,complete],{...options,sort:'travel'})),['complete','partial']);
 const invalidRange={...options,getCommuteIndicators:()=>[{totalMinutesMin:50,totalMinutesMax:30}]};
 assert.equal(analyzeHome(partial,invalidRange).metrics.commuteMeanMinutes,null);
});

test('monthly and initial-money rankings place incomplete budgets after complete ones',()=>{
 const rows=[home('pending',{monthly:100,upfront:1,incomplete:true}),home('high',{monthly:2000,upfront:50000}),home('low',{monthly:1000,upfront:30000})];
 assert.deepEqual(ids(rankHomes(rows,{...options,sort:'monthly'})),['low','high','pending']);
 assert.deepEqual(ids(rankHomes(rows,{...options,sort:'upfront'})),['low','high','pending']);
 assert.equal(analyzeHome(rows[0],options).metrics.totalMonthly,100);
});

test('manual favorites and distinct price/upfront criteria are explicit, stable and pure',()=>{
 const rows=[home('low-price',{price:100000,upfront:60000,monthly:2000}),home('low-monthly',{price:150000,upfront:20000,monthly:1000}),home('favorite',{price:180000,monthly:3000,favorite:true})];
 const before=structuredClone(rows);
 assert.deepEqual(ids(rankHomes(rows,options)),['favorite','low-monthly','low-price']);
 assert.deepEqual(ids(rankHomes(rows,{...options,sort:'price'})),['low-price','low-monthly','favorite']);
 assert.deepEqual(ids(rankHomes(rows,{...options,sort:'upfront'})),['low-monthly','favorite','low-price']);
 assert.deepEqual(rows,before);
 assert.equal(analyzeHome({...rows[0],favorite:'true'},options).favorite,false);
});

test('invalid, absent and nonfinite calculation values remain null, not free homes',()=>{
 const invalid=home('invalid',{valid:false,monthly:0}),nan=home('nan',{monthly:NaN,upfront:Infinity});
 assert.equal(analyzeHome(invalid,options).metrics.totalMonthly,null);
 assert.equal(analyzeHome(invalid,options).metrics.totalRequired,null);
 assert.equal(analyzeHome(nan,options).metrics.totalMonthly,null);
 assert.equal(analyzeHome(nan,options).metrics.totalRequired,null);
 assert.equal(analyzeHome(nan,options).incomplete,true);
 assert.deepEqual(ids(rankHomes([invalid,home('known')],{...options,sort:'monthly'})),['known','invalid']);
 assert.equal(analyzeHome({}, {calculateScenario:()=>{throw Error('Bad input');}}).valid,false);
});

test('debt status uses the configured reference and leaves missing repayment schedules pending',()=>{
 assert.equal(analyzeHome(home('boundary',{ratio:.35000000000000003}),options).debtStatus.code,'within');
 assert.equal(analyzeHome(home('above',{ratio:.36}),options).debtStatus.code,'above');
 const configured=analyzeHome(home('custom',{ratio:.38,reference:.4}),options);
 assert.equal(configured.debtStatus.code,'within');assert.equal(configured.debtStatus.reference,.4);
 assert.match(configured.debtStatus.label,/40 % simulado/);
 assert.equal(analyzeHome(home('missing',{ratio:.2,repaymentPending:true}),options).debtStatus.code,'pending');
 assert.equal(analyzeHome(home('income',{ratio:null}),options).debtStatus.ratio,null);
});

test('highlights have separate criteria and exclude unknown/incomplete apparent bargains',()=>{
 const rows=[home('pending',{monthly:0,incomplete:true,times:[1,null,null]}),home('monthly',{monthly:1000,price:250000,times:[100,100,100]}),home('price',{monthly:2000,price:120000,times:[30,30,30]})];
 const highlights=getHousingHighlights(rows,options);
 assert.deepEqual(highlights.map(x=>[x.criterion,x.home.scenario.id]),[['monthly','monthly'],['price','price'],['travel','price']]);
 assert.deepEqual(getHousingHighlights([],options),[]);
});

test('hypothetical ICF and purchase fee provisions stay visibly provisional',()=>{
 const hypothetical=home('hypothetical');hypothetical.calculated.icf={hypothetical:true};
 assert.equal(analyzeHome(hypothetical,options).incomplete,true);
 const provision=home('provision');provision.calculated.cash.purchaseFeesEstimated=true;
 assert.equal(analyzeHome(provision,options).estimated,true);
});
