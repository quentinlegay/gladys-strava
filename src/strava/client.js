// -----------------------------------------------------------------------------
// Strava API client (https://developers.strava.com/docs/reference/).
//
// Plain `fetch` (Node 22+), no dependency. The client owns the OAuth2 token
// lifecycle: Strava access tokens live 6 hours, and every refresh returns a
// NEW refresh token that replaces the previous one — so the tokens are saved
// back through `onTokens` as soon as they change, before anything else.
//
// `fetch` and `now` are injectable: the tests never touch the network.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'strava-api' });

export const AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize';
export const TOKEN_URL = 'https://www.strava.com/oauth/token';
export const API_URL = 'https://www.strava.com/api/v3';

// `read`: public profile and stats; `activity:read_all`: the activities,
// private ones included (the data never leaves the user's Gladys).
export const SCOPES = 'read,activity:read_all';

// Refresh the access token when it expires within this margin.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

export class StravaApiError extends Error {
  /**
   * @param {number} status - HTTP status (0 for a network error).
   * @param {string} code - NOT_LINKED | AUTH_REVOKED | RATE_LIMITED | HTTP_ERROR | NETWORK_ERROR.
   * @param {string} message - Human-readable message (never contains a token).
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'StravaApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Build the URL the user is sent to when clicking "Connect" in Gladys.
 * `approval_prompt=auto` skips the consent screen when it was already given.
 */
export function buildAuthorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    approval_prompt: 'auto',
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export class StravaClient {
  /**
   * @param {object} options
   * @param {() => object} options.getConfig - Current normalized config (application + tokens).
   * @param {(tokens: object) => Promise<void>} options.onTokens - Persist new tokens.
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   */
  constructor({ getConfig, onTokens, fetch = globalThis.fetch, now = Date.now }) {
    this.getConfig = getConfig;
    this.onTokens = onTokens;
    this.fetch = fetch;
    this.now = now;
    this.refreshing = null;
    // Last rate-limit usage reported by Strava ("15-min,daily"), for the logs.
    this.rateLimitUsage = null;
  }

  // --- OAuth2 ----------------------------------------------------------------

  /** Exchange the authorization code of the OAuth2 callback for tokens. */
  async exchangeCode(code) {
    const { client_id, client_secret } = this.getConfig();
    const tokens = await this.tokenRequest({
      client_id,
      client_secret,
      code,
      grant_type: 'authorization_code',
    });
    await this.saveTokens(tokens);
    return tokens;
  }

  /** Revoke the access of the integration on Strava (best effort). */
  async deauthorize() {
    const { access_token } = this.getConfig();
    if (!access_token) {
      return;
    }
    await this.send('https://www.strava.com/oauth/deauthorize', {
      method: 'POST',
      body: new URLSearchParams({ access_token }),
    });
  }

  async tokenRequest(form) {
    const response = await this.send(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams(form),
      // 400/401 on the token endpoint: the code or the refresh token was
      // refused (access revoked from strava.com, application changed...).
      authErrors: true,
    });
    return response;
  }

  async saveTokens(tokens) {
    await this.onTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Number(tokens.expires_at) * 1000,
      ...(tokens.athlete?.id ? { athlete_id: String(tokens.athlete.id) } : {}),
    });
  }

  /** A valid access token, refreshed first when it is about to expire. */
  async accessToken({ force = false } = {}) {
    const config = this.getConfig();
    if (!config.refresh_token || !config.client_id || !config.client_secret) {
      throw new StravaApiError(401, 'NOT_LINKED', 'No Strava account is linked');
    }
    const expiresAt = Number(config.expires_at) || 0;
    if (!force && config.access_token && expiresAt - EXPIRY_MARGIN_MS > this.now()) {
      return config.access_token;
    }
    // Single flight: concurrent requests share one refresh, since each refresh
    // invalidates the previous refresh token.
    this.refreshing ??= (async () => {
      try {
        logger.debug('Refreshing the Strava access token');
        const tokens = await this.tokenRequest({
          client_id: config.client_id,
          client_secret: config.client_secret,
          grant_type: 'refresh_token',
          refresh_token: config.refresh_token,
        });
        await this.saveTokens(tokens);
        return tokens.access_token;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  // --- Low-level request -----------------------------------------------------

  async send(url, { method = 'GET', headers = {}, body, authErrors = false } = {}) {
    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers: { Accept: 'application/json', ...headers },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new StravaApiError(0, 'NETWORK_ERROR', `Strava unreachable: ${err.message}`);
    }
    const usage = response.headers?.get?.('x-ratelimit-usage');
    if (usage) {
      this.rateLimitUsage = usage;
    }
    if (response.status === 429) {
      throw new StravaApiError(429, 'RATE_LIMITED', 'Strava rate limit reached');
    }
    if (authErrors && (response.status === 400 || response.status === 401)) {
      throw new StravaApiError(response.status, 'AUTH_REVOKED', 'Strava refused the credentials');
    }
    if (!response.ok) {
      throw new StravaApiError(
        response.status,
        response.status === 401 ? 'AUTH_REVOKED' : 'HTTP_ERROR',
        `Strava answered ${response.status} on ${method} ${new URL(url).pathname}`,
      );
    }
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  /** Authenticated API call; a 401 forces one token refresh, then gives up. */
  async api(path, { query, ...options } = {}) {
    const url = `${API_URL}${path}${query ? `?${new URLSearchParams(query)}` : ''}`;
    const call = async (token) =>
      this.send(url, { ...options, headers: { Authorization: `Bearer ${token}` } });
    try {
      return await call(await this.accessToken());
    } catch (err) {
      if (err.status !== 401 || err.code === 'NOT_LINKED') {
        throw err;
      }
      logger.warn('Access token refused by Strava, refreshing it once');
      return call(await this.accessToken({ force: true }));
    }
  }

  // --- Endpoints -------------------------------------------------------------

  getAthlete() {
    return this.api('/athlete');
  }

  getAthleteStats(athleteId) {
    return this.api(`/athletes/${encodeURIComponent(athleteId)}/stats`);
  }

  /** Most recent activities first. */
  listActivities({ perPage = 30, page = 1 } = {}) {
    return this.api('/athlete/activities', { query: { per_page: perPage, page } });
  }

  // --- Webhook push subscriptions (one per Strava application) ---------------
  // Authenticated with the application credentials, not with a user token.

  appCredentials() {
    const { client_id, client_secret } = this.getConfig();
    return { client_id, client_secret };
  }

  listSubscriptions() {
    const query = new URLSearchParams(this.appCredentials());
    return this.send(`${API_URL}/push_subscriptions?${query}`);
  }

  createSubscription(callbackUrl, verifyToken) {
    return this.send(`${API_URL}/push_subscriptions`, {
      method: 'POST',
      body: new URLSearchParams({
        ...this.appCredentials(),
        callback_url: callbackUrl,
        verify_token: verifyToken,
      }),
    });
  }

  deleteSubscription(id) {
    const query = new URLSearchParams(this.appCredentials());
    return this.send(`${API_URL}/push_subscriptions/${encodeURIComponent(id)}?${query}`, {
      method: 'DELETE',
    });
  }
}
