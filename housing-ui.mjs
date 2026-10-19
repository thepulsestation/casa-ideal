import {safeImageUrl} from './housing.mjs?v=32';
import {analyzeHome,rankHomes,getHousingHighlights,HOUSING_SORT_OPTIONS} from './property-analysis.mjs?v=32';
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
 <tr><td>Comida, transporte, trastero y demás vida</td><td class="number">${euro(b.householdMonthly-(b.familyInsuranceMonthly||0),2)}</td><td class="number">${euro(b.householdMonthly-(b.familyInsuranceMonthly||0),2)}</td></tr>
 ${b.familyInsuranceMonthly>0?`<tr><td>Seguro familiar común</td><td class="number">${euro(b.familyInsuranceMonthly,2)}</td><td class="number">${euro(b.familyInsuranceMonthly,2)}</td></tr>`:''}
 ${b.personalExpenseMonthly>0?`<tr><td>Pagos personales y transporte público</td><td class="number">${euro(b.personalExpenseMonthly,2)}</td><td class="number">${euro(b.personalExpenseMonthly,2)}</td></tr>`:''}
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
 const metric=(id,label,key,direction='min',extra={})=>({id,label,numeric:home=>home.metrics[key],direction,value:home=>amount(home.metrics[key],euro,esc),...extra});
 const propertyCost=key=>home=>{
  if(!home.valid)return null;
  const value=safeAmount(home.scenario.budget?.[key]);
  // Unchecked default zeros are unknown costs, not a free property.
  return value!==null&&value>=0&&(value>0||home.scenario.budget?.propertyCostsConfirmed===true)?value:null;
 };
 const propertyRow=(id,label,key)=>({id,label,numeric:propertyCost(key),direction:'min',value:home=>amount(propertyCost(key)(home),euro,esc,{prefix:home.scenario.budget?.propertyCostsConfirmed===true?'':'≈ '})});
 const initialComparable=home=>home.valid&&home.scenario.purchaseCosts?.brokerQuotePending!==true;
 const monthlyComparable=home=>home.valid&&!home.incomplete;
 const status=(label,checked)=>`<span class="comparison-status ${checked?'is-checked':'is-pending'}">${checked?'✓ ':''}${esc(label)}</span>`;
 const buyerStatus=(home,index)=>{
  if(home.scenario.tax?.mode==='new')return 'Obra nueva · IVA y AJD';
  const buyer=home.scenario.tax?.buyers?.[index];
  if(!buyer||safeAmount(buyer.rate)===null)return status('Por completar',false);
  const rate=(buyer.rate*100).toLocaleString('es-ES',{maximumFractionDigits:2})+' %';
  if(buyer.rate>=.1)return esc(rate+' · tarifa general');
  if(buyer.eligibilityConfirmed===true)return status(rate+' · requisitos comprobados',true);
  if(buyer.eligibilityAssumed===true)return status(rate+' · hipótesis, sin comprobar',false);
  return status(rate+' solicitado · sin comprobar; se aplica tarifa general',false);
 };
 const insuranceStatus=home=>{
  if(!home.valid)return status('Por completar',false);
  const quotes=home.result.budget?.missingQuotes;
  if(!Array.isArray(quotes))return status('Por completar',false);
  const missing=quotes.filter(label=>/seguro|protecci[oó]n/i.test(label));
  return missing.length?status('Pendientes: '+missing.join(', '),false):status('Primas introducidas',true);
 };
 const values=[
  {section:'La vivienda'},
  {id:'type',label:'Tipo y ubicación',value:home=>esc([home.scenario.propertyType==='flat'?'Piso':'Casa',home.scenario.listingDetails?.city].filter(Boolean).join(' · '))},
  metric('price','Precio de vivienda','price','min',{value:home=>amount(home.metrics.price,euro,esc,{digits:0})}),
  ...[['surface','Metros cuadrados construidos','surfaceM2',' m²'],['bedrooms','Habitaciones','bedrooms',''],['bathrooms','Baños','bathrooms','']].map(([id,label,key,suffix])=>metric(id,label,key,'max',{value:home=>home.metrics[key]===null?'Por completar':esc(home.metrics[key].toLocaleString('es-ES',{maximumFractionDigits:2})+suffix)})),
  {section:'Dinero para comprar'},
  metric('initial','Dinero inicial necesario','totalRequired','min',{comparable:initialComparable,value:home=>amount(home.metrics.totalRequired,euro,esc,{prefix:home.incomplete?'≥ ':home.estimated?'≈ ':''})}),
  {id:'tax',label:'Impuestos de compra',numeric:home=>home.valid?safeAmount(home.result.tax?.total):null,direction:'min',value:home=>amount(home.valid?home.result.tax?.total:null,euro,esc)},
  metric('mother-capital','Capital del préstamo de mamá','motherPrincipal','min',{comparable:initialComparable,value:home=>amount(home.metrics.motherPrincipal,euro,esc,{prefix:home.incomplete?'≥ ':''})}),
  metric('funding-gap','Falta por cubrir','fundingGap','min',{comparable:initialComparable}),
  {section:'Cada mes'},
  metric('mortgage','Hipoteca /mes','mortgageMonthly'),
  metric('mother-bank','Cuota bancaria de mamá /mes','motherBankMonthly'),
  metric('children-repayment','Devolución de los hijos a mamá /mes','childrenRepaymentMonthly'),
  {id:'mother-term',label:'Plazo bancario de mamá',value:home=>safeAmount(home.scenario.familyLoan?.years)>0?esc(home.scenario.familyLoan.years+' años'):'Por completar'},
  {id:'mother-rate',label:'TIN bancario de mamá',value:home=>safeAmount(home.scenario.familyLoan?.rate)!==null?esc(home.scenario.familyLoan.rate.toLocaleString('es-ES',{maximumFractionDigits:2})+' %'):'Por completar'},
  metric('insurance','Seguros /mes','insuranceMonthly','min',{comparable:home=>Array.isArray(home.result.budget?.missingQuotes)&&!home.result.budget.missingQuotes.some(label=>/seguro|protecci[oó]n/i.test(label))}),
  propertyRow('community','Comunidad / conservación de urbanización /mes','communityMonthly'),
  propertyRow('ibi','IBI /año','ibiAnnual'),
  propertyRow('waste','Residuos /año','wasteAnnual'),
  propertyRow('maintenance','Reserva de mantenimiento /año','maintenanceAnnual'),
  metric('household-monthly','Coste familiar al comprar /mes','totalMonthly','min',{comparable:monthlyComparable,value:home=>monthlyAmount(home,euro,esc)}),
  metric('household-margin','Margen familiar /mes','remainingMonthly','max',{comparable:monthlyComparable,value:home=>home.incomplete?amount(home.metrics.remainingMonthly,euro,esc,{prefix:'≤ '}):amount(home.metrics.remainingMonthly,euro,esc)}),
  {id:'debt-reference',label:'Referencia de deudas de titulares',value:home=>esc(ratioLabel(home)+home.debtStatus.label)},
  {section:'Transporte público · salida 08:00'},
  ...[0,1,2].map(index=>({id:'commute-'+index,label:homes[0].commute[index].label,numeric:home=>{const t=home.commute[index];return t.totalMinutesMin===null||t.totalMinutesMax===null?null:(t.totalMinutesMin+t.totalMinutesMax)/2;},direction:'min',value:home=>esc(travelLabel(home.commute[index]))})),
  {section:'Qué está comprobado en cada vivienda'},
  ...[0,1].map(index=>({id:'buyer-'+index,label:'ITP · comprador '+(index+1),value:home=>buyerStatus(home,index)})),
  {id:'icf-status',label:'Requisitos ICF',value:home=>!home.scenario.icf?.enabled?'No se utiliza ICF':status(home.scenario.icf.eligibilityConfirmed===true?'Requisitos comprobados':'Pendientes de comprobar',home.scenario.icf.eligibilityConfirmed===true)},
  {id:'receipts-status',label:'IBI, residuos y comunidad',value:home=>status(home.scenario.budget?.propertyCostsConfirmed===true?'Recibos e importes comprobados':'Sin comprobar · provisión orientativa',home.scenario.budget?.propertyCostsConfirmed===true)},
  {id:'purchase-status',label:'Gastos de compra y agencia',value:home=>home.scenario.purchaseCosts?.brokerQuotePending===true?status('Honorarios de agencia pendientes',false):home.result.cash?.purchaseFeesEstimated===true||home.scenario.purchaseCosts?.mode==='provision'?status('Provisión · faltan presupuestos',false):home.valid?'Importes introducidos':'Por completar'},
  {id:'insurance-status',label:'Presupuestos de seguros',value:insuranceStatus},
  {id:'loan-status',label:'Condiciones del préstamo de mamá',value:home=>home.scenario.familyLoan?.enabled===false?'No se utiliza':status(home.result.familyLoan?.termsAssumed===true||home.scenario.familyLoan?.assumedTerms===true?'Hipótesis · oferta por confirmar':safeAmount(home.scenario.familyLoan?.rate)===null||!(safeAmount(home.scenario.familyLoan?.years)>0)?'Por completar':'Condiciones introducidas · concesión pendiente',false)},
  {id:'data-status',label:'Estado de los datos',value:home=>!home.valid?'Revisa los datos':home.incomplete?'Pendientes':home.estimated?'Orientativos':'Introducidos'},
 ];
 const body=values.map(row=>{
  if(row.section)return `<tr class="comparison-section"><th colspan="${homes.length+1}" scope="colgroup">${esc(row.section)}</th></tr>`;
  const comparable=homes.map(home=>row.numeric&&(!row.comparable||row.comparable(home))?safeAmount(row.numeric(home)):null);
  const known=comparable.filter(value=>value!==null),varied=known.length>1&&Math.max(...known)-Math.min(...known)>1e-8;
  const best=varied?(row.direction==='max'?Math.max(...known):Math.min(...known)):null;
  return `<tr data-comparison-criterion="${row.id}"><th scope="row">${esc(row.label)}</th>${homes.map((home,index)=>{
   const favored=best!==null&&comparable[index]!==null&&Math.abs(comparable[index]-best)<1e-8;
   return `<td class="number${favored?' comparison-best':''}"${favored?' data-comparison-best="true"':''}>${row.value(home)}${favored?`<small class="comparison-advantage">${row.direction==='max'?'↑ Mayor':'↓ Menor'}</small>`:''}</td>`;
  }).join('')}</tr>`;
 }).join('');
 return selection+`<section class="card housing-comparison"><h2>Comparación con los mismos conceptos</h2><p>En verde: el valor más favorable de cada fila entre las cifras comparables. Más metros, habitaciones y margen; menos costes y tiempo. Si empatan o faltan datos comparables, no se destaca un ganador.</p><p>La referencia de deudas elegida en cada cálculo es simulada; no indica aprobación bancaria. Los importes con presupuestos pendientes no ganan por omitir esos gastos.</p><div class="table-wrap"><table><thead><tr><th scope="col">Concepto</th>${homes.map(home=>`<th class="number" scope="col">${esc(home.scenario.name||'Vivienda sin nombre')}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><p class="fine-print">≥: mínimo conocido con datos pendientes. ≤: margen máximo con lo introducido. ≈: hipótesis o provisiones. IBI, residuos y mantenimiento son importes anuales; el coste mensual los divide entre 12. La devolución de los hijos a mamá es interna y no se suma otra vez al coste familiar. Trayectos: se compara la media del rango total de puerta a puerta; un tramo de tren aislado sigue pendiente.</p><div class="comparison-home-actions">${homes.map(home=>`<div><strong>${esc(home.scenario.name||'Vivienda sin nombre')}</strong><div class="inline-actions"><button class="button secondary" data-action="load" data-id="${esc(home.scenario.id)}">Abrir vivienda</button><button class="button secondary" data-action="edit-commute" data-id="${esc(home.scenario.id)}">Editar trayectos</button></div></div>`).join('')}</div></section>`;
}
