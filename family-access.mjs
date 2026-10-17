/** Pure helpers for family onboarding. No storage, Auth, network, or joins. */
const VIEWS = new Set(['resumen', 'compra', 'hipoteca', 'presupuesto', 'viviendas', 'fuentes', 'familia']);
const INVITE_PATTERN = /^[a-f0-9]{48}$/i;
const SCENARIO_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function validInvite(value) {
  return typeof value === 'string' && INVITE_PATTERN.test(value);
}

function validScenarioId(value) {
  return typeof value === 'string' && SCENARIO_PATTERN.test(value);
}

/**
 * Returns a shareable URL. The invitation stays in its fragment, never its query.
 * Existing query parameters and fragments are discarded. Only the public path,
 * invitation, and optional scenario ID are included; no financial/Auth payloads.
 */
export function buildFamilyLink(baseUrl, inviteCode, scenarioId = null) {
  let url;
  try { url = new URL(baseUrl); } catch { throw new Error('La dirección de la aplicación no es válida.'); }
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)))) {
    throw new Error('El enlace debe usar HTTPS; HTTP solo se admite para pruebas en localhost.');
  }
  if (!validInvite(inviteCode)) throw new Error('El código privado de familia debe tener 48 caracteres hexadecimales.');
  if (scenarioId !== null && !validScenarioId(scenarioId)) throw new Error('El identificador de vivienda no es válido.');
  const params = new URLSearchParams({ codigo: inviteCode.toLowerCase() });
  if (scenarioId !== null) params.set('vivienda', scenarioId);
  url.search = '';
  url.hash = `familia?${params}`;
  return url.href;
}

/**
 * Reads a location.hash without performing any action or throwing on bad input.
 * Other views ignore parameters. Family links reject unknown/duplicate keys and
 * require a valid code whenever a scenario ID is present.
 */
export function parseFamilyRoute(hash = '') {
  const empty = { view: 'resumen', inviteCode: null, scenarioId: null, error: null };
  const invalid = (view, message) => ({ ...empty, view, error: message });
  if (typeof hash !== 'string') return invalid('resumen', 'La ruta de la aplicación no es válida.');
  if (hash.length > 4096) return invalid('resumen', 'El enlace de familia es demasiado largo.');
  const route = hash.startsWith('#') ? hash.slice(1) : hash;
  const separator = route.indexOf('?');
  const rawView = separator < 0 ? route : route.slice(0, separator);
  let decodedView;
  try { decodedView = decodeURIComponent(rawView); } catch { return invalid('resumen', 'La ruta del enlace está mal codificada.'); }
  const view = VIEWS.has(decodedView) ? decodedView : 'resumen';
  const result = { ...empty, view };
  if (view !== 'familia' || separator < 0) return result;
  const query = route.slice(separator + 1);
  try {
    // URLSearchParams tolerates broken percent escapes; fail explicitly instead.
    decodeURIComponent(query.replace(/\+/g, ' '));
    const params = new URLSearchParams(query);
    for (const key of params.keys()) {
      if (!['codigo', 'vivienda'].includes(key)) return invalid(view, 'El enlace de familia contiene parámetros no admitidos.');
      if (params.getAll(key).length !== 1) return invalid(view, 'El enlace de familia contiene parámetros repetidos.');
    }
    const code = params.get('codigo');
    const scenarioId = params.get('vivienda');
    if (code === null && scenarioId !== null) return invalid(view, 'El enlace de vivienda necesita el código privado de la familia.');
    if (code !== null && !validInvite(code)) return invalid(view, 'El código privado de familia del enlace no es válido.');
    if (scenarioId !== null && !validScenarioId(scenarioId)) return invalid(view, 'El identificador de vivienda del enlace no es válido.');
    return { ...result, inviteCode: code?.toLowerCase() ?? null, scenarioId };
  } catch {
    return invalid(view, 'El enlace de familia está mal codificado.');
  }
}

/**
 * Selects an existing object by reference, without mutating any argument.
 * A local draft wins when no scenario was requested explicitly. An explicit
 * missing/invalid ID returns null, never an unrelated scenario or a new draft.
 */
export function selectInitialFamilyScenario({ draft = null, hasLocalDraft = false, scenarios = [], requestedScenarioId = null } = {}) {
  if (requestedScenarioId !== null && requestedScenarioId !== undefined) {
    if (!validScenarioId(requestedScenarioId) || !Array.isArray(scenarios)) return null;
    return scenarios.find((scenario) => scenario?.id === requestedScenarioId) ?? null;
  }
  if (hasLocalDraft) return draft;
  return Array.isArray(scenarios) && scenarios.length === 1 ? scenarios[0] ?? null : null;
}
