import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSavedSimulations,saveSimulationCombination,deleteSimulationCombination} from './simulation-store.mjs';
test('named combinations are detached and an update retains identity without changing other combinations',()=>{
 const settings={goal:'max-price',mother:{cap:21500}};
 const first=saveSimulationCombination([],settings,{name:'Base',createId:()=> 'base',now:'first'});
 const next=saveSimulationCombination(first.library,{...settings,mother:{cap:30000}},{name:'Negociar',createId:()=> 'other',now:'next'});
 const updated=saveSimulationCombination(next.library,{...settings,mother:{cap:35000}},{id:'base',name:'Base revisada',now:'last'});
 assert.equal(updated.library.length,2);assert.equal(updated.saved.createdAt,'first');assert.equal(updated.saved.updatedAt,'last');
 assert.equal(updated.saved.id,'base');assert.equal(updated.library.find(item=>item.id==='other').settings.mother.cap,30000);
 updated.saved.settings.mother.cap=1;assert.equal(settings.mother.cap,21500);
 assert.equal(first.library[0].settings.mother.cap,21500);
});
test('deleted combinations are not silently recreated by a stale update',()=>{
 const first=saveSimulationCombination([],{goal:'max-price'},{name:'Base',createId:()=> 'base'});
 const remaining=deleteSimulationCombination(first.library,'base');assert.deepEqual(remaining,[]);
 assert.throws(()=>saveSimulationCombination(remaining,{},{id:'base',name:'Stale'}),/ya no existe/);
});
test('malformed libraries, invalid names and invalid settings fail before saving',()=>{
 for(const raw of [null,{},[{id:'x',name:'A',settings:{}},{id:'x',name:'B',settings:{}}]])assert.throws(()=>normalizeSavedSimulations(raw));
 for(const name of ['', 'x'.repeat(121)])assert.throws(()=>saveSimulationCombination([],{}, {name}));
 assert.throws(()=>saveSimulationCombination([],{_errors:['bad']},{name:'Bad'}));
 const many=Array.from({length:30},(_,i)=>({id:'case-'+i,name:'Case '+i,settings:{}}));
 assert.throws(()=>saveSimulationCombination(many,{}, {name:'Too many'}),/30/);
});
