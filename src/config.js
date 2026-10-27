// -----------------------------------------------------------------------------
// Integration configuration.
//
// The user fills the `config_schema` of `gladys-assistant-integration.json`
// (Strava API application, units, refresh interval, weekly goal). The OAuth2
// tokens are stored by the integration itself through `gladys.setConfig()`,
// under keys that are NOT in the `config_schema`: free internal storage, never
// shown in the UI, never sent to the browser (see TOKEN_KEYS).
// -----------------------------------------------------------------------------

export const UNITS = { METRIC: 'metric', IMPERIAL: 'imperial' };

// What the weekly goal measures: the distance or the moving time of the week.
export const GOAL_TYPES = { DISTANCE: 'distance', TIME: 'time' };

// Bounds of the refresh interval, in minutes. Strava allows 100 read requests
// per 15 minutes and 1,000 per day per application; a refresh costs 2 requests,
// so even the fastest pace stays far below the daily quota.
export const MIN_REFRESH_INTERVAL = 5;
export const MAX_REFRESH_INTERVAL = 240;

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  client_id: '',
  client_secret: '',
  units: UNITS.METRIC,
  refresh_interval: 15,
  // Weekly goal, in km (metric) or miles (imperial) for a distance goal, in
  // hours for a time goal. 0 disables the `weekly_goal_reached` scene trigger
  // and the goal row of the widget.
  weekly_goal_type: GOAL_TYPES.DISTANCE,
  weekly_goal: 0,
};

// Internal keys written by the integration (outside the config_schema).
export const TOKEN_KEYS = ['access_token', 'refresh_token', 'expires_at', 'athlete_id'];

/**
 * Merge the user config with the defaults, and force the types: a form may
 * send numbers as strings.
 * @param {Record<string, unknown>} raw - Config returned by the SDK.
 */
export function normalizeConfig(raw = {}) {
  const refresh = Number(raw.refresh_interval ?? DEFAULT_CONFIG.refresh_interval);
  const goal = Number(raw.weekly_goal ?? DEFAULT_CONFIG.weekly_goal);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    client_id: String(raw.client_id ?? '').trim(),
    client_secret: String(raw.client_secret ?? '').trim(),
    units: raw.units === UNITS.IMPERIAL ? UNITS.IMPERIAL : UNITS.METRIC,
    refresh_interval: Number.isFinite(refresh)
      ? Math.min(MAX_REFRESH_INTERVAL, Math.max(MIN_REFRESH_INTERVAL, refresh))
      : DEFAULT_CONFIG.refresh_interval,
    weekly_goal_type:
      raw.weekly_goal_type === GOAL_TYPES.TIME ? GOAL_TYPES.TIME : GOAL_TYPES.DISTANCE,
    weekly_goal: Number.isFinite(goal) && goal > 0 ? goal : 0,
    expires_at: raw.expires_at === undefined ? undefined : Number(raw.expires_at),
  };
}

/** The Strava API application is filled in (needed before "Connect"). */
export function hasApplication(config) {
  return Boolean(config.client_id && config.client_secret);
}

/** A Strava account is linked: the integration holds a refresh token. */
export function isLinked(config) {
  return hasApplication(config) && Boolean(config.refresh_token);
}
