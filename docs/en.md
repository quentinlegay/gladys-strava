# Strava

View your [Strava](https://www.strava.com) activities from Gladys: the
details of your latest activity, plus rolling 7-day and 30-day training
totals — all refreshed automatically, no manual sync.

## What you get

Two devices show up after installation:

- **Strava - Latest activity**: name, sport, distance, moving time, elevation
  gain, average speed and start date of your most recent Strava activity.
  Because this device keeps a history of its numeric features, the Gladys
  dashboard chart doubles as a lightweight timeline of your activities over
  time.
- **Strava - Training totals**: number of activities and distance covered
  over the last 7 days and the last 30 days, across every sport (run, ride,
  swim, hike...).

## Configuration

1. Create a free Strava API application at
   [strava.com/settings/api](https://www.strava.com/settings/api) (any
   Strava account can create one — no approval process).
2. In your Strava application settings, set the **"Authorization Callback
   Domain"** to the domain shown in your browser when you open this Gladys
   instance (without `https://` and without any path — e.g. `my-gladys.com`
   or `app.gladysassistant.com`).
3. Open the **Configuration** tab of the integration in Gladys, paste the
   **Client ID** and **Client Secret** from your Strava application, and
   save.
4. Click **Connect to Strava** and approve the read-only access request.
5. The two devices appear in the **Discovery** tab, ready to be added.

You can also choose the **unit system** (metric km/km/h or imperial
mi/mph) and the **refresh interval**. The interval is capped between 5
minutes and 1 hour to stay comfortably under Strava's API rate limits (100
requests / 15 minutes, 1000 / day) — the integration only ever needs one or
two requests per refresh.

## Actions

- **Test the Strava connection** — performs a live request to the Strava API
  and shows the connected athlete's name under the button. Useful right
  after connecting, or to check a stored token is still valid.

## Privacy

Gladys only requests the `activity:read_all` scope: it can read your
activities (including private ones), never edit, delete or upload anything
on your behalf. You can revoke access at any time from your
[Strava API settings](https://www.strava.com/settings/apps).

## Troubleshooting

- **"Not connected to Strava yet"** in the Configuration screen: click
  **Connect to Strava** and complete the authorization.
- **Token refresh failed**: your Strava application's Client ID/Secret may
  have changed, or the connection was revoked from the Strava side —
  reconnect from the Configuration screen.
- The integration logs everything it does: check the integration logs from
  the Gladys UI (or `docker logs` on the host) with `LOG_LEVEL=debug` for the
  full detail.
