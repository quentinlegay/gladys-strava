// -----------------------------------------------------------------------------
// Scene triggers (SDK v0.14+, Gladys 5.1+): what HAPPENED on Strava.
//
// Each key is declared in the manifest `scene_triggers` field (filters in
// `fields`, values exposed to the scene in `variables`) and fired with
// `gladys.publishSceneEvent(key, data)` by src/sync.js — once per transition,
// never twice for the same activity or the same week (src/store.js).
//
// `data` is flat (≤ 30 primitive keys) and only the keys declared in the
// manifest are kept by the core: test/triggers.test.js checks both sides.
// Keys are forever: scenes store them.
// -----------------------------------------------------------------------------

import {
  activityUrl,
  distanceUnit,
  toDistance,
  toElevation,
  toMinutes,
  toSpeed,
} from './strava/summary.js';

export const TRIGGERS = {
  NEW_ACTIVITY: 'new_activity',
  PERSONAL_RECORD: 'personal_record',
  WEEKLY_GOAL_REACHED: 'weekly_goal_reached',
};

export const TRIGGER_KEYS = Object.values(TRIGGERS);

/** Event data of `new_activity`, values in the user's unit system. */
export function newActivityEvent(activity, config) {
  const units = config.units;
  return {
    sport: activity.sport,
    sport_type: activity.sport_type,
    name: activity.name,
    distance: toDistance(activity.distance, units),
    distance_unit: distanceUnit(units),
    moving_time: toMinutes(activity.moving_time),
    elevation_gain: toElevation(activity.elevation_gain, units),
    average_speed: toSpeed(activity.average_speed, units),
    pr_count: activity.pr_count,
    activity_id: activity.id,
    url: activityUrl(activity.id),
  };
}

/** Event data of `personal_record`: an activity with at least one PR. */
export function personalRecordEvent(activity) {
  return {
    sport: activity.sport,
    sport_type: activity.sport_type,
    name: activity.name,
    pr_count: activity.pr_count,
    activity_id: activity.id,
    url: activityUrl(activity.id),
  };
}

/** Event data of `weekly_goal_reached`. */
export function weeklyGoalEvent(weekDistance, weekCount, config) {
  return {
    week_distance: weekDistance,
    goal: config.weekly_goal,
    distance_unit: distanceUnit(config.units),
    week_activities: weekCount,
  };
}
