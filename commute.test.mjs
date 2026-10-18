import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCommute,validateCommute,createCommuteForProperty,resetCommuteMeasurements,buildTransitLink,prepareHousingPresentation,needsListingEnrichment,renderCommutes,renderPropertyFacts,formatTravelTime,getCommuteIndicators} from './commute.mjs';
import {normalizeScenario,calculateScenario} from './finance.mjs';
import {createHousingScenario,updateHousingDetails} from './housing.mjs';

const listing='https://hub.engelvoelkers.com/es/exposee/f5b1dc73-bc4a-4113-af4b-04d3686692dd';
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const helpers={esc,field:(label,path,options={})=>`<label>${label}<input data-field="${path}">${options.hint||''}</label>`,select:label=>label,check:label=>label,section:(title,subtitle,body)=>`<section><h2>${title}</h2><p>${subtitle}</p>${body}</section>`,notice:t=>`<p>${t}</p>`};

test('Navàs morning estimates include the complete trip from the reference stop and leave finances untouched',()=>{
 const before=normalizeScenario({id:'saved',name:'Piso',url:listing,purchasePrice:175000,budget:{foodMonthly:428,incomes:[{monthly:2000,payments:12}]}});
 const after=prepareHousingPresentation(before);
 assert.equal(after.id,'saved');assert.equal(after.listingDetails.beds,4);assert.equal(after.listingDetails.baths,1);assert.equal(after.listingDetails.surfaceM2,75);
 assert.deepEqual(after.budget,before.budget);assert.deepEqual(calculateScenario(after),calculateScenario(before));
 assert.equal(after.commute.originExact,false);assert.equal(after.commute.trips[0].destination,'Estació de Rodalies Sant Joan Despí, Barcelona');
 assert.ok(after.commute.trips[0].route.includes('R4'));assert.ok(after.commute.trips[2].destination.includes('Alts Forns 40'));
 assert.deepEqual(after.commute.trips.map(t=>[t.minutesMin,t.minutesMax]),[[110,130],[100,120],[120,145]]);
 for(const trip of after.commute.trips){assert.equal(trip.minutesEstimated,true);assert.equal(trip.departure,'08:00');assert.equal(trip.distanceKm,null);assert.equal(trip.mainLegMinutesMin,76);assert.ok(trip.minutesMin>trip.mainLegMinutesMin);assert.ok(trip.notes.includes('Llegar previamente a la parada no está incluido'));}
 assert.ok(!after.commute.trips[2].route.includes('L9 Sud'));assert.ok(after.commute.trips[2].route.includes('L1'));
 assert.equal(after.housingPresentationVersion,2);
 assert.equal(before.commute,undefined);
});

test('enrichment is limited to the exact public listing and respects later manual corrections',()=>{
 for(const url of ['https://example.com/'+listing,'https://hub.engelvoelkers.com/es/exposee/f5b1dc73-bc4a-4113-af4b-04d3686692dd-other','https://hub.engelvoelkers.com.evil.test/es/exposee/f5b1dc73-bc4a-4113-af4b-04d3686692dd'])assert.equal(needsListingEnrichment({url}),false);
 const s=prepareHousingPresentation({url:listing,listingDetails:{beds:3},purchasePrice:175000});s.commute.trips[2].minutesMin=123;s.commute.trips[2].route='Consulta manual';
 assert.deepEqual(prepareHousingPresentation(s),s);assert.equal(s.listingDetails.beds,3);
 const custom=normalizeCommute({},'Navàs');custom.trips[0].destination='Otro destino elegido';
 assert.equal(prepareHousingPresentation({url:listing,listingDetails:{city:'Navàs'},commute:custom}).commute.trips[0].destination,'Otro destino elegido');
});

