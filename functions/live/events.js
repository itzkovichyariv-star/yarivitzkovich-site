// GET /live/events?range=4h|24h|7d|30d|all&paper=<slug>
// Returns recent events for the live globe. Excludes bots.
// Cap at 5,000 rows per response.

const RANGE_SECONDS = {
  '4h': 4 * 3600,
  '24h': 24 * 3600,
  '7d': 7 * 86400,
  '30d': 30 * 86400,
  '1y': 365 * 86400,
  all: null, // no time bound
};

const MAX_ROWS = 5000;

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) {
    return jsonError(500, 'no_db_binding');
  }

  const url = new URL(request.url);
  const paperSlug = url.searchParams.get('paper');

  // Accept either explicit calendar bounds (?from=<unix>&to=<unix>) for the
  // period navigator (specific month / year), or the legacy relative ?range=
  // key. Bounds take precedence when both are present.
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  let sinceTs;
  let untilTs = null;

  if (fromParam && toParam) {
    sinceTs = parseInt(fromParam, 10);
    untilTs = parseInt(toParam, 10);
    if (isNaN(sinceTs) || isNaN(untilTs) || sinceTs >= untilTs) {
      return jsonError(400, 'invalid_range');
    }
  } else {
    const rangeKey = (url.searchParams.get('range') || '7d').toLowerCase();
    if (!(rangeKey in RANGE_SECONDS)) {
      return jsonError(400, 'invalid_range');
    }
    sinceTs = RANGE_SECONDS[rangeKey] === null
      ? 0
      : Math.floor(Date.now() / 1000) - RANGE_SECONDS[rangeKey];
  }

  // Build the query incrementally so we only bind values we actually use.
  let where = 'is_bot = 0 AND ts >= ?';
  const params = [sinceTs];
  if (untilTs != null) {
    where += ' AND ts <= ?';
    params.push(untilTs);
  }
  if (paperSlug) {
    where += ' AND paper_slug = ?';
    params.push(paperSlug);
  }

  const sql = `
    SELECT
      ts, kind, visitor_class,
      paper_slug, paper_title, page_path,
      country, country_name, continent, continent_name,
      city, lat, lng
    FROM events
    WHERE ${where}
    ORDER BY ts DESC
    LIMIT ?
  `;
  params.push(MAX_ROWS);

  const result = await env.DB.prepare(sql).bind(...params).all();
  const events = result.results || [];

  return new Response(
    JSON.stringify({
      from: sinceTs,
      to: untilTs,
      paper: paperSlug,
      count: events.length,
      events,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Cache briefly at the edge so repeated loads don't hammer D1.
        // P2 will replace this with SSE-driven freshness.
        'cache-control': 'public, max-age=10, s-maxage=10',
      },
    }
  );
};

function jsonError(status, code) {
  return new Response(JSON.stringify({ ok: false, error: code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
