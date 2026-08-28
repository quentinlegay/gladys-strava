import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_BLUEPRINTS,
  buildDiscoveredDevices,
  findBlueprintByDevice,
} from '../src/devices/index.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { setTokens, clearTokens } from '../src/strava/auth.js';
import { clearActivitiesCache } from '../src/strava/activities.js';

const gladys = createFakeGladys();
const config = normalizeConfig();

const realFetch = globalThis.fetch;
function withStravaSession(activitiesResponse) {
  setTokens({
    access_token: 'fake-token',
    refresh_token: 'fake-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  clearActivitiesCache();
  globalThis.fetch = async () => ({ ok: true, json: async () => activitiesResponse });
}
function endStravaSession() {
  globalThis.fetch = realFetch;
  clearTokens();
  clearActivitiesCache();
}

test('every blueprint exposes the required shape', () => {
  for (const bp of DEVICE_BLUEPRINTS) {
    assert.equal(typeof bp.key, 'string', 'key must be a string');
    assert.equal(typeof bp.deviceExternalId, 'function', 'deviceExternalId must be a function');
    assert.equal(typeof bp.buildDevice, 'function', 'buildDevice must be a function');
  }
});

test('buildDiscoveredDevices returns one payload per blueprint', () => {
  const devices = buildDiscoveredDevices(gladys, config);
  assert.equal(devices.length, DEVICE_BLUEPRINTS.length);
  for (const device of devices) {
    assert.equal(typeof device.name, 'string');
    assert.ok(device.external_id, 'each device has an external_id');
    assert.ok(Array.isArray(device.features) && device.features.length > 0);
    for (const feature of device.features) {
      assert.equal(feature.read_only, true, 'Strava activities are read-only in Gladys');
    }
  }
});

test('device external_ids are unique across the catalog', () => {
  const devices = buildDiscoveredDevices(gladys, config);
  const ids = devices.map((d) => d.external_id);
  assert.equal(new Set(ids).size, ids.length, 'no two devices may share an external_id');
});

test('feature external_ids are unique within and across devices', () => {
  const devices = buildDiscoveredDevices(gladys, config);
  const featureIds = devices.flatMap((d) => d.features.map((f) => f.external_id));
  assert.equal(new Set(featureIds).size, featureIds.length);
});

test('findBlueprintByDevice routes an external_id back to its owner blueprint', () => {
  for (const bp of DEVICE_BLUEPRINTS) {
    const external_id = bp.deviceExternalId(gladys);
    const found = findBlueprintByDevice(gladys, { external_id });
    assert.equal(found, bp);
  }
});

test('findBlueprintByDevice returns undefined for an unknown device', () => {
  const found = findBlueprintByDevice(gladys, { external_id: 'does-not-exist' });
  assert.equal(found, undefined);
});

test('manifest action keys are unique across blueprints', () => {
  const keys = DEVICE_BLUEPRINTS.flatMap((bp) => Object.keys(bp.actions ?? {}));
  assert.equal(new Set(keys).size, keys.length, 'no two blueprints may register the same action');
});

test('the latest-activity device publishes the most recent activity, converted to the configured unit system', async () => {
  withStravaSession([
    {
      name: 'Morning Run',
      sport_type: 'Run',
      distance: 10000, // 10 km
      moving_time: 3000, // 50 min
      total_elevation_gain: 120,
      average_speed: 3, // 10.8 km/h
      start_date_local: '2026-08-20T07:00:00',
    },
  ]);
  try {
    const latestActivity = DEVICE_BLUEPRINTS.find((bp) => bp.key === 'strava-latest-activity');
    const fakeGladys = createFakeGladys();
    await latestActivity.onPoll(fakeGladys, normalizeConfig());

    const byId = Object.fromEntries(fakeGladys.published.map((p) => [p.featureExternalId, p]));
    assert.equal(byId['strava-latest-activity:latest:name'].text, 'Morning Run');
    assert.equal(byId['strava-latest-activity:latest:sport-type'].text, 'Run');
    assert.equal(byId['strava-latest-activity:latest:distance'].state, 10);
    assert.equal(byId['strava-latest-activity:latest:moving-time'].state, 50);
    assert.equal(byId['strava-latest-activity:latest:elevation-gain'].state, 120);
    assert.equal(byId['strava-latest-activity:latest:average-speed'].state, 10.8);
    assert.equal(byId['strava-latest-activity:latest:start-date'].text, '2026-08-20T07:00:00');
  } finally {
    endStravaSession();
  }
});

test('the latest-activity device does nothing when the athlete has no activity yet', async () => {
  withStravaSession([]);
  try {
    const latestActivity = DEVICE_BLUEPRINTS.find((bp) => bp.key === 'strava-latest-activity');
    const fakeGladys = createFakeGladys();
    await latestActivity.onPoll(fakeGladys, normalizeConfig());
    assert.equal(fakeGladys.published.length, 0);
  } finally {
    endStravaSession();
  }
});

test('the training-totals device sums activities within each rolling window', async () => {
  const now = Date.now();
  const daysAgo = (days) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  withStravaSession([
    { start_date: daysAgo(1), distance: 5000, moving_time: 1500, total_elevation_gain: 50 },
    { start_date: daysAgo(3), distance: 10000, moving_time: 3000, total_elevation_gain: 100 },
    { start_date: daysAgo(20), distance: 20000, moving_time: 6000, total_elevation_gain: 200 },
  ]);
  try {
    const stats = DEVICE_BLUEPRINTS.find((bp) => bp.key === 'strava-stats');
    const fakeGladys = createFakeGladys();
    await stats.onPoll(fakeGladys, normalizeConfig());

    const byId = Object.fromEntries(fakeGladys.published.map((p) => [p.featureExternalId, p]));
    assert.equal(byId['strava-stats:summary:activities-7d'].state, 2);
    assert.equal(byId['strava-stats:summary:distance-7d'].state, 15);
    assert.equal(byId['strava-stats:summary:activities-30d'].state, 3);
    assert.equal(byId['strava-stats:summary:distance-30d'].state, 35);
  } finally {
    endStravaSession();
  }
});

test('the test_connection action returns a multi-language message with the athlete name', async () => {
  withStravaSession([]);
  const realFetchInner = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/athlete')) {
      return { ok: true, json: async () => ({ id: 1, firstname: 'Ada', lastname: 'Lovelace' }) };
    }
    return realFetchInner(url);
  };
  try {
    const latestActivity = DEVICE_BLUEPRINTS.find((bp) => bp.key === 'strava-latest-activity');
    const fakeGladys = createFakeGladys();
    const message = await latestActivity.actions.test_connection(fakeGladys, {
      fields: {},
      config: normalizeConfig(),
    });
    assert.match(message.en, /Ada Lovelace/);
    assert.match(message.fr, /Ada Lovelace/);
  } finally {
    endStravaSession();
  }
});
