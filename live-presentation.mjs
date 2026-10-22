import {buildPurchaseStorySlides} from './purchase-story-slides.mjs?v=37';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const currency=(value,d=0)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:d,maximumFractionDigits:d}).format(value);
const number=(value,d=2)=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:d}).format(value);
const labels={rent:'Alquiler',utilities:'Suministros',food:'Comida',familyInsurance:'Seguro familiar',car:'Coche',existingDebt:'Deudas actuales',university:'Universidad',personalExpenses:'Gastos personales',publicTransport:'Transporte público',other:'Otros'};
const list=value=>Array.isArray(value)?value:[];
function formatting(given={}) {
 const f={euro:given.euro||currency,num:given.num||number,esc:given.esc||escape,pct:given.pct||(value=>number(value*100,1)+' %')};
 return {...f,money:(value,d=0)=>finite(value)?f.euro(value,d):'Pendiente',percent:value=>finite(value)?f.pct(value):'Pendiente'};
}
function monthLabel(value) {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value||''))return 'Fecha pendiente';
 const [year,month]=value.split('-').map(Number);
 return new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,15)));
}
function missingList(model,selected) {
 const all=[...list(selected.missingQuotes)];
 return [...new Set(all.map(item=>typeof item==='string'?item:(item?.label||item?.name||item?.message||'Presupuesto pendiente')))];
}
function voice(main,transition) {
 return main+' Las cifras proceden de los datos vigentes de la aplicación. Lo previsto puede cambiar al actualizar ingresos, gastos, fechas o condiciones. Conviene revisar los importes pendientes antes de tomar una decisión. '+transition;
}

