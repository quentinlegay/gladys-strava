// -----------------------------------------------------------------------------
// The Gladys device: one "Strava athlete" per linked account, with read-only
// sensor features (last activity, this week, last 4 weeks, this year).
//
// External ids are forever: they are built from the Strava athlete id, and the
// feature keys below are never renamed (Gladys keys the history, the scenes
// and the dashboards on them).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS_ENUM,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';
import { UNITS } from './config.js';
import {
  athleteName,
  periodTotals,
  sportTypeLabel,
  toDistance,
  toElevation,
  toMinutes,
  toSpeed,
} from './strava/summary.js';

export const DEVICE_TYPE = 'athlete';

export const FEATURE = {
  LAST_ACTIVITY_NAME: 'last_activity_name',
  LAST_ACTIVITY_SPORT: 'last_activity_sport',
  LAST_ACTIVITY_DISTANCE: 'last_activity_distance',
  LAST_ACTIVITY_MOVING_TIME: 'last_activity_moving_time',
  LAST_ACTIVITY_ELEVATION: 'last_activity_elevation',
  LAST_ACTIVITY_SPEED: 'last_activity_speed',
  WEEK_DISTANCE: 'week_distance',
  WEEK_MOVING_TIME: 'week_moving_time',
  RECENT_RUN_DISTANCE: 'recent_run_distance',
  RECENT_RIDE_DISTANCE: 'recent_ride_distance',
  RECENT_SWIM_DISTANCE: 'recent_swim_distance',
  YEAR_RUN_DISTANCE: 'year_run_distance',
  YEAR_RIDE_DISTANCE: 'year_ride_distance',
  YEAR_SWIM_DISTANCE: 'year_swim_distance',
};

export function athleteIds(gladys, athleteId) {
  return gladys.externalIds(DEVICE_TYPE, String(athleteId));
}

function units(config) {
  const imperial = config.units === UNITS.IMPERIAL;
  return {
    distance: imperial ? UNITS_ENUM.MILE : UNITS_ENUM.KM,
    elevation: imperial ? UNITS_ENUM.FEET : UNITS_ENUM.M,
    speed: imperial ? UNITS_ENUM.MILE_PER_HOUR : UNITS_ENUM.KILOMETER_PER_HOUR,
  };
}