test('a different home retains destination preferences but resets origin-specific measurements',()=>{
 const old=prepareHousingPresentation(normalizeScenario({name:'Piso de origen',url:listing,purchasePrice:175000}));old.commute.trips[1].minutesMin=125;old.commute.trips[1].minutesMax=135;old.commute.trips[1].destination='Elisava, dirección editada';
 const fresh=createHousingScenario(old,{name:'Otra casa',purchasePrice:210000,listingDetails:{city:'Otro municipio'}});
 assert.equal(fresh.commute.origin,'Otro municipio');assert.equal(fresh.commute.originExact,false);
 assert.equal(fresh.commute.trips[1].destination,'Elisava, dirección editada');assert.equal(fresh.commute.trips[1].minutesMin,null);assert.equal(fresh.commute.trips[1].mainLegMinutesMin,null);
 assert.equal(fresh.commute.trips[0].route,'');assert.equal(old.commute.trips[1].minutesMin,125);
 const moved=updateHousingDetails(old,{listingDetails:{city:'Localidad corregida'}});
 assert.equal(moved.commute.origin,'Localidad corregida');assert.equal(moved.commute.trips[0].mainLegMinutesMin,null);
});

test('manual commute values reject negative or inverted timings and unsafe source links',()=>{
 const c=normalizeCommute({},'Origen');assert.equal(validateCommute(c).valid,true);
 for(const patch of [{minutesMin:-1},{minutesMin:90,minutesMax:80},{changes:1.5},{distanceKm:Infinity},{sourceUrl:'javascript:alert(1)'},{sourceUrlSecondary:'https://user:pass@example.com'}]){const bad=structuredClone(c);Object.assign(bad.trips[0],patch);assert.equal(validateCommute(bad).valid,false);}
 const cleared=resetCommuteMeasurements({...c.trips[0],minutesMin:80,mainLegMinutesMin:62,distanceKm:90});
 assert.equal(cleared.minutesMin,null);assert.equal(cleared.mainLegMinutesMin,null);assert.equal(cleared.distanceKm,null);assert.equal(cleared.destination,c.trips[0].destination);
 assert.equal(createCommuteForProperty('Nueva',c).origin,'Nueva');
});

test('transit links encode only origin and destination without a key or private family URL',()=>{
 const u=new URL(buildTransitLink('Navàs & parada','Elisava, La Rambla 30–32'));
 assert.equal(u.origin,'https://www.google.com');assert.equal(u.searchParams.get('travelmode'),'transit');assert.equal(u.searchParams.get('origin'),'Navàs & parada');
 assert.equal(u.hash,'');assert.equal(buildTransitLink('','Destino'),null);
});

