import {normalizeScenario,calculateScenario,monthlyPayment} from './finance.mjs?v=38';
import {normalizeMortgageSearch,genericScenario,currentRentalBudget} from './mortgage-search.mjs?v=38';
import {normalizePurchaseStory} from './purchase-story.mjs?v=38';
import {calculatePersonalCommitments,calculatePublicTransport} from './personal-commitments.mjs?v=38';

const ROLES=['buyer1','buyer2','mother','sister'],LABELS=['Tú','Tu hermano','Tu madre','Tu hermana'];
const copy=v=>structuredClone(v),record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const numeric=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));
const monthOK=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v)&&Number(v.slice(0,4))>=1900;
const monthIndex=v=>Number(v.slice(0,4))*12+Number(v.slice(5,7))-1;
const monthString=i=>`${Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`;
const money=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;
const unique=v=>[...new Set(v.filter(Boolean))];
function num(value,fallback,label,errors,{min=0,max=Infinity}={}){
 if(value===undefined)return fallback;
 if(!numeric(value)||Number(value)<min||Number(value)>max){errors.push(`${label}: introduce un número válido.`);return fallback;}
 return Number(value);
}
const total=values=>values.reduce((sum,n)=>sum+n,0);
const allocate=(amount,ids)=>{const values=Object.fromEntries(ROLES.map(id=>[id,0]));if(!ids.length)return values;const cents=Math.round(amount*100),base=Math.floor(cents/ids.length);ids.forEach((id,i)=>values[id]=(base+(i<cents-base*ids.length?1:0))/100);return values;};

