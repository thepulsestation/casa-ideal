import {euro as defaultEuro,num as defaultNum} from './format.mjs?v=37';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const array=value=>Array.isArray(value)?value:[];
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const caseNames={gift:'1 · Donación',interest:'2 · Devolvemos la cuota bancaria',principal:'3 · Devolvemos solo el capital'};
const modeNames={fixed:'Préstamo fijo de referencia',negotiate:'Negociar el préstamo',budget:'Negociar préstamo y gasto mensual'};
const personCost=value=>value?.cost??value?.currentCost;
const maximumGap=(first,second)=>finite(first)&&finite(second)?Math.max(first,second):null;

function monthLabel(value){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value||''))return 'fecha pendiente';
 const [year,month]=value.split('-').map(Number);
 return new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,15)));
}

/** The guided calculation and the presentation tell the same live story. */
export function buildPurchaseStorySlides(model={},given={}){
 const e=given.esc||escape, euro=given.euro||defaultEuro,num=given.num||defaultNum;
 const money=(value,digits=0)=>finite(value)?e(euro(value,digits)):'Pendiente';
 const plainMoney=(value,digits=0)=>finite(value)?euro(value,digits):'pendiente';
 const percent=value=>finite(value)?e(given.pct?given.pct(value):num(value*100,2)+' %'):'Pendiente';
 const annualRate=value=>finite(value)?e(num(value,2))+' %':'Pendiente';
 const settings=model.settings||{},current=model.currentBudget||{},people=array(current.people);
 const rows=array(model.rows||model.scenarios),selected=model.selected||rows.find(row=>row.bankId===settings.selectedBank&&row.caseId===settings.selectedCase)||{};
 const reference=selected.reference||{},actual=selected.actual||{},hypotheses=array(model.hypotheses),mother=model.referenceMother||{};
 const bankName=selected.bankName||'banco seleccionado',caseTitle=caseNames[selected.caseId]||selected.title||'Hipótesis pendiente';
 const quotes=[...new Set(array(actual.missingQuotes).filter(value=>typeof value==='string'))];
 const hasActual=finite(actual.purchasePrice)&&actual.purchasePrice>0;
 const extra=finite(settings.allowedExtraMonthly)?settings.allowedExtraMonthly:0;
 const monthlyCap=finite(actual.spendingCap)?actual.spendingCap:finite(current.totalMonthly)?current.totalMonthly+(settings.mode==='budget'?extra:0):null;
 const metric=(label,value,detail='',tone='')=>`<div class="story-metric${tone?' story-metric--'+e(tone):''}"><span>${e(label)}</span><strong>${value}</strong>${detail?'<small>'+e(detail)+'</small>':''}</div>`;
 const metrics=items=>'<div class="story-metrics">'+items.join('')+'</div>';
 const hint=(text,pending=false)=>'<p class="story-takeaway'+(pending?' is-pending':'')+'">'+e(text)+'</p>';
 const step=(label,title,detail)=>`<div class="story-step"><span>${e(label)}</span><strong>${e(title)}</strong><small>${e(detail)}</small></div>`;
 const table=(caption,head,body)=>`<div class="story-table-wrap"><table class="story-table"><caption>${e(caption)}</caption><thead><tr>${head.map(value=>'<th scope="col">'+e(value)+'</th>').join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
 const entry=(label,values)=>'<tr><th scope="row">'+e(label)+'</th>'+values.map(value=>'<td>'+value+'</td>').join('')+'</tr>';
 const notes=(message,next)=>message+' '+next+' Los datos y las condiciones pendientes se actualizan desde la misma aplicación; este cálculo no sustituye una oferta aprobada.';
 const slides=[],add=(id,title,body,script,takeaway)=>slides.push({id,title,body,notes:script,takeaway});

 add('story-objetivo','De nuestro presupuesto a una compra posible',
  '<div class="story-cover"><span class="story-eyebrow">Una decisión en familia</span><h3>Primero las reglas.<br>Después la vivienda.</h3></div><div class="story-flow">'+step('1','Nuestra vida actual','Ingresos y gastos reales')+step('2','Las seis combinaciones','Dos bancos y tres hipótesis')+step('3','El precio que encaja','Entrada, cuota y gasto completo')+'</div>',
  notes('Vamos a recorrer el mismo orden que hemos trabajado en la libreta: presupuesto actual, reglas de compra, condiciones de cada banco y tres maneras de aportar el dinero de mamá. Después distinguiremos la hipoteca que permite la cuota de la compra que podemos financiar de verdad.','Empezamos por los ingresos y los gastos que ya tenemos.'),
  'La cuota, el dinero inicial y el presupuesto familiar deben encajar juntos.');

 add('story-presupuesto','Este es el dinero con el que vivimos',
  metrics([metric('Ingresos ordinarios del hogar',money(current.incomeMonthly,2)),metric('Gastos actuales / mes',money(current.totalMonthly,2),'Referencia: '+monthLabel(current.month),'forest'),metric('Diferencia disponible',money(current.remainingMonthly,2),'No significa ahorro ya acumulado')])+
  table('Cómo se reparte el presupuesto actual',['Persona','Ingresos','Gasto a su cargo','Disponible'],people.map(person=>entry(person.label||person.id||'Persona',[money(person.income,2),money(personCost(person),2),money(person.remaining,2)])).join('')),
  notes(`Los ingresos ordinarios del hogar suman ${plainMoney(current.incomeMonthly,2)} y el gasto de referencia ${plainMoney(current.totalMonthly,2)} al mes. La diferencia es ${plainMoney(current.remainingMonthly,2)}. Las aportaciones entre nosotros se compensan dentro de la familia para no contarlas dos veces. La tabla muestra a quién corresponde cada gasto. No usamos pagas extra ni indemnizaciones como si fueran ingresos mensuales.`, 'Conservamos este presupuesto como referencia para evaluar la compra.'),
  'Cada importe tiene un pagador y se cuenta una sola vez.');

 add('story-reglas','Estas son nuestras reglas de compra',
  metrics([metric('ICF',percent(settings.icfLtv),'Hasta '+plainMoney(settings.icfMaxAmount)+'; préstamo, no subvención'),metric('ITP de los dos titulares',percent(settings.itpRate),'Según los requisitos de cada comprador'),metric('Préstamo de referencia de mamá',money(settings.referenceMotherAmount),'TIN '+(finite(settings.motherRate)?num(settings.motherRate,2)+' %':'pendiente')+' · '+(finite(settings.motherYears)?num(settings.motherYears,2)+' años':'plazo pendiente')),metric('IBI y reparaciones / año',money(settings.ownershipAnnual),'Una única reserva conjunta'),metric('Residuos / año',money(settings.wasteAnnual)),metric('Provisión de compra',finite(settings.provisionPercent)?e(num(settings.provisionPercent,2))+' %':'Pendiente','Además del ITP y del colchón de '+plainMoney(settings.buffer))]),
  notes(`El ICF se calcula como hasta el ${finite(settings.icfLtv)?num(settings.icfLtv*100,2):'porcentaje pendiente'} por ciento del menor entre precio y tasación, con tope de ${plainMoney(settings.icfMaxAmount)}. El ITP previsto para cada titular es ${finite(settings.itpRate)?num(settings.itpRate*100,2)+' por ciento':'pendiente'}, sujeto a sus requisitos. La reserva de ${plainMoney(settings.ownershipAnnual)} al año ya incluye IBI y reparaciones: no añadimos otro mantenimiento por el mismo concepto. Residuos son ${plainMoney(settings.wasteAnnual)} al año.`, 'Con estas reglas, veamos qué porcentaje y tipo aporta cada banco.'),
  'Los gastos de compra van aparte del precio financiado.');

 const offers=Object.entries(settings.offers||{});
 add('story-bancos','Dos bancos, las mismas hipótesis',
  table('Condiciones comunicadas · nómina incluida',['Banco','TIN con nómina','Financiación bancaria','ICF'],offers.map(([id,offer])=>entry(id==='sabadell'?'Sabadell':id==='santander'?'Santander':id,[annualRate(offer.rate),percent(offer.ltv),percent(settings.icfLtv)+' · máximo '+money(settings.icfMaxAmount)])).join(''))+
  hint('Los tipos ya incluyen la nómina. No se les vuelve a descontar la misma bonificación.')+
  hint('Seguro de hogar aparte: reserva de '+plainMoney(settings.homeInsuranceAnnual)+'/año, pendiente de cotización.',!settings.homeInsuranceConfirmed),
  notes('Comparamos los dos bancos con las condiciones que nos han comunicado y el mismo plazo de cada oferta. El tipo mostrado ya contiene la bonificación de la nómina. En Santander, el porcentaje bancario con ICF deja una parte adicional de la entrada a cargo de la familia. Si el ICF alcanza su límite, la diferencia que debemos aportar también aumenta. Una prima de seguro no queda pagada por tener la nómina.', 'Ahora cambiaremos únicamente la forma en que los titulares reciben y devuelven el dinero de mamá.'),
  'Un porcentaje bancario menor puede exigir más dinero inicial.');

 add('story-hipotesis','Tres formas de aportar el dinero de mamá',
  metrics(hypotheses.map(item=>metric(caseNames[item.id]||item.title,money(item.mortgageCapacityMonthly,2),'Devolución de los titulares a mamá: '+plainMoney(item.repaymentMonthly,2)+'/mes')))+
  '<div class="story-equation">'+e(plainMoney(model.bankIncome,2))+' × '+percent(settings.debtRatioLimit??.35)+' − '+money(model.bankDebtMonthly??settings.bankDebtMonthly,2)+' − devolución a mamá = cuota hipotecaria máxima</div>'+
  hint('En los tres casos el hogar sigue pagando la cuota bancaria completa de mamá.'),
  notes(`El límite parte de ${plainMoney(model.bankIncome,2)} de ingresos de los titulares, multiplicados por el límite bancario, menos ${plainMoney(model.bankDebtMonthly??settings.bankDebtMonthly,2)} de deuda al comprar. En donación, la devolución contractual a mamá es cero, pero pueden existir impuesto y notaría. En el segundo caso asumimos su cuota bancaria. En el tercero devolvemos solo el capital, sin interés, durante el plazo pactado; mamá cubre la diferencia con su banco. Esa diferencia entre cuotas no es el interés exacto de cada recibo, que cambia con la amortización.`, 'Con cada cuota máxima calculamos el capital hipotecario y el precio teórico.'),
  'Cambia la deuda de los titulares; la cuota del banco de mamá no desaparece.');

 add('story-teoria','Qué precio permitiría la cuota, antes de comprobar la entrada',
  table('Techo teórico por cuota hipotecaria · no es todavía una compra viable',['Banco e hipótesis','Cuota máxima','Capital hipotecado','Precio de vivienda','ICF','Precio sin financiar'],rows.map(row=>{const r=row.reference||{};return entry((row.bankName||row.bankId||'Banco')+' · '+(caseNames[row.caseId]||row.title||'Hipótesis'),[money(r.mortgageCapacityMonthly,2),money(r.mortgagePrincipal),money(r.purchasePrice),money(r.icfPrincipal),money(r.priceContribution)]);}).join(''))+
  hint('A la parte del precio sin financiar todavía hay que añadir ITP, provisión y reservas.'),
  notes('Esta tabla reproduce el ejercicio de la libreta para las seis combinaciones. Primero convertimos la cuota máxima en capital hipotecado según tipo y plazo. Después dividimos por el porcentaje que financia el banco para obtener el precio teórico de la vivienda. El ICF tiene su propio máximo, por lo que no siempre cubre toda la entrada. Estos precios aún no comprueban que mamá pueda aportar todo el efectivo ni que el gasto mensual completo encaje.', 'El siguiente paso es abrir el dinero inicial de la combinación seleccionada.'),
  'Poder pagar la cuota no garantiza poder completar la compra.');

 add('story-entrada','Todo lo que debe cubrir la aportación de mamá',
  '<p class="story-eyebrow">'+e(bankName+' · '+caseTitle)+'</p>'+metrics([metric('Precio no cubierto por banco e ICF',money(reference.priceContribution)),metric('ITP',money(reference.tax)),metric('Provisión de compra',money(reference.fees)),metric('Colchón conservado',money(reference.buffer)),metric('Capital necesario de mamá',money(reference.motherRequired),'Incluye calendario y los demás gastos introducidos','forest'),metric('Efectivo que faltaría',money(maximumGap(reference.shortfall,reference.earlyShortfall)),'Con el límite y las fechas del supuesto')])+
  hint('Las arras adelantan parte del precio; no se suman otra vez como gasto.'),
  notes(`Para ${bankName}, en ${caseTitle}, el precio teórico deja ${plainMoney(reference.priceContribution)} sin financiar. Añadimos ${plainMoney(reference.tax)} de impuestos, ${plainMoney(reference.fees)} de provisión, ${plainMoney(reference.buffer)} de colchón y los demás importes introducidos. Mamá necesitaría aportar ${plainMoney(reference.motherRequired)} según el calendario. El efectivo pendiente en alguna fase es ${plainMoney(maximumGap(reference.shortfall,reference.earlyShortfall))}. La donación incluye su fiscalidad prevista cuando corresponde. Las arras ya forman parte del precio.`, 'Si el préstamo necesario cambia, volvemos a calcular su cuota y la capacidad hipotecaria.'),
  'La entrada, los impuestos y el calendario pueden recortar el precio teórico.');

 add('story-viable','Buscamos el equilibrio completo',
  '<div class="story-flow">'+step('Límite fijo','No ampliar el préstamo','Usar el capital de referencia')+step('Negociación','Importe, TIN y plazo','La nueva cuota vuelve al cálculo')+step('Presupuesto','Gasto mensual elegido','Mantenerlo o permitir un aumento')+'</div>'+
  table('Máximos que cumplen las reglas del modo seleccionado: '+(modeNames[settings.mode]||'modo pendiente'),['Banco e hipótesis','Precio con costes conocidos','Préstamo de mamá','Cuota de mamá','Gasto familiar / mes'],rows.map(row=>{const r=row.actual||{};return entry((row.bankName||row.bankId||'Banco')+' · '+(caseNames[row.caseId]||row.title||'Hipótesis'),[finite(r.purchasePrice)&&r.purchasePrice>0?money(r.purchasePrice):'Necesita ajustes',money(r.motherPrincipal),money(r.motherMonthly,2),money(r.budgetTotal,2)]);}).join('')),
  notes(`El modo seleccionado es ${modeNames[settings.mode]||'pendiente'}. En el modo fijo no aumentamos el préstamo de referencia. Al negociar, el capital realmente necesario puede cambiar con el precio, los impuestos y el plazo; su cuota se incorpora otra vez a la prueba del límite bancario. En el modo de presupuesto se admite, además, el aumento mensual elegido de ${plainMoney(extra,2)}. No damos por ofrecido un importe o un plazo mayor solo porque la calculadora lo permita.`, 'Ahora comprobamos cómo se repartiría la combinación seleccionada entre nosotros.'),
  'Una nueva deuda exige recalcular tanto la cuota como el precio.');

 const actualPeople=array(actual.people),currentById=new Map(people.map(person=>[person.id,person]));
 add('story-reparto','Qué pagaría cada persona con esta compra',
  hasActual?metrics([metric('Gasto actual de referencia',money(current.totalMonthly,2)),metric('Compra · todos los pagos',money(actual.budgetTotal,2),'Cuota bancaria de mamá una sola vez','forest'),metric('Objetivo de gasto / mes',money(monthlyCap,2))])+
   table(bankName+' · '+caseTitle,['Persona','Gasto actual','Gasto tras comprar','Disponible'],actualPeople.map(person=>entry(person.label||person.id||'Persona',[money(person.currentCost??personCost(currentById.get(person.id)),2),money(person.purchaseCost??person.cost,2),money(person.purchaseRemaining??person.remaining,2)])).join('')):
   hint('No hay un precio positivo que cumpla todos los límites del supuesto seleccionado. Revisa el préstamo, el presupuesto o las condiciones.',true),
  notes(hasActual?`La combinación seleccionada es ${bankName}, ${caseTitle}, con un precio de ${plainMoney(actual.purchasePrice)}. El gasto familiar sería ${plainMoney(actual.budgetTotal,2)} al mes, frente a ${plainMoney(current.totalMonthly,2)} de referencia. La tabla muestra el coste a cargo de cada persona y el dinero ordinario que le quedaría. El reparto del presupuesto no cambia quién debe responder de los préstamos frente al banco. Las aportaciones internas se descuentan para no contar dos veces el mismo dinero.`:'El supuesto seleccionado necesita ajustes antes de poder mostrar un reparto de compra. Un precio teórico alto no sustituye el efectivo inicial, el límite de deuda ni el presupuesto mensual.', 'Terminamos con las condiciones que todavía tenemos que confirmar.'),
  'El gasto familiar y la aportación de cada persona son dos comprobaciones diferentes.');

 const failed=hasActual&&[actual.fitsBank,actual.fitsCash,actual.fitsBudget,actual.transitionFits].some(value=>value===false);
 const conclusion=!hasActual||failed?'Necesita ajustes':quotes.length||settings.homeInsuranceConfirmed!==true?'Encaja con reservas · faltan confirmaciones':'Encaja en el cálculo · sujeto a aprobación';
 add('story-decision','Qué podemos decidir con estos números',
  '<div class="story-conclusion'+(!hasActual||failed?' is-pending':'')+'"><span class="story-eyebrow">'+e(bankName+' · '+caseTitle)+'</span><h3>'+e(conclusion)+'</h3><p>'+e(hasActual?'Precio calculado: '+plainMoney(actual.purchasePrice):selected.reason||'Completa el plan antes de comprometer la compra.')+'</p></div>'+
  '<div class="story-flow">'+step('Confirmar','La financiación','ICF, hipoteca y préstamo de mamá')+step('Presupuestar','El gasto completo','Seguros, impuestos y recibos')+step('Acordar','El calendario','Arras, desembolsos y firma')+'</div>'+
  hint('Pendiente de confirmar: ofertas e ICF, seguros, fiscalidad de la donación o contrato familiar, y liquidez para arras.'+(quotes.length?' '+quotes.join(', '):''),true),
  notes(`La conclusión del escenario seleccionado es: ${conclusion.toLowerCase()}. ${hasActual?'El precio calculado con los costes conocidos es '+plainMoney(actual.purchasePrice)+'. ':''}Debemos confirmar la oferta del banco, su criterio de esfuerzo, la aceptación del ICF y el origen de la aportación familiar. La reserva de hogar de ${plainMoney(settings.homeInsuranceAnnual)} al año es una estimación mientras no tengamos prima. También deben comprobarse la fiscalidad de la donación o el contrato de préstamo familiar y el dinero disponible para arras y firma. Una simulación no convierte una negociación en financiación concedida.`, 'Podemos volver a cualquier paso y ajustar un dato; toda la historia se recalcula desde la misma información.'),
  'La presentación explica el cálculo; las ofertas y los contratos confirman la operación.');

 return slides;
}
