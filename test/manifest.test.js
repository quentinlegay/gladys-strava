// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/actions.js';
import { DEFAULT_CONFIG, TOKEN_KEYS } from '../src/config.js';
import { OAUTH_KEY } from '../src/oauth.js';
import { PERIODS, SCENE_ACTIONS, STAT_SPORTS } from '../src/scenes.js';
import { SPORTS } from '../src/strava/summary.js';
import { TRIGGER_KEYS } from '../src/triggers.js';
import { WEBHOOK_KEY } from '../src/webhooks.js';
import { WIDGETS } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// Manifest fields older Gladys releases reject as unknown, with the first
// release accepting them. The store validator refuses a manifest whose
// `gladys_version` minimum is lower: these tests catch it before a release.
const CAPABILITY_FIELDS = ['scene_triggers', 'scene_actions', 'widgets'];
const CAPABILITY_MIN_GLADYS_VERSION = [5, 1, 0];
const CATEGORIES_MIN_GLADYS_VERSION = [4, 86, 0];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionsOf = (field) => field.options.map((option) => option.value);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
});

test('the oauth2 field and the webhook use the keys the code handles', () => {
  const oauth = manifest.config_schema.filter((field) => field.type === 'oauth2');
  assert.deepEqual(keysOf(oauth), [OAUTH_KEY]);
  assert.deepEqual(keysOf(manifest.webhooks), [WEBHOOK_KEY]);
  // Strava validates a subscription with a challenge the integration answers.
  assert.equal(manifest.webhooks[0].mode, 'sync');
});

test('Strava is a cloud service: the manifest declares the cloud transport only', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), CATEGORIES_MIN_GLADYS_VERSION));
});

test('declaring scene triggers, scene actions or widgets requires Gladys >= 5.1.0', () => {
  const declared = CAPABILITY_FIELDS.filter((field) => manifest[field] !== undefined);
  assert.deepEqual(declared, CAPABILITY_FIELDS);
  assert.ok(
    isAtLeast(minGladysVersion(), CAPABILITY_MIN_GLADYS_VERSION),
    `${declared.join(', ')} requires gladys_version >= 5.1.0, got "${manifest.gladys_version}"`,
  );
});

test('every scene_actions key has an onSceneAction handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widgets key has an onWidgetGet handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
});

test('every scene trigger the code fires is declared in scene_triggers, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), [...TRIGGER_KEYS].sort());
});

test('the select options match the values the code understands', () => {
  for (const trigger of manifest.scene_triggers) {
    for (const field of trigger.fields ?? []) {
      assert.deepEqual(optionsOf(field), SPORTS, `${trigger.key}.${field.key}`);
    }
  }
  const getStats = manifest.scene_actions.find((action) => action.key === 'get_stats');
  const field = (key) => getStats.fields.find((f) => f.key === key);
  assert.deepEqual(optionsOf(field('period')), PERIODS);
  assert.deepEqual(optionsOf(field('sport')), STAT_SPORTS);
  const recent = manifest.widgets.find((widget) => widget.key === 'recent_activities');
  const sport = recent.settings.find((f) => f.key === 'sport');
  assert.deepEqual(optionsOf(sport), ['all', ...SPORTS]);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
});

test('the tokens are stored outside the config_schema', () => {
  // Keys of the config_schema are shown in the UI: the tokens must never be.
  const formKeys = keysOf(manifest.config_schema);
  for (const key of TOKEN_KEYS) {
    assert.ok(!formKeys.includes(key), `${key} must not be a config_schema field`);
  }
  const secret = manifest.config_schema.find((field) => field.key === 'client_secret');
  assert.equal(secret.type, 'secret');
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined);
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  assert.ok(manifest.description.en, 'the description needs an English text');
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('every text is bilingual: English and French', () => {
  const texts = [];
  const walk = (node, where) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${where}[${i}]`));
    } else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (['label', 'description', 'placeholder'].includes(key)) {
          texts.push([`${where}.${key}`, value]);
        } else {
          walk(value, `${where}.${key}`);
        }
      }
    }
  };
  walk(manifest, 'manifest');
  assert.ok(texts.length > 50);
  for (const [where, text] of texts) {
    assert.equal(typeof text, 'object', `${where} must be a multi-language object`);
    for (const lang of ['en', 'fr', 'de', 'es']) {
      assert.ok(text[lang], `${where} needs a "${lang}" text`);
    }
  }
});

test('field placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en, `field "${field.key}": placeholder needs an English text`);
  }
});
