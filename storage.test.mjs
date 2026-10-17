import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStore, CloudStore, getCloudConfig, setCloudConfig, clearCloudConfig } from './storage.mjs';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

const PUBLIC_URL = 'https://example.supabase.co';
const PUBLIC_KEY = 'sb_publishable_example_test_only';
const USER_ID = 'bc74fd74-af6a-4f9d-b8bf-01c6cdbd5957';
const HOUSEHOLD_ID = 'e357982a-f11d-413b-8ba8-36e071ca642a';
const INVITE_CODE = 'a'.repeat(48);
const CREATED_AT = '2026-10-17T10:00:00.000Z';
const UPDATED_AT = '2026-10-17T11:00:00.000Z';
const backup = (scenarios) => JSON.stringify({ format: 'costes-vivienda.scenarios', version: 1, scenarios });

function mockSupabase() {
  const state = {
    member: false, signups: 0, refreshes: 0, revision: 0,
    rows: new Map(), requests: [], failNextList: false, failNextSave: false, offline: false,
  };
  const response = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status });
  const session = () => ({
    access_token: `test_access_${state.revision}`,
    refresh_token: 'test_refresh_private',
    expires_in: 3600,
    user: { id: USER_ID },
  });
  const fetch = async (url, options) => {
    if (state.offline) throw new TypeError('Network request failed');
    const target = new URL(url);
    const body = options.body === undefined ? null : JSON.parse(options.body);
    state.requests.push({ url: target, method: options.method, body, headers: options.headers });
    assert.equal(options.headers.apikey, PUBLIC_KEY);
    if (target.pathname === '/auth/v1/signup') { state.signups++; return response(session()); }
    if (target.pathname === '/auth/v1/token') {
      assert.equal(body.refresh_token, 'test_refresh_private');
      state.refreshes++;
      state.revision++;
      return response(session());
    }
    assert.equal(options.headers.Authorization, `Bearer test_access_${state.revision}`);
    if (target.pathname === '/auth/v1/user') return response({ id: USER_ID });
    if (target.pathname === '/rest/v1/household_members') {
      return response(state.member ? [{ household_id: HOUSEHOLD_ID }] : []);
    }
    if (target.pathname === '/rest/v1/rpc/create_household') {
      assert.equal(typeof body.p_name, 'string');
      state.member = true;
      return response([{ household_id: HOUSEHOLD_ID, invite_code: INVITE_CODE }]);
    }
    if (target.pathname === '/rest/v1/rpc/join_household') {
      if (body.p_invite_code !== INVITE_CODE) return response({ message: 'Código de invitación no válido' }, 400);
      state.member = true;
      return response([{ household_id: HOUSEHOLD_ID }]);
    }
    if (target.pathname === '/rest/v1/scenarios' && options.method === 'POST') {
      assert.equal(body.household_id, HOUSEHOLD_ID);
      assert.equal(target.searchParams.get('on_conflict'), 'household_id,id');
      if (state.failNextSave) { state.failNextSave = false; return response({ message: 'Servicio no disponible' }, 503); }
      const saved = { ...body, created_at: CREATED_AT, updated_at: UPDATED_AT };
      state.rows.set(saved.id, saved);
      return response([saved]);
    }
    if (target.pathname === '/rest/v1/scenarios') {
      assert.equal(target.searchParams.get('household_id'), `eq.${HOUSEHOLD_ID}`);
      if (options.method === 'GET') {
        if (state.failNextList) { state.failNextList = false; return response({ message: 'Token expired' }, 401); }
        return response([...state.rows.values()]);
      }
      if (options.method === 'DELETE') {
        state.rows.delete(target.searchParams.get('id').slice(3));
        return response(null, 204);
      }
    }
    throw new Error(`Unexpected request: ${options.method} ${url}`);
  };
  const storage = new MemoryStorage();
  return { state, storage, fetch, cloud: new CloudStore(PUBLIC_URL, PUBLIC_KEY, { storage, fetch }) };
}

test('local saves are independent snapshots and updates keep one identifier', () => {
  const store = new LocalStore(new MemoryStorage());
  const input = { name: 'Casa 1', costs: { purchasePrice: 250000 } };
  const saved = store.saveScenario(input);
  assert.match(saved.id, /^[a-f0-9-]{36}$/);
  input.costs.purchasePrice = 1;
  saved.name = 'Mutation';
  assert.equal(store.getScenarios()[0].costs.purchasePrice, 250000);
  assert.equal(store.getScenarios()[0].name, 'Casa 1');
  const edited = store.saveScenario({ ...store.getScenarios()[0], name: 'Casa editada' });
  assert.equal(edited.id, saved.id);
  assert.equal(store.getScenarios().length, 1);
  assert.equal(store.getScenarios()[0].name, 'Casa editada');
  assert.deepEqual(store.deleteScenario(saved.id), []);
});

