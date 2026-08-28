import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchRecentActivities,
  fetchAthlete,
} from '../src/strava/api.js';
import {
  getValidAccessToken,
  setTokens,
  clearTokens,
  hasStoredTokens,
} from '../src/strava/auth.js';
import {
  getRecentActivities,
  clearActivitiesCache,
  summarizeActivities,
  distanceToUnit,
  elevationToUnit,
  speedToUnit,
  round,
} from '../src/strava/activities.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const realFetch = globalThis.fetch;

beforeEach(() => {
  clearTokens();
  clearActivitiesCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  clearTokens();
  clearActivitiesCache();
});

// --- api.js ------------------------------------------------------------------

test('buildAuthorizeUrl carries the client id, redirect uri, scope and state', () => {
  const url = buildAuthorizeUrl({
    clientId: '12345',
    redirectUri: 'https://app.gladysassistant.com/oauth/callback',
    state: 'my-state',
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://www.strava.com/oauth/authorize');
  assert.equal(parsed.searchParams.get('client_id'), '12345');
  assert.equal(
    parsed.searchParams.get('redirect_uri'),
    'https://app.gladysassistant.com/oauth/callback',
  );
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('scope'), 'activity:read_all');
  assert.equal(parsed.searchParams.get('state'), 'my-state');
});

test('exchangeCodeForTokens posts the authorization_code grant and normalizes the response', async () => {
  let calledUrl;
  let calledBody;
  globalThis.fetch = async (url, options) => {
    calledUrl = url;
    calledBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_at: 1_700_000_000,
        athlete: { id: 42, firstname: 'Ada', lastname: 'Lovelace' },
      }),
    };
  };

  const tokens = await exchangeCodeForTokens({
    clientId: 'id',
    clientSecret: 'secret',
    code: 'the-code',
  });

  assert.equal(calledUrl, 'https://www.strava.com/oauth/token');
  assert.equal(calledBody.grant_type, 'authorization_code');
  assert.equal(calledBody.code, 'the-code');
  assert.deepEqual(tokens, {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expires_at: 1_700_000_000,
    athlete: { id: 42, firstname: 'Ada', lastname: 'Lovelace' },
  });
});

test('refreshAccessToken posts the refresh_token grant', async () => {
  let calledBody;
  globalThis.fetch = async (url, options) => {
    calledBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ access_token: 'access-2', refresh_token: 'refresh-2', expires_at: 1 }),
    };
  };

  await refreshAccessToken({ clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh-1' });

  assert.equal(calledBody.grant_type, 'refresh_token');
  assert.equal(calledBody.refresh_token, 'refresh-1');
});

test('token exchange throws with the HTTP status on a non-2xx response', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => 'invalid client' });

  await assert.rejects(
    () => exchangeCodeForTokens({ clientId: 'id', clientSecret: 'secret', code: 'bad' }),
    /Strava token HTTP 400/,
  );
});

test('fetchRecentActivities sends a bearer token and returns the parsed list', async () => {
  let calledHeaders;
  globalThis.fetch = async (url, options) => {
    calledHeaders = options.headers;
    return { ok: true, json: async () => [{ id: 1 }] };
  };

  const activities = await fetchRecentActivities('token-abc', { perPage: 5 });

  assert.equal(calledHeaders.authorization, 'Bearer token-abc');
  assert.deepEqual(activities, [{ id: 1 }]);
});

test('fetchAthlete throws on a non-2xx response', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(() => fetchAthlete('token-abc'), /Strava API HTTP 401/);
});

// --- auth.js -------------------------------------------------------------------

test('hasStoredTokens reflects whether the config carries a refresh token', () => {
  assert.equal(hasStoredTokens({}), false);
  assert.equal(hasStoredTokens({ refresh_token: 'r' }), true);
});

test('getValidAccessToken throws when nothing was ever connected', async () => {
  const gladys = createFakeGladys();
  await assert.rejects(() => getValidAccessToken(gladys, {}), /Not connected to Strava/);
});

test('getValidAccessToken hydrates the in-memory cache from a persisted config', async () => {
  const gladys = createFakeGladys();
  const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
  const token = await getValidAccessToken(gladys, {
    access_token: 'persisted-access',
    refresh_token: 'persisted-refresh',
    expires_at: futureExpiry,
  });
  assert.equal(token, 'persisted-access');
  assert.equal(gladys.setConfigCalls.length, 0, 'a non-expired token must not trigger a refresh');
});

