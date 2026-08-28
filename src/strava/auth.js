// -----------------------------------------------------------------------------
// OAuth2 token lifecycle for the Strava connection.
//
// Tokens are cached in memory (this module) so every caller within the same
// process shares one source of truth and one refresh-in-flight guard, and are
// persisted to Gladys through `setConfig` (keys OUTSIDE the manifest
// `config_schema`: free internal storage, never shown in the UI) so a
// container restart resumes from the last known refresh token instead of
// asking the user to reconnect.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { refreshAccessToken } from './api.js';

const logger = createLogger({ name: 'strava-auth' });

// Refresh this many seconds before the actual expiry, so a slow request never
// races the token's real deadline.
const EXPIRY_MARGIN_SECONDS = 120;

/** In-memory token cache: { access_token, refresh_token, expires_at } | null */
let tokens = null;

// A refresh already in flight is awaited by every concurrent caller instead
// of firing a second POST to Strava's token endpoint (e.g. two devices
// polling at the same moment right after expiry).
let refreshPromise = null;

/**
 * Whether the given config carries a Strava refresh token, without touching
 * the in-memory cache or the network. Used to decide the connection status
 * right after (re)connecting to Gladys, before any API call is made.
 * @param {Record<string, unknown>} config
 */
export function hasStoredTokens(config) {
  return Boolean(config?.refresh_token);
}

/**
 * Called from `onOAuthCallback` right after a successful code exchange: seeds
 * the in-memory cache with brand-new tokens.
 * @param {{ access_token: string, refresh_token: string, expires_at: number }} newTokens
 */
export function setTokens(newTokens) {
  tokens = {
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token,
    expires_at: Number(newTokens.expires_at),
  };
}

/** Drop the in-memory cache (e.g. when the refresh token is rejected). */
export function clearTokens() {
  tokens = null;
}

// Hydrate the in-memory cache from the persisted config the first time we see
// it (container just (re)started: the SDK's local cache is empty, but the
// config still carries last run's tokens).
function hydrateFromConfig(config) {
  if (!tokens && config.access_token && config.refresh_token) {
    tokens = {
      access_token: config.access_token,
      refresh_token: config.refresh_token,
      expires_at: Number(config.expires_at) || 0,
    };
  }
}

/**
 * Resolve a currently-valid Strava access token, refreshing it first if it is
 * expired (or close to it). Throws when the user never connected yet, or when
 * the refresh itself fails (revoked access, wrong client secret...) — in
 * both cases the caller should let it propagate so the poll/action is
 * reported as failed instead of silently doing nothing.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {Record<string, unknown>} config
 * @returns {Promise<string>}
 */
export async function getValidAccessToken(gladys, config) {
  hydrateFromConfig(config);

  if (!tokens) {
    throw new Error(
      'Not connected to Strava yet: use the "Connect to Strava" button in the configuration.',
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (tokens.expires_at - nowSeconds > EXPIRY_MARGIN_SECONDS) {
    return tokens.access_token;
  }

  if (!refreshPromise) {
    refreshPromise = doRefresh(gladys, config).finally(() => {
      refreshPromise = null;
    });
  }
  await refreshPromise;
  return tokens.access_token;
}

async function doRefresh(gladys, config) {
  logger.info('Access token expired, refreshing it');
  try {
    const refreshed = await refreshAccessToken({
      clientId: config.client_id,
      clientSecret: config.client_secret,
      refreshToken: tokens.refresh_token,
    });
    tokens = {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
    };
    // Persist the rotated pair: Strava issues a new refresh_token on every
    // refresh, the previous one stops working.
    await gladys.setConfig({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
    });
  } catch (err) {
    clearTokens();
    await gladys
      .setConnectionStatus(false, {
        en: 'Strava token refresh failed, please reconnect.',
        fr: 'Le renouvellement du jeton Strava a échoué, merci de vous reconnecter.',
      })
      .catch(() => {});
    throw err;
  }
}
