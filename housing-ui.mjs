import {safeImageUrl} from './housing.mjs?v=15';
import {analyzeHome,rankHomes,getHousingHighlights,HOUSING_SORT_OPTIONS} from './property-analysis.mjs?v=15';
export const hasBudgetEstimates=(s,r)=>Boolean(r.budget?.propertyCostsEstimated||r.budget?.assumedLoanTerms||r.cash?.purchaseFeesEstimated||r.familyLoan?.termsAssumed||s.familyLoan?.assumedTerms||r.icf?.hypothetical);
export function renderPropertyGallery(images,name,esc){
 const safe=Array.isArray(images)?images.map(safeImageUrl).filter(Boolean).slice(0,8):[];
 return safe.length?`<div class="property-gallery">${safe.map((url,i)=>`<button type="button" class="property-photo-button" data-action="open-gallery" data-photo-index="${i}" aria-label="Ver foto ${i+1} de ${safe.length} de ${esc(name||'Vivienda')}"><img src="${esc(url)}" alt="${esc(name||'Vivienda')} · foto ${i+1}" loading="lazy" referrerpolicy="no-referrer"></button>`).join('')}</div>`:'';
}
export function renderRentalComparison(s,r,{euro,esc}){
 const b=r.budget;
 const currentHousing=b.currentRent+b.currentUtilitiesMonthly+Number(s.budget.currentOtherMonthly||0);
 const futureHousing=b.homeMonthly+Number(r.familyLoan.monthlyPayment||0);
 const approximate=hasBudgetEstimates(s,r),prefix=approximate?'≈ ':b.incomplete?'≥ ':'';
 const difference=b.allInDifference;
 return `<section class="card rental-comparison"><div class="card-head"><div><h2>Alquilar o comprar: con todos los gastos</h2><p>Los suministros y los gastos de vida se comparan con los mismos conceptos.</p></div></div>
 ${b.utilitiesMonthly===0||b.currentUtilitiesMonthly===0?'<div class="notice"><strong>Faltan suministros por completar.</strong> Hay un presupuesto de suministros a 0 €: el total correspondiente todavía no incorpora esas facturas. Rellena agua, electricidad/gas e internet en Presupuesto familiar.</div>':''}<div class="comparison-pair"><div><span class="mini-label">VUESTRA VIVIENDA ACTUAL</span><h3>Alquiler + gastos de vivienda</h3><strong class="comparison-amount">${euro(currentHousing,2)} <small>/mes</small></strong><p>Alquiler, agua/luz/internet y los extras actuales que hayas indicado.</p></div><div><span class="mini-label">${s.propertyType==='flat'?'EL PISO':'LA CASA'} QUE COMPRARÍAIS</span><h3>Compra + gastos de vivienda</h3><strong class="comparison-amount">${prefix+euro(futureHousing,2)} <small>/mes</small></strong><p>Hipoteca, préstamo bancario de mamá, suministros, seguros, comunidad, IBI, residuos y mantenimiento.</p></div></div>
 <div class="table-wrap"><table><thead><tr><th>Presupuesto familiar completo / mes</th><th class="number">Alquilando</th><th class="number">Comprando</th></tr></thead><tbody>
 <tr><td>Vivienda y suministros</td><td class="number">${euro(currentHousing,2)}</td><td class="number">${prefix+euro(futureHousing,2)}</td></tr>
 <tr><td>Préstamos que ya pagáis</td><td class="number">${euro(b.existingDebtMonthly+b.familyExistingDebtMonthly,2)}</td><td class="number">${euro(b.existingDebtMonthly+b.familyExistingDebtMonthly,2)}</td></tr>
 <tr><td>Comida, transporte, trastero y demás vida</td><td class="number">${euro(b.householdMonthly,2)}</td><td class="number">${euro(b.householdMonthly,2)}</td></tr>
 <tr class="comparison-total"><td><strong>Total familiar</strong></td><td class="number"><strong>${euro(b.currentComparable,2)}</strong></td><td class="number"><strong>${prefix+euro(b.totalMonthly,2)}</strong></td></tr>
 </tbody></table></div>
 <div class="comparison-message"><strong>${approximate?'≈ ':''}${difference>=0?'+':'−'}${euro(Math.abs(difference),2)} /mes al comprar, con lo introducido</strong><p>${b.incomplete?'Comparación provisional: faltan gastos o datos por comprobar. ':''}${approximate?'Incluye hipótesis de intereses o provisiones; el resultado puede cambiar. ':''}La cuota hipotecaria sola es un componente del total.</p></div>
 <button class="card-link" data-view="presupuesto">Editar los gastos del hogar →</button></section>`;
}
const selectionSet=selected=>selected instanceof Set?selected:new Set(Array.isArray(selected)?selected:[]);
const safeAmount=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
function amount(value,euro,esc,{prefix='',digits=2}={}){return safeAmount(value)===null?'Por completar':prefix+esc(euro(value,digits));}
function monthlyAmount(home,euro,esc){return amount(home.metrics.totalMonthly,euro,esc,{prefix:home.incomplete?'≥ ':home.estimated?'≈ ':''});}
function ratioLabel(home){return home.debtStatus.ratio===null?'':`${(home.debtStatus.ratio*100).toLocaleString('es-ES',{maximumFractionDigits:1})} % · `;}
function travelLabel(trip){
 if(trip.totalMinutesMin===null&&trip.totalMinutesMax===null)return trip.timeLabel==='Sin servicio anotado'?trip.timeLabel:'Por comprobar';
 if(trip.timeLabel&&trip.timeLabel!=='Por comprobar')return trip.timeLabel;
 const min=trip.totalMinutesMin,max=trip.totalMinutesMax;
 return (trip.estimated?'≈ ':'')+(min===null?`Hasta ${max} min`:max===null?`Desde ${min} min`:min===max?`${min} min`:`${min}–${max} min`);
}
function highlightHtml(highlights,{euro,esc}){
 return highlights.length?`<div class="housing-highlights" aria-label="Destacadas por cada criterio">${highlights.map(({criterion,label,home})=>`<button type="button" class="housing-highlight" data-action="load" data-id="${esc(home.scenario.id)}"><span>${esc(label)}</span><strong>${esc(home.scenario.name||'Vivienda sin nombre')}</strong><small>${criterion==='monthly'?monthlyAmount(home,euro,esc)+' /mes':criterion==='price'?amount(home.metrics.price,euro,esc):'≈ '+Math.round(home.metrics.commuteMeanMinutes)+' min de media'}</small></button>`).join('')}</div>`:'';
}
export function renderHousingList(rows,{calculateScenario,euro,esc,selected=new Set(),cloudConnected=false,comparisonHtml='',hasDraft=false,sort='favorites',getCommuteIndicators}={}){
 rows=Array.isArray(rows)?rows:[];
 const options={calculateScenario,getCommuteIndicators,sort},homes=rankHomes(rows,options),choices=selectionSet(selected);
 const selectedCount=rows.filter(row=>choices.has(row.id)).length;
 return `<div class="scenario-toolbar"><div><span class="tag">${rows.length} ${rows.length===1?'vivienda':'viviendas'}</span><span class="fine-print"> ${cloudConnected?'Lista de vuestra familia':'En este dispositivo'}</span></div><div class="inline-actions" style="margin-top:0"><button class="button secondary" data-action="import">Importar copia</button><button class="button secondary" data-action="export">Exportar copia</button><button class="button primary" data-action="new">＋ Añadir vivienda</button></div></div>
 ${hasDraft?'<div class="notice info">Tienes un cálculo sin guardar. <button class="card-link" data-action="save">Guardar cálculo</button><button class="card-link" data-view="resumen">Volver al cálculo</button></div>':''}
 ${!rows.length?'<section class="card empty"><div class="house-icon">⌂</div><h2>Añade la primera vivienda.</h2><p>Pon su nombre, enlace y precio. Se conservará el presupuesto del hogar.</p><button class="button primary" data-action="new">＋ Añadir vivienda</button></section>':`
 ${highlightHtml(getHousingHighlights(rows,options),{euro,esc})}
 <div class="housing-list-controls"><label>Ordenar por<select data-housing-sort>${HOUSING_SORT_OPTIONS.map(([key,label])=>`<option value="${key}" ${sort===key?'selected':''}>${label}</option>`).join('')}</select></label><button class="button secondary" data-view="comparativa">Comparar${selectedCount?' ('+selectedCount+')':''}</button></div>
 <p class="housing-ranking-note">Orden mensual e inicial: datos pendientes al final. Trayectos: media de los tres rangos de salida a las 08:00, con los tres completos.</p>
 <div class="housing-grid">${homes.map(home=>{
  const s=home.scenario,d=s.listingDetails||{},photos=Array.isArray(s.images)?s.images.map(safeImageUrl).filter(Boolean).slice(0,8):[];
  return `<article class="card housing-card" data-home-id="${esc(s.id)}">${photos.length?`<button type="button" class="housing-cover-button" data-action="open-gallery" data-id="${esc(s.id)}" data-photo-index="0" aria-label="Ver ${photos.length} ${photos.length===1?'foto':'fotos'} de ${esc(s.name||'Vivienda')}"><img class="housing-cover" src="${esc(photos[0])}" alt="${esc(s.name||'Vivienda')}" loading="lazy" referrerpolicy="no-referrer"><span class="housing-photo-count" aria-hidden="true">▧ ${photos.length}</span></button>`:'<div class="housing-cover housing-placeholder" aria-hidden="true">⌂</div>'}
  <div class="housing-card-body"><div class="housing-card-heading"><div><span class="mini-label">${s.propertyType==='flat'?'PISO':'CASA'}${d.city?' · '+esc(d.city):''}</span><h2>${esc(s.name||'Vivienda sin nombre')}</h2></div><button type="button" class="housing-favorite ${home.favorite?'is-favorite':''}" data-action="favorite" data-id="${esc(s.id)}" aria-pressed="${home.favorite}" aria-label="${home.favorite?'Quitar de':'Añadir a'} favoritas: ${esc(s.name||'Vivienda')}">${home.favorite?'♥':'♡'}</button></div>
  <div class="housing-price">${amount(home.metrics.price,euro,esc,{digits:0})}</div><p class="fine-print">${[d.surfaceM2?esc(d.surfaceM2)+' m²':'',d.beds?esc(d.beds)+' hab.':'',d.baths?esc(d.baths)+' baño(s)':''].filter(Boolean).join(' · ')}</p>
  <div class="housing-quick-costs"><div><small>Coste familiar al comprar /mes</small><strong>${monthlyAmount(home,euro,esc)}</strong></div><div><small>Capital del préstamo de mamá</small><strong>${amount(home.metrics.motherPrincipal,euro,esc,{prefix:home.incomplete?'≥ ':''})}</strong></div></div>
  <div class="housing-status ${home.debtStatus.code}" title="Hipoteca y deudas de los titulares entre sus ingresos ordinarios. Referencia de cálculo; no es una aprobación del banco.">${esc(ratioLabel(home)+home.debtStatus.label)}</div>
  <div class="housing-data-status">${!home.valid?'Revisa los datos del cálculo':home.incomplete?'Datos pendientes · mínimo conocido':home.estimated?'Importes orientativos':'Datos introducidos'}${home.metrics.fundingGap>0?' · falta dinero para comprar':''}</div>
  <div class="housing-commute" aria-label="Trayectos de mañana"><span class="mini-label">SALIDA 08:00</span>${home.commute.map(trip=>`<div class="housing-trip ${trip.exceedsTarget===true?'over-target':''}"><span>${esc(trip.label)}</span><strong>${esc(travelLabel(trip))}</strong></div>`).join('')}</div>
  <div class="scenario-actions"><button class="button primary" data-action="load" data-id="${esc(s.id)}">Abrir vivienda</button><button class="button secondary" data-action="edit-home" data-id="${esc(s.id)}">Editar vivienda</button></div>
  <label class="compare-controls"><input type="checkbox" data-compare="${esc(s.id)}" ${choices.has(s.id)?'checked':''}>Seleccionar para comparar</label><details class="housing-more-options"><summary>Más opciones</summary><div class="inline-actions"><button class="button plain" data-action="duplicate" data-id="${esc(s.id)}">Duplicar</button><button class="button plain danger" data-action="delete" data-id="${esc(s.id)}">Quitar vivienda</button></div></details></div></article>`;
 }).join('')}</div>${comparisonHtml||''}`}`;
}