test('the route view shows editing fields before optional source details and escapes imported text',()=>{
 const s=prepareHousingPresentation(normalizeScenario({url:listing}));s.commute.trips[1].label='<img src=x>';const html=renderCommutes(s,helpers);
 assert.ok(html.includes('Tiempo total'));assert.ok(html.includes('≈ 1 h 50 min – 2 h 10 min'));assert.ok(!html.includes('Sólo el tramo de autobús'));assert.ok(html.includes('Llegar previamente a la parada no está incluido'));assert.ok(html.includes('<details'));assert.ok(!html.includes('<img src=x>'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('no fija esa hora automáticamente'));
 assert.equal(formatTravelTime(62,86),'1 h 2 min – 1 h 26 min');assert.equal(formatTravelTime(null,null),'Por comprobar');
 assert.ok(html.indexOf('data-field="commute.origin"')<html.indexOf('<details'));
 for(let i=0;i<3;i++){
  const card=html.split('<article class="card commute-card">')[i+1];
  assert.ok(card.indexOf(`data-field="commute.trips.${i}.minutesMin"`)<card.indexOf('<details'));
  assert.ok(card.indexOf(`data-field="commute.trips.${i}.minutesMax"`)<card.indexOf('<details'));
 }
 assert.ok(html.includes('el origen de referencia'));assert.ok(html.includes('No sumamos automáticamente'));
 const facts=renderPropertyFacts(s,helpers);assert.ok(facts.includes('4'));assert.ok(facts.includes('1'));assert.ok(facts.includes('75'));assert.ok(facts.includes('descripción 3'));assert.ok(!facts.includes('data-view="trayectos"'));
});

test('a partial train leg remains pending in the editing form and never fills a total duration',()=>{
 const s={listingDetails:{city:'Vilafranca del Penedès'},commute:normalizeCommute({},'Centro de referencia')};
 Object.assign(s.commute.trips[0],{mainLegMinutesMin:52,mainLegMinutesMax:52,status:'reference'});
 const before=structuredClone(s),html=renderCommutes(s,helpers);
 assert.deepEqual(s,before);assert.equal(getCommuteIndicators(s)[0].timeLabel,'Por comprobar');
 assert.ok(html.includes('Solo tramo de tren o autobús: mínimo'));assert.ok(html.includes('data-field="commute.trips.0.mainLegMinutesMin"'));
 assert.ok(html.includes('No sustituye ni se suma automáticamente al total'));
});

test('indicators never substitute a partial leg or an unknown time with zero or a total',()=>{
 const s={listingDetails:{city:'Olesa de Montserrat'},commute:normalizeCommute({},'Olesa de Montserrat')};
 s.commute.trips[0].mainLegMinutesMin=45;s.commute.trips[0].mainLegMinutesMax=60;
 const before=structuredClone(s),rows=getCommuteIndicators(s);
 assert.deepEqual(s,before);
 assert.equal(rows.length,3);
 for(const row of rows){assert.equal(row.totalMinutesMin,null);assert.equal(row.totalMinutesMax,null);assert.equal(row.exceedsTarget,null);assert.equal(row.timeLabel,'Por comprobar');assert.equal(new URL(row.mapsUrl).searchParams.get('origin'),'Olesa de Montserrat');}
 const estimated=getCommuteIndicators({url:listing});assert.ok(estimated.every(t=>t.estimated&&t.exceedsTarget));
 s.commute.trips[0].status='checked';s.commute.trips[0].minutesMin=50;s.commute.trips[0].minutesMax=60;
 const checked=getCommuteIndicators(s)[0];assert.equal(checked.estimated,false);assert.equal(checked.exceedsTarget,false);assert.equal(checked.timeLabel,'50 min – 1 h');
 s.commute.trips[0].status='no-service';assert.equal(getCommuteIndicators(s)[0].totalMinutesMin,null);
});

test('v2 migration updates an untouched legacy reference but preserves manual timings and deliberate clearing',()=>{
 const s=normalizeScenario({url:listing,listingDetails:{city:'Navàs'}});s.housingPresentationVersion=1;s.commute=normalizeCommute({},'Estación de autobuses de Navàs, Barcelona, España');
 Object.assign(s.commute.trips[0],{status:'reference',mainLegMinutesMin:76,mainLegMinutesMax:86,route:'Referencia: L0225 Navàs → Gran Via/Balmes (76–86 min en las expediciones consultadas). Completar a pie hasta Plaça de Catalunya y consultar Rodalies hacia la estación de Sant Joan Despí. Faltan espera, conexión y tiempo de tren.',notes:'El anuncio no publica la dirección exacta. Los minutos indicados corresponden sólo al autobús interurbano: faltan acceso a la parada, espera y último tramo. La distancia completa y el tiempo puerta a puerta están pendientes. El destino confirmado es la estación de tren de Sant Joan Despí, no la parada de tranvía Bon Viatge.',sourceUrl:'https://territori.gencat.cat/ca/serveis/visors-cartografia/bases-cartografiques/infraestructures-mobilitat/autobusos-interurbans/',checkedAt:'2026-10-17'});
 Object.assign(s.commute.trips[1],{status:'checked',minutesMin:124,minutesMax:132,route:'Mi consulta',notes:'Horario personal'});
 s.commute.trips[2]=resetCommuteMeasurements(s.commute.trips[2]);
 const manual=structuredClone(s.commute.trips[1]),cleared=structuredClone(s.commute.trips[2]);
 const result=prepareHousingPresentation(s);
 assert.equal(result.housingPresentationVersion,2);assert.equal(result.commute.trips[0].minutesMin,110);assert.equal(result.commute.trips[0].minutesEstimated,true);
 assert.deepEqual(result.commute.trips[1],manual);assert.deepEqual(result.commute.trips[2],cleared);assert.equal(s.housingPresentationVersion,1);
 assert.deepEqual(prepareHousingPresentation(result),result);
 const changed=structuredClone(s);changed.commute.trips[0].notes+=' Nota que he añadido.';
 assert.equal(prepareHousingPresentation(changed).commute.trips[0].minutesMin,null);
 const exact=structuredClone(s);exact.commute.origin='Mi calle, Navàs';exact.commute.originExact=true;
 assert.equal(prepareHousingPresentation(exact).commute.trips[0].minutesMin,null);
});
