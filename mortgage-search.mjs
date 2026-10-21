import {normalizeScenario, calculateScenario, monthlyPayment} from './finance.mjs?v=34';
import {calculateMonthlyCostComparison} from './budget-neutral.mjs?v=34';
import {calculateFamilyTimeline, normalizeFamilyPlan} from './family-plan.mjs?v=34';

// Generic market search: the reference is today's rental budget, never a saved
// property's price, valuations, local bills, down payment or manual loan amount.
const BANKS = [{id:'sabadell',name:'Sabadell'},{id:'santander',name:'Santander'}];
const MODES = ['icf','standard','conditional90'];
const PRODUCT_IDS = ['life','home','protection'];
const PRODUCT_NAMES = {life:'Seguro de vida',home:'Seguro de hogar',protection:'Protección de pagos'};
const TOLERANCE = .005;
const copy = value => structuredClone(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const numeric = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
const monthOK = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0,4)) >= 1900;
const monthIndex = value => Number(value.slice(0,4))*12 + Number(value.slice(5,7))-1;
const monthString = index => `${Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`;
const madridMonth = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit'}).format(new Date());
const money = value => Math.round((Number(value)+Number.EPSILON)*100)/100;
const unique = values => [...new Set(values.filter(Boolean))];

function normalizedNumber(value,fallback,label,errors,{min=0,max=Infinity,nullable=false}={}) {
  if(value === undefined)return fallback;
  if(nullable && (value === null || value === ''))return null;
  if(!numeric(value) || Number(value)<min || Number(value)>max){errors.push(`${label}: indica un número válido entre ${min} y ${max===Infinity?'un importe no negativo':max}.`);return fallback;}
  return Number(value);
}
function sourceMotherYears(source) {
  const years=source.familyLoan?.years;
  return numeric(years)&&Number(years)>0&&Number(years)<=8&&Number.isInteger(Number(years)*12)?Number(years):8;
}
function normalizeProducts(bankId,rawProducts,initialProducts,errors) {
  if(rawProducts!==undefined&&rawProducts!==null&&!Array.isArray(rawProducts))errors.push(`Las pólizas de ${bankId} deben ser una lista.`);
  const rows=Array.isArray(rawProducts)?rawProducts:[];
  return PRODUCT_IDS.map(id=>{
    const row=rows.find(p=>p?.id===id)||{}, inherited=initialProducts?.find(p=>p?.id===id)||{};
    const base={id,label:PRODUCT_NAMES[id],enabled:bankId==='sabadell'||id!=='life',cost:null,
      frequency:bankId==='sabadell'&&id==='protection'?'upfront':'annual',quoteKnown:false,coverageYears:5,
      points:bankId==='santander'?{life:.1,home:.2,protection:.3}[id]:null,
      annualThreshold:bankId==='santander'?(id==='life'?200:300):null};
    const inheritedQuote=Object.fromEntries(['label','cost','frequency','quoteKnown','coverageYears'].filter(key=>Object.hasOwn(inherited,key)).map(key=>[key,inherited[key]]));
    const product={...base,...inheritedQuote,...row,id};
    product.label=typeof product.label==='string'?product.label:base.label;
    product.enabled=typeof product.enabled==='boolean'?product.enabled:base.enabled;
    product.quoteKnown=product.quoteKnown===true;
    product.cost=normalizedNumber(product.cost,null,`${bankId}: prima de ${product.label}`,errors,{nullable:true});
    if(!['monthly','quarterly','annual','upfront'].includes(product.frequency)){errors.push(`Periodicidad no válida para ${product.label}.`);product.frequency=base.frequency;}
    product.coverageYears=normalizedNumber(product.coverageYears,5,'Años de cobertura',errors,{min:1/12,max:50});
    if(bankId==='santander'){
      // The screenshot fixes points/thresholds; thresholds are never premium quotes.
      product.points=base.points;product.annualThreshold=base.annualThreshold;
    } else {product.points=null;product.annualThreshold=null;}
    return product;
  });
}

