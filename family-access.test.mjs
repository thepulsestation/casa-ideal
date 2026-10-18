import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFamilyLink, buildFamilyHash, parseFamilyRoute, selectInitialFamilyScenario } from './family-access.mjs';

const CODE = 'ab12'.repeat(12);
const SCENARIO_ID = 'house_123-example';
const result = (view = 'resumen', inviteCode = null, scenarioId = null, error = null, autoJoin = false, version = 1) => ({ view, inviteCode, scenarioId, error, autoJoin, version });

test('a family link roundtrips through the fragment while discarding old query/hash', () => {
  const link = buildFamilyLink('https://example.github.io/casa-ideal/?old=value#presupuesto', CODE.toUpperCase(), SCENARIO_ID);
  const url = new URL(link);
  assert.equal(url.origin, 'https://example.github.io');
  assert.equal(url.pathname, '/casa-ideal/');
  assert.equal(url.search, '');
  assert.equal(url.hash, `#familia?codigo=${CODE}&acceso=2&entrar=1&vivienda=${SCENARIO_ID}`);
  assert.equal(link.includes('old=value'), false);
  assert.deepEqual(parseFamilyRoute(url.hash), result('familia', CODE, SCENARIO_ID, null, true, 2));
});

test('a family-only link contains exactly the invitation and public application path', () => {
  const link = buildFamilyLink('https://example.com/calculadora?access_token=fictional&income=999#old', CODE);
  assert.equal(link, `https://example.com/calculadora#familia?codigo=${CODE}&acceso=2&entrar=1`);
  assert.deepEqual(parseFamilyRoute(new URL(link).hash), result('familia', CODE, null, null, true, 2));
});

test('versioned private fragments retain automatic access across navigation and bookmarks', () => {
  for (const view of ['viviendas', 'resumen', 'compra', 'hipoteca', 'presupuesto', 'fuentes', 'familia']) {
    const hash = buildFamilyHash(view, CODE, SCENARIO_ID);
    assert.deepEqual(parseFamilyRoute(hash), result(view, CODE, SCENARIO_ID, null, true, 2));
    const link = buildFamilyLink('https://example.com/app/?old=value', CODE, SCENARIO_ID, { view });
    assert.equal(new URL(link).hash, hash);
    assert.equal(new URL(link).search, '');
  }
  assert.deepEqual(parseFamilyRoute(buildFamilyHash('familia', CODE, null, { autoJoin: false })), result('familia', CODE, null, null, false, 2));
  assert.deepEqual(parseFamilyRoute(`#familia?codigo=${CODE}`), result('familia', CODE));
  assert.deepEqual(parseFamilyRoute(`#familia?codigo=${CODE}&entrar=1`), result('familia', CODE, null, null, true, 1));
});

test('unsupported versions and invalid auto-entry flags never trigger automatic access', () => {
  for (const hash of [`#familia?codigo=${CODE}&acceso=3&entrar=1`, `#resumen?codigo=${CODE}&acceso=2&entrar=yes`, `#familia?acceso=2&entrar=1`, `#resumen?codigo=${CODE}&acceso=2&entrar=1&entrar=0`]) {
    const parsed = parseFamilyRoute(hash);
    assert.equal(parsed.inviteCode, null);
    assert.equal(parsed.autoJoin, false);
    assert.equal(typeof parsed.error, 'string');
  }
  assert.throws(() => buildFamilyHash('unknown', CODE));
  assert.throws(() => buildFamilyHash('resumen', CODE, null, { autoJoin: 'yes' }));
});

test('HTTPS is required except for explicit localhost development addresses', () => {
  for (const baseUrl of ['http://example.com', 'http://localhost.evil.com', 'javascript:alert(1)', 'data:text/plain,test', 'file:///tmp/test', 'not a URL', 'https://user:password@example.com']) {
    assert.throws(() => buildFamilyLink(baseUrl, CODE));
  }
  for (const baseUrl of ['http://localhost:3000/app/', 'http://127.0.0.1:3000/app/', 'http://[::1]:3000/app/']) {
    assert.equal(new URL(buildFamilyLink(baseUrl, CODE)).pathname, '/app/');
  }
});

test('link building rejects malformed invitation codes and identifiers', () => {
  for (const code of ['', 'a'.repeat(47), 'a'.repeat(49), 'z'.repeat(48), ` ${CODE}`, null, 123]) {
    assert.throws(() => buildFamilyLink('https://example.com', code));
  }
  for (const id of ['', 'a'.repeat(129), '../house', 'house&other=1', 'house name', 123, {}]) {
    assert.throws(() => buildFamilyLink('https://example.com', CODE, id));
  }
  assert.doesNotThrow(() => buildFamilyLink('https://example.com', CODE, 'a'.repeat(128)));
});

test('normal views remain supported and do not extract family parameters', () => {
  for (const view of ['resumen', 'compra', 'hipoteca', 'presupuesto', 'viviendas', 'fuentes', 'familia']) {
    assert.deepEqual(parseFamilyRoute(`#${view}`), result(view));
  }
  assert.deepEqual(parseFamilyRoute(`#resumen?codigo=${CODE}&vivienda=${SCENARIO_ID}`), result());
  assert.deepEqual(parseFamilyRoute(`#viviendas?codigo=${CODE}`), result('viviendas'));
  assert.deepEqual(parseFamilyRoute('#unknown?codigo=invalid'), result());
  assert.deepEqual(parseFamilyRoute(''), result());
  assert.deepEqual(parseFamilyRoute(), result());
});

