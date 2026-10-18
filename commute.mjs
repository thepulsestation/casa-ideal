const DESTINATIONS = Object.freeze([
  {id:'sant-joan',label:'Sant Joan Despí · estación de tren',destination:'Estació de Rodalies Sant Joan Despí, Barcelona',destinationConfirmed:true},
  {id:'elisava',label:'Elisava · Barcelona',destination:'Elisava, La Rambla 30-32, Barcelona',destinationConfirmed:true},
  {id:'gran-via',label:'Leonardo Royal Barcelona Fira',destination:'Leonardo Royal Hotel Barcelona Fira, Carrer dels Alts Forns 40, Barcelona',destinationConfirmed:true},
]);
const TEXT_LIMITS={label:100,destination:300,route:1500,notes:1800,schedule:300,departure:5,sourceUrl:1200,sourceUrlSecondary:1200,checkedAt:40};
const NUMBER_KEYS=['distanceKm','minutesMin','minutesMax','changes','mainLegMinutesMin','mainLegMinutesMax'];
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=300)=>typeof v==='string'?v.trim().slice(0,max):'';
const number=v=>v!==null&&v!==undefined&&v!==''&&['number','string'].includes(typeof v)&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
function safeSource(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}

export function normalizeCommute(raw={},city=''){
  const input=record(raw)?raw:{};
  const rows=Array.isArray(input.trips)?input.trips:[];
  return {origin:typeof input.origin==='string'?text(input.origin):text(city),originExact:input.originExact===true,trips:DESTINATIONS.map((base,i)=>{
    const source=rows.find(t=>record(t)&&t.id===base.id)||(record(rows[i])?rows[i]:{});
    const trip={...base,status:'pending',distanceKm:null,minutesMin:null,minutesMax:null,changes:null,mainLegMinutesMin:null,mainLegMinutesMax:null,minutesEstimated:false,departure:'08:00',route:'',notes:'',schedule:'',sourceUrl:'',sourceUrlSecondary:'',checkedAt:''};
    for(const [key,max] of Object.entries(TEXT_LIMITS))if(typeof source[key]==='string')trip[key]=text(source[key],max);
    for(const key of NUMBER_KEYS)trip[key]=number(source[key]);
    trip.id=base.id;trip.destinationConfirmed=Object.hasOwn(source,'destinationConfirmed')?source.destinationConfirmed===true:base.destinationConfirmed;
    trip.status=['pending','reference','checked','no-service'].includes(source.status)?source.status:'pending';
    trip.minutesEstimated=source.minutesEstimated===true;
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(trip.departure))trip.departure='08:00';
    trip.sourceUrl=safeSource(trip.sourceUrl);trip.sourceUrlSecondary=safeSource(trip.sourceUrlSecondary);
    return trip;
  })};
}

export function validateCommute(raw){
  const errors=[];
  if(!record(raw))return {valid:false,errors:['Los trayectos deben ser un objeto.']};
  if(typeof raw.origin!=='string'||raw.origin.length>300)errors.push('El origen debe ser texto de hasta 300 caracteres.');
  if(typeof raw.originExact!=='boolean')errors.push('Indica si el origen es una dirección exacta.');
  if(!Array.isArray(raw.trips)||raw.trips.length!==3)return {valid:false,errors:[...errors,'Deben conservarse los tres trayectos.']};
  raw.trips.forEach((trip,i)=>{
    if(!record(trip)||trip.id!==DESTINATIONS[i].id){errors.push('Los destinos deben conservar su identificador y orden.');return;}
    for(const [key,max] of Object.entries(TEXT_LIMITS))if(trip[key]!==undefined&&(typeof trip[key]!=='string'||trip[key].length>max))errors.push(`Revisa el texto del trayecto ${i+1}.`);
    for(const key of NUMBER_KEYS)if(trip[key]!==null&&trip[key]!==undefined&&(number(trip[key])===null||(['changes','minutesMin','minutesMax','mainLegMinutesMin','mainLegMinutesMax'].includes(key)&&!Number.isInteger(Number(trip[key])))))errors.push(`Las distancias, minutos y transbordos del trayecto ${i+1} deben ser no negativos.`);
    for(const [low,high] of [['minutesMin','minutesMax'],['mainLegMinutesMin','mainLegMinutesMax']])if(trip[low]!=null&&trip[high]!=null&&Number(trip[low])>Number(trip[high]))errors.push(`El tiempo mínimo del trayecto ${i+1} no puede superar al máximo.`);
    if(trip.sourceUrl&&!safeSource(trip.sourceUrl)||trip.sourceUrlSecondary&&!safeSource(trip.sourceUrlSecondary))errors.push('La fuente del trayecto debe ser una URL HTTPS sin credenciales.');
    if(!['pending','reference','checked','no-service'].includes(trip.status))errors.push('Revisa el estado de comprobación del trayecto.');
    if(trip.departure!==undefined&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(trip.departure))errors.push('La hora de salida debe tener el formato HH:MM.');
    if(trip.minutesEstimated!==undefined&&typeof trip.minutesEstimated!=='boolean')errors.push('Indica si la duración es una estimación.');
  });
  return {valid:!errors.length,errors:[...new Set(errors)]};
}