test('a complete copy can merge or replace without silently duplicating a home', () => {
  const store = new LocalStore(new MemoryStorage());
  const original = store.saveScenario({ name: 'Primera' });
  const exported = store.exportJSON();
  store.saveScenario({ name: 'Segunda' });
  assert.equal(store.importJSON(exported).total, 2);
  const imported = store.importJSON(exported, { replace: true });
  assert.equal(imported.imported, 1);
  assert.equal(imported.total, 1);
  assert.equal(imported.scenarios[0].id, original.id);
});

test('the complete import is validated before any existing housing data changes', () => {
  const store = new LocalStore(new MemoryStorage());
  store.saveScenario({ name: 'Conservar' });
  const before = store.getScenarios();
  for (const payload of [
    'not json',
    '{"format":"wrong","version":1,"scenarios":[]}',
    '{"format":"costes-vivienda.scenarios","version":2,"scenarios":[]}',
    backup([{ name: 'First valid' }, { id: '../invalid' }]),
    backup([{ id: 'valid' }, null]),
    backup([{ id: 'valid' }, []]),
    backup([{ name: 'Too large', text: 'x'.repeat(1_000_001) }]),
  ]) {
    assert.throws(() => store.importJSON(payload, { replace: true }));
    assert.deepEqual(store.getScenarios(), before);
  }
});

test('malicious prototype keys are rejected at every nested level without pollution', () => {
  const store = new LocalStore(new MemoryStorage());
  for (const fragment of [
    '{"__proto__":{"polluted":true}}',
    '{"budget":{"constructor":{"prototype":{"polluted":true}}}}',
    '{"mortgage":{"discounts":[{"prototype":{"polluted":true}}]}}',
  ]) {
    assert.throws(() => store.importJSON(`{"format":"costes-vivienda.scenarios","version":1,"scenarios":[${fragment}]}`), /reservadas/);
    assert.deepEqual(store.getScenarios(), []);
    assert.equal({}.polluted, undefined);
  }
});

test('unavailable or full browser storage never reports a successful save', () => {
  const unavailable = new LocalStore(null);
  assert.equal(unavailable.persistent, false);
  assert.throws(() => unavailable.saveScenario({ name: 'Casa' }), /no permite guardar/);
  const storage = new MemoryStorage();
  const store = new LocalStore(storage);
  store.saveScenario({ name: 'Already saved' });
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => store.saveScenario({ name: 'New home' }), /bloqueado o lleno/);
  assert.equal(store.getScenarios().length, 1);
});

test('configuration accepts public keys and rejects privileged keys and unsafe URLs', () => {
  const storage = new MemoryStorage();
  assert.equal(getCloudConfig(storage), null);
  const anonJWT = `header.${btoa(JSON.stringify({ role: 'anon' }))}.signature`;
  const serviceJWT = `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`;
  setCloudConfig({ url: `${PUBLIC_URL}/`, anonKey: PUBLIC_KEY }, storage);
  assert.deepEqual(getCloudConfig(storage), { url: PUBLIC_URL, anonKey: PUBLIC_KEY });
  assert.equal(setCloudConfig({ url: PUBLIC_URL, anonKey: anonJWT }, storage).anonKey, anonJWT);
  for (const anonKey of [serviceJWT, 'sb_secret_do_not_use_this', 'not-a-key']) {
    assert.throws(() => setCloudConfig({ url: PUBLIC_URL, anonKey }, storage), /clave pública/);
  }
  for (const url of ['http://example.com', 'javascript:alert(1)', 'https://name:password@example.com', `${PUBLIC_URL}/route`, `${PUBLIC_URL}?key=secret`]) {
    assert.throws(() => setCloudConfig({ url, anonKey: PUBLIC_KEY }, storage));
  }
  clearCloudConfig(storage);
  assert.equal(getCloudConfig(storage), null);
});

test('connecting creates an anonymous identity but never uploads local scenarios', async () => {
  const { cloud, state, storage } = mockSupabase();
  new LocalStore(storage).saveScenario({ name: 'Local only' });
  assert.deepEqual(await cloud.connect(), { userId: USER_ID, householdId: null });
  assert.equal(cloud.connected, true);
  assert.equal(state.signups, 1);
  assert.equal(state.rows.size, 0);
  assert.equal(state.requests.some((request) => request.url.pathname === '/rest/v1/scenarios'), false);
  await assert.rejects(() => cloud.list(), /Crea una familia/);
});