/** Configurable comparison of any two or more saved homes. */
export function renderHousingComparison(rows,{selected,calculateScenario,euro,esc,getCommuteIndicators}={}){
 rows=Array.isArray(rows)?rows:[];
 const choices=selected===undefined?new Set(rows.map(row=>row.id)):selectionSet(selected);
 const homes=rows.filter(row=>choices.has(row.id)).map(row=>analyzeHome(row,{calculateScenario,getCommuteIndicators}));
 const selection=`<section class="card comparison-selection"><h2>Elige las viviendas que quieres comparar</h2><div class="comparison-choices">${rows.map(row=>`<label class="compare-controls"><input type="checkbox" data-compare="${esc(row.id)}" ${choices.has(row.id)?'checked':''}>${esc(row.name||'Vivienda sin nombre')}</label>`).join('')}</div><p>${homes.length} ${homes.length===1?'vivienda seleccionada':'viviendas seleccionadas'} · mínimo 2.</p></section>`;
 if(homes.length<2)return selection+'<section class="card empty"><h2>Selecciona al menos dos viviendas.</h2><p>Puedes comparar todas las que necesitéis.</p><button class="button secondary" data-view="viviendas">Volver a las viviendas</button></section>';
 const values=[
  ['Precio de vivienda',home=>amount(home.metrics.price,euro,esc,{digits:0})],
  ['Dinero inicial necesario',home=>amount(home.metrics.totalRequired,euro,esc,{prefix:home.incomplete?'≥ ':''})],
  ['Capital del préstamo de mamá',home=>amount(home.metrics.motherPrincipal,euro,esc,{prefix:home.incomplete?'≥ ':''})],
  ['Falta por cubrir',home=>amount(home.metrics.fundingGap,euro,esc)],
  ['Coste familiar al comprar /mes',home=>monthlyAmount(home,euro,esc)],
  ['Margen familiar /mes',home=>home.incomplete?'Por completar':amount(home.metrics.remainingMonthly,euro,esc)],
  ['Referencia de deudas de titulares',home=>esc(ratioLabel(home)+home.debtStatus.label)],
  ...[0,1,2].map(index=>['08:00 · '+homes[0].commute[index].label,home=>esc(travelLabel(home.commute[index]))]),
  ['Estado de los datos',home=>!home.valid?'Revisa los datos':home.incomplete?'Pendientes':home.estimated?'Orientativos':'Introducidos'],
 ];
 return selection+`<section class="card housing-comparison"><h2>Comparación con los mismos conceptos</h2><p>La referencia de deudas elegida en cada cálculo es simulada. Revisad ingresos, gastos y supuestos; no indica aprobación bancaria.</p><div class="table-wrap"><table><thead><tr><th>Concepto</th>${homes.map(home=>`<th class="number">${esc(home.scenario.name||'Vivienda sin nombre')}</th>`).join('')}</tr></thead><tbody>${values.map(([label,value])=>`<tr><td>${esc(label)}</td>${homes.map(home=>`<td class="number">${value(home)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="fine-print">≥: mínimo conocido con datos pendientes. ≈: hipótesis o provisiones. Los minutos aproximados incluyen los supuestos del trayecto anotado; no son tráfico ni horarios en tiempo real.</p><div class="inline-actions">${homes.map(home=>`<button class="button secondary" data-action="load" data-id="${esc(home.scenario.id)}">Abrir ${esc(home.scenario.name||'vivienda')}</button>`).join('')}</div></section>`;
}
