import {safeImageUrl} from './housing.mjs?v=12';

let nextGalleryId=0;

/**
 * A persistent, in-page photo viewer. Native <dialog> supplies modal focus
 * handling and Escape; no navigation, requests or scenario writes occur here.
 * open() returns false for an empty/invalid image list. Image indexes refer to
 * the HTTPS-only list (at most eight), as in renderPropertyGallery.
 */
export function initGallery(dialog){
 if(!dialog||typeof dialog.addEventListener!=='function')throw new TypeError('Se necesita un diálogo para las fotos.');
 const doc=dialog.ownerDocument;
 let nodes=null,images=[],name='Vivienda',index=0,previousFocus=null,destroyed=false;
 const listeners=[];
 const listen=(node,type,handler)=>{node.addEventListener(type,handler);listeners.push([node,type,handler]);};
 const getState=()=>({isOpen:Boolean(dialog.open),index,count:images.length});
 const close=()=>{if(dialog.open&&typeof dialog.close==='function')dialog.close();};
 const restoreFocus=()=>{
  const target=previousFocus;previousFocus=null;
  if(target?.isConnected!==false&&typeof target?.focus==='function'&&doc?.activeElement!==target)target.focus({preventScroll:true});
 };
 function ensureContent(){
  if(nodes)return true;
  // Delaying DOM creation also permits lightweight app boot/test environments.
  if(typeof dialog.querySelector!=='function'||!doc?.createElement)return false;
  const titleId=`property-photo-title-${++nextGalleryId}`;
  dialog.classList.add('photo-dialog');
  dialog.setAttribute('aria-labelledby',titleId);
  dialog.innerHTML=`<div class="photo-viewer"><header class="photo-toolbar"><div><h2 id="${titleId}" data-gallery-title></h2><span class="photo-counter" data-gallery-counter aria-live="polite" aria-atomic="true"></span></div><button type="button" class="photo-close" data-gallery-close aria-label="Cerrar fotos" autofocus>×</button></header><div class="photo-stage"><button type="button" class="photo-nav photo-previous" data-gallery-previous aria-label="Foto anterior">‹</button><img class="photo-main" data-gallery-image alt="" referrerpolicy="no-referrer"><p class="photo-error" data-gallery-error role="status" hidden>No se ha podido cargar esta foto. Puedes probar con otra.</p><button type="button" class="photo-nav photo-next" data-gallery-next aria-label="Foto siguiente">›</button></div><div class="photo-thumbnails" data-gallery-thumbnails role="group" aria-label="Elegir foto"></div></div>`;
  nodes={};
  for(const key of ['title','counter','close','previous','next','image','error','thumbnails']){
   nodes[key]=dialog.querySelector(`[data-gallery-${key}]`);
   if(!nodes[key]){nodes=null;return false;}
  }
  listen(nodes.close,'click',close);
  listen(nodes.previous,'click',previous);
  listen(nodes.next,'click',next);
  listen(nodes.image,'error',()=>{nodes.error.hidden=false;});
  return true;
 }
 function render(){
  if(!nodes||!images.length)return;
  nodes.title.textContent=name;
  nodes.counter.textContent=`${index+1} / ${images.length}`;
  nodes.error.hidden=true;
  nodes.image.src=images[index];
  nodes.image.alt=`${name} · foto ${index+1} de ${images.length}`;
  nodes.previous.disabled=nodes.next.disabled=images.length<2;
  nodes.thumbnails.hidden=images.length<2;
  Array.from(nodes.thumbnails.children).forEach((button,i)=>{
   button.setAttribute('aria-pressed',String(i===index));
   button.classList.toggle('is-current',i===index);
  });
 }
 function goTo(value){
  if(destroyed||!images.length||!Number.isInteger(value))return false;
  index=((value%images.length)+images.length)%images.length;
  render();
  return true;
 }
 function next(){return goTo(index+1);}
 function previous(){return goTo(index-1);}
 function open(input,{name:givenName='Vivienda',index:givenIndex=0}={}){
  if(destroyed)return false;
  const valid=Array.isArray(input)?input.map(safeImageUrl).filter(Boolean).slice(0,8):[];
  if(!valid.length||!ensureContent()||typeof dialog.showModal!=='function')return false;
  images=valid;
  name=typeof givenName==='string'&&givenName.trim()?givenName.trim().slice(0,200):'Vivienda';
  index=Number.isInteger(givenIndex)?Math.max(0,Math.min(givenIndex,images.length-1)):0;
  nodes.thumbnails.replaceChildren();
  images.forEach((url,i)=>{
   const button=doc.createElement('button');
   button.type='button';button.className='photo-thumbnail';
   button.setAttribute('aria-label',`Ver foto ${i+1} de ${images.length}`);
   button.dataset.galleryIndex=String(i);
   const image=doc.createElement('img');
   image.src=url;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';
   button.appendChild(image);
   nodes.thumbnails.appendChild(button);
  });
  render();
  if(!dialog.open){
   previousFocus=doc.activeElement;
   dialog.showModal();
  }
  nodes.close.focus({preventScroll:true});
  return true;
 }
 listen(dialog,'close',restoreFocus);
 listen(dialog,'keydown',event=>{
  if(!dialog.open||event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
   event.preventDefault();
   if(images.length>1)(event.key==='ArrowRight'?next:previous)();
  }
  // Escape is intentionally left to the native dialog cancel/close behavior.
 });
 listen(dialog,'click',event=>{
  const thumb=event.target?.closest?.('[data-gallery-index]');
  if(thumb&&nodes?.thumbnails.contains(thumb)){goTo(Number(thumb.dataset.galleryIndex));return;}
  if(event.target!==dialog||!dialog.open)return;
  const rect=dialog.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();
 });
 function destroy(){
  if(destroyed)return;
  close();restoreFocus();destroyed=true;
  for(const [node,type,handler]of listeners)node.removeEventListener(type,handler);
  images=[];
 }
 return {open,close,next,previous,goTo,destroy,getState};
}
