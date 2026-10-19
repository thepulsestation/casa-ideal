import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePersonalCommitments, calculatePersonalCommitments, calculatePublicTransport} from './personal-commitments.mjs';

const plan = () => ({
  personalCommitments: [
    {id: 'vehicle', label: 'Vehículo', owner: 'buyer1', monthly: 125, kind: 'debt', settleWithReceipt: true, payoffEstimate: 2100, payoffFeeRate: .01},
    {id: 'card', label: 'Tarjeta', owner: 'buyer1', monthly: 35, kind: 'debt', settleWithReceipt: true, payoffEstimate: 600},
    {id: 'contribution', label: 'Cuota profesional', owner: 'buyer1', monthly: 80, kind: 'expense'},
  ],
  extraordinaryReceipt: {enabled: true, month: '2027-01', amount: 3500, owner: 'buyer1', confirmed: false},
});

test('empty personal planning has no private monetary defaults or implied receipt', () => {
  const normalized = normalizePersonalCommitments();
  assert.deepEqual(normalized.personalCommitments, []);
  assert.equal(normalized.extraordinaryReceipt.enabled, false);
  assert.equal(normalized.extraordinaryReceipt.amount, 0);
  assert.equal(calculatePersonalCommitments({}, {asOfMonth: '2026-10'}).debtByOwner.buyer1, 0);
});

test('recurring debts and professional expenses remain distinct and owner-specific', () => {
  const source = plan(), result = calculatePersonalCommitments(source, {asOfMonth: '2026-12'});
  assert.equal(result.valid, true);
  assert.equal(result.debtByOwner.buyer1, 160);
  assert.equal(result.expenseByOwner.buyer1, 80);
  assert.equal(result.debtByOwner.buyer2, 0);
  assert.equal(result.extraordinaryIncomeByOwner.buyer1, 0);
  assert.equal(result.extraordinarySettlement.applied, false);
});

test('a funded month-start settlement removes installments without adding recurring salary', () => {
  const result = calculatePersonalCommitments(plan(), {asOfMonth: '2027-01'});
  assert.equal(result.debtByOwner.buyer1, 0);
  assert.equal(result.expenseByOwner.buyer1, 80);
  assert.equal(result.extraordinaryIncomeByOwner.buyer1, 3500);
  assert.equal(result.debtSettlementByOwner.buyer1, 2721);
  assert.equal(result.extraordinarySettlement.feeTotal, 21);
  assert.equal(result.extraordinarySettlement.estimatedRemainder, 779);
  assert.equal(result.extraordinarySettlement.confirmed, false);
  assert.equal(result.extraordinarySettlement.estimated, true);
  const later = calculatePersonalCommitments(plan(), {asOfMonth: '2027-02'});
  assert.equal(later.debtByOwner.buyer1, 0);
  assert.equal(later.extraordinaryIncomeByOwner.buyer1, 0);
  assert.equal(later.debtSettlementByOwner.buyer1, 0);
});

test('supplied payoff balances are not reduced as if whole installments were principal', () => {
  const result = calculatePersonalCommitments(plan(), {asOfMonth: '2027-01'});
  assert.equal(result.extraordinarySettlement.items[0].principalEstimate, 2100);
  assert.equal(result.extraordinarySettlement.totalPayoffEstimate, 2721);
});

test('insufficient money or missing payoff amounts cancel no debts', () => {
  const source = plan(); source.extraordinaryReceipt.amount = 2500;
  const short = calculatePersonalCommitments(source, {asOfMonth: '2027-01'});
  assert.equal(short.extraordinarySettlement.canSettle, false);
  assert.equal(short.extraordinarySettlement.fundingGap, 221);
  assert.equal(short.debtByOwner.buyer1, 160);
  assert.equal(short.debtSettlementByOwner.buyer1, 0);
  source.extraordinaryReceipt.amount = 3500; source.personalCommitments[0].payoffEstimate = null;
  const unknown = calculatePersonalCommitments(source, {asOfMonth: '2027-01'});
  assert.equal(unknown.extraordinarySettlement.totalPayoffEstimate, null);
  assert.equal(unknown.extraordinarySettlement.fundingGap, null);
  assert.equal(unknown.debtByOwner.buyer1, 160);
});

