// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the only surface the device modules and the auth module rely
// on:
//   - externalIds(type, platformId) -> { device, feature(key) }
//   - publishState / publishStates   -> record calls so tests can assert them
//   - setConfig / getConfig          -> record calls, in-memory config store
//   - setConnectionStatus            -> record calls so tests can assert them
// This lets us test the pure "wiring" logic (discovery payloads, dispatch,
// token refresh persistence) without a running Gladys server or a real
// WebSocket.
// -----------------------------------------------------------------------------

export function createFakeGladys(initialConfig = {}) {
  const published = [];
  const connectionStatuses = [];
  const setConfigCalls = [];
  let config = { ...initialConfig };

  return {
    published,
    connectionStatuses,
    setConfigCalls,

    externalIds(type, platformId) {
      const device = `${type}:${platformId}`;
      return {
        device,
        feature: (key) => `${device}:${key}`,
      };
    },

    async publishState(featureExternalId, state) {
      published.push({ featureExternalId, state });
    },

    async publishStates(states) {
      for (const s of states) {
        published.push({
          featureExternalId: s.device_feature_external_id,
          state: s.state,
          text: s.text,
        });
      }
    },

    async publishDiscoveredDevices(devices) {
      return { devices };
    },

    async setConnectionStatus(connected, message) {
      connectionStatuses.push({ connected, message });
    },

    async getConfig() {
      return config;
    },

    async setConfig(partial) {
      setConfigCalls.push(partial);
      config = { ...config, ...partial };
    },
  };
}
