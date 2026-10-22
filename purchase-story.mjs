import {normalizeScenario, calculateScenario, monthlyPayment} from './finance.mjs?v=37';
import {normalizeMortgageSearch, genericScenario, currentRentalBudget} from './mortgage-search.mjs?v=37';
import {calculateMonthlyCostComparison} from './budget-neutral.mjs?v=37';

const CASES = [
  {id:'gift',title:'Mamá dona el dinero'},
  {id:'interest',title:'Devolvemos capital e intereses'},
  {id:'principal',title:'Devolvemos el capital al 0 %'},
];
const BANKS = [{id:'sabadell',name:'Sabadell'},{id:'santander',name:'Santander'}];
const copy=value=>structuredClone(value);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const numeric=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));
const monthOK=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&Number(value.slice(0,4))>=1900;
const money=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;
const unique=values=>[...new Set(values.filter(Boolean))];
const madridMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit'}).format(new Date());
const number=(value,fallback,label,errors,{min=0,max=Infinity,nullable=false}={})=>{
 if(value===undefined)return fallback;
 if(nullable&&(value===null||value===''))return null;
 if(!numeric(value)||Number(value)<min||Number(value)>max){errors.push(label+': introduce un número válido.');return fallback;}
 return Number(value);
};

/** Shared generic assumptions only; never derived from a saved home's price. */
export function normalizePurchaseStory(raw={},source={}) {
 const errors=[];
 if(!record(raw)){errors.push('Las reglas de compra deben ser un objeto.');raw={};}
 if(!record(source))source={};
 const legacy=normalizeMortgageSearch(record(source.homeSearch)?source.homeSearch:{},source);
 const settings={revision:1,mode:raw.mode??'fixed',referenceMonth:raw.referenceMonth??legacy.referenceMonth,
  purchaseMonth:raw.purchaseMonth??legacy.purchaseMonth,selectedBank:raw.selectedBank??'sabadell',selectedCase:raw.selectedCase??'principal',offers:{},
  bankDebtMonthly:number(raw.bankDebtMonthly,262,'Deuda de los titulares al comprar',errors),
  bankIncomeOverride:number(raw.bankIncomeOverride,null,'Ingreso ordinario para el estudio',errors,{nullable:true}),
  debtRatioLimit:number(raw.debtRatioLimit,source.budget?.debtRatioLimit??.35,'Límite de esfuerzo',errors,{min:.01,max:1}),
  referenceMotherAmount:number(raw.referenceMotherAmount,21500,'Préstamo de referencia de mamá',errors,{max:60000}),
  motherLoanCap:number(raw.motherLoanCap,21500,'Capital máximo negociable de mamá',errors,{max:60000}),
  motherRate:number(raw.motherRate,6.99,'TIN de mamá',errors,{max:100}),
  motherYears:number(raw.motherYears,8,'Plazo de mamá',errors,{min:1/12,max:40}),
  allowedExtraMonthly:number(raw.allowedExtraMonthly,0,'Aumento mensual aceptado',errors),
  ownershipAnnual:number(raw.ownershipAnnual,2000,'IBI y reserva de reparaciones anual conjunta',errors),
  wasteAnnual:number(raw.wasteAnnual,100,'Residuos al año',errors),
  communityMonthly:number(raw.communityMonthly,0,'Comunidad al mes',errors),
  provisionPercent:number(raw.provisionPercent,2,'Provisión de compra porcentual',errors,{max:100}),
  buffer:number(raw.buffer,3000,'Colchón conservado',errors),moving:number(raw.moving,600,'Mudanza',errors),
  depositPercent:number(raw.depositPercent,.1,'Arras sobre precio',errors,{max:1}),
  cashSavings:number(raw.cashSavings,0,'Ahorros aplicados a compra',errors),
  icfLtv:number(raw.icfLtv,.2,'Porcentaje ICF',errors,{max:1}),
  icfMaxAmount:number(raw.icfMaxAmount,50000,'Máximo ICF',errors),
  itpRate:number(raw.itpRate,.05,'ITP de cada comprador',errors,{max:1}),
  homeInsuranceAnnual:number(raw.homeInsuranceAnnual,300,'Seguro de hogar anual reservado',errors,{nullable:true}),
  homeInsuranceConfirmed:raw.homeInsuranceConfirmed===true,
 };
 for(const bank of BANKS){
  const offer=record(raw.offers?.[bank.id])?raw.offers[bank.id]:{};
  settings.offers[bank.id]={rate:number(offer.rate,bank.id==='sabadell'?3.35:3.45,bank.name+': TIN con nómina',errors,{max:30}),
   ltv:number(offer.ltv,bank.id==='sabadell'?.8:.75,bank.name+': financiación bancaria',errors,{min:.01,max:1}),
   years:number(offer.years,30,bank.name+': plazo hipotecario',errors,{min:1/12,max:50})};
  if(!Number.isInteger(settings.offers[bank.id].years*12))errors.push('El plazo hipotecario necesita meses enteros.');
 }
 if(!['fixed','negotiate','budget'].includes(settings.mode))errors.push('Elige límite fijo, negociar préstamo o ajustar presupuesto.');
 if(!BANKS.some(bank=>bank.id===settings.selectedBank))errors.push('Elige Sabadell o Santander.');
 if(!CASES.some(item=>item.id===settings.selectedCase))errors.push('Elige una de las tres entregas de mamá.');
 if(!monthOK(settings.referenceMonth)||!monthOK(settings.purchaseMonth))errors.push('Los meses necesitan formato AAAA-MM.');
 if(monthOK(settings.referenceMonth)&&monthOK(settings.purchaseMonth)&&settings.purchaseMonth<settings.referenceMonth)errors.push('La compra no puede ser anterior al presupuesto actual.');
 if(!Number.isInteger(settings.motherYears*12))errors.push('El plazo de mamá necesita meses enteros.');
 if(errors.length)settings._errors=unique(errors);
 return settings;
}

