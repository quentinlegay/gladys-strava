import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { FEATURE, athleteIds } from '../src/athlete.js';
import { TRIGGERS } from '../src/triggers.js';
import { ATHLETE, activity, linkedConfig } from './helpers/fakeStrava.js';
import { setup } from './helpers/setup.js';

const feature = (gladys, key) => athleteIds(gladys, ATHLETE.id).feature(key);

test('on connection, the athlete device, its states and the status are published', async (t) => {
  const { gladys } = await setup(t);
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.name, 'Strava Ada Lovelace');
  assert.equal(device.external_id, athleteIds(gladys, ATHLETE.id).device);
  assert.equal(device.features.length, Object.keys(FEATURE).length);

  assert.equal(gladys.fake.lastState(feature(gladys, FEATURE.WEEK_DISTANCE)), 52.2);
  assert.equal(gladys.fake.lastState(feature(gladys, FEATURE.LAST_ACTIVITY_DISTANCE)), 10.2);
  assert.equal(gladys.fake.lastState(feature(gladys, FEATURE.LAST_ACTIVITY_MOVING_TIME)), 52);
  assert.equal(gladys.fake.lastState(feature(gladys, FEATURE.YEAR_RUN_DISTANCE)), 820);
  const name = gladys.fake.states.find(
    (s) => s.device_feature_external_id === feature(gladys, FEATURE.LAST_ACTIVITY_NAME),
  );
  assert.equal(name.text, 'Evening Run');

  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: device.external_id,
    transport: 'cloud',
  });
});

test('every feature declares the numeric min and max Gladys requires', async (t) => {
  // Gladys refuses a feature without them (422 "min cannot be null"), text
  // features included; the fake Gladys of the SDK does not check it.
  const { gladys } = await setup(t);
  for (const imperial of [false, true]) {
    if (imperial) {
      await gladys.fake.configUpdated({ ...gladys.fake.config, units: 'imperial' });
    }
    for (const f of gladys.fake.discoveredDevices[0].features) {
      assert.equal(typeof f.min, 'number', `${f.name}: min`);
      assert.equal(typeof f.max, 'number', `${f.name}: max`);
      assert.ok(f.min <= f.max, `${f.name}: min <= max`);
    }
  }
});

test('the activities present at the first sync are not announced', async (t) => {
  const { gladys } = await setup(t);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('a new activity fires new_activity, and personal_record when it beats one', async (t) => {
  const { gladys, strava, ctx } = await setup(t);
  strava.data.activities.unshift(
    activity({
      id: 102,
      name: 'Tempo run',
      sport_type: 'Run',
      start_date: '2026-10-14T16:00:00Z',
      start_date_local: '2026-10-14T18:00:00Z',
      distance: 8000,
      moving_time: 2400,
      total_elevation_gain: 40,
      average_speed: 3.33,
      pr_count: 2,
    }),
  );
  const result = await ctx.sync.refresh();
  assert.equal(result.newActivities, 1);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.NEW_ACTIVITY, TRIGGERS.PERSONAL_RECORD],
  );
  assert.deepEqual(gladys.fake.sceneEvents[0].data, {
    sport: 'run',
    sport_type: 'Run',
    name: 'Tempo run',
    distance: 8,
    distance_unit: 'km',
    moving_time: 40,
    elevation_gain: 40,
    average_speed: 12,
    pr_count: 2,
    activity_id: '102',
    url: 'https://www.strava.com/activities/102',
  });

  // Announced once: the next refresh finds nothing new.
  await ctx.sync.refresh();
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('several new activities are announced oldest first', async (t) => {
  const { gladys, strava, ctx } = await setup(t);
  strava.data.activities.unshift(
    activity({ id: 104, name: 'Second', start_date: '2026-10-14T17:00:00Z' }),
    activity({ id: 103, name: 'First', start_date: '2026-10-14T07:00:00Z' }),
  );
  await ctx.sync.refresh();
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.data.name),
    ['First', 'Second'],
  );
});