/** Settings only. Source insurance quotes are inherited once, on initialization. */
export function normalizeMortgageSearch(raw={},source={}) {
  const errors=[];
  if(!record(raw)){errors.push('La búsqueda hipotecaria debe ser un objeto.');raw={};}
  if(!record(source))source={};
  const ownership=record(raw.ownership)?raw.ownership:{},purchase=record(raw.purchase)?raw.purchase:{};
  const inheritedRate=numeric(source.familyLoan?.rate)&&Number(source.familyLoan.rate)>=0&&Number(source.familyLoan.rate)<=100?Number(source.familyLoan.rate):6.99;
  const settings={
    referenceMonth:raw.referenceMonth??madridMonth(),
    purchaseMonth:raw.purchaseMonth??source.familyPlan?.purchaseMonth??madridMonth(),
    cashSavings:normalizedNumber(raw.cashSavings,0,'Ahorro de compra',errors),
    motherLoanCap:normalizedNumber(raw.motherLoanCap,21500,'Límite de mamá',errors,{max:60000}),
    motherRate:normalizedNumber(raw.motherRate,inheritedRate,'TIN de mamá',errors,{max:100}),
    motherYears:normalizedNumber(raw.motherYears,sourceMotherYears(source),'Plazo de mamá',errors,{min:1/12,max:40}),
    ownership:{},purchase:{},offers:{},
    selectedBank:raw.selectedBank??'sabadell',financingMode:raw.financingMode??'icf',bonusMode:raw.bonusMode??'full',
    conditional90Enabled:raw.conditional90Enabled===true,
    appraisalRatio:normalizedNumber(raw.appraisalRatio,1.125,'Relación de tasación',errors,{min:1,max:5}),
    testPrice:normalizedNumber(raw.testPrice,null,'Precio de comparación',errors,{min:1,nullable:true}),
  };
  for(const [key,fallback] of Object.entries({ibiAnnual:1500,wasteAnnual:300,communityMonthly:100,maintenanceAnnual:0}))
    settings.ownership[key]=normalizedNumber(ownership[key],fallback,key,errors);
  for(const [key,fallback] of Object.entries({provisionPercent:2,moving:600,buffer:3000,depositPercent:.1}))
    settings.purchase[key]=normalizedNumber(purchase[key],fallback,key,errors,{max:key==='depositPercent'?1:key==='provisionPercent'?100:Infinity});
  for(const bank of BANKS){
    const offered=record(raw.offers?.[bank.id])?raw.offers[bank.id]:{};
    const initial=!Object.hasOwn(raw.offers||{},bank.id);
    const defaults=bank.id==='sabadell'?{baseRate:3.75,payrollOnlyRate:3.30,fullRate:2.70,insuranceDiscountPoints:.60}
      :{baseRate:3.95,payrollOnlyRate:3.45,fullRate:2.95,insuranceDiscountPoints:.50};
    const offer={};
    for(const [key,fallback] of Object.entries(defaults))offer[key]=normalizedNumber(offered[key],fallback,`${bank.name}: ${key}`,errors,{max:30,nullable:key==='payrollOnlyRate'});
    offer.products=normalizeProducts(bank.id,offered.products,initial&&bank.id==='sabadell'?source.mortgage?.discounts:null,errors);
    offer.externalHomeInsuranceAnnual=normalizedNumber(offered.externalHomeInsuranceAnnual,
      initial&&bank.id==='sabadell'&&numeric(source.budget?.externalHomeInsuranceAnnual)?Number(source.budget.externalHomeInsuranceAnnual):null,
      `${bank.name}: seguro de hogar alternativo`,errors,{nullable:true});
    offer.source=bank.id==='santander'?'photo-2026-10-21':'family-reported';
    offer.discountStartsMonth=bank.id==='santander'?7:1;
    if(offer.fullRate>offer.baseRate || offer.payrollOnlyRate!==null&&(offer.payrollOnlyRate>offer.baseRate||offer.payrollOnlyRate<offer.fullRate))
      errors.push(`Revisa los TIN de ${bank.name}: el tipo bonificado no puede superar el de referencia.`);
    if(bank.id==='sabadell'&&offer.payrollOnlyRate!==null&&Math.abs(offer.payrollOnlyRate-offer.fullRate-offer.insuranceDiscountPoints)>.00001)
      errors.push('Sabadell: la rebaja agregada de seguros debe coincidir con nómina menos bonificación completa.');
    settings.offers[bank.id]=offer;
  }
  if(!monthOK(settings.referenceMonth))errors.push('El mes actual necesita formato AAAA-MM.');
  if(!monthOK(settings.purchaseMonth))errors.push('El mes de compra necesita formato AAAA-MM.');
  if(monthOK(settings.referenceMonth)&&monthOK(settings.purchaseMonth)&&settings.purchaseMonth<settings.referenceMonth)errors.push('La compra no puede ser anterior al mes de referencia.');
  if(!Number.isInteger(settings.motherYears*12))errors.push('El plazo de mamá debe tener meses enteros.');
  if(!BANKS.some(bank=>bank.id===settings.selectedBank))errors.push('Selecciona Sabadell o Santander.');
  if(!MODES.includes(settings.financingMode))errors.push('Selecciona un modo de financiación válido.');
  if(!['full','payroll'].includes(settings.bonusMode))errors.push('Selecciona nómina o bonificación completa.');
  if(errors.length)settings._errors=unique(errors);
  return settings;
}

