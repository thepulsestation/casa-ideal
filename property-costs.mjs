/** A budget exercise, not a municipal quote, valuation, or maximum charge. */
export const PROPERTY_COST_PROVISION = Object.freeze({ibiAnnual:1500,wasteAnnual:300,communityMonthly:100});

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
 const provision=PROPERTY_COST_PROVISION;
 return `<div class="form-grid">
  ${field('Comunidad / conservación de urbanización al mes','budget.communityMonthly',{hint:'Cuota de la comunidad o entidad de conservación. Puede ser 0 si has comprobado que no existe. Las derramas extraordinarias van aparte.'})}
  ${field('IBI anual','budget.ibiAnnual',{hint:'Usa el recibo de esta casa. No se calcula sobre el precio del anuncio ni sobre el valor de referencia del ITP.'})}
  ${field('Residuos: recogida y tratamiento al año','budget.wasteAnnual',{hint:'Suma todos los recibos que correspondan. En algunos municipios el tratamiento comarcal se cobra por separado.'})}
  ${field('Mantenimiento y reparaciones / año','budget.maintenanceAnnual',{hint:'Una provisión adicional para tejado, caldera, jardín, etc.'})}
 </div>
 <p class="fine-print">Son gastos de la casa que compraríais. IBI, residuos y mantenimiento se dividen entre 12 para reservar dinero. Los recibos pueden cobrarse en otras fechas.</p>
 ${s.budget.propertyCostsEstimated?notice('<strong>Hay importes orientativos en este presupuesto.</strong> Se cuentan en el coste mensual, pero la simulación sigue pendiente de comprobar los recibos. No son un máximo.','info'):''}
 <div class="section-gap">${check('He comprobado IBI, residuos y comunidad / conservación para esta casa','budget.propertyCostsConfirmed','Con recibos, ordenanzas y presupuesto de la comunidad. Si una partida no se aplica, confirma también ese 0 €.')}</div>
 <details class="section-gap"><summary>No conozco los importes: probar una provisión</summary>
  <p>Sin municipio, recibos y situación de la urbanización no hay un máximo fiable, aunque conozcas el precio, los metros de vivienda y de parcela. Esta es una hipótesis editable para probar vuestro margen.</p>
  <div class="breakdown">${row('IBI · provisión anual',euro(provision.ibiAnnual))}${row('Recogida y tratamiento · provisión anual',euro(provision.wasteAnnual))}${row('Urbanización · provisión mensual',euro(provision.communityMonthly))}${row('Total a reservar al mes',euro(provision.ibiAnnual/12+provision.wasteAnnual/12+provision.communityMonthly,2),'total')}</div>
  <button type="button" class="button secondary" data-action="apply-property-provision">Usar estos tres importes orientativos</button>
  <p class="fine-print">El botón sustituye únicamente IBI, residuos y comunidad por esos importes. Son supuestos de presupuesto, no una tasación ni tarifas oficiales. Pueden quedarse cortos. No incluyen mantenimiento ni derramas extraordinarias; estas últimas pueden introducirse en «Otros gastos de compra».</p>
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
