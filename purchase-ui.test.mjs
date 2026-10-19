import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScenario,calculateScenario} from './finance.mjs';
import {renderPurchaseFees,renderDepositInputs,renderPurchaseTimeline,setDepositInputMode,renderQuotedCost} from './purchase-ui.mjs';

const helpers={field:(label,path,options={})=>`<input data-field="${path}" aria-label="${label}"${options.max!==undefined?` max="${options.max}"`:''}>${options.hint||''}`,select:(label,path,options)=>`<select data-field="${path}" aria-label="${label}">${options.map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select>`,check:()=>'',euro:n=>String(n),esc:v=>String(v)};
const home=()=>normalizeScenario({purchasePrice:175000,icf:{enabled:true},purchaseCosts:{mode:'provision'},familyLoan:{enabled:true,rate:12,years:8,coverEarlyLiquidity:true},cash:{familyLoanAvailableBeforeDeposit:true}});

test('fixed arras replace the percent while prepaid fees remain a separate part of the provision',()=>{
 const s=home();setDepositInputMode(s,'fixed');s.cash.depositAmount=3000;s.purchaseCosts.provisionBeforeSigning=500;
 const r=calculateScenario(s);
 assert.equal(r.cash.depositAmount,3000);assert.equal(r.cash.beforeMortgageRequired,3500);
 assert.equal(r.cash.purchaseFees,5000);assert.equal(r.cash.totalRequired,25500);
 assert.equal(r.familyLoan.principal,25500);assert.equal(r.cash.closingNetPayment,19000);
 setDepositInputMode(s,'percent');assert.equal(calculateScenario(s).cash.depositAmount,17500);
 setDepositInputMode(s,'fixed');assert.equal(calculateScenario(s).cash.depositAmount,3000);
});

test('itemized fees are visible immediately and replace rather than add to the provision',()=>{
 const s=home();s.purchaseCosts.mode='itemized';s.purchaseCosts.appraisal=450;s.purchaseCosts.legal=550;
 const r=calculateScenario(s),html=renderPurchaseFees(s,r,helpers);
 assert.equal(r.cash.purchaseFees,1000);assert.equal(r.cash.totalRequired,21500);
 for(const field of ['appraisal','legal','notary','registry','agency','broker','other'])assert.ok(html.includes('purchaseCosts.'+field));
 assert.ok(!html.includes('<details'));
 const deposit=renderDepositInputs(s,helpers);assert.ok(!deposit.includes('data-field="purchaseCosts.provisionBeforeSigning"'));
});

test('the signing timeline distinguishes the gross transaction from the family cash contribution',()=>{
 const r=calculateScenario(home()),html=renderPurchaseTimeline(r,helpers);
 assert.equal(r.timeline.find(t=>t.id==='signing').cashOut,180000);
 assert.equal(r.cash.closingNetPayment,5000);
 assert.ok(html.includes('Financiación de hipoteca + ICF: 175000'));
 assert.ok(html.includes('Aportación neta adicional de la familia: 5000'));
 assert.ok(html.includes('no lo que debéis aportar de vuestro bolsillo'));
});

test('existing final quotes offer an explicit VAT choice without adding a second tax control',()=>{
 const s=home();s.purchaseCosts.appraisal=605;
 const html=renderQuotedCost(s,'appraisal','Tasación',helpers);
 assert.ok(html.includes('data-field="purchaseCosts.appraisal"'));
 assert.ok(html.includes('data-field="purchaseCosts.vat.appraisal.mode"'));
 assert.ok(html.includes('Importe final · IVA incluido o exento'));
 assert.ok(!html.includes('data-field="purchaseCosts.vat.appraisal.rate"'));
 assert.ok(!html.includes('data-field="purchaseCosts.vat.appraisal.untaxed"'));
 assert.ok(!html.includes('IVA añadido:'));
});

test('a quote without VAT exposes its rate and shows the calculated final amount',()=>{
 const s=home();s.purchaseCosts.legal=1000;s.purchaseCosts.vat={legal:{mode:'net',rate:21,untaxed:0}};
 const r={cash:{costVat:{legal:{vatAdded:210,total:1210}}}};
 const html=renderQuotedCost(s,'legal','Abogado / asesoría',helpers,r);
 assert.ok(html.includes('Abogado / asesoría · sin IVA'));
 assert.ok(html.includes('data-field="purchaseCosts.vat.legal.rate"'));
 assert.ok(html.includes('data-field="purchaseCosts.vat.legal.untaxed"'));
 assert.ok(html.includes('IVA añadido: 210. Total a pagar: 1210.'));
});

test('suplidos are described as a portion of the quoted amount rather than another expense',()=>{
 const s=home();s.purchaseCosts.notary=1000;s.purchaseCosts.vat={notary:{mode:'net',rate:21,untaxed:200}};
 const r={cash:{costVat:{notary:{vatAdded:168,total:1168}}}};
 const html=renderQuotedCost(s,'notary','Notaría de compraventa',helpers,r);
 assert.ok(html.includes('data-field="purchaseCosts.vat.notary.untaxed" aria-label="Parte sin IVA / suplidos incluidos" max="1000"'));
 assert.ok(html.includes('Parte del importe anterior exenta o no sujeta a IVA. No se añade de nuevo.'));
 assert.ok(html.includes('IVA añadido: 168. Total a pagar: 1168.'));
});