function insuranceAmounts(product) {
  if(product.cost===null)return {annual:null,recurring:null,equivalent:null,upfront:null};
  const cost=product.cost;
  if(product.frequency==='upfront')return {annual:cost/product.coverageYears,recurring:0,equivalent:cost/(product.coverageYears*12),upfront:cost};
  const annual=cost*(product.frequency==='monthly'?12:product.frequency==='quarterly'?4:1);
  return {annual,recurring:annual/12,equivalent:annual/12,upfront:0};
}
function offerTerms(bankId,offer,bonusMode) {
  const payrollRate=offer.payrollOnlyRate??offer.baseRate,chosen=offer.products.filter(p=>p.enabled);
  const notes=[],missing=[];
  let insurancePoints=0;
  if(bonusMode==='full'){
    if(bankId==='sabadell'){
      const complete=PRODUCT_IDS.every(id=>chosen.some(p=>p.id===id));
      insurancePoints=complete?offer.insuranceDiscountPoints:0;
      if(!complete)notes.push('Sabadell: sin las tres pólizas no se atribuye un reparto de los0,60puntos que no está desglosado.'.replace('los0,60','los 0,60 '));
    } else {
      for(const product of chosen){
        const amount=insuranceAmounts(product);
        const known=product.quoteKnown&&amount.annual!==null;
        if(!known){insurancePoints+=product.points;notes.push(`${product.label}: bonificación condicionada a superar ${product.annualThreshold}€/año; ese umbral no es una prima cotizada.`);}
        else if(amount.annual>product.annualThreshold)insurancePoints+=product.points;
        else notes.push(`${product.label}: la prima anual no supera ${product.annualThreshold}€ y no recibe su bonificación.`);
      }
      insurancePoints=Math.min(.5,Math.max(0,1-(offer.baseRate-payrollRate)),Math.max(0,payrollRate-offer.fullRate),insurancePoints);
    }
  }
  if(bankId==='santander')notes.push('Santander: bonificaciones desde el mes7; se compara la cuota estable posterior, sin inventar el TIN de los primeros seis meses.');
  const products=bonusMode==='full'?chosen:[];
  for(const p of products)if(p.cost===null||!p.quoteKnown)missing.push(p.label);
  const hasHome=products.some(p=>p.id==='home');
  if(!hasHome&&offer.externalHomeInsuranceAnnual===null)missing.push('Seguro de hogar alternativo');
  const rate=Math.max(0,payrollRate-insurancePoints);
  const payrollPoints=Math.max(0,offer.baseRate-payrollRate);
  const discounts=[{id:'payroll',label:'Nómina',enabled:true,points:payrollPoints,cost:0,frequency:'monthly',quoteKnown:true},
    {id:'insurance-bundle',label:'Bonificación agregada de seguros',enabled:insurancePoints>0,points:insurancePoints,cost:0,frequency:'monthly',quoteKnown:true},
    ...products.map(p=>({...p,points:0,enabled:true}))];
  return {rate,payrollRate:offer.payrollOnlyRate,products,discounts,missingQuotes:unique(missing),notes,
    recurringKnown:products.reduce((sum,p)=>sum+(insuranceAmounts(p).recurring??0),0)+(hasHome?0:offer.externalHomeInsuranceAnnual===null?0:offer.externalHomeInsuranceAnnual/12),
    equivalentKnown:products.reduce((sum,p)=>sum+(insuranceAmounts(p).equivalent??0),0),
    upfrontEquivalentKnown:products.filter(p=>p.frequency==='upfront').reduce((sum,p)=>sum+(insuranceAmounts(p).equivalent??0),0)};
}

