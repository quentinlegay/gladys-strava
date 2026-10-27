import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, hasApplication, isLinked, normalizeConfig } from '../src/config.js';

test('normalizeConfig applies the defaults', () => {
  const config = normalizeConfig();
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    assert.equal(config[key], value, key);
  }
});

test('normalizeConfig forces the types and the bounds', () => {
  const config = normalizeConfig({
    client_id: ' 1234 ',
    units: 'imperial',
    refresh_interval: '1',
    weekly_goal: '42.5',
    expires_at: '1700000000000',
  });
  assert.equal(config.client_id, '1234');
  assert.equal(config.units, 'imperial');
  assert.equal(config.refresh_interval, 5, 'never faster than 5 minutes');
  assert.equal(config.weekly_goal, 42.5);
  assert.equal(config.expires_at, 1700000000000);
  assert.equal(normalizeConfig({ refresh_interval: 9999 }).refresh_interval, 240);
  assert.equal(normalizeConfig({ refresh_interval: 'abc' }).refresh_interval, 15);
  assert.equal(normalizeConfig({ units: 'parsecs' }).units, 'metric');
  assert.equal(normalizeConfig({ weekly_goal: -3 }).weekly_goal, 0);
  assert.equal(normalizeConfig({ weekly_goal_type: 'time' }).weekly_goal_type, 'time');
  assert.equal(normalizeConfig({ weekly_goal_type: 'laps' }).weekly_goal_type, 'distance');
});

test('an account is linked once the application and a refresh token exist', () => {
  assert.equal(hasApplication(normalizeConfig({ client_id: '1' })), false);
  const app = normalizeConfig({ client_id: '1', client_secret: 's' });
  assert.equal(hasApplication(app), true);
  assert.equal(isLinked(app), false);
  assert.equal(isLinked({ ...app, refresh_token: 'r' }), true);
});
