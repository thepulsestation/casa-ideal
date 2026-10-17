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
 globalThis.document={querySelector(selector){const id=selector.slice(1);if(optional.includes(id)&&!html.includes('id="'+id+'"'))return null;return node(id);},querySelectorAll(selector){if(selector==='[data-action]')return [...html.matchAll(/data-action="([^"]+)"/g)].map(match=>({...node('action-'+match[1]),dataset:{action:match[1]}}));return [];}};
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
  else if(request.pathname==='/rest/v1/scenarios')body=scenarios.map(data=>({id:data.id,data,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-02T00:00:00Z'}));
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
