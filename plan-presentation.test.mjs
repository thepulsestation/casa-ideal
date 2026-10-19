import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanPresentation} from './plan-presentation.mjs';

function memoryStorage(){
 const values=new Map();
 return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
}

function harness(storage=memoryStorage()){
 const events=new Map(),frames=[];
 const window={scrollX:0,scrollY:0,addEventListener(name,listener){const listeners=events.get(name)||[];listeners.push(listener);events.set(name,listeners);},requestAnimationFrame(callback){frames.push(callback);},scrollTo({left=0,top=0}){this.scrollX=left;this.scrollY=top;}};
 let active=null;
 const document={querySelector:()=>active};
 const presentation=createPlanPresentation({window,document,storage});
 return {window,storage,presentation,set container(value){active=value;},get container(){return active;},emit(name){for(const listener of events.get(name)||[])listener();},frame(){const pending=frames.splice(0);for(const callback of pending)callback();}};
}

function calendar(window,{top=1200,height=600,scrollTop=0,scrollLeft=0,months=['2026-10','2026-11','2026-12','2027-01','2027-02','2027-03'],step=80,shift=0}={}){
 const listeners=new Map();
 const container={scrollTop,scrollLeft,shift,addEventListener(name,listener){listeners.set(name,listener);},getBoundingClientRect(){return {top:top-window.scrollY,bottom:top-window.scrollY+height,height};},querySelector(selector){if(selector==='thead')return {getBoundingClientRect:()=>({height:35})};return buttons.find(button=>selector.includes('[data-id="'+button.dataset.id+'"]'))||null;},querySelectorAll(){return buttons;},emit(name){listeners.get(name)?.();}};
 const buttons=months.map((month,index)=>({dataset:{id:month},closest(){return {getBoundingClientRect(){const rowTop=container.getBoundingClientRect().top+35+index*step+container.shift-container.scrollTop;return {top:rowTop,bottom:rowTop+step,height:step};}};}}));
 return container;
}

test('presentation preferences survive reload and remain scoped to each home',()=>{
 const storage=memoryStorage(),first=harness(storage);
 first.presentation.setPreferences('family:home-a',{horizon:144,selectedMonth:'2028-06',mode:'income',expandedMonths:['2028-06','2028-07','2028-06']});
 first.presentation.setPreferences('family:home-b',{horizon:24,selectedMonth:'2027-01',mode:'remaining',expandedMonths:['2027-01']});
 const reloaded=harness(storage);
 assert.deepEqual(reloaded.presentation.preferences('family:home-a'),{horizon:144,selectedMonth:'2028-06',mode:'income',expandedMonths:['2028-06','2028-07']});
 assert.deepEqual(reloaded.presentation.preferences('family:home-b'),{horizon:24,selectedMonth:'2027-01',mode:'remaining',expandedMonths:['2027-01']});
 assert.deepEqual(reloaded.presentation.preferences('other-family:home-a'),{horizon:24,selectedMonth:null,mode:'expenses',expandedMonths:[]});
 assert.equal(storage.values.size,2);
});

test('invalid persisted preferences are normalized without admitting invalid month selectors',()=>{
 const view=harness();
 view.presentation.setPreferences('home',{horizon:1000,selectedMonth:'2027-99',mode:'unexpected',expandedMonths:['2027-01','2027-01','2027-13','<button>']});
 assert.deepEqual(view.presentation.preferences('home'),{horizon:24,selectedMonth:null,mode:'expenses',expandedMonths:['2027-01']});
});

test('a far-down month keeps its visible offset and both page and horizontal scroll after rebuilding',()=>{
 const view=harness(),months=Array.from({length:40},(_,index)=>`${2026+Math.floor((index+9)/12)}-${String((index+9)%12+1).padStart(2,'0')}`);
 view.window.scrollX=11;view.window.scrollY=940;
 view.container=calendar(view.window,{months,scrollTop:1543,scrollLeft:127});
 view.presentation.restore('home');view.presentation.capture();
 const initialTop=view.container.scrollTop;
 view.presentation.beforeRender();
 view.container=calendar(view.window,{months,shift:150});
 view.window.scrollX=0;view.window.scrollY=0;
 view.presentation.restore('home');
 assert.equal(view.container.scrollTop,initialTop+150);
 assert.equal(view.container.scrollLeft,127);
 assert.equal(view.window.scrollX,11);assert.equal(view.window.scrollY,940);
 // A later layout change is corrected once, without a permanent scroll loop.
 view.container.shift=190;view.frame();
 assert.equal(view.container.scrollTop,initialTop+190);
 view.container.scrollTop+=45;view.frame();
 assert.equal(view.container.scrollTop,initialTop+235);
});