export function buildLiveSlides(model={},formatters={}) {
 if(model.kind==='purchase-story')return buildPurchaseStorySlides(model,formatters);
 const f=formatting(formatters),e=f.esc,m=f.money,selected=model.selected||{},settings=model.settings||{},monthly=selected.monthly||{},source=model.source||{},current=model.currentBudget||{};
 const people=list(current.people),compared=list(selected.comparisonPeople),components=current.components||{},ownership=settings.ownership||{},limits=selected.limits||{},spending=limits.spending||{},debt=limits.debt||{};
 const purchaseMonth=settings.purchaseMonth||source.familyPlan?.purchaseMonth;
 const bank=selected.bankName||'Banco por seleccionar',missing=missingList(model,selected);
 const unknownInsurance=monthly.insurance==null||monthly.insuranceEquivalent==null;
 const costsPending=unknownInsurance;
 const estimated=selected.estimatedCosts===true;
 const icfPlans=list(model.scenarios).filter(row=>row.financingMode==='icf');
 const incomplete=selected.incomplete===true||costsPending;
 const price=selected.available===false?null:selected.maxPriceKnownCosts;
 const cap=finite(spending.ceiling)?spending.ceiling:current.totalMonthly;
 const beforeInsurance=spending.maximumMortgageMonthlyBeforeUnknownInsurance;
 const ibiMonthly=finite(ownership.ibiAnnual)?ownership.ibiAnnual/12:null;
 const purchase=settings.purchase||{},momCap=settings.motherLoanCap;
 const metric=(caption,value,detail='',tone='')=>`<div class="story-metric ${tone?`story-metric--${e(tone)}`:''}"><span>${e(caption)}</span><strong>${e(value)}</strong>${detail?`<small>${e(detail)}</small>`:''}</div>`;
 const metrics=(items)=>`<div class="story-metrics">${items.join('')}</div>`;
 const hint=(text,pending=false)=>`<p class="story-takeaway${pending?' is-pending':''}">${e(text)}</p>`;
 const bars=(items,{max,unit='€/mes'}={})=>{
  const scale=finite(max)&&max>0?max:Math.max(1,...items.map(item=>finite(item.value)?Math.abs(item.value):0));
  return `<ul class="story-bars">${items.map((item,index)=>`<li class="${!finite(item.value)?'is-pending':''}"><div><span>${e(item.label)}</span><strong>${e(finite(item.value)?m(item.value,2):'Pendiente')}</strong></div><div class="story-bar-track" aria-hidden="true"><i class="story-color-${index%5}" style="--story-bar:${finite(item.value)?Math.max(0,Math.min(100,Math.abs(item.value)/scale*100)):100}%"></i></div></li>`).join('')}</ul>`;
 };
 const step=(caption,title,detail)=>`<div class="story-step"><span>${e(caption)}</span><strong>${e(title)}</strong><small>${e(detail)}</small></div>`;
 const pendingNote=missing.length?missing.join(', '):unknownInsurance?'Primas de los seguros asociados':'Confirmaciones bancarias y de la vivienda';
 const santanderNote=selected.bankId==='santander'?' En Santander, los umbrales de prima para bonificar no son presupuestos de los seguros. La bonificación empieza en el mes siete y el TIN del tramo inicial necesita confirmación; un tipo desconocido no significa coste cero.':'';
 const currentPeople=people.map(person=>({label:person.label||person.name||person.id||'Persona',value:person.cost??person.currentCost}));
 const slides=[];
 const add=(id,title,body,notes,takeaway)=>slides.push({id,title,body,notes,takeaway});

 add('objetivo','¿Podemos dar el salto?',
  `<div class="story-cover"><span class="story-eyebrow">Una decisión de nuestra familia</span><h3>Una casa que podamos sostener juntos.</h3><div class="story-house" aria-hidden="true"><i></i><b></b></div></div>`,
  voice(`La pregunta que vamos a responder es qué compra podemos sostener entre todos, partiendo de nuestra situación real. Nuestro gasto de referencia es ${m(current.totalMonthly,2)} al mes. Primero veremos cómo vivimos hoy y qué cambia con el tiempo. Después construiremos el presupuesto de una compra, incluyendo impuestos, propiedad, préstamo de mamá y los productos del banco. Solo entonces calcularemos un precio máximo. No empezamos escogiendo una vivienda ni dando por aprobada la financiación. ${costsPending?'Todavía hay presupuestos pendientes, por lo que el resultado será provisional.':'El cálculo recoge los costes introducidos y aún necesita confirmación de las entidades.'}`,'Empezamos por nuestra situación actual.'),
  'Primero el presupuesto; después el precio.');

 add('hoy','Este es nuestro punto de partida',
  metrics([metric('Ingresos ordinarios',m(current.incomeMonthly,2)),metric('Gasto actual',m(current.totalMonthly,2),'Al mes','forest'),metric('Disponible',m(current.remainingMonthly,2))])+bars(currentPeople),
  voice(`En ${monthLabel(current.month)}, los ingresos ordinarios del hogar son ${m(current.incomeMonthly,2)} y el gasto suma ${m(current.totalMonthly,2)}. La diferencia es ${m(current.remainingMonthly,2)}. Estos importes describen el presupuesto corriente; no convertimos una paga extra ni un cobro puntual en una nómina mensual. Las barras muestran el gasto asignado a cada persona y ayudan a situar el esfuerzo actual. Un disponible positivo tampoco significa que todo se ahorre automáticamente: habrá que respetar los compromisos y reservar para imprevistos. Esta foto es la referencia desde la que se busca una compra sin aumentar el gasto familiar.`,'Ahora abrimos el gasto para entender qué partes continuarán después de mudarnos.'),
  'El gasto actual será nuestra referencia.');

 add('gastos','Ya tenemos un coste de vida',
  bars(Object.entries(components).filter(([,value])=>finite(value)&&value!==0).map(([key,value])=>({label:labels[key]||key,value})))+
  hint('El alquiler cambia; buena parte de la vida diaria continúa.'),
  voice(`El total actual de ${m(current.totalMonthly,2)} no es solamente alquiler. Incluye comida, suministros, seguros familiares, transporte, universidad y las deudas o compromisos que figuran en la aplicación. El alquiler registrado es ${m(components.rent,2)}, la comida ${m(components.food,2)} y el seguro familiar ${m(components.familyInsurance,2)}. Al comprar, no desaparece el resto del coste de vivir. Conservamos el gasto de vida actual incluso si alguna deuda o la universidad terminan después. Esa posible mejora queda como margen, sin gastarla de antemano. Las aportaciones entre familiares son un reparto interno; no deben contarse otra vez como un gasto externo del hogar.`,'El siguiente paso es colocar esos cambios en un calendario.'),
  'Comprar sustituye una parte del gasto y añade otras.');

 const university=source.familyPlan?.university||{};
 const milestones=[step('Hoy',monthLabel(current.month),'Presupuesto de referencia'),step('Compra prevista',monthLabel(purchaseMonth),'Hipoteca + propiedad'),step('Después',university.endMonth?monthLabel(university.endMonth):'Fechas del calendario','Vencimientos y cambios de ingresos')];
 add('calendario','Junio es el destino, hoy marca el límite',
  `<div class="story-timeline">${milestones.join('')}</div>`+
  hint('Sin ahorro inicial y sin gastar de antemano las mejoras futuras.'),
  voice(`La compra está situada en ${monthLabel(purchaseMonth)} y el presupuesto actual corresponde a ${monthLabel(current.month)}. El calendario familiar conserva las fechas previstas, pero esta búsqueda mantiene el coste de vida actual: no usa futuras cancelaciones o el fin de universidad para ampliar la hipoteca. Un nuevo sueldo puede mejorar el reparto, nunca el límite de gasto. La universidad ${university.endMonth?'tiene como último mes '+monthLabel(university.endMonth):'necesita una fecha de finalización comprobada'}. Que un pago termine después no permite usar ese dinero antes. También debemos distinguir un empleo previsto de un ingreso ya confirmado y una cancelación posible de una deuda efectivamente pagada. Durante la espera pueden coincidir alquiler y préstamo de mamá. Esa transición requiere caja, además de una mensualidad final asumible.`,'Con el calendario claro, podemos explicar qué deudas financiarían la compra.'),
  'La mejora futura no paga los compromisos de hoy.');

 add('financiacion','El precio se convierte en compromisos',
  `<div class="story-flow">${step('Banco','Hipoteca','Capital + intereses')}${step('Si cumple requisitos','ICF','Deuda con devolución diferida')}${step('Familia','Préstamo de mamá','Liquidez inicial + cuota bancaria')}</div>`+
  hint('El ICF y el préstamo familiar también se devuelven.'),
  voice(`El banco ${bank} aporta la hipoteca del escenario elegido. El modo de financiación es ${selected.financingMode||'pendiente de seleccionar'}. Cuando interviene el ICF, ese importe no es ahorro ni una subvención: es otro préstamo, con requisitos, devolución posterior y condiciones sobre la vivienda. Mamá puede aportar liquidez mediante su propio préstamo bancario. Por eso distinguimos la cuota que sale del hogar hacia el banco de las devoluciones internas de los hijos a mamá. Estas transferencias internas ayudan a repartir el esfuerzo, pero no vuelven a sumarse al gasto familiar. Todos los productos requieren aprobación y condiciones concretas.`,'Ahora separamos el dinero para comprar de los pagos mensuales para vivir.'),
  'Financiar el precio no elimina las obligaciones.');

 add('compra','Antes de las llaves hay otros pagos',
  `<div class="story-flow">${step('Antes','Arras','Adelanto que se descuenta del precio')}${step('En la compra','Impuestos y gastos','Aplicación según requisitos y presupuestos')}${step('Para empezar','Mudanza y reserva','El colchón sigue siendo ahorro')}</div>`+
  metrics([metric('Provisión de gastos',finite(purchase.provisionPercent)?f.num(purchase.provisionPercent)+' %':'Pendiente'),metric('Mudanza',m(purchase.moving)),metric('Colchón',m(purchase.buffer))]),
  voice(`Además del precio hay impuestos y gastos de compraventa. El tipo de ITP debe comprobarse para las personas y la operación concretas; no damos un tipo reducido por garantizado. La provisión introducida es ${finite(purchase.provisionPercent)?f.num(purchase.provisionPercent)+' %':'pendiente'}, la mudanza ${m(purchase.moving)} y el colchón ${m(purchase.buffer)}. Una provisión no es una factura cerrada. Tasación, agencia, reformas o primas iniciales necesitan presupuesto cuando correspondan. El colchón forma parte del efectivo necesario, pero no es dinero consumido. Las arras se descuentan del precio final: contarlas otra vez duplicaría una parte de la compra.`,'Después de esta entrada inicial, construimos el coste mensual completo.'),
  'Precio, gastos y reserva deben tener financiación y fecha.');

 add('mensualidad','La cuota es una parte de vivir',
  `<div class="story-budget-build">${step('Continúa','Vida cotidiana',m(monthly.living,2)+'/mes')}${step('Se añade','Financiación','Hipoteca + préstamo bancario de mamá')}${step('Se añade','Propiedad','Tributos, conservación y seguros')}</div>`+
  hint('Los movimientos internos de la familia se cuentan una sola vez.'),
  voice(`Para decidir cuánto podemos pagar, reconstruimos el mes de compra completo. La vida cotidiana del escenario suma ${m(monthly.living,2)}, sin las cuotas de hipoteca y mamá, sin propiedad y sin los seguros hipotecarios separados. Después añadiremos esos conceptos utilizando los resultados del mismo modelo financiero de la aplicación. Mantener esta separación evita que una cuota atractiva oculte gastos que ya existen. También permite saber qué cambia al modificar un seguro o una factura sin volver a sumar lo que ya está incluido. El seguro familiar del presupuesto de hoy permanece en su categoría; no debe confundirse con una nueva póliza vinculada al banco.`,'Empezamos por los gastos de ser propietarios.'),
  'El límite se aplica al hogar completo.');

 add('propiedad','Ser propietarios también tiene un coste',
  metrics([metric('IBI al año',m(ownership.ibiAnnual)),metric('IBI al mes',m(ibiMonthly,2),'Incluido una vez en propiedad','forest'),metric('Propiedad total',m(monthly.ownership,2),'No incluye las primas hipotecarias')])+
  bars([{label:'IBI mensual',value:ibiMonthly},{label:'Residuos mensuales',value:finite(ownership.wasteAnnual)?ownership.wasteAnnual/12:null},{label:'Comunidad, si existe',value:ownership.communityMonthly},{label:'Reserva de mantenimiento',value:finite(ownership.maintenanceAnnual)?ownership.maintenanceAnnual/12:null}]),
  voice(`El IBI presupuestado es ${m(ownership.ibiAnnual)} al año, equivalente a ${m(ibiMonthly,2)} al mes. Se convierte a mensual para compararlo con los demás gastos y se incluye una sola vez dentro de propiedad. Es una provisión para este ejercicio, no una factura garantizada ni una media de casas o pisos. Reservamos 25 euros mensuales para residuos y 100 para mantenimiento de una casa. Esa reserva para reparaciones no es una comunidad: la comunidad parte de cero salvo que exista. Estas cantidades son editables. La categoría de propiedad suma ${m(monthly.ownership,2)} al mes. La cuota real depende del inmueble y del municipio; pediremos recibos y revisaremos el estado de la casa. Las derramas y reparaciones deben revisarse sin suponer que siempre cabrán en una cantidad fija.`,'A continuación miramos los productos que condicionan el interés del banco.'),
  'Las provisiones se sustituyen por recibos cuando existan.');

 const bonuses=selected.bonuses||{};
 const unknownProducts=!finite(bonuses.productEquivalentMonthly);
 const unknownNet=!finite(bonuses.netSavingMonthly);
 const activeProducts=list(settings.offers?.[selected.bankId]?.products).filter(product=>product.enabled===true).map(product=>product.label||product.name||product.id);
 const productDescription=activeProducts.length?activeProducts.join(', '):'los productos seleccionados en la oferta';
 add('bonificaciones','La bonificación tiene un precio',
  metrics([metric('TIN con nómina',finite(bonuses.payrollRate)?f.num(bonuses.payrollRate)+' %':'Pendiente'),metric('TIN con productos',finite(bonuses.fullRate)?f.num(bonuses.fullRate)+' %':'Pendiente')])+
  bars([{label:'Rebaja de cuota al mes',value:bonuses.interestSavingMonthly},{label:'Productos: coste equivalente',value:bonuses.productEquivalentMonthly},{label:'Ahorro neto mensual',value:bonuses.netSavingMonthly}])+
  hint(unknownProducts?'Faltan primas: todavía no sabemos el ahorro neto.':unknownNet?'El plan está cotizado; falta completar la alternativa para conocer el ahorro neto.':bonuses.estimated?'Estimación con reservas; las primas personales pueden cambiar el resultado.':'Comparamos el ahorro con el coste completo de los productos.',unknownNet),
  voice(`La oferta de ${bank} distingue un tipo con nómina de ${finite(bonuses.payrollRate)?f.num(bonuses.payrollRate)+' %':'importe pendiente'} y un tipo con todos los productos de ${finite(bonuses.fullRate)?f.num(bonuses.fullRate)+' %':'importe pendiente'}. Una cuota más baja no demuestra por sí sola que el conjunto sea más barato. Debemos restar de la rebaja mensual de cuota el coste adicional de ${productDescription}, descontando el hogar externo que ya teníamos reservado. Los precios públicos son ejemplos para otros perfiles: las reservas no son cotizaciones. Nuestra referencia principal solo usa la bonificación de nómina; los seguros se exploran después. Un seguro de prima inicial exige efectivo y también tiene un equivalente mensual para comparar. ${unknownProducts?'Faltan presupuestos: no ponemos cero en las primas ni calculamos un ahorro neto definitivo.':unknownNet?'El coste del plan está cotizado, pero falta completar el seguro de la alternativa sin productos para calcular el ahorro neto.':'Con las reservas o primas introducidas, el ahorro neto estimado es '+m(bonuses.netSavingMonthly,2)+'.'}${santanderNote}`,'Antes de calcular el máximo, comprobamos la liquidez inicial.'),
  unknownProducts?'Prima pendiente significa coste pendiente.':'El interés se compara junto con sus productos.');

 add('liquidez','El dinero tiene que llegar a tiempo',
  metrics([metric('Ahorro disponible',m(settings.cashSavings)),metric('Límite de mamá',m(momCap),'Préstamo, no ahorro','forest'),metric('Arras',finite(purchase.depositPercent)?f.percent(purchase.depositPercent):'Pendiente','Se descuentan del precio')])+
  `<div class="story-timeline">${step('Antes','Arras y pagos previos','Origen de los fondos comprobado')}${step('Firma','Banco + ICF, si procede','Disponibilidad y compensación')}${step('Después','Gastos y colchón','Sin consumir fondos dos veces')}</div>`+(limits.preclosing?.spendingAboveCurrentCap?hint('Durante la espera: '+m(limits.preclosing.monthlyExpenses,2)+'/mes, por encima del gasto actual.',true):''),
  voice(`Contamos con ${m(settings.cashSavings)} de ahorro para la compra y un límite de ${m(momCap)} para el préstamo de mamá. Que la operación cuadre al final no garantiza que exista dinero para cada pago previo. Las arras previstas son ${finite(purchase.depositPercent)?f.percent(purchase.depositPercent):'un porcentaje pendiente'} del precio y se descuentan en la firma. Hay que confirmar cuándo se desembolsan la hipoteca y el ICF y cómo se compensa el anticipo. El préstamo de mamá produce una cuota que entra en el presupuesto familiar. ${limits.preclosing?.spendingAboveCurrentCap?'Durante la espera, alquiler y préstamo suman '+m(limits.preclosing.monthlyExpenses,2)+' al mes, por encima de la referencia actual.':''} Las primas iniciales necesitan caja y no pueden ocultarse en un promedio mensual.`,'Con estos límites ya podemos obtener la cuota asequible antes de hablar de precio.'),
  'Mensualidad asumible y efectivo disponible son pruebas distintas.');

 add('cuota-disponible','Primero calculamos qué cuota cabe',
  metrics([metric('Gasto familiar que mantenemos',m(cap,2)),...icfPlans.map(row=>metric(row.bankName+' · hipoteca por límite mensual',m(row.ceilings?.monthlyMortgage),m(row.ceilings?.monthlyMortgagePayment,2)+'/mes','forest'))])+
  `<div class="story-equation"><span>Gasto actual</span><b>−</b><span>Vida + propiedad + mamá + seguros</span><b>=</b><strong>Espacio para hipoteca</strong></div>`+
  hint(unknownInsurance?'Es un techo parcial: las primas pendientes pueden reducirlo.':'Este límite solo comprueba el mes. Todavía debe caber el dinero inicial.',unknownInsurance),
  voice(`El punto de partida es el gasto actual de ${m(cap,2)} al mes, no el precio de una casa elegida previamente. Restamos la vida cotidiana actual, los costes de propiedad, la cuota bancaria de mamá y los seguros conocidos. El resultado del modelo para la hipoteca es ${m(beforeInsurance,2)} al mes. ${unknownInsurance?'Esta cifra es un techo antes de las primas que faltan, por lo que no representa una cuota final garantizada.':'El importe utiliza todos los costes introducidos, que deben contrastarse con las ofertas y recibos.'} Aparte siguen existiendo las condiciones bancarias de deuda y el efectivo inicial. El presupuesto no aumenta por incluir cobros extraordinarios como si fueran salarios.`,'Ahora transformamos ese espacio mensual en un precio y comprobamos qué límite manda.'),
  'La cuota sale del gasto actual; el precio sale después.');

 const binding=({cash:'Efectivo inicial',liquidity:'Liquidez inicial',spending:'Presupuesto mensual',budget:'Presupuesto mensual',debt:'Referencia de deuda',mother:'Límite de mamá',earlyCash:'Pagos previos',finalCash:'Efectivo final','early-cash':'Pagos previos','final-cash':'Efectivo final',transition:'Caja durante la espera','search-ceiling':'Techo del intervalo explorado','invalid-input':'Datos por revisar',conditional:'Financiación condicionada',unknown:'Límite por confirmar'})[selected.bindingConstraint]||'Límite por confirmar';
 add('precio-maximo','Después buscamos el precio máximo',
  `<div class="story-bank-limits">${(icfPlans.length?icfPlans:[selected]).map(row=>`<section><span class="story-eyebrow">${e(row.bankName||bank)} · con ICF</span>${metric('Precio máximo de la casa',m(row.maxPriceKnownCosts),'Cumple mes, dinero y deuda','forest')}${metric('Capital de la hipoteca',m(row.mortgagePrincipal),'Lo que presta el banco')}${metric('Gasto familiar mensual',m(row.monthly?.total,2),'Incluye reservas')}</section>`).join('')}</div>`+
  hint('Precio de la casa ≠ capital de la hipoteca. Son límites calculados, no aprobaciones.'),
  voice(`Con la cuota disponible y las condiciones de ${bank}, el modelo busca un precio en lugar de partir de una cantidad prefijada. El máximo con costes conocidos es ${selected.available===false?'un escenario no disponible':m(price)}. La hipoteca resultante sería ${m(selected.mortgagePrincipal)} y el ICF ${m(selected.icfPrincipal)}, cuando ese modo esté disponible. El límite que manda es ${binding}. El cálculo comprueba presupuesto mensual, referencia de deuda y efectivo para compra y pagos previos. ${costsPending?'Faltan costes o presupuestos; esta cantidad es provisional y puede bajar al completarlos.':'Los costes introducidos permiten calcular este escenario, pero la aprobación sigue correspondiendo a las entidades.'} También hay que verificar los requisitos fiscales y de financiación.`,'Veamos qué condiciones podrían cambiar esta conclusión.'),
  'El límite de compra combina mensualidad y dinero inicial.');

 const errors=list(model.errors).map(error=>typeof error==='string'?error:(error?.message||'Dato por revisar'));
 add('condiciones','Por qué Santander puede limitar antes',
  `<div class="story-flow">${step('Sabadell + ICF','80 % + hasta 20 %','El precio puede quedar financiado')}${step('Santander + ICF','75 % + hasta 20 %','Falta al menos un 5 % del precio')}${step('Mamá',m(momCap),'Debe cubrir ese hueco y los gastos')}</div>`+
  hint('ITP + provisión de compra + entrada pendiente compiten por el mismo dinero.'),
  voice(`La diferencia entre bancos no se explica solo por el interés. Con las condiciones comunicadas, Sabadell financia el 80 % y Santander el 75 % cuando interviene ICF. El ICF aporta hasta el 20 %, con un máximo de 50.000 euros. Santander deja por tanto al menos un 5 % del precio pendiente. Sin ahorro, esa cantidad sale del mismo préstamo de mamá que debe pagar ITP, provisión de gastos, mudanza y colchón. Por eso puede limitar el precio aunque la cuota mensual aún sea cómoda. Además, unas arras del ${f.percent(purchase.depositPercent??0)} requieren adelantar dinero antes de que llegue la financiación. Son una hipótesis negociable. Superar el límite de efectivo no significa automáticamente gastar más al mes, pero sí necesitar más dinero inicial. Los requisitos del ICF, el tipo de ITP y el origen prestado de los fondos deben confirmarse.`,'A continuación miramos el impacto en cada persona.'),
  'Una cuota asumible no resuelve la falta de dinero inicial.');

 add('personas','El plan tiene que encajar para cada uno',
  `<div class="story-person-grid">${compared.map(person=>`<div class="story-person"><h3>${e(person.label||person.name||person.id||'Persona')}</h3>${metric('Gasto al comprar',m(person.purchaseCost??person.cost,2))}${metric('Disponible',m(person.purchaseRemaining??person.remaining,2))}</div>`).join('')||hint('Falta el reparto individual.')}</div>`+
  hint('El apoyo entre familiares ya está repartido; no se suma otra vez.'),
  voice(`Un total familiar que encaja puede dejar a alguien con muy poco margen. Por eso revisamos cuánto paga y cuánto conserva cada persona después de comprar. ${compared.map(person=>(person.label||person.id||'Una persona')+' tendría un gasto de '+m(person.purchaseCost??person.cost,2)+' y un disponible de '+m(person.purchaseRemaining??person.remaining,2)).join('; ')}. El disponible es ingreso ordinario menos gasto asignado, no una promesa de ahorro. Las ayudas entre familiares deben quedar reflejadas tanto en quien aporta como en quien recibe, sin añadir un gasto duplicado al hogar. Si un ingreso previsto no llega, habrá que redistribuir la aportación y comprobar otra vez los márgenes.`,'Con el mismo presupuesto familiar, ahora podemos comparar ofertas bancarias.'),
  'La sostenibilidad también se mide persona a persona.');

 const rawComparison=Array.isArray(model.atCommonPrice)?model.atCommonPrice:list(model.atCommonPrice?.scenarios);
 const offers=rawComparison.filter(offer=>offer.available!==false&&(!selected.financingMode||!offer.financingMode||offer.financingMode===(offer.bankId==='sabadell'&&selected.financingMode==='conditional90'?'standard':selected.financingMode)));
 const modeLabel=mode=>({icf:'Banco + ICF',standard:'Sin ICF',conditional90:'90 % condicionado'})[mode]||'Financiación por confirmar';
 const compareTable=offers.length?`<div class="story-table-wrap"><table class="story-table"><caption>Mismo precio de compra: ${e(m(model.comparisonPrice))}</caption><thead><tr><th>Banco</th><th>Cuota</th><th>Seguros equivalentes</th><th>Gasto mensual real</th></tr></thead><tbody>${offers.map(offer=>{const known=finite(offer.monthly?.insurance)&&finite(offer.monthly?.insuranceEquivalent),pending=list(offer.missingQuotes).length>0||!known;return `<tr><th scope="row">${e(offer.bankName||offer.bankId||'Banco')}<small>${e(modeLabel(offer.financingMode))}</small></th><td>${e(m(offer.monthly?.mortgage,2))}</td><td>${e(known?m(offer.monthly.insurance+offer.monthly.insuranceEquivalent,2):'Pendiente')}</td><td>${e(m(offer.monthly?.total,2))}${pending?'<small>Con costes pendientes</small>':''}</td></tr>`;}).join('')}</tbody></table></div>`:hint('Añade ofertas comparables al mismo precio, plazo y financiación.',true);
 add('bancos','Comparamos la compra, no solo el interés',
  compareTable+hint('Seguros equivalentes = recurrentes + prima inicial repartida. La prima se paga una vez al inicio.'),
  voice(`Para comparar bancos utilizamos un precio común de ${m(model.comparisonPrice)}, en lugar de enfrentar el máximo diferente de cada entidad. Comprobamos el mismo plazo y modo de financiación. La cuota hipotecaria se muestra junto al coste equivalente de los seguros y al gasto familiar completo. Una prima única necesita dinero inicial aunque la representemos también como equivalente mensual. ${offers.length?'Hay '+offers.length+' escenarios comparables disponibles en esta tabla.':'Todavía faltan ofertas comparables en este ejercicio.'} Los importes pendientes siguen diciendo pendiente; una celda vacía no se convierte en seguro gratuito. También revisaremos comisiones, exigencias de nómina, cobertura, renovaciones y la documentación de la oferta antes de elegir.`,'Terminamos con una conclusión y una lista concreta de condiciones por resolver.'),
  'La menor cuota no garantiza el menor coste conjunto.');

 const noPositivePrice=finite(price)&&price<=0;
 const failedLimit=[spending,debt,limits.finalCash,limits.earlyCash,limits.preclosing].some(limit=>limit?.fits===false)||['budgetFits','debtFits','cashFits','transitionFits'].some(key=>limits[key]===false);
 const negativePerson=compared.some(person=>finite(person.purchaseRemaining??person.remaining)&&(person.purchaseRemaining??person.remaining)<-.01);
 const blocked=selected.available===false||noPositivePrice||failedLimit||negativePerson||errors.length>0||(finite(monthly.total)&&finite(cap)&&monthly.total>cap+.01)||(finite(debt.ratio)&&finite(debt.limit)&&debt.ratio>debt.limit+.0000001)||(finite(limits.finalCash?.gap)&&limits.finalCash.gap>.01)||(finite(limits.earlyCash?.gap)&&limits.earlyCash.gap>.01)||limits.preclosing?.timingConsistent===false;
 const conclusion=blocked?'Necesita ajustes':!finite(price)?'Faltan datos para calcular':costsPending?'Faltan presupuestos para cerrar':estimated?'Encaja con estas reservas · por confirmar':incomplete?'Encaja con lo cotizado · sujeto a confirmaciones':'Encaja en el cálculo actual';
 add('decision','¿Podemos permitírnoslo?',
  `<div class="story-conclusion ${blocked?'is-pending':''}"><span class="story-eyebrow">Resultado del escenario elegido</span><h3>${e(conclusion)}</h3><p>${e(bank)}</p></div>`+
  `<div class="story-flow">${step('Efectivo','En cada fecha','Compra y colchón cubiertos')}${step('Mensualidad','Dentro del objetivo','Todos los costes incluidos')}${step('Reparto','Margen por persona','Aportaciones sostenibles')}</div>`+
  hint(noPositivePrice?'Ningún precio positivo cumple los límites actuales. Hay que ajustar el plan.':negativePerson?'El reparto deja a una persona sin margen: hay que ajustarlo.':blocked?'Hay límites incumplidos: revisa el presupuesto, la deuda y el efectivo por fechas.':!finite(price)?'Completa los datos necesarios para calcular el máximo.':incomplete?'Siguiente paso: completar '+pendingNote:'Siguiente paso: contrastar ofertas y confirmar la operación.',blocked||incomplete),
  voice(`La conclusión de este escenario es: ${conclusion.toLowerCase()}. El máximo con costes conocidos es ${m(price)} y el gasto familiar calculado ${m(monthly.total,2)} frente a una referencia de ${m(cap,2)}. Esto reúne tres pruebas: disponer del efectivo cuando se necesita, mantener la mensualidad completa dentro del objetivo y conservar un reparto asumible para cada persona. ${blocked?'Hay condiciones que no se cumplen y debemos ajustar el plan antes de seguir.':!finite(price)?'Todavía faltan datos para calcular un máximo.':costsPending?'Los costes pendientes impiden convertir esta conclusión en un sí definitivo.':'Los datos introducidos encajan en el cálculo, pero todavía hay que contrastar la operación.'} El límite mensual se comprueba al comprar; conviene revisar también los meses de espera. Los próximos pasos son completar ${pendingNote}, revisar el calendario y obtener aprobaciones. Si algo cambia, la presentación utiliza los mismos datos actualizados de la aplicación.`,'Podemos volver a las diapositivas para revisar una condición concreta.'),
  conclusion);
 return slides;
}

