/** A budget exercise, not a municipal quote, valuation, or maximum charge. */
export const PROPERTY_COST_PROVISION = Object.freeze({ibiAnnual:2000,wasteAnnual:100,communityMonthly:0,maintenanceAnnual:0,ownershipProvisionCombined:true,ownershipProvisionFromRules:true});
export function getPropertyCostProvision(s={}){
 const rules=s.purchaseStory||{},budget=s.budget||{};
 return {...PROPERTY_COST_PROVISION,ibiAnnual:rules.ownershipAnnual??2000,wasteAnnual:rules.wasteAnnual??100,communityMonthly:budget.communityMonthly??0};
}

export function estimateAnnualIbi(base,ratePercent){
 if(base===null||base===undefined||base===''||ratePercent===null||ratePercent===undefined||ratePercent==='')return null;
 for(const [value,label] of [[base,'La base liquidable'],[ratePercent,'El tipo municipal']]){
  if(!['number','string'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0)throw Error(label+' debe ser un número no negativo.');
 }
 if(Number(ratePercent)>100)throw Error('El tipo municipal no puede superar el 100 %.');
 const amount=Number(base)*(Number(ratePercent)/100);
 const rounded=Math.round((amount+Number.EPSILON)*100)/100;
 if(!Number.isFinite(rounded))throw Error('El IBI calculado está fuera del rango numérico admitido.');
 return rounded;
}

export function renderPropertyCosts(s,result,{field,check,notice,row,euro}){
 let ibi=null;try{ibi=estimateAnnualIbi(s.budget.ibiLiquidableBase,s.budget.ibiRatePercent)}catch{}
 const provision=getPropertyCostProvision(s);
 const city=String(s.listingDetails?.city||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const municipality=city.split(/\s*[·,]\s*/)[0];
 const navas=municipality==='navas',vilafranca=municipality==='vilafranca del penedes';
 return `<div class="form-grid">
  ${field('Comunidad / conservación de urbanización al mes','budget.communityMonthly',{hint:'Cuota de la comunidad o entidad de conservación. Puede ser 0 si has comprobado que no existe. Las derramas extraordinarias van aparte.'})}
  ${field(s.budget.ownershipProvisionCombined?'IBI y conservación · provisión conjunta anual':'IBI anual','budget.ibiAnnual',{hint:s.budget.ownershipProvisionCombined?'Esta reserva incluye IBI y posibles reparaciones. No es un recibo municipal: si lo separas, evita volver a sumar las mismas reparaciones en mantenimiento.':'Usa el recibo de esta casa. No se calcula sobre el precio del anuncio ni sobre el valor de referencia del ITP.'})}
  ${field('Residuos: recogida y tratamiento al año','budget.wasteAnnual',{hint:'Suma todos los recibos que correspondan. En algunos municipios el tratamiento comarcal se cobra por separado.'})}
  ${field('Mantenimiento y reparaciones adicionales / año','budget.maintenanceAnnual',{hint:s.budget.ownershipProvisionCombined?'Mantén 0 si las reparaciones ya están incluidas en la reserva conjunta de arriba. Solo suma aquí un importe adicional.':'Una provisión adicional para tejado, caldera, jardín, etc.'})}
 </div>
 <p class="fine-print">Son gastos de la casa que compraríais. IBI, residuos y mantenimiento se dividen entre 12 para reservar dinero. Los recibos pueden cobrarse en otras fechas.</p>
 ${s.budget.ownershipProvisionFromRules&& !s.budget.propertyCostsConfirmed?'<p class="fine-print">Esta provisión sigue las reglas de «Compra paso a paso». Si editas aquí IBI, residuos o mantenimiento, esta vivienda conservará sus propios importes. La comunidad siempre es específica de la vivienda.</p>':''}
 ${s.budget.propertyCostsEstimated?notice('<strong>Hay importes orientativos en este presupuesto.</strong> Se cuentan en el coste mensual, pero la simulación sigue pendiente de comprobar los recibos. No son un máximo.','info'):''}
 <div class="section-gap">${check('He comprobado IBI, residuos y comunidad / conservación para esta casa','budget.propertyCostsConfirmed','Marca solo después de revisar recibos y presupuesto de la comunidad. No busca ni valida importes: retira el aviso de estimación. Si usas cifras orientativas, déjalo sin marcar; confirma también cualquier 0 €.')}</div>
 ${navas?`<details class="section-gap"><summary>Referencia municipal de Navàs · 2026</summary><p>La ordenanza publica un IBI urbano del <strong>0,815 % de la base liquidable</strong>. Falta el recibo de este piso para conocer esa base y sus ajustes: no se obtiene del precio ni de los metros.</p><p>Residuos domésticos: parte básica de <strong>136,50 €/año</strong> y parte variable de <strong>0–100 €/año</strong> según uso de los contenedores, antes de bonificaciones y otras circunstancias. La variable se liquida al año siguiente. Son las tarifas de 2026; no se trasladan automáticamente a otro ejercicio.</p><p>Las provisiones actuales no se sustituyen ni se dan por comprobadas. La cuota de comunidad depende del edificio. <a href="https://www.navas.cat/wp-content/uploads/2026/03/OOFF20260324-.pdf" target="_blank" rel="noopener noreferrer">Ordenanzas de Navàs: IBI y residuos</a>.</p></details>`:''}
 ${vilafranca?`<details class="section-gap"><summary>Referencia municipal de Vilafranca del Penedès · 2026</summary><p>IBI urbano general: <strong>0,907 % de la base liquidable</strong>, antes de bonificaciones o recargos. El tipo municipal se conoce; la cuota de esta casa sigue pendiente del recibo. El precio y los metros del anuncio no permiten calcularla.</p><p>En residuos, <strong>295 €/año es una provisión editable</strong>, no un recibo ni un máximo. La tarifa residencial depende de la superficie catastral destinada a vivienda y del consumo de agua del año anterior. La presencia de un local y su situación pueden cambiar la liquidación.</p><p>Consultar estas referencias no marca los gastos como comprobados ni sustituye vuestros importes. <a href="https://seu.vilafranca.cat/sites/default/files/of_26_0.pdf" target="_blank" rel="noopener noreferrer">Ordenanza del IBI</a> · <a href="https://seu.vilafranca.cat/sites/default/files/of_06_0.pdf" target="_blank" rel="noopener noreferrer">Ordenanza de residuos</a>.</p></details>`:''}
 <details class="section-gap"><summary>No conozco los importes: probar una provisión</summary>
  <p>Sin municipio, recibos y situación de la urbanización no hay un máximo fiable, aunque conozcas el precio, los metros de vivienda y de parcela. Esta es una hipótesis editable para probar vuestro margen.</p>
  <div class="breakdown">${row('IBI y reparaciones · reserva anual conjunta',euro(provision.ibiAnnual))}${row('Recogida y tratamiento · provisión anual',euro(provision.wasteAnnual))}${row('Comunidad introducida · se conserva',euro(provision.communityMonthly))}${row('Total a reservar al mes',euro(provision.ibiAnnual/12+provision.wasteAnnual/12+provision.communityMonthly,2),'total')}</div>
  <button type="button" class="button secondary" data-action="apply-property-provision">Aplicar estas provisiones generales</button>
  <p class="fine-print">El botón aplica las reservas generales de compra: IBI y reparaciones juntos, más residuos. Conserva la comunidad introducida y deja en 0 el mantenimiento adicional para no duplicar las reparaciones. Son hipótesis editables, no recibos municipales ni máximos.</p>
 </details>
 <details class="section-gap"><summary>Calcular el IBI si conoces su base y el tipo municipal</summary>
  <p>Del recibo o del ayuntamiento: base liquidable × tipo municipal. El resultado es la cuota íntegra orientativa, antes de bonificaciones o recargos. No uses aquí el precio de compra ni el valor de referencia.</p>
  <div class="form-grid">${field('Base liquidable del IBI','budget.ibiLiquidableBase',{nullable:true})}${field('Tipo municipal del IBI','budget.ibiRatePercent',{nullable:true,suffix:'%',max:100})}</div>
  ${ibi===null?'<p class="fine-print">Completa ambos datos para obtener el cálculo.</p>':`<div class="breakdown">${row('IBI anual calculado',euro(ibi,2),'total')}</div><button type="button" class="button secondary" data-action="apply-ibi-estimate">Usar este cálculo como provisión de IBI</button>`}
 </details>
 <details class="section-gap"><summary>Dónde comprobar cada cifra</summary>
  <p><strong>IBI:</strong> pide el último recibo al vendedor. La base liquidable y el tipo municipal determinan la cuota, con las bonificaciones o recargos aplicables. <a href="https://www.catastro.hacienda.gob.es/es-ES/faqs.html" target="_blank" rel="noopener noreferrer">Catastro: cómo se calcula</a>.</p>
  <p><strong>Residuos:</strong> consulta la ordenanza vigente y todos los recibos de recogida y tratamiento. Como ejemplo de variación municipal, Piera publica 135 €/año para 2026; no es una tarifa para otras localidades. <a href="https://www.viladepiera.cat/actualitat/noticies/piera-congela-la-taxa-domestica-i-ajusta-les-tarifes-comercials-a-les-ordenances-fiscals-per-al-2026.html" target="_blank" rel="noopener noreferrer">Ayuntamiento de Piera</a>. <a href="https://www.consellvallesoccidental.cat/noticies/domicilia-el-rebut-comarcal-de-tractament-de-residus-i-oblidat-dels-terminis/" target="_blank" rel="noopener noreferrer">Tratamiento comarcal en el Vallès Occidental</a>.</p>
  <p><strong>Comunidad o conservación:</strong> pide cuota, presupuesto, derramas aprobadas y certificado de deudas. Una casa aislada puede pertenecer a una entidad de conservación; los metros no permiten fijar su cuota. <a href="https://www.boe.es/buscar/act.php?id=BOE-A-2006-11130" target="_blank" rel="noopener noreferrer">Código civil de Cataluña</a>.</p>
 </details>`;
}
