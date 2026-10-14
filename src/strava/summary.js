// -----------------------------------------------------------------------------
// Pure functions turning the Strava payloads into what the integration shows:
// a "snapshot" in SI units (meters, seconds, m/s), then converted to the unit
// system the user chose. No I/O here: everything is unit-tested.
// -----------------------------------------------------------------------------

import { UNITS } from '../config.js';

// Strava `sport_type` values grouped the way its own totals are (run, ride,
// swim), plus walk, and `other` for everything else (workouts, ski...).
export const SPORT_GROUPS = {
  run: ['Run', 'TrailRun', 'VirtualRun'],
  ride: [
    'Ride',
    'VirtualRide',
    'EBikeRide',
    'EMountainBikeRide',
    'GravelRide',
    'MountainBikeRide',
    'Velomobile',
    'Handcycle',
  ],
  swim: ['Swim'],
  walk: ['Walk', 'Hike'],
};
export const SPORTS = ['run', 'ride', 'swim', 'walk', 'other'];

// Labels of the most common sport types; the others are split from their
// CamelCase name ("AlpineSki" -> "Alpine Ski").
const SPORT_TYPE_LABELS = {
  Run: { en: 'Run', fr: 'Course', de: 'Lauf', es: 'Carrera' },
  TrailRun: { en: 'Trail run', fr: 'Trail', de: 'Traillauf', es: 'Trail' },
  VirtualRun: {
    en: 'Virtual run',
    fr: 'Course virtuelle',
    de: 'Virtueller Lauf',
    es: 'Carrera virtual',
  },
  Ride: { en: 'Ride', fr: 'Vélo', de: 'Radfahrt', es: 'Ciclismo' },
  VirtualRide: {
    en: 'Virtual ride',
    fr: 'Vélo virtuel',
    de: 'Virtuelle Radfahrt',
    es: 'Ciclismo virtual',
  },
  EBikeRide: {
    en: 'E-bike ride',
    fr: 'Vélo électrique',
    de: 'E-Bike-Fahrt',
    es: 'Bicicleta eléctrica',
  },
  GravelRide: { en: 'Gravel ride', fr: 'Gravel', de: 'Gravel', es: 'Gravel' },
  MountainBikeRide: { en: 'MTB ride', fr: 'VTT', de: 'Mountainbike', es: 'BTT' },
  Swim: { en: 'Swim', fr: 'Natation', de: 'Schwimmen', es: 'Natación' },
  Walk: { en: 'Walk', fr: 'Marche', de: 'Gehen', es: 'Caminata' },
  Hike: { en: 'Hike', fr: 'Randonnée', de: 'Wanderung', es: 'Senderismo' },
  WeightTraining: {
    en: 'Weight training',
    fr: 'Musculation',
    de: 'Krafttraining',
    es: 'Musculación',
  },
  Workout: { en: 'Workout', fr: 'Entraînement', de: 'Training', es: 'Entrenamiento' },
  Yoga: { en: 'Yoga', fr: 'Yoga', de: 'Yoga', es: 'Yoga' },
  Rowing: { en: 'Rowing', fr: 'Aviron', de: 'Rudern', es: 'Remo' },
  AlpineSki: { en: 'Alpine ski', fr: 'Ski alpin', de: 'Ski alpin', es: 'Esquí alpino' },
  NordicSki: { en: 'Nordic ski', fr: 'Ski de fond', de: 'Langlauf', es: 'Esquí de fondo' },
};

export function sportGroup(sportType) {
  for (const [group, types] of Object.entries(SPORT_GROUPS)) {
    if (types.includes(sportType)) {
      return group;
    }
  }
  return 'other';
}

export function sportTypeLabel(sportType) {
  if (SPORT_TYPE_LABELS[sportType]) {
    return SPORT_TYPE_LABELS[sportType];
  }
  const label = String(sportType || 'Activity').replace(/([a-z])([A-Z])/g, '$1 $2');
  return { en: label, fr: label, de: label, es: label };
}

export function activityUrl(id) {
  return `https://www.strava.com/activities/${id}`;
}

export function athleteUrl(id) {
  return `https://www.strava.com/athletes/${id}`;
}

// --- Units -------------------------------------------------------------------

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

const round = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

/** Meters -> km or miles, 2 decimals. */
export function toDistance(meters, units) {
  return round(units === UNITS.IMPERIAL ? meters / METERS_PER_MILE : meters / 1000, 2);
}

/** Meters -> m or feet, no decimal. */
export function toElevation(meters, units) {
  return round(units === UNITS.IMPERIAL ? meters * FEET_PER_METER : meters, 0);
}

/** m/s -> km/h or mph, 1 decimal. */
export function toSpeed(metersPerSecond, units) {
  return round(
    units === UNITS.IMPERIAL
      ? (metersPerSecond * 3600) / METERS_PER_MILE
      : (metersPerSecond * 3600) / 1000,
    1,
  );
}

/** Seconds -> whole minutes. */
export function toMinutes(seconds) {
  return Math.round((Number(seconds) || 0) / 60);
}

export function distanceUnit(units) {
  return units === UNITS.IMPERIAL ? 'mi' : 'km';
}

export function elevationUnit(units) {
  return units === UNITS.IMPERIAL ? 'ft' : 'm';
}

export function speedUnit(units) {
  return units === UNITS.IMPERIAL ? 'mph' : 'km/h';
}

