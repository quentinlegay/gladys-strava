// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined`. Note that the OAuth
// tokens (`access_token`, `refresh_token`, `expires_at`) and the athlete
// identity (`athlete_id`, `athlete_name`) are stored as config keys OUTSIDE the
// manifest `config_schema` (see src/strava/auth.js): they flow through this
// same object but have no default here, they are simply absent until the user
// connects.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest.
export const DEFAULT_CONFIG = {
  unit_system: 'metric', // 'metric' | 'imperial'
  poll_frequency: 900, // seconds, how often activities are refreshed
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    // Force the types: config may arrive as strings from a form.
    poll_frequency: Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency),
    unit_system: raw.unit_system === 'imperial' ? 'imperial' : 'metric',
  };
}