test('a disabled receipt keeps all installments and introduces no extraordinary money', () => {
  const source = plan(); source.extraordinaryReceipt.enabled = false;
  const result = calculatePersonalCommitments(source, {asOfMonth: '2027-02'});
  assert.equal(result.debtByOwner.buyer1, 160);
  assert.equal(result.extraordinaryIncomeByOwner.buyer1, 0);
  assert.equal(result.extraordinarySettlement.planned, false);
});

test('a tax reserve reduces available cash and can prevent planned settlement', () => {
  const source = plan(); source.extraordinaryReceipt.taxReserve = 900;
  const result = calculatePersonalCommitments(source, {asOfMonth: '2027-01'});
  assert.equal(result.reservedExtraordinaryByOwner.buyer1, 900);
  assert.equal(result.extraordinarySettlement.availableForSettlement, 2600);
  assert.equal(result.extraordinarySettlement.fundingGap, 121);
  assert.equal(result.extraordinarySettlement.canSettle, false);
  assert.equal(result.debtByOwner.buyer1, 160);
});

test('start and end months are inclusive and naturally ended debts do not consume settlement funds', () => {
  const source = plan(); source.personalCommitments[0].endMonth = '2026-12'; source.personalCommitments[1].startMonth = '2026-12';
  assert.equal(calculatePersonalCommitments(source, {asOfMonth: '2026-11'}).debtByOwner.buyer1, 125);
  assert.equal(calculatePersonalCommitments(source, {asOfMonth: '2026-12'}).debtByOwner.buyer1, 160);
  const january = calculatePersonalCommitments(source, {asOfMonth: '2027-01'});
  assert.equal(january.extraordinarySettlement.totalPayoffEstimate, 600);
  assert.equal(january.debtByOwner.buyer1, 0);
});

test('invalid shapes, dates, kinds, owners and amounts do not become zero-cost valid plans', () => {
  const variants = [
    {personalCommitments: {}}, {personalCommitments: [null]},
    {personalCommitments: [{id: 'x', label: 'x', monthly: null}]},
    {personalCommitments: [{id: 'x', label: 'x', monthly: -1}]},
    {personalCommitments: [{id: 'x', label: 'x', monthly: 1, owner: 'stranger'}]},
    {personalCommitments: [{id: 'x', label: 'x', monthly: 1, kind: 'free'}]},
    {personalCommitments: [{id: 'x', label: 'x', monthly: 1, startMonth: '2027-13'}]},
    {personalCommitments: [{id: 'x', label: 'x', monthly: 1, startMonth: '2028-01', endMonth: '2027-01'}]},
    {personalCommitments: [{id: 'x', label: 'x', monthly: 1, kind: 'expense', settleWithReceipt: true}]},
    {personalCommitments: [{id: 'x', label: 'x', monthly: 1, payoffFeeRate: 2}]},
    {extraordinaryReceipt: {enabled: true, amount: 10}},
    {extraordinaryReceipt: {enabled: true, amount: 10, month: '2027-01', taxReserve: 11}},
  ];
  for (const source of variants) assert.equal(calculatePersonalCommitments(source, {asOfMonth: '2026-10'}).valid, false, JSON.stringify(source));
  const source = plan(); source.extraordinaryReceipt.owner = 'mother';
  assert.equal(calculatePersonalCommitments(source, {asOfMonth: '2026-10'}).valid, false);
  assert.equal(calculatePersonalCommitments({}, {asOfMonth: '2026-13'}).valid, false);
});

test('normalization and calculation never mutate saved personal data', () => {
  const source = plan(), before = structuredClone(source);
  const normalized = normalizePersonalCommitments(source);
  normalized.personalCommitments[0].monthly = 999;
  calculatePersonalCommitments(source, {asOfMonth: '2027-01'});
  assert.deepEqual(source, before);
});

test('public transport preserves cents, changes the agreed sister payer after purchase and has zero defaults', () => {
  assert.equal(calculatePublicTransport({}).total, 0);
  const source = {publicTransport: {buyer2Monthly: 15.25, motherMonthly: 55, sisterMonthly: 19.33, sisterBeforePurchaseMotherShare: .5}};
  const current = calculatePublicTransport(source), owned = calculatePublicTransport(source, {owning: true});
  assert.deepEqual(current.byOwner, {buyer1: 0, buyer2: 15.25, mother: 64.67, sister: 9.66});
  assert.deepEqual(owned.byOwner, {buyer1: 0, buyer2: 15.25, mother: 55, sister: 19.33});
  assert.equal(current.total, 89.58);
  assert.equal(owned.total, current.total);
  for (const raw of [{publicTransport: []}, {publicTransport: {motherMonthly: -1}}, {publicTransport: {sisterMonthly: null}}, {publicTransport: {sisterBeforePurchaseMotherShare: 1.1}}]) assert.equal(calculatePublicTransport(raw).valid, false);
});

