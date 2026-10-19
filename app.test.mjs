import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScenario, calculateScenario } from './finance.mjs';
import { buildFamilyHash } from './family-access.mjs';
import {extractFamilyProfile} from './family-profile.mjs';

const CODE = 'cd34'.repeat(12);
const DRAFT_KEY = 'casa-ideal.draft.v1';
const memory = { values: new Map(), getItem(key) { return this.values.get(key) ?? null; }, setItem(key,value) { this.values.set(key,String(value)); }, removeItem(key) { this.values.delete(key); } };
let instance=0;
const shared = id => normalizeScenario({id,name:'Casa de prueba',budget:{incomes:[{monthly:2100,payments:12},{monthly:1700,payments:14}]}});
const tick = () => new Promise(resolve=>setImmediate(resolve));
const savedHome=id=>({...shared(id),financingPlanVersion:2,purchasePlanVersion:1,discountBreakdownVersion:1,preclosingPlanVersion:1,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-02T00:00:00Z'});

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
 const app=boot({hash:'#compra',draft});await app.loading;
 await app.node('action-apply-property-provision').handlers.click();
 const b=app.draft().budget;
 assert.equal(b.ibiAnnual,1500);assert.equal(b.wasteAnnual,300);assert.equal(b.communityMonthly,100);
 assert.equal(b.foodMonthly,450);assert.equal(b.storageMonthly,65);assert.equal(b.utilityBreakdown.waterMonthly,30);
 assert.equal(b.propertyCostsEstimated,true);assert.equal(b.propertyCostsConfirmed,false);
});
test('the IBI assistant preserves waste, community, and living costs',async()=>{
 const draft=normalizeScenario({id:'local-house',budget:{ibiLiquidableBase:100000,ibiRatePercent:.7,wasteAnnual:240,communityMonthly:40,storageMonthly:65}});
 const app=boot({hash:'#compra',draft});await app.loading;
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
 assert.ok(app.html.includes('≈ '));assert.ok(app.html.includes('Quedan gastos o condiciones pendientes'));
 assert.ok(!app.html.includes('mínimo conocido'));assert.ok(!app.html.includes('Margen máximo provisional'));
});