function searchSettings(source,settings) {
 const legacy=normalizeMortgageSearch(record(source.homeSearch)?source.homeSearch:{},source);
 const offers=copy(legacy.offers);
 for(const bank of BANKS){
  const payrollPoints=bank.id==='sabadell'?.4:.5,rate=settings.offers[bank.id].rate;
  const fullRate=Math.max(0,rate+payrollPoints-1);
  offers[bank.id]={...offers[bank.id],baseRate:rate+payrollPoints,payrollOnlyRate:rate,fullRate,
   insuranceDiscountPoints:bank.id==='sabadell'?rate-fullRate:.5,externalHomeInsuranceAnnual:settings.homeInsuranceAnnual,
   externalHomeQuoteKnown:settings.homeInsuranceConfirmed};
 }
 const result={...legacy,revision:2,referenceMonth:settings.referenceMonth,purchaseMonth:settings.purchaseMonth,
  motherLoanCap:settings.mode==='fixed'?settings.referenceMotherAmount:settings.motherLoanCap,
  motherRate:settings.motherRate,motherYears:settings.motherYears,cashSavings:settings.cashSavings,livingIncreaseMonthly:0,
  ownership:{ibiAnnual:settings.ownershipAnnual,wasteAnnual:settings.wasteAnnual,maintenanceAnnual:0,communityMonthly:settings.communityMonthly},
  purchase:{...legacy.purchase,provisionPercent:settings.provisionPercent,moving:settings.moving,buffer:settings.buffer,depositPercent:settings.depositPercent},
  offers,bonusMode:'payroll'};
 // The story's validated rates already include payroll. Re-running the legacy
 // full-bonus normalizer would invent a negative full-bonus rate at 0 % TIN.
 delete result._errors;
 return result;
}