test('reload restores the saved viewport and open-month preferences together',()=>{
 const storage=memoryStorage(),first=harness(storage);
 first.presentation.setPreferences('family:home',{horizon:144,selectedMonth:'2027-03',mode:'remaining',expandedMonths:['2026-12','2027-03']});
 first.window.scrollY=950;first.container=calendar(first.window,{scrollTop:283,scrollLeft:160});
 first.presentation.restore('family:home');first.emit('pagehide');
 const reloaded=harness(storage);reloaded.container=calendar(reloaded.window);
 reloaded.presentation.restore('family:home');reloaded.frame();
 assert.equal(reloaded.container.scrollTop,283);assert.equal(reloaded.container.scrollLeft,160);
 assert.equal(reloaded.window.scrollY,950);
 assert.deepEqual(reloaded.presentation.preferences('family:home').expandedMonths,['2026-12','2027-03']);
});

test('an empty render before cloud data arrives cannot erase a saved viewport',()=>{
 const storage=memoryStorage(),first=harness(storage);
 first.window.scrollY=1000;first.container=calendar(first.window,{scrollTop:283,scrollLeft:80});
 first.presentation.restore('family:home');first.emit('pagehide');
 const before=[...storage.values.values()][0],reloaded=harness(storage);
 reloaded.presentation.beforeRender();reloaded.presentation.restore('family:home');
 reloaded.emit('scroll');reloaded.emit('pagehide');reloaded.presentation.beforeRender();
 assert.equal([...storage.values.values()][0],before);
 reloaded.container=calendar(reloaded.window);reloaded.presentation.restore('family:home');reloaded.frame();
 assert.equal(reloaded.container.scrollTop,283);assert.equal(reloaded.container.scrollLeft,80);assert.equal(reloaded.window.scrollY,1000);
});

for(const interaction of ['wheel','touchstart','keydown'])test(`${interaction} cancels the pending layout correction so it does not undo a user's scroll`,()=>{
 const view=harness();view.window.scrollY=900;view.container=calendar(view.window,{scrollTop:283});view.presentation.restore('home');
 view.presentation.beforeRender();view.container=calendar(view.window);view.presentation.restore('home');
 view.emit(interaction);view.container.scrollTop=410;view.window.scrollY=1020;view.container.emit('scroll');view.frame();
 assert.equal(view.container.scrollTop,410);assert.equal(view.window.scrollY,1020);
 // The user-selected position becomes the next restoration point.
 view.presentation.beforeRender();view.container=calendar(view.window);view.presentation.restore('home');view.frame();
 assert.equal(view.container.scrollTop,410);assert.equal(view.window.scrollY,1020);
});

test('navigation invalidates a pending restoration and can restore a table without moving the page',()=>{
 const view=harness();view.window.scrollY=900;view.container=calendar(view.window,{scrollTop:283});view.presentation.restore('home');
 view.presentation.beforeRender();view.container=calendar(view.window);view.presentation.restore('home');
 const removed=view.container;
 view.presentation.beforeRender();view.container=null;view.window.scrollY=0;removed.scrollTop=0;view.frame();
 assert.equal(removed.scrollTop,0);assert.equal(view.window.scrollY,0);
 view.container=calendar(view.window);view.presentation.restore('home',{page:false});view.frame();
 assert.equal(view.container.scrollTop,283);assert.equal(view.window.scrollY,0);
});

test('missing anchor months fall back to the saved numeric viewport safely',()=>{
 const view=harness();view.container=calendar(view.window,{scrollTop:283,scrollLeft:31});view.presentation.restore('home');
 view.presentation.beforeRender();view.container=calendar(view.window,{months:['2030-01','2030-02']});view.presentation.restore('home');view.frame();
 assert.equal(view.container.scrollTop,283);assert.equal(view.container.scrollLeft,31);
});


test('the savings graph saves its page position without overwriting the monthly table scroll',()=>{
 const view=harness();view.window.scrollY=900;view.container=calendar(view.window,{scrollTop:283,scrollLeft:75});view.presentation.restore('home');
 view.presentation.beforeRender();view.container=null;view.presentation.setPreferences('home',{mode:'savings',horizon:24,expandedMonths:['2026-12']});view.presentation.restore('home',{table:false});view.frame();
 view.window.scrollY=1200;view.emit('scroll');
 const reload=harness(view.storage);reload.presentation.restore('home',{table:false});reload.frame();
 assert.equal(reload.window.scrollY,1200);assert.equal(reload.presentation.preferences('home').mode,'savings');
 reload.presentation.beforeRender();reload.container=calendar(reload.window);reload.presentation.restore('home');reload.frame();
 assert.equal(reload.container.scrollTop,283);assert.equal(reload.container.scrollLeft,75);assert.equal(reload.window.scrollY,1200);
});