export function renderLivePresentation(model={},state={index:0,notesOpen:false},formatters={}) {
 const f=formatting(formatters),e=f.esc,slides=buildLiveSlides(model,formatters);
 const index=Math.max(0,Math.min(slides.length-1,Number.isFinite(Number(state.index))?Math.trunc(Number(state.index)):0)),slide=slides[index];
 const banks=[...new Map(list(model.scenarios).filter(item=>item?.bankId).map(item=>[item.bankId,item])).values()];
 const selectedId=model.selected?.bankId||model.settings?.selectedBank||'';
 return `<section class="family-story" data-story-index="${index}" aria-label="Presentación familiar Casa Ideal"><div class="story-toolbar"><div><span class="story-eyebrow">Casa Ideal · presentación viva</span><span class="story-position">${index+1} / ${slides.length}</span></div><label class="story-bank">Banco<select id="story-bank-select">${banks.length?banks.map(bank=>`<option value="${e(bank.bankId)}" ${bank.bankId===selectedId?'selected':''}>${e(bank.bankName||bank.bankId)}</option>`).join(''):'<option value="">Pendiente de ofertas</option>'}</select></label></div><div class="story-layout ${state.notesOpen?'has-notes':''}"><article class="story-slide" id="story-current-slide" aria-labelledby="story-slide-title"><header><span class="story-eyebrow">Nuestra decisión, paso a paso</span><h2 id="story-slide-title">${e(slide.title)}</h2></header><div class="story-content">${slide.body}</div><footer class="story-slide-takeaway">${e(slide.takeaway)}</footer></article><aside class="story-notes" id="story-speaker-notes" ${state.notesOpen?'':'hidden'} aria-label="Guion para presentar"><span class="story-eyebrow">Guion para contar</span><h3>${e(slide.title)}</h3><p>${e(slide.notes)}</p></aside></div><div class="story-controls"><button type="button" class="button secondary" data-action="story-prev" ${index===0?'disabled':''} aria-label="Diapositiva anterior">←</button><label class="story-jump"><span class="sr-only">Ir a una diapositiva</span><select id="story-slide-selector">${slides.map((item,i)=>`<option value="${i}" ${i===index?'selected':''}>${i+1}. ${e(item.title)}</option>`).join('')}</select></label><button type="button" class="button secondary" data-action="story-next" ${index===slides.length-1?'disabled':''} aria-label="Diapositiva siguiente">→</button><button type="button" class="button secondary" data-action="story-notes" aria-controls="story-speaker-notes" aria-expanded="${state.notesOpen===true}">Guion</button><button type="button" class="button secondary" data-action="story-fullscreen">Pantalla completa</button></div><div class="story-dots" aria-label="Elegir diapositiva">${slides.map((item,i)=>`<button type="button" data-action="story-go" data-id="${i}" aria-label="${i+1}. ${e(item.title)}" ${i===index?'aria-current="step"':''}></button>`).join('')}</div><progress class="story-progress" value="${index+1}" max="${slides.length}" aria-label="Progreso de la presentación"></progress></section>`;
}
