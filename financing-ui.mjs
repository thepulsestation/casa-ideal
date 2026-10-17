import {monthlyPayment, compareFamilyLoanTerms} from './finance.mjs?v=14';

// Apply the financing plan requested by the family once to legacy scenarios.
// Eligibility remains unconfirmed; later edits (including disabling ICF) win.
export function adoptFamilyFinancingPlan(scenario) {
  const s=structuredClone(scenario);
  if(s.financingPlanVersion===2)return s;
  s.financingPlanVersion=2;
  s.financingPlanUpdated=true;
  s.mortgage={...s.mortgage,ltv:.8,amount:null};
  s.icf={...s.icf,enabled:true,ltv:.2,maxAmount:50000,repaymentYears:5,eligibilityConfirmed:false};
  s.familyLoan={...s.familyLoan,enabled:true,amount:null,maxAmount:60000,extraBuffer:3000,rate:s.familyLoan?.rate??5,years:s.familyLoan?.years??10,assumedTerms:s.familyLoan?.assumedTerms!==false||s.familyLoan?.rate==null||s.familyLoan?.years==null};
  s.motherTransfer={...s.motherTransfer,mode:'family-loan',repaymentMode:'same-as-bank'};
  return s;
}

// Verbal breakdown supplied by the family; never switches products on or quotes premiums.
export function adoptDiscountBreakdown(scenario) {
  if(scenario.discountBreakdownVersion===1)return scenario;
  const s=structuredClone(scenario);
  for(const d of s.mortgage.discounts)if(['home','protection'].includes(d.id)&&d.points==null)d.points=.1;
  s.discountBreakdownVersion=1;
  return s;
}

export function renderFinancingBreakdown(s,r,{euro,pct,notice,row,compact=false}) {
  const price=s.purchasePrice, icf=r.icf.principal, remaining=r.cash.priceContribution;
  return `<section class="card financing-plan"><div class="card-head"><div><h2>Quién financia el precio de la vivienda</h2><p>Precio y gastos de compra se calculan por separado.</p></div><span class="pill">${s.icf.enabled?'PLAN CON ICF':'SIN ICF'}</span></div><div class="funding-grid"><div><span>Hipoteca Sabadell · ${pct(price?r.mortgage.principal/price:0)}</span><strong>${euro(r.mortgage.principal)}</strong></div><div><span>Préstamo ICF · ${pct(price?icf/price:0)}</span><strong>${euro(icf)}</strong></div><div><span>Precio todavía sin financiar</span><strong>${euro(remaining)}</strong></div></div>
  ${s.icf.enabled?notice(`El ICF aporta hasta el 20 % del menor entre precio y tasación, con tope de 50.000 €. <strong>Es un préstamo al 0 %, no una subvención.</strong> Ahora no tiene cuota; después de la hipoteca se devolverían ${euro(icf)} en ${r.icf.repaymentYears} años: ${euro(r.icf.deferredMonthlyPayment,2)}/mes. ${s.icf.eligibilityConfirmed?'Requisitos marcados como comprobados; falta la resolución y el desembolso que correspondan.':'Esta simulación depende de cumplir los requisitos y obtener la concesión.'}`,'info'):notice('Sin ICF, mamá o vuestros ahorros también tendrían que cubrir la parte del precio que no financia la hipoteca.')}
  ${s.financingPlanUpdated&&s.icf.enabled&&s.mortgage.ltv===.8?'<p class="fine-print">Plan actualizado: 80 % de hipoteca y hasta 20 % de ICF. La cuota de mamá se recalcula para los gastos que quedan fuera y el colchón de 3.000 €. Podéis cambiar este supuesto en Hipoteca y préstamo.</p>':''}
  ${compact?'<button class="card-link" data-view="hipoteca">Ajustar ICF, préstamo de mamá y plazos →</button>':''}</section>`;
}

