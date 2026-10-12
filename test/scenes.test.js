import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TRIGGERS } from '../src/triggers.js';
import { activity, linkedConfig } from './helpers/fakeStrava.js';
import { setup } from './helpers/setup.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function assertDeclaredOutputs(key, outputs) {
  const declared = keysOf(declarationOf('scene_actions', key).outputs);
  for (const [name, value] of Object.entries(outputs)) {
    assert.ok(declared.includes(name), `output "${name}" of ${key} is not declared`);
    assert.ok(value === null || typeof value !== 'object', `output "${name}" must be a scalar`);
  }
}

test('every scene event only carries keys its trigger declares', async (t) => {
  const { gladys, strava, ctx } = await setup(t, { config: linkedConfig({ weekly_goal: 55 }) });
  strava.data.activities.unshift(
    activity({
      id: 110,
      name: 'Race',
      start_date: '2026-10-14T08:00:00Z',
      start_date_local: '2026-10-14T10:00:00Z',
      distance: 5000,
      pr_count: 3,
    }),
  );
  await ctx.sync.refresh();
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.key).sort(),
    [...Object.values(TRIGGERS)].sort(),
    'the test exercises every trigger',
  );
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = declarationOf('scene_triggers', key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    assert.ok(Object.keys(data).length <= 30);
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${name} is a primitive`);
    }
    // Every declared variable is filled: the scene author can rely on it.
    for (const variable of trigger.variables) {
      assert.notEqual(data[variable.key], undefined, `${key}: ${variable.key} is missing`);
      assert.equal(typeof data[variable.key], variable.type, `${key}: ${variable.key} type`);
    }
  }
});

test('get_stats returns the totals of the period, in the user units', async (t) => {
  const { gladys } = await setup(t);
  const week = await gladys.fake.sceneAction('get_stats', { period: 'week', sport: 'all' });
  assert.equal(week.success, true);
  assert.deepEqual(week.data.outputs, {
    linked: true,
    count: 2,
    distance: 52.2,
    moving_time: 142,
    elevation_gain: 495,
    distance_unit: 'km',
  });
  assertDeclaredOutputs('get_stats', week.data.outputs);

  const year = await gladys.fake.sceneAction('get_stats', { period: 'year', sport: 'run' });
  assert.equal(year.data.outputs.distance, 820);
  assert.equal(year.data.outputs.count, 90);
});

test('get_last_activity describes the latest activity', async (t) => {
  const { gladys } = await setup(t);
  const { data } = await gladys.fake.sceneAction('get_last_activity');
  assert.deepEqual(data.outputs, {
    linked: true,
    found: true,
    name: 'Evening Run',
    sport_type: 'Run',
    distance: 10.2,
    distance_unit: 'km',
    moving_time: 52,
    elevation_gain: 85,
    start_date: '2026-10-13T17:00:00Z',
    url: 'https://www.strava.com/activities/101',
  });
  assertDeclaredOutputs('get_last_activity', data.outputs);
});

test('sync_now reports the new activities', async (t) => {
  const { gladys, strava } = await setup(t);
  strava.data.activities.unshift(activity({ id: 120, start_date: '2026-10-14T09:00:00Z' }));
  const { data } = await gladys.fake.sceneAction('sync_now');
  assert.deepEqual(data.outputs, { linked: true, new_activities: 1 });
  assertDeclaredOutputs('sync_now', data.outputs);
});

test('without a linked account, the scene actions say so instead of failing', async (t) => {
  const { gladys, strava } = await setup(t, { config: { client_id: '1', client_secret: 's' } });
  for (const key of ['sync_now', 'get_stats', 'get_last_activity']) {
    const ack = await gladys.fake.sceneAction(key, { period: 'week', sport: 'all' });
    assert.equal(ack.success, true, key);
    assert.equal(ack.data.outputs.linked, false, key);
    assertDeclaredOutputs(key, ack.data.outputs);
  }
  assert.equal(strava.requests.length, 0);
});
