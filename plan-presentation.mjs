// Tab-local presentation state only: no budget values or access credentials.
const prefix='casa-ideal.plan-presentation.v1:';
const month=value=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value||'')?value:null;
const position=value=>Number.isFinite(value)?Math.max(0,Math.min(value,1e7)):0;
function normalize(value){
 const preferences=value?.preferences||{},viewport=value?.viewport;
 return {
  preferences:{horizon:preferences.horizon===144?144:24,selectedMonth:month(preferences.selectedMonth),mode:['income','expenses','remaining'].includes(preferences.mode)?preferences.mode:'expenses',expandedMonths:[...new Set((Array.isArray(preferences.expandedMonths)?preferences.expandedMonths:[]).map(month).filter(Boolean))].slice(0,144)},
  viewport:viewport?{top:position(viewport.top),left:position(viewport.left),pageX:position(viewport.pageX),pageY:position(viewport.pageY),anchor:month(viewport.anchor),offset:Number.isFinite(viewport.offset)?viewport.offset:0}:null
 };
}

export function createPlanPresentation({window,document,storage}){
 const entries=new Map();let key=null,container=null,restoring=false,generation=0;
 const calendar=()=>document.querySelector('.family-plan-calendar .table-wrap');
 function entry(id){
  if(!entries.has(id)){let saved;try{saved=JSON.parse(storage?.getItem(prefix+id));}catch{}entries.set(id,normalize(saved));}
  return entries.get(id);
 }
 function save(){if(!key)return;try{storage?.setItem(prefix+key,JSON.stringify(entry(key)));}catch{/* Still works in memory when browser storage is unavailable. */}}
 function capture(){
  if(!key||!container||restoring||calendar()!==container)return;
  const viewport={top:position(container.scrollTop),left:position(container.scrollLeft),pageX:position(window.scrollX),pageY:position(window.scrollY),anchor:null,offset:0};
  const bounds=container.getBoundingClientRect?.();
  if(bounds){
   const header=container.querySelector('thead')?.getBoundingClientRect?.().height||0;
   for(const button of container.querySelectorAll('[data-action="toggle-plan-month"]')){
    const row=button.closest('tr'),rect=row.getBoundingClientRect();
    if(rect.bottom>bounds.top+header&&rect.top<bounds.bottom){viewport.anchor=month(button.dataset.id);viewport.offset=rect.top-bounds.top;break;}
   }
  }
  entry(key).viewport=viewport;save();
 }
 function beforeRender(){capture();generation++;container=null;restoring=false;}
 function restore(id,{page=true}={}){
  key=id;container=calendar();if(!container)return;
  container.addEventListener?.('scroll',capture,{passive:true});
  const viewport=entry(key).viewport;
  if(!viewport){capture();return;}
  const target=container,revision=++generation;restoring=true;
  function apply(){
   if(revision!==generation||container!==target)return;
   target.scrollTop=viewport.top;target.scrollLeft=viewport.left;
   if(viewport.anchor&&target.getBoundingClientRect){
    const row=target.querySelector('[data-action="toggle-plan-month"][data-id="'+viewport.anchor+'"]')?.closest('tr');
    if(row)target.scrollTop+=row.getBoundingClientRect().top-target.getBoundingClientRect().top-viewport.offset;
   }
   if(page)window.scrollTo?.({left:viewport.pageX,top:viewport.pageY,behavior:'instant'});
  }
  apply();
  // Layout and browser focus/anchoring can settle after replacing the table.
  // A bounded second pass handles this without fighting subsequent user scroll.
  if(window.requestAnimationFrame)window.requestAnimationFrame(()=>{
   if(revision!==generation)return;apply();restoring=false;
  });else restoring=false;
 }
 window.addEventListener?.('scroll',capture,{passive:true});
 window.addEventListener?.('pagehide',capture);
 for(const event of ['wheel','touchstart','keydown','pointerdown'])window.addEventListener?.(event,()=>{if(restoring){generation++;restoring=false;}},{passive:true});
 return {
  preferences(id){return entry(id).preferences;},
  setPreferences(id,preferences){const old=entry(id);entries.set(id,normalize({...old,preferences}));try{storage?.setItem(prefix+id,JSON.stringify(entry(id)));}catch{}},
  capture,beforeRender,restore
 };
}
