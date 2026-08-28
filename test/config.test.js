import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig keeps user values over the defaults', () => {
  const config = normalizeConfig({ unit_system: 'imperial', poll_frequency: 1800 });
  assert.equal(config.unit_system, 'imperial');
  assert.equal(config.poll_frequency, 1800);
});

test('normalizeConfig coerces a numeric string coming from a form', () => {
  const config = normalizeConfig({ poll_frequency: '600' });
  assert.equal(config.poll_frequency, 600);
  assert.equal(typeof config.poll_frequency, 'number');
});

test('normalizeConfig falls back to the default for a missing numeric field', () => {
  const config = normalizeConfig({ unit_system: 'imperial' });
  assert.equal(config.poll_frequency, DEFAULT_CONFIG.poll_frequency);
});

test('normalizeConfig rejects an unknown unit_system value back to metric', () => {
  assert.equal(normalizeConfig({ unit_system: 'nonsense' }).unit_system, 'metric');
  assert.equal(normalizeConfig().unit_system, 'metric');
});

test('normalizeConfig passes internal-only keys through unchanged (OAuth tokens, out of config_schema)', () => {
  const config = normalizeConfig({
    client_id: 'abc',
    client_secret: 'def',
    access_token: 'tok',
    refresh_token: 'ref',
    expires_at: 123,
    athlete_name: 'Ada Lovelace',
  });
  assert.equal(config.client_id, 'abc');
  assert.equal(config.client_secret, 'def');
  assert.equal(config.access_token, 'tok');
  assert.equal(config.refresh_token, 'ref');
  assert.equal(config.expires_at, 123);
  assert.equal(config.athlete_name, 'Ada Lovelace');
});
