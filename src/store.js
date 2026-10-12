// -----------------------------------------------------------------------------
// Local state, persisted under /data (the only writable volume of the
// container): what must survive a restart so that the scene triggers never
// fire twice — the activities already seen, the week whose goal was already
// celebrated — and the Strava webhook subscription.
//
// No secret here: the tokens live in the Gladys config (see src/config.js).
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const DEFAULT_DATA_DIR = '/data';
const FILE_NAME = 'strava-state.json';

// Activity ids remembered to detect new ones: far more than a refresh can see.
export const MAX_SEEN_ACTIVITIES = 200;

export const EMPTY_STATE = {
  // Athlete the state belongs to: linking another account starts over.
  athlete_id: null,
  // Ids of the activities already announced (or present at the first sync).
  seen_activities: null,
  // Monday (YYYY-MM-DD) of the last week whose goal fired the trigger.
  goal_reached_week: null,
  // Strava push subscription created by this integration.
  webhook: null,
};

export function createStore({ dir = process.env.STRAVA_DATA_DIR || DEFAULT_DATA_DIR } = {}) {
  const file = path.join(dir, FILE_NAME);
  let state = { ...EMPTY_STATE };

  return {
    get state() {
      return state;
    },

    async load() {
      try {
        state = { ...EMPTY_STATE, ...JSON.parse(await readFile(file, 'utf8')) };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Could not read ${file}, starting from a clean state: ${err.message}`);
        }
        state = { ...EMPTY_STATE };
      }
      return state;
    },

    /** Merge and persist; a write failure is logged, the memory copy kept. */
    async update(patch) {
      state = { ...state, ...patch };
      try {
        await mkdir(dir, { recursive: true });
        // Write then rename: a crash never leaves a half-written file.
        const tmp = `${file}.tmp`;
        await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
        await rename(tmp, file);
      } catch (err) {
        logger.warn(`Could not write ${file}: ${err.message}`);
      }
      return state;
    },
  };
}