test('family parsing accepts uppercase codes, encoded values, and no-parameter access', () => {
  assert.deepEqual(parseFamilyRoute(`#familia?codigo=${CODE.toUpperCase()}`), result('familia', CODE));
  assert.deepEqual(parseFamilyRoute(`#familia?codigo=${CODE}&vivienda=house%5F123`), result('familia', CODE, 'house_123'));
  assert.deepEqual(parseFamilyRoute('#familia?'), result('familia'));
});

test('a scenario-only family route is rejected instead of producing an incomplete share link', () => {
  const parsed = parseFamilyRoute(`#familia?vivienda=${SCENARIO_ID}`);
  assert.equal(parsed.view, 'familia');
  assert.equal(parsed.inviteCode, null);
  assert.equal(parsed.scenarioId, null);
  assert.match(parsed.error, /código privado/);
});

test('invalid, duplicate, unexpected, and malformed parameters fail without retaining credentials', () => {
  const routes = [
    '#familia?codigo=',
    '#familia?codigo=short',
    `#familia?codigo=${CODE}&vivienda=`,
    `#familia?codigo=${CODE}&vivienda=../house`,
    `#familia?codigo=${CODE}&vivienda=${'a'.repeat(129)}`,
    `#familia?codigo=${CODE}&codigo=${CODE}`,
    `#familia?codigo=${CODE}&vivienda=one&vivienda=two`,
    `#familia?codigo=${CODE}&access_token=fictional`,
    `#familia?codigo=${CODE}&vivienda=%E0%A4%A`,
    `#familia?codigo=${CODE}&vivienda=%GG`,
    '#familia?codigo=%',
  ];
  for (const route of routes) {
    const parsed = parseFamilyRoute(route);
    assert.equal(parsed.view, 'familia');
    assert.equal(parsed.inviteCode, null);
    assert.equal(parsed.scenarioId, null);
    assert.equal(typeof parsed.error, 'string');
    assert.equal(parsed.error.includes(CODE), false, 'errors must not echo private invitation codes');
  }
  for (const route of ['#fami%GG', null, 12, {}, '#familia?' + 'x'.repeat(4096)]) {
    assert.doesNotThrow(() => parseFamilyRoute(route));
    assert.equal(parseFamilyRoute(route).inviteCode, null);
    assert.equal(typeof parseFamilyRoute(route).error, 'string');
  }
});

test('a local draft is preserved by reference when no scenario is explicitly requested', () => {
  const draft = Object.freeze({ id: 'local-draft', name: 'Edición pendiente' });
  const shared = Object.freeze({ id: 'shared', name: 'Guardado familiar' });
  assert.equal(selectInitialFamilyScenario({ draft, hasLocalDraft: true, scenarios: [shared] }), draft);
  assert.equal(selectInitialFamilyScenario({ draft, hasLocalDraft: true, scenarios: [] }), draft);
  assert.equal(selectInitialFamilyScenario({ draft, hasLocalDraft: true, scenarios: [shared, { id: 'other' }] }), draft);
});

test('an explicit request selects only its exact ID and never falls back after a miss', () => {
  const first = Object.freeze({ id: 'house-one' });
  const second = Object.freeze({ id: 'house-two' });
  const draft = Object.freeze({ id: 'draft' });
  assert.equal(selectInitialFamilyScenario({ draft, hasLocalDraft: true, scenarios: [first, second], requestedScenarioId: second.id }), second);
  assert.equal(selectInitialFamilyScenario({ draft, hasLocalDraft: true, scenarios: [first], requestedScenarioId: 'unknown-house' }), null);
  assert.equal(selectInitialFamilyScenario({ scenarios: [first], requestedScenarioId: 'HOUSE-ONE' }), null);
  for (const requestedScenarioId of ['', '../unsafe', 42]) {
    assert.equal(selectInitialFamilyScenario({ scenarios: [first], requestedScenarioId }), null);
  }
});

test('a fresh device selects a sole shared scenario while multiple or empty lists require a choice', () => {
  const only = Object.freeze({ id: 'only-house' });
  assert.equal(selectInitialFamilyScenario({ hasLocalDraft: false, scenarios: [only] }), only);
  assert.equal(selectInitialFamilyScenario({ scenarios: [] }), null);
  assert.equal(selectInitialFamilyScenario({ scenarios: [only, { id: 'another-house' }] }), null);
  assert.equal(selectInitialFamilyScenario({ scenarios: null }), null);
  assert.equal(selectInitialFamilyScenario(), null);
});

test('the monthly allocation route preserves private access and its selected home',()=>{
 const route=parseFamilyRoute(buildFamilyHash('reparto',CODE,'home-plan'));
 assert.equal(route.view,'reparto');assert.equal(route.inviteCode,CODE);assert.equal(route.scenarioId,'home-plan');
});