test('the activities already seen survive a restart', async (t) => {
  const { dir, strava } = await setup(t);
  const state = JSON.parse(await readFile(path.join(dir, 'strava-state.json'), 'utf8'));
  assert.deepEqual(state.seen_activities, ['101', '100', '99', '98']);
  assert.equal(state.athlete_id, '4242');
  assert.ok(strava.requests.length > 0);
});

test('the weekly goal fires once, when the distance of the week reaches it', async (t) => {
  const { gladys, strava, ctx } = await setup(t, { config: linkedConfig({ weekly_goal: 60 }) });
  assert.equal(gladys.fake.sceneEvents.length, 0, '52.2 km < 60 km');

  strava.data.activities.unshift(
    activity({
      id: 105,
      sport_type: 'Ride',
      start_date: '2026-10-14T12:00:00Z',
      start_date_local: '2026-10-14T14:00:00Z',
      distance: 20000,
    }),
  );
  await ctx.sync.refresh();
  const goal = gladys.fake.sceneEvents.find((e) => e.key === TRIGGERS.WEEKLY_GOAL_REACHED);
  assert.deepEqual(goal.data, {
    goal_type: 'distance',
    goal: 60,
    goal_unit: 'km',
    week_distance: 72.2,
    distance_unit: 'km',
    week_hours: 2.37,
    week_activities: 3,
  });

  await ctx.sync.refresh();
  assert.equal(
    gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.WEEKLY_GOAL_REACHED).length,
    1,
  );
});

test('a time goal fires once, when the moving time of the week reaches it', async (t) => {
  const { gladys, strava, ctx } = await setup(t, {
    config: linkedConfig({ weekly_goal_type: 'time', weekly_goal: 3 }),
  });
  assert.equal(gladys.fake.sceneEvents.length, 0, '2h22 < 3 h');

  strava.data.activities.unshift(
    activity({
      id: 105,
      sport_type: 'Run',
      start_date: '2026-10-14T12:00:00Z',
      start_date_local: '2026-10-14T14:00:00Z',
      distance: 8000,
      moving_time: 2400,
    }),
  );
  await ctx.sync.refresh();
  const goal = gladys.fake.sceneEvents.find((e) => e.key === TRIGGERS.WEEKLY_GOAL_REACHED);
  assert.deepEqual(goal.data, {
    goal_type: 'time',
    goal: 3,
    goal_unit: 'h',
    week_distance: 60.2,
    distance_unit: 'km',
    week_hours: 3.03,
    week_activities: 3,
  });

  await ctx.sync.refresh();
  assert.equal(
    gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.WEEKLY_GOAL_REACHED).length,
    1,
  );
});

test('a goal already reached at the first sync is not announced', async (t) => {
  const { gladys } = await setup(t, { config: linkedConfig({ weekly_goal: 10 }) });
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('without application, the status asks for it and Strava is never called', async (t) => {
  const { gladys, strava } = await setup(t, { config: {} });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Client ID/);
  assert.equal(strava.requests.length, 0);
});

test('the OAuth2 flow links the account and starts the sync', async (t) => {
  const { gladys, strava } = await setup(t, {
    config: { client_id: '1234', client_secret: 'app-secret' },
  });
  assert.match(gladys.fake.connectionStatus.message.en, /Connect/);

  const { data } = await gladys.fake.oauthAuthorizeUrl('strava_account', 'http://gladys.local/cb');
  const state = new URL(data.authorize_url).searchParams.get('state');
  assert.ok(state);

  const ack = await gladys.fake.oauthCallback('strava_account', {
    code: 'good-code',
    state,
    redirectUri: 'http://gladys.local/cb',
  });
  assert.equal(ack.success, true);
  assert.equal(gladys.fake.config.refresh_token, 'refresh-2');
  assert.equal(gladys.fake.config.athlete_id, '4242');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  assert.ok(strava.requests.some((r) => r.path === '/api/v3/athlete/activities'));
});

test('the OAuth2 callback refuses an unknown state', async (t) => {
  const { gladys } = await setup(t, { config: { client_id: '1234', client_secret: 'app-secret' } });
  const ack = await gladys.fake.oauthCallback('strava_account', {
    code: 'good-code',
    state: 'forged',
  });
  assert.equal(ack.success, false);
  assert.equal(gladys.fake.config.refresh_token, undefined);
});

test('Connect without an application explains what is missing', async (t) => {
  const { gladys } = await setup(t, { config: {} });
  const ack = await gladys.fake.oauthAuthorizeUrl('strava_account', 'http://gladys.local/cb');
  assert.equal(ack.success, false);
  assert.match(ack.error, /Client ID/);
});

test('a revoked access is reported in the status and the transport badge', async (t) => {
  const { gladys, strava, ctx } = await setup(t);
  strava.data.validAccessTokens = new Set();
  strava.data.validRefreshToken = 'nothing';
  await assert.rejects(ctx.sync.refresh(), { code: 'AUTH_REVOKED' });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Connect/);
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
});

