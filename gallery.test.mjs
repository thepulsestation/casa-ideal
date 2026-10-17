import test from 'node:test';
import assert from 'node:assert/strict';
import {initGallery} from './gallery.mjs';
import {renderPropertyGallery,renderHousingList} from './housing-ui.mjs';

class FakeElement{
 constructor(tag,doc){
  this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentElement=null;
  this.dataset={};this.attributes={};this.events=new Map();this.hidden=false;this.isConnected=true;
  this.classes=new Set();
  this.classList={add:(v)=>this.classes.add(v),toggle:(v,on)=>on?this.classes.add(v):this.classes.delete(v)};
 }
 addEventListener(type,listener){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(listener);}
 removeEventListener(type,listener){this.events.get(type)?.delete(listener);}
 emit(type,values={}){
  const event={type,target:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...values};
  for(const listener of [...(this.events.get(type)||[])])listener(event);
  return event;
 }
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key];}
 appendChild(child){child.parentElement=this;this.children.push(child);return child;}
 replaceChildren(){for(const child of this.children)child.parentElement=null;this.children=[];}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 closest(selector){return selector==='[data-gallery-index]'&&this.dataset.galleryIndex!==undefined?this:this.parentElement?.closest(selector)||null;}
 focus(){this.ownerDocument.activeElement=this;}
}
class FakeDialog extends FakeElement{
 constructor(doc){super('dialog',doc);this.open=false;this.showCount=0;this.built=0;this.nodes={};}
 set innerHTML(value){
  this.html=value;this.built++;
  for(const key of ['title','counter','close','previous','next','image','error','thumbnails']){
   this.nodes[key]=new FakeElement(key==='image'?'img':key==='close'||key==='previous'||key==='next'?'button':'div',this.ownerDocument);
   this.appendChild(this.nodes[key]);
  }
 }
 querySelector(selector){return this.nodes[selector.match(/^\[data-gallery-(.+)\]$/)?.[1]]||null;}
 showModal(){this.open=true;this.showCount++;}
 close(){if(this.open){this.open=false;this.emit('close');}}
 cancel(){const event=this.emit('cancel');if(!event.defaultPrevented)this.close();return event;}
 getBoundingClientRect(){return {left:100,right:900,top:100,bottom:700};}
}
function fixture(){
 const doc={activeElement:null,createElement(tag){return new FakeElement(tag,this);}};
 const opener=new FakeElement('button',doc);opener.focus();
 const dialog=new FakeDialog(doc),gallery=initGallery(dialog);
 return {doc,opener,dialog,gallery};
}
const photos=['https://example.com/one.jpg','https://example.com/two.jpg','https://example.com/three.jpg'];
const esc=value=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

test('gallery boot is lazy and rejects unsafe/empty photos without opening',()=>{
 const {gallery,dialog}=fixture();
 assert.equal(dialog.built,0);
 for(const input of [null,[],['http://example.com/a'],['data:image/png;base64,a'],['javascript:alert(1)'],['https://user:secret@example.com/a']])assert.equal(gallery.open(input),false);
 assert.equal(dialog.showCount,0);assert.equal(dialog.built,0);
 // App test stubs need no full child DOM until an actual photo is opened.
 const minimal={addEventListener(){},removeEventListener(){}};
 assert.doesNotThrow(()=>initGallery(minimal).destroy());
});

test('open filters and caps photos, clamps initial index, and assigns text safely',()=>{
 const {gallery,dialog}=fixture();
 assert.equal(gallery.open(['data:bad',...Array.from({length:12},(_,i)=>`https://example.com/${i}.jpg`)],{name:'<img onerror="bad">',index:90}),true);
 assert.deepEqual(gallery.getState(),{isOpen:true,index:7,count:8});
 assert.equal(dialog.nodes.title.textContent,'<img onerror="bad">');
 assert.equal(dialog.nodes.counter.textContent,'8 / 8');
 assert.equal(dialog.nodes.image.src,'https://example.com/7.jpg');
 assert.equal(dialog.nodes.image.alt,'<img onerror="bad"> · foto 8 de 8');
 assert.equal(dialog.nodes.thumbnails.children.length,8);
 assert.equal(dialog.nodes.thumbnails.children[0].children[0].referrerPolicy,'no-referrer');
 assert.equal(dialog.nodes.thumbnails.children[7].getAttribute('aria-pressed'),'true');
 assert.equal(dialog.nodes.previous.disabled,false);
});