function genericScenario(source,settings,bankId,mode,bonusMode=settings.bonusMode) {
  const sourceScenario=normalizeScenario(copy(source)),offer=settings.offers[bankId],terms=offerTerms(bankId,offer,bonusMode);
  const plan=normalizeFamilyPlan(sourceScenario.familyPlan??{});
  plan.purchaseMonth=settings.purchaseMonth;plan.sisterSupport.savingsAtPurchase=0;
  const wait=sourceScenario.cash.preClosingLoanPayments;
  const loanStart=monthOK(plan.motherLoanStartMonth)?plan.motherLoanStartMonth:monthString(monthIndex(settings.purchaseMonth)-wait);
  plan.motherLoanStartMonth=loanStart;
  const shares=sourceScenario.tax.buyers.map(b=>({share:b.share}));
  const transfer=copy(sourceScenario.motherTransfer);
  if(transfer.mode==='family-loan'&&transfer.repaymentMode==='custom'&&transfer.familyYears===null)transfer.familyYears=settings.motherYears;
  const scenario=normalizeScenario({purchasePrice:1,propertyType:'flat',appraisalValue:null,referenceValue:null,declaredValue:null,
    searchAppraisalRatio:mode==='conditional90'?settings.appraisalRatio:1,
    tax:{mode:'used',buyers:copy(sourceScenario.tax.buyers)},
    mortgage:{ltv:mode==='conditional90'?.9:bankId==='santander'&&mode==='icf'?.75:.8,years:30,
      baseRate:offer.baseRate,maxDiscountPoints:Math.max(0,offer.baseRate-terms.rate),discounts:terms.discounts},
    icf:{enabled:mode==='icf',ltv:.2,maxAmount:50000,repaymentYears:5,eligibilityConfirmed:false},
    familyLoan:{enabled:true,amount:null,maxAmount:settings.motherLoanCap,rate:settings.motherRate,years:settings.motherYears,
      extraBuffer:settings.purchase.buffer,assumedTerms:true,coverEarlyLiquidity:true},
    motherTransfer:{...transfer,allocations:transfer.allocations.length?transfer.allocations:shares},
    cash:{savings:settings.cashSavings,depositPercent:settings.purchase.depositPercent,
      preClosingLoanPayments:Math.max(0,Math.min(60,monthIndex(settings.purchaseMonth)-monthIndex(loanStart))),
      familyLoanAvailableBeforeDeposit:true,depositFundingMode:'pending'},
    purchaseCosts:{mode:'provision',provisionBasis:'percent',provisionPercent:settings.purchase.provisionPercent,
      provisionAmount:5000,provisionBeforeSigning:0,moving:settings.purchase.moving,brokerQuotePending:true},
    budget:{...copy(sourceScenario.budget),...copy(settings.ownership),propertyCostsEstimated:true,propertyCostsConfirmed:false,
      ibiLiquidableBase:null,ibiRatePercent:null,externalHomeInsuranceAnnual:offer.externalHomeInsuranceAnnual},familyPlan:plan,stress:copy(sourceScenario.stress)});
  return {scenario,terms};
}

