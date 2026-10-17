const DESTINATIONS = Object.freeze([
  {id:'sant-joan',label:'Sant Joan Despí · estación de tren',destination:'Estació de Rodalies Sant Joan Despí, Barcelona',destinationConfirmed:true},
  {id:'elisava',label:'Elisava · Barcelona',destination:'Elisava, La Rambla 30-32, Barcelona',destinationConfirmed:true},
  {id:'gran-via',label:'Leonardo Royal Barcelona Fira',destination:'Leonardo Royal Hotel Barcelona Fira, Carrer dels Alts Forns 40, Barcelona',destinationConfirmed:true},
]);
const TEXT_LIMITS={label:100,destination:300,route:1500,notes:1800,schedule:300,sourceUrl:1200,sourceUrlSecondary:1200,checkedAt:40};
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
    const trip={...base,status:'pending',distanceKm:null,minutesMin:null,minutesMax:null,changes:null,mainLegMinutesMin:null,mainLegMinutesMax:null,route:'',notes:'',schedule:'',sourceUrl:'',checkedAt:''};
    for(const [key,max] of Object.entries(TEXT_LIMITS))if(typeof source[key]==='string')trip[key]=text(source[key],max);
    for(const key of NUMBER_KEYS)trip[key]=number(source[key]);
    trip.id=base.id;trip.destinationConfirmed=Object.hasOwn(source,'destinationConfirmed')?source.destinationConfirmed===true:base.destinationConfirmed;
    trip.status=['pending','reference','checked','no-service'].includes(source.status)?source.status:'pending';
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
  });
  return {valid:!errors.length,errors:[...new Set(errors)]};
}

export function createCommuteForProperty(city='',previous){
  const old=normalizeCommute(previous);
  return normalizeCommute({origin:city,originExact:false,trips:old.trips.map(t=>({id:t.id,label:t.label,destination:t.destination,destinationConfirmed:t.destinationConfirmed}))});
}

