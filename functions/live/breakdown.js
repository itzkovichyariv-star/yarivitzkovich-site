// GET /live/breakdown?class=first_time|returning|download
// Returns an all-time city/country breakdown for the requested
// visitor class so the SINCE LAUNCH tooltips in GlobeHUD can show the
// counts that exactly match the headline numbers (the previous client-
// side filter could only see events in the page's current range
// filter — typically 7d — so an "8 first-time" headline often paired
// with a tooltip listing far fewer cities).

const VALID_CLASSES = new Set(['first_time', 'returning', 'download']);

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return jsonError(500, 'no_db_binding');

  const url = new URL(request.url);
  const cls = (url.searchParams.get('class') || '').toLowerCase();
  if (!VALID_CLASSES.has(cls)) return jsonError(400, 'invalid_class');

  // For "download" we filter on kind. For first_time / returning we
  // filter on visitor_class AND require kind='visit' so a download
  // event doesn't double-count under its own visitor class.
  let where;
  if (cls === 'download') {
    where = `is_bot = 0 AND kind = 'download'`;
  } else {
    where = `is_bot = 0 AND kind = 'visit' AND visitor_class = ?`;
  }

  const sql = `
    SELECT
      city,
      country,
      country_name,
      continent,
      continent_name,
      COUNT(*) AS n
    FROM events
    WHERE ${where}
    GROUP BY city, country, country_name, continent, continent_name
    ORDER BY n DESC
    LIMIT 200
  `;

  const stmt = cls === 'download'
    ? env.DB.prepare(sql)
    : env.DB.prepare(sql).bind(cls);
  const result = await stmt.all();

  return new Response(
    JSON.stringify({
      class: cls,
      rows: result.results || [],
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
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