test('getValidAccessToken refreshes an expired token and persists the rotated pair', async () => {
  setTokens({
    access_token: 'stale',
    refresh_token: 'refresh-1',
    expires_at: Math.floor(Date.now() / 1000) - 10,
  });
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      access_token: 'fresh',
      refresh_token: 'refresh-2',
      expires_at: 9_999_999_999,
    }),
  });
  const gladys = createFakeGladys({ client_id: 'id', client_secret: 'secret' });

  const token = await getValidAccessToken(gladys, { client_id: 'id', client_secret: 'secret' });

  assert.equal(token, 'fresh');
  assert.equal(gladys.setConfigCalls.length, 1);
  assert.equal(gladys.setConfigCalls[0].access_token, 'fresh');
  assert.equal(gladys.setConfigCalls[0].refresh_token, 'refresh-2');
});

test('getValidAccessToken deduplicates concurrent refreshes into a single request', async () => {
  setTokens({
    access_token: 'stale',
    refresh_token: 'refresh-1',
    expires_at: Math.floor(Date.now() / 1000) - 10,
  });
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      json: async () => ({
        access_token: 'fresh',
        refresh_token: 'refresh-2',
        expires_at: 9_999_999_999,
      }),
    };
  };
  const gladys = createFakeGladys({ client_id: 'id', client_secret: 'secret' });

  const [a, b] = await Promise.all([
    getValidAccessToken(gladys, { client_id: 'id', client_secret: 'secret' }),
    getValidAccessToken(gladys, { client_id: 'id', client_secret: 'secret' }),
  ]);

  assert.equal(a, 'fresh');
  assert.equal(b, 'fresh');
  assert.equal(callCount, 1, 'only one HTTP refresh call for two concurrent callers');
});

test('getValidAccessToken clears the cache and reports the failure when the refresh is rejected', async () => {
  setTokens({
    access_token: 'stale',
    refresh_token: 'dead-refresh',
    expires_at: Math.floor(Date.now() / 1000) - 10,
  });
  globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => 'invalid_grant' });
  const gladys = createFakeGladys({ client_id: 'id', client_secret: 'secret' });

  await assert.rejects(() =>
    getValidAccessToken(gladys, { client_id: 'id', client_secret: 'secret' }),
  );

  assert.equal(gladys.connectionStatuses.at(-1).connected, false);
  // The cache was cleared: a later call needs the config again, not a stale token.
  await assert.rejects(() => getValidAccessToken(gladys, {}), /Not connected to Strava/);
});

// --- activities.js -----------------------------------------------------------

test('getRecentActivities reuses the cached response for the same token within the TTL', async () => {
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return { ok: true, json: async () => [{ id: callCount }] };
  };

  const first = await getRecentActivities('token-x');
  const second = await getRecentActivities('token-x');

  assert.equal(callCount, 1);
  assert.deepEqual(first, second);
});

test('getRecentActivities refetches when the token changes', async () => {
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return { ok: true, json: async () => [{ id: callCount }] };
  };

  await getRecentActivities('token-x');
  await getRecentActivities('token-y');

  assert.equal(callCount, 2);
});

test('summarizeActivities sums only the activities within the window', () => {
  const now = Date.now();
  const daysAgo = (days) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  const activities = [
    { start_date: daysAgo(1), distance: 5000, moving_time: 1500, total_elevation_gain: 50 },
    { start_date: daysAgo(3), distance: 10000, moving_time: 3000, total_elevation_gain: 100 },
    { start_date: daysAgo(20), distance: 20000, moving_time: 6000, total_elevation_gain: 200 },
  ];

  const last7Days = summarizeActivities(activities, { days: 7 });
  assert.equal(last7Days.count, 2);
  assert.equal(last7Days.distanceMeters, 15000);
  assert.equal(last7Days.movingTimeSeconds, 4500);
  assert.equal(last7Days.elevationGainMeters, 150);

  const last30Days = summarizeActivities(activities, { days: 30 });
  assert.equal(last30Days.count, 3);
});

test('unit conversions switch between metric and imperial', () => {
  assert.equal(round(distanceToUnit(10000, 'metric')), 10); // 10000 m -> 10 km
  assert.equal(round(distanceToUnit(1609.344, 'imperial')), 1); // -> 1 mile
  assert.equal(round(elevationToUnit(100, 'metric')), 100); // meters stay meters
  assert.equal(round(elevationToUnit(1, 'imperial')), 3.28); // 1 m -> ~3.28 ft
  assert.equal(round(speedToUnit(10, 'metric')), 36); // 10 m/s -> 36 km/h
  assert.equal(round(speedToUnit(10, 'imperial')), 22.37); // 10 m/s -> ~22.37 mph
});

test('round trims floating-point noise', () => {
  assert.equal(round(0.1 + 0.2), 0.3);
  assert.equal(round(1.005, 1), 1);
});