test('buttons, arrows and thumbnails select photos with wraparound',()=>{
 const {gallery,dialog}=fixture();gallery.open(photos,{index:0});
 dialog.nodes.previous.emit('click');assert.equal(gallery.getState().index,2);
 dialog.nodes.next.emit('click');assert.equal(gallery.getState().index,0);
 let event=dialog.emit('keydown',{key:'ArrowRight'});assert.equal(event.defaultPrevented,true);assert.equal(gallery.getState().index,1);
 event=dialog.emit('keydown',{key:'ArrowLeft'});assert.equal(event.defaultPrevented,true);assert.equal(gallery.getState().index,0);
 dialog.emit('keydown',{key:'ArrowRight',ctrlKey:true});assert.equal(gallery.getState().index,0);
 const thumbnail=dialog.nodes.thumbnails.children[2];
 dialog.emit('click',{target:thumbnail.children[0]});assert.equal(gallery.getState().index,2);
 assert.equal(thumbnail.getAttribute('aria-pressed'),'true');
 assert.equal(dialog.nodes.thumbnails.children[0].getAttribute('aria-pressed'),'false');
 assert.equal(dialog.nodes.counter.textContent,'3 / 3');
 assert.equal(gallery.goTo(1.5),false);assert.equal(gallery.getState().index,2);
});

test('a single photo disables both arrows and hides redundant thumbnails',()=>{
 const {gallery,dialog}=fixture();gallery.open([photos[0]],{index:-1});
 assert.equal(dialog.nodes.previous.disabled,true);assert.equal(dialog.nodes.next.disabled,true);
 assert.equal(dialog.nodes.thumbnails.hidden,true);assert.equal(dialog.nodes.counter.textContent,'1 / 1');
 gallery.next();assert.equal(gallery.getState().index,0);
});

test('native Escape close restores focus and reopening does not replace the opener',()=>{
 const {gallery,dialog,doc,opener}=fixture();gallery.open(photos);
 assert.equal(doc.activeElement,dialog.nodes.close);
 gallery.open([photos[1]],{name:'Otra vivienda'});
 assert.equal(dialog.showCount,1);assert.equal(dialog.built,1);
 assert.equal(dialog.emit('keydown',{key:'Escape'}).defaultPrevented,false);
 assert.equal(dialog.cancel().defaultPrevented,false);
 assert.equal(dialog.open,false);assert.equal(doc.activeElement,opener);
});

test('close button and outside backdrop close; inside clicks stay open',()=>{
 const {gallery,dialog,doc,opener}=fixture();gallery.open(photos);
 dialog.emit('click',{clientX:120,clientY:120});assert.equal(dialog.open,true);
 dialog.emit('click',{clientX:20,clientY:20});assert.equal(dialog.open,false);assert.equal(doc.activeElement,opener);
 gallery.open(photos);dialog.nodes.close.emit('click');assert.equal(dialog.open,false);
 gallery.open(photos);gallery.close();assert.equal(dialog.open,false);
});

test('load failures show a fallback message and selecting another photo clears it',()=>{
 const {gallery,dialog}=fixture();gallery.open(photos);
 dialog.nodes.image.emit('error');assert.equal(dialog.nodes.error.hidden,false);
 gallery.next();assert.equal(dialog.nodes.error.hidden,true);
});

test('destroy closes and removes listeners, without reopening or changing focus later',()=>{
 const {gallery,dialog,doc,opener}=fixture();gallery.open(photos);gallery.destroy();
 assert.equal(doc.activeElement,opener);assert.equal(gallery.open(photos),false);
 assert.deepEqual(gallery.getState(),{isOpen:false,index:0,count:0});
 assert.equal(dialog.emit('keydown',{key:'ArrowRight'}).defaultPrevented,false);
 assert.ok([...dialog.events.values()].every(listeners=>listeners.size===0));
});

test('property and list photos are indexed in-page buttons, with property id on covers',()=>{
 const html=renderPropertyGallery(['http://bad',...photos],'Piso <nombre>',esc);
 assert.equal((html.match(/data-action="open-gallery"/g)||[]).length,3);
 assert.ok(html.includes('data-photo-index="2"'));assert.ok(html.includes('Piso &lt;nombre&gt;'));
 assert.ok(!/<a\b|target=|javascript:|http:\/\//.test(html));
 const listing=renderHousingList([{id:'home-1',name:'Casa',images:photos,listingDetails:{}}],{calculateScenario:()=>({budget:{},familyLoan:{},mortgage:{}}),euro:()=>'',esc,selected:new Set(),cloudConnected:false});
 assert.match(listing,/class="housing-cover-button" data-action="open-gallery" data-id="home-1" data-photo-index="0"/);
 assert.ok(!listing.includes('target="_blank"'));
 assert.ok(listing.includes('Ver 3 fotos de Casa'));
});
