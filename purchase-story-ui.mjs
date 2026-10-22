const finite = value => typeof value === 'number' && Number.isFinite(value);
const list = value => Array.isArray(value) ? value : [];
const fallbackEscape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const CASES = [
  {id:'gift',number:1,title:'Mamá nos dona el dinero',short:'Donación',detail:'Los titulares no tienen una devolución mensual a mamá. Su cuota bancaria permanece en el presupuesto familiar.'},
  {id:'interest',number:2,title:'Devolvemos capital e intereses',short:'Con intereses',detail:'Los titulares devuelven conjuntamente una cuota equivalente a la que mamá paga a su banco.'},
  {id:'principal',number:3,title:'Devolvemos solo el capital',short:'Sin intereses para los hijos',detail:'Los titulares devuelven el capital a un 0 %. Mamá asume la diferencia respecto a su cuota bancaria.'},
];
const BANKS = [{id:'sabadell',name:'Sabadell'},{id:'santander',name:'Santander'}];
const MODES = [
  {id:'fixed',title:'1. Mantener el préstamo actual',detail:'Mamá pide el capital de referencia, con el límite que tiene ahora.'},
  {id:'negotiate',title:'2. Negociar el préstamo',detail:'Ajustamos el capital necesario, su límite y el plazo, manteniendo el gasto actual.'},
  {id:'budget',title:'3. Dar más margen al mes',detail:'Además de negociar el préstamo, permitimos el aumento de gasto que decidáis.'},
];

