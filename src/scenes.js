// -----------------------------------------------------------------------------
// Scene actions (SDK v0.14+, Gladys 5.1+): operations a scene author places in
// a scene. Each one is declared in the manifest `scene_actions` field and
// handled here under the same key; src/app.js registers them with
// `gladys.onSceneAction(key, ...)`.
//
//   - `fields` arrive RESOLVED (scene variables substituted, defaults applied);
//   - resolve the declared `outputs` (scalars), readable by the following
//     actions of the scene as {{<column>.<row>.<key>}};
//   - throwing fails this action only. A missing account is an output
//     (`linked: false`), not a failure: a scene action is never a condition.
//   - no loop: "Sync now" runs the same refresh as the timer, which announces
//     each activity once (src/store.js remembers them). A scene started by
//     `new_activity` that calls "Sync now" finds nothing new to announce.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isLinked } from './config.js';
import {
  activityUrl,
  distanceUnit,
  periodTotals,
  toDistance,
  toElevation,
  toMinutes,
} from './strava/summary.js';

const logger = createLogger({ name: 'scenes' });

export const PERIODS = ['week', 'recent', 'year', 'all'];
export const STAT_SPORTS = ['all', 'run', 'ride', 'swim'];

// Data at most this old is served without calling Strava again.
const MAX_AGE_MS = 5 * 60 * 1000;

const notLinked = (outputs) => ({ linked: false, ...outputs });

export const SCENE_ACTIONS = {
  async sync_now(ctx) {
    logger.info('Scene action sync_now');
    if (!isLinked(ctx.getConfig())) {
      return notLinked({ new_activities: 0 });
    }
    const result = await ctx.sync.refresh({ reason: 'scene' });
    return { linked: true, new_activities: result?.newActivities ?? 0 };
  },

  async get_stats(ctx, { fields }) {
    const period = PERIODS.includes(fields.period) ? fields.period : 'week';
    const sport = STAT_SPORTS.includes(fields.sport) ? fields.sport : 'all';
    logger.info(`Scene action get_stats (${period}, ${sport})`);
    const config = ctx.getConfig();
    const empty = {
      count: 0,
      distance: 0,
      moving_time: 0,
      elevation_gain: 0,
      distance_unit: distanceUnit(config.units),
    };
    if (!isLinked(config)) {
      return notLinked(empty);
    }
    const snapshot = await ctx.sync.ensureSnapshot({ maxAgeMs: MAX_AGE_MS });
    const totals = periodTotals(snapshot, period, sport);
    return {
      linked: true,
      count: totals.count,
      distance: toDistance(totals.distance, config.units),
      moving_time: toMinutes(totals.moving_time),
      elevation_gain: toElevation(totals.elevation_gain, config.units),
      distance_unit: distanceUnit(config.units),
    };
  },

  async get_last_activity(ctx) {
    logger.info('Scene action get_last_activity');
    const config = ctx.getConfig();
    if (!isLinked(config)) {
      return notLinked({ found: false });
    }
    const snapshot = await ctx.sync.ensureSnapshot({ maxAgeMs: MAX_AGE_MS });
    const last = snapshot.activities[0];
    if (!last) {
      return { linked: true, found: false };
    }
    return {
      linked: true,
      found: true,
      name: last.name,
      sport_type: last.sport_type,
      distance: toDistance(last.distance, config.units),
      distance_unit: distanceUnit(config.units),
      moving_time: toMinutes(last.moving_time),
      elevation_gain: toElevation(last.elevation_gain, config.units),
      start_date: last.start_date,
      url: activityUrl(last.id),
    };
  },
};
