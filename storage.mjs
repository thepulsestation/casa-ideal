/** Browser-only storage for the family housing calculator. No external dependencies. */
const SCENARIOS_KEY = 'costes-vivienda.scenarios.v1';
const CONFIG_KEY = 'costes-vivienda.supabase.v1';
const FORMAT = 'costes-vivienda.scenarios';
const MAX_SCENARIO_BYTES = 1_000_000;
const MAX_IMPORT_BYTES = 10_000_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function browserStorage() {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch { /* The operation below will report that persistence is unavailable. */ }
  return null;
}

function read(storage, key, fallback = null) {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    throw new Error('No se pueden leer los datos guardados en este navegador. Conserva una copia JSON antes de borrar sus datos.');
  }
}

function write(storage, key, value) {
  if (!storage) throw new Error('El navegador no permite guardar datos. Activa el almacenamiento local o utiliza otro navegador.');
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('No se han podido guardar los datos en este navegador. Puede que el almacenamiento esté bloqueado o lleno.');
  }
}

function id() {
  if (!globalThis.crypto?.randomUUID) throw new Error('Abre la aplicación mediante HTTPS para poder crear una vivienda.');
  return globalThis.crypto.randomUUID();
}

function normalizeScenario(input, { touch = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Cada vivienda debe ser un objeto de datos válido.');
  }
  let encoded;
  try { encoded = JSON.stringify(input); } catch { throw new Error('La vivienda contiene datos que no se pueden guardar como JSON.'); }
  if (new TextEncoder().encode(encoded).length > MAX_SCENARIO_BYTES) throw new Error('Una vivienda supera el límite de 1 MB.');
  const result = JSON.parse(encoded);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('La vivienda no contiene datos válidos.');
  // JSON.parse itself is safe, but reject keys which could become dangerous if
  // a caller later combines imported objects with a prototype-aware deep merge.
  const objects = [result];
  while (objects.length) {
    const object = objects.pop();
    for (const [key, value] of Object.entries(object)) {
      if (UNSAFE_KEYS.has(key)) throw new Error('La vivienda contiene propiedades reservadas no permitidas.');
      if (value && typeof value === 'object') objects.push(value);
    }
  }
  result.id = result.id || id();
  if (typeof result.id !== 'string' || !ID_PATTERN.test(result.id)) {
    throw new Error('El identificador de una vivienda no es válido (hasta 128 letras, números, guiones o guiones bajos).');
  }
  const now = new Date().toISOString();
  if (!result.createdAt) result.createdAt = now;
  if (touch || !result.updatedAt) result.updatedAt = now;
  return result;
}

function sortScenarios(scenarios) {
  return scenarios.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
}

/** All methods are synchronous. Pass a Storage-compatible object for tests. */
export class LocalStore {
  constructor(storage = browserStorage()) { this.storage = storage; }

  get persistent() { return Boolean(this.storage); }

  getScenarios() {
    const saved = read(this.storage, SCENARIOS_KEY, { version: 1, scenarios: [] });
    if (saved?.version !== 1 || !Array.isArray(saved.scenarios)) throw new Error('El formato de las viviendas guardadas no es compatible.');
    return sortScenarios(saved.scenarios.map((scenario) => normalizeScenario(scenario)));
  }

  saveScenario(scenario) {
    const saved = normalizeScenario(scenario, { touch: true });
    const scenarios = this.getScenarios().filter((item) => item.id !== saved.id);
    scenarios.push(saved);
    write(this.storage, SCENARIOS_KEY, { version: 1, scenarios: sortScenarios(scenarios) });
    return saved;
  }

  deleteScenario(scenarioId) {
    const scenarios = this.getScenarios().filter((item) => item.id !== scenarioId);
    write(this.storage, SCENARIOS_KEY, { version: 1, scenarios });
    return scenarios;
  }

  /** Includes housing scenarios only, never credentials, sessions, or invitations. */
  exportJSON() {
    return JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), scenarios: this.getScenarios() }, null, 2);
  }

  /** Validates the complete import before writing anything. Existing IDs are replaced. */
  importJSON(json, { replace = false } = {}) {
    if (typeof json !== 'string' || new TextEncoder().encode(json).length > MAX_IMPORT_BYTES) {
      throw new Error('La copia debe ser un archivo JSON de menos de 10 MB.');
    }
    let parsed;
    try { parsed = JSON.parse(json); } catch { throw new Error('El archivo no contiene un JSON válido.'); }
    if (parsed?.format !== FORMAT || parsed.version !== 1 || !Array.isArray(parsed.scenarios)) {
      throw new Error('El archivo no es una copia de viviendas compatible con esta aplicación.');
    }
    const imported = parsed.scenarios.map((scenario) => normalizeScenario(scenario));
    const merged = new Map((replace ? [] : this.getScenarios()).map((scenario) => [scenario.id, scenario]));
    for (const scenario of imported) merged.set(scenario.id, scenario);
    const scenarios = sortScenarios([...merged.values()]);
    write(this.storage, SCENARIOS_KEY, { version: 1, scenarios });
    return { imported: imported.length, total: scenarios.length, scenarios };
  }
}