/** A single decision story; every financial figure comes from the shared model. */
export function renderPurchaseStory(model = {}, helpers = {}) {
  const esc = helpers.esc || fallbackEscape;
  const euro = helpers.euro || ((value, digits=0) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value));
  const pct = helpers.pct || (value => new Intl.NumberFormat('es-ES',{style:'percent',maximumFractionDigits:2}).format(value));
  const money = (value, digits=0) => finite(value) ? esc(euro(value,digits)) : 'Por completar';
  const percent = value => finite(value) ? esc(pct(value)) : 'Por completar';
  const settings = model.settings || {}, budget = model.currentBudget || {};
  const rows = list(model.rows), hypotheses = list(model.hypotheses);
  const selected = model.selected || rows.find(row => row.bankId===settings.selectedBank && row.caseId===settings.selectedCase) || rows[0] || {};
  const reference = selected.reference || {}, actual = selected.actual || null;
  const mother = model.referenceMother || {};
  const bankName = id => BANKS.find(bank=>bank.id===id)?.name || 'Banco';
  const caseName = id => CASES.find(item=>item.id===id)?.short || 'Supuesto';
  const fieldValue = path => path.split('.').reduce((value,key)=>value?.[key],settings);
  const number = (label,path,{suffix='€',scale=1,min=0,max,step='any',hint='',nullable=false,type='number'}={}) => {
    const value=fieldValue(path),displayed=value==null?'':type==='number'&&finite(value)?Number((value*scale).toFixed(6)):value;
    return `<label class="ps-field"><span>${esc(label)}${suffix?` <small>${esc(suffix)}</small>`:''}</span><input type="${type}" data-field="purchaseStory.${esc(path)}"${scale!==1?` data-scale="${scale}"`:''}${nullable?' data-nullable="true"':''}${type==='number'?` min="${min}"${max===undefined?'':` max="${max}"`} step="${step}"`:''} value="${esc(displayed)}">${hint?`<small>${esc(hint)}</small>`:''}</label>`;
  };
  const radio = (path,id,name,body,checked) => `<label class="ps-choice${checked?' is-selected':''}"><input type="radio" name="${name}" data-field="purchaseStory.${path}" value="${id}"${checked?' checked':''}><span>${body}</span></label>`;
  const metric = (label,value,detail='',kind='') => `<div class="ps-metric${kind?' ps-metric--'+kind:''}"><small>${esc(label)}</small><strong>${value}</strong>${detail?`<span>${esc(detail)}</span>`:''}</div>`;
  const heading = (n,title,detail) => `<header class="ps-step-heading"><span class="ps-step-number">${n}</span><div><h2>${title}</h2>${detail?`<p>${detail}</p>`:''}</div></header>`;
  const change = value => !finite(value) ? 'Por completar' : Math.abs(value)<.005 ? 'Sin cambio' : `${value>0?'+':'−'}${money(Math.abs(value),2)}`;
  const differenceClass = value => finite(value) && value>.005 ? 'ps-increase' : 'ps-decrease';
  const componentLabels={rent:'Alquiler',utilities:'Agua, energía e internet',food:'Comida',familyInsurance:'Seguro familiar',car:'Gasolina y transporte del presupuesto',existingDebt:'Deudas actuales',university:'Universidad',personalExpenses:'Pagos personales',publicTransport:'Abonos de transporte',other:'Trastero y otros gastos'};
  const components=Object.entries(budget.components||{}).filter(([,value])=>finite(value)&&Math.abs(value)>.005);
  const positive = finite(selected.maxPrice) && selected.maxPrice>0 && actual;
  const pending = [...new Set(list(actual?.missingQuotes || reference.missingQuotes).map(item=>typeof item==='string'?item:item?.label||item?.message).filter(Boolean))];
  const referenceAmount=mother.principal ?? settings.referenceMotherAmount;
  const interestDifference=finite(mother.monthly)&&finite(mother.principalOnlyMonthly)?mother.monthly-mother.principalOnlyMonthly:null;
  const personRows=list(actual?.people);
  const ownershipTotal=finite(settings.ownershipAnnual)&&finite(settings.wasteAnnual)?(settings.ownershipAnnual+settings.wasteAnnual)/12+(finite(settings.communityMonthly)?settings.communityMonthly:0):null;
  const fundingItems=actual?[
    ['Precio pendiente de financiar',actual.priceContribution],['ITP',actual.tax],['Provisión de compra',actual.fees],
    ...(actual.moving>0?[['Mudanza',actual.moving]]:[]),
    ...(actual.giftTax>0?[['Impuesto de donación',actual.giftTax]]:[]),
    ...(actual.giftNotaryCost>0?[['Formalización de la donación',actual.giftNotaryCost]]:[]),
    ['Colchón conservado',actual.buffer],
    ...(actual.result?.cash?.earlyLiquidityExtraBorrowing>0?[['Liquidez adicional para adelantos',actual.result.cash.earlyLiquidityExtraBorrowing]]:[]),
    ['Capital necesario de mamá',actual.motherRequired],['Capital que pide mamá',actual.motherPrincipal],
  ]:[];

  const currentPeople=list(budget.people);
  const currentPeopleHtml=currentPeople.length?`<div class="ps-table-wrap"><table class="ps-table ps-person-table"><caption>Qué entra y qué gasta cada uno hoy</caption><thead><tr><th>Persona</th><th class="ps-number">Ingreso</th><th class="ps-number">Gasto a su cargo</th><th class="ps-number">Disponible</th></tr></thead><tbody>${currentPeople.map(person=>`<tr><th scope="row">${esc(person.label||person.id||'Persona')}</th><td class="ps-number">${money(person.income,2)}</td><td class="ps-number">${money(person.cost,2)}</td><td class="ps-number${finite(person.remaining)&&person.remaining<0?' ps-increase':''}">${money(person.remaining,2)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="ps-note">Completa el presupuesto para ver el reparto.</p>';
  const referenceRows=rows.map(row=>{
    const r=row.reference||{},active=row.bankId===selected.bankId&&row.caseId===selected.caseId;
    return `<tr${active?' class="is-selected"':''}><th scope="row">${esc(bankName(row.bankId))}<small>${esc(caseName(row.caseId))}</small></th><td class="ps-number">${money(r.mortgageCapacityMonthly,2)}</td><td class="ps-number">${money(r.mortgagePrincipal)}</td><td class="ps-number ps-price">${money(r.purchasePrice)}</td><td class="ps-number">${money(r.priceContribution)}</td><td class="ps-number">${money(r.motherRequired)}</td></tr>`;
  }).join('');

  return `<section class="purchase-story" aria-label="De nuestro presupuesto a una vivienda viable">
  <div class="ps-intro"><div><span class="ps-eyebrow">NUESTRO PLAN DE COMPRA</span><h2>Primero los números de casa. Después, la vivienda.</h2><p>Un recorrido con las mismas reglas para Sabadell y Santander.</p></div><button class="button secondary" data-view="presentacion">Ver presentación →</button></div>
  ${list(model.errors).length?`<div class="ps-alert is-error" role="alert"><strong>Hay datos que revisar</strong><ul>${list(model.errors).map(error=>`<li>${esc(typeof error==='string'?error:error?.message||'Dato pendiente')}</li>`).join('')}</ul></div>`:''}

  <section class="card ps-step" id="purchase-story-budget">${heading(1,'Así vivimos hoy','Ingresos y gastos reales del hogar, sin convertir pagas extra en un sueldo mensual.')}
    <div class="ps-metrics ps-metrics--three">${metric('Ingresos ordinarios / mes',money(budget.incomeMonthly,2))}${metric('Gastos actuales / mes',money(budget.totalMonthly,2),'La referencia para mantener nuestro nivel de gasto','forest')}${metric('Disponible / mes',money(budget.remainingMonthly,2),'No significa que todo se ahorre')}</div>
    <details class="ps-details"><summary>Ver el reparto y en qué se gasta</summary>${currentPeopleHtml}<dl class="ps-cost-list">${components.map(([key,value])=>`<div><dt>${esc(componentLabels[key]||key)}</dt><dd>${money(value,2)}</dd></div>`).join('')}</dl><p class="ps-note">Las aportaciones entre familiares se descuentan de quien las recibe: no son ingresos nuevos ni gastos duplicados.</p><div class="inline-actions"><button class="button secondary" data-view="presupuesto">Editar ingresos y gastos</button><button class="button secondary" data-view="reparto">Ver el calendario por persona</button></div></details>
  </section>

  <section class="card ps-step" id="purchase-story-rules">${heading(2,'Las reglas de nuestra compra','El precio, los gastos de firma y el gasto mensual son cosas distintas.')}
    <div class="ps-rule-strip"><div><span>ICF</span><strong>Hasta ${percent(settings.icfLtv)} · tope ${money(settings.icfMaxAmount)}</strong><small>Préstamo para parte del precio</small></div><div><span>ITP de los dos titulares</span><strong>${percent(settings.itpRate)} cada uno</strong><small>Aplicado a la parte que compra cada titular</small></div><div><span>Gastos de compra</span><strong>${finite(settings.provisionPercent)?esc(String(settings.provisionPercent)):'—'} % del precio</strong><small>Provisión aparte del ITP</small></div><div><span>Préstamo de referencia de mamá</span><strong>${money(referenceAmount)}</strong><small>${finite(settings.motherYears)?esc(String(settings.motherYears)):'—'} años · TIN ${finite(settings.motherRate)?esc(String(settings.motherRate).replace('.',',')):'—'} %</small></div></div>
    <p class="ps-note">Reservamos ${money(settings.ownershipAnnual)} al año para <strong>IBI y reparaciones juntos</strong>, más ${money(settings.wasteAnnual)} de residuos y ${money(settings.communityMonthly,2)}/mes de comunidad si existe: ${money(ownershipTotal,2)}/mes en total. El colchón de ${money(settings.buffer)} sigue separado. Ahorros aplicados a la compra: ${money(settings.cashSavings)}.</p>
    <details class="ps-details"><summary>Ajustar reglas, fechas y reservas</summary><div class="ps-form-grid">
      ${number('Deuda de los titulares al comprar','bankDebtMonthly',{hint:'Se usa en el límite bancario. El presupuesto actual conserva sus propios pagos.'})}
      ${number('Referencia de deuda sobre las nóminas','debtRatioLimit',{suffix:'%',scale:100,max:100})}
      ${number('ICF · porcentaje máximo','icfLtv',{suffix:'%',scale:100,max:100})}${number('ICF · importe máximo','icfMaxAmount')}
      ${number('ITP de cada titular','itpRate',{suffix:'%',scale:100,max:100})}${number('Provisión de compra','provisionPercent',{suffix:'% del precio',max:100})}
      ${number('IBI y reparaciones juntos','ownershipAnnual',{suffix:'€/año',hint:'Una sola reserva conjunta; no se vuelve a sumar mantenimiento.'})}${number('Residuos','wasteAnnual',{suffix:'€/año'})}
      ${number('Comunidad, si existe','communityMonthly',{suffix:'€/mes',hint:'Parte de 0 como hipótesis. Comprueba el recibo de cada vivienda.'})}
      ${number('Colchón conservado','buffer')}${number('Ahorros aplicados a la compra','cashSavings',{hint:'Solo dinero ya disponible. El ahorro previsto no se aplica automáticamente.'})}${number('Mudanza','moving')}${number('Arras sobre el precio','depositPercent',{suffix:'%',scale:100,max:100,hint:'Son parte del precio; pueden exigir dinero antes de la firma.'})}
      ${number('Seguro de hogar adicional','homeInsuranceAnnual',{suffix:'€/año',nullable:true,hint:'Reserva editable, no cotización ni bonificación. No repitas el seguro familiar ya incluido en gastos.'})}
      ${number('Mes del presupuesto actual','referenceMonth',{type:'month',suffix:''})}${number('Mes de compra','purchaseMonth',{type:'month',suffix:''})}
    </div><label class="ps-check"><input type="checkbox" data-field="purchaseStory.homeInsuranceConfirmed"${settings.homeInsuranceConfirmed?' checked':''}><span>Tengo un presupuesto confirmado del seguro de hogar adicional</span></label><p class="ps-note">ICF, tipo reducido de ITP y financiación requieren comprobar los requisitos. Una donación también necesita revisar su fiscalidad.</p></details>
  </section>

  <section class="card ps-step" id="purchase-story-banks">${heading(3,'Dos bancos, con la nómina ya bonificada','Estos TIN son la referencia indicada por la familia. Los seguros no añaden otra bonificación en este primer cálculo.')}
    <div class="ps-bank-grid">${BANKS.map(bank=>{const offer=settings.offers?.[bank.id]||{};return `<article class="ps-bank-card">${radio('selectedBank',bank.id,'ps-bank',`<strong>${bank.name}</strong><small>Usar este banco en el resultado final</small>`,settings.selectedBank===bank.id)}<div class="ps-bank-metrics"><div><span>TIN con nómina</span><strong>${finite(offer.rate)?esc(String(offer.rate).replace('.',',')):'—'} %</strong></div><div><span>Financia el banco</span><strong>${percent(offer.ltv)}</strong></div></div><details class="ps-details"><summary>Editar esta condición</summary><div class="ps-form-grid">${number('TIN con nómina',`offers.${bank.id}.rate`,{suffix:'%',max:30})}${number('Financiación bancaria con ICF',`offers.${bank.id}.ltv`,{suffix:'%',scale:100,max:100})}${number('Plazo hipotecario',`offers.${bank.id}.years`,{suffix:'años',max:40,step:1})}</div></details></article>`;}).join('')}</div>
    <p class="ps-note">Santander al ${percent(settings.offers?.santander?.ltv)} puede dejar una parte del precio sin financiar incluso con ICF. Además, cuando el ICF llega a su tope, el importe propio aumenta.</p>
  </section>

  <section class="card ps-step" id="purchase-story-hypotheses">${heading(4,'Qué cuota permite el banco en cada supuesto','El límite parte solo de las nóminas de los dos titulares; la aportación de mamá al hogar se ve en el presupuesto familiar.')}
    <div class="ps-equation"><span>${money(model.bankIncome,2)} <small>nóminas de los titulares</small></span><b>×</b><span>${percent(model.debtLimitRatio??settings.debtRatioLimit??.35)} <small>referencia de deuda</small></span><b>−</b><span>${money(model.bankDebtMonthly??settings.bankDebtMonthly,2)} <small>deuda al comprar</small></span><b>=</b><span>${money(hypotheses.find(item=>item.id==='gift')?.mortgageCapacityMonthly,2)} <small>antes de devolver a mamá</small></span></div>
    <div class="ps-case-grid">${CASES.map(item=>{const hypothesis=hypotheses.find(row=>row.id===item.id)||{};return radio('selectedCase',item.id,'ps-case',`<span class="ps-case-kicker">SUPUESTO ${item.number}</span><strong>${item.title}</strong><span class="ps-case-amount">${money(hypothesis.mortgageCapacityMonthly,2)} <small>/mes de hipoteca</small></span><small>Devolución conjunta a mamá: ${money(hypothesis.repaymentMonthly,2)}/mes</small><span class="ps-case-detail">${item.detail}</span>`,settings.selectedCase===item.id);}).join('')}</div>
    <p class="ps-note">Con el capital de referencia, mamá paga ${money(mother.monthly,2)}/mes al banco. Devolver solo capital son ${money(mother.principalOnlyMonthly,2)}/mes: ella cubre la diferencia de ${money(interestDifference,2)} entre cuotas. Esa diferencia no es el interés bancario exacto de cada mes.</p>
  </section>

  <section class="card ps-step" id="purchase-story-theory">${heading(5,'De la cuota al precio teórico','Esta primera tabla aplica el límite bancario. Todavía puede faltar dinero para comprar.')}
    <div class="ps-table-wrap"><table class="ps-table ps-theory-table"><caption>Dos bancos × tres supuestos · préstamo de referencia de ${money(referenceAmount)}</caption><thead><tr><th>Banco y supuesto</th><th class="ps-number">Cuota límite</th><th class="ps-number">Hipoteca máxima</th><th class="ps-number">Precio teórico</th><th class="ps-number">Precio fuera de banco e ICF</th><th class="ps-number">Necesitaría mamá</th></tr></thead><tbody>${referenceRows||'<tr><td colspan="6">Completa las reglas para comparar los seis supuestos.</td></tr>'}</tbody></table></div>
    <div class="ps-reference-summary"><strong>${esc(bankName(selected.bankId))} · ${esc(caseName(selected.caseId))}</strong><span>ICF: ${money(reference.icfPrincipal)}</span><span>ITP: ${money(reference.tax)}</span><span>Provisión: ${money(reference.fees)}</span><span class="${finite(reference.shortfall)&&reference.shortfall>.005?'ps-increase':''}">Falta sobre el préstamo de referencia: ${money(reference.shortfall)}</span></div>
    <p class="ps-note">«Precio fuera de banco e ICF» es parte del precio, no el ITP ni los gastos. «Necesitaría mamá» reúne ese importe, impuestos, provisión, otros pagos iniciales y el colchón, comprobando también las arras.</p>
  </section>

  <section class="card ps-step ps-final-step" id="purchase-story-result">${heading(6,'Ahora sí: una compra que encaje','Recalculamos la hipoteca y el préstamo de mamá juntos, hasta respetar el dinero inicial, la deuda y el gasto elegido.')}
    <div class="ps-mode-grid">${MODES.map(mode=>radio('mode',mode.id,'ps-mode',`<strong>${mode.title}</strong><small>${mode.detail}</small>`,settings.mode===mode.id)).join('')}</div>
    <div class="ps-loan-controls">${settings.mode==='fixed'?`<div class="ps-fixed-loan"><span>Capital fijo de mamá</span><strong>${money(referenceAmount)}</strong><small>La cuota se mantiene aunque para una vivienda más barata hiciera falta menos capital.</small></div>`:number('Límite que intentaríamos negociar','motherLoanCap',{hint:'Es una hipótesis de negociación, no una ampliación concedida.'})}${number('TIN bancario de mamá','motherRate',{suffix:'%',max:50,nullable:true})}${number('Plazo de devolución de mamá','motherYears',{suffix:'años',max:40,step:1})}${settings.mode==='budget'?number('Aumento máximo del gasto familiar','allowedExtraMonthly',{suffix:'€/mes',hint:'Solo amplía el presupuesto mensual elegido; se siguen comprobando deuda y dinero inicial.'}):''}</div>
    <div class="ps-result"><div><span class="ps-eyebrow">${esc(bankName(selected.bankId))} · ${esc(caseName(selected.caseId))}</span><h3>${positive?'Hasta '+money(selected.maxPrice):'Necesitamos ajustar el plan'}</h3><p>${positive?'Precio que cumple los límites con los importes introducidos.':esc(selected.reason||'No hay una compra positiva que cumpla todos los límites configurados.')}</p><span class="ps-provisional">Simulación · sujeta a confirmaciones</span></div><div class="ps-result-metrics">${metric('Hipoteca / mes',money(actual?.monthlyMortgage,2))}${metric('Mamá pide',money(actual?.motherPrincipal))}${metric('Mamá paga al banco / mes',money(actual?.motherMonthly,2))}${metric('Esfuerzo de los titulares',percent(actual?.bankDebtRatio))}</div></div>
    <div class="ps-metrics ps-metrics--three">${metric('Gasto actual / mes',money(budget.totalMonthly,2))}${metric('Gasto al comprar / mes',money(actual?.budgetTotal,2))}${metric('Cambio del gasto familiar',change(actual?.budgetChange),'Con los mismos gastos de vida',finite(actual?.budgetChange)&&actual.budgetChange>.005?'warning':'forest')}</div>
    ${positive?`<details class="ps-details"><summary>Ver el dinero inicial y lo que pagaría cada persona</summary><div class="ps-funding-grid">${fundingItems.map(([label,value])=>metric(label,money(value))).join('')}</div>${personRows.length?`<div class="ps-table-wrap"><table class="ps-table ps-person-table"><caption>Gasto mensual después de comprar</caption><thead><tr><th>Persona</th><th class="ps-number">Gasto</th><th class="ps-number">Disponible</th></tr></thead><tbody>${personRows.map(person=>`<tr><th scope="row">${esc(person.label||person.id||'Persona')}</th><td class="ps-number">${money(person.purchaseCost??person.cost,2)}</td><td class="ps-number${finite(person.purchaseRemaining??person.remaining)&&(person.purchaseRemaining??person.remaining)<0?' ps-increase':''}">${money(person.purchaseRemaining??person.remaining,2)}</td></tr>`).join('')}</tbody></table></div>`:''}<p class="ps-note">El reparto familiar no cambia quién debe legalmente cada préstamo. La cuota bancaria de mamá se cuenta una sola vez en el hogar.</p></details>`:''}
    ${pending.length?`<details class="ps-details ps-pending"><summary>Importes por confirmar (${pending.length})</summary><ul>${pending.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details>`:''}
    <details class="ps-details ps-pending"><summary>Para confirmar después</summary><ul><li>La reserva conjunta de ${money(settings.ownershipAnnual)} para IBI y conservación y los ${money(settings.wasteAnnual)} de residuos son anuales y orientativos; hay que comprobarlos para cada municipio y vivienda. Comunidad: ${money(settings.communityMonthly,2)}/mes; el importe inicial de 0 es una hipótesis pendiente de revisar para cada inmueble.</li><li>Hogar adicional: ${money(settings.homeInsuranceAnnual)} al año como reserva${settings.homeInsuranceConfirmed?' marcada como presupuestada':' pendiente de presupuesto'}. No es una bonificación añadida al TIN.</li><li>Condiciones comunicadas: Sabadell ${finite(settings.offers?.sabadell?.rate)?esc(String(settings.offers.sabadell.rate).replace('.',',')):'—'} % con nómina y ${percent(settings.offers?.sabadell?.ltv)} de financiación; Santander ${finite(settings.offers?.santander?.rate)?esc(String(settings.offers.santander.rate).replace('.',',')):'—'} % y ${percent(settings.offers?.santander?.ltv)}. Deben confirmarse en la oferta escrita.</li><li>El banco debe aceptar el origen de los fondos de mamá y valorar la devolución familiar. Donación y préstamo familiar requieren revisar impuestos y documentación.</li><li>Las arras son parte del precio. Hay que confirmar cuándo estarán disponibles los fondos y cómo se compensará el anticipo en la firma.</li></ul></details>
    <p class="ps-note">El precio teórico del paso anterior no cambia por falta de efectivo: muestra el límite de cuota. Este resultado final sí exige cubrir entrada, impuestos, gastos y pagos previos. Para negociar, modifica capital o plazo y vuelve a comparar los seis supuestos.</p>
    <div class="inline-actions"><button class="button secondary" data-view="presentacion">Contarlo en la presentación</button><button class="button secondary" data-view="viviendas">Ver las viviendas guardadas</button></div>
  </section></section>`;
}
