// -----------------------------------------------------------------------------
// Device type: STRAVA TRAINING TOTALS
//
// Sport-agnostic rolling totals (last 7 days / last 30 days) computed from the
// same recent-activities list as the "latest activity" device: how many
// activities, how far, over the two windows most people actually look at.
// Complements the single-activity detail with a volume trend.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { getValidAccessToken } from '../strava/auth.js';
import {
  getRecentActivities,
  summarizeActivities,
  distanceToUnit,
  round,
} from '../strava/activities.js';

const DEVICE_TYPE = 'strava-stats';
const PLATFORM_DEVICE_ID = 'summary';

const logger = createLogger({ name: DEVICE_TYPE });

const FEATURE = {
  ACTIVITIES_7D: 'activities-7d',
  DISTANCE_7D: 'distance-7d',
  ACTIVITIES_30D: 'activities-30d',
  DISTANCE_30D: 'distance-30d',
};

export const stats = {
  key: DEVICE_TYPE,

  deviceExternalId(gladys) {
    return gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID).device;
  },

  buildDevice(gladys, config) {
    const ids = gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID);
    const imperial = config.unit_system === 'imperial';
    const distanceUnit = imperial ? DEVICE_FEATURE_UNITS.MILE : DEVICE_FEATURE_UNITS.KM;
    return {
      name: 'Strava - Training totals',
      external_id: ids.device,
      poll_frequency: config.poll_frequency,
      features: [
        {
          name: 'Activities (last 7 days)',
          external_id: ids.feature(FEATURE.ACTIVITIES_7D),
          category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
          min: 0,
          max: 50,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'Distance (last 7 days)',
          external_id: ids.feature(FEATURE.DISTANCE_7D),
          category: DEVICE_FEATURE_CATEGORIES.DISTANCE_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
          unit: distanceUnit,
          min: 0,
          max: imperial ? 620 : 1000,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'Activities (last 30 days)',
          external_id: ids.feature(FEATURE.ACTIVITIES_30D),
          category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
          min: 0,
          max: 200,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'Distance (last 30 days)',
          external_id: ids.feature(FEATURE.DISTANCE_30D),
          category: DEVICE_FEATURE_CATEGORIES.DISTANCE_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
          unit: distanceUnit,
          min: 0,
          max: imperial ? 3100 : 5000,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
      ],
    };
  },

  async onPoll(gladys, config) {
    const ids = gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID);
    const accessToken = await getValidAccessToken(gladys, config);
    // Wide enough net to catch a full month even for a very active athlete;
    // shared cache with the "latest activity" device avoids a second request.
    const activities = await getRecentActivities(accessToken, { perPage: 100 });

    const last7Days = summarizeActivities(activities, { days: 7 });
    const last30Days = summarizeActivities(activities, { days: 30 });
    logger.info(`Totals: ${last7Days.count} activities / 7d, ${last30Days.count} activities / 30d`);

    await gladys.publishStates([
      { device_feature_external_id: ids.feature(FEATURE.ACTIVITIES_7D), state: last7Days.count },
      {
        device_feature_external_id: ids.feature(FEATURE.DISTANCE_7D),
        state: round(distanceToUnit(last7Days.distanceMeters, config.unit_system)),
      },
      { device_feature_external_id: ids.feature(FEATURE.ACTIVITIES_30D), state: last30Days.count },
      {
        device_feature_external_id: ids.feature(FEATURE.DISTANCE_30D),
        state: round(distanceToUnit(last30Days.distanceMeters, config.unit_system)),
      },
    ]);
  },
};
