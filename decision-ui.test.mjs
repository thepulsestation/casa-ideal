import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScenario, calculateScenario, getAffordability, suggestFamilyLoanTerm } from './finance.mjs';
import { adoptPurchaseProvision, renderDebtDecision, renderTermPicker, renderDepositFunding, renderQuickCommutes } from './decision-ui.mjs';

const planningScenario = () => normalizeScenario({
  purchasePrice: 175000,
  tax: { buyers: [{ share: 1, rate: 0.05, eligibilityConfirmed: true }] },
  icf: { enabled: true },
  familyLoan: { enabled: true, rate: 5, years: 10, assumedTerms: true },
  motherTransfer: { repaymentMode: 'same-as-bank' },
  budget: { incomes: [{ monthly: 2800, payments: 12 }], existingDebtMonthly: 200, foodMonthly: 500, utilitiesMonthly: 200 },
});

test('purchase-plan adoption supplies a single provision and funds the earlier arras phase', () => {
  const previous = planningScenario();
  const snapshot = structuredClone(previous);
  const next = adoptPurchaseProvision(previous);
  assert.deepEqual(previous, snapshot);
  assert.equal(next.purchasePlanVersion, 1);
  assert.equal(next.purchaseProvisionVersion, 1);
  assert.equal(next.purchaseCosts.mode, 'provision');
  const r = calculateScenario(next);
  assert.equal(r.cash.purchaseFees, 3500);
  assert.equal(r.cash.totalRequired, 15250);
  assert.equal(r.familyLoan.principal, 17500);
  assert.equal(r.cash.beforeMortgageRequired, 17500);
  assert.equal(r.cash.beforeMortgageGap, 0);
  assert.equal(r.cash.fundingGap, 0);
  assert.equal(r.cash.earlyLiquidityExtraBorrowing, 2250);
  assert.equal(r.cash.totalAcquisitionCost, 187250);
});

test('all older studies adopt 2% while retaining itemized quotes for an explicit later choice', () => {
  const s = planningScenario();
  Object.assign(s.purchaseCosts, { appraisal: 450, legal: 550, notary: 900 });
  const next = adoptPurchaseProvision(s);
  const r = calculateScenario(next);
  assert.equal(next.purchaseCosts.mode, 'provision');
  assert.equal(next.purchaseCosts.provisionBasis, 'percent');
  assert.equal(next.purchaseCosts.provisionPercent, 2);
  assert.equal(r.cash.purchaseFees, 3500);
  assert.equal(r.cash.purchaseFeesItemized, 1900);
  assert.equal(r.cash.prepaidPurchaseFees, 0);
  assert.equal(r.cash.totalRequired, 15250);
  const itemized=calculateScenario({...next,purchaseCosts:{...next.purchaseCosts,mode:'itemized'}});
  assert.equal(itemized.cash.purchaseFees,1900);
  assert.equal(next.purchaseCosts.provisionAmount, 5000, 'inactive fixed reference is retained without addition');
});

test('the percentage upgrade preserves a saved arras calendar and the separate 3000 buffer', () => {
  const previous=planningScenario();previous.purchasePlanVersion=1;
  previous.cash.familyLoanAvailableBeforeDeposit=false;
  previous.familyLoan.coverEarlyLiquidity=false;
  const next=adoptPurchaseProvision(previous);
  assert.equal(next.cash.familyLoanAvailableBeforeDeposit,false);
  assert.equal(next.familyLoan.coverEarlyLiquidity,false);
  assert.equal(next.familyLoan.extraBuffer,3000);
  assert.equal(calculateScenario(next).cash.purchaseFees,3500);
});

test('purchase-plan adoption runs once and respects later independent timing and fee choices', () => {
  const next = adoptPurchaseProvision(planningScenario());
  next.cash.familyLoanAvailableBeforeDeposit = false;
  next.familyLoan.coverEarlyLiquidity = false;
  next.purchaseCosts.mode = 'itemized';
  next.purchaseCosts.appraisal = 400;
  const repeated = adoptPurchaseProvision(next);
  assert.equal(repeated.cash.familyLoanAvailableBeforeDeposit, false);
  assert.equal(repeated.familyLoan.coverEarlyLiquidity, false);
  assert.equal(repeated.purchaseCosts.mode, 'itemized');
  assert.equal(calculateScenario(repeated).cash.purchaseFees, 400);
});

test('the maximum mother payment and residual headroom represent different financial questions', () => {
  const s = adoptPurchaseProvision(planningScenario());
  const r = calculateScenario(s);
  const a = getAffordability(s, r);
  const residualHeadroom = r.budget.regularIncome * r.budget.debtRatioLimit - r.budget.borrowerDebtMonthly;
  assert.ok(Math.abs(a.maximumMotherMonthly - (residualHeadroom + r.motherTransfer.familyMonthlyRepayment)) < 0.005);
  assert.ok(a.maximumMotherMonthly > 0);
  assert.ok(residualHeadroom < 0, 'a positive capacity does not mean the currently selected loan payment fits');
  assert.equal(a.withinDebtLimit, false);
  const suggestion = suggestFamilyLoanTerm(s);
  assert.equal(suggestion.years, 16);
  assert.equal(suggestion.affordability.withinDebtLimit, true);
  assert.equal(suggestion.affordability.incomplete, true);
  assert.equal(suggestion.noApproval, true);
});

