import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScenario } from './finance.mjs';

const CODE = 'cd34'.repeat(12);
const DRAFT_KEY = 'casa-ideal.draft.v1';
const memory = { values: new Map(), getItem(key) { return this.values.get(key) ?? null; }, setItem(key,value) { this.values.set(key,String(value)); }, removeItem(key) { this.values.delete(key); } };
let instance=0;
const shared = id => normalizeScenario({id,name:'Casa de prueba',budget:{incomes:[{monthly:2100,payments:12},{monthly:1700,payments:14}]}});
const tick = () => new Promise(resolve=>setImmediate(resolve));

// A small DOM substitute tests application wiring; no browser or external network.
function boot({hash='#resumen',draft=null,joined=false,scenarios=[],signupGate=null}={}) {
 memory.values.clear();if(draft)memory.setItem(DRAFT_KEY,JSON.stringify(draft));
 const nodes=new Map(), windowEvents=new Map(), requests=[];
 let url=new URL('https://example.github.io/casa-ideal/'+hash), html='';
 function node(id) {if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',handlers:{},classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this.handlers[type]=fn;},showModal(){},close(){}});return nodes.get(id);}
 const view=node('view');
 Object.defineProperty(view,'innerHTML',{get:()=>html,set(value){html=value;for(const match of value.matchAll(/<input[^>]*id="([^"]+)"[^>]*>/g)){const valueMatch=match[0].match(/value="([^"]*)"/);node(match[1]).value=valueMatch?.[1]||'';}}});
 view.insertAdjacentHTML=(_position,value)=>{html=value+html;};
 const location={get href(){return url.href},get hash(){return url.hash},set hash(value){url.hash=value},get pathname(){return url.pathname},get search(){return url.search}};
 const optional=['mother-transfer-section','price-range','quick-price','cloud-form','join-family-form','family-code'];
 globalThis.document={querySelector(selector){const id=selector.slice(1);if(optional.includes(id)&&!html.includes('id="'+id+'"'))return null;return node(id);},querySelectorAll(selector){if(selector==='#view [data-field]')return [...html.matchAll(/<(?:input|select)[^>]*data-field="([^"]+)"[^>]*>/g)].map(match=>{const field=node('field-'+match[1]);field.dataset={field:match[1],scale:match[0].match(/data-scale="([^"]+)"/)?.[1]};field.type=match[0].match(/type="([^"]+)"/)?.[1]||'select';field.value=match[0].match(/value="([^"]*)"/)?.[1]||'';field.checked=/\schecked(?:\s|>)/.test(match[0]);return field;});if(selector==='[data-action]')return [...html.matchAll(/data-action="([^"]+)"/g)].map(match=>({...node('action-'+match[1]),dataset:{action:match[1]}}));return [];}};
 globalThis.window={addEventListener(type,fn){windowEvents.set(type,fn)},scrollTo(){},print(){}};
 globalThis.location=location;globalThis.history={replaceState(_state,_title,next){url=new URL(next,url)}};
 Object.defineProperty(globalThis,'localStorage',{value:memory,writable:true,configurable:true});
 Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
 globalThis.fetch=async function(address,options={}) {
  const request=new URL(address);requests.push({path:request.pathname,origin:request.origin,body:options.body?JSON.parse(options.body):null});
  let body;
  if(request.pathname==='/auth/v1/signup'){if(signupGate)await signupGate;body={access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,user:{id:'synthetic-user'}};}
  else if(request.pathname==='/auth/v1/user')body={id:'synthetic-user'};
  else if(request.pathname==='/rest/v1/household_members')body=joined?[{household_id:'synthetic-family'}]:[];
  else if(request.pathname==='/rest/v1/rpc/join_household'){assert.equal(JSON.parse(options.body).p_invite_code,CODE);joined=true;body={household_id:'synthetic-family'};}
  else if(request.pathname==='/rest/v1/rpc/create_household'){joined=true;body={household_id:'synthetic-family',invite_code:CODE};}
  else if(request.pathname==='/rest/v1/scenarios'){if(options.method==='POST'){const saved=JSON.parse(options.body);body=[{id:saved.id,data:saved.data,created_at:'2026-01-01T00:00:00Z',updated_at:new Date().toISOString()}];}else body=scenarios.map(data=>({id:data.id,data,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-02T00:00:00Z'}));}
  else throw Error('Unexpected mock request: '+request.pathname);
  return new Response(JSON.stringify(body),{status:200});
 };
 const loading=import('./app.mjs?unit-test='+ ++instance);
 return {loading,nodes,requests,location,get html(){return html},node,navigate(hash){location.hash=hash;windowEvents.get('hashchange')?.();},draft(){return JSON.parse(memory.getItem(DRAFT_KEY));},submit(){return node('join-family-form').handlers.submit({preventDefault(){}});}};
}

test('a public first visit does not load family finances without membership',async()=>{
 const app=boot({scenarios:[shared('shared-house')]});await app.loading;
 assert.ok(app.html.includes('Este dispositivo todavía no está conectado'));
 assert.equal(app.requests.filter(x=>x.path==='/rest/v1/scenarios').length,0);
 assert.equal(app.draft(),null);
});

test('a known family on a fresh device restores a sole complete saved scenario',async()=>{
 const app=boot({joined:true,scenarios:[shared('shared-house')]});await app.loading;
 assert.equal(app.draft().id,'shared-house');
 assert.deepEqual(app.draft().budget.incomes,[{monthly:2100,payments:12},{monthly:1700,payments:14}]);
 assert.equal(app.location.hash,'#resumen');
});

test('a private link waits for explicit entry, survives navigation, and opens its exact saved house',async()=>{
 const app=boot({hash:'#familia?codigo='+CODE+'&vivienda=house-two',scenarios:[shared('house-one'),shared('house-two')]});await app.loading;
 assert.equal(app.location.hash,'#familia');
 assert.equal(app.requests.filter(x=>x.path.includes('/rpc/join')).length,0);
 app.navigate('#fuentes');app.navigate('#familia');
 assert.equal(app.node('family-code').value,CODE);
 await app.submit();
 assert.equal(app.requests.filter(x=>x.path.includes('/rpc/join')).length,1);
 assert.equal(app.draft().id,'house-two');
 assert.equal(app.draft().budget.incomes[0].monthly,2100);
});

test('entering a family preserves an existing local draft and shows the saved homes',async()=>{
 const draft=normalizeScenario({id:'local-house',budget:{incomes:[{monthly:900,payments:12}]}});
 const app=boot({hash:'#familia?codigo='+CODE+'&vivienda=shared-house',draft,scenarios:[shared('shared-house')]});await app.loading;await app.submit();
 assert.equal(app.draft().id,'local-house');
 assert.equal(app.draft().budget.incomes[0].monthly,900);
 assert.equal(app.location.hash,'#viviendas');
});

test('multiple saved homes on a new family device require an explicit choice',async()=>{
 const app=boot({joined:true,scenarios:[shared('one'),shared('two')]});await app.loading;
 assert.equal(app.location.hash,'#viviendas');assert.equal(app.draft(),null);
});

test('manual invitation input is retained when the initial connection finishes',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const app=boot({hash:'#familia',signupGate:gate});
 while(!app.requests.length)await tick();
 const field=app.node('family-code');field.value=CODE;field.handlers.input({target:field});
 release();await app.loading;
 assert.equal(app.node('family-code').value,CODE);
});

test('a repeated family submission sends only one membership request',async()=>{
 const app=boot({hash:'#familia?codigo='+CODE,scenarios:[shared('only')]});await app.loading;
 await Promise.all([app.submit(),app.submit()]);
 assert.equal(app.requests.filter(x=>x.path.includes('/rpc/join')).length,1);
});


test('a repeated create-family click creates just one private space',async()=>{
 const app=boot({hash:'#familia'});await app.loading;
 app.node('family-name').value='Familia de prueba';
 const click=app.node('action-create-family').handlers.click;
 await Promise.all([click(),click()]);
 assert.equal(app.requests.filter(x=>x.path==='/rest/v1/rpc/create_household').length,1);
});

test('manual project connection waits for restoration and remains the active project',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const app=boot({hash:'#familia',signupGate:gate});
 while(!app.requests.length)await tick();
 app.node('cloud-url').value='https://another-test.supabase.co';
 const submitting=app.node('cloud-form').handlers.submit({preventDefault(){}});
 release();await app.loading;await submitting;
 assert.equal(JSON.parse(memory.getItem('costes-vivienda.supabase.v1')).url,'https://another-test.supabase.co');
 assert.equal(app.node('cloud-url').value,'https://another-test.supabase.co');
 assert.equal(app.requests.at(-1).origin,'https://another-test.supabase.co');
});


test('applying the property provision changes only its three costs and marks them unconfirmed',async()=>{
 const draft=normalizeScenario({id:'local-house',budget:{foodMonthly:450,storageMonthly:65,utilityBreakdown:{waterMonthly:30},ibiAnnual:800,wasteAnnual:120,communityMonthly:20,propertyCostsConfirmed:true}});
 const app=boot({hash:'#presupuesto',draft});await app.loading;
 await app.node('action-apply-property-provision').handlers.click();
 const b=app.draft().budget;
 assert.equal(b.ibiAnnual,1500);assert.equal(b.wasteAnnual,300);assert.equal(b.communityMonthly,100);
 assert.equal(b.foodMonthly,450);assert.equal(b.storageMonthly,65);assert.equal(b.utilityBreakdown.waterMonthly,30);
 assert.equal(b.propertyCostsEstimated,true);assert.equal(b.propertyCostsConfirmed,false);
});
test('the IBI assistant preserves waste, community, and living costs',async()=>{
 const draft=normalizeScenario({id:'local-house',budget:{ibiLiquidableBase:100000,ibiRatePercent:.7,wasteAnnual:240,communityMonthly:40,storageMonthly:65}});
 const app=boot({hash:'#presupuesto',draft});await app.loading;
 await app.node('action-apply-ibi-estimate').handlers.click();
 const b=app.draft().budget;
 assert.equal(b.ibiAnnual,700);assert.equal(b.wasteAnnual,240);assert.equal(b.communityMonthly,40);assert.equal(b.storageMonthly,65);
 assert.equal(b.propertyCostsEstimated,true);assert.equal(b.propertyCostsConfirmed,false);
});


test('enabling common bills reuses known current bills if the future budget was empty',async()=>{
 const draft=normalizeScenario({budget:{sharedLivingCosts:false,utilitiesMonthly:0,currentUtilitiesMonthly:190}});
 const app=boot({hash:'#presupuesto',draft});await app.loading;
 const field=app.node('field-budget.sharedLivingCosts');field.checked=true;field.handlers.change({target:field});
 const b=app.draft().budget;
 assert.equal(b.sharedLivingCosts,true);assert.equal(b.utilitiesMonthly,190);assert.equal(b.currentUtilitiesMonthly,190);
});
test('a budget with property provisions is approximate rather than a promised minimum or maximum margin',async()=>{
 const draft=normalizeScenario({budget:{incomes:[{monthly:4000,payments:12}],propertyCostsEstimated:true,ibiAnnual:1500,wasteAnnual:300,communityMonthly:100}});
 const app=boot({draft});await app.loading;
 assert.ok(app.html.includes('≈ '));assert.ok(app.html.includes('Presupuesto orientativo con provisiones'));
 assert.ok(!app.html.includes('mínimo conocido'));assert.ok(!app.html.includes('Margen máximo provisional'));
});


test('the home page opens the housing overview',async()=>{
 const app=boot({hash:''});await app.loading;
 assert.equal(app.node('page-title').textContent,'Vuestras viviendas, una al lado de la otra.');
 assert.ok(app.html.includes('Añadir vivienda'));
});
test('adding and renaming a flat preserves the family budget and one saved identifier',async()=>{
 const draft=normalizeScenario({id:'previous-home',listingDetails:{title:'Título de otra vivienda',sourceReadAt:'2026-09-01T00:00:00.000Z'},budget:{incomes:[{monthly:2130,payments:12},{monthly:1680,payments:14}],existingDebtMonthly:215,foodMonthly:465,storageMonthly:65}});
 const app=boot({hash:'#viviendas',draft,joined:true});await app.loading;
 app.node('add-home-btn').handlers.click();
 for(const [id,value] of Object.entries({'save-name':'Piso de prueba','save-url':'https://example.com/piso','save-price':'175000','save-type':'flat','save-tax-mode':'used','save-images':'https://example.com/photo.jpg','save-notes':'Comunidad pendiente','save-city':'Navàs'}))app.node(id).value=value;
 await app.node('save-form').handlers.submit({preventDefault(){}});
 const first=app.draft();assert.equal(first.listingDetails.title,undefined);assert.equal(first.listingDetails.sourceReadAt,undefined);assert.notEqual(first.id,'previous-home');assert.equal(first.name,'Piso de prueba');assert.equal(first.propertyType,'flat');assert.equal(first.purchasePrice,175000);
 assert.equal(first.budget.foodMonthly,465);assert.equal(first.budget.storageMonthly,65);assert.equal(first.budget.existingDebtMonthly,215);
 assert.equal(first.familyLoan.rate,5);assert.equal(first.familyLoan.years,10);assert.equal(first.familyLoan.extraBuffer,3000);assert.equal(first.familyLoan.assumedTerms,true);
 assert.equal(app.requests.filter(r=>r.path==='/rest/v1/scenarios'&&r.body).length,1);
 app.node('save-btn').handlers.click();app.node('save-name').value='Piso con nombre cambiado';
 await app.node('save-form').handlers.submit({preventDefault(){}});
 assert.equal(app.draft().id,first.id);assert.equal(app.draft().name,'Piso con nombre cambiado');assert.equal(app.draft().budget.storageMonthly,65);
 assert.equal(JSON.parse(memory.getItem('costes-vivienda.scenarios.v1')).scenarios.length,1);
});


test('adding during initial family connection waits for the restored household budget',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const app=boot({hash:'',joined:true,scenarios:[shared('family-house')],signupGate:gate});
 while(!app.requests.length)await tick();
 const opening=app.node('add-home-btn').handlers.click();release();await app.loading;await opening;
 app.node('save-name').value='Nueva vivienda';app.node('save-price').value='175000';
 await app.node('save-form').handlers.submit({preventDefault(){}});
 assert.deepEqual(app.draft().budget.incomes,[{monthly:2100,payments:12},{monthly:1700,payments:14}]);
});


test('opening edit during restoration uses the restored housing rather than the empty placeholder',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const app=boot({hash:'#resumen',joined:true,scenarios:[shared('family-house')],signupGate:gate});
 while(!app.requests.length)await tick();
 const opening=app.node('save-btn').handlers.click();release();await app.loading;await opening;
 assert.equal(app.node('save-name').value,'Casa de prueba');assert.equal(app.node('save-price').value,250000);
});


test('a fresh device with several family homes reuses the latest family budget when adding',async()=>{
 const app=boot({hash:'',joined:true,scenarios:[shared('first-home'),shared('second-home')]});await app.loading;
 await app.node('add-home-btn').handlers.click();app.node('save-name').value='Tercera vivienda';app.node('save-price').value='170000';
 await app.node('save-form').handlers.submit({preventDefault(){}});
 assert.deepEqual(app.draft().budget.incomes,[{monthly:2100,payments:12},{monthly:1700,payments:14}]);
});
