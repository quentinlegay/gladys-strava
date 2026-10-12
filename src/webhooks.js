// -----------------------------------------------------------------------------
// Strava webhook events, relayed by Gladys Plus (optional).
//
// Without webhooks, a new activity shows up at the next timed refresh. With
// Gladys Plus linked, Strava pushes an event as soon as an activity is
// uploaded: the integration refreshes right away and the `new_activity`
// trigger fires within seconds.
//
// Strava allows ONE push subscription per API application: it is (re)created
// at every connection to point at the public URL Gladys Plus hands out
// (`gladys.getWebhooks()`). Registration is a challenge/response — Strava
// calls the URL with `hub.challenge` and waits for it back — hence the `sync`
// mode of the manifest webhook.
//
// Doctrine "trigger, not data": an event only TRIGGERS a refresh through the
// API, its payload is never applied as a state. Payloads are not signed by
// Strava: the URL is the secret, and the subscription and owner ids are
// checked on top of it.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { isLinked } from './config.js';

const logger = createLogger({ name: 'webhooks' });

export const WEBHOOK_KEY = 'strava_events';

// Coalesce the burst of events of one upload (create, then title edits...).
export const WEBHOOK_REFRESH_DELAY_MS = 15_000;

/**
 * Point the Strava push subscription at the current Gladys Plus URL.
 * Best effort: any failure leaves the integration on timed refreshes only.
 * Resolves `true` when a subscription points at Gladys Plus.
 */
export async function registerWebhook(ctx) {
  const { gladys, client, store } = ctx;
  if (!isLinked(ctx.getConfig())) {
    return false;
  }
  try {
    const { available, webhooks } = await gladys.getWebhooks();
    const url = available ? webhooks.find((webhook) => webhook.key === WEBHOOK_KEY)?.url : null;

    if (!url) {
      // No Gladys Plus (any more): drop our subscription, Strava would keep
      // calling a dead URL and eventually disable the application's pushes.
      const ours = store.state.webhook?.id;
      if (ours) {
        await client.deleteSubscription(ours).catch(() => {});
        await store.update({ webhook: null });
      }
      logger.info('Gladys Plus webhooks unavailable: timed refreshes only');
      return false;
    }

    const subscriptions = (await client.listSubscriptions()) ?? [];
    const current = subscriptions.find((subscription) => subscription.callback_url === url);
    if (current) {
      await store.update({ webhook: { id: current.id, callback_url: url } });
      logger.info('Strava webhook subscription already in place');
      return true;
    }

    // One subscription per application: replace whatever points elsewhere
    // (an old Gladys Plus key, another installation of the application).
    for (const subscription of subscriptions) {
      await client.deleteSubscription(subscription.id);
    }
    // Remembered BEFORE the call: Strava sends the challenge while creating.
    const verifyToken = randomUUID();
    await store.update({ webhook: { id: null, callback_url: url, verify_token: verifyToken } });
    const created = await client.createSubscription(url, verifyToken);
    await store.update({ webhook: { id: created.id, callback_url: url } });
    logger.info('Strava webhook subscription created');
    return true;
  } catch (err) {
    logger.warn(`Strava webhook not registered, timed refreshes only: ${err.message}`);
    return false;
  }
}

function parseBody(body) {
  if (typeof body !== 'string') {
    return body ?? {};
  }
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

/**
 * Create the handler of the `strava_events` webhook (mode `sync`): answers the
 * subscription challenge, and schedules a refresh on activity events.
 */
export function createWebhookHandler(ctx, { delayMs = WEBHOOK_REFRESH_DELAY_MS } = {}) {
  let timer = null;

  const scheduleRefresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      ctx.sync.refresh({ reason: 'webhook' }).catch(() => {});
    }, delayMs);
    timer.unref?.();
  };

  const handler = async ({ method, query = {}, body }) => {
    // Subscription validation: echo the challenge if the token is ours.
    if (method === 'GET') {
      const expected = ctx.store.state.webhook?.verify_token;
      if (query['hub.mode'] === 'subscribe' && expected && query['hub.verify_token'] === expected) {
        return {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ 'hub.challenge': query['hub.challenge'] }),
        };
      }
      logger.warn('Webhook validation refused (unknown verify token)');
      return { status: 403 };
    }

    const event = parseBody(body);
    const subscriptionId = ctx.store.state.webhook?.id;
    const athleteId = ctx.getConfig().athlete_id;
    if (
      (subscriptionId && String(event.subscription_id) !== String(subscriptionId)) ||
      (athleteId && String(event.owner_id) !== String(athleteId))
    ) {
      logger.warn('Webhook event ignored: not for this subscription or athlete');
      return { status: 200 };
    }
    logger.info(`Webhook event: ${event.object_type} ${event.aspect_type}`);
    // Activities (created, edited, deleted) and athlete deauthorization: in
    // every case, the API tells the truth — a revoked access shows up as a
    // refused refresh, reported in the Configuration screen.
    if (event.object_type === 'activity' || event.object_type === 'athlete') {
      scheduleRefresh();
    }
    // Strava expects a 200 within 2 seconds: never wait for the refresh.
    return { status: 200 };
  };

  handler.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  return handler;
}