function validateConfig(config) {
  let url;
  try { url = new URL(config?.url?.trim()); } catch { throw new Error('Introduce una URL de proyecto Supabase válida.'); }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:'))) {
    throw new Error('La URL de Supabase debe utilizar HTTPS y no incluir contraseñas ni parámetros.');
  }
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('Utiliza la URL del proyecto Supabase, sin rutas adicionales.');
  const anonKey = String(config?.anonKey || '').trim();
  let isPublic = anonKey.startsWith('sb_publishable_') && anonKey.length > 20;
  if (anonKey.split('.').length === 3) {
    try {
      const payload = anonKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(globalThis.atob(payload));
      isPublic = claims.role === 'anon';
    } catch { isPublic = false; }
  }
  if (!isPublic) throw new Error('Utiliza únicamente la clave pública publishable o anon de Supabase. Nunca pegues una clave secret ni service_role.');
  return { url: url.origin, anonKey };
}

/** These settings contain a public URL/key only; private session storage is separate. */
export function getCloudConfig(storage = browserStorage()) {
  const saved = read(storage, CONFIG_KEY);
  return saved ? validateConfig(saved) : null;
}

export function setCloudConfig(config, storage = browserStorage()) {
  const validated = validateConfig(config);
  write(storage, CONFIG_KEY, validated);
  return validated;
}

export function clearCloudConfig(storage = browserStorage()) { write(storage, CONFIG_KEY, null); }

export const localStore = new LocalStore();

/**
 * Optional Supabase REST client. Every remote method is async.
 * A browser's anonymous Auth identity is private and persists across page reloads.
 * Last successful save wins for concurrent edits to the same scenario.
 */
export class CloudStore {
  constructor(url, anonKey, { storage = browserStorage(), fetch: fetchImpl = globalThis.fetch } = {}) {
    Object.assign(this, validateConfig({ url, anonKey }));
    this.storage = storage;
    this.fetchImpl = fetchImpl;
    this.sessionKey = `costes-vivienda.auth.v1:${this.url}`;
    this.householdKey = `costes-vivienda.household.v1:${this.url}`;
    this.session = null;
    this.userId = null;
    this.householdId = null;
    this.inviteCode = null;
    this._refreshPromise = null;
  }

  get connected() { return Boolean(this.session && this.userId); }

  async _fetch(path, { method = 'GET', body, headers = {}, token } = {}) {
    let response;
    try {
      response = await this.fetchImpl(`${this.url}${path}`, {
        method,
        headers: { apikey: this.anonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error('No se puede conectar con Supabase. Comprueba la conexión y la URL del proyecto; tus viviendas locales siguen disponibles.');
    }
    let payload = null;
    const raw = await response.text();
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = null; }
    }
    if (!response.ok) {
      const detail = payload?.message || payload?.msg || payload?.error_description || payload?.error || `Error HTTP ${response.status}`;
      const error = new Error(String(detail).slice(0, 500));
      error.status = response.status;
      error.code = payload?.code || payload?.error_code;
      throw error;
    }
    return payload;
  }

  _rememberSession(session) {
    if (!session?.access_token || !session?.refresh_token || !session?.user?.id) throw new Error('Supabase no ha devuelto una sesión válida.');
    this.session = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at || Math.floor(Date.now() / 1000) + (session.expires_in || 3600),
      user: { id: session.user.id },
    };
    this.userId = session.user.id;
    write(this.storage, this.sessionKey, this.session);
  }

