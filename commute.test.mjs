import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCommute,validateCommute,createCommuteForProperty,resetCommuteMeasurements,buildTransitLink,prepareHousingPresentation,needsListingEnrichment,renderCommutes,renderPropertyFacts,formatTravelTime} from './commute.mjs';
import {normalizeScenario,calculateScenario} from './finance.mjs';
import {createHousingScenario,updateHousingDetails} from './housing.mjs';

const listing='https://hub.engelvoelkers.com/es/exposee/f5b1dc73-bc4a-4113-af4b-04d3686692dd';
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const helpers={esc,field:(label,path)=>`<label>${label}<input data-field="${path}"></label>`,select:label=>label,check:label=>label,section:(title,subtitle,body)=>`<section><h2>${title}</h2><p>${subtitle}</p>${body}</section>`,notice:t=>`<p>${t}</p>`};

test('Navàs listing enrichment fills verified facts and reference legs without changing the financial calculation',()=>{
 const before=normalizeScenario({id:'saved',name:'Piso',url:listing,purchasePrice:175000,budget:{foodMonthly:428,incomes:[{monthly:2000,payments:12}]}});
 const after=prepareHousingPresentation(before);
 assert.equal(after.id,'saved');assert.equal(after.listingDetails.beds,4);assert.equal(after.listingDetails.baths,1);assert.equal(after.listingDetails.surfaceM2,75);
 assert.deepEqual(after.budget,before.budget);assert.deepEqual(calculateScenario(after),calculateScenario(before));
 assert.equal(after.commute.originExact,false);assert.equal(after.commute.trips[0].destination,'Estació de Rodalies Sant Joan Despí, Barcelona');
 assert.ok(after.commute.trips[0].route.includes('R4'));assert.ok(after.commute.trips[2].destination.includes('Alts Forns 40'));
 for(const trip of after.commute.trips){assert.equal(trip.minutesMin,null);assert.equal(trip.minutesMax,null);assert.equal(trip.distanceKm,null);assert.ok(trip.mainLegMinutesMin>=62);}
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
 const old=prepareHousingPresentation(normalizeScenario({name:'Piso de origen',url:listing,purchasePrice:175000}));old.commute.trips[1].minutesMin=125;old.commute.trips[1].destination='Elisava, dirección editada';
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

test('the route view distinguishes partial travel time and pending totals, and escapes imported text',()=>{
 const s=prepareHousingPresentation(normalizeScenario({url:listing}));s.commute.trips[1].label='<img src=x>';const html=renderCommutes(s,helpers);
 assert.ok(html.includes('Tiempo total'));assert.ok(html.includes('Por comprobar'));assert.ok(html.includes('Sólo el tramo de autobús'));assert.ok(html.includes('no publica la dirección exacta'));assert.ok(!html.includes('<img src=x>'));assert.ok(html.includes('&lt;img'));
 assert.equal(formatTravelTime(62,86),'1 h 2 min – 1 h 26 min');assert.equal(formatTravelTime(null,null),'Por comprobar');
 const facts=renderPropertyFacts(s,helpers);assert.ok(facts.includes('4'));assert.ok(facts.includes('1'));assert.ok(facts.includes('75'));assert.ok(facts.includes('descripción menciona 3'));
});
