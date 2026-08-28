// -----------------------------------------------------------------------------
// Device type: LATEST STRAVA ACTIVITY
//
// One stable device (platform id "latest", not the Strava activity id — using
// the real activity id would spawn a brand new Gladys device on every ride,
// forever) whose features are overwritten at each poll with the most recent
// activity's details. With `keep_history: true` on the numeric features, this
// turns into a distance/duration/elevation-over-time chart on the Gladys
// dashboard: a lightweight, native history of your Strava activities.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { getValidAccessToken } from '../strava/auth.js';
import { fetchAthlete } from '../strava/api.js';
import {
  getRecentActivities,
  distanceToUnit,
  elevationToUnit,
  speedToUnit,
  round,
} from '../strava/activities.js';

const DEVICE_TYPE = 'strava-latest-activity';
const PLATFORM_DEVICE_ID = 'latest';

const logger = createLogger({ name: DEVICE_TYPE });

const FEATURE = {
  NAME: 'name',
  SPORT_TYPE: 'sport-type',
  DISTANCE: 'distance',
  MOVING_TIME: 'moving-time',
  ELEVATION_GAIN: 'elevation-gain',
  AVERAGE_SPEED: 'average-speed',
  START_DATE: 'start-date',
};

export const latestActivity = {
  key: DEVICE_TYPE,

  deviceExternalId(gladys) {
    return gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID).device;
  },

  buildDevice(gladys, config) {
    const ids = gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID);
    const imperial = config.unit_system === 'imperial';
    return {
      name: 'Strava - Latest activity',
      external_id: ids.device,
      poll_frequency: config.poll_frequency,
      features: [
        {
          name: 'Activity name',
          external_id: ids.feature(FEATURE.NAME),
          category: DEVICE_FEATURE_CATEGORIES.TEXT,
          type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'Sport',
          external_id: ids.feature(FEATURE.SPORT_TYPE),
          category: DEVICE_FEATURE_CATEGORIES.TEXT,
          type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'Distance',
          external_id: ids.feature(FEATURE.DISTANCE),
          category: DEVICE_FEATURE_CATEGORIES.DISTANCE_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
          unit: imperial ? DEVICE_FEATURE_UNITS.MILE : DEVICE_FEATURE_UNITS.KM,
          min: 0,
          max: imperial ? 620 : 1000,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'Moving time',
          external_id: ids.feature(FEATURE.MOVING_TIME),
          category: DEVICE_FEATURE_CATEGORIES.DURATION,
          type: DEVICE_FEATURE_TYPES.DURATION.DECIMAL,
          unit: DEVICE_FEATURE_UNITS.MINUTES,
          min: 0,
          max: 1440,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'Elevation gain',
          external_id: ids.feature(FEATURE.ELEVATION_GAIN),
          category: DEVICE_FEATURE_CATEGORIES.DISTANCE_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
          unit: imperial ? DEVICE_FEATURE_UNITS.FEET : DEVICE_FEATURE_UNITS.M,
          min: 0,
          max: imperial ? 33000 : 10000,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'Average speed',
          external_id: ids.feature(FEATURE.AVERAGE_SPEED),
          category: DEVICE_FEATURE_CATEGORIES.SPEED_SENSOR,
          type: DEVICE_FEATURE_TYPES.SPEED_SENSOR.DECIMAL,
          unit: imperial
            ? DEVICE_FEATURE_UNITS.MILE_PER_HOUR
            : DEVICE_FEATURE_UNITS.KILOMETER_PER_HOUR,
          min: 0,
          max: imperial ? 60 : 100,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'Start date',
          external_id: ids.feature(FEATURE.START_DATE),
          category: DEVICE_FEATURE_CATEGORIES.TEXT,
          type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
          read_only: true,
          has_feedback: false,
          keep_history: false,
        },
      ],
    };
  },

  actions: {
    async test_connection(gladys, { config }) {
      logger.info('Action test_connection -> live request to the Strava API');
      const accessToken = await getValidAccessToken(gladys, config);
      const athlete = await fetchAthlete(accessToken);
      const name =
        [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || `athlete #${athlete.id}`;
      return {
        en: `Connected to Strava as ${name}.`,
        fr: `Connecté à Strava en tant que ${name}.`,
      };
    },
  },

  async onPoll(gladys, config) {
    const ids = gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID);
    const accessToken = await getValidAccessToken(gladys, config);
    const activities = await getRecentActivities(accessToken, { perPage: 5 });

    if (activities.length === 0) {
      logger.info('No Strava activity found yet, nothing to publish.');
      return;
    }

    const latest = activities[0];
    logger.info(`Latest activity: "${latest.name}" (${latest.sport_type ?? latest.type})`);

    await gladys.publishStates([
      {
        device_feature_external_id: ids.feature(FEATURE.NAME),
        text: latest.name || 'Untitled activity',
      },
      {
        device_feature_external_id: ids.feature(FEATURE.SPORT_TYPE),
        text: latest.sport_type || latest.type || 'Unknown',
      },
      {
        device_feature_external_id: ids.feature(FEATURE.DISTANCE),
        state: round(distanceToUnit(latest.distance ?? 0, config.unit_system)),
      },
      {
        device_feature_external_id: ids.feature(FEATURE.MOVING_TIME),
        state: round((latest.moving_time ?? 0) / 60, 1),
      },
      {
        device_feature_external_id: ids.feature(FEATURE.ELEVATION_GAIN),
        state: round(elevationToUnit(latest.total_elevation_gain ?? 0, config.unit_system), 1),
      },
      {
        device_feature_external_id: ids.feature(FEATURE.AVERAGE_SPEED),
        state: round(speedToUnit(latest.average_speed ?? 0, config.unit_system)),
      },
      {
        device_feature_external_id: ids.feature(FEATURE.START_DATE),
        text: latest.start_date_local || latest.start_date || '',
      },
    ]);
  },
};