/** Seconds -> "1h05" or "42 min". */
export function formatDuration(seconds) {
  const minutes = toMinutes(seconds);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

// --- Dates -------------------------------------------------------------------

/**
 * IANA time zone of a Strava activity: `"(GMT+01:00) Europe/Paris"` ->
 * `"Europe/Paris"`, or UTC when unknown to this runtime.
 */
export function parseTimezone(stravaTimezone) {
  const zone = String(stravaTimezone ?? '')
    .replace(/^\([^)]*\)\s*/, '')
    .trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(instant, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/** YYYY-MM-DD shifted by a number of days (calendar arithmetic, no DST). */
export function addDays(ymd, days) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD) of the week containing a calendar date. */
export function weekStart(ymd) {
  const weekday = (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(ymd, -weekday);
}

// Calendar date of an activity, in its own time zone: Strava writes the
// local wall-clock time in `start_date_local` (with a misleading `Z`).
const activityDate = (activity) => String(activity.start_date_local ?? activity.start_date ?? '');

// --- Snapshot ----------------------------------------------------------------

const EMPTY_TOTALS = { count: 0, distance: 0, moving_time: 0, elevation_gain: 0 };

function totalsOf(raw) {
  return {
    count: Number(raw?.count) || 0,
    distance: Number(raw?.distance) || 0,
    moving_time: Number(raw?.moving_time) || 0,
    elevation_gain: Number(raw?.elevation_gain) || 0,
  };
}

function addActivity(totals, activity) {
  return {
    count: totals.count + 1,
    distance: totals.distance + (Number(activity.distance) || 0),
    moving_time: totals.moving_time + (Number(activity.moving_time) || 0),
    elevation_gain: totals.elevation_gain + (Number(activity.total_elevation_gain) || 0),
  };
}

function sumTotals(list) {
  return list.reduce(
    (sum, totals) => ({
      count: sum.count + totals.count,
      distance: sum.distance + totals.distance,
      moving_time: sum.moving_time + totals.moving_time,
      elevation_gain: sum.elevation_gain + totals.elevation_gain,
    }),
    EMPTY_TOTALS,
  );
}

/** The fields of a summary activity the integration uses. */
export function simplifyActivity(activity) {
  const sportType = activity.sport_type ?? activity.type ?? 'Workout';
  return {
    id: String(activity.id),
    name: String(activity.name ?? '').slice(0, 255),
    sport_type: sportType,
    sport: sportGroup(sportType),
    start_date: activity.start_date,
    start_date_local: activity.start_date_local,
    distance: Number(activity.distance) || 0,
    moving_time: Number(activity.moving_time) || 0,
    elapsed_time: Number(activity.elapsed_time) || 0,
    elevation_gain: Number(activity.total_elevation_gain) || 0,
    average_speed: Number(activity.average_speed) || 0,
    pr_count: Number(activity.pr_count) || 0,
    achievement_count: Number(activity.achievement_count) || 0,
    kudos_count: Number(activity.kudos_count) || 0,
  };
}

/**
 * Everything the devices, scenes and widgets need, from three API answers.
 * @param {object} input
 * @param {object} input.athlete - GET /athlete.
 * @param {object} input.stats - GET /athletes/{id}/stats.
 * @param {object[]} input.activities - GET /athlete/activities, most recent first.
 * @param {number} input.now - Current time (ms).
 */
export function buildSnapshot({ athlete, stats, activities, now }) {
  const sorted = [...(activities ?? [])].sort((a, b) =>
    String(b.start_date).localeCompare(String(a.start_date)),
  );
  // The athlete's time zone is the one of their latest activity (the profile
  // carries none): it decides where "this week" starts.
  const timezone = parseTimezone(sorted[0]?.timezone);
  const today = localDate(now, timezone);
  const monday = weekStart(today);

  const week = Object.fromEntries(['all', ...SPORTS].map((key) => [key, { ...EMPTY_TOTALS }]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const daily = Object.fromEntries(days.map((day) => [day, 0]));
  for (const activity of sorted) {
    const date = activityDate(activity).slice(0, 10);
    if (date >= monday && date <= today) {
      week.all = addActivity(week.all, activity);
      const group = sportGroup(activity.sport_type ?? activity.type);
      week[group] = addActivity(week[group], activity);
    }
    if (date in daily) {
      daily[date] += Number(activity.distance) || 0;
    }
  }

  const period = (prefix) => {
    const run = totalsOf(stats?.[`${prefix}_run_totals`]);
    const ride = totalsOf(stats?.[`${prefix}_ride_totals`]);
    const swim = totalsOf(stats?.[`${prefix}_swim_totals`]);
    // Strava only totals these three sports: "all" is their sum.
    return { run, ride, swim, all: sumTotals([run, ride, swim]) };
  };

  return {
    athlete: {
      id: String(athlete.id),
      firstname: athlete.firstname ?? '',
      lastname: athlete.lastname ?? '',
    },
    timezone,
    fetched_at: new Date(now).toISOString(),
    activities: sorted.map(simplifyActivity),
    week: { start: monday, ...week },
    daily: days.map((date) => ({ date, distance: daily[date] })),
    totals: { recent: period('recent'), year: period('ytd'), all: period('all') },
  };
}

export function athleteName(snapshot) {
  const { firstname, lastname } = snapshot.athlete;
  return `${firstname} ${lastname}`.trim() || `Athlete ${snapshot.athlete.id}`;
}

/**
 * Totals of a period and a sport, from the snapshot.
 * @param {object} snapshot
 * @param {'week'|'recent'|'year'|'all'} period - `recent` is the last 4 weeks.
 * @param {'all'|'run'|'ride'|'swim'|'walk'|'other'} sport - `walk` and
 *   `other` only exist for the week (Strava totals run, ride and swim only).
 */
export function periodTotals(snapshot, period, sport) {
  if (period === 'week') {
    return snapshot.week[sport] ?? { ...EMPTY_TOTALS };
  }
  return snapshot.totals[period]?.[sport] ?? { ...EMPTY_TOTALS };
}