export function resetCommuteMeasurements(trip){
  return {...trip,status:'pending',distanceKm:null,minutesMin:null,minutesMax:null,changes:null,mainLegMinutesMin:null,mainLegMinutesMax:null,route:'',notes:'La dirección ha cambiado. Consulta de nuevo el recorrido y el horario.',sourceUrl:'',sourceUrlSecondary:'',checkedAt:''};
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
export function needsListingEnrichment(s){return isNavasListing(s)&&s.housingPresentationVersion!==1;}

export function prepareHousingPresentation(input){
  const s=structuredClone(input);
  if(needsListingEnrichment(s)){
    const d=s.listingDetails||{};s.listingDetails={...d};
    for(const [key,value] of Object.entries({city:'Navàs',surfaceM2:75,beds:4,baths:1,reference:'W-049AOO'}))if(d[key]===null||d[key]===undefined||d[key]==='')s.listingDetails[key]=value;
    const existing=normalizeCommute(s.commute,s.listingDetails.city),emptyReference=existing.trips.every((t,i)=>t.status==='pending'&&t.minutesMin===null&&t.minutesMax===null&&!t.route&&t.destination===DESTINATIONS[i].destination)&&(!existing.origin||existing.origin===s.listingDetails.city);
    if(!s.commute||emptyReference){
      s.commute=normalizeCommute({},'Estación de autobuses de Navàs, Barcelona, España');
      for(const t of s.commute.trips){
        t.status='reference';t.checkedAt='2026-10-17';t.sourceUrl='https://territori.gencat.cat/ca/serveis/visors-cartografia/bases-cartografiques/infraestructures-mobilitat/autobusos-interurbans/';
        t.schedule='Ejemplos de GTFS oficial para el lunes 19/10/2026; comprobar el día y la hora de llegada.';
        t.notes='El anuncio no publica la dirección exacta. Los minutos indicados corresponden sólo al autobús interurbano: faltan acceso a la parada, espera y último tramo. La distancia completa y el tiempo puerta a puerta están pendientes.';
      }
      Object.assign(s.commute.trips[0],{mainLegMinutesMin:76,mainLegMinutesMax:86,route:'Referencia: L0225 Navàs → Gran Via/Balmes (76–86 min en las expediciones consultadas). Completar a pie hasta Plaça de Catalunya y tomar R4 hacia Martorell / Vilafranca / Sant Vicenç de Calders hasta Sant Joan Despí. Evitar los trenes que terminan en L’Hospitalet. Faltan espera, conexión y tiempo de tren.',sourceUrlSecondary:'https://rodalies.gencat.cat/web/.content/02_Horaris/horaris/R4.pdf',notes:s.commute.trips[0].notes+' El destino confirmado es la estación de tren de Sant Joan Despí, no la parada de tranvía Bon Viatge.'});
      Object.assign(s.commute.trips[1],{mainLegMinutesMin:76,mainLegMinutesMax:86,route:'Referencia: L0225 Navàs → Gran Via/Balmes (05:50–07:06 u 08:00–09:16: 76 min; 06:04–07:30: 86 min). Completar hacia Catalunya y metro L3 hasta Drassanes, más caminata a Elisava, La Rambla 30–32. Consultar la conexión para el horario concreto.',sourceUrlSecondary:'https://www.elisava.net/conocenos/',notes:s.commute.trips[1].notes+' La sede de Elisava se ha comprobado en su web oficial.'});
      Object.assign(s.commute.trips[2],{mainLegMinutesMin:62,mainLegMinutesMax:62,route:'Referencia: L0225 Navàs 06:04 → Zona Universitària 07:06. Después, L9 Sud hasta Torrassa y L10 Sud hasta Foc. La web del hotel indica unos 500 m / 6 min a pie desde Foc. Faltan tiempos de metro, esperas y conexión.',sourceUrlSecondary:'https://www.leonardo-hotels.es/barcelona/leonardo-royal-hotel-barcelona-fira/faq',notes:s.commute.trips[2].notes+' Hotel confirmado: Leonardo Royal Barcelona Fira, Carrer dels Alts Forns 40. Gran Via 2 queda como referencia de zona.'});
    }
    s.housingPresentationVersion=1;
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

export function renderPropertyFacts(s,{esc}){
  const d=s.listingDetails||{};
  const facts=[[d.beds,Number(d.beds)===1?'habitación':'habitaciones'],[d.baths,Number(d.baths)===1?'baño':'baños'],[d.surfaceM2,'m²']];
  return `<div class="property-facts" aria-label="Características de la vivienda">${facts.map(([v,label])=>`<span><strong>${v!==null&&v!==undefined&&v!==''?esc(v):'—'}</strong> ${label}</span>`).join('')}</div>${isNavasListing(s)&&Number(d.beds)===4?'<p class="fine-print">La ficha anuncia 4 habitaciones, pero la descripción menciona 3. Confirmadlo en la visita.</p>':''}<button class="card-link" data-view="trayectos">Ver trayectos en transporte público →</button>`;
}

export function renderCommutes(s,{esc,field,select,check,section,notice}){
  const c=normalizeCommute(s.commute,s.listingDetails?.city||'');
  const intro=section('Desde la vivienda hasta vuestros destinos','Distancia, duración y conexiones en transporte público. Se guardan por vivienda.',`<div class="form-grid">${field('Dirección o parada de origen','commute.origin',{type:'text',suffix:'',hint:'Para un cálculo puerta a puerta, introduce la dirección exacta de la vivienda.'})}<div>${check('El origen es la dirección exacta de la vivienda','commute.originExact')}</div></div>${notice('Los horarios dependen del día, la hora, los transbordos y las caminatas. Un tramo de autobús no equivale al tiempo completo. Los kilómetros y minutos sin comprobar permanecen pendientes.','info')}`);
  const cards=c.trips.map((t,i)=>{
    const p=`commute.trips.${i}`,link=buildTransitLink(c.origin,t.destination),partial=t.minutesMin===null&&t.minutesMax===null&&(t.mainLegMinutesMin!==null||t.mainLegMinutesMax!==null);
    return `<article class="card commute-card"><div class="card-head"><div><span class="mini-label">TRANSPORTE PÚBLICO</span><h2>${esc(t.label)}</h2><p>${esc(t.destination||'Destino pendiente')}</p></div><span class="pill">${t.status==='checked'?'RUTA ANOTADA':t.status==='no-service'?'SIN SERVICIO ANOTADO':t.status==='reference'?'REFERENCIA PROVISIONAL':'POR COMPROBAR'}</span></div><div class="commute-metrics"><div><small>Tiempo total · un trayecto</small><strong>${esc(formatTravelTime(t.minutesMin,t.minutesMax))}</strong></div><div><small>Distancia del recorrido</small><strong>${t.distanceKm===null?'Pendiente':esc(new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(t.distanceKm))+' km'}</strong></div><div><small>Transbordos</small><strong>${t.changes===null?'Pendiente':esc(t.changes)}</strong></div></div>
    ${partial?notice(`<strong>Sólo el tramo de autobús: ${esc(formatTravelTime(t.mainLegMinutesMin,t.mainLegMinutesMax))}.</strong> ${t.mainLegMinutesMin>=60?'Ya alcanza o supera una hora, antes de completar el resto del viaje.':''} No es el total puerta a puerta.`):''}
    ${t.route?`<p class="commute-route">${esc(t.route)}</p>`:''}${t.notes?`<p class="fine-print">${esc(t.notes)}</p>`:''}${t.schedule?`<p class="fine-print">${esc(t.schedule)}</p>`:''}${!c.originExact||!t.destinationConfirmed?'<p class="fine-print"><strong>Direcciones de referencia:</strong> falta confirmar el origen exacto o el destino final.</p>':''}
    <div class="inline-actions">${link?`<a class="button primary" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Consultar ruta actual ↗</a>`:''}${t.sourceUrl?`<a class="card-link" href="${esc(t.sourceUrl)}" target="_blank" rel="noopener noreferrer">Fuente consultada${t.checkedAt?' · '+esc(t.checkedAt):''} ↗</a>`:''}${t.sourceUrlSecondary?`<a class="card-link" href="${esc(t.sourceUrlSecondary)}" target="_blank" rel="noopener noreferrer">Referencia del destino / conexión ↗</a>`:''}</div>
    <details class="section-gap"><summary>Editar destino, distancia y tiempo</summary><div class="form-grid section-gap">${field('Nombre del destino',p+'.label',{type:'text',suffix:''})}${field('Dirección de destino',p+'.destination',{type:'text',suffix:''})}${field('Distancia del recorrido',p+'.distanceKm',{suffix:'km',nullable:true})}${field('Duración total mínima',p+'.minutesMin',{suffix:'minutos',nullable:true,step:1})}${field('Duración total máxima',p+'.minutesMax',{suffix:'minutos',nullable:true,step:1})}${field('Número de transbordos',p+'.changes',{suffix:'',nullable:true,step:1})}${field('Día y franja horaria consultados',p+'.schedule',{type:'text',suffix:''})}${select('Estado del trayecto',p+'.status',[['pending','Por comprobar'],['reference','Referencia orientativa'],['checked','Ruta anotada manualmente'],['no-service','No encuentro servicio para ese horario']])}${field('Recorrido y conexiones',p+'.route',{type:'text',suffix:''})}${field('Observaciones',p+'.notes',{type:'text',suffix:''})}${field('Enlace de la fuente',p+'.sourceUrl',{type:'url',suffix:''})}<div>${check('He confirmado la dirección de destino',p+'.destinationConfirmed')}</div></div></details></article>`;
  }).join('');
  return intro+`<div class="commute-grid">${cards}</div>`;
}