/** A separate, shareable experiment. No source household or saved home is edited. */
export function normalizeSimulation(raw={},source={}){
 const errors=[];if(!record(raw)){errors.push('La simulación debe ser un objeto.');raw={};}
 const story=normalizePurchaseStory(source.purchaseStory??{},source),legacy=normalizeMortgageSearch(source.homeSearch??{},source);
 const settings={revision:1,goal:raw.goal??'max-price',targetType:raw.targetType??'price',
  targetPrice:num(raw.targetPrice,200000,'Precio a probar',errors,{min:1}),targetPayment:num(raw.targetPayment,700,'Cuota a probar',errors,{min:0}),
  objective:raw.objective??'same-spending',allowedExtraMonthly:num(raw.allowedExtraMonthly,0,'Gasto adicional aceptado',errors),
  minSavingsMonthly:num(raw.minSavingsMonthly,500,'Ahorro mínimo del hogar',errors),
  referenceMonth:raw.referenceMonth??story.referenceMonth,purchaseMonth:raw.purchaseMonth??story.purchaseMonth,
  evaluationMonth:raw.evaluationMonth??raw.purchaseMonth??story.purchaseMonth,
  selectedBank:raw.selectedBank??story.selectedBank,selectedCase:raw.selectedCase??story.selectedCase,bonusMode:raw.bonusMode??'payroll',
  bankDebtMonthly:num(raw.bankDebtMonthly,story.bankDebtMonthly,'Deuda de los titulares al comprar',errors),
  debtRatioLimit:num(raw.debtRatioLimit,story.debtRatioLimit,'Límite bancario',errors,{min:.01,max:1}),
  ibiAnnual:num(raw.ibiAnnual,story.ownershipAnnual/2,'IBI anual',errors),repairsAnnual:num(raw.repairsAnnual,story.ownershipAnnual/2,'Reserva anual de reparaciones',errors),
  wasteAnnual:num(raw.wasteAnnual,story.wasteAnnual,'Residuos anuales',errors),communityMonthly:num(raw.communityMonthly,story.communityMonthly,'Comunidad mensual',errors),
  motherLoanMode:raw.motherLoanMode??'fixed',motherAmount:num(raw.motherAmount,story.referenceMotherAmount,'Capital fijo de mamá',errors,{max:60000}),
  motherLoanCap:num(raw.motherLoanCap,story.motherLoanCap,'Máximo negociable de mamá',errors,{max:60000}),
  motherRate:num(raw.motherRate,story.motherRate,'TIN de mamá',errors,{max:100}),motherYears:num(raw.motherYears,story.motherYears,'Plazo de mamá',errors,{min:1/12,max:40}),
  cashSavings:num(raw.cashSavings,story.cashSavings,'Ahorros para compra',errors),appraisalRatio:num(raw.appraisalRatio,1,'Tasación / precio',errors,{min:.01,max:5}),
  provisionPercent:num(raw.provisionPercent,story.provisionPercent,'Provisión porcentual',errors,{max:100}),buffer:num(raw.buffer,story.buffer,'Colchón',errors),moving:num(raw.moving,story.moving,'Mudanza',errors),
  depositPercent:num(raw.depositPercent,story.depositPercent,'Arras sobre precio',errors,{max:1}),depositFundingMode:raw.depositFundingMode??'pending',
  itpRate:num(raw.itpRate,story.itpRate,'ITP',errors,{max:1}),icfLtv:num(raw.icfLtv,story.icfLtv,'Porcentaje ICF',errors,{max:1}),icfMaxAmount:num(raw.icfMaxAmount,story.icfMaxAmount,'Tope ICF',errors),
  sister:{},departures:{},reductions:{},offers:{}};
 const sister=record(raw.sister)?raw.sister:{};
 settings.sister={enabled:sister.enabled===true,monthly:num(sister.monthly,source.familyPlan?.sisterJob?.amount||500,'Sueldo hipotético de tu hermana',errors),
  payments:num(sister.payments,12,'Pagas de tu hermana',errors,{min:12,max:16}),startMonth:sister.startMonth??source.familyPlan?.sisterJob?.startMonth??settings.purchaseMonth};
 if(!Number.isInteger(settings.sister.payments))errors.push('El número de pagas necesita un entero.');
 for(const [id,label]of ROLES.map((id,i)=>[id,LABELS[i]])){
  const d=record(raw.departures?.[id])?raw.departures[id]:{};
  settings.departures[id]={enabled:d.enabled===true,month:d.month??settings.purchaseMonth,keepFixedShare:d.keepFixedShare!==false,
   fixedContributionMonthly:num(d.fixedContributionMonthly,0,`${label}: aportación desde fuera`,errors),outsideExpensesMonthly:num(d.outsideExpensesMonthly,0,`${label}: gastos fuera`,errors),outsideExpensesConfirmed:d.outsideExpensesConfirmed===true};
  if(!monthOK(settings.departures[id].month))errors.push(`${label}: la salida necesita un mes AAAA-MM.`);
  else if(settings.departures[id].enabled&&settings.departures[id].month<settings.purchaseMonth)errors.push(`${label}: esta simulación contempla salidas desde la compra; para una salida anterior hay que revisar también el alquiler y la espera.`);
 }
 for(const key of ['foodMonthly','waterMonthly','energyMonthly'])settings.reductions[key]=num(raw.reductions?.[key],0,'Reducción de '+key,errors);
 for(const id of ['sabadell','santander']){
  const v=record(raw.offers?.[id])?raw.offers[id]:{},l=legacy.offers[id],p=story.offers[id];
  const quote=productId=>l.products.find(row=>row.id===productId);
  settings.offers[id]={payrollRate:num(v.payrollRate,p.rate,'TIN con nómina',errors,{max:30}),rate:num(v.rate,p.rate,'TIN simulado',errors,{max:30}),
   minRate:num(v.minRate,id==='sabadell'?2.75:2.95,'TIN mínimo previsto',errors,{max:30}),ltv:num(v.ltv,p.ltv,'Financiación bancaria',errors,{min:.01,max:1}),years:num(v.years,p.years,'Años de hipoteca',errors,{min:1/12,max:50}),quotesConfirmed:v.quotesConfirmed===true,
   externalHomeAnnual:num(v.externalHomeAnnual,story.homeInsuranceAnnual??300,'Seguro de hogar externo',errors)};
  for(const productId of ['life','home','protection']){
   settings.offers[id][productId+'Enabled']=v[productId+'Enabled']===true;
   const q=quote(productId),annual=q?.cost==null?(productId==='home'?300:productId==='life'?253.52:340):q.cost*(q.frequency==='monthly'?12:q.frequency==='quarterly'?4:q.frequency==='upfront'?1/(q.coverageYears||1):1);
   settings.offers[id][productId+'Annual']=num(v[productId+'Annual'],annual,`Prima anual ${productId}`,errors);
  }
  if(settings.offers[id].minRate>settings.offers[id].payrollRate)errors.push('El TIN mínimo no puede superar el TIN con nómina.');
  if(!Number.isInteger(settings.offers[id].years*12))errors.push('El plazo hipotecario necesita meses enteros.');
 }
 for(const [key,allowed]of Object.entries({goal:['max-price','check-home'],targetType:['price','payment'],objective:['same-spending','extra-spending','min-savings'],selectedBank:['sabadell','santander'],selectedCase:['gift','interest','principal'],bonusMode:['payroll','products','custom'],motherLoanMode:['fixed','needed'],depositFundingMode:['pending','offset-confirmed','no-release']}))if(!allowed.includes(settings[key]))errors.push('Elige una opción válida para '+key+'.');
 for(const key of ['referenceMonth','purchaseMonth','evaluationMonth'])if(!monthOK(settings[key]))errors.push('Las fechas necesitan formato AAAA-MM.');
 if(settings.purchaseMonth<settings.referenceMonth)errors.push('La compra no puede ser anterior a la referencia actual.');
 if(settings.evaluationMonth<settings.purchaseMonth)errors.push('El mes que evalúas no puede ser anterior a la compra.');
 if(!monthOK(settings.sister.startMonth))errors.push('El trabajo hipotético necesita un mes AAAA-MM.');
 if(settings.sister.enabled&&settings.sister.monthly<=0)errors.push('El trabajo hipotético necesita un sueldo mayor que cero.');
 if(!Number.isInteger(settings.motherYears*12))errors.push('El plazo de mamá necesita meses enteros.');
 if(settings.motherLoanMode==='fixed'&&settings.motherAmount>settings.motherLoanCap)errors.push('El capital fijo de mamá supera el máximo disponible que has indicado.');
 if(errors.length)settings._errors=unique(errors);
 return settings;
}

