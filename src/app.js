// -----------------------------------------------------------------------------
// Wiring of the integration: every SDK handler is registered here, before
// `connect()`. Kept apart from index.js so the tests drive the whole
// integration against the SDK's fake Gladys, with a fake Strava `fetch`.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { ACTIONS } from './actions.js';
import { TOKEN_KEYS, hasApplication, isLinked, normalizeConfig } from './config.js';
import { createOAuth } from './oauth.js';
import { SCENE_ACTIONS } from './scenes.js';
import { EMPTY_STATE, createStore } from './store.js';
import { StravaClient } from './strava/client.js';
import { CONNECTION_MESSAGES, StravaSync } from './sync.js';
import { WEBHOOK_KEY, createWebhookHandler, registerWebhook } from './webhooks.js';
import { WIDGETS, refreshWidgets } from './widgets.js';

const logger = createLogger({ name: 'app' });

// The keys of the form: a change of one of them re-applies the configuration
// (a token refresh, saved through setConfig, does not).
const USER_KEYS = [
  'client_id',
  'client_secret',
  'units',
  'refresh_interval',
  'weekly_goal_type',
  'weekly_goal',
];
const signature = (config) =>
  JSON.stringify([...USER_KEYS.map((key) => config[key]), Boolean(config.refresh_token)]);

const pick = (object, keys) => Object.fromEntries(keys.map((key) => [key, object[key]]));

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] - Strava HTTP client (tests: a fake).
 * @param {() => number} [options.now]
 * @param {ReturnType<typeof createStore>} [options.store]
 * @param {number} [options.webhookDelayMs]
 */
export function createApp(gladys, { fetch, now = Date.now, store, webhookDelayMs } = {}) {
  let config = normalizeConfig();
  const getConfig = () => config;
  store ??= createStore();

  const client = new StravaClient({
    getConfig,
    fetch,
    now,
    // Strava rotates the refresh token at every refresh: keep it in memory
    // first (the next request needs it), then save it in Gladys.
    async onTokens(tokens) {
      config = normalizeConfig({ ...config, ...tokens });
      await gladys.setConfig(tokens);
    },
  });
  const sync = new StravaSync({ gladys, client, store, getConfig, now });
  const ctx = { gladys, client, sync, store, getConfig };

  /** (Re)start everything from the current configuration. */
  async function activate() {
    sync.stop();
    sync.statusReported = false;
    if (!hasApplication(config)) {
      await gladys.setConnectionStatus(false, CONNECTION_MESSAGES.NOT_CONFIGURED);
      return;
    }
    if (!isLinked(config)) {
      await gladys.setConnectionStatus(false, CONNECTION_MESSAGES.NOT_LINKED);
      return;
    }
    sync.start();
    // A failed first refresh is reported by the sync (status, transport) and
    // retried by the timer: the connection itself must not fail.
    await sync.refresh({ reason: 'startup' }).catch(() => {});
    await registerWebhook(ctx);
    refreshWidgets(gladys);
  }

  ctx.unlink = async () => {
    sync.stop();
    await client.deauthorize().catch((err) => logger.warn(`Deauthorize failed: ${err.message}`));
    if (store.state.webhook?.id) {
      await client
        .deleteSubscription(store.state.webhook.id)
        .catch((err) => logger.warn(`Webhook subscription not deleted: ${err.message}`));
    }
    const cleared = { access_token: '', refresh_token: '', expires_at: 0, athlete_id: '' };
    config = normalizeConfig({ ...config, ...cleared });
    await gladys.setConfig(cleared);
    await store.update({ ...EMPTY_STATE });
    sync.reset();
    await gladys.setConnectionStatus(false, CONNECTION_MESSAGES.NOT_LINKED);
    refreshWidgets(gladys);
  };

  // --- OAuth2 "Connect" -------------------------------------------------------
  const oauth = createOAuth(ctx, {
    now,
    async onLinked(tokens) {
      if (tokens.athlete?.id && String(tokens.athlete.id) !== String(sync.snapshot?.athlete.id)) {
        sync.reset();
      }
      await activate();
    },
  });
  gladys.onOAuthAuthorizeUrl((key, redirectUri) => oauth.authorizeUrl(key, redirectUri));
  gladys.onOAuthCallback((key, params) => oauth.callback(key, params));

  // --- Discovery --------------------------------------------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> publishing the athlete device');
    if (!sync.snapshot) {
      await sync.refresh({ reason: 'scan' });
    }
    await sync.publishDevice({ force: true });
  });

  // A device created by the user: its features exist now, publish the values
  // (the SDK forgot them, so publishChangedStates sends them all).
  gladys.onDeviceCreated(async () => {
    if (sync.snapshot) {
      await sync.publishStates();
      await sync.publishTransport(sync.lastError);
    }
  });

  // --- Manifest actions, scene actions, widgets, webhook ----------------------
  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(key, (fields) => handler(ctx, { fields }));
  }
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(ctx, { fields }));
  }
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(ctx, request));
    if (typeof widget.action === 'function') {
      gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
        widget.action(ctx, { actionKey, params, settings }),
      );
    }
  }
  const webhookHandler = createWebhookHandler(ctx, { delayMs: webhookDelayMs });
  gladys.onWebhook(WEBHOOK_KEY, webhookHandler);
  gladys.onWebhookUpdated(() => registerWebhook(ctx));

  // --- Configuration ------------------------------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    const before = config;
    // Token keys missing from the payload keep their value...
    let next = normalizeConfig({ ...pick(before, TOKEN_KEYS), ...newConfig });
    // ...and a config echo may carry tokens older than the ones just refreshed
    // (the previous refresh token is already invalid): keep the newest.
    if ((before.expires_at || 0) > (next.expires_at || 0)) {
      next = { ...next, ...pick(before, TOKEN_KEYS) };
    }
    config = next;
    if (signature(before) === signature(config)) {
      return;
    }
    logger.info('onConfigUpdated -> applying the new configuration');
    await activate();
  });

  // --- Connection lifecycle -----------------------------------------------------
  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await store.load();
      sync.publishedDevice = null;
      await activate();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, prüfen Sie die Logs der Integration.',
          es: 'La inicialización ha fallado, consulta los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  gladys.on('disconnected', () => sync.stop());

  return {
    ctx,
    shutdown() {
      sync.stop();
      webhookHandler.cancel();
    },
  };
}