test('a rate limit degrades the badge, and the next refresh recovers', async (t) => {
  const { gladys, strava, ctx } = await setup(t);
  strava.failNext(429, '/stats');
  await assert.rejects(ctx.sync.refresh(), { code: 'RATE_LIMITED' });
  const degraded = gladys.fake.transports.at(-1);
  assert.equal(degraded.transport, 'cloud');
  assert.equal(degraded.degraded, true);
  assert.equal(gladys.fake.connectionStatus.connected, true, 'still linked');

  await ctx.sync.refresh();
  assert.equal(gladys.fake.transports.at(-1).degraded, undefined);
});

test('switching to imperial units re-publishes the device and the values', async (t) => {
  const { gladys } = await setup(t);
  await gladys.fake.configUpdated({ ...gladys.fake.config, units: 'imperial' });
  const [device] = gladys.fake.discoveredDevices;
  const weekFeature = device.features.find(
    (f) => f.external_id === feature(gladys, FEATURE.WEEK_DISTANCE),
  );
  assert.equal(weekFeature.unit, 'mile');
  assert.equal(gladys.fake.lastState(feature(gladys, FEATURE.WEEK_DISTANCE)), 32.44);
});

test('a config echo carrying older tokens keeps the newest ones', async (t) => {
  const { gladys, ctx, clock } = await setup(t);
  clock.now += 7 * 3600 * 1000; // the access token expired
  await ctx.sync.refresh();
  assert.equal(ctx.getConfig().refresh_token, 'refresh-2');
  await gladys.fake.configUpdated(linkedConfig());
  assert.equal(ctx.getConfig().refresh_token, 'refresh-2');
});

test('the scan re-publishes the device', async (t) => {
  const { gladys } = await setup(t);
  const before = gladys.fake.requests.filter((r) => r.path === '/discovered_device').length;
  await gladys.fake.scanRequest();
  const after = gladys.fake.requests.filter((r) => r.path === '/discovered_device').length;
  assert.equal(after, before + 1);
});

test('unlinking revokes the access, clears the tokens and forgets the state', async (t) => {
  const { gladys, strava } = await setup(t);
  const ack = await gladys.fake.action('disconnect');
  assert.equal(ack.success, true);
  assert.ok(strava.requests.some((r) => r.path === '/oauth/deauthorize'));
  assert.equal(gladys.fake.config.refresh_token, '');
  assert.equal(gladys.fake.connectionStatus.connected, false);
});

test('the manifest actions answer translated messages', async (t) => {
  const { gladys } = await setup(t);
  const test = await gladys.fake.action('test_connection');
  assert.equal(test.success, true);
  assert.match(test.data.message.en, /Ada Lovelace: 2 activities, 52\.2 km this week/);
  assert.ok(test.data.message.fr && test.data.message.de && test.data.message.es);
  const sync = await gladys.fake.action('sync_now');
  assert.match(sync.data.message.en, /0 new activities/);
});
