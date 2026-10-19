const ROLES = [['buyer1','Tú'],['buyer2','Tu hermano'],['mother','Tu madre'],['sister','Tu hermana']];

export function renderPersonalCommitments(scenario, timeline, {euro, esc}) {
  const plan=timeline.plan||scenario.familyPlan||{}, items=plan.personalCommitments||[], receipt=plan.extraordinaryReceipt||{};
  const field=(label,path,value,{type='number',nullable=false,scale=1,hint=''}={})=>`<label>${esc(label)}<input type="${type}"${type==='number'?' min="0" step="any"':''} data-field="${esc(path)}"${nullable?' data-nullable="true"':''}${scale!==1?` data-scale="${scale}"`:''} value="${esc(value==null?'':type==='number'?value*scale:value)}">${hint?`<span class="fine-print">${esc(hint)}</span>`:''}</label>`;
  const check=(label,path,value)=>`<label class="check"><input type="checkbox" data-field="${esc(path)}"${value?' checked':''}>${esc(label)}</label>`;
  const summary=timeline.extraordinarySettlement, tickets=plan.publicTransport||{};
  const money=value=>typeof value==='number'&&Number.isFinite(value)?esc(euro(value,2)):'Por completar';
  return `<details class="card personal-commitments-settings"><summary>Mis pagos personales y la cancelación prevista</summary><p>Estos pagos conservan su titular. Una cuota de deuda entra en el esfuerzo bancario; un gasto personal, como autónomos, reduce el dinero disponible sin convertirse en préstamo. La cuota personal principal se edita en el calendario de abajo.</p>${items.map((item,index)=>{
    const path=`familyPlan.personalCommitments.${index}`;
    return `<fieldset class="section-gap"><legend>${esc(item.label)}</legend><div class="form-grid">
      ${field('Nombre',path+'.label',item.label,{type:'text'})}
      <label>A cargo de<select data-field="${path}.owner">${ROLES.map(([id,label])=>`<option value="${id}"${item.owner===id?' selected':''}>${esc(label)}</option>`).join('')}</select></label>
      ${field('Pago mensual',path+'.monthly',item.monthly)}
      <label>Tipo de pago<select data-field="${path}.kind"><option value="debt"${item.kind==='debt'?' selected':''}>Deuda · cuota de préstamo o financiación</option><option value="expense"${item.kind==='expense'?' selected':''}>Gasto personal · sin préstamo</option></select></label>
      ${field('Último mes de pago · opcional',path+'.endMonth',item.endMonth,{type:'month',nullable:true})}
      ${item.kind==='debt'?`${field('Capital estimado para cancelar',path+'.payoffEstimate',item.payoffEstimate,{nullable:true,hint:'Usa el saldo de cancelación del prestamista. El calendario conserva esta estimación; no resta cuotas enteras del capital.'})}${field('Comisión de cancelación estimada (%)',path+'.payoffFeeRate',item.payoffFeeRate,{scale:100})}<div class="full">${check('Cancelar con el cobro extraordinario previsto',path+'.settleWithReceipt',item.settleWithReceipt)}</div>`:''}
    </div><button type="button" class="card-link danger" data-action="remove-personal-commitment" data-id="${esc(item.id)}">Quitar este pago</button></fieldset>`;
  }).join('')}<div class="inline-actions"><button type="button" class="button secondary" data-action="add-personal-commitment">Añadir pago personal</button></div>
  <div class="section-gap"><h3>Cobro extraordinario y cancelación</h3>${check('Simular el cobro y la cancelación de las deudas seleccionadas','familyPlan.extraordinaryReceipt.enabled',receipt.enabled)}<div class="form-grid">
    ${field('Mes previsto del cobro','familyPlan.extraordinaryReceipt.month',receipt.month,{type:'month',nullable:true})}
    ${field('Importe previsto del cobro','familyPlan.extraordinaryReceipt.amount',receipt.amount||0)}
    ${field('Reserva fiscal de ese cobro · pendiente de concretar','familyPlan.extraordinaryReceipt.taxReserve',receipt.taxReserve||0,{hint:'Una reserva a 0 € no confirma que el cobro esté exento. Se mantiene aparte del dinero para cancelar deudas.'})}
    <label>Quién recibe el cobro<select data-field="familyPlan.extraordinaryReceipt.owner">${ROLES.map(([id,label])=>`<option value="${id}"${(receipt.owner||'buyer1')===id?' selected':''}>${esc(label)}</option>`).join('')}</select></label>
  </div>${check('Cobro recibido y cancelaciones comprobadas','familyPlan.extraordinaryReceipt.confirmed',receipt.confirmed)}<p class="fine-print">La hipótesis cancela las deudas al inicio del mes elegido, solo si alcanza para todas. No aumenta la nómina ni los ahorros para comprar. Si cambia el cobro o no llega, desactiva la simulación. Los saldos de cancelación y su fiscalidad siguen pendientes de comprobar.</p>
  ${summary?.planned?`<dl class="capacity-cost-list"><div><dt>Cobro previsto</dt><dd>${money(summary.receiptAmount)}</dd></div><div><dt>Reserva fiscal apartada</dt><dd>${money(summary.taxReserve??0)}</dd></div><div><dt>Cancelación estimada · incluye comisiones</dt><dd>${money(summary.totalPayoffEstimate)}</dd></div><div><dt>Resto extraordinario estimado</dt><dd>${money(summary.estimatedRemainder)}</dd></div></dl>${!summary.canSettle?'<p class="notice error">El cobro no cubre todas las cancelaciones o faltan saldos. Las cuotas continúan en el calendario.</p>':'<p class="fine-print">Las cuotas seleccionadas dejan de cobrarse desde ese mes en esta hipótesis. El resto es dinero extraordinario de una sola vez.</p>'}`:''}</div>
  <div class="section-gap"><h3>Abonos de transporte público</h3><p>Reserva mensual: divide entre tres el coste de un abono trimestral. Son gastos personales, separados de la gasolina y de la cuota del préstamo del coche.</p><div class="form-grid">
    ${field('Abono de tu hermano · equivalente mensual','familyPlan.publicTransport.buyer2Monthly',tickets.buyer2Monthly||0)}
    ${field('Abono de tu madre · al mes','familyPlan.publicTransport.motherMonthly',tickets.motherMonthly||0)}
    ${field('Abono de tu hermana · equivalente mensual','familyPlan.publicTransport.sisterMonthly',tickets.sisterMonthly||0)}
    ${field('Parte del abono de tu hermana que paga mamá antes de comprar (%)','familyPlan.publicTransport.sisterBeforePurchaseMotherShare',tickets.sisterBeforePurchaseMotherShare??.5,{scale:100,hint:'Después de comprar lo paga tu hermana. Si aún no tiene ingresos, el calendario muestra el déficit.'})}
  </div></div></details>`;
}