test('a debt-fitting selection remains blocked when early money is unavailable', () => {
  const s = adoptPurchaseProvision(planningScenario());
  s.familyLoan.years = 20;
  s.cash.familyLoanAvailableBeforeDeposit = false;
  const a = getAffordability(s);
  assert.equal(a.withinDebtLimit, true);
  assert.equal(a.cashFundingGap, 0);
  assert.equal(a.earlyCashGap, 17500);
  assert.equal(a.meetsKnownLimits, false);
  assert.ok(a.blockedReasons.includes('early-cash-gap'));
});

const ui = {euro:n=>n==null?'Pendiente':String(Math.round(n*100)/100),pct:n=>n==null?'Pendiente':String(n*100)+' %',esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};

test('a fitting debt ratio still presents unconfirmed deposit funding as pending',()=>{
 const s=adoptPurchaseProvision(planningScenario());s.familyLoan.years=20;
 const r=calculateScenario(s);assert.equal(getAffordability(s).withinDebtLimit,true);
 const html=renderDebtDecision(s,r,ui);
 assert.ok(html.includes('Arras por confirmar'));
 assert.ok(!html.includes('Encaja en el límite simulado'));
 assert.ok(html.includes('Máxima devolución mensual a mamá'));
});

test('lower-funding comparison explains the ICF reduction without claiming it is an official arras rule',()=>{
 const s=adoptPurchaseProvision(planningScenario()),r=calculateScenario(s);
 const html=renderDepositFunding(s,r,ui);
 assert.equal(r.familyLoan.principal,17500);
 assert.ok(html.includes('32750'),'the extra liquidity must be visible before treating the purchase as funded');
 assert.ok(html.includes('de 35000 a 17500'));
 assert.ok(html.includes('no una regla acreditada del ICF'));
 assert.ok(html.includes('solo hipótesis'));
 assert.ok(html.includes('Si la compra se cancela'));
 assert.ok(html.includes('value="no-release"'));
});

test('an unknown mother TIN never displays selectable invented loan quotes',()=>{
 const s=adoptPurchaseProvision(planningScenario());s.familyLoan.rate=null;
 const html=renderTermPicker(s,calculateScenario(s),ui);
 assert.ok(html.includes('Introduce el TIN'));
 assert.ok(!html.includes('data-action="loan-term"'));
});

test('a home without an origin has pending commute indicators without a relative null link',()=>{
 const html=renderQuickCommutes({},ui);
 assert.ok(!html.includes('href="null"'));assert.ok(!html.includes('href=""'));
 assert.ok(html.includes('Por comprobar'));
});


test('pending arras never claims a confirmed release when nominal funding is below the seller balance',()=>{
 const s=adoptPurchaseProvision(planningScenario());s.icf.enabled=false;
 const r=calculateScenario(s);assert.equal(r.cash.depositReleasePending,false);
 const html=renderDepositFunding(s,r,ui);
 assert.ok(!html.includes('Habéis marcado la compensación como confirmada'));
 assert.ok(html.includes('sigue pendiente de confirmar'));
 s.cash.depositFundingMode='offset-confirmed';
 assert.ok(renderDepositFunding(s,calculateScenario(s),ui).includes('Habéis marcado la compensación como confirmada'));
});

test('reference-backed comparison offers only eight and ten bank years and preserves the separate family term',()=>{
 const s=adoptPurchaseProvision(planningScenario());
 s.familyLoan.rate=8;
 s.familyLoan.referenceOffer={amount:20000,years:8,monthlyPayment:282.73,tin:8,tae:8.30,maxAmount:20000};
 s.familyLoan.negotiation={maxAmount:60000,maxYears:10,openingPercent:0,earlyRepaymentPercent:0,confirmed:false};
 Object.assign(s.motherTransfer,{repaymentMode:'custom',familyRate:0,familyYears:10});
 const before=structuredClone(s),html=renderTermPicker(s,calculateScenario(s),ui);
 assert.ok(html.includes('data-years="8"'));
 assert.ok(html.includes('data-years="10"'));
 assert.ok(!html.includes('data-years="15"'));assert.ok(!html.includes('data-years="20"'));
 assert.ok(html.includes('por negociar'));
 assert.ok(html.includes('no condiciones aprobadas'));
 assert.ok(html.includes('calendario familiar actual es distinto'));
 assert.deepEqual(s,before,'rendering never modifies either contract');
});

test('the operational cap is editable and a ten-year term does not hide missing purchase capital',()=>{
 const s=adoptPurchaseProvision(planningScenario());
 Object.assign(s.familyLoan,{years:8,rate:8,maxAmount:10000,
  reportedLimit:{maxAmount:10000,maxYears:8,source:'Confirmación de prueba',reportedAt:'2026-10-18'},
  referenceOffer:{amount:12000,years:8,monthlyPayment:169.64,tin:8,tae:8.30,maxAmount:12000},
  negotiation:{maxAmount:45000,maxYears:10,openingPercent:0,earlyRepaymentPercent:0,confirmed:false}});
 const r=calculateScenario(s),html=renderTermPicker(s,r,ui);
 assert.ok(r.cash.fundingGap>0);
 assert.ok(html.includes('data-field="familyLoan.maxAmount" value="10000"'));
 assert.ok(html.includes('Límite actual comunicado por la familia: 10000'));
 assert.ok(html.includes('Elegir 10 años no cubre esta diferencia'));
 const longer=calculateScenario({...s,familyLoan:{...s.familyLoan,years:10}});
 assert.equal(longer.cash.fundingGap,r.cash.fundingGap);
 assert.equal(longer.familyLoan.principal,r.familyLoan.principal);
 assert.ok(longer.familyLoan.monthlyPayment<r.familyLoan.monthlyPayment);
 assert.ok(html.includes('data-years="10"'));
 assert.ok(!html.includes('data-years="15"'));
});
