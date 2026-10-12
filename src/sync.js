// -----------------------------------------------------------------------------
// Synchronization with Strava.
//
// One refresh = 2 API requests (stats + latest activities; the profile is
// re-read once a day), then everything Gladys sees is derived from the
// resulting snapshot:
//   - the athlete device (discovery) and its feature states;
//   - the scene triggers (new activity, personal record, weekly goal);
//   - the transport badge and the connection status;
//   - a nudge to the dashboard widgets.
//
// Refreshes run on a timer (the refresh interval of the config) and on
// demand: a Strava webhook, the "Sync now" action, a scene, a widget button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { buildDevice, buildStates, buildTransport } from './athlete.js';
import { isLinked } from './config.js';
import { MAX_SEEN_ACTIVITIES } from './store.js';
import { buildSnapshot, toDistance } from './strava/summary.js';
import { TRIGGERS, newActivityEvent, personalRecordEvent, weeklyGoalEvent } from './triggers.js';
import { refreshWidgets } from './widgets.js';

const logger = createLogger({ name: 'sync' });

// Latest activities read at each refresh: enough for the week and the widget.
const ACTIVITIES_PER_REFRESH = 30;
const ATHLETE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Re-send an unchanged state this old, so a quiet week stays recently dated.
const STATE_HEARTBEAT_MS = 60 * 60 * 1000;

export const CONNECTION_MESSAGES = {
  NOT_CONFIGURED: {
    en: 'Fill in the Client ID and Client Secret of your Strava API application, then click Connect.',
    fr: "Renseignez le Client ID et le Client Secret de votre application d'API Strava, puis cliquez sur Connecter.",
  },
  NOT_LINKED: {
    en: 'Click Connect to link your Strava account.',
    fr: 'Cliquez sur Connecter pour lier votre compte Strava.',
  },
  AUTH_REVOKED: {
    en: 'Strava refused the access: click Connect to link your account again.',
    fr: "Strava a refusé l'accès : cliquez sur Connecter pour lier à nouveau votre compte.",
  },
};

export class StravaSync {
  /**
   * @param {object} options
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
   * @param {import('./strava/client.js').StravaClient} options.client
   * @param {ReturnType<import('./store.js').createStore>} options.store
   * @param {() => object} options.getConfig
   * @param {() => number} [options.now]
   */
  constructor({ gladys, client, store, getConfig, now = Date.now }) {
    this.gladys = gladys;
    this.client = client;
    this.store = store;
    this.getConfig = getConfig;
    this.now = now;
    this.snapshot = null;
    this.lastError = null;
    this.athlete = null;
    this.athleteFetchedAt = 0;
    this.running = null;
    this.timer = null;
    this.publishedDevice = null;
    // The "connected" status was sent since the last (re)activation.
    this.statusReported = false;
  }

  // --- Timer -----------------------------------------------------------------