  async _refresh() {
    if (!this._refreshPromise) {
      this._refreshPromise = (async () => {
        if (!this.session?.refresh_token) throw new Error('Vuelve a conectar con Supabase para continuar.');
        const session = await this._fetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: this.session.refresh_token } });
        this._rememberSession(session);
      })().finally(() => { this._refreshPromise = null; });
    }
    return this._refreshPromise;
  }

  async _request(path, options = {}) {
    if (!this.session) throw new Error('Conecta primero con Supabase.');
    if (this.session.expires_at <= Math.floor(Date.now() / 1000) + 60) await this._refresh();
    try {
      return await this._fetch(path, { ...options, token: this.session.access_token });
    } catch (error) {
      if (error.status !== 401) throw error;
      await this._refresh();
      return this._fetch(path, { ...options, token: this.session.access_token });
    }
  }

  _rememberHousehold(householdId, inviteCode = null) {
    this.householdId = householdId;
    this.inviteCode = inviteCode;
    write(this.storage, this.householdKey, householdId ? { householdId, ...(inviteCode ? { inviteCode } : {}) } : null);
  }

  /** Anonymous sign-ins must first be enabled in Supabase Auth settings. */
  async connect() {
    this.session = read(this.storage, this.sessionKey);
    if (this.session) {
      this.userId = this.session.user?.id;
      try {
        if (!this.session.expires_at || this.session.expires_at <= Math.floor(Date.now() / 1000) + 60) await this._refresh();
        const user = await this._request('/auth/v1/user');
        this.userId = user.id;
      } catch (error) {
        if (![400, 401, 403].includes(error.status)) throw error;
        this.session = null;
        this.userId = null;
        write(this.storage, this.sessionKey, null);
      }
    }
    if (!this.session) {
      try {
        const session = await this._fetch('/auth/v1/signup', { method: 'POST', body: { data: {} } });
        this._rememberSession(session);
      } catch (error) {
        if (/anonymous|an[oó]nim/i.test(error.message)) {
          throw new Error('Activa «Allow anonymous sign-ins» en Authentication → Sign In / Providers de Supabase y vuelve a conectar.');
        }
        throw error;
      }
    }
    const memberships = await this._request('/rest/v1/household_members?select=household_id&order=created_at.asc');
    const remembered = read(this.storage, this.householdKey);
    const active = memberships?.find((membership) => membership.household_id === remembered?.householdId) || memberships?.[0];
    this._rememberHousehold(active?.household_id || null, active?.household_id === remembered?.householdId ? remembered?.inviteCode : null);
    return { userId: this.userId, householdId: this.householdId };
  }

  async createHousehold(name = 'Mi familia') {
    const result = await this._request('/rest/v1/rpc/create_household', { method: 'POST', body: { p_name: name } });
    const household = Array.isArray(result) ? result[0] : result;
    if (!household?.household_id || !household?.invite_code) throw new Error('Supabase no ha devuelto los datos de la familia.');
    this._rememberHousehold(household.household_id, household.invite_code);
    return { householdId: this.householdId, inviteCode: this.inviteCode };
  }

  async joinHousehold(code) {
    const result = await this._request('/rest/v1/rpc/join_household', { method: 'POST', body: { p_invite_code: String(code || '').trim().toLowerCase() } });
    const household = Array.isArray(result) ? result[0] : result;
    const householdId = household?.household_id;
    if (!householdId) throw new Error('Supabase no ha devuelto una familia válida.');
    this._rememberHousehold(householdId);
    return { householdId };
  }

  _requireHousehold() {
    if (!this.householdId) throw new Error('Crea una familia o únete mediante su código de invitación.');
  }

  async list() {
    this._requireHousehold();
    const rows = await this._request(`/rest/v1/scenarios?select=id,data,created_at,updated_at&household_id=eq.${encodeURIComponent(this.householdId)}&order=updated_at.desc`);
    return (rows || []).map((row) => normalizeScenario({ ...row.data, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  async save(scenario) {
    this._requireHousehold();
    const data = normalizeScenario(scenario, { touch: true });
    const rows = await this._request('/rest/v1/scenarios?on_conflict=household_id,id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: { household_id: this.householdId, id: data.id, data },
    });
    const row = rows?.[0];
    if (!row) throw new Error('Supabase no ha confirmado que la vivienda se haya guardado.');
    return normalizeScenario({ ...row.data, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at });
  }

  async delete(scenarioId) {
    this._requireHousehold();
    if (!ID_PATTERN.test(String(scenarioId))) throw new Error('El identificador de vivienda no es válido.');
    await this._request(`/rest/v1/scenarios?household_id=eq.${encodeURIComponent(this.householdId)}&id=eq.${encodeURIComponent(scenarioId)}`, { method: 'DELETE' });
  }

  /** Stops this client; preserves the browser identity so reconnecting keeps access. */
  disconnect() {
    this.session = null;
    this.userId = null;
    this.householdId = null;
    this.inviteCode = null;
  }
}