function caseScenario(source,settings,search,bank,caseId,{reference=false}={}) {
 const scenario=genericScenario(source,search,bank.id,'icf','payroll',true).scenario;
 scenario.mortgage={...scenario.mortgage,ltv:settings.offers[bank.id].ltv,years:settings.offers[bank.id].years,
  baseRate:settings.offers[bank.id].rate,maxDiscountPoints:0,
  discounts:[{id:'payroll',label:'Nómina incluida en el TIN',enabled:true,points:0,cost:0,frequency:'monthly',quoteKnown:true}]};
 scenario.budget.ownershipProvisionCombined=true;scenario.budget.ownershipProvisionFromRules=false;
 scenario.icf={...scenario.icf,ltv:settings.icfLtv,maxAmount:settings.icfMaxAmount};
 scenario.tax.buyers=scenario.tax.buyers.map(buyer=>({...buyer,rate:settings.itpRate,
  eligibilityConfirmed:buyer.rate===settings.itpRate&&buyer.eligibilityConfirmed===true,eligibilityAssumed:settings.itpRate<.1}));
 const fixed=reference||settings.mode==='fixed';
 scenario.familyLoan={...scenario.familyLoan,maxAmount:fixed?settings.referenceMotherAmount:settings.motherLoanCap,
  amount:fixed?settings.referenceMotherAmount:null};
 scenario.motherTransfer={...scenario.motherTransfer,mode:caseId==='gift'?'gift':'family-loan',
  repaymentMode:caseId==='interest'?'same-as-bank':'custom',familyRate:0,familyYears:settings.motherYears};
 return scenario;
}

const borrowerIncome=source=>(source.budget.incomes||[]).reduce((sum,row)=>sum+Number(row.monthly||0),0);
const sourceIncome=row=>row.purchaseIncome??row.income;
function evaluate(scenario,price,currentBudget,settings,bankIncome,spendingCap) {
 const candidate={...scenario,purchasePrice:price,appraisalValue:price,referenceValue:null,declaredValue:null};
 const result=calculateScenario(candidate,{asOfMonth:settings.purchaseMonth});
 if(!result.valid)return {valid:false,scenario:candidate,result,errors:result.validation.errors};
 const comparison=calculateMonthlyCostComparison(candidate,{month:settings.purchaseMonth,asOfMonth:settings.referenceMonth});
 if(!comparison.valid)return {valid:false,scenario:candidate,result,errors:comparison.errors};
 const internal=result.motherTransfer.familyMonthlyRepayment;
 const bankDebt=internal===null?null:result.mortgage.monthlyPayment+settings.bankDebtMonthly+internal;
 const fitsBank=bankDebt!==null&&bankIncome>0&&bankDebt<=bankIncome*settings.debtRatioLimit+1e-8;
 const fitsCash=result.cash.fundingGap<=.005&&result.cash.beforeMortgageGap<=.005;
 const fitsBudget=comparison.purchaseTotal!==null&&comparison.purchaseTotal<=spendingCap+.005;
 const transition=result.preclosing;
 const transitionFits=transition.timingConsistent&&transition.additionalCashToKeepBuffer!==null
  &&transition.preclosingLiquidityGap!==null&&transition.additionalCashToKeepBuffer<=.005&&transition.preclosingLiquidityGap<=.005;
 const people=comparison.people.map(person=>{
  const before=currentBudget.people.find(row=>row.id===person.id);
  return {...person,currentIncome:before?.income??null,currentCost:before?.cost??null,currentRemaining:before?.remaining??null,
   purchaseIncome:sourceIncome(person),difference:before?.cost==null?null:money(person.purchaseCost-before.cost)};
 });
 const total=result.cash.totalRequired-settings.cashSavings;
 const early=result.cash.beforeMortgageRequired-settings.cashSavings;
 const motherRequired=Math.max(0,total,early);
 const missingQuotes=unique([...result.budget.missingQuotes,
  ...(!settings.homeInsuranceConfirmed?['Seguro de hogar reservado sin presupuesto final']:[])]);
 return {valid:true,purchasePrice:price,mortgagePrincipal:result.mortgage.principal,mortgageCapacityMonthly:Math.max(0,bankIncome*settings.debtRatioLimit-settings.bankDebtMonthly-(internal??0)),
  icfPrincipal:result.icf.principal,priceContribution:result.cash.priceContribution,
  tax:result.tax.total,fees:result.cash.purchaseFees,buffer:result.cash.totalReserve,moving:result.cash.moving,
  giftTax:result.motherTransfer.giftTax,giftNotaryCost:result.motherTransfer.notaryCost,
  motherRequired:money(motherRequired),motherPrincipal:result.familyLoan.principal,motherMonthly:result.familyLoan.monthlyPayment,
  shortfall:money(Math.max(result.cash.fundingGap,result.cash.beforeMortgageGap)),
  finalShortfall:result.cash.fundingGap,earlyShortfall:result.cash.beforeMortgageGap,
  monthlyMortgage:result.mortgage.monthlyPayment,internalRepaymentMonthly:internal,
  motherNetMonthly:internal===null||result.familyLoan.monthlyPayment===null?null:result.familyLoan.monthlyPayment-internal,
  budgetTotal:comparison.purchaseTotal,budgetChange:money(comparison.purchaseTotal-currentBudget.totalMonthly),
  budgetRemaining:money(comparison.people.reduce((sum,row)=>sum+sourceIncome(row),0)-comparison.purchaseTotal),
  people,borrowerDebtMonthly:bankDebt,bankDebtRatio:bankIncome>0&&bankDebt!==null?bankDebt/bankIncome:null,
  spendingCap,fitsBank,fitsCash,fitsBudget,transitionFits,
  transitionAboveBudget:transition.monthlyOutflow===null?null:Math.max(0,transition.monthlyOutflow-currentBudget.totalMonthly),
  allFits:fitsBank&&fitsCash&&fitsBudget&&transitionFits,
  ownershipMonthly:(settings.ownershipAnnual+settings.wasteAnnual)/12+settings.communityMonthly,
  insuranceMonthly:result.budget.insuranceMonthly,missingQuotes,
  notes:unique([
   'El TIN incluye solamente la bonificación de nómina. Otros seguros bonificados quedan fuera de esta hipótesis.',
   'El gasto de vida actual se conserva como reserva; las cuotas para el estudio hipotecario son la deuda indicada al comprar.',
   'IBI y reparaciones comparten una reserva anual única; no se añade otra reserva de mantenimiento.',
   ...(settings.communityMonthly===0?['Comunidad a 0 € como hipótesis genérica, pendiente de comprobar en cada vivienda.']:[]),
   ...(result.cash.depositReleasePending?['Pendiente confirmar con banco e ICF cómo se liquidan las arras en la firma.']:[]),
   ...(scenario.motherTransfer.mode==='gift'?['La donación tiene fiscalidad y formalización propias; la madre sigue debiendo su préstamo bancario.']:[]),
   ...missingQuotes.map(label=>'Pendiente: '+label),
  ]),scenario:candidate,result,errors:[]};
}

