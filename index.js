// -----------------------------------------------------------------------------
// Entry point of the Gladys external integration.
//
// Role of this file: wire the SDK to the device catalog (src/devices/) and to
// the Strava OAuth2 flow (src/strava/). It holds NO Strava-specific logic
// beyond that wiring: the API calls live in src/strava/, the device payloads
// in src/devices/. This file only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects and publishes the discovered devices.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import {
  DEVICE_BLUEPRINTS,
  buildDiscoveredDevices,
  findBlueprintByDevice,
} from './src/devices/index.js';
import { buildAuthorizeUrl, exchangeCodeForTokens } from './src/strava/api.js';
import { setTokens, hasStoredTokens } from './src/strava/auth.js';

const gladys = new GladysIntegration();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

// Anti-CSRF token for the OAuth2 round trip, generated per authorize request
// and checked back on the callback.
let oauthState;

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing discovered devices');
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config));
});

// --- Polling: Gladys asks to refresh a device --------------------------------
// Both Strava devices are read-only sensors: no onSetValue, no onGetImage,
// nothing to command, just periodic reads.
gladys.onPoll(async (device) => {
  const blueprint = findBlueprintByDevice(gladys, device);
  if (!blueprint || typeof blueprint.onPoll !== 'function') {
    logger.debug(`onPoll ignored (no polling) for ${device.external_id}`);
    return;
  }
  await blueprint.onPoll(gladys, config);
});

// --- Manifest actions: buttons in the Configuration screen -------------------
// Each action declared in the `actions` field of the manifest is registered
// per key; the message resolved by the handler is displayed under the button
// (the ack is awaited under the action's `timeout_seconds`, not the usual 5 s).
for (const blueprint of DEVICE_BLUEPRINTS) {
  for (const [actionKey, handler] of Object.entries(blueprint.actions ?? {})) {
    gladys.onAction(actionKey, (fields) => handler(gladys, { fields, config }));
  }
}

// --- OAuth2: the user clicks "Connect to Strava" ------------------------------
// The manifest declares the `strava_connect` field as `type: "oauth2"`, which
// renders the "Connect" button. Gladys relays the whole flow: it never talks
// to Strava itself, it only forwards the authorize URL request and the
// callback to this integration.
gladys.onOAuthAuthorizeUrl(async (key, redirectUri) => {
  if (!config.client_id) {
    throw new Error('Set the Strava Client ID and save the configuration before connecting.');
  }
  oauthState = crypto.randomUUID();
  logger.info('onOAuthAuthorizeUrl -> building the Strava authorize URL');
  return buildAuthorizeUrl({ clientId: config.client_id, redirectUri, state: oauthState });
});

gladys.onOAuthCallback(async (key, { code, state, redirectUri: _redirectUri }) => {
  if (state !== oauthState) {
    throw new Error('OAuth state mismatch, please retry the connection.');
  }
  logger.info('onOAuthCallback -> exchanging the authorization code for tokens');
  const tokens = await exchangeCodeForTokens({
    clientId: config.client_id,
    clientSecret: config.client_secret,
    code,
  });
  setTokens(tokens);

  const athleteName = tokens.athlete
    ? [tokens.athlete.firstname, tokens.athlete.lastname].filter(Boolean).join(' ')
    : undefined;

  await gladys.setConfig({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
    ...(athleteName ? { athlete_name: athleteName } : {}),
  });
  config = normalizeConfig(await gladys.getConfig());

  await gladys.setConnectionStatus(true);
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config));
  logger.info(`Connected to Strava${athleteName ? ` as ${athleteName}` : ''}.`);
});

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  // Re-publish the devices: some properties (unit, poll frequency) depend on it.
  // publishDiscoveredDevices is idempotent (upsert by external_id).
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config));
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK itself logs the WebSocket lifecycle (connections, disconnections,
// reconnection attempts) under the `gladys-sdk` name: no need to log it again
// here, this handler only runs the integration's own (re)initialization.
gladys.on('connected', async () => {
  try {
    // 1) Fetch the config filled in by the user (client_id/secret, tokens...).
    config = normalizeConfig(await gladys.getConfig());

    // 2) (Re)publish the devices as soon as we are connected.
    await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config));

    // 3) Report the application-level status, shown in the Configuration
    // screen. An integration can be RUNNING and still not connected to
    // Strava yet (the user has not clicked "Connect to Strava" so far).
    if (hasStoredTokens(config)) {
      await gladys.setConnectionStatus(true);
    } else {
      await gladys.setConnectionStatus(false, {
        en: 'Not connected to Strava yet: use the "Connect to Strava" button in the configuration.',
        fr: 'Pas encore connecté à Strava : utilisez le bouton « Se connecter à Strava » dans la configuration.',
      });
    }
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

// --- Graceful shutdown -------------------------------------------------------
// The SDK stops the push subscriptions, disconnects cleanly and exits with
// code 0 when the supervisor stops the container (SIGTERM/SIGINT).
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Strava integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
