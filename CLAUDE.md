# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

The **Strava** external integration of Gladys Assistant: a Node.js service
(Node 22+, ESM, no build step) that runs in its own sandboxed Docker container
and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency, and to the
[Strava API v3](https://developers.strava.com/docs/reference/) with the global
`fetch`. It started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js).

It is a **cloud-only** integration (manifest `transports: ["cloud"]`): every
piece of data comes from strava.com, nothing is reachable on the LAN.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
node --test --test-name-pattern "goal"    # tests whose name matches
LOG_LEVEL=silent npm test                 # without the integration logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          SDK instance, shutdown, connect() — nothing else
src/app.js                        every SDK handler, registered before connect(); config lifecycle
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults), normalization
src/strava/client.js              Strava HTTP client: OAuth2 tokens (rotating refresh token), API, push subscriptions
src/strava/summary.js             pure functions: snapshot (SI units), weeks, time zones, unit conversions
src/sync.js                       refresh loop: snapshot -> device, states, triggers, transport, widget nudge
src/athlete.js                    the athlete device: features, states, transport badge
src/triggers.js                   scene trigger keys + event data (manifest `scene_triggers`)
src/scenes.js                     scene action handlers (manifest `scene_actions`)
src/widgets.js                    dashboard widget handlers (manifest `widgets`)
src/actions.js                    Configuration screen buttons (manifest `actions`)
src/oauth.js                      "Connect" flow (manifest `oauth2` field)
src/webhooks.js                   Strava push subscription through Gladys Plus (manifest `webhooks`)
src/store.js                      /data/strava-state.json: activities already announced, goal week, subscription
gladys-assistant-integration.json manifest
docs/en.md, docs/fr.md            user documentation, re-hosted by Gladys (mandatory)
test/                             node --test, SDK fake Gladys + test/helpers/fakeStrava.js (fake `fetch`)
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

## Rules

- **External ids are forever.** The device is
  `gladys.externalIds('athlete', <Strava athlete id>)`; the feature keys of
  `FEATURE` in `src/athlete.js` are never renamed. Gladys keys devices, their
  history, scenes and dashboards on them. The same goes for every key users
  store: manifest `config_schema`, `actions`, `scene_triggers`,
  `scene_actions`, `widgets` and their settings, `webhooks`, the `oauth2`
  field `strava_account`, and the select option values.
- **Secrets.** The tokens live in the Gladys config under keys OUTSIDE the
  `config_schema` (`TOKEN_KEYS`), saved with `gladys.setConfig`. Strava
  rotates the refresh token at every refresh: the new one is kept in memory
  and saved before anything else, and a config echo never brings an older one
  back (`src/app.js`). Never log a token, the Client Secret or a webhook URL
  (the URL is the secret of a Gladys Plus webhook).
- **Strava quotas.** 100 read requests per 15 minutes and 1,000 per day per
  application. A refresh costs 2 requests (the profile is re-read once a day);
  keep it that way, and keep the 5-minute floor of `refresh_interval`.
- **Scene triggers fire once.** Each activity is announced once
  (`seen_activities` in `/data/strava-state.json`), the activities present at
  the first sync of an account are never announced, the weekly goal fires once
  per week. Event `data` only carries the keys declared in the manifest
  (`test/scenes.test.js`).
- **Webhooks are triggers, not data.** A Strava event only schedules a refresh
  through the API; Strava expects a `200` within 2 seconds, so never await the
  refresh in the handler. Without Gladys Plus the integration polls.
- **The container rootfs is read-only.** Write only under `/data`
  (`STRAVA_DATA_DIR` overrides it, for local runs).
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section.
- **Manifest.** Texts are multi-language objects `{ "en": ..., "fr": ... }`
  (`label`, `description`, `placeholder`), never plain strings; the catalog
  `description` holds 10 to 100 characters per language. `scene_triggers`,
  `scene_actions` and `widgets` require `gladys_version` `>=5.1.0`.
  `test/manifest.test.js` ties the manifest to the code: change both sides
  together.
- **User-facing text** is bilingual (English and French): action and status
  messages, widget contents, manifest texts, and `docs/en.md` / `docs/fr.md`,
  kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network: Strava goes through
  `test/helpers/fakeStrava.js`, Gladys through the SDK's `createFakeGladys`.