/** Six comparisons: a bank-only illustration followed by a jointly feasible limit. */
export function calculatePurchaseStory(input={},raw={},options={}) {
 const source=normalizeScenario(input),settings=normalizePurchaseStory(raw,source);
 const step=options.step??500,ceiling=options.searchCeiling??1000000;
 const errors=[...(settings._errors||[])];
 if(!Number.isSafeInteger(step)||step<=0||!Number.isSafeInteger(ceiling)||ceiling<step)errors.push('El paso y el techo de búsqueda deben ser euros enteros positivos.');
 const search=searchSettings(source,settings);
 errors.push(...(search._errors||[]));
 const bankIncome=settings.bankIncomeOverride??borrowerIncome(source);
 if(bankIncome<=0)errors.push('Completa las dos nóminas ordinarias de los titulares.');
 const empty={kind:'purchase-story',valid:false,source,settings,currentBudget:null,bankIncome,bankDebtMonthly:settings.bankDebtMonthly,
  debtLimitMonthly:bankIncome*settings.debtRatioLimit,referenceMother:null,hypotheses:[],rows:[],scenarios:[],selected:null,
  spendingCap:null,priceStep:step,searchCeiling:ceiling,errors:unique(errors),missingQuotes:[]};
 if(errors.length)return empty;
 let currentBudget;
 try{currentBudget=currentRentalBudget(source,search);}catch(error){return {...empty,errors:[error.message]};}
 if(currentBudget.errors?.length)return {...empty,currentBudget,errors:currentBudget.errors};
 const spendingCap=currentBudget.totalMonthly+(settings.mode==='budget'?settings.allowedExtraMonthly:0);
 const referenceMother={principal:settings.referenceMotherAmount,monthly:monthlyPayment(settings.referenceMotherAmount,settings.motherRate,settings.motherYears),
  principalOnlyMonthly:settings.referenceMotherAmount/(settings.motherYears*12),rate:settings.motherRate,years:settings.motherYears};
 const hypotheses=CASES.map(item=>{
  const repaymentMonthly=item.id==='gift'?0:item.id==='interest'?referenceMother.monthly:referenceMother.principalOnlyMonthly;
  return {...item,repaymentMonthly,mortgageCapacityMonthly:Math.max(0,bankIncome*settings.debtRatioLimit-settings.bankDebtMonthly-repaymentMonthly)};
 });
 const rows=[];
 for(const bank of BANKS)for(const item of hypotheses){
  const offer=settings.offers[bank.id],paymentForEuro=monthlyPayment(1,offer.rate,offer.years);
  const mortgagePrincipal=item.mortgageCapacityMonthly/paymentForEuro;
  const price=mortgagePrincipal/offer.ltv;
  const reference=price>0?evaluate(caseScenario(source,settings,search,bank,item.id,{reference:true}),price,currentBudget,settings,bankIncome,spendingCap):null;
  if(reference)reference.mortgageCapacityMonthly=item.mortgageCapacityMonthly;
  const scenario=caseScenario(source,settings,search,bank,item.id),cache=new Map();
  const at=index=>{
   if(!cache.has(index))cache.set(index,evaluate(scenario,index*step,currentBudget,settings,bankIncome,spendingCap));
   return cache.get(index);
  };
  let low=1,high=Math.floor(ceiling/step),best=0;
  while(low<=high){const mid=Math.floor((low+high)/2),candidate=at(mid);if(candidate.valid&&candidate.allFits){best=mid;low=mid+1;}else high=mid-1;}
  const actual=best?at(best):null,next=at(best+1);
  const binding=!next.valid?'invalid':!next.fitsCash?'cash':!next.fitsBank?'debt':!next.fitsBudget?'spending':!next.transitionFits?'transition':'search-ceiling';
  const reason=({invalid:'Hay datos que revisar.',cash:'Limita el dinero de compra y arras.',debt:'Limita la cuota de los titulares frente al 35 % indicado.',spending:'Limita el gasto mensual familiar.',transition:'Falta liquidez durante la espera antes de firmar.','search-ceiling':'Se alcanza el techo de búsqueda.'})[binding];
  rows.push({id:bank.id+'-'+item.id,bankId:bank.id,bankName:bank.name,caseId:item.id,title:item.title,
   reference,actual,maxPrice:best*step,maxPriceKnownCosts:best*step,reason,bindingConstraint:binding,
   limits:{fitsCash:actual?.fitsCash??false,fitsBank:actual?.fitsBank??false,fitsBudget:actual?.fitsBudget??false,
    transitionFits:actual?.transitionFits??false,spendingCap,loanCap:scenario.familyLoan.maxAmount,referenceLoan:settings.referenceMotherAmount,
    priceStep:step,searchCeiling:ceiling,limitedBySearchCeiling:best===Math.floor(ceiling/step)},
   missingQuotes:unique([...(reference?.missingQuotes||[]),...(actual?.missingQuotes||[])]),
   notes:actual?.notes??reference?.notes??[],errors:unique([...(reference?.errors||[]),...(!actual&&!next.valid?next.errors:[])])});
 }
 const selected=rows.find(row=>row.bankId===settings.selectedBank&&row.caseId===settings.selectedCase)||rows[0];
 return {...empty,valid:true,currentBudget,spendingCap,referenceMother,hypotheses,rows,scenarios:rows,selected,
  errors:unique(rows.flatMap(row=>row.errors)),missingQuotes:unique(rows.flatMap(row=>row.missingQuotes))};
}
