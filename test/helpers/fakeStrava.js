// -----------------------------------------------------------------------------
// A fake Strava API: a `fetch` replacement serving fixtures, recording every
// request, and able to fail on demand. The tests never touch the network.
// -----------------------------------------------------------------------------

// Wednesday 14 October 2026, 18:00 UTC: the week started on Monday the 12th.
export const NOW = Date.parse('2026-10-14T18:00:00Z');

export const ATHLETE = { id: 4242, firstname: 'Ada', lastname: 'Lovelace' };

const TZ = '(GMT+01:00) Europe/Paris';

export function activity(overrides) {
  return {
    name: 'Activity',
    sport_type: 'Run',
    type: 'Run',
    timezone: TZ,
    distance: 0,
    moving_time: 0,
    elapsed_time: 0,
    total_elevation_gain: 0,
    average_speed: 0,
    pr_count: 0,
    achievement_count: 0,
    kudos_count: 0,
    ...overrides,
  };
}

export const ACTIVITIES = [
  activity({
    id: 101,
    name: 'Evening Run',
    sport_type: 'Run',
    start_date: '2026-10-13T17:00:00Z',
    start_date_local: '2026-10-13T19:00:00Z',
    distance: 10200,
    moving_time: 3120,
    total_elevation_gain: 85,
    average_speed: 3.27,
    pr_count: 1,
    kudos_count: 4,
  }),
  activity({
    id: 100,
    name: 'Morning Ride',
    sport_type: 'Ride',
    start_date: '2026-10-12T06:00:00Z',
    start_date_local: '2026-10-12T08:00:00Z',
    distance: 42000,
    moving_time: 5400,
    total_elevation_gain: 410,
    average_speed: 7.78,
  }),
  activity({
    id: 99,
    name: 'Sunday swim',
    sport_type: 'Swim',
    start_date: '2026-10-11T09:00:00Z',
    start_date_local: '2026-10-11T11:00:00Z',
    distance: 2000,
    moving_time: 2700,
    average_speed: 0.74,
  }),
  activity({
    id: 98,
    name: 'Hike',
    sport_type: 'Hike',
    start_date: '2026-10-05T08:00:00Z',
    start_date_local: '2026-10-05T10:00:00Z',
    distance: 15000,
    moving_time: 14400,
    total_elevation_gain: 900,
    average_speed: 1.04,
  }),
];

const totals = (count, distance, moving_time, elevation_gain) => ({
  count,
  distance,
  moving_time,
  elapsed_time: moving_time,
  elevation_gain,
});

export const STATS = {
  recent_run_totals: totals(8, 64000, 21000, 500),
  recent_ride_totals: totals(4, 160000, 21600, 1800),
  recent_swim_totals: totals(2, 4000, 5400, 0),
  ytd_run_totals: totals(90, 820000, 280000, 6000),
  ytd_ride_totals: totals(40, 2100000, 300000, 21000),
  ytd_swim_totals: totals(10, 21000, 30000, 0),
  all_run_totals: totals(400, 3600000, 1200000, 30000),
  all_ride_totals: totals(150, 8000000, 1100000, 90000),
  all_swim_totals: totals(30, 60000, 90000, 0),
};

/** Config of a linked account, with a token valid for hours. */
export function linkedConfig(overrides = {}) {
  return {
    client_id: '1234',
    client_secret: 'app-secret',
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expires_at: NOW + 6 * 3600 * 1000,
    athlete_id: String(ATHLETE.id),
    ...overrides,
  };
}

function json(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-RateLimit-Usage': '3,30' },
  });
}

/**
 * @returns {{ fetch: typeof fetch, requests: object[], data: object, failNext: Function }}
 */
export function createFakeStrava({ now = () => NOW } = {}) {
  const data = {
    athlete: { ...ATHLETE },
    stats: structuredClone(STATS),
    activities: structuredClone(ACTIVITIES),
    subscriptions: [],
    tokenCounter: 1,
    validAccessTokens: new Set(['access-1']),
    validRefreshToken: 'refresh-1',
  };
  const requests = [];
  const failures = [];

  async function fetch(url, options = {}) {
    const { pathname, searchParams } = new URL(url);
    const method = options.method ?? 'GET';
    const form = options.body instanceof URLSearchParams ? Object.fromEntries(options.body) : {};
    const auth = options.headers?.Authorization;
    requests.push({ method, path: pathname, query: Object.fromEntries(searchParams), form, auth });

    const failure = failures.findIndex((f) => !f.path || pathname.includes(f.path));
    if (failure !== -1) {
      const [{ status }] = failures.splice(failure, 1);
      if (status === 0) {
        throw new TypeError('fetch failed');
      }
      return json(status, { message: 'error' });
    }

    if (pathname === '/oauth/token') {
      const valid =
        (form.grant_type === 'authorization_code' && form.code === 'good-code') ||
        (form.grant_type === 'refresh_token' && form.refresh_token === data.validRefreshToken);
      if (!valid || form.client_secret !== 'app-secret') {
        return json(400, { message: 'Bad Request' });
      }
      data.tokenCounter += 1;
      const access = `access-${data.tokenCounter}`;
      data.validAccessTokens = new Set([access]);
      data.validRefreshToken = `refresh-${data.tokenCounter}`;
      return json(200, {
        token_type: 'Bearer',
        access_token: access,
        refresh_token: data.validRefreshToken,
        expires_at: Math.floor(now() / 1000) + 6 * 3600,
        ...(form.grant_type === 'authorization_code' ? { athlete: data.athlete } : {}),
      });
    }
    if (pathname === '/oauth/deauthorize') {
      return json(200, {});
    }
    if (pathname === '/api/v3/push_subscriptions') {
      if (method === 'GET') {
        return json(200, data.subscriptions);
      }
      const id = 900 + data.subscriptions.length;
      data.subscriptions.push({ id, callback_url: form.callback_url });
      return json(201, { id });
    }
    if (pathname.startsWith('/api/v3/push_subscriptions/')) {
      const id = Number(pathname.split('/').pop());
      data.subscriptions = data.subscriptions.filter((s) => s.id !== id);
      return json(204);
    }

    // Authenticated athlete endpoints.
    if (!auth || !data.validAccessTokens.has(auth.replace('Bearer ', ''))) {
      return json(401, { message: 'Authorization Error' });
    }
    if (pathname === '/api/v3/athlete') {
      return json(200, data.athlete);
    }
    if (pathname === `/api/v3/athletes/${data.athlete.id}/stats`) {
      return json(200, data.stats);
    }
    if (pathname === '/api/v3/athlete/activities') {
      return json(200, data.activities.slice(0, Number(searchParams.get('per_page')) || 30));
    }
    return json(404, { message: 'Record Not Found' });
  }

  return {
    fetch,
    requests,
    data,
    /** Fail the next request whose path contains `path` (any request without). */
    failNext(status, path) {
      failures.push({ status, path });
    },
  };
}
