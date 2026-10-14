import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  buildSnapshot,
  formatDuration,
  localDate,
  parseTimezone,
  periodTotals,
  sportGroup,
  sportTypeLabel,
  toDistance,
  toElevation,
  toSpeed,
  weekStart,
} from '../src/strava/summary.js';
import { ACTIVITIES, ATHLETE, NOW, STATS } from './helpers/fakeStrava.js';

const snapshot = () =>
  buildSnapshot({ athlete: ATHLETE, stats: STATS, activities: ACTIVITIES, now: NOW });

test('unit conversions, metric and imperial', () => {
  assert.equal(toDistance(10200, 'metric'), 10.2);
  assert.equal(toDistance(1609.344, 'imperial'), 1);
  assert.equal(toElevation(100, 'metric'), 100);
  assert.equal(toElevation(100, 'imperial'), 328);
  assert.equal(toSpeed(10, 'metric'), 36);
  assert.equal(toSpeed(10, 'imperial'), 22.4);
});

test('durations read like a watch', () => {
  assert.equal(formatDuration(42 * 60), '42 min');
  assert.equal(formatDuration(3900), '1h05');
});

test('sport groups follow the Strava totals', () => {
  assert.equal(sportGroup('TrailRun'), 'run');
  assert.equal(sportGroup('GravelRide'), 'ride');
  assert.equal(sportGroup('Swim'), 'swim');
  assert.equal(sportGroup('Hike'), 'walk');
  assert.equal(sportGroup('Yoga'), 'other');
  assert.deepEqual(sportTypeLabel('AlpineSki'), {
    en: 'Alpine ski',
    fr: 'Ski alpin',
    de: 'Ski alpin',
    es: 'Esquí alpino',
  });
  assert.deepEqual(sportTypeLabel('StandUpPaddling'), {
    en: 'Stand Up Paddling',
    fr: 'Stand Up Paddling',
    de: 'Stand Up Paddling',
    es: 'Stand Up Paddling',
  });
});

test('time zones and calendar weeks', () => {
  assert.equal(parseTimezone('(GMT+01:00) Europe/Paris'), 'Europe/Paris');
  assert.equal(parseTimezone('(GMT+00:00) Not/AZone'), 'UTC');
  assert.equal(parseTimezone(undefined), 'UTC');
  // 23:30 UTC on Sunday is already Monday in Paris.
  assert.equal(localDate(Date.parse('2026-10-18T23:30:00Z'), 'Europe/Paris'), '2026-10-19');
  assert.equal(weekStart('2026-10-14'), '2026-10-12');
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-10-18'), '2026-10-12');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('the snapshot sums the week from Monday, in the athlete time zone', () => {
  const { week, timezone } = snapshot();
  assert.equal(timezone, 'Europe/Paris');
  assert.equal(week.start, '2026-10-12');
  assert.deepEqual(week.all, { count: 2, distance: 52200, moving_time: 8520, elevation_gain: 495 });
  assert.equal(week.run.count, 1);
  assert.equal(week.ride.distance, 42000);
  assert.equal(week.swim.count, 0, 'Sunday belongs to the previous week');
});

test('the snapshot charts the last 7 days, today included', () => {
  const { daily } = snapshot();
  assert.equal(daily.length, 7);
  assert.equal(daily[0].date, '2026-10-08');
  assert.equal(daily.at(-1).date, '2026-10-14');
  const byDate = Object.fromEntries(daily.map(({ date, distance }) => [date, distance]));
  assert.equal(byDate['2026-10-13'], 10200);
  assert.equal(byDate['2026-10-11'], 2000);
  assert.equal(byDate['2026-10-14'], 0);
});

test('the snapshot keeps the activities most recent first', () => {
  const shuffled = [ACTIVITIES[2], ACTIVITIES[0], ACTIVITIES[3], ACTIVITIES[1]];
  const { activities } = buildSnapshot({
    athlete: ATHLETE,
    stats: STATS,
    activities: shuffled,
    now: NOW,
  });
  assert.deepEqual(
    activities.map((a) => a.id),
    ['101', '100', '99', '98'],
  );
  assert.equal(activities[0].sport, 'run');
});

test('period totals: Strava totals, and their sum for all sports', () => {
  const snap = snapshot();
  assert.equal(periodTotals(snap, 'year', 'run').distance, 820000);
  assert.equal(periodTotals(snap, 'recent', 'all').count, 14);
  assert.equal(periodTotals(snap, 'all', 'swim').distance, 60000);
  assert.equal(periodTotals(snap, 'week', 'all').distance, 52200);
  assert.equal(periodTotals(snap, 'year', 'walk').count, 0, 'Strava totals no walk');
});

test('an athlete without activity nor stats still gets a snapshot', () => {
  const snap = buildSnapshot({ athlete: ATHLETE, stats: {}, activities: [], now: NOW });
  assert.equal(snap.timezone, 'UTC');
  assert.equal(snap.week.all.count, 0);
  assert.equal(snap.totals.year.all.distance, 0);
  assert.deepEqual(snap.activities, []);
});
