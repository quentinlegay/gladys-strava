// -----------------------------------------------------------------------------
// Thin HTTP client for the Strava v3 API.
//
// This is the ONLY file that knows Strava's URLs and response shapes. No
// caching, no token lifecycle here — that is src/strava/auth.js and
// src/strava/activities.js. Node 20+ provides `fetch` natively: no HTTP
// dependency needed.
//
// Strava docs: https://developers.strava.com/docs/reference/
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'strava-api' });

const AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize';
const TOKEN_URL = 'https://www.strava.com/oauth/token';
const API_BASE = 'https://www.strava.com/api/v3';
const REQUEST_TIMEOUT_MS = 10_000;

// Read-only scope: activities, including private ones. Gladys only ever
// reads, it never edits or deletes anything on Strava.
const SCOPE = 'activity:read_all';

/**
 * Build the Strava authorization URL the user is redirected to when they
 * click "Connect to Strava" in the Configuration screen.
 * @param {{ clientId: string, redirectUri: string, state: string }} params
 * @returns {string}
 */
export function buildAuthorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * POST to Strava's token endpoint (used for both the initial code exchange
 * and every subsequent refresh) and normalize the response.
 * @param {Record<string, string>} body
 */
async function postToken(body) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Strava token HTTP ${response.status}${details ? `: ${details}` : ''}`);
  }
  const json = await response.json();
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    // Unix timestamp (seconds) Strava's own tokens expire at.
    expires_at: Number(json.expires_at),
    // Only present on the initial authorization_code exchange, not on refresh.
    athlete: json.athlete,
  };
}

/**
 * Exchange the authorization `code` from the OAuth callback for an access +
 * refresh token pair.
 * @param {{ clientId: string, clientSecret: string, code: string }} params
 */
export function exchangeCodeForTokens({ clientId, clientSecret, code }) {
  logger.debug('Exchanging authorization code for tokens');
  return postToken({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
  });
}

/**
 * Trade a refresh token for a fresh access token (Strava rotates the refresh
 * token on every call: always persist the one returned here).
 * @param {{ clientId: string, clientSecret: string, refreshToken: string }} params
 */
export function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  logger.debug('Refreshing the Strava access token');
  return postToken({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
}

async function apiGet(path, accessToken) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Strava API HTTP ${response.status} on ${path}`);
  }
  return response.json();
}

/**
 * Fetch the athlete's most recent activities, newest first (Strava's default
 * order), including private ones (scope `activity:read_all`).
 * @param {string} accessToken
 * @param {{ perPage?: number }} [options]
 * @returns {Promise<Array<object>>}
 */
export function fetchRecentActivities(accessToken, { perPage = 30 } = {}) {
  logger.debug(`Fetching the ${perPage} most recent activities`);
  return apiGet(`/athlete/activities?per_page=${perPage}`, accessToken);
}

/**
 * Fetch the authenticated athlete's profile (used by the "Test the Strava
 * connection" action).
 * @param {string} accessToken
 */
export function fetchAthlete(accessToken) {
  return apiGet('/athlete', accessToken);
}
