/** Named hypotheses live in the shared profile; the working draft stays local. */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
export function normalizeSavedSimulations(raw=[]){
 if(!Array.isArray(raw)||raw.length>30)throw Error('Se pueden guardar hasta 30 combinaciones.');
 const ids=new Set();
 return raw.map(item=>{
  if(!record(item)||!validId(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.trim().length>120||!record(item.settings))throw Error('Hay una combinación guardada con datos no válidos.');
  if(JSON.stringify(item.settings).length>65000)throw Error('La combinación supera el tamaño permitido.');
  ids.add(item.id);
  return {id:item.id,name:item.name.trim(),settings:structuredClone(item.settings),
   ...(item.createdAt?{createdAt:item.createdAt}:{}),...(item.updatedAt?{updatedAt:item.updatedAt}:{})};
 });
}
export function saveSimulationCombination(raw,settings,{id=null,name,now=new Date().toISOString(),createId=()=>crypto.randomUUID()}={}){
 const library=normalizeSavedSimulations(raw);
 if(typeof name!=='string'||!name.trim()||name.trim().length>120)throw Error('Pon un nombre de entre 1 y 120 caracteres a la combinación.');
 if(!record(settings)||settings._errors?.length)throw Error('Corrige los campos de la simulación antes de guardarla.');
 const previous=id?library.find(item=>item.id===id):null;
 if(id&&!previous)throw Error('Esta combinación ya no existe. Guárdala con otro nombre como una nueva combinación.');
 if(!previous&&library.length>=30)throw Error('Ya hay 30 combinaciones guardadas. Quita una antes de añadir otra.');
 const saved={id:previous?.id??createId(),name:name.trim(),settings:structuredClone(settings),createdAt:previous?.createdAt??now,updatedAt:now};
 return {saved,library:normalizeSavedSimulations([saved,...library.filter(item=>item.id!==saved.id)])};
}
export function deleteSimulationCombination(raw,id){
 return normalizeSavedSimulations(raw).filter(item=>item.id!==id);
}
