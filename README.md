# Gladys Strava

[Gladys Assistant](https://gladysassistant.com) external integration for
[Strava](https://www.strava.com): your activities and statistics as Gladys
sensors, scene triggers and actions, and dashboard widgets.

Built with the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
from the official
[integration template](https://github.com/GladysAssistant/integration-template-js).

- **Type**: `device` — **transport**: `cloud` (Strava API, nothing local)
- **Requires**: Gladys ≥ 5.1.0, a Strava account and your own Strava API
  application (free)
- **User documentation**: [English](docs/en.md) · [Français](docs/fr.md) ·
  [Deutsch](docs/de.md) · [Español](docs/es.md)

## Features

| Surface             | What you get                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account             | OAuth2 "Connect" button with your own Strava API application; tokens refreshed automatically; "Unlink" action revokes the access                          |
| Device              | One athlete device: last activity (name, sport, distance, moving time, elevation, speed), week distance and time, run/ride/swim distances (4 weeks, year) |
| Scene triggers      | `new_activity` (filter by sport), `personal_record`, `weekly_goal_reached`                                                                                |
| Scene actions       | `sync_now`, `get_stats` (week, 4 weeks, year, all time × sport), `get_last_activity`                                                                      |
| Dashboard widgets   | `weekly_summary` (tiles, 7-day chart, goal, sync button), `recent_activities` (latest activities, sport filter, links)                                    |
| Configuration       | Actions "Test the connection", "Synchronize now", "Unlink the Strava account"; units metric/imperial; refresh interval; weekly goal (distance or time)    |
| Webhooks (optional) | With Gladys Plus, a Strava push subscription announces new activities within seconds                                                                      |
| Transport badge     | `cloud`, orange dot when the Strava rate limit is hit, `unreachable` when Strava refuses the access                                                       |

## How it works

```
                 every N minutes, or a Strava webhook (Gladys Plus)
                                   │
 Strava API  ──►  src/sync.js  ──► snapshot ──► device + states   (publishChangedStates)
 (2 requests)                         │     ──► scene triggers    (publishSceneEvent, once each)
                                      │     ──► transport badge   (publishTransports)
                                      └───────► widgets nudge     (requestWidgetRefresh)
```

A refresh costs two Strava requests (stats + the 30 latest activities; the
profile is re-read once a day), far below the Strava quotas (100 requests per
15 minutes, 1,000 per day). The activities already announced are remembered
in `/data/strava-state.json`, so a restart never fires a trigger twice.

## Project structure

```
.
├─ index.js                          # SDK instance, graceful shutdown, connect()
├─ src/
│  ├─ app.js                         # every SDK handler, config lifecycle
│  ├─ config.js                      # defaults + normalization
│  ├─ strava/client.js               # Strava HTTP client (OAuth2, API, push subscriptions)
│  ├─ strava/summary.js              # pure computations: weeks, totals, units, time zones
│  ├─ sync.js                        # refresh loop
│  ├─ athlete.js                     # the athlete device
│  ├─ triggers.js                    # scene triggers
│  ├─ scenes.js                      # scene actions
│  ├─ widgets.js                     # dashboard widgets
│  ├─ actions.js                     # Configuration screen actions
│  ├─ oauth.js                       # "Connect" flow
│  ├─ webhooks.js                    # Strava webhooks through Gladys Plus
│  └─ store.js                       # local state under /data
├─ docs/{en,fr,de,es}.md             # user documentation (re-hosted by Gladys)
├─ test/                             # node --test, fake Gladys (SDK) + fake Strava
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md                      # Keep a Changelog, rolled by the Release workflow
├─ CLAUDE.md                         # project rules for coding assistants & contributors
├─ SECURITY.md                       # how to report a vulnerability privately
├─ .github/workflows/ci.yml          # format, lint, tests (Node 22 + 24), Docker build
├─ .github/workflows/release.yml     # UI-driven release: bump + changelog + tag + build
├─ .github/workflows/build.yml       # multi-arch build (git tag, manual run, or called by release)
├─ .github/workflows/github-release.yml # GitHub Release of every version tag
├─ .github/scripts/release.mjs       # release helpers (manifest bump, changelog)
├─ .github/dependabot.yml            # weekly npm / monthly GitHub Actions updates
└─ cover.png                         # catalog cover, 800×534 px
```

## Development

```bash
npm install
npm test               # unit and end-to-end tests (node --test), no network
npm run lint           # ESLint
npm run format:check   # Prettier
```

The tests drive the whole integration (`src/app.js`) against the SDK's fake
Gladys (`createFakeGladys`, which refuses what the real host API refuses) and a
fake Strava API ([`test/helpers/fakeStrava.js`](test/helpers/fakeStrava.js)).
Widget contents are checked with `validateWidgetContent`, scene events and
outputs against the manifest declarations.

Run it against a real Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="strava" \
STRAVA_DATA_DIR=./data \
LOG_LEVEL=debug \
npm start
```

Check the store admission rules locally (the image check only passes once a
version is released):

```bash
npx github:GladysAssistant/integration-store .
```

## Release

1. Describe your changes under `## [Unreleased]` in
   [`CHANGELOG.md`](CHANGELOG.md).
2. Open **Actions → Release → Run workflow** and pick `patch`, `minor` or
   `major` (the repository starts at `0.0.0`: pick `minor` for `0.1.0` or
   `major` for `1.0.0`).
3. The workflow bumps `package.json`, `package-lock.json` and the manifest
   (`version` + `docker_image`), moves the changelog section under the new
   version, tags `vX.Y.Z`, builds the `linux/amd64` + `linux/arm64` image to
   `ghcr.io/quentinlegay/gladys-strava` (`:X.Y.Z` and `:latest`) and publishes
   the GitHub Release.

To be listed in the Gladys integration store, the repository must be public
and carry the GitHub topic `gladys-assistant-integration`, and the GHCR
package must be public. Turn on **Private vulnerability reporting** in the
repository's security settings: [`SECURITY.md`](SECURITY.md) sends reporters
there.

## License

Apache-2.0. Strava is a trademark of Strava, Inc.; this project is not
affiliated with Strava.