test('financial intermediation warns that the actual service may be VAT exempt',()=>{
 const s=home();s.purchaseCosts.broker=1000;s.purchaseCosts.vat={broker:{mode:'net',rate:0,untaxed:0}};
 const html=renderQuotedCost(s,'broker','Bróker / intermediación',helpers);
 assert.ok(html.includes('La intermediación financiera puede estar exenta'));
 assert.ok(html.includes('confirma el servicio facturado'));
 assert.ok(!html.includes('IVA añadido:'));
});

test('the provision remains a final estimate pending confirmation and does not activate saved net quotes',()=>{
 const s=home();s.purchaseCosts.vat={legal:{mode:'net',rate:21,untaxed:0}};
 const r={cash:{purchaseFees:5000,purchaseFeesVatAdded:210,costVat:{legal:{vatAdded:210,total:1210}}}};
 const html=renderPurchaseFees(s,r,helpers);
 assert.ok(html.includes('data-field="purchaseCosts.provisionAmount"'));
 assert.ok(html.includes('Confirma los conceptos y el IVA en los presupuestos'));
 assert.ok(html.includes('No se añade otro 21 % sobre toda la provisión'));
 assert.ok(!html.includes('data-field="purchaseCosts.vat.legal.mode"'));
 assert.ok(!html.includes('Incluye 210 de IVA añadido'));
 assert.ok(html.includes('Total de gastos de compra: 5000.'));
});

test('itemized quotes expose all fee amounts and report only VAT already included in their calculated total',()=>{
 const s=home();s.purchaseCosts.mode='itemized';s.purchaseCosts.legal=1000;s.purchaseCosts.vat={legal:{mode:'net',rate:21,untaxed:0}};
 const r={cash:{purchaseFees:1210,purchaseFeesVatAdded:210,costVat:{legal:{vatAdded:210,total:1210}}}};
 const html=renderPurchaseFees(s,r,helpers);
 for(const key of ['appraisal','legal','notary','registry','agency','broker','other'])assert.ok(html.includes(`data-field="purchaseCosts.${key}"`));
 assert.ok(html.includes('Total de gastos de compra: 1210. Incluye 210 de IVA añadido'));
 assert.ok(!html.includes('data-field="purchaseCosts.vat.other.mode"'));
 assert.ok(!html.includes('<details'));
});

test('moving and renovations reuse the quote controls with independent VAT paths',()=>{
 const s=home();s.purchaseCosts.moving=600;s.purchaseCosts.renovations=2000;
 s.purchaseCosts.vat={moving:{mode:'net',rate:21,untaxed:0},renovations:{mode:'total',rate:10,untaxed:0}};
 const moving=renderQuotedCost(s,'moving','Mudanza · gasto único estimado',helpers,{cash:{costVat:{moving:{vatAdded:126,total:726}}}});
 const renovations=renderQuotedCost(s,'renovations','Reformas y acondicionamiento',helpers);
 assert.ok(moving.includes('data-field="purchaseCosts.moving"'));
 assert.ok(moving.includes('data-field="purchaseCosts.vat.moving.rate"'));
 assert.ok(moving.includes('IVA añadido: 126. Total a pagar: 726.'));
 assert.ok(renovations.includes('data-field="purchaseCosts.renovations"'));
 assert.ok(renovations.includes('data-field="purchaseCosts.vat.renovations.mode"'));
 assert.ok(!renovations.includes('data-field="purchaseCosts.vat.renovations.rate"'));
});


test('percentage provision displays the current price and final VAT-inclusive reserve with an editable basis',()=>{
 for(const price of [175000,189000]){
  const s=home();s.purchasePrice=price;s.purchaseCosts.provisionBasis='percent';s.purchaseCosts.provisionPercent=2;
  const r=calculateScenario(s),html=renderPurchaseFees(s,r,helpers);
  assert.equal(r.cash.purchaseFees,price*.02);
  assert.ok(html.includes('data-field="purchaseCosts.provisionBasis"'));
  assert.ok(html.includes('data-field="purchaseCosts.provisionPercent"'));
  assert.ok(!html.includes('data-field="purchaseCosts.provisionAmount"'));
  assert.ok(html.includes(`2 % de ${price}: <strong>${price*.02}</strong>, IVA incluido como previsión.`));
  assert.ok(html.includes('El colchón del préstamo de mamá se reserva aparte.'));
  assert.ok(html.includes('No se añade otro 21 % sobre toda la provisión.'));
  assert.equal(s.familyLoan.extraBuffer,3000);
 }
});

test('fixed provision remains editable independently of the saved percentage',()=>{
 const s=home();s.purchaseCosts.provisionBasis='fixed';s.purchaseCosts.provisionAmount=4400;s.purchaseCosts.provisionPercent=2;
 const html=renderPurchaseFees(s,calculateScenario(s),helpers);
 assert.ok(html.includes('data-field="purchaseCosts.provisionAmount"'));
 assert.ok(!html.includes('data-field="purchaseCosts.provisionPercent"'));
 assert.ok(html.includes('Provisión final: <strong>4400</strong>'));
});

test('pre-signing fees use the effective percentage provision as their ceiling',()=>{
 const s=home();s.purchaseCosts.provisionBasis='percent';s.purchaseCosts.provisionPercent=2;
 const r=calculateScenario(s);
 const expected='data-field="purchaseCosts.provisionBeforeSigning" aria-label="De la provisión de gastos, pagar antes de firmar" max="3500"';
 assert.ok(renderDepositInputs(s,helpers,r).includes(expected));
 assert.ok(renderDepositInputs(s,helpers).includes(expected));
 s.purchasePrice=250000;
 assert.ok(renderDepositInputs(s,helpers,calculateScenario(s)).includes('max="5000"'));
});