function currentRentalBudget(source,settings) {
  const {scenario}=genericScenario(source,settings,'sabadell','standard','payroll');
  scenario.familyLoan.enabled=false;scenario.icf.enabled=false;scenario.mortgage.amount=0;
  scenario.cash.preClosingLoanPayments=0;scenario.familyPlan.usePurchaseDebtDate=false;
  scenario.familyPlan.sisterJob.enabled=false;
  // Only a confirmed receipt already dated before the reference may cancel a
  // current debt. Merely passing a hypothetical receipt date is not evidence.
  scenario.familyPlan.extraordinaryReceipt.enabled=scenario.familyPlan.extraordinaryReceipt.enabled
    &&scenario.familyPlan.extraordinaryReceipt.confirmed&&scenario.familyPlan.extraordinaryReceipt.month<=settings.referenceMonth;
  scenario.familyPlan.purchaseMonth=settings.referenceMonth;
  scenario.familyPlan.motherLoanStartMonth=settings.referenceMonth;
  const c=calculateMonthlyCostComparison(scenario,{month:settings.referenceMonth,asOfMonth:settings.referenceMonth});
  if(!c.valid)return {errors:c.errors};
  const r=calculateScenario(scenario,{asOfMonth:settings.referenceMonth}),b=r.budget;
  const people=c.people.map(p=>({id:p.id,label:p.label,income:p.currentIncome,cost:p.currentCost,remaining:p.currentRemaining}));
  const components={rent:b.currentRent,utilities:b.currentUtilitiesMonthly,food:scenario.budget.foodMonthly,
    familyInsurance:b.familyInsuranceMonthly,car:scenario.budget.carMonthly,
    existingDebt:b.existingDebtMonthly+b.familyExistingDebtMonthly,university:b.universityMonthly,
    personalExpenses:b.personalCommitmentExpenseMonthly,publicTransport:b.publicTransportExpenseMonthly,
    other:scenario.budget.otherMonthly+scenario.budget.storageMonthly+scenario.budget.currentOtherMonthly};
  const incomeMonthly=money(people.reduce((sum,p)=>sum+p.income,0));
  return {month:settings.referenceMonth,totalMonthly:c.currentTotal,incomeMonthly,remainingMonthly:money(incomeMonthly-c.currentTotal),people,components,
    notes:['Referencia actual de alquiler; no presupone el sueldo futuro de la hermana ni cancelaciones por cobros previstos.','Las pagas extra, el cobro extraordinario y los ahorros no financian el gasto mensual ordinario.'],errors:[]};
}

function bonusComparison(bankId,offer,principal) {
  const full=offerTerms(bankId,offer,'full'),payroll=offerTerms(bankId,offer,'payroll');
  const knownFull=full.products.every(p=>p.cost!==null&&p.quoteKnown),hasBankHome=full.products.some(p=>p.id==='home');
  const knownBaseline=offer.externalHomeInsuranceAnnual!==null;
  const saving=offer.payrollOnlyRate===null?null:monthlyPayment(principal,offer.payrollOnlyRate,30)-monthlyPayment(principal,full.rate,30);
  const incremental=knownFull&&knownBaseline?full.equivalentKnown+(hasBankHome?0:offer.externalHomeInsuranceAnnual/12)-offer.externalHomeInsuranceAnnual/12:null;
  return {payrollRate:offer.payrollOnlyRate,fullRate:full.rate,interestSavingMonthly:saving===null?null:money(saving),
    productMonthly:knownFull?money(full.recurringKnown):null,productEquivalentMonthly:knownFull?money(full.equivalentKnown):null,
    baselineHomeMonthly:knownBaseline?money(offer.externalHomeInsuranceAnnual/12):null,
    netSavingMonthly:saving===null||incremental===null?null:money(saving-incremental),
    missingQuotes:unique([...full.missingQuotes,...payroll.missingQuotes]),notes:full.notes};
}

function comparePeople(comparison,currentBudget) {
  return comparison.people.map(p=>{
    const current=currentBudget.people.find(row=>row.id===p.id);
    return {...p,currentIncome:current?.income??null,currentCost:current?.cost??null,currentRemaining:current?.remaining??null,
      difference:current?.cost===null?null:money(p.purchaseCost-(current?.cost??0)),cost:p.purchaseCost,remaining:p.purchaseRemaining};
  });
}

