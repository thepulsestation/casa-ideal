import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPersonalCommitments} from './personal-commitments-ui.mjs';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const euro=value=>`${value.toFixed(2)} EUR`;
test('personal debts and expenses keep editable cancellation fields separate from recurring salary',()=>{
 const html=renderPersonalCommitments({familyPlan:{personalCommitments:[{id:'car',label:'Car <loan>',monthly:125,owner:'buyer1',kind:'debt',payoffEstimate:2000,payoffFeeRate:.01,settleWithReceipt:true},{id:'work',label:'Work',monthly:90,owner:'buyer1',kind:'expense'}],extraordinaryReceipt:{enabled:true,amount:3000,month:'2027-01',taxReserve:200,confirmed:false}}},{},{euro,esc});
 assert.ok(html.includes('Car &lt;loan>'));
 assert.match(html,/data-field="familyPlan.personalCommitments.0.payoffFeeRate" data-scale="100" value="1"/);
 assert.ok(!html.includes('familyPlan.personalCommitments.1.payoffFeeRate'));
 assert.ok(html.includes('familyPlan.extraordinaryReceipt.taxReserve'));
 assert.ok(html.includes('No aumenta la nómina ni los ahorros para comprar'));
});
test('an unfunded settlement explicitly keeps monthly payments in place',()=>{
 const html=renderPersonalCommitments({}, {plan:{personalCommitments:[]},extraordinarySettlement:{planned:true,receiptAmount:1000,totalPayoffEstimate:2000,estimatedRemainder:-1000,canSettle:false}},{euro,esc});
 assert.ok(html.includes('Las cuotas continúan en el calendario'));
 assert.ok(html.includes('2000.00 EUR'));
});