const sensor = (ids, key, name, category, type, extra) => ({
  name,
  external_id: ids.feature(key),
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

/** Discovery payload of the athlete device. */
export function buildDevice(gladys, snapshot, config) {
  const ids = athleteIds(gladys, snapshot.athlete.id);
  const unit = units(config);
  const distance = (key, name) =>
    sensor(ids, key, name, CATEGORIES.DISTANCE_SENSOR, TYPES.SENSOR.DECIMAL, {
      unit: unit.distance,
      min: 0,
      max: 1_000_000,
    });
  const duration = (key, name) =>
    sensor(ids, key, name, CATEGORIES.DURATION, TYPES.DURATION.INTEGER, {
      unit: UNITS_ENUM.MINUTES,
      min: 0,
      max: 100_000,
    });
  const text = (key, name) =>
    sensor(ids, key, name, CATEGORIES.TEXT, TYPES.TEXT.TEXT, {
      // Gladys requires min and max on every feature, text included: they
      // bound the length of the text here.
      min: 0,
      max: 255,
      keep_history: false,
    });

  return {
    name: `Strava ${athleteName(snapshot)}`,
    external_id: ids.device,
    // No `should_poll`: the integration refreshes on its own timer (the
    // refresh interval is in minutes, slower than the fastest Gladys poll),
    // and right away when a Strava webhook announces a new activity.
    features: [
      text(FEATURE.LAST_ACTIVITY_NAME, 'Last activity'),
      text(FEATURE.LAST_ACTIVITY_SPORT, 'Last activity sport'),
      distance(FEATURE.LAST_ACTIVITY_DISTANCE, 'Last activity distance'),
      duration(FEATURE.LAST_ACTIVITY_MOVING_TIME, 'Last activity moving time'),
      sensor(
        ids,
        FEATURE.LAST_ACTIVITY_ELEVATION,
        'Last activity elevation gain',
        CATEGORIES.DISTANCE_SENSOR,
        TYPES.SENSOR.DECIMAL,
        { unit: unit.elevation, min: 0, max: 100_000 },
      ),
      sensor(
        ids,
        FEATURE.LAST_ACTIVITY_SPEED,
        'Last activity average speed',
        CATEGORIES.SPEED_SENSOR,
        TYPES.SPEED_SENSOR.DECIMAL,
        { unit: unit.speed, min: 0, max: 500 },
      ),
      distance(FEATURE.WEEK_DISTANCE, 'Distance this week'),
      duration(FEATURE.WEEK_MOVING_TIME, 'Moving time this week'),
      distance(FEATURE.RECENT_RUN_DISTANCE, 'Run distance, last 4 weeks'),
      distance(FEATURE.RECENT_RIDE_DISTANCE, 'Ride distance, last 4 weeks'),
      distance(FEATURE.RECENT_SWIM_DISTANCE, 'Swim distance, last 4 weeks'),
      distance(FEATURE.YEAR_RUN_DISTANCE, 'Run distance this year'),
      distance(FEATURE.YEAR_RIDE_DISTANCE, 'Ride distance this year'),
      distance(FEATURE.YEAR_SWIM_DISTANCE, 'Swim distance this year'),
    ],
  };
}

/** States of every feature, in the `publishStates` format. */
export function buildStates(gladys, snapshot, config) {
  const ids = athleteIds(gladys, snapshot.athlete.id);
  const u = config.units;
  const value = (key, state) => ({ device_feature_external_id: ids.feature(key), state });
  const text = (key, content) => ({ device_feature_external_id: ids.feature(key), text: content });
  const distanceOf = (period, sport) =>
    toDistance(periodTotals(snapshot, period, sport).distance, u);

  const states = [
    value(FEATURE.WEEK_DISTANCE, distanceOf('week', 'all')),
    value(FEATURE.WEEK_MOVING_TIME, toMinutes(snapshot.week.all.moving_time)),
    value(FEATURE.RECENT_RUN_DISTANCE, distanceOf('recent', 'run')),
    value(FEATURE.RECENT_RIDE_DISTANCE, distanceOf('recent', 'ride')),
    value(FEATURE.RECENT_SWIM_DISTANCE, distanceOf('recent', 'swim')),
    value(FEATURE.YEAR_RUN_DISTANCE, distanceOf('year', 'run')),
    value(FEATURE.YEAR_RIDE_DISTANCE, distanceOf('year', 'ride')),
    value(FEATURE.YEAR_SWIM_DISTANCE, distanceOf('year', 'swim')),
  ];
  const last = snapshot.activities[0];
  if (last) {
    states.push(
      text(FEATURE.LAST_ACTIVITY_NAME, last.name || sportTypeLabel(last.sport_type).en),
      text(FEATURE.LAST_ACTIVITY_SPORT, last.sport_type),
      value(FEATURE.LAST_ACTIVITY_DISTANCE, toDistance(last.distance, u)),
      value(FEATURE.LAST_ACTIVITY_MOVING_TIME, toMinutes(last.moving_time)),
      value(FEATURE.LAST_ACTIVITY_ELEVATION, toElevation(last.elevation_gain, u)),
      value(FEATURE.LAST_ACTIVITY_SPEED, toSpeed(last.average_speed, u)),
    );
  }
  return states;
}

/**
 * Transport badge of the device: Strava is cloud-only. `unreachable` when the
 * account is no longer authorized or the API is down, `cloud` + degraded when
 * the rate limit is hit (the data is late, not lost).
 */
export function buildTransport(gladys, athleteId, error) {
  const entry = { external_id: athleteIds(gladys, athleteId).device };
  if (!error) {
    return { ...entry, transport: DEVICE_TRANSPORTS.CLOUD };
  }
  if (error.code === 'RATE_LIMITED') {
    return {
      ...entry,
      transport: DEVICE_TRANSPORTS.CLOUD,
      degraded: true,
      message: {
        en: 'Strava rate limit reached, the next refresh will catch up',
        fr: 'Limite de requêtes Strava atteinte, le prochain rafraîchissement rattrapera',
      },
    };
  }
  return { ...entry, transport: DEVICE_TRANSPORTS.UNREACHABLE };
}