function evaluateScenario(scenario,price,currentBudget,settings,terms) {
  const candidate={...scenario,purchasePrice:price,appraisalValue:price*scenario.searchAppraisalRatio};
  const result=calculateScenario(candidate,{asOfMonth:settings.purchaseMonth});
  if(!result.valid)return {candidate,result,errors:result.validation.errors,allFits:false};
  const comparison=calculateMonthlyCostComparison(candidate,{month:settings.purchaseMonth,asOfMonth:settings.referenceMonth});
  if(!comparison.valid)return {candidate,result,errors:comparison.errors,allFits:false};
  const spendingFits=comparison.purchaseTotal<=currentBudget.totalMonthly+TOLERANCE;
  const debtFits=result.budget.debtRatio!==null&&!result.budget.borrowerDebtRatioIncomplete
    &&result.budget.borrowerDebtMonthly<=result.budget.regularIncome*result.budget.debtRatioLimit+1e-8;
  const finalCashFits=result.cash.fundingGap<=TOLERANCE,earlyCashFits=result.cash.beforeMortgageGap<=TOLERANCE;
  const transition=result.preclosing;
  const transitionFits=transition.timingConsistent&&transition.additionalCashToKeepBuffer!==null
    &&transition.preclosingLiquidityGap!==null&&transition.additionalCashToKeepBuffer<=TOLERANCE&&transition.preclosingLiquidityGap<=TOLERANCE;
  return {candidate,result,comparison,terms,spendingFits,debtFits,finalCashFits,earlyCashFits,transitionFits,
    allFits:spendingFits&&debtFits&&finalCashFits&&earlyCashFits&&transitionFits,errors:[]};
}

