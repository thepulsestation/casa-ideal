import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScenario } from './finance.mjs';
import { buildFamilyHash } from './family-access.mjs';

const CODE = 'cd34'.repeat(12);
const DRAFT_KEY = 'casa-ideal.draft.v1';
const memory = { values: new Map(), getItem(key) { return this.values.get(key) ?? null; }, setItem(key,value) { this.values.set(key,String(value)); }, removeItem(key) { this.values.delete(key); } };
let instance=0;
const shared = id => normalizeScenario({id,name:'Casa de prueba',budget:{incomes:[{monthly:2100,payments:12},{monthly:1700,payments:14}]}});
const tick = () => new Promise(resolve=>setImmediate(resolve));
const savedHome=id=>({...shared(id),financingPlanVersion:2,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-02T00:00:00Z'});

// A small DOM substitute tests application wiring; no browser or external network.
function boot({hash='#resumen',draft=null,joined=false,scenarios=[],signupGate=null,localScenarios=[],draftMeta=null,saveGate=null,failSaves=0,listGate=null}={}) {
 memory.values.clear();if(draft)memory.setItem(DRAFT_KEY,JSON.stringify(draft));if(draftMeta)memory.setItem('casa-ideal.draft-meta.v1',JSON.stringify(draftMeta));if(localScenarios.length)memory.setItem('costes-vivienda.scenarios.v1',JSON.stringify({version:1,scenarios:localScenarios}));
 const nodes=new Map(), windowEvents=new Map(), requests=[], timers=new Map();let timerId=0,serverVersion=0;const server=new Map(scenarios.map(data=>[data.id,{id:data.id,data:structuredClone(data),created_at:data.createdAt||'2026-01-01T00:00:00Z',updated_at:data.updatedAt||'2026-01-02T00:00:00Z'}]));
 let url=new URL('https://example.github.io/casa-ideal/'+hash), html='';
 function node(id) {if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',handlers:{},classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this.handlers[type]=fn;},showModal(){},close(){}});return nodes.get(id);}
 const view=node('view');
 Object.defineProperty(view,'innerHTML',{get:()=>html,set(value){html=value;for(const match of value.matchAll(/<input[^>]*id="([^"]+)"[^>]*>/g)){const valueMatch=match[0].match(/value="([^"]*)"/);node(match[1]).value=valueMatch?.[1]||'';}}});
 view.insertAdjacentHTML=(_position,value)=>{html=value+html;};
 const location={get href(){return url.href},get hash(){return url.hash},set hash(value){url.hash=value},get pathname(){return url.pathname},get search(){return url.search}};
 const optional=['mother-transfer-section','price-range','quick-price','cloud-form','join-family-form','family-code'];
 globalThis.document={querySelector(selector){if(selector==='dialog[open]'||selector.includes(':focus'))return null;const id=selector.slice(1);if(optional.includes(id)&&!html.includes('id="'+id+'"'))return null;return node(id);},querySelectorAll(selector){if(selector==='#view [data-field]')return [...html.matchAll(/<(?:input|select)[^>]*data-field="([^"]+)"[^>]*>/g)].map(match=>{const field=node('field-'+match[1]);field.dataset={field:match[1],scale:match[0].match(/data-scale="([^"]+)"/)?.[1]};field.type=match[0].match(/type="([^"]+)"/)?.[1]||'select';field.value=match[0].match(/value="([^"]*)"/)?.[1]||'';field.checked=/\schecked(?:\s|>)/.test(match[0]);return field;});if(selector==='[data-action]')return [...html.matchAll(/<button[^>]*data-action="([^"]+)"[^>]*>/g)].map(match=>{const action=node('action-'+match[1]+(match[0].match(/data-years="([^"]+)"/)?.[1]||match[0].match(/data-id="([^"]+)"/)?.[1]||''));action.dataset={action:match[1],id:match[0].match(/data-id="([^"]+)"/)?.[1],years:match[0].match(/data-years="([^"]+)"/)?.[1]};return action;});return [];}};
 globalThis.window={addEventListener(type,fn){windowEvents.set(type,fn)},setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},setInterval(fn){windowEvents.set('poll',fn);},scrollTo(){},print(){}};globalThis.confirm=()=>true;
 globalThis.location=location;globalThis.history={replaceState(_state,_title,next){url=new URL(next,url)}};
 Object.defineProperty(globalThis,'localStorage',{value:memory,writable:true,configurable:true});
 Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
 globalThis.fetch=async function(address,options={}) {
  const request=new URL(address);requests.push({path:request.pathname,origin:request.origin,query:request.searchParams,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
  let body;
  if(request.pathname==='/auth/v1/signup'){if(signupGate)await signupGate;body={access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,user:{id:'synthetic-user'}};}
  else if(request.pathname==='/auth/v1/user')body={id:'synthetic-user'};
  else if(request.pathname==='/rest/v1/household_members')body=joined?[{household_id:'synthetic-family'}]:[];
  else if(request.pathname==='/rest/v1/rpc/join_household'){assert.equal(JSON.parse(options.body).p_invite_code,CODE);joined=true;body={household_id:'synthetic-family'};}
  else if(request.pathname==='/rest/v1/rpc/create_household'){joined=true;body={household_id:'synthetic-family',invite_code:CODE};}
  else if(request.pathname==='/rest/v1/scenarios'){
    const id=request.searchParams.get('id')?.slice(3),expected=request.searchParams.get('updated_at')?.slice(3);
    if(['POST','PATCH','DELETE'].includes(options.method)){
      if(saveGate)await saveGate;
      if(failSaves>0){failSaves--;throw Error('Conexión interrumpida de prueba');}
      if(options.method==='POST'){
        const saved=JSON.parse(options.body);if(server.has(saved.id))return new Response(JSON.stringify({message:'duplicate'}),{status:409});
        const stamp=new Date(Date.UTC(2026,1,1,0,0,++serverVersion)).toISOString();const row={id:saved.id,data:saved.data,created_at:stamp,updated_at:stamp};server.set(saved.id,row);body=[row];
      }else{
        const row=server.get(id);
        if(!row||expected&&row.updated_at!==expected)body=[];
        else if(options.method==='DELETE'){server.delete(id);body=[row];}
        else{const stamp=new Date(Date.UTC(2026,1,1,0,0,++serverVersion)).toISOString();const saved={...row,data:JSON.parse(options.body).data,updated_at:stamp};server.set(id,saved);body=[saved];}
      }
    }else{if(listGate)await listGate;body=[...server.values()].map(row=>structuredClone(row));}
  }
  else throw Error('Unexpected mock request: '+request.pathname);
  return new Response(JSON.stringify(body),{status:200});
 };
 const loading=import('./app.mjs?unit-test='+ ++instance);
 return {loading,nodes,requests,location,server,async flushTimers(){const pending=[...timers.values()];timers.clear();for(const fn of pending)await fn();await tick();},async event(name,event){await windowEvents.get(name)?.(event);await tick();},get html(){return html},node,navigate(hash){location.hash=hash;windowEvents.get('hashchange')?.();},draft(){return JSON.parse(memory.getItem(DRAFT_KEY));},submit(){return node('join-family-form').handlers.submit({preventDefault(){}});}};
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
 assert.ok(app.location.hash.startsWith('#viviendas?codigo='));
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
 await app.node('add-home-btn').handlers.click();
 for(const [id,value] of Object.entries({'save-name':'Piso de prueba','save-url':'https://example.com/piso','save-price':'175000','save-type':'flat','save-tax-mode':'used','save-images':'https://example.com/photo.jpg','save-notes':'Comunidad pendiente','save-city':'Navàs'}))app.node(id).value=value;
 await app.node('save-form').handlers.submit({preventDefault(){}});
 const first=app.draft();assert.equal(first.listingDetails.title,undefined);assert.equal(first.listingDetails.sourceReadAt,undefined);assert.notEqual(first.id,'previous-home');assert.equal(first.name,'Piso de prueba');assert.equal(first.propertyType,'flat');assert.equal(first.purchasePrice,175000);
 assert.equal(first.budget.foodMonthly,465);assert.equal(first.budget.storageMonthly,65);assert.equal(first.budget.existingDebtMonthly,215);
 assert.equal(first.familyLoan.rate,5);assert.equal(first.familyLoan.years,10);assert.equal(first.familyLoan.extraBuffer,3000);assert.equal(first.familyLoan.assumedTerms,true);
 assert.equal(app.requests.filter(r=>r.path==='/rest/v1/scenarios'&&r.body).length,1);
 await app.node('save-btn').handlers.click();app.node('save-name').value='Piso con nombre cambiado';
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

test('a private link opens the family automatically and remains shareable after navigation',async()=>{
 const app=boot({hash:buildFamilyHash('viviendas',CODE),scenarios:[savedHome('private-home')]});await app.loading;
 assert.equal(app.requests.filter(r=>r.path==='/rest/v1/rpc/join_household').length,1);
 assert.equal(app.draft().id,'private-home');
 assert.ok(app.location.hash.includes('codigo='+CODE));
 assert.ok(app.html.includes('Casa de prueba'));
});

test('a remotely deleted home never reappears from the browser cache after refresh',async()=>{
 const keep={...savedHome('keep'),name:'Piso que se conserva'},removed={...savedHome('removed'),name:'Ejemplo eliminado'};
 const app=boot({hash:'#viviendas',joined:true,scenarios:[keep,removed],localScenarios:[removed]});await app.loading;
 assert.ok(app.html.includes('Ejemplo eliminado'));
 app.server.delete('removed');await app.node('action-refresh-cloud').handlers.click();
 assert.ok(!app.html.includes('Ejemplo eliminado'));assert.ok(app.html.includes('Piso que se conserva'));
 assert.ok(!JSON.parse(memory.getItem('costes-vivienda.scenarios.v1')).scenarios.some(x=>x.id==='removed'));
 await app.event('focus');assert.ok(!app.html.includes('Ejemplo eliminado'));
});

test('server updates replace a clean draft on focus using the server revision',async()=>{
 const home=savedHome('edited');const app=boot({joined:true,scenarios:[home]});await app.loading;
 const row=app.server.get('edited');row.data.budget.foodMonthly=555;row.updated_at='2026-02-03T00:00:00Z';
 await app.event('focus');
 assert.equal(app.draft().budget.foodMonthly,555);assert.equal(app.draft().updatedAt,row.updated_at);
});

test('valid edits autosave with the original revision and invalid intermediate shares remain local',async()=>{
 const app=boot({hash:'#presupuesto',joined:true,scenarios:[savedHome('autosave')]});await app.loading;
 const food=app.node('field-budget.foodMonthly');food.value='475';food.handlers.change({target:food});await app.flushTimers();
 assert.equal(app.server.get('autosave').data.budget.foodMonthly,475);
 assert.equal(app.requests.filter(r=>r.method==='PATCH').length,1);
 assert.equal(JSON.parse(memory.getItem('casa-ideal.draft-meta.v1')).dirty,false);
 app.navigate('#compra');const share=app.node('field-tax.buyers.0.share');share.value='60';share.handlers.change({target:share});await app.flushTimers();
 assert.equal(app.requests.filter(r=>r.method==='PATCH').length,1);
 assert.equal(app.draft().tax.buyers[0].share,.6);
 assert.equal(app.server.get('autosave').data.tax.buyers[0].share,.5);
});

test('a remote change conflicts with pending local edits rather than overwriting either',async()=>{
 const app=boot({hash:'#presupuesto',joined:true,scenarios:[savedHome('conflict')]});await app.loading;
 const food=app.node('field-budget.foodMonthly');food.value='475';food.handlers.change({target:food});
 const row=app.server.get('conflict');row.data.budget.foodMonthly=600;row.updated_at='2026-02-03T00:00:00Z';
 await app.event('focus');await app.flushTimers();
 assert.equal(app.draft().budget.foodMonthly,475);assert.equal(row.data.budget.foodMonthly,600);
 assert.equal(app.requests.filter(r=>r.method==='PATCH').length,0);
 assert.ok(app.html.includes('ha cambiado en otro dispositivo'));
});

test('switching houses flushes a pending edit before replacing the draft',async()=>{
 const first=savedHome('first'),second=savedHome('second');
 const app=boot({hash:'#presupuesto',draft:first,draftMeta:{id:'first',dirty:false},joined:true,scenarios:[first,second]});await app.loading;
 const food=app.node('field-budget.foodMonthly');food.value='475';food.handlers.change({target:food});
 app.navigate('#viviendas');await app.node('action-loadsecond').handlers.click();
 assert.equal(app.server.get('first').data.budget.foodMonthly,475);assert.equal(app.draft().id,'second');
});

test('a legacy draft with unrecorded edits is preserved for review during deployment',async()=>{
 const remote=savedHome('legacy'),draft=structuredClone(remote);draft.budget.foodMonthly=517;
 const app=boot({joined:true,draft,scenarios:[remote]});await app.loading;await app.flushTimers();
 assert.equal(app.draft().budget.foodMonthly,517);assert.equal(app.server.get('legacy').data.budget.foodMonthly,0);
 assert.equal(app.requests.filter(r=>r.method==='PATCH').length,0);
 assert.ok(app.html.includes('ha cambiado en otro dispositivo'));
});

test('a failed manual update retains the server revision for a later safe retry',async()=>{
 const home=savedHome('retry');const app=boot({joined:true,scenarios:[home],failSaves:1});await app.loading;
 await app.node('save-btn').handlers.click();app.node('save-name').value='Nombre editado';
 await app.node('save-form').handlers.submit({preventDefault(){}});
 assert.equal(app.draft().updatedAt,home.updatedAt);
 assert.equal(JSON.parse(memory.getItem('casa-ideal.draft-meta.v1')).dirty,true);
 app.navigate('#presupuesto');const food=app.node('field-budget.foodMonthly');food.value='400';food.handlers.change({target:food});await app.flushTimers();
 assert.equal(app.server.get('retry').data.name,'Nombre editado');assert.equal(app.server.get('retry').data.budget.foodMonthly,400);
});

test('the requested ICF plan is applied and synced once to a legacy saved home',async()=>{
 const legacy={...savedHome('icf-upgrade'),purchasePrice:175000};delete legacy.financingPlanVersion;
 const app=boot({joined:true,scenarios:[legacy]});await app.loading;await app.flushTimers();
 const saved=app.server.get('icf-upgrade').data;
 assert.equal(saved.icf.enabled,true);assert.equal(saved.icf.eligibilityConfirmed,false);
 assert.equal(saved.mortgage.ltv,.8);assert.equal(saved.familyLoan.amount,null);
 assert.equal(saved.motherTransfer.repaymentMode,'same-as-bank');
 assert.equal(saved.financingPlanVersion,2);
});

test('a failed new creation retains its pending-create identity for an INSERT retry',async()=>{
 const app=boot({hash:'#viviendas',joined:true,failSaves:1});await app.loading;
 await app.node('add-home-btn').handlers.click();app.node('save-name').value='Piso pendiente';app.node('save-price').value='175000';
 await app.node('save-form').handlers.submit({preventDefault(){}});
 const id=app.draft().id;assert.equal(JSON.parse(memory.getItem('casa-ideal.draft-meta.v1')).pendingCreate,true);
 await app.node('save-form').handlers.submit({preventDefault(){}});
 assert.equal(app.server.get(id).data.name,'Piso pendiente');
 assert.equal(app.requests.filter(r=>r.method==='POST'&&r.path==='/rest/v1/scenarios').length,2);
 assert.equal(app.requests.filter(r=>r.method==='PATCH').length,0);
});

test('selecting a hypothetical loan term updates bank and internal repayments together',async()=>{
 const home={...savedHome('terms'),purchasePrice:175000,icf:{enabled:true,ltv:.2,maxAmount:50000,repaymentYears:5},familyLoan:{enabled:true,rate:5,years:10,maxAmount:60000,extraBuffer:3000},motherTransfer:{mode:'family-loan',repaymentMode:'same-as-bank',allocations:[{share:.5},{share:.5}]}};
 const app=boot({hash:'#hipoteca',joined:true,scenarios:[home]});await app.loading;
 await app.node('action-loan-term20').handlers.click();await app.flushTimers();
 assert.equal(app.server.get('terms').data.familyLoan.years,20);
 assert.equal(app.draft().motherTransfer.repaymentMode,'same-as-bank');assert.ok(app.html.includes('135,29'));
});

test('adding two homes in local mode never reuses the first home identity',async()=>{
 const app=boot({hash:'#viviendas'});await app.loading;
 for(const name of ['Primera local','Segunda local']){await app.node('add-home-btn').handlers.click();app.node('save-name').value=name;app.node('save-price').value='175000';await app.node('save-form').handlers.submit({preventDefault(){}});}
 const rows=JSON.parse(memory.getItem('costes-vivienda.scenarios.v1')).scenarios;
 assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);assert.deepEqual(rows.map(x=>x.name).sort(),['Primera local','Segunda local']);
});
