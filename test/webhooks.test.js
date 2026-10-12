import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEBHOOK_KEY } from '../src/webhooks.js';
import { TRIGGERS } from '../src/triggers.js';
import { ATHLETE, activity } from './helpers/fakeStrava.js';
import { flush, setup } from './helpers/setup.js';

const PLUS_URL = 'https://plus.example/webhook/abc/strava_events';
const plus = (url = PLUS_URL) => ({
  available: true,
  webhooks: [{ key: WEBHOOK_KEY, mode: 'sync', url }],
});

test('without Gladys Plus, no subscription is created', async (t) => {
  const { strava } = await setup(t);
  assert.deepEqual(strava.data.subscriptions, []);
  assert.ok(!strava.requests.some((r) => r.method === 'POST' && r.path.includes('push_')));
});

test('with Gladys Plus, the subscription points at its URL, created once', async (t) => {
  const { gladys, strava, ctx } = await setup(t, { webhooks: plus() });
  assert.deepEqual(strava.data.subscriptions, [{ id: 900, callback_url: PLUS_URL }]);
  assert.equal(ctx.store.state.webhook.id, 900);

  // Reconnection: the subscription is already in place.
  await gladys.disconnect();
  await gladys.connect();
  assert.equal(strava.data.subscriptions.length, 1);
});

test('a new Gladys Plus URL replaces the subscription; losing Plus removes it', async (t) => {
  const { gladys, strava } = await setup(t, { webhooks: plus() });
  await gladys.fake.webhookUpdated(plus('https://plus.example/webhook/new/strava_events'));
  assert.deepEqual(
    strava.data.subscriptions.map((s) => s.callback_url),
    ['https://plus.example/webhook/new/strava_events'],
  );
  await gladys.fake.webhookUpdated({ available: false, webhooks: [] });
  assert.deepEqual(strava.data.subscriptions, []);
});

test('the subscription challenge is answered only with our verify token', async (t) => {
  const { gladys, ctx } = await setup(t);
  await ctx.store.update({ webhook: { id: null, callback_url: PLUS_URL, verify_token: 'tok' } });
  const query = { 'hub.mode': 'subscribe', 'hub.challenge': 'ch-42', 'hub.verify_token': 'tok' };
  const ok = await gladys.fake.webhook(WEBHOOK_KEY, { method: 'GET', query }, { mode: 'sync' });
  assert.equal(ok.success, true);
  assert.equal(ok.data.status, 200);
  assert.deepEqual(JSON.parse(ok.data.body), { 'hub.challenge': 'ch-42' });

  const forged = await gladys.fake.webhook(
    WEBHOOK_KEY,
    { method: 'GET', query: { ...query, 'hub.verify_token': 'nope' } },
    { mode: 'sync' },
  );
  assert.equal(forged.data.status, 403);
});

test('an activity event triggers a refresh, which announces the new activity', async (t) => {
  const { gladys, strava } = await setup(t, { webhooks: plus() });
  strava.data.activities.unshift(activity({ id: 130, start_date: '2026-10-14T17:30:00Z' }));
  const event = {
    object_type: 'activity',
    object_id: 130,
    aspect_type: 'create',
    owner_id: ATHLETE.id,
    subscription_id: 900,
    event_time: 1791000000,
  };
  const ack = await gladys.fake.webhook(
    WEBHOOK_KEY,
    { method: 'POST', body: event, contentType: 'application/json' },
    { mode: 'sync' },
  );
  assert.equal(ack.data.status, 200);
  await flush();
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.NEW_ACTIVITY],
  );
});

test('an event for another subscription or athlete is ignored', async (t) => {
  const { gladys, strava } = await setup(t, { webhooks: plus() });
  const before = strava.requests.length;
  for (const event of [
    { object_type: 'activity', owner_id: ATHLETE.id, subscription_id: 1 },
    { object_type: 'activity', owner_id: 1, subscription_id: 900 },
  ]) {
    const ack = await gladys.fake.webhook(
      WEBHOOK_KEY,
      { method: 'POST', body: JSON.stringify(event) },
      { mode: 'sync' },
    );
    assert.equal(ack.data.status, 200, 'Strava always gets its 200');
  }
  await flush();
  assert.equal(strava.requests.length, before, 'no refresh');
});