function rowFromEvaluation(bank,mode,e,currentBudget,settings,available=true) {
  const r=e?.result,c=e?.comparison,valid=r?.valid&&c?.valid;
  const base={id:`${bank.id}-${mode}`,bankId:bank.id,bankName:bank.name,financingMode:mode,available,
    maxPriceKnownCosts:null,mortgagePrincipal:null,icfPrincipal:null,ownPriceContribution:null,motherLoanRequired:null,
    monthly:{mortgage:null,motherBank:null,ownership:null,insurance:null,insuranceEquivalent:null,living:null,total:null},
    limits:{},bindingConstraint:available?'unknown':'conditional',missingQuotes:[],incomplete:true,
    comparisonPeople:[],bonuses:null,result:null,scenario:e?.candidate??null,notes:[],errors:e?.errors??[]};
  if(!valid)return base;
  const ownership=money((settings.ownership.ibiAnnual+settings.ownership.wasteAnnual+settings.ownership.maintenanceAnnual)/12+settings.ownership.communityMonthly);
  const insuranceKnown=e.terms.missingQuotes.length===0;
  const living=money(c.purchaseTotal-r.mortgage.monthlyPayment-r.familyLoan.monthlyPayment-ownership-r.budget.insuranceMonthly);
  const maximumMortgage=currentBudget.totalMonthly-living-ownership-r.budget.insuranceMonthly-r.familyLoan.monthlyPayment;
  const loanStart=e.candidate.familyPlan.motherLoanStartMonth;
  const wait=monthIndex(settings.purchaseMonth)-monthIndex(loanStart);
  const timeline=wait>0&&wait<=60?calculateFamilyTimeline(e.candidate,{startMonth:loanStart,months:wait}):null;
  const transitionMonths=timeline?.valid?timeline.months.map(row=>({month:row.month,expenses:row.household.expenses,
    income:row.household.income,remaining:row.household.remaining,
    aboveCurrentCap:row.household.expenses!==null&&row.household.expenses>currentBudget.totalMonthly+TOLERANCE})):[];
  const transitionExpenses=transitionMonths.length?Math.max(...transitionMonths.map(row=>row.expenses)):
    r.preclosing.requestedInstallments>0?r.preclosing.monthlyOutflow:null;
  const preclosing={...r.preclosing,fits:e.transitionFits,monthlyExpenses:transitionExpenses,months:transitionMonths,
    headroomToCurrentCap:transitionExpenses===null?null:money(currentBudget.totalMonthly-transitionExpenses),
    spendingAboveCurrentCap:transitionExpenses!==null&&transitionExpenses>currentBudget.totalMonthly+TOLERANCE};
  const limits={spending:{fits:e.spendingFits,ceiling:currentBudget.totalMonthly,currentTotal:c.purchaseTotal,
      headroom:money(currentBudget.totalMonthly-c.purchaseTotal),maximumMortgageMonthlyBeforeUnknownInsurance:money(maximumMortgage)},
    debt:{fits:e.debtFits,ratio:r.budget.debtRatio,limit:r.budget.debtRatioLimit,monthly:r.budget.borrowerDebtMonthly,maximumMonthly:r.budget.regularIncome*r.budget.debtRatioLimit},
    finalCash:{fits:e.finalCashFits,gap:r.cash.fundingGap,required:r.cash.totalRequired,available:r.cash.availableFunds},
    earlyCash:{fits:e.earlyCashFits,gap:r.cash.beforeMortgageGap,required:r.cash.beforeMortgageRequired,available:r.cash.beforeMortgageAvailable},
    preclosing,
    budgetFits:e.spendingFits,debtFits:e.debtFits,cashFits:e.finalCashFits&&e.earlyCashFits,transitionFits:e.transitionFits};
  return {...base,mortgagePrincipal:r.mortgage.principal,icfPrincipal:r.icf.principal,
    ownPriceContribution:r.cash.priceContribution,motherLoanRequired:r.familyLoan.principal,
    monthly:{mortgage:money(r.mortgage.monthlyPayment),motherBank:money(r.familyLoan.monthlyPayment),ownership,
      insurance:insuranceKnown?money(r.budget.insuranceMonthly):null,
      insuranceEquivalent:insuranceKnown?money(r.budget.upfrontInsuranceMonthlyEquivalent):null,living,total:c.purchaseTotal,
      knownInsurance:money(r.budget.insuranceMonthly)},limits,
    missingQuotes:unique([...e.terms.missingQuotes,...r.budget.missingQuotes]),incomplete:true,
    comparisonPeople:comparePeople(c,currentBudget),bonuses:bonusComparison(bank.id,settings.offers[bank.id],r.mortgage.principal),
    result:r,scenario:e.candidate,notes:unique([
      ...e.terms.notes,'Las provisiones de IBI, residuos, comunidad y mantenimiento no son facturas confirmadas.',
      'El tope de gasto se comprueba en el mes de compra; los meses previos se muestran aparte.',
      ...(preclosing.spendingAboveCurrentCap?[`Antes de firmar, alquiler más préstamo alcanza ${money(transitionExpenses)}€/mes, por encima del presupuesto actual aunque pueda cubrirse con ingresos.`]:[]),
      'El capital inicial procedente de mamá es prestado: la entidad debe aceptar su origen y valorar todas las cuotas.',
      ...(r.cash.depositReleasePending?['La compensación o liberación de las arras al firmar sigue pendiente.']:[]),
      ...(r.budget.personalDebtCancellationAssumed?['Las cancelaciones de deudas previstas dependen del cobro extraordinario, no confirmado.']:[]),
      ...(e.candidate.familyPlan.sisterJob.enabled?['El sueldo futuro de la hermana es una hipótesis y no aumenta los ingresos de titulares para el ratio.']:[]),
      ...(mode==='conditional90'?['90% exploratorio, sujeto a tasación de al menos1,125veces el precio y aprobación expresa.']:[]),
    ])};
}