export function createCommuteForProperty(city='',previous){
  const old=normalizeCommute(previous);
  return normalizeCommute({origin:city,originExact:false,trips:old.trips.map(t=>({id:t.id,label:t.label,destination:t.destination,destinationConfirmed:t.destinationConfirmed}))});
}

export function resetCommuteMeasurements(trip){
  return {...trip,status:'pending',distanceKm:null,minutesMin:null,minutesMax:null,changes:null,mainLegMinutesMin:null,mainLegMinutesMax:null,minutesEstimated:false,route:'',notes:'La dirección ha cambiado. Consulta de nuevo el recorrido y el horario.',sourceUrl:'',sourceUrlSecondary:'',checkedAt:''};
}

export function buildTransitLink(origin,destination){
  if(!text(origin)||!text(destination))return null;
  const u=new URL('https://www.google.com/maps/dir/');
  u.search=new URLSearchParams({api:'1',origin:text(origin),destination:text(destination),travelmode:'transit'}).toString();
  return u.href;
}

function isNavasListing(s){
  try{const u=new URL(s.url);return (u.hostname==='hub.engelvoelkers.com'&&u.pathname.replace(/\/$/,'')==='/es/exposee/f5b1dc73-bc4a-4113-af4b-04d3686692dd')||(u.hostname==='www.engelvoelkers.com'&&u.pathname.endsWith('/22c18d07-0815-5e67-93b6-c6f47bd9301c'));}catch{return false;}
}
export function needsListingEnrichment(s){return isNavasListing(s)&&(Number(s.housingPresentationVersion)||0)<2;}

const NAVAS_STOP='Estación de autobuses de Navàs, Barcelona, España';
const BUS_SOURCE='https://territori.gencat.cat/ca/serveis/visors-cartografia/bases-cartografiques/infraestructures-mobilitat/autobusos-interurbans/';
const OLD_NOTES='El anuncio no publica la dirección exacta. Los minutos indicados corresponden sólo al autobús interurbano: faltan acceso a la parada, espera y último tramo. La distancia completa y el tiempo puerta a puerta están pendientes.';
const OLD_ROUTES=[
  ['Referencia: L0225 Navàs → Gran Via/Balmes (76–86 min en las expediciones consultadas). Completar a pie hasta Plaça de Catalunya y consultar Rodalies hacia la estación de Sant Joan Despí. Faltan espera, conexión y tiempo de tren.','Referencia: L0225 Navàs → Gran Via/Balmes (76–86 min en las expediciones consultadas). Completar a pie hasta Plaça de Catalunya y tomar R4 hacia Martorell / Vilafranca / Sant Vicenç de Calders hasta Sant Joan Despí. Evitar los trenes que terminan en L’Hospitalet. Faltan espera, conexión y tiempo de tren.'],
  ['Referencia: L0225 Navàs → Gran Via/Balmes (05:50–07:06 u 08:00–09:16: 76 min; 06:04–07:30: 86 min). Completar hacia Catalunya y metro L3 hasta Drassanes, más caminata a Elisava, La Rambla 30–32. Consultar la conexión para el horario concreto.'],
  ['Referencia: L0225 Navàs 06:04 → Zona Universitària 07:06. Después, L9 Sud hasta Torrassa y L10 Sud hasta Foc. La web del hotel indica unos 500 m / 6 min a pie desde Foc. Faltan tiempos de metro, esperas y conexión.'],
];
const OLD_SUFFIXES=[' El destino confirmado es la estación de tren de Sant Joan Despí, no la parada de tranvía Bon Viatge.',' La sede de Elisava se ha comprobado en su web oficial.',' Hotel confirmado: Leonardo Royal Barcelona Fira, Carrer dels Alts Forns 40. Gran Via 2 queda como referencia de zona.'];
function untouchedLegacyReference(t,i){
  return t.status==='reference'&&t.departure==='08:00'&&t.minutesMin===null&&t.minutesMax===null&&t.distanceKm===null&&t.changes===null&&t.destination===DESTINATIONS[i].destination&&t.label===DESTINATIONS[i].label&&OLD_ROUTES[i].includes(t.route)&&t.notes===OLD_NOTES+OLD_SUFFIXES[i]&&t.sourceUrl===BUS_SOURCE&&t.checkedAt==='2026-10-17'&&t.mainLegMinutesMin===(i===2?62:76)&&t.mainLegMinutesMax===(i===2?62:86);
}