test('income-dependent sister transport is fully covered until she has income in either housing phase', () => {
  const source = {publicTransport: {buyer2Monthly: 15.25, motherMonthly: 55, sisterMonthly: 19.33, sisterPayerMode: 'income-dependent'}};
  const before = structuredClone(source);
  for (const owning of [false, true]) {
    const noIncome = calculatePublicTransport(source, {owning, sisterHasIncome: false});
    assert.deepEqual(noIncome.byOwner, {buyer1: 0, buyer2: 24.91, mother: 64.67, sister: 0});
    const working = calculatePublicTransport(source, {owning, sisterHasIncome: true});
    assert.deepEqual(working.byOwner, {buyer1: 0, buyer2: 15.25, mother: 55, sister: 19.33});
    assert.equal(noIncome.total, 89.58);
    assert.equal(working.total, noIncome.total);
  }
  assert.deepEqual(source, before);
});

test('quarterly ticket amounts remain exact while monthly reserves are derived and preserve cent allocations', () => {
  const source = {publicTransport: {buyer2Quarterly: 50, sisterQuarterly: '50', motherMonthly: 70,
    buyer2Monthly: 999, sisterMonthly: null, sisterPayerMode: 'income-dependent'}};
  const normalized = normalizePersonalCommitments(source);
  assert.deepEqual(normalized.errors, []);
  assert.equal(normalized.publicTransport.buyer2Quarterly, 50);
  assert.equal(normalized.publicTransport.sisterQuarterly, 50);
  assert.equal(normalized.publicTransport.buyer2Monthly, 16.67);
  assert.equal(normalized.publicTransport.sisterMonthly, 16.67);
  const supported = calculatePublicTransport(source);
  assert.deepEqual(supported.byOwner, {buyer1: 0, buyer2: 25, mother: 78.34, sister: 0});
  assert.equal(supported.total, 103.34);
  assert.deepEqual(calculatePublicTransport(source, {sisterHasIncome: true}).byOwner,
    {buyer1: 0, buyer2: 16.67, mother: 70, sister: 16.67});
  const legacy = normalizePersonalCommitments({publicTransport: {buyer2Monthly: 15.25, sisterMonthly: 19.33}});
  assert.equal(legacy.publicTransport.buyer2Quarterly, null);
  assert.equal(legacy.publicTransport.buyer2Monthly, 15.25);
  assert.equal(legacy.publicTransport.sisterMonthly, 19.33);
  assert.equal(legacy.publicTransport.sisterPayerMode, 'legacy');
  assert.equal(normalizePersonalCommitments({publicTransport: {buyer2Quarterly: 0, buyer2Monthly: 50}}).publicTransport.buyer2Monthly, 0);
});

test('invalid quarterly amounts, support shares and payer modes cannot silently remove transport costs', () => {
  for (const publicTransport of [
    {buyer2Quarterly: -1}, {sisterQuarterly: ''}, {buyer2Quarterly: Infinity}, {sisterQuarterly: false},
    {sisterPayerMode: 'unknown'}, {sisterPayerMode: null},
    {sisterWithoutIncomeMotherShare: -.1}, {sisterWithoutIncomeMotherShare: 1.1}, {sisterWithoutIncomeMotherShare: null},
  ]) assert.equal(calculatePublicTransport({publicTransport}).valid, false, JSON.stringify(publicTransport));
  for (const share of [0, .25, 1]) {
    const result = calculatePublicTransport({publicTransport: {sisterMonthly: 19.33, sisterPayerMode: 'income-dependent', sisterWithoutIncomeMotherShare: share}});
    assert.equal(result.valid, true);
    assert.equal(result.byOwner.sister, 0);
    assert.equal(result.byOwner.buyer1, 0);
    assert.equal(Math.round(result.byOwner.buyer2 * 100) + Math.round(result.byOwner.mother * 100), 1933);
  }
});
