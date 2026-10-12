// -----------------------------------------------------------------------------
// The whole integration against the SDK's fake Gladys and the fake Strava API,
// with its /data state in a temporary directory.
// -----------------------------------------------------------------------------

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { createStore } from '../../src/store.js';
import { NOW, createFakeStrava, linkedConfig } from './fakeStrava.js';

/**
 * @param {import('node:test').TestContext} t
 * @param {object} [options]
 * @param {object|null} [options.config] - Gladys config (default: a linked account).
 * @param {object} [options.webhooks] - Gladys Plus webhook state.
 * @param {boolean} [options.connect] - Connect right away (default true).
 */
export async function setup(t, { config = linkedConfig(), webhooks, connect = true } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'gladys-strava-'));
  const clock = { now: NOW };
  const strava = createFakeStrava({ now: () => clock.now });
  const gladys = createFakeGladys({ config: config ?? {}, webhooks });
  const app = createApp(gladys, {
    fetch: strava.fetch,
    now: () => clock.now,
    store: createStore({ dir }),
    webhookDelayMs: 0,
  });
  t.after(async () => {
    app.shutdown();
    await rm(dir, { recursive: true, force: true });
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, strava, app, ctx: app.ctx, clock, dir };
}

/** Let the timers of 0 ms and the promises they start run. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
