# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.0.1] - 2026-10-12

### Added

- Strava account linking through the Gladys "Connect" button (OAuth2), with
  your own Strava API application; the tokens are refreshed automatically and
  can be revoked with the "Unlink the Strava account" action.
- An athlete device with read-only sensors: last activity (name, sport,
  distance, moving time, elevation gain, average speed), distance and moving
  time of the week, run / ride / swim distances of the last 4 weeks and of the
  year. Metric or imperial units.
- Scene triggers: new activity (filtered by sport), personal record, and weekly
  distance goal reached.
- Scene actions: synchronize now, get the statistics of a period, get the last
  activity — their outputs feed the following actions of the scene.
- Dashboard widgets: "Strava this week" (tiles, 7-day chart, goal, sync button)
  and "Strava activities" (latest activities, filtered by sport, with links).
- Optional Strava webhooks relayed by Gladys Plus: new activities are announced
  within seconds instead of at the next refresh.
- Cloud transport badge on the device: unreachable when Strava refuses the
  access, degraded when the Strava rate limit is reached.
- Configuration actions: test the connection, synchronize now.
- English and French documentation.
- CI (format, lint, tests on Node 22 and 24, Docker build), UI-driven Release
  workflow, multi-arch image build and GitHub Releases.

[Unreleased]: https://github.com/quentinlegay/gladys-strava/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/quentinlegay/gladys-strava/releases/tag/v0.0.1
