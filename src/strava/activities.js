// -----------------------------------------------------------------------------
// Activity fetching (with a short shared cache) + the domain logic that turns
// raw Strava activities into the numbers the device blueprints publish.
//
// The cache exists because two devices (latest activity + rolling stats)
// poll independently at the same `poll_frequency`: without it, every poll
// tick would fire the Strava request twice for the exact same data, wasting
// half of the API rate-limit budget (100 requests / 15 min, 1000 / day) for
// nothing.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { fetchRecentActivities } from './api.js';

const logger = createLogger({ name: 'strava-activities' });

// Comfortably below the smallest allowed poll_frequency (300 s): a second
// blueprint polling moments after the first always hits the cache.
const CACHE_TTL_MS = 60_000;

let cache = { accessToken: null, activities: null, fetchedAt: 0 };

/**
 * Fetch the most recent activities, reusing the last response when it is
 * fresh enough and was fetched with the same token.
 * @param {string} accessToken
 * @param {{ perPage?: number }} [options]
 * @returns {Promise<Array<object>>}
 */
export async function getRecentActivities(accessToken, { perPage = 30 } = {}) {
  const now = Date.now();
  if (
    cache.activities &&
    cache.accessToken === accessToken &&
    now - cache.fetchedAt < CACHE_TTL_MS
  ) {
    logger.debug('Reusing the cached activity list');
    return cache.activities;
  }
  const activities = await fetchRecentActivities(accessToken, { perPage });
  cache = { accessToken, activities, fetchedAt: now };
  return activities;
}

/** Test-only: force the next call to hit the network again. */
export function clearActivitiesCache() {
  cache = { accessToken: null, activities: null, fetchedAt: 0 };
}

/**
 * Sum the activities started within the last `days` days into rolling
 * totals. Sport-agnostic on purpose (run, ride, swim, hike, workout...):
 * "how much did I move" rather than per-sport breakdowns.
 * @param {Array<object>} activities Strava activities, as returned by the API.
 * @param {{ days: number }} options
 */
export function summarizeActivities(activities, { days }) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = activities.filter((activity) => {
    const startedAt = Date.parse(activity.start_date ?? '');
    return Number.isFinite(startedAt) && startedAt >= cutoff;
  });
  return {
    count: recent.length,
    distanceMeters: recent.reduce((sum, a) => sum + (a.distance ?? 0), 0),
    movingTimeSeconds: recent.reduce((sum, a) => sum + (a.moving_time ?? 0), 0),
    elevationGainMeters: recent.reduce((sum, a) => sum + (a.total_elevation_gain ?? 0), 0),
  };
}

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

/** Meters -> km (metric) or miles (imperial). */
export function distanceToUnit(meters, unitSystem) {
  return unitSystem === 'imperial' ? meters / METERS_PER_MILE : meters / 1000;
}

/** Meters (elevation) -> meters (metric) or feet (imperial). */
export function elevationToUnit(meters, unitSystem) {
  return unitSystem === 'imperial' ? meters * FEET_PER_METER : meters;
}

/** Meters/second -> km/h (metric) or mph (imperial). */
export function speedToUnit(metersPerSecond, unitSystem) {
  return unitSystem === 'imperial' ? metersPerSecond * 2.236936 : metersPerSecond * 3.6;
}

/** Round to `decimals` digits (default 2), avoiding floating-point noise like 12.000000000000002. */
export function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