function bankTerms(settings){
 const o=settings.offers[settings.selectedBank],id=settings.selectedBank,pending=[],products=[];let points=0;
 if(settings.bonusMode!=='payroll')for(const p of ['life','home','protection'])if(o[p+'Enabled']){
  const cost=o[p+'Annual'],threshold=p==='life'?200:300;
  if(id==='sabadell')points+=p==='life'?.4:.1;
  else if(cost>threshold)points+=p==='life'?.1:p==='home'?.2:.3;
  else pending.push(`La prima ${p} no supera el umbral comunicado a Santander; no se aplica esa bonificación.`);
  products.push({id:p,label:({life:'Seguro de vida',home:'Seguro de hogar',protection:'Protección de pagos'})[p],enabled:true,points:0,cost,frequency:'annual',quoteKnown:o.quotesConfirmed});
 }
 points=Math.min(o.payrollRate-o.minRate,id==='sabadell'?.6:.5,points);
 const productRate=Math.max(o.minRate,o.payrollRate-points),rate=settings.bonusMode==='custom'?o.rate:settings.bonusMode==='products'?productRate:o.payrollRate;
 if(settings.bonusMode==='custom'&&rate<productRate-.00001)pending.push('El TIN manual incluye una rebaja que las pólizas seleccionadas no justifican: faltan requisitos y costes de la oferta.');
 if(!o.quotesConfirmed)pending.push('TIN, requisitos y primas pendientes de oferta y presupuestos definitivos.');
 const monthly=products.reduce((sum,p)=>sum+p.cost/12,0)+(products.some(p=>p.id==='home')?0:o.externalHomeAnnual/12);
 return {rate,payrollRate:o.payrollRate,products,monthly,baselineMonthly:o.externalHomeAnnual/12,estimated:pending.length>0,pending};
}
function prepare(source,settings,terms){
 const legacy=normalizeMortgageSearch(source.homeSearch??{},source),o=settings.offers[settings.selectedBank];
 const search={...legacy,revision:2,referenceMonth:settings.referenceMonth,purchaseMonth:settings.purchaseMonth,motherLoanCap:settings.motherLoanMode==='fixed'?settings.motherAmount:settings.motherLoanCap,motherRate:settings.motherRate,motherYears:settings.motherYears,cashSavings:settings.cashSavings,
  ownership:{ibiAnnual:settings.ibiAnnual,maintenanceAnnual:settings.repairsAnnual,wasteAnnual:settings.wasteAnnual,communityMonthly:settings.communityMonthly},purchase:{...legacy.purchase,provisionPercent:settings.provisionPercent,buffer:settings.buffer,moving:settings.moving,depositPercent:settings.depositPercent}};
 const scenario=genericScenario(source,search,settings.selectedBank,'icf','payroll',false).scenario;
 scenario.mortgage={...scenario.mortgage,amount:null,ltv:o.ltv,years:o.years,baseRate:terms.rate,maxDiscountPoints:0,discounts:terms.products};
 scenario.familyLoan={...scenario.familyLoan,amount:settings.motherLoanMode==='fixed'?settings.motherAmount:null,maxAmount:settings.motherLoanMode==='fixed'?settings.motherAmount:settings.motherLoanCap};
 scenario.motherTransfer={...scenario.motherTransfer,mode:settings.selectedCase==='gift'?'gift':'family-loan',repaymentMode:settings.selectedCase==='interest'?'same-as-bank':'custom',familyRate:0,familyYears:settings.motherYears};
 scenario.icf={...scenario.icf,ltv:settings.icfLtv,maxAmount:settings.icfMaxAmount};
 scenario.cash={...scenario.cash,depositFundingMode:settings.depositFundingMode,depositAmount:null};
 scenario.tax.buyers=scenario.tax.buyers.map(row=>({...row,rate:settings.itpRate,eligibilityConfirmed:row.rate===settings.itpRate&&row.eligibilityConfirmed===true}));
 scenario.budget.externalHomeInsuranceAnnual=settings.offers[settings.selectedBank].externalHomeAnnual;
 scenario.budget.ownershipProvisionCombined=true;scenario.budget.ownershipProvisionFromRules=false;
 scenario.familyPlan.sisterJob={enabled:false,amount:0,startMonth:null};
 scenario.familyPlan.sisterSupport.savingsAtPurchase=0;
 return {scenario,search};
}
function salaries(source,settings,month){
 const rows=[...(source.budget.incomes||[]).slice(0,2),...['mother','sister'].map(id=>source.budget.householdIncomes.find(r=>r.id===id))];
 return ROLES.map((id,i)=>({id,label:LABELS[i],income:Number(rows[i]?.monthly||0)+(id==='mother'?Number(source.budget.familyIncomeMonthly||0):0),payments:Number(rows[i]?.payments||12)})).map(p=>p.id==='sister'&&settings.sister.enabled&&month>=settings.sister.startMonth?{...p,income:settings.sister.monthly,payments:settings.sister.payments}:p);
}
function monthlyAllocation(candidate,result,source,settings,price){
 const month=settings.evaluationMonth,elapsed=monthIndex(month)-monthIndex(settings.purchaseMonth),loanStart=candidate.familyPlan.motherLoanStartMonth,loanElapsed=monthIndex(month)-monthIndex(loanStart),b=result.budget;
 const activeMortgage=elapsed<result.mortgage.months,monthlyMortgage=activeMortgage?result.mortgage.monthlyPayment:0;
 const icfMonthly=elapsed>=result.mortgage.months&&elapsed<result.mortgage.months+result.icf.repaymentYears*12?result.icf.deferredMonthlyPayment:0;
 const motherMonthly=loanElapsed>=0&&loanElapsed<result.familyLoan.months?result.familyLoan.monthlyPayment:0;
 const people=salaries(source,settings,month).map(p=>({...p,resident:!(settings.departures[p.id].enabled&&settings.departures[p.id].month<=month)}));
 const activeDepartures=people.filter(p=>!p.resident).map(p=>p.id),active=activeDepartures.length>0;
 const reductionsApplied={foodMonthly:active?Math.min(source.budget.foodMonthly,settings.reductions.foodMonthly):0,waterMonthly:0,energyMonthly:0};
 const detailed=source.budget.utilitiesMode==='detailed',water=detailed?Number(source.budget.utilityBreakdown?.waterMonthly||0):0,energy=detailed?Number(source.budget.utilityBreakdown?.energyMonthly||0):b.utilitiesMonthly;
 reductionsApplied.waterMonthly=active?Math.min(water,settings.reductions.waterMonthly):0;
 reductionsApplied.energyMonthly=active?Math.min(energy,settings.reductions.energyMonthly):0;
 const food=Math.max(0,Number(source.budget.foodMonthly)-reductionsApplied.foodMonthly),utilities=Math.max(0,b.utilitiesMonthly-reductionsApplied.waterMonthly-reductionsApplied.energyMonthly);
 const commitments=calculatePersonalCommitments(candidate.familyPlan,{asOfMonth:month}),transport=calculatePublicTransport(candidate.familyPlan,{owning:true,sisterHasIncome:people[3].income>0});
 const personal=Object.fromEntries(people.map(p=>[p.id,(commitments.debtByOwner[p.id]||0)+(commitments.expenseByOwner[p.id]||0)+(transport.byOwner[p.id]||0)
  +(p.id===(candidate.familyPlan.personalDebtOwner??'buyer1')&&(candidate.familyPlan.personalDebtEndMonth==null||month<=candidate.familyPlan.personalDebtEndMonth)?Number(candidate.budget.existingDebtMonthly||0):0)
  +(p.id==='mother'?Number(candidate.budget.familyExistingDebtMonthly||0):0)+(p.id===candidate.familyPlan.transportOwner?Number(candidate.budget.carMonthly||0):0)]));
 const university=candidate.familyPlan.university,tuition=university?.endMonth&&month<=university.endMonth&&(!university.startMonth||month>=university.startMonth)?Number(university.amount||0):0;
 const ownership=(settings.ibiAnnual+settings.repairsAnnual+settings.wasteAnnual)/12+settings.communityMonthly;
 const otherShared=Number(candidate.budget.otherMonthly||0)+Number(candidate.budget.storageMonthly||0)+(candidate.familyPlan.transportOwner?0:Number(candidate.budget.carMonthly||0));
 const fixedPool=monthlyMortgage+motherMonthly+icfMonthly+ownership+b.insuranceMonthly+Number(candidate.budget.familyInsuranceMonthly||0)+tuition;
 const variablePool=food+utilities+otherShared;
 const earners=people.filter(p=>p.income>0).map(p=>p.id),residents=people.filter(p=>p.resident&&p.income>0).map(p=>p.id);
 const fixedShares=allocate(fixedPool,earners);
 const outsideContributions=Object.fromEntries(people.filter(p=>!p.resident).map(p=>[p.id,settings.departures[p.id].keepFixedShare?fixedShares[p.id]:settings.departures[p.id].fixedContributionMonthly]));
 const outsideTotal=total(Object.values(outsideContributions)),residentPool=Math.max(0,fixedPool+variablePool-outsideTotal),residentShares=allocate(residentPool,residents);
 let rows=people.map(p=>{const d=settings.departures[p.id],homeContribution=p.resident?residentShares[p.id]:outsideContributions[p.id],outsideExpenses=p.resident?0:d.outsideExpensesMonthly,cost=homeContribution+personal[p.id]+outsideExpenses;
  return {...p,homeContribution:money(homeContribution),personalCosts:money(personal[p.id]),outsideExpenses,outsidePending:!p.resident&&!d.outsideExpensesConfirmed,cost:money(cost),remaining:money(p.income-cost),annualExtraIncome:money(p.income*Math.max(0,p.payments-12)),extraPayMonths:candidate.familyPlan.extraPayMonths?.[p.id]??[]};});
 // Same family support rule as the saved budget: a resident sister's uncovered
 // monthly bill is shared among the other earners, without inventing income.
 const sister=rows[3];if(source.familyPlan.sisterSupport?.enabled&&sister.resident&&sister.remaining<0){const donors=rows.filter(p=>p.id!=='sister'&&p.resident&&p.income>0),support=-sister.remaining,parts=allocate(support,donors.map(p=>p.id));if(donors.length)rows=rows.map(p=>p.id==='sister'?{...p,cost:money(p.cost-support),homeContribution:money(p.homeContribution-support),remaining:0,supportReceived:support}:parts[p.id]?{...p,cost:money(p.cost+parts[p.id]),homeContribution:money(p.homeContribution+parts[p.id]),remaining:money(p.remaining-parts[p.id]),supportPaid:parts[p.id]}:p);}
 const residentPersonal=total(rows.filter(p=>p.resident).map(p=>p.personalCosts)),monthlyTotal=fixedPool+variablePool+residentPersonal;
 const monthlyIncome=total(rows.filter(p=>p.resident).map(p=>p.income))+outsideTotal;
 const familyTotal=monthlyTotal+total(rows.filter(p=>!p.resident).map(p=>p.personalCosts+p.outsideExpenses));
 return {people:rows,monthlyTotal:money(monthlyTotal),familyTotal:money(familyTotal),monthlyIncome:money(monthlyIncome),remainingMonthly:money(monthlyIncome-monthlyTotal),monthlyMortgage,motherMonthly,icfMonthly,ownershipMonthly:ownership,
  departuresActive:activeDepartures,reductionsApplied,allocationComplete:residents.length>0||residentPool<=.005,
  components:{mortgage:monthlyMortgage,motherLoan:motherMonthly,icf:icfMonthly,ibi:settings.ibiAnnual/12,repairs:settings.repairsAnnual/12,waste:settings.wasteAnnual/12,community:settings.communityMonthly,insurance:b.insuranceMonthly,familyInsurance:Number(candidate.budget.familyInsuranceMonthly||0),university:tuition,food,utilities,otherShared,personal:residentPersonal}};
}
function evaluator(source,settings,currentRental){
 const terms=bankTerms(settings),{scenario,search}=prepare(source,settings,terms),income=total((source.budget.incomes||[]).map(r=>Number(r.monthly||0))),cache=new Map();
 return {terms,search,at(price){if(cache.has(price))return cache.get(price);
  const candidate=copy(scenario);candidate.purchasePrice=price;candidate.appraisalValue=price*settings.appraisalRatio;
  // The waiting period keeps today's confirmed household salaries. Hypothetical
  // sister income is used in the chosen owned month, never to promise cash for
  // loan payments before the deed has been signed.
  const result=calculateScenario(candidate,{asOfMonth:settings.purchaseMonth});
  if(!result.valid){const invalid={valid:false,allFits:false,purchasePrice:price,errors:result.validation.errors,result,scenario:candidate};cache.set(price,invalid);return invalid;}
  const allocation=monthlyAllocation(candidate,result,source,settings,price),internal=result.motherTransfer.familyMonthlyRepayment;
  const borrowerDebtMonthly=result.mortgage.monthlyPayment+settings.bankDebtMonthly+(internal??0),bankDebtRatio=income>0?borrowerDebtMonthly/income:null;
  const fitsBank=bankDebtRatio!==null&&internal!==null&&bankDebtRatio<=settings.debtRatioLimit+1e-9;
  const fitsCash=result.cash.fundingGap<=.005&&result.cash.beforeMortgageGap<=.005;
  const spendingCap=settings.objective==='same-spending'?currentRental.totalMonthly:settings.objective==='extra-spending'?currentRental.totalMonthly+settings.allowedExtraMonthly:allocation.monthlyIncome-settings.minSavingsMonthly;
  const fitsBudget=allocation.monthlyTotal<=spendingCap+.005, fitsResources=allocation.remainingMonthly>=-.005&&allocation.allocationComplete&&allocation.people.every(p=>p.remaining>=-.005);
  const t=result.preclosing,transitionFits=t.timingConsistent&&t.additionalCashToKeepBuffer!==null&&t.preclosingLiquidityGap!==null&&t.additionalCashToKeepBuffer<=.005&&t.preclosingLiquidityGap<=.005;
  const pending=unique([...terms.pending,'El IBI, reparaciones, residuos y comunidad son provisiones editables, no recibos comprobados.',
   ...(!source.icf.eligibilityConfirmed?['ICF sujeto a requisitos, concesión y condiciones de la vivienda.']:[]),...(result.cash.depositReleasePending?['Liberación o compensación de las arras al firmar pendiente de confirmar.']:[]),
   ...allocation.people.filter(p=>p.outsidePending).map(p=>`${p.label}: faltan los gastos definitivos de vivir fuera; su margen personal es provisional.`),
   ...(result.budget.missingQuotes||[]).map(label=>'Falta presupuesto: '+label),...(result.budget.missingEstimates||[]).map(label=>'Pendiente comprobar: '+label),
   ...(result.cash.insuranceFirstPaymentEstimate>0?['El primer recibo de seguros puede requerir liquidez adicional al inicio. Las primas están prorrateadas en el gasto mensual; confirma cuándo se cobran, porque ese adelanto no está añadido al dinero de adquisición.']:[]),
   ...(settings.sister.enabled?['El trabajo de tu hermana es una hipótesis, no una nómina confirmada ni ingreso de los titulares. La espera previa conserva los ingresos actuales y no anticipa ese sueldo.']:[]),
   ...(settings.sister.enabled&&settings.sister.payments>12?['Las pagas extra de tu hermana se muestran como importe anual; faltan los meses y el neto real de cobro.']:[]),
   ...(result.budget.personalDebtCancellationAssumed?['Las cancelaciones personales previstas dependen de que llegue el cobro extraordinario.']:[])]);
  const evaluated={valid:true,purchasePrice:price,mortgagePrincipal:result.mortgage.principal,icfPrincipal:result.icf.principal,priceContribution:result.cash.priceContribution,tax:result.tax.total,fees:result.cash.purchaseFees,buffer:result.cash.totalReserve,moving:result.cash.moving,giftTax:result.motherTransfer.giftTax,giftNotaryCost:result.motherTransfer.notaryCost,insuranceFirstPaymentEstimate:result.cash.insuranceFirstPaymentEstimate,
   motherRequired:money(Math.max(0,result.cash.totalRequired-settings.cashSavings,result.cash.beforeMortgageRequired-settings.cashSavings)),motherPrincipal:result.familyLoan.principal,motherMonthly:allocation.motherMonthly,internalRepaymentMonthly:internal,
   ...allocation,bankIncome:income,borrowerDebtMonthly,bankDebtRatio,monthlyChange:money(allocation.monthlyTotal-currentRental.totalMonthly),spendingCap,fitsBank,fitsCash,fitsBudget,fitsResources,transitionFits,
   allFits:fitsBank&&fitsCash&&fitsBudget&&fitsResources&&transitionFits,shortfall:money(Math.max(result.cash.fundingGap,result.cash.beforeMortgageGap)),insuranceMonthly:result.budget.insuranceMonthly,
   insurance:{...terms,netSavingMonthly:money(monthlyPayment(result.mortgage.principal,terms.payrollRate,settings.offers[settings.selectedBank].years)-result.mortgage.monthlyPayment-(terms.monthly-terms.baselineMonthly))},pending,
   notes:unique(['La prueba bancaria usa las dos nóminas ordinarias y la deuda indicada para la compra; no suma el salario de mamá o de tu hermana.',
    'La salida de un conviviente reduce solo los consumos que has indicado. Su sueldo no queda disponible para la casa: únicamente su aportación.',
    'La cuota de mamá se cuenta una vez en el gasto familiar. El préstamo al 0 % entre familiares no elimina los intereses que ella paga a su banco.',
    'Las pagas extra se muestran como ingreso anual adicional; no pagan los gastos del mes ordinario.',
    ...(settings.evaluationMonth!==settings.purchaseMonth?['El ratio se comprueba al conceder la hipoteca; los gastos y cuotas del hogar corresponden al mes futuro elegido.']:[])]),scenario:candidate,result,errors:[]};
  cache.set(price,evaluated);return evaluated;
 }};
}
function capacityFor(evaluator,step,ceiling,{exhaustive=false}={}){
 // With fixed dates and residents, increasing price only increases required
 // cash, bank debt and shared bills. A departing earner's proportional fixed
 // contribution cancels at most their share of the increase; their own margin
 // then decreases. min-savings is checked against that same net margin. Thus
 // the supported monetary limits are monotone on the positive price grid.
 // Invalid finance data is different from failing a limit: scan it rather than
 // assuming a low-price validation failure excludes every higher candidate.
 let best=null,next=null,validCount=0,firstErrors=[];
 const first=evaluator.at(step),top=Math.floor(ceiling/step);
 if(exhaustive||!first.valid){for(let index=1;index<=top;index++){const row=evaluator.at(index*step);if(row.valid)validCount++;else if(!firstErrors.length)firstErrors=row.errors;if(row.valid&&row.allFits)best=row;}}
 else{validCount=1;let low=1,high=top;while(low<=high){const mid=Math.floor((low+high)/2),row=evaluator.at(mid*step);if(!row.valid){firstErrors=row.errors;high=mid-1;}else if(row.allFits){best=row;low=mid+1;}else high=mid-1;}}
 const maxPrice=best?.purchasePrice??0;if(maxPrice<ceiling)next=evaluator.at(maxPrice+step);
 const constraint=!next?'search-ceiling':!next.valid?'invalid':!next.fitsCash?'cash':!next.fitsBank?'debt':!next.transitionFits?'transition':!next.fitsResources?'resources':!next.fitsBudget?'spending':'allocation';
 const reason=({cash:'Limita el dinero de compra y arras.',debt:'Limita el esfuerzo de los titulares frente al banco.',transition:'Falta liquidez durante la espera antes de firmar.',resources:'Faltan ingresos o aportaciones disponibles en el hogar.',spending:'Limita el gasto o ahorro mensual elegido.',invalid:'Revisa los datos de la operación.','search-ceiling':'Se alcanza el techo de búsqueda.',allocation:'Revisa el reparto entre personas.'})[constraint];
 return {maxPrice,evaluation:best,next,bindingConstraint:constraint,reason,limitedBySearchCeiling:maxPrice===top*step,priceStep:step,validCount,errors:validCount?[]:firstErrors};
}

