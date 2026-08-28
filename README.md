# Gladys external integration — Strava

External integration for [Gladys Assistant](https://gladysassistant.com),
built with the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
from the
[official starter template](https://github.com/GladysAssistant/integration-template-js).

It connects to your [Strava](https://www.strava.com) account (OAuth2, one
read-only scope) and publishes two devices so you can **view your Strava
activities directly on the Gladys dashboard**, no manual sync:

| Device                   | What it shows                                                                                   | SDK hooks used                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Strava - Latest activity | Name, sport, distance, moving time, elevation gain, average speed and date of the last activity | `onOAuthAuthorizeUrl`, `onOAuthCallback`, `onPoll`, `onAction` |
| Strava - Training totals | Number of activities + distance, over rolling 7-day and 30-day windows, all sports combined     | `onPoll`                                                       |

Both devices are read-only sensors (no command to send back to Strava) and
keep history on their numeric features, so the Gladys dashboard chart doubles
as a lightweight timeline of your training.

See [`docs/en.md`](docs/en.md) / [`docs/fr.md`](docs/fr.md) for the full user
documentation (setup steps, actions, troubleshooting) — re-hosted by Gladys
and linked from the Configuration screen.

## Project structure

```
.
├─ index.js                          # SDK bootstrap: OAuth2 + polling wiring (no Strava logic)
├─ src/
│  ├─ devices/                       # ← one file per device type
│  │  ├─ index.js                    #   registry: list your devices here
│  │  ├─ latestActivity.js           #   most recent activity (poll + test_connection action)
│  │  └─ stats.js                    #   rolling 7d/30d training totals (poll)
│  ├─ strava/                        # Strava API client, isolated from the SDK wiring
│  │  ├─ api.js                      #   raw HTTP calls (authorize URL, token exchange/refresh, activities)
│  │  ├─ auth.js                     #   token cache, refresh-on-expiry, persistence via setConfig
│  │  └─ activities.js               #   cached fetch + aggregation + unit conversion (metric/imperial)
│  └─ config.js                      # config defaults + normalization
├─ docs/
│  ├─ en.md                          # user documentation (re-hosted by Gladys,
│  └─ fr.md                          #   linked from the Configuration screen)
├─ gladys-assistant-integration.json # manifest (name, config schema, OAuth2 field, image…)
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ .github/workflows/release.yml     # UI-driven release: bump + tag + build
└─ .github/workflows/build.yml       # multi-arch build (git tag or called by release)
```

The OAuth2 flow follows the SDK's standard Netatmo-style pattern (see the
[SDK README](https://github.com/GladysAssistant/integration-sdk-js)): the
manifest declares a `strava_connect` field of `type: "oauth2"`, which renders
a "Connect" button in the Configuration screen. Gladys relays the whole flow
— it never talks to Strava itself:

1. `gladys.onOAuthAuthorizeUrl` builds Strava's `/oauth/authorize` URL from
   the user's `client_id` and an anti-CSRF `state`.
2. `gladys.onOAuthCallback` verifies `state`, exchanges the `code` for an
   access + refresh token pair, and persists them through `gladys.setConfig`
   — keys **outside** the manifest `config_schema` (free internal storage,
   never shown in the UI).
3. `src/strava/auth.js` centralizes token reuse: every poll and action asks
   it for a valid access token, it refreshes automatically when the token is
   close to expiry, persists the rotated pair back to Gladys, and de-
   duplicates concurrent refreshes into a single HTTP call.
4. `src/strava/activities.js` fetches the recent activities once per refresh
   cycle (shared, short-lived cache) and both devices read from the same
   snapshot instead of doubling Strava API calls.

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="strava" \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the
integration runs inside its sandboxed container. The SDK reads them
automatically.

## Quality checks

```bash
npm run format:check   # Prettier: is everything formatted?
npm run format         # Prettier: format everything in place
npm run lint           # ESLint: catch real mistakes (unused vars, dead code…)
npm test               # Unit tests, via the built-in `node --test` runner
```

Tests live in [`test/`](test/) and use Node's native test runner — no extra
test framework to install:

- `test/config.test.js` — config defaults and normalization.
- `test/manifest.test.js` — manifest ⇄ code consistency (every action has a
  handler, `config_schema` defaults match `DEFAULT_CONFIG`, the OAuth2/secret
  fields are well-formed, every feature category is a real SDK constant).
- `test/devices.test.js` — device discovery payloads and `onPoll` behavior
  (unit conversion, rolling-window aggregation, the empty-activities case).
- `test/strava.test.js` — the Strava API client, the token refresh/dedupe
  logic and the activities cache, all against a mocked `fetch`.

## Validate before publishing

```bash
npx github:GladysAssistant/integration-store .
```

Runs the exact same checks as the store indexer (manifest JSON & schema,
Docker image availability, cover image, code rules) locally, before tagging a
release. See the
[integration store](https://github.com/GladysAssistant/integration-store) for
details.

## Publish in 5 steps

1. **Add the GitHub topic** `gladys-assistant-integration` to this repo.
2. Replace [`cover.png`](cover.png) with a real 800×534 px cover image
   (≤150 KB, PNG or JPEG) — the bundled one is still the template's generic
   placeholder. Strava's brand guidelines require using their official
   ["Compatible with Strava"](https://developers.strava.com/guidelines/)
   badge assets if you display Strava branding; do not reuse Strava's logo
   as your own cover freely.
3. Double-check `gladys-assistant-integration.json`: `docker_image` and
   `cover_image` already point at this repo
   (`ghcr.io/quentinlegay/gladys-strava`,
   `github.com/quentinlegay/gladys-strava`) — update them first if you fork
   under a different account.
4. **Release from the GitHub UI**: open **Actions → Release → Run
   workflow**, pick `patch`, `minor` or `major`. The workflow bumps the
   version everywhere (`package.json` + manifest `version`/`docker_image`),
   pushes the `vX.Y.Z` tag, and builds the `linux/amd64` + `linux/arm64`
   image to `ghcr.io` (`:X.Y.Z` and `:latest`).
5. The decentralized indexer picks up the new manifest `version` and Gladys
   offers a one-click install / update.

> Prefer the terminal? `git tag v1.0.0 && git push --tags` still works — see
> the template's own README section on this for the details it does **not**
> cover (version bump, manifest sync).

## Notes

- Requires **Node.js ≥ 20** (uses the built-in global `fetch`; no HTTP dep).
- Strava scope requested: `activity:read_all` (read, including private
  activities — never write). Users can revoke it any time from
  [strava.com/settings/apps](https://www.strava.com/settings/apps).
- `poll_frequency` is bounded to [300 s, 3600 s] in the manifest: at the
  minimum interval that's still well under Strava's default rate limits (100
  requests / 15 min, 1000 / day), since each refresh cycle costs at most two
  requests thanks to the shared activities cache.
- All external identifiers are prefixed with `ext:<selector>:` — built with
  `gladys.externalIds(type, platformId)`. The two devices use a fixed
  platform id (`latest`, `summary`), not the ever-changing Strava activity
  id, so re-publishing never creates a new device on every ride.

## License

Apache-2.0
