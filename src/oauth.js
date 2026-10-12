// -----------------------------------------------------------------------------
// OAuth2 "Connect" flow, relayed by Gladys (manifest `oauth2` config field).
//
//   1. The user clicks Connect: Gladys asks for the authorization URL
//      (onOAuthAuthorizeUrl) with its own redirect URI, and opens it.
//   2. The user approves on strava.com, Strava redirects to Gladys, Gladys
//      relays the code (onOAuthCallback): the integration checks the anti-CSRF
//      `state`, exchanges the code and stores the tokens with setConfig.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { hasApplication } from './config.js';
import { buildAuthorizeUrl } from './strava/client.js';

const logger = createLogger({ name: 'oauth' });

export const OAUTH_KEY = 'strava_account';

// A state is valid for the time of one authorization in the browser.
const STATE_TTL_MS = 15 * 60 * 1000;

export function createOAuth(ctx, { onLinked, now = Date.now } = {}) {
  const pending = new Map();

  return {
    async authorizeUrl(key, redirectUri) {
      const config = ctx.getConfig();
      if (!hasApplication(config)) {
        throw new Error('Fill in and save the Client ID and Client Secret first.');
      }
      for (const [state, expiresAt] of pending) {
        if (expiresAt < now()) {
          pending.delete(state);
        }
      }
      const state = randomUUID();
      pending.set(state, now() + STATE_TTL_MS);
      logger.info('Authorization URL requested');
      return buildAuthorizeUrl({ clientId: config.client_id, redirectUri, state });
    },

    async callback(key, { code, state }) {
      const expiresAt = pending.get(state);
      pending.delete(state);
      if (!expiresAt || expiresAt < now()) {
        throw new Error('Invalid or expired authorization state, click Connect again.');
      }
      if (!code) {
        throw new Error('Strava sent no authorization code (access denied?).');
      }
      const tokens = await ctx.client.exchangeCode(code);
      logger.info('Strava account linked');
      await onLinked?.(tokens);
    },
  };
}