export function renderFamilyLoanTerms(s,r,{euro,pct,notice}) {
  if(s.familyLoan.rate===null||s.familyLoan.rate===undefined)return notice('Introduce el TIN del préstamo de mamá para comparar los plazos. No se presupone un tipo si lo has dejado pendiente.','info');
  const terms=compareFamilyLoanTerms(s,[8,10,15,20]);
  return `<div class="section-gap"><h3>Elegid un plazo para el préstamo de mamá</h3><p>Se recalcula con el mismo capital y TIN introducidos. Un plazo más largo baja la cuota y aumenta los intereses.</p><div class="table-wrap"><table><thead><tr><th>Plazo</th><th class="number">Cuota /mes</th><th class="number">Intereses totales</th><th class="number">Deudas de titulares</th><th></th></tr></thead><tbody>${terms.map(t=>`<tr><td>${t.years} años</td><td class="number">${euro(t.monthlyPayment,2)}</td><td class="number">${euro(t.totalInterest,2)}</td><td class="number">${t.result?.budget?.borrowerDebtRatioIncomplete?'≥ ':''}${pct(t.borrowerDebtRatio)}</td><td><button class="button secondary" data-action="loan-term" data-years="${t.years}">${Number(s.familyLoan.years)===t.years?'Seleccionado':'Usar '+t.years+' años'}</button></td></tr>`).join('')}</tbody></table></div>${notice('Incluimos 8 años. Ejemplo provisional: 20.000 € al 12 % TIN, sin comisiones, son 325,06 €/mes. Falta saber si el 12 % comunicado es TIN o TAE. Los plazos de 10, 15 y 20 años son hipótesis de comparación. No se ha verificado que el banco ofrezca esos plazos ni ese TIN a mamá. Su edad, ingresos, deudas, comisiones y TAE pueden cambiar las condiciones.','info')}</div>`;
}

export function renderBorrowerDebt(s,r,{euro,pct,notice,row,esc}) {
  const b=r.budget, limit=b.regularIncome*b.debtRatioLimit, headroom=limit-b.borrowerDebtMonthly;
  const known=!b.borrowerDebtRatioIncomplete&&b.regularIncome>0;
  const shareRows=s.tax.buyers.map((buyer,i)=>row(`${esc(buyer.label||'Titular '+(i+1))} · reparto ${pct(buyer.share)}`,`${euro(r.mortgage.monthlyPayment*buyer.share,2)} de hipoteca + ${euro(r.motherTransfer.familyMonthlyRepayment===null?null:r.motherTransfer.allocations?.[i]?.monthlyRepayment??r.motherTransfer.familyMonthlyRepayment*buyer.share,2)} a mamá`)).join('');
  return `<section class="card"><h2>Las deudas de los dos titulares ante el banco</h2><p>Se usan vuestras dos nóminas ordinarias. Los ingresos de mamá y vuestra hermana se reservan para el presupuesto del hogar.</p><div class="breakdown">${row('Hipoteca mensual',euro(r.mortgage.monthlyPayment,2))}${row('Vuestras deudas actuales',euro(b.existingDebtMonthly,2))}${row('Devolución mensual de hijos a mamá',euro(r.motherTransfer.familyMonthlyRepayment,2))}${row('Deudas mensuales de los titulares',euro(b.borrowerDebtMonthly,2),'total')}${row('Ingresos ordinarios de los titulares',euro(b.regularIncome,2))}${row(`Referencia de esfuerzo · ${pct(b.debtRatioLimit)}`,euro(limit,2))}${row('Esfuerzo calculado',`${known?'':'≥ '}${pct(b.debtRatio)}`)}${row(headroom>=0?'Margen hasta esa referencia':'Exceso sobre esa referencia',euro(Math.abs(headroom),2))}</div>${notice(known?`Con los datos y contratos simulados ${headroom>=0?'no se supera':'se supera'} el ${pct(b.debtRatioLimit)} elegido. Es una referencia de cálculo, no una aprobación: Sabadell debe confirmar cómo valora vuestras deudas y el préstamo familiar.`:'Faltan ingresos o el calendario de devolución a mamá: todavía no se puede completar el esfuerzo de los titulares.',known&&headroom>=0?'info':'')}<details class="section-gap"><summary>Reparto orientativo entre titulares</summary><div class="breakdown">${shareRows}</div><p class="fine-print">Es un reparto del presupuesto según los porcentajes de propiedad y de entrega. No limita por sí mismo la responsabilidad de cada deudor: la escritura hipotecaria y el contrato familiar determinan las obligaciones.</p></details></section>`;
}

export function renderMortgageRateExample(s,r,{euro}) {
  const maxRate=Math.max(0,s.mortgage.baseRate-s.mortgage.maxDiscountPoints);
  const maxPayment=monthlyPayment(r.mortgage.principal,maxRate,s.mortgage.years);
  return `<p class="fine-print">Con este capital y ${s.mortgage.years} años: ${euro(r.bonuses.noBonusMortgage.monthlyPayment,2)}/mes al ${s.mortgage.baseRate} % sin bonificar, o ${euro(maxPayment,2)}/mes al ${maxRate} % si se confirma toda la bonificación. Los seguros van aparte. La cuota del ejemplo de una casa de 250.000 € no es la de este piso.</p>`;
}
