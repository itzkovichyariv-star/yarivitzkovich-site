// GET /live/details?range=24h|7d|30d|1y|all
// Owner-only — returns the full event log for the requested time range,
// with all fields (timestamps, page paths, paper titles, geo, ua_class).
// The public /live/events endpoint trims to the visible-globe minimum;
// this endpoint is for the BreakdownDrawer that the owner sees.

import { isOwner } from '../_lib/auth.js';

const RANGE_SECONDS = {
  '24h': 24 * 3600,
  '7d':  7 * 86400,
  '30d': 30 * 86400,
  '1y':  365 * 86400,
  all:   null,
};

const MAX_ROWS = 5000;

export const onRequestGet = async ({ request, env }) => {
  if (!(await isOwner(request, env))) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'no_db_binding' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const rangeKey = (url.searchParams.get('range') || '7d').toLowerCase();
  if (!(rangeKey in RANGE_SECONDS)) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_range' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const sinceTs = RANGE_SECONDS[rangeKey] === null
    ? 0
    : Math.floor(Date.now() / 1000) - RANGE_SECONDS[rangeKey];

  // Pull the full row — including page_path, ua_class, is_bot which the
  // public endpoint omits. The drawer needs everything to render the
  // 3-column breakdown by event class.
  const result = await env.DB
    .prepare(
      `SELECT
         id, ts, kind, visitor_class,
         paper_slug, paper_title, page_path,
         country, country_name, continent, continent_name,
         city, region, lat, lng,
         ua_class, is_bot
       FROM events
       WHERE ts >= ?
       ORDER BY ts DESC
       LIMIT ?`
    )
    .bind(sinceTs, MAX_ROWS)
    .all();

  const events = result.results || [];

  // Quick aggregate counts by class so the drawer can show "First-time (3)
  // · Returning (2) · Downloads (1)" without re-walking the events array.
  let firstTime = 0, returning = 0, downloads = 0, bots = 0;
  for (const e of events) {
    if (e.is_bot) { bots++; continue; }
    if (e.kind === 'download') downloads++;
    else if (e.visitor_class === 'returning') returning++;
    else firstTime++;
  }

  return new Response(
    JSON.stringify({
      range: rangeKey,
      count: events.length,
      counts: { firstTime, returning, downloads, bots },
      events,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store, private',
      },
    }
  );
};