function navasMorningEstimate(i){
  const common={status:'reference',minutesEstimated:true,departure:'08:00',mainLegMinutesMin:76,mainLegMinutesMax:76,checkedAt:'2026-10-17',sourceUrl:BUS_SOURCE,schedule:'Salida 08:00 desde la parada de Navàs · laborable. Base de horarios: lunes 19/10/2026.',notes:'Estimación desde la parada de referencia hasta el destino, con caminatas finales, enlaces y esperas. Llegar previamente a la parada no está incluido; no es un tiempo exacto desde el domicilio ni información en tiempo real.'};
  return [
    {...common,minutesMin:110,minutesMax:130,changes:1,route:'Bus L0225 08:00 → Gran Via/Balmes 09:16. A pie a Plaça de Catalunya; R4 hacia Martorell, Vilafranca o Sant Vicenç de Calders → Sant Joan Despí. Referencia de tren: 09:37–09:56 (19 min). El rango incluye acceso a la estación, espera y margen de conexión.',sourceUrlSecondary:'https://rodalies.gencat.cat/web/.content/02_Horaris/horaris/R4.pdf'},
    {...common,minutesMin:100,minutesMax:120,changes:1,route:'Bus L0225 08:00 → Gran Via/Balmes 09:16. A pie a Catalunya, metro L3 → Drassanes y caminata a Elisava, La Rambla 30–32. Al bus de 76 min se añaden aproximadamente 24–44 min para caminatas, metro, esperas y margen; es una estimación, no un horario enlazado garantizado.',sourceUrlSecondary:'https://www.elisava.net/conocenos/'},
    {...common,minutesMin:120,minutesMax:145,changes:2,route:'Bus L0225 08:00 → Gran Via/Balmes 09:16. A pie a Universitat, L1 → Torrassa y L10 Sud → Foc; unos 500 m / 6 min a pie al Leonardo Royal Barcelona Fira. Al bus de 76 min se añaden aproximadamente 44–69 min para enlaces, metro, caminatas y esperas. El bus de las 08:00 no usa la parada de Zona Universitària.',sourceUrlSecondary:'https://www.leonardo-hotels.es/barcelona/leonardo-royal-hotel-barcelona-fira/faq'},
  ][i];
}