  start() {
    this.stop();
    const minutes = this.getConfig().refresh_interval;
    this.timer = setInterval(() => {
      this.refresh({ reason: 'timer' }).catch(() => {});
    }, minutes * 60_000);
    this.timer.unref?.();
    logger.info(`Refreshing every ${minutes} minutes`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Forget the account (unlinked, or another one linked). */
  reset() {
    this.snapshot = null;
    this.athlete = null;
    this.athleteFetchedAt = 0;
    this.lastError = null;
    this.publishedDevice = null;
  }

  // --- Refresh ---------------------------------------------------------------

  /**
   * Refresh from Strava. Concurrent calls share the running refresh.
   * Resolves `{ snapshot, newActivities }`, or `null` when no account is
   * linked; rejects with the StravaApiError of a failed refresh.
   */
  refresh({ reason = 'manual' } = {}) {
    this.running ??= this.doRefresh(reason).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** The current snapshot, refreshed first when missing or older than `maxAgeMs`. */
  async ensureSnapshot({ maxAgeMs = 60_000 } = {}) {
    const age = this.snapshot ? this.now() - Date.parse(this.snapshot.fetched_at) : Infinity;
    if (age > maxAgeMs) {
      await this.refresh({ reason: 'on-demand' });
    }
    return this.snapshot;
  }

  async doRefresh(reason) {
    const config = this.getConfig();
    if (!isLinked(config)) {
      return null;
    }
    logger.debug(`Refreshing (${reason})`);
    try {
      const athlete = await this.fetchAthlete();
      const [stats, activities] = await Promise.all([
        this.client.getAthleteStats(athlete.id),
        this.client.listActivities({ perPage: ACTIVITIES_PER_REFRESH }),
      ]);
      const snapshot = buildSnapshot({ athlete, stats, activities, now: this.now() });
      this.snapshot = snapshot;

      await this.publishDevice();
      const newActivities = await this.fireTriggers(snapshot, config);
      await this.publishStates();
      await this.recover();
      refreshWidgets(this.gladys);
      logger.info(
        `Refreshed (${reason}): ${snapshot.activities.length} recent activities,` +
          ` ${newActivities} new` +
          (this.client.rateLimitUsage ? `, API usage ${this.client.rateLimitUsage}` : ''),
      );
      return { snapshot, newActivities };
    } catch (err) {
      await this.fail(err);
      throw err;
    }
  }

  async fetchAthlete() {
    const stale = this.now() - this.athleteFetchedAt > ATHLETE_MAX_AGE_MS;
    if (!this.athlete || stale) {
      this.athlete = await this.client.getAthlete();
      this.athleteFetchedAt = this.now();
      if (this.store.state.athlete_id !== String(this.athlete.id)) {
        // Another account: its activities were never announced, start over.
        await this.store.update({
          athlete_id: String(this.athlete.id),
          seen_activities: null,
          goal_reached_week: null,
        });
      }
    }
    return this.athlete;
  }

  // --- Publications ----------------------------------------------------------

  /** Publish the device when it is new or its definition changed (units). */
  async publishDevice({ force = false } = {}) {
    if (!this.snapshot) {
      return;
    }
    const device = buildDevice(this.gladys, this.snapshot, this.getConfig());
    const signature = JSON.stringify(device);
    if (force || signature !== this.publishedDevice) {
      await this.gladys.publishDiscoveredDevices([device]);
      this.publishedDevice = signature;
    }
  }

  async publishStates() {
    await this.gladys.publishChangedStates(
      buildStates(this.gladys, this.snapshot, this.getConfig()),
      { heartbeat: STATE_HEARTBEAT_MS },
    );
  }

  async publishTransport(error) {
    const athleteId = this.snapshot?.athlete.id ?? this.athlete?.id;
    if (!athleteId) {
      return;
    }
    try {
      await this.gladys.publishTransports([buildTransport(this.gladys, athleteId, error)]);
    } catch (err) {
      logger.debug(`Transport not published: ${err.message}`);
    }
  }

  /** Back to nominal after a successful refresh. */
  async recover() {
    const wasFailing = this.lastError !== null;
    this.lastError = null;
    await this.publishTransport(null);
    if (wasFailing || !this.statusReported) {
      await this.gladys.setConnectionStatus(true);
      this.statusReported = true;
    }
  }

  async fail(err) {
    this.lastError = err;
    logger.error(`Refresh failed: ${err.message}`);
    await this.publishTransport(err);
    if (err.code === 'AUTH_REVOKED' || err.code === 'NOT_LINKED') {
      this.statusReported = false;
      await this.gladys
        .setConnectionStatus(false, CONNECTION_MESSAGES[err.code])
        .catch((e) => logger.error('setConnectionStatus failed', e));
    }
  }

  // --- Scene triggers --------------------------------------------------------

  /** Fire the triggers of what changed since the last refresh. Resolves the new activity count. */
  async fireTriggers(snapshot, config) {
    const { state } = this.store;
    const ids = snapshot.activities.map((activity) => activity.id);
    const weekDistance = toDistance(snapshot.week.all.distance, config.units);
    const goalReached = config.weekly_goal > 0 && weekDistance >= config.weekly_goal;

    if (state.seen_activities === null) {
      // First refresh for this account: what already exists is not news.
      await this.store.update({
        seen_activities: ids.slice(0, MAX_SEEN_ACTIVITIES),
        goal_reached_week: goalReached ? snapshot.week.start : state.goal_reached_week,
      });
      return 0;
    }

    const seen = new Set(state.seen_activities);
    // Oldest first, so the scenes see them in the order they happened.
    const fresh = snapshot.activities.filter((activity) => !seen.has(activity.id)).reverse();
    for (const activity of fresh) {
      await this.publishEvent(TRIGGERS.NEW_ACTIVITY, newActivityEvent(activity, config));
      if (activity.pr_count > 0) {
        await this.publishEvent(TRIGGERS.PERSONAL_RECORD, personalRecordEvent(activity));
      }
    }

    const patch = {};
    if (fresh.length > 0) {
      patch.seen_activities = [...fresh.map((a) => a.id).reverse(), ...state.seen_activities].slice(
        0,
        MAX_SEEN_ACTIVITIES,
      );
    }
    if (goalReached && state.goal_reached_week !== snapshot.week.start) {
      await this.publishEvent(
        TRIGGERS.WEEKLY_GOAL_REACHED,
        weeklyGoalEvent(weekDistance, snapshot.week.all.count, config),
      );
      patch.goal_reached_week = snapshot.week.start;
    }
    if (Object.keys(patch).length > 0) {
      await this.store.update(patch);
    }
    return fresh.length;
  }

  async publishEvent(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      logger.info(`Scene trigger ${key} fired`);
    } catch (err) {
      // A refused event must not block the refresh nor be retried forever.
      logger.error(`Scene trigger ${key} refused: ${err.message}`);
    }
  }
}
