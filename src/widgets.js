// -----------------------------------------------------------------------------
// Dashboard widgets (SDK v0.14+, Gladys 5.1+).
//
// The manifest `widgets` field declares their identity (key, label, icon,
// per-instance `settings`); the content returned here is DECLARATIVE — the
// core renders it with its own theme, dark mode and translations.
//
// Each entry of WIDGETS is keyed by the widget `key`:
//   - get(ctx, { settings, language, units }): the content (onWidgetGet);
//   - action(ctx, { actionKey, params, settings }) (optional): a tapped
//     `button` carrying an `action` (onWidgetAction).
//
// The contents are computed from the last snapshot (src/sync.js), which nudges
// the widgets after every refresh: no API call when a dashboard opens.
// test/widgets.test.js checks every content with `validateWidgetContent`.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { isLinked } from './config.js';
import {
  activityUrl,
  athleteUrl,
  distanceUnit,
  elevationUnit,
  formatDuration,
  sportTypeLabel,
  speedUnit,
  toDistance,
  toElevation,
  toSpeed,
} from './strava/summary.js';

const logger = createLogger({ name: 'widgets' });

export const WIDGET_KEYS = {
  WEEKLY_SUMMARY: 'weekly_summary',
  RECENT_ACTIVITIES: 'recent_activities',
};

export const WIDGET_ACTIONS = { SYNC: 'sync' };

// The core caches a content until this TTL; the sync nudges the widgets after
// every refresh, so the TTL is only a safety net.
const TTL_SECONDS = 900;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Same text in every language, with a per-language prefix.
const localized = (build) => ({ en: build('en'), fr: build('fr') });

/** Content shown while no data can be displayed. */
function placeholder(ctx) {
  const config = ctx.getConfig();
  const message = !isLinked(config)
    ? {
        en: 'Link your Strava account from the configuration of the Strava integration.',
        fr: "Liez votre compte Strava depuis la configuration de l'intégration Strava.",
      }
    : {
        en: 'Strava data is not available yet: check the integration logs.',
        fr: "Les données Strava ne sont pas encore disponibles : consultez les logs de l'intégration.",
      };
  return { ttl_seconds: 60, components: [{ type: 'text', variant: 'body', text: message }] };
}

/** The last snapshot, refreshed when missing; `null` when there is none. */
async function currentSnapshot(ctx) {
  if (!isLinked(ctx.getConfig())) {
    return null;
  }
  try {
    return await ctx.sync.ensureSnapshot({ maxAgeMs: Infinity });
  } catch (err) {
    logger.warn(`No snapshot for the widget: ${err.message}`);
    return ctx.sync.snapshot;
  }
}

function errorRow(error) {
  if (!error) {
    return [];
  }
  const rateLimited = error.code === 'RATE_LIMITED';
  return [
    {
      label: 'Strava',
      icon: 'alert-triangle',
      value: rateLimited
        ? { en: 'Rate limited', fr: 'Limite atteinte' }
        : { en: 'Unreachable', fr: 'Injoignable' },
      color: rateLimited ? WIDGET_COLORS.WARNING : WIDGET_COLORS.DANGER,
    },
  ];
}

function goalRow(snapshot, config) {
  if (!(config.weekly_goal > 0)) {
    return [];
  }
  const distance = toDistance(snapshot.week.all.distance, config.units);
  const reached = distance >= config.weekly_goal;
  return [
    {
      label: { en: 'Weekly goal', fr: 'Objectif hebdo' },
      icon: 'target',
      value: `${distance} / ${config.weekly_goal} ${distanceUnit(config.units)}`,
      color: reached ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.INFO,
    },
  ];
}