export function prepareHousingPresentation(input){
  const s=structuredClone(input);
  if(needsListingEnrichment(s)){
    const d=s.listingDetails||{};s.listingDetails={...d};
    for(const [key,value] of Object.entries({city:'Navàs',surfaceM2:75,beds:4,baths:1,reference:'W-049AOO'}))if(d[key]===null||d[key]===undefined||d[key]==='')s.listingDetails[key]=value;
    const existing=normalizeCommute(s.commute,s.listingDetails.city);
    const defaultOrigin=!existing.origin||existing.origin===s.listingDetails.city||existing.origin===NAVAS_STOP;
    const emptyReference=!s.housingPresentationVersion&&existing.trips.every((t,i)=>t.status==='pending'&&t.minutesMin===null&&t.minutesMax===null&&t.mainLegMinutesMin===null&&t.mainLegMinutesMax===null&&!t.route&&!t.notes&&t.destination===DESTINATIONS[i].destination);
    if(!existing.originExact&&defaultOrigin){
      let added=false;
      existing.trips=existing.trips.map((t,i)=>{
        if(!s.commute||emptyReference||untouchedLegacyReference(t,i)){added=true;return {...t,...navasMorningEstimate(i)};}
        return t;
      });
      if(added)existing.origin=NAVAS_STOP;
    }
    s.commute=existing;
    s.housingPresentationVersion=2;
  }
  s.commute=normalizeCommute(s.commute,s.listingDetails?.city||'');
  return s;
}

const minutes=v=>v>=60?`${Math.floor(v/60)} h${v%60?' '+v%60+' min':''}`:`${v} min`;
export function formatTravelTime(min,max){
  const lo=number(min),hi=number(max);
  if(lo===null&&hi===null)return 'Por comprobar';
  if(lo===null)return 'Hasta '+minutes(hi);
  if(hi===null||lo===hi)return minutes(lo);
  return minutes(lo)+' – '+minutes(hi);
}

export function getCommuteIndicators(input){
  const s=prepareHousingPresentation(input);
  const c=s.commute;
  return c.trips.map(t=>{
    const lo=t.status==='no-service'?null:t.minutesMin,hi=t.status==='no-service'?null:t.minutesMax;
    const hasTotal=lo!==null||hi!==null;
    const estimated=hasTotal&&(t.minutesEstimated||t.status!=='checked');
    return {id:t.id,label:t.label,destination:t.destination,totalMinutesMin:lo,totalMinutesMax:hi,estimated,
      source:t.sourceUrl||null,sourceSecondary:t.sourceUrlSecondary||null,mapsUrl:buildTransitLink(c.origin,t.destination),departure:t.departure,targetMinutes:60,
      exceedsTarget:lo!==null&&lo>60?true:hi!==null&&hi<=60?false:null,
      timeLabel:t.status==='no-service'?'Sin servicio anotado':(estimated?'≈ ':'')+formatTravelTime(lo,hi)};
  });
}

export function renderPropertyFacts(s,{esc}){
  const d=s.listingDetails||{};
  const facts=[[d.beds,Number(d.beds)===1?'habitación':'habitaciones'],[d.baths,Number(d.baths)===1?'baño':'baños'],[d.surfaceM2,'m²']];
  return `<div class="property-facts" aria-label="Características de la vivienda">${facts.map(([v,label])=>`<span><strong>${v!==null&&v!==undefined&&v!==''?esc(v):'—'}</strong> ${label}</span>`).join('')}</div>${isNavasListing(s)&&Number(d.beds)===4?'<p class="fine-print">Habitaciones por confirmar: ficha 4; descripción 3.</p>':''}`;
}

