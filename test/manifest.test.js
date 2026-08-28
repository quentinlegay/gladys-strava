// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEVICE_BLUEPRINTS } from '../src/devices/index.js';
import { DEFAULT_CONFIG } from '../src/config.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

// Actions registered outside the blueprints (see index.js). The Strava
// integration has none: `test_connection` lives on the latestActivity
// blueprint, and OAuth2 (`onOAuthAuthorizeUrl`/`onOAuthCallback`) is not a
// manifest `actions` entry.
const REGISTRY_LEVEL_ACTIONS = [];

test('every manifest action has a registered handler', () => {
  const handled = new Set([
    ...DEVICE_BLUEPRINTS.flatMap((bp) => Object.keys(bp.actions ?? {})),
    ...REGISTRY_LEVEL_ACTIONS,
  ]);
  for (const action of manifest.actions ?? []) {
    assert.ok(handled.has(action.key), `manifest action "${action.key}" has no handler`);
  }
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  // The store vocabulary itself is checked by the store validator (unknown
  // keys are dropped with a warning there) — what this test pins is the
  // coupling rule: older cores reject any unknown manifest field, so a
  // manifest declaring `categories` must not claim compatibility below the
  // first release that accepts it.
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  const minVersion = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.\d+/);
  assert.ok(minVersion, 'gladys_version must declare a minimum version');
  const [, major, minor] = minVersion.map(Number);
  assert.ok(
    major > 4 || (major === 4 && minor >= 86),
    `categories requires gladys_version >= 4.86.0, got "${manifest.gladys_version}"`,
  );
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(
    sections.length > 0,
    'the onboarding section explains how to create a Strava API application',
  );
  for (const section of sections) {
    // A section stores NO value: declaring `required`, `default` or
    // `placeholder` on it rejects the manifest, and its key must never leak
    // into the config the code manipulates.
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(
      section.placeholder,
      undefined,
      `section "${section.key}" must not have a placeholder`,
    );
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(
      !(section.key in DEFAULT_CONFIG),
      `section "${section.key}" stores no value and must not appear in DEFAULT_CONFIG`,
    );
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('the OAuth2 field is well-formed and required credentials have no default', () => {
  const oauthFields = manifest.config_schema.filter((f) => f.type === 'oauth2');
  assert.equal(
    oauthFields.length,
    1,
    'exactly one oauth2 field drives the "Connect to Strava" button',
  );
  assert.ok(oauthFields[0].label?.en, 'the oauth2 field needs an English label');

  for (const key of ['client_id', 'client_secret']) {
    const field = manifest.config_schema.find((f) => f.key === key);
    assert.ok(field, `manifest must declare the "${key}" field`);
    assert.equal(field.required, true, `"${key}" is required to build the Strava authorize URL`);
    assert.equal(field.default, undefined, `"${key}" is user-specific and must have no default`);
  }

  assert.equal(
    manifest.config_schema.find((f) => f.key === 'client_secret').type,
    'secret',
    'the client secret must use the "secret" field type, never plain "string"',
  );
});

test('every device feature category declared by a blueprint is a recognized SDK constant', async () => {
  const { DEVICE_FEATURE_CATEGORIES } = await import('@gladysassistant/integration-sdk');
  const knownCategories = new Set(Object.values(DEVICE_FEATURE_CATEGORIES));
  const { normalizeConfig } = await import('../src/config.js');
  const { createFakeGladys } = await import('./helpers/fakeGladys.js');
  const gladys = createFakeGladys();
  const config = normalizeConfig();
  for (const bp of DEVICE_BLUEPRINTS) {
    const device = bp.buildDevice(gladys, config);
    for (const feature of device.features) {
      assert.ok(
        knownCategories.has(feature.category),
        `${bp.key}: unknown feature category "${feature.category}"`,
      );
    }
  }
});