function weeklySummary(snapshot, config, error) {
  const units = config.units;
  const week = snapshot.week.all;
  const last = snapshot.activities[0];
  const year = snapshot.totals.year;
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      {
        type: 'value',
        label: { en: 'Distance', fr: 'Distance' },
        icon: 'map',
        value: toDistance(week.distance, units),
        unit: distanceUnit(units),
      },
      {
        type: 'value',
        label: { en: 'Moving time', fr: 'Temps actif' },
        icon: 'clock',
        value: formatDuration(week.moving_time),
      },
      {
        type: 'value',
        label: { en: 'Activities', fr: 'Activités' },
        icon: 'activity',
        value: week.count,
      },
      {
        type: 'value',
        label: { en: 'Elevation', fr: 'Dénivelé' },
        icon: 'trending-up',
        value: toElevation(week.elevation_gain, units),
        unit: elevationUnit(units),
      },
      {
        type: 'chart',
        chart_type: 'bar',
        title: { en: 'Last 7 days', fr: '7 derniers jours' },
        unit: distanceUnit(units),
        series: [
          {
            name: { en: 'Distance', fr: 'Distance' },
            points: snapshot.daily.map(({ date, distance }) => ({
              t: date,
              v: toDistance(distance, units),
            })),
          },
        ],
      },
      {
        type: 'status',
        items: [
          ...errorRow(error),
          ...goalRow(snapshot, config),
          ...(last
            ? [
                {
                  label: { en: 'Last activity', fr: 'Dernière activité' },
                  icon: 'flag',
                  value: truncate(
                    `${last.name} · ${toDistance(last.distance, units)} ${distanceUnit(units)}`,
                    40,
                  ),
                  color: WIDGET_COLORS.NEUTRAL,
                },
              ]
            : []),
          {
            label: { en: 'Run this year', fr: 'Course cette année' },
            icon: 'trending-up',
            value: `${toDistance(year.run.distance, units)} ${distanceUnit(units)}`,
            color: WIDGET_COLORS.PRIMARY,
          },
          {
            label: { en: 'Ride this year', fr: 'Vélo cette année' },
            icon: 'trending-up',
            value: `${toDistance(year.ride.distance, units)} ${distanceUnit(units)}`,
            color: WIDGET_COLORS.PRIMARY,
          },
        ],
      },
      {
        type: 'button',
        label: { en: 'Sync now', fr: 'Synchroniser' },
        icon: 'refresh-cw',
        style: 'secondary',
        action: { key: WIDGET_ACTIONS.SYNC },
      },
      {
        type: 'button',
        label: { en: 'Open Strava', fr: 'Ouvrir Strava' },
        icon: 'external-link',
        style: 'secondary',
        link: { url: athleteUrl(snapshot.athlete.id) },
      },
    ],
  };
}

function activityCard(activity, units) {
  const sport = sportTypeLabel(activity.sport_type);
  const distance = `${toDistance(activity.distance, units)} ${distanceUnit(units)}`;
  const duration = formatDuration(activity.moving_time);
  const elevation = `${toElevation(activity.elevation_gain, units)} ${elevationUnit(units)}`;
  const speed = `${toSpeed(activity.average_speed, units)} ${speedUnit(units)}`;
  return {
    title: truncate(activity.name || sport.en, 60),
    subtitle: localized((lang) => truncate(`${sport[lang]} · ${distance} · ${duration}`, 60)),
    date: activity.start_date,
    ...(activity.pr_count > 0
      ? { badge: { text: `${activity.pr_count} PR`, color: WIDGET_COLORS.WARNING } }
      : {}),
    description: {
      en: `${sport.en}: ${distance} in ${duration}, ${elevation} elevation gain, ${speed} average. ${activity.kudos_count} kudos.`,
      fr: `${sport.fr} : ${distance} en ${duration}, ${elevation} de dénivelé, ${speed} de moyenne. ${activity.kudos_count} kudos.`,
    },
    links: [
      { url: activityUrl(activity.id), label: { en: 'View on Strava', fr: 'Voir sur Strava' } },
    ],
  };
}

function recentActivities(snapshot, config, settings) {
  const count = Math.min(8, Math.max(1, Number(settings?.count) || 5));
  const sport = settings?.sport || 'all';
  const activities = snapshot.activities
    .filter((activity) => sport === 'all' || activity.sport === sport)
    .slice(0, count);
  if (activities.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [
        {
          type: 'text',
          variant: 'body',
          text: { en: 'No recent activity.', fr: 'Aucune activité récente.' },
        },
      ],
    };
  }
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      {
        type: 'card-list',
        display: 'list',
        items: activities.map((activity) => activityCard(activity, config.units)),
      },
    ],
  };
}

/** Handler of the "Sync now" buttons: refresh, and say what came in. */
async function syncAction(ctx, { actionKey }) {
  logger.info(`onWidgetAction <- ${actionKey}`);
  if (actionKey !== WIDGET_ACTIONS.SYNC) {
    // Throwing acks the action as failed: the message reaches the user.
    throw new Error(`Unknown widget action: ${actionKey}`);
  }
  const result = await ctx.sync.refresh({ reason: 'widget' });
  if (!result) {
    return { en: 'No Strava account is linked.', fr: "Aucun compte Strava n'est lié." };
  }
  return {
    en: `Strava synchronized: ${result.newActivities} new activities.`,
    fr: `Strava synchronisé : ${result.newActivities} nouvelle(s) activité(s).`,
  };
}

export const WIDGETS = {
  [WIDGET_KEYS.WEEKLY_SUMMARY]: {
    async get(ctx) {
      const snapshot = await currentSnapshot(ctx);
      if (!snapshot) {
        return placeholder(ctx);
      }
      return weeklySummary(snapshot, ctx.getConfig(), ctx.sync.lastError);
    },
    action: syncAction,
  },

  [WIDGET_KEYS.RECENT_ACTIVITIES]: {
    async get(ctx, { settings }) {
      const snapshot = await currentSnapshot(ctx);
      if (!snapshot) {
        return placeholder(ctx);
      }
      return recentActivities(snapshot, ctx.getConfig(), settings);
    },
  },
};

/**
 * Freshness nudge: ask the core to re-pull every widget now, instead of
 * waiting for the content TTL. Fire-and-forget, rate-limited core-side
 * (1 per 10 s per widget), dropped while disconnected.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