export function renderCommutes(s,{esc,field,select,check,section,notice}){
  const prepared=prepareHousingPresentation(s),c=prepared.commute,indicators=getCommuteIndicators(prepared);
  const intro=section('Editar los trayectos de esta vivienda','Anota aquí los minutos hasta vuestros tres destinos; se guardan con esta vivienda.',`<div class="form-grid">${field('Origen: vivienda, parada o centro del municipio','commute.origin',{type:'text',suffix:'',hint:'Si no conoces la dirección exacta, usa una parada o el centro del municipio. Cambiar el origen borra los tiempos anteriores para volver a comprobarlos.'})}<div>${check('El origen es la dirección exacta de la vivienda','commute.originExact')}</div></div><p>Referencia habitual: día laborable, salida a las 08:00. La duración total debe incluir caminatas, esperas y transbordos desde el origen indicado. ${c.originExact?'Si el origen es la vivienda, incluye también el camino de casa a la estación o parada.':'El origen es una referencia del municipio. Llegar previamente a la parada no está incluido: el recorrido desde casa sigue pendiente.'}</p><p class="fine-print">Para consultar el recorrido desde casa, cambia el origen por su dirección y anota el nuevo total. No sumamos automáticamente un tramo de tren o autobús como si fuera el recorrido completo.</p>`);
  const cards=c.trips.map((t,i)=>{
    const p=`commute.trips.${i}`,indicator=indicators[i];
    return `<article class="card commute-card"><div class="mini-label">TRANSPORTE PÚBLICO · ${esc(t.departure)}</div><h2>${esc(t.label)}</h2><div class="budget-number">${esc(indicator.timeLabel)}</div><p>Tiempo total desde ${c.originExact?'casa':'el origen de referencia'} · un trayecto${indicator.estimated?' · orientativo':''}</p>${indicator.exceedsTarget===true?'<p class="fine-print">Supera la referencia de una hora.</p>':''}<div class="inline-actions">${indicator.mapsUrl?`<a class="button secondary" href="${esc(indicator.mapsUrl)}" target="_blank" rel="noopener noreferrer">Consultar trayecto en Google Maps ↗</a>`:''}</div>
    <div class="form-grid section-gap" aria-label="Editar duración del trayecto">${field('Duración total mínima desde el origen',p+'.minutesMin',{suffix:'minutos',nullable:true,step:1,hint:'Incluye acceso a la estación, esperas, enlaces y tramo final. Un dato vacío sigue por comprobar.'})}${field('Duración total máxima desde el origen',p+'.minutesMax',{suffix:'minutos',nullable:true,step:1})}${field('Hora de salida',p+'.departure',{type:'time',suffix:''})}${select('Estado del trayecto',p+'.status',[['pending','Por comprobar'],['reference','Estimación orientativa'],['checked','Duración anotada manualmente'],['no-service','Sin servicio para ese horario']])}<div>${check('La duración es una estimación',p+'.minutesEstimated')}</div></div>
    <details class="section-gap"><summary>Tren o autobús, recorrido y fuentes</summary>${t.route?`<p>${esc(t.route)}</p>`:''}${t.notes?`<p class="fine-print">${esc(t.notes)}</p>`:''}${t.schedule?`<p class="fine-print">${esc(t.schedule)}</p>`:''}<p class="fine-print">En Google Maps, selecciona el día laborable y la salida a las 08:00. El enlace abre transporte público; no fija esa hora automáticamente.</p><div class="inline-actions">${t.sourceUrl?`<a class="card-link" href="${esc(t.sourceUrl)}" target="_blank" rel="noopener noreferrer">Fuente principal del transporte ↗</a>`:''}${t.sourceUrlSecondary?`<a class="card-link" href="${esc(t.sourceUrlSecondary)}" target="_blank" rel="noopener noreferrer">Fuente de la conexión o destino ↗</a>`:''}</div><div class="form-grid section-gap">${field('Nombre del destino',p+'.label',{type:'text',suffix:''})}${field('Dirección de destino',p+'.destination',{type:'text',suffix:''})}${field('Solo tramo de tren o autobús: mínimo',p+'.mainLegMinutesMin',{suffix:'minutos',nullable:true,step:1,hint:'Dato de referencia. No sustituye ni se suma automáticamente al total de arriba.'})}${field('Solo tramo de tren o autobús: máximo',p+'.mainLegMinutesMax',{suffix:'minutos',nullable:true,step:1})}${field('Distancia del recorrido',p+'.distanceKm',{suffix:'km',nullable:true})}${field('Número de transbordos',p+'.changes',{suffix:'',nullable:true,step:1})}${field('Día y franja horaria consultados',p+'.schedule',{type:'text',suffix:''})}${field('Recorrido y conexiones',p+'.route',{type:'text',suffix:''})}${field('Observaciones',p+'.notes',{type:'text',suffix:''})}${field('Enlace de la fuente',p+'.sourceUrl',{type:'url',suffix:''})}<div>${check('He confirmado la dirección de destino',p+'.destinationConfirmed')}</div></div></details></article>`;
  }).join('');
  return intro+`<div class="commute-grid">${cards}</div>`;
}