test('remote CRUD preserves scenario IDs and uses metadata confirmed by the server', async () => {
  const { cloud, state } = mockSupabase();
  await cloud.connect();
  assert.deepEqual(await cloud.createHousehold('Familia'), { householdId: HOUSEHOLD_ID, inviteCode: INVITE_CODE });
  const input = { id: 'house-test-1', name: 'Casa compartida', price: 250000 };
  const saved = await cloud.save(input);
  assert.equal(saved.id, input.id);
  assert.equal(saved.createdAt, CREATED_AT);
  assert.equal(saved.updatedAt, UPDATED_AT);
  await cloud.save({ ...saved, name: 'Revisada' });
  assert.equal(state.rows.size, 1);
  assert.equal((await cloud.list())[0].name, 'Revisada');
  await cloud.delete(saved.id);
  assert.deepEqual(await cloud.list(), []);
  await assert.rejects(() => cloud.delete('unsafe,id'), /identificador/);
});

test('private invitations allow joining, while a rejected code leaves the context unchanged', async () => {
  const { cloud } = mockSupabase();
  await cloud.connect();
  await assert.rejects(() => cloud.joinHousehold('invalid-code'), /invitación no válido/);
  assert.equal(cloud.householdId, null);
  assert.deepEqual(await cloud.joinHousehold(INVITE_CODE.toUpperCase()), { householdId: HOUSEHOLD_ID });
  await assert.rejects(() => cloud.joinHousehold('wrong-again'), /invitación no válido/);
  assert.equal(cloud.householdId, HOUSEHOLD_ID);
});

test('a page reload reuses its identity and privately remembered family invitation', async () => {
  const { cloud, state, storage, fetch } = mockSupabase();
  await cloud.connect();
  await cloud.createHousehold();
  cloud.disconnect();
  assert.equal(cloud.connected, false);
  const reconnected = new CloudStore(PUBLIC_URL, PUBLIC_KEY, { storage, fetch });
  assert.deepEqual(await reconnected.connect(), { userId: USER_ID, householdId: HOUSEHOLD_ID });
  assert.equal(reconnected.inviteCode, INVITE_CODE);
  assert.equal(state.signups, 1);
});

test('expired sessions and a server 401 are refreshed before a successful retry', async () => {
  const { cloud, state } = mockSupabase();
  await cloud.connect();
  await cloud.createHousehold();
  cloud.session.expires_at = 1;
  await Promise.all([cloud.list(), cloud.list()]);
  assert.equal(state.refreshes, 1, 'concurrent requests share a single refresh');
  state.failNextList = true;
  assert.deepEqual(await cloud.list(), []);
  assert.equal(state.refreshes, 2);
});

test('a failed remote save leaves the local copy available and never claims success', async () => {
  const { cloud, state, storage } = mockSupabase();
  const local = new LocalStore(storage);
  const home = local.saveScenario({ name: 'Conservar localmente' });
  await cloud.connect();
  await cloud.createHousehold();
  state.failNextSave = true;
  await assert.rejects(() => cloud.save(home), /Servicio no disponible/);
  assert.equal(state.rows.size, 0);
  assert.equal(local.getScenarios()[0].id, home.id);
  state.offline = true;
  await assert.rejects(() => cloud.list(), /No se puede conectar/);
  assert.equal(local.getScenarios()[0].id, home.id);
});

test('housing exports exclude Auth sessions, public configuration, and invitation codes', async () => {
  const { cloud, storage } = mockSupabase();
  const local = new LocalStore(storage);
  local.saveScenario({ name: 'Una vivienda', budget: { monthlyIncome: 3000 } });
  setCloudConfig({ url: PUBLIC_URL, anonKey: PUBLIC_KEY }, storage);
  await cloud.connect();
  await cloud.createHousehold();
  const exported = local.exportJSON();
  for (const privateOrConfigData of ['access_token', 'refresh_token', 'test_access_', 'test_refresh_private', PUBLIC_KEY, PUBLIC_URL, INVITE_CODE, HOUSEHOLD_ID]) {
    assert.equal(exported.includes(privateOrConfigData), false);
  }
  assert.equal(JSON.parse(exported).scenarios[0].budget.monthlyIncome, 3000);
});
