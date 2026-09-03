// -----------------------------------------------------------------------------
// Device registry.
//
// Add or remove device types here. Each device lives in its own file and
// exposes the same shape:
//   - key                        : short identifier (used in logs)
//   - deviceExternalId(gladys)   : the device external_id (for dispatch)
//   - buildDevice(gladys, config): the discovery payload sent to Gladys
//   - onPoll(gladys, config)      (optional): periodic read
//   - actions                     (optional): manifest action handlers, keyed
//     by the action `key` declared in gladys-assistant-integration.json
//
// Both Strava devices are read-only (no onSetValue: nothing to command on a
// cloud activity feed) and cloud-only (no local channel, so no transport
// badge either) — this registry stays deliberately smaller than the full
// template's.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { latestActivity } from './latestActivity.js';
import { stats } from './stats.js';

const logger = createLogger({ name: 'strava-devices' });

export const DEVICE_BLUEPRINTS = [latestActivity, stats];

/**
 * Build the discovery payload for Gladys (all devices).
 */
export function buildDiscoveredDevices(gladys, config) {
  // Temporary diagnostic: Gladys has been rejecting devices[0].poll_frequency
  // as "invalid poll frequency" (400) even though normalizeConfig always
  // clamps it into [300, 3600] — logging the actual resolved value here,
  // right where every caller (scan, OAuth callback, config update, initial
  // connect) builds the payload, so the next failure shows what is really
  // being sent instead of us guessing again.
  logger.info(
    `Building discovered devices with poll_frequency=${JSON.stringify(config.poll_frequency)} (typeof ${typeof config.poll_frequency})`,
  );
  return DEVICE_BLUEPRINTS.map((bp) => bp.buildDevice(gladys, config));
}

/**
 * Find the blueprint that owns a given device, from its external_id
 * (used to route onPoll to the right device).
 */
export function findBlueprintByDevice(gladys, device) {
  return DEVICE_BLUEPRINTS.find((bp) => bp.deviceExternalId(gladys) === device.external_id);
}
