import {getCommuteIndicators as defaultCommuteIndicators} from './commute.mjs?v=37';

export const HOUSING_SORT_OPTIONS=Object.freeze([
 ['favorites','Favoritas, después coste mensual'],
 ['monthly','Menor coste familiar mensual'],
 ['price','Menor precio de vivienda'],
 ['upfront','Menor dinero inicial necesario'],
 ['travel','Menor tiempo medio de trayecto'],
]);
const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const nonnegative=value=>{const n=finite(value);return n!==null&&n>=0?n:null;};
const positive=value=>{const n=finite(value);return n!==null&&n>0?n:null;};
const DEFAULT_DESTINATIONS=[['sant-joan','Sant Joan Despí'],['elisava','Elisava'],['gran-via','Leonardo Royal']];
const SORTS=new Set(HOUSING_SORT_OPTIONS.map(([key])=>key));

function commuteRows(scenario,getIndicators){
 let input=[];
 try{input=getIndicators(scenario)||[];}catch{}
 return DEFAULT_DESTINATIONS.map(([id,label],i)=>{
  const source=Array.isArray(input)?input.find(row=>row?.id===id)||(!input[i]?.id?input[i]:null)||{}:{};
  let min=nonnegative(source.totalMinutesMin),max=nonnegative(source.totalMinutesMax);
  if(min!==null&&max!==null&&min>max)min=max=null;
  return {...source,id,label:typeof source.label==='string'&&source.label?source.label:label,
   totalMinutesMin:min,totalMinutesMax:max,estimated:source.estimated===true,
   timeLabel:typeof source.timeLabel==='string'&&source.timeLabel?source.timeLabel:'Por comprobar',
   departure:typeof source.departure==='string'?source.departure:'08:00'};
 });
}

/** Pure display/ranking data. Unknown financial amounts and travel times stay null. */
export function analyzeHome(scenario,{calculateScenario,getCommuteIndicators=defaultCommuteIndicators}={}){
 let result={valid:false};
 try{result=typeof calculateScenario==='function'?calculateScenario(scenario)||result:result;}catch{}
 const valid=result.valid===true,b=valid&&result.budget?result.budget:{};
 const incomplete=!valid||b.incomplete!==false||result.icf?.hypothetical===true||result.cash?.depositReleasePending===true
  ||nonnegative(b.totalMonthly)===null||nonnegative(result.cash?.totalRequired)===null;
 const commute=commuteRows(scenario,getCommuteIndicators);
 const completeTravel=commute.every(t=>t.totalMinutesMin!==null&&t.totalMinutesMax!==null);
 const debtRatio=valid?nonnegative(b.debtRatio):null;
 const debtKnown=debtRatio!==null&&b.borrowerDebtRatioIncomplete===false;
 const reference=nonnegative(b.debtRatioLimit)>0&&b.debtRatioLimit<=1?b.debtRatioLimit:0.35;
 const referenceLabel=(reference*100).toLocaleString('es-ES',{maximumFractionDigits:2})+' %';
 const debtStatus={
  code:!valid?'invalid':!debtKnown?'pending':debtRatio>reference+1e-10?'above':'within',
  label:!valid?'Revisa los datos':!debtKnown?'Ratio de titulares pendiente':debtRatio>reference+1e-10?`Supera el ${referenceLabel} simulado`:`Dentro del ${referenceLabel} simulado`,
  ratio:debtKnown?debtRatio:null,reference,
 };
 return {scenario,result,valid,favorite:scenario?.favorite===true,incomplete,
  estimated:Boolean(valid&&(b.propertyCostsEstimated||b.assumedLoanTerms||result.familyLoan?.termsAssumed||result.icf?.hypothetical||result.cash?.purchaseFeesEstimated)),
  metrics:{
   price:nonnegative(scenario?.purchasePrice)>0?scenario.purchasePrice:null,
   surfaceM2:positive(scenario?.listingDetails?.surfaceM2),
   bedrooms:positive(scenario?.listingDetails?.beds),
   bathrooms:positive(scenario?.listingDetails?.baths),
   totalMonthly:valid?nonnegative(b.totalMonthly):null,
   totalRequired:valid?nonnegative(result.cash?.totalRequired):null,
   motherPrincipal:valid?nonnegative(result.familyLoan?.principal):null,
   fundingGap:valid?nonnegative(result.cash?.fundingGap):null,
   remainingMonthly:valid?finite(b.remainingRegular):null,
   mortgageMonthly:valid?nonnegative(b.mortgageOnly??result.mortgage?.monthlyPayment):null,
   motherBankMonthly:valid?nonnegative(b.motherBankLoanMonthly??result.familyLoan?.monthlyPayment):null,
   childrenRepaymentMonthly:valid&&b.borrowerDebtRatioIncomplete!==true?nonnegative(b.borrowerFamilyRepaymentMonthly??result.motherTransfer?.familyMonthlyRepayment):null,
   insuranceMonthly:valid?nonnegative(b.insuranceMonthly):null,
   debtRatio,
   commuteMeanMinutes:completeTravel?commute.reduce((sum,t)=>sum+(t.totalMinutesMin+t.totalMinutesMax)/2,0)/3:null,
  },debtStatus,commute};
}

function compareKnown(a,b){
 if(a===null)return b===null?0:1;
 if(b===null)return -1;
 return a-b;
}
function sortedAnalyses(analyses,sort){
 const criterion=SORTS.has(sort)?sort:'favorites';
 return analyses.map((home,index)=>({home,index})).sort((left,right)=>{
  const a=left.home,b=right.home;
  if(criterion==='favorites'&&a.favorite!==b.favorite)return a.favorite?-1:1;
  if(['favorites','monthly','upfront'].includes(criterion)&&a.incomplete!==b.incomplete)return a.incomplete?1:-1;
  const key={favorites:'totalMonthly',monthly:'totalMonthly',price:'price',upfront:'totalRequired',travel:'commuteMeanMinutes'}[criterion];
  return compareKnown(a.metrics[key],b.metrics[key])||left.index-right.index;
 }).map(({home})=>home);
}

/**
 * Returns analyses in the explicitly selected order; never changes scenarios.
 * Pending budgets follow complete budgets for monthly/upfront ordering. Travel
 * is the mean midpoint of all three morning ranges; a partial set is unknown.
 */
export function rankHomes(rows,options={}){
 return sortedAnalyses((Array.isArray(rows)?rows:[]).map(row=>analyzeHome(row,options)),options.sort||'favorites');
}

/** Three separate criteria, without a combined score or a global winner. */
export function getHousingHighlights(rows,options={}){
 const homes=(Array.isArray(rows)?rows:[]).map(row=>analyzeHome(row,options));
 return [
  ['monthly','Menor coste mensual calculado','totalMonthly',true],
  ['price','Menor precio de vivienda','price',false],
  ['travel','Menor tiempo medio de trayecto','commuteMeanMinutes',false],
 ].flatMap(([criterion,label,metric,completeBudget])=>{
  const eligible=homes.filter(home=>home.metrics[metric]!==null&&(!completeBudget||!home.incomplete));
  const home=sortedAnalyses(eligible,criterion)[0];
  return home?[{criterion,label,home}]:[];
 });
}