/** Recurring cash dashboard. Money is EUR; TINs are percentages, LTV/ITP fractions. */
export function calculateSimulation(input={},raw={},options={}){
 const source=normalizeScenario(input),settings=normalizeSimulation(raw,source),step=options.step??500,ceiling=options.searchCeiling??500000;
 const errors=[...(settings._errors||[])];
 if(!Number.isSafeInteger(step)||step<=0||!Number.isSafeInteger(ceiling)||ceiling<step)errors.push('El paso y techo de búsqueda necesitan euros enteros positivos.');
 const bankIncome=total((source.budget.incomes||[]).map(p=>Number(p.monthly||0)));if(bankIncome<=0)errors.push('Completa las dos nóminas de los titulares.');
 const empty={kind:'simulation',valid:false,settings,currentRental:null,baseline:null,capacity:null,evaluation:null,result:null,people:[],comparison:null,errors:unique(errors),notes:[],pending:[]};if(errors.length)return empty;
 const legacy=normalizeMortgageSearch(source.homeSearch??{},source),currentRental=currentRentalBudget(source,{...legacy,referenceMonth:settings.referenceMonth,purchaseMonth:settings.purchaseMonth});
 if(currentRental.errors?.length)return {...empty,currentRental,errors:currentRental.errors};
 const simulated=evaluator(source,settings,currentRental),capacity=capacityFor(simulated,step,ceiling,options);
 if(capacity.errors.length)return {...empty,currentRental,capacity,errors:capacity.errors};
 let price=settings.targetPrice;if(settings.targetType==='payment'){
  const monthlyForPrice=simulated.at(100000).result?.mortgage?.monthlyPayment;
  price=monthlyForPrice>0?settings.targetPayment/monthlyForPrice*100000:0;
 }
 const evaluation=settings.goal==='max-price'?capacity.evaluation:price>0?simulated.at(price):null;
 const baselineSettings=normalizeSimulation({referenceMonth:settings.referenceMonth,purchaseMonth:settings.purchaseMonth,evaluationMonth:settings.evaluationMonth,goal:settings.goal,targetType:settings.targetType,targetPrice:settings.targetPrice,targetPayment:settings.targetPayment},source);
 const same=JSON.stringify(baselineSettings)===JSON.stringify(settings),baselineEvaluator=same?simulated:evaluator(source,baselineSettings,currentRental),baselineCapacity=same?capacity:capacityFor(baselineEvaluator,step,ceiling,options);
 let baselinePrice=baselineSettings.targetPrice;if(baselineSettings.targetType==='payment'){const per=baselineEvaluator.at(100000).result?.mortgage?.monthlyPayment;baselinePrice=per>0?baselineSettings.targetPayment/per*100000:0;}
 const baselineEvaluation=baselineSettings.goal==='max-price'?baselineCapacity.evaluation:baselinePrice>0?baselineEvaluator.at(baselinePrice):null;
 const comparison={maxPrice:capacity.maxPrice-baselineCapacity.maxPrice,mortgageMonthly:evaluation&&baselineEvaluation?money(evaluation.monthlyMortgage-baselineEvaluation.monthlyMortgage):null,totalMonthly:evaluation&&baselineEvaluation?money(evaluation.monthlyTotal-baselineEvaluation.monthlyTotal):null,remainingMonthly:evaluation&&baselineEvaluation?money(evaluation.remainingMonthly-baselineEvaluation.remainingMonthly):null};
 return {...empty,valid:true,currentRental,baseline:{settings:baselineSettings,capacity:baselineCapacity,evaluation:baselineEvaluation},capacity,evaluation,result:evaluation,people:evaluation?.people??[],comparison,
  errors:unique([...(evaluation?.errors||[])]),pending:evaluation?.pending??[],notes:unique([...(evaluation?.notes||[]),'IBI y reparaciones se separan inicialmente a partes iguales, conservando la provisión anual del plan de referencia. Esta separación provisional es editable.',
   'La simulación no modifica vuestro presupuesto ni las condiciones de las viviendas guardadas.','La capacidad es una exploración de los importes conocidos, no una oferta ni aprobación bancaria.'])};
}
