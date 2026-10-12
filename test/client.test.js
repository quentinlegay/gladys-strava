import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { StravaClient, buildAuthorizeUrl } from '../src/strava/client.js';
import { NOW, createFakeStrava, linkedConfig } from './helpers/fakeStrava.js';

function setup(overrides) {
  const strava = createFakeStrava();
  let config = normalizeConfig(linkedConfig(overrides));
  const saved = [];
  const client = new StravaClient({
    getConfig: () => config,
    onTokens: async (tokens) => {
      saved.push(tokens);
      config = normalizeConfig({ ...config, ...tokens });
    },
    fetch: strava.fetch,
    now: () => NOW,
  });
  return { strava, client, saved, config: () => config };
}

test('the authorization URL asks for the activity scopes and carries the state', () => {
  const url = new URL(
    buildAuthorizeUrl({ clientId: '1234', redirectUri: 'http://gladys.local/cb', state: 'xyz' }),
  );
  assert.equal(url.origin + url.pathname, 'https://www.strava.com/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), '1234');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://gladys.local/cb');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'read,activity:read_all');
  assert.equal(url.searchParams.get('state'), 'xyz');
});

test('a valid access token is used as is', async () => {
  const { strava, client } = setup();
  await client.getAthlete();
  assert.equal(strava.requests.length, 1);
  assert.equal(strava.requests[0].auth, 'Bearer access-1');
});

test('an access token about to expire is refreshed, and the new tokens saved first', async () => {
  const { strava, client, saved, config } = setup({ expires_at: NOW + 60_000 });
  const athlete = await client.getAthlete();
  assert.equal(athlete.id, 4242);
  assert.equal(strava.requests[0].path, '/oauth/token');
  assert.equal(strava.requests[0].form.grant_type, 'refresh_token');
  assert.equal(strava.requests[0].form.refresh_token, 'refresh-1');
  assert.deepEqual(saved, [
    { access_token: 'access-2', refresh_token: 'refresh-2', expires_at: NOW + 6 * 3600 * 1000 },
  ]);
  assert.equal(config().refresh_token, 'refresh-2', 'Strava rotates the refresh token');
  assert.equal(strava.requests[1].auth, 'Bearer access-2');
});

test('concurrent requests share a single refresh', async () => {
  const { strava, client } = setup({ expires_at: NOW - 1 });
  await Promise.all([client.getAthlete(), client.listActivities(), client.getAthleteStats(4242)]);
  assert.equal(strava.requests.filter((r) => r.path === '/oauth/token').length, 1);
});

test('a refused access token is refreshed once, then the call is retried', async () => {
  const { strava, client } = setup({ access_token: 'revoked' });
  await client.getAthlete();
  assert.deepEqual(
    strava.requests.map((r) => r.path),
    ['/api/v3/athlete', '/oauth/token', '/api/v3/athlete'],
  );
});

test('a refused refresh token means the access was revoked', async () => {
  const { client } = setup({ access_token: 'revoked', refresh_token: 'revoked' });
  await assert.rejects(client.getAthlete(), { code: 'AUTH_REVOKED' });
});

test('rate limits and network errors are typed', async () => {
  const { strava, client } = setup();
  strava.failNext(429);
  await assert.rejects(client.getAthlete(), { code: 'RATE_LIMITED', status: 429 });
  strava.failNext(0);
  await assert.rejects(client.getAthlete(), { code: 'NETWORK_ERROR' });
  strava.failNext(500);
  await assert.rejects(client.getAthlete(), { code: 'HTTP_ERROR', status: 500 });
});

test('the usage reported by Strava is remembered for the logs', async () => {
  const { client } = setup();
  await client.getAthlete();
  assert.equal(client.rateLimitUsage, '3,30');
});

test('without a linked account, nothing is sent', async () => {
  const { strava, client } = setup({ refresh_token: '' });
  await assert.rejects(client.getAthlete(), { code: 'NOT_LINKED' });
  assert.equal(strava.requests.length, 0);
});

test('the code exchange saves the tokens and the athlete id', async () => {
  const { client, saved } = setup({ access_token: '', refresh_token: '', athlete_id: '' });
  await client.exchangeCode('good-code');
  assert.equal(saved[0].athlete_id, '4242');
  assert.equal(saved[0].refresh_token, 'refresh-2');
  await assert.rejects(client.exchangeCode('bad-code'), { code: 'AUTH_REVOKED' });
});

test('the push subscription endpoints use the application credentials', async () => {
  const { strava, client } = setup();
  const created = await client.createSubscription('https://plus.example/hook', 'token');
  assert.deepEqual(await client.listSubscriptions(), [
    { id: created.id, callback_url: 'https://plus.example/hook' },
  ]);
  await client.deleteSubscription(created.id);
  assert.deepEqual(await client.listSubscriptions(), []);
  for (const request of strava.requests) {
    assert.equal(request.auth, undefined, 'no user token on the subscription endpoints');
    const credentials = request.method === 'POST' ? request.form : request.query;
    assert.equal(credentials.client_id, '1234');
    assert.equal(credentials.client_secret, 'app-secret');
  }
});