test('the home page opens the housing overview',async()=>{
 const app=boot({hash:''});await app.loading;
 assert.equal(app.node('page-title').textContent,'Vuestras viviendas.');
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

test('reloading a private purchase route keeps its section and active saved home',async()=>{
 const house=savedHome('open-home');
 const app=boot({hash:buildFamilyHash('compra',CODE),joined:true,draft:house,draftMeta:{id:house.id,dirty:false},scenarios:[house,savedHome('other-home')]});await app.loading;
 assert.equal(app.draft().id,'open-home');
 assert.ok(app.location.hash.startsWith('#compra?'));
 assert.ok(app.location.hash.includes('vivienda=open-home'));
 assert.ok(app.html.includes('Precio, tasación y financiación'));
});

test('an explicit private home opens in its requested section on a fresh device',async()=>{
 const app=boot({hash:buildFamilyHash('compra',CODE,'second-home'),scenarios:[savedHome('first-home'),savedHome('second-home')]});await app.loading;
 assert.equal(app.draft().id,'second-home');
 assert.ok(app.location.hash.startsWith('#compra?'));
 assert.ok(app.location.hash.includes('vivienda=second-home'));
});

test('automatic family access preserves global sections with several saved homes',async()=>{
 for(const view of ['presupuesto','fuentes','comparativa']){
  const app=boot({hash:buildFamilyHash(view,CODE),scenarios:[savedHome('one'),savedHome('two')]});await app.loading;
  assert.ok(app.location.hash.startsWith('#'+view+'?'));
 }
});

test('a reloaded property route keeps pending edits to that same home',async()=>{
 const home=savedHome('edited-home'),draft={...home,name:'Nombre pendiente'};
 const app=boot({hash:buildFamilyHash('compra',CODE,home.id),draft,draftMeta:{id:home.id,dirty:true},scenarios:[home]});await app.loading;
 assert.equal(app.draft().name,'Nombre pendiente');
 assert.ok(app.location.hash.startsWith('#compra?'));
});

test('a private route never replaces another home with unsaved edits',async()=>{
 const home=savedHome('local-edits'),draft={...home,name:'No descartar'};
 const app=boot({hash:buildFamilyHash('compra',CODE,'requested-home'),draft,draftMeta:{id:home.id,dirty:true},scenarios:[home,savedHome('requested-home')]});await app.loading;
 assert.equal(app.draft().id,home.id);assert.equal(app.draft().name,'No descartar');
 assert.ok(app.location.hash.startsWith('#viviendas?'));
});

test('a missing bookmarked home returns to the list without opening a different one',async()=>{
 const app=boot({hash:buildFamilyHash('compra',CODE,'missing-home'),scenarios:[savedHome('only-existing')]});await app.loading;
 assert.ok(app.location.hash.startsWith('#viviendas?'));
 assert.equal(app.draft(),null);
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

test('the property details show rooms and the route page autosaves manual travel information',async()=>{
 const home={...savedHome('commutes'),name:'Piso de trayectos',listingDetails:{beds:4,baths:1,surfaceM2:75,city:'Navàs'}};
 const app=boot({joined:true,scenarios:[home]});await app.loading;
 assert.ok(app.html.includes('habitaciones'));assert.ok(app.html.includes('75'));assert.ok(app.html.includes('data-view="trayectos"'));
 app.navigate('#trayectos');assert.equal(app.node('page-title').textContent,'Ubicación y trayectos.');
 const minutes=app.node('field-commute.trips.0.minutesMin');minutes.value='110';minutes.handlers.change({target:minutes});await app.flushTimers();
 assert.equal(app.server.get('commutes').data.commute.trips[0].minutesMin,110);
 const destination=app.node('field-commute.trips.0.destination');destination.value='Otro destino';destination.handlers.change({target:destination});await app.flushTimers();
 const changed=app.server.get('commutes').data.commute.trips[0];assert.equal(changed.destination,'Otro destino');assert.equal(changed.minutesMin,null);assert.equal(changed.destinationConfirmed,false);
});

test('the existing Navàs record gains reference journeys and listing facts without changing its budget',async()=>{
 const home={...savedHome('navas'),url:'https://hub.engelvoelkers.com/es/exposee/f5b1dc73-bc4a-4113-af4b-04d3686692dd',purchasePrice:175000};
 const app=boot({joined:true,scenarios:[home]});await app.loading;await app.flushTimers();
 const record=app.server.get('navas').data;assert.equal(record.listingDetails.beds,4);assert.equal(record.listingDetails.baths,1);
 assert.equal(record.commute.trips[2].destinationConfirmed,true);assert.ok(record.commute.trips[2].destination.includes('Royal'));assert.ok(record.commute.trips[0].destination.includes('Rodalies'));
 assert.equal(record.commute.trips[1].minutesMin,100);assert.equal(record.housingPresentationVersion,2);
 assert.deepEqual(record.budget,home.budget);
});

test('the comparison route-edit button opens and edits the selected home rather than the previous draft',async()=>{
 const first={...savedHome('route-first'),name:'Primera vivienda',listingDetails:{city:'Primer municipio'}};
 const second={...savedHome('route-second'),name:'Segunda vivienda',listingDetails:{city:'Segundo municipio'}};
 const app=boot({hash:'#comparativa',joined:true,draft:first,draftMeta:{id:first.id,dirty:false},scenarios:[first,second]});await app.loading;
 const queryAll=document.querySelectorAll.bind(document);
 document.querySelectorAll=selector=>selector==='[data-compare]'?[...app.html.matchAll(/<input[^>]*data-compare="([^"]+)"[^>]*>/g)].map(match=>{
  const input=app.node('comparison-'+match[1]);input.dataset={compare:match[1]};input.checked=/\schecked(?:\s|>)/.test(match[0]);return input;
 }):queryAll(selector);
 app.navigate('#viviendas');app.navigate('#comparativa');
 for(const id of [first.id,second.id]){const input=app.node('comparison-'+id);input.checked=true;input.handlers.change();}
 await app.node('action-edit-commuteroute-second').handlers.click();
 assert.equal(app.draft().id,second.id);assert.ok(app.location.hash.startsWith('#trayectos'));
 const minutes=app.node('field-commute.trips.0.minutesMin');minutes.value='65';minutes.handlers.change({target:minutes});await app.flushTimers();
 assert.equal(app.server.get(second.id).data.commute.trips[0].minutesMin,65);
 assert.equal(app.server.get(first.id).data.commute,undefined);
});

// Shared-profile integration cases: only synthetic incomes and expenses.
import {FAMILY_PROFILE_ID as PROFILE_TEST_ID,extractFamilyProfile as extractProfileForAppTest} from './family-profile.mjs';
function profileForAppTest({foodMonthly=400,savings=2500}={}){
 const source=savedHome('profile-source');source.budget.foodMonthly=foodMonthly;source.cash.savings=savings;
 return {...extractProfileForAppTest(source),createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-02T00:00:00Z'};
}
function profileCacheForAppTest(){
 const entry=[...memory.values].find(([key])=>key.startsWith('casa-ideal.family-budget.v1:')&&key.includes('synthetic-family'));
 return entry?JSON.parse(entry[1]):null;
}

test('editing the connected household budget creates a reserved profile and other homes keep their own IBI',async()=>{
 const first=savedHome('profile-first'),second=savedHome('profile-second');first.budget.ibiAnnual=850;second.budget.ibiAnnual=1350;
 const app=boot({hash:'#presupuesto',joined:true,draft:first,draftMeta:{id:first.id,dirty:false},scenarios:[first,second]});await app.loading;
 const food=app.node('field-budget.foodMonthly');food.value='475';food.handlers.change({target:food});await app.flushTimers();
 const profile=app.server.get(PROFILE_TEST_ID)?.data;
 assert.ok(profile,'a shared profile is saved, not only a per-house snapshot');
 assert.equal(profile.kind,'family-budget');assert.equal(profile.budget.foodMonthly,475);assert.equal(Object.hasOwn(profile.budget,'ibiAnnual'),false);
 assert.equal(app.requests.filter(r=>r.method==='POST'&&r.body?.id===PROFILE_TEST_ID).length,1);
 app.navigate('#viviendas');await app.node('action-loadprofile-second').handlers.click();
 assert.equal(app.draft().id,second.id);assert.equal(app.draft().budget.foodMonthly,475);assert.equal(app.draft().budget.ibiAnnual,1350);
 assert.equal(app.server.get(first.id).data.budget.ibiAnnual,850);assert.equal(app.server.get(second.id).data.budget.ibiAnnual,1350);
 assert.equal(Number(app.node('saved-count').textContent),2);
});

test('a remotely refreshed family profile applies to every home without becoming a listed property',async()=>{
 const first=savedHome('remote-profile-first'),second=savedHome('remote-profile-second');first.budget.ibiAnnual=700;second.budget.ibiAnnual=1200;
 const profile=profileForAppTest();
 const app=boot({hash:'#viviendas',joined:true,scenarios:[first,second,profile]});await app.loading;
 assert.equal(Number(app.node('saved-count').textContent),2);assert.ok(!app.html.includes(`data-home-id="${PROFILE_TEST_ID}"`));
 await app.node('action-loadremote-profile-first').handlers.click();
 assert.equal(app.draft().budget.foodMonthly,400);
 const remote=app.server.get(PROFILE_TEST_ID);remote.data.budget.foodMonthly=625;remote.data.cash.savings=9000;remote.updated_at='2026-02-04T00:00:00Z';
 await app.event('focus');app.navigate('#presupuesto');
 assert.equal(Number(app.node('field-budget.foodMonthly').value),625);
 app.navigate('#viviendas');await app.node('action-loadremote-profile-second').handlers.click();
 assert.equal(app.draft().budget.foodMonthly,625);assert.equal(app.draft().cash.savings,9000);assert.equal(app.draft().budget.ibiAnnual,1200);
 app.navigate('#viviendas');await app.node('action-loadremote-profile-first').handlers.click();
 assert.equal(app.draft().budget.foodMonthly,625);assert.equal(app.draft().cash.savings,9000);assert.equal(app.draft().budget.ibiAnnual,700);
 assert.equal(app.requests.filter(r=>r.path==='/rest/v1/scenarios'&&['POST','PATCH','DELETE'].includes(r.method)).length,0);
});

test('a concurrent family-profile CAS failure preserves the local edit and resolves to the newest remote budget',async()=>{
 const home=savedHome('profile-cas'),profile=profileForAppTest();
 const app=boot({hash:'#presupuesto',joined:true,scenarios:[home,profile]});await app.loading;
 const food=app.node('field-budget.foodMonthly');food.value='475';food.handlers.change({target:food});
 // A second device saves after this device read the original revision.
 const remote=app.server.get(PROFILE_TEST_ID);remote.data.budget.foodMonthly=600;remote.updated_at='2026-02-05T00:00:00Z';
 await app.flushTimers();
 assert.equal(remote.data.budget.foodMonthly,600);assert.equal(app.draft().budget.foodMonthly,475);
 assert.equal(profileCacheForAppTest().dirty,true);assert.equal(profileCacheForAppTest().profile.budget.foodMonthly,475);
 assert.ok(app.html.includes('El presupuesto familiar ha cambiado en otro dispositivo'));
 const patch=app.requests.find(r=>r.method==='PATCH'&&r.query.get('id')==='eq.'+PROFILE_TEST_ID);
 assert.ok(patch);assert.equal(patch.query.get('updated_at'),'eq.'+profile.updatedAt);
 assert.ok(app.node('action-use-family-budget').handlers.click);
 await app.node('action-use-family-budget').handlers.click();
 assert.equal(app.draft().budget.foodMonthly,600);assert.equal(profileCacheForAppTest().dirty,false);
 assert.ok(!app.html.includes('El presupuesto familiar ha cambiado en otro dispositivo'));
});

test('an external profile change is visible as a conflict while this device has an unsaved household edit',async()=>{
 const app=boot({hash:'#presupuesto',joined:true,scenarios:[savedHome('profile-refresh-conflict'),profileForAppTest()]});await app.loading;
 const food=app.node('field-budget.foodMonthly');food.value='475';food.handlers.change({target:food});
 const remote=app.server.get(PROFILE_TEST_ID);remote.data.budget.foodMonthly=650;remote.updated_at='2026-02-06T00:00:00Z';
 await app.event('focus');
 assert.equal(app.draft().budget.foodMonthly,475);assert.equal(profileCacheForAppTest().dirty,true);
 assert.ok(app.html.includes('El presupuesto familiar ha cambiado en otro dispositivo'));
 assert.ok(app.node('action-use-family-budget').handlers.click);
 assert.equal(app.requests.filter(r=>r.method==='PATCH').length,0);
});

test('a favorite uses CAS and changes only the favorite metadata, preserving raw property and financial data',async()=>{
 const home=savedHome('favorite-preserves'),other=savedHome('favorite-other');home.budget.ibiAnnual=925;home.budget.foodMonthly=123;home.cash.savings=200;
 const profile=profileForAppTest({foodMonthly:700,savings:8500});
 const app=boot({hash:'#viviendas',joined:true,scenarios:[home,other,profile]});await app.loading;
 const before=structuredClone(app.server.get(home.id).data);
 await app.node('action-favoritefavorite-preserves').handlers.click();
 const after=structuredClone(app.server.get(home.id).data);assert.equal(after.favorite,true);
 delete after.favorite;delete after.updatedAt;delete before.favorite;delete before.updatedAt;
 assert.deepEqual(after,before);
 const patch=app.requests.find(r=>r.method==='PATCH'&&r.query.get('id')==='eq.'+home.id);
 assert.ok(patch);assert.equal(patch.query.get('updated_at'),'eq.'+home.updatedAt);
 assert.equal(app.requests.filter(r=>r.method==='POST'&&r.path==='/rest/v1/scenarios').length,0);
 assert.equal(app.server.get(PROFILE_TEST_ID).data.budget.foodMonthly,700);
});

test('a stale favorite cannot overwrite a newer edit made by another device',async()=>{
 const home=savedHome('favorite-stale'),other=savedHome('favorite-stale-other');
 const app=boot({hash:'#viviendas',joined:true,scenarios:[home,other]});await app.loading;
 const remote=app.server.get(home.id);remote.data.name='Nombre cambiado en otro dispositivo';remote.data.purchasePrice=180000;remote.updated_at='2026-02-07T00:00:00Z';
 const before=structuredClone(remote.data);
 await app.node('action-favoritefavorite-stale').handlers.click();
 assert.deepEqual(app.server.get(home.id).data,before);assert.notEqual(app.server.get(home.id).data.favorite,true);
 assert.ok(app.node('toast').textContent.includes('cambiado'));
 assert.equal(app.requests.filter(r=>r.method==='POST'&&r.path==='/rest/v1/scenarios').length,0);
});

test('the comparison selectors and columns exclude the reserved shared-budget record',async()=>{
 const first=savedHome('compare-profile-first'),second=savedHome('compare-profile-second');first.name='Primera comparada';second.name='Segunda comparada';
 const app=boot({hash:'#comparativa',joined:true,scenarios:[first,second,profileForAppTest()]});await app.loading;
 const queryAll=document.querySelectorAll.bind(document);
 // Supply checkbox event nodes to the minimal DOM harness for this view.
 document.querySelectorAll=selector=>selector==='[data-compare]'?[...app.html.matchAll(/<input[^>]*data-compare="([^"]+)"[^>]*>/g)].map(match=>{
  const input=app.node('comparison-'+match[1]);input.dataset={compare:match[1]};input.checked=/\schecked(?:\s|>)/.test(match[0]);return input;
 }):queryAll(selector);
 app.navigate('#viviendas');app.navigate('#comparativa');
 for(const id of [first.id,second.id]){const input=app.node('comparison-'+id);input.checked=true;input.handlers.change();}
 const table=app.html.match(/<table>([\s\S]*?)<\/table>/)?.[1];
 assert.ok(table);assert.ok(table.includes(first.name));assert.ok(table.includes(second.name));
 assert.ok(!app.html.includes(`data-compare="${PROFILE_TEST_ID}"`));assert.ok(!table.includes(PROFILE_TEST_ID));
 assert.equal(Number(app.node('saved-count').textContent),2);
});


test('purchase fee mode reveals its inputs and fixed arras are wired to the calculation',async()=>{
 const app=boot({joined:true,hash:'#compra',scenarios:[savedHome('fee-house')]});await app.loading;
 const mode=app.node('field-purchaseCosts.mode');mode.value='itemized';await mode.handlers.change({target:mode});
 assert.ok(app.html.includes('data-field="purchaseCosts.appraisal"'));
 assert.ok(!app.html.includes('data-field="purchaseCosts.provisionAmount"'));
 const depositMode=app.node('deposit-input-mode');depositMode.value='fixed';await depositMode.handlers.change({target:depositMode});
 const amount=app.node('field-cash.depositAmount');amount.value='5000';await amount.handlers.change({target:amount});
 assert.equal(app.draft().cash.depositAmount,5000);
 depositMode.value='percent';await app.node('deposit-input-mode').handlers.change({target:depositMode});
 assert.equal(app.draft().cash.depositAmount,null);
});

test('a net service quote recalculates its final price and persists VAT for the family',async()=>{
 const house=savedHome('vat-house');house.purchaseCosts.mode='itemized';
 const app=boot({joined:true,hash:'#compra',scenarios:[house]});await app.loading;
 for(const [path,value] of [['purchaseCosts.appraisal','500'],['purchaseCosts.vat.appraisal.mode','net']]){
  const field=app.node('field-'+path);field.value=value;await field.handlers.change({target:field});
 }
 assert.ok(app.html.includes('IVA añadido: 105,00'));
 assert.ok(app.html.includes('Total a pagar: 605,00'));
 await app.flushTimers();
 const saved=app.server.get('vat-house').data;
 assert.equal(saved.purchaseCosts.appraisal,500);
 assert.equal(saved.purchaseCosts.vat.appraisal.mode,'net');
 assert.equal(calculateScenario(saved).cash.prepaidPurchaseFees,605);
 const mode=app.node('field-purchaseCosts.vat.appraisal.mode');mode.value='total';await mode.handlers.change({target:mode});
 const total=app.node('field-purchaseCosts.appraisal');total.value='605';await total.handlers.change({target:total});
 await app.flushTimers();
 assert.equal(calculateScenario(app.server.get('vat-house').data).cash.purchaseFees,605);
});

test('explicitly simulating both reduced ITP shares never marks the fiscal documents as checked',async()=>{
 const house=savedHome('tax-assumed-house');house.purchasePrice=175000;
 house.tax.buyers=house.tax.buyers.map(b=>({...b,rate:.05,eligibilityConfirmed:false,eligibilityAssumed:false}));
 const app=boot({joined:true,hash:'#compra',scenarios:[house]});await app.loading;
 assert.equal(calculateScenario(app.draft()).tax.total,17500);
 for(const i of [0,1]){
  const field=app.node(`field-tax.buyers.${i}.eligibilityAssumed`);field.checked=true;await field.handlers.change({target:field});
 }
 assert.equal(calculateScenario(app.draft()).tax.total,8750);
 assert.ok(app.html.includes('hipótesis'));
 await app.flushTimers();
 const saved=app.server.get('tax-assumed-house').data;
 assert.ok(saved.tax.buyers.every(b=>b.eligibilityAssumed===true&&b.eligibilityConfirmed===false));
});


test('appraisal and waiting fields are editable in the main purchase view and remain saved per home',async()=>{
 const house=savedHome('waiting-house');house.purchasePrice=175000;house.icf.enabled=true;house.purchaseCosts.mode='provision';
 const app=boot({joined:true,hash:'#compra',scenarios:[house]});await app.loading;
 assert.equal([...app.html.matchAll(/data-field="appraisalValue"/g)].length,1);
 assert.ok(app.html.indexOf('data-field="appraisalValue"')<app.html.indexOf('<summary>Precio, impuestos'));
 const appraisal=app.node('field-appraisalValue');appraisal.value='160000';await appraisal.handlers.change({target:appraisal});
 assert.equal(app.draft().appraisalValue,160000);assert.ok(app.html.includes('128.000'));
 const waiting=app.node('field-cash.preClosingLoanPayments');waiting.value='2';await waiting.handlers.change({target:waiting});
 const moving=app.node('field-purchaseCosts.moving');moving.value='600';await moving.handlers.change({target:moving});
 await app.flushTimers();
 assert.equal(app.server.get('waiting-house').data.cash.preClosingLoanPayments,2);
 assert.equal(app.server.get('waiting-house').data.purchaseCosts.moving,600);
 assert.ok(app.html.includes('Alquiler + préstamo de mamá'));
});


test('reloading the private family section keeps the family section open',async()=>{
 const home=savedHome('family-page-home');
 const app=boot({hash:buildFamilyHash('familia',CODE),draft:home,draftMeta:{id:home.id,dirty:false},scenarios:[home]});await app.loading;
 assert.ok(app.location.hash.startsWith('#familia?'));
 assert.equal(app.draft().id,home.id);
});

test('changing only the home in a private purchase route opens the requested saved home',async()=>{
 const first=savedHome('history-first'),second=savedHome('history-second');
 const app=boot({hash:buildFamilyHash('compra',CODE,first.id),scenarios:[first,second]});await app.loading;
 app.navigate(buildFamilyHash('compra',CODE,second.id));
 assert.equal(app.draft().id,second.id);
 assert.ok(app.location.hash.startsWith('#compra?'));
});

test('the monthly allocation tab survives a private reload and shares only its family plan edits',async()=>{
 const first=savedHome('allocation-first'),second=savedHome('allocation-second');
 first.budget.existingDebtMonthly=200;
 first.familyPlan={sharedCostMode:'equal',personalDebtOwner:'buyer1',university:{amount:425,endMonth:'2027-06'},sisterJob:{enabled:true,amount:450,startMonth:'2027-01'}};
 const profile={...extractFamilyProfile(first),createdAt:first.createdAt,updatedAt:first.updatedAt};
 const app=boot({hash:buildFamilyHash('reparto',CODE,first.id),scenarios:[first,second,profile]});await app.loading;
 assert.ok(app.location.hash.startsWith('#reparto?'));assert.ok(app.html.includes('Qué paga cada uno'));
 assert.ok(app.html.includes('family-plan-month'));assert.ok(app.html.includes('Tu hermano'));
 const horizon=app.node('family-plan-horizon');horizon.value='144';await horizon.handlers.change({target:horizon});assert.ok(app.html.includes('144 meses'));
 const university=app.node('field-familyPlan.university.amount');university.value='350';await university.handlers.change({target:university});await app.flushTimers();
 assert.equal(app.server.get(profile.id).data.familyPlan.university.amount,350);
 assert.equal(app.server.get(profile.id).data.budget.existingDebtMonthly,200);
 app.navigate(buildFamilyHash('resumen',CODE,second.id));
 assert.equal(app.draft().id,second.id);assert.equal(app.draft().familyPlan.university.amount,350);
 assert.equal(calculateScenario(app.draft(),{asOfMonth:'2026-10'}).budget.universityMonthly,350);
});

test('an invalid university date can be repaired without losing the shared plan',async()=>{
 const home=savedHome('allocation-repair');home.familyPlan={sharedCostMode:'equal',university:{amount:300,endMonth:'2027-06'}};
 const profile={...extractFamilyProfile(home),createdAt:home.createdAt,updatedAt:home.updatedAt};
 const app=boot({hash:buildFamilyHash('reparto',CODE,home.id),scenarios:[home,profile]});await app.loading;
 let end=app.node('field-familyPlan.university.endMonth');end.value='2027-13';await end.handlers.change({target:end});await app.flushTimers();
 assert.equal(app.server.get(profile.id).data.familyPlan.university.endMonth,'2027-06');
 end=app.node('field-familyPlan.university.endMonth');end.value='2027-05';await end.handlers.change({target:end});await app.flushTimers();
 assert.equal(app.server.get(profile.id).data.familyPlan.university.endMonth,'2027-05');
 assert.ok(app.html.includes('Qué paga cada uno'));
});

test('current payer controls and month shortcuts preserve the future plan and save the allocation',async()=>{
 const home=savedHome('current-payers');home.budget.currentRent=900;home.budget.foodMonthly=300;home.cash.preClosingLoanPayments=2;
 home.familyPlan={sharedCostMode:'workers',currentAllocation:{enabled:true,rentPayer:'buyer1',brotherLivingShare:.5,otherCostMode:'unassigned'}};
 const profile={...extractFamilyProfile(home),createdAt:home.createdAt,updatedAt:home.updatedAt};
 const app=boot({hash:buildFamilyHash('reparto',CODE,home.id),scenarios:[home,profile]});await app.loading;
 const shortcuts=[...app.html.matchAll(/data-action="plan-month" data-id="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(shortcuts.length,2);assert.ok(app.html.includes('data-field="familyPlan.currentAllocation.brotherLivingShare"'));
 await app.node('action-plan-month'+shortcuts[1]).handlers.click();
 assert.ok(app.html.includes('Vivienda comprada'));
 assert.equal(app.requests.filter(request=>request.method==='PATCH').length,0,'viewing another month does not save financial data');
 const share=app.node('field-familyPlan.currentAllocation.brotherLivingShare');share.value='60';await share.handlers.change({target:share});await app.flushTimers();
 const saved=app.server.get(profile.id).data.familyPlan;
 assert.equal(saved.currentAllocation.brotherLivingShare,.6);assert.equal(saved.currentAllocation.rentPayer,'buyer1');
 assert.equal(saved.sharedCostMode,'workers');assert.equal(saved.currentAllocation.otherCostMode,'unassigned');
});

test('expense and remaining views retain expanded months without writing financial data',async()=>{
 const home=savedHome('expense-view');home.cash.preClosingLoanPayments=2;
 const profile={...extractFamilyProfile(home),createdAt:home.createdAt,updatedAt:home.updatedAt};
 const app=boot({hash:buildFamilyHash('reparto',CODE,home.id),scenarios:[home,profile]});await app.loading;
 assert.match(app.html,/<option value="expenses" selected>/);
 const month=app.html.match(/data-action="toggle-plan-month" data-id="([^"]+)"/)?.[1];assert.ok(month);
 await app.node('action-toggle-plan-month'+month).handlers.click();
 assert.ok(app.html.includes('aria-expanded="true"'));
 const selector=app.node('family-plan-table-mode');selector.value='remaining';await selector.handlers.change({target:selector});
 assert.equal(memory.getItem('casa-ideal.family-plan-table-mode'),'remaining');
 assert.match(app.html,/<option value="remaining" selected>/);assert.ok(app.html.includes('aria-expanded="true"'));
 await app.node('action-toggle-plan-month'+month).handlers.click();
 assert.match(app.html,new RegExp('id="family-plan-details-'+month+'" class="family-plan-month-detail" hidden'));
 assert.equal(app.requests.filter(request=>request.method==='PATCH').length,0);
 assert.deepEqual(app.server.get(profile.id).data,profile);
});