/** A common current-family budget and five independently searched bank plans. */
export function calculateMortgageSearch(source,raw={},options={}) {
  const asOfMonth=options.asOfMonth??madridMonth();
  const settings=normalizeMortgageSearch(record(raw)?{...raw,referenceMonth:raw.referenceMonth??asOfMonth}:raw,source);
  const errors=unique([...(settings._errors||[]),...(!monthOK(asOfMonth)?['El mes de cálculo necesita formato AAAA-MM.']:[])]);
  const step=options.step??500,ceiling=options.searchCeiling??1000000;
  if(!Number.isSafeInteger(step)||step<=0||!Number.isSafeInteger(ceiling)||ceiling<step)errors.push('El paso y el techo de búsqueda deben ser euros enteros positivos.');
  const empty={settings,currentBudget:null,scenarios:[],selected:null,comparisonPrice:null,atCommonPrice:[],errors,missingQuotes:[]};
  if(errors.length)return empty;
  let currentBudget;
  try {currentBudget=currentRentalBudget(source,settings);}catch(error){return {...empty,errors:[error.message]};}
  if(currentBudget.errors?.length)return {...empty,currentBudget,errors:currentBudget.errors};
  if(currentBudget.people.filter(p=>['buyer1','buyer2'].includes(p.id)).reduce((sum,p)=>sum+p.income,0)<=0)
    return {...empty,currentBudget,errors:['Completa los ingresos ordinarios de los titulares; otros convivientes no sustituyen ese dato.']};
  const definitions=BANKS.flatMap(bank=>(bank.id==='sabadell'?['icf','standard']:MODES).map(mode=>({bank,mode})));
  const calculators=new Map(),scenarios=[];
  for(const {bank,mode} of definitions){
    const {scenario,terms}=genericScenario(source,settings,bank.id,mode);
    const available=mode!=='conditional90'||settings.conditional90Enabled&&settings.appraisalRatio>=1.125;
    if(!available){
      scenarios.push({...rowFromEvaluation(bank,mode,null,currentBudget,settings,false),notes:['90% desactivado o tasación inferior a1,125veces el precio. Requiere aprobación expresa.']});continue;
    }
    const cache=new Map(),evaluate=price=>{
      if(!cache.has(price))cache.set(price,evaluateScenario(scenario,price,currentBudget,settings,terms));
      return cache.get(price);
    };
    calculators.set(`${bank.id}-${mode}`,evaluate);
    let low=1,high=Math.floor(ceiling/step),best=0;
    while(low<=high){const mid=Math.floor((low+high)/2),e=evaluate(mid*step);if(e.allFits){best=mid;low=mid+1;}else high=mid-1;}
    const at=best?evaluate(best*step):evaluate(step),row=rowFromEvaluation(bank,mode,at,currentBudget,settings);
    row.maxPriceKnownCosts=best*step;
    if(!best){row.notes.push('Ningún precio positivo del intervalo cumple simultáneamente presupuesto, deuda y efectivo.');
      row.result=null;row.scenario=null;row.bonuses=null;row.mortgagePrincipal=null;row.icfPrincipal=null;row.ownPriceContribution=null;row.motherLoanRequired=null;
      row.monthly=Object.fromEntries(Object.keys(row.monthly).map(key=>[key,null]));}
    const next=evaluate((best+1)*step);
    row.bindingConstraint=next.errors.length?'invalid-input':!next.earlyCashFits?'early-cash':!next.finalCashFits?'final-cash':!next.debtFits?'debt':!next.spendingFits?'spending':!next.transitionFits?'transition':'search-ceiling';
    row.limits.priceStep=step;row.limits.searchCeiling=ceiling;row.limits.limitedBySearchCeiling=best===Math.floor(ceiling/step);
    row.errors=at.errors;scenarios.push(row);
  }
  const selectedMode=settings.selectedBank==='sabadell'&&settings.financingMode==='conditional90'?'standard':settings.financingMode;
  const selected=scenarios.find(row=>row.bankId===settings.selectedBank&&row.financingMode===selectedMode)??null;
  const positive=scenarios.filter(row=>row.available&&row.financingMode===(row.bankId==='sabadell'&&settings.financingMode==='conditional90'?'standard':settings.financingMode)&&row.maxPriceKnownCosts>0).map(row=>row.maxPriceKnownCosts);
  const comparisonPrice=settings.testPrice??(positive.length?Math.min(...positive):null);
  const atCommonPrice=scenarios.map(row=>{
    const evaluate=calculators.get(row.id);
    if(!evaluate||comparisonPrice===null)return {...row,comparisonPrice};
    const bank=BANKS.find(b=>b.id===row.bankId);
    return {...rowFromEvaluation(bank,row.financingMode,evaluate(comparisonPrice),currentBudget,settings),
      maxPriceKnownCosts:row.maxPriceKnownCosts,comparisonPrice,bindingConstraint:row.bindingConstraint};
  });
  return {...empty,currentBudget,scenarios,selected,comparisonPrice,atCommonPrice,
    errors:unique(scenarios.flatMap(row=>row.errors)),missingQuotes:unique(scenarios.flatMap(row=>row.missingQuotes))};
}
