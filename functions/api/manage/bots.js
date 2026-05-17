// GET /api/manage/bots — bot-activity summary for /manage/bots
//
// Returns counts of bot events overall and per time window, breakdown
// by ua_class (search-engine bot vs RSS reader vs other), top
// originating countries, and a sample of the most recent bot rows so
// the owner can spot-check what's hitting the site.

import { isOwner } from '../../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  const now = Math.floor(Date.now() / 1000);
  const last24h = now - 86400;
  const last7d = now - 7 * 86400;

  const [overall, today24h, week7d, classBreakdown, countries, recent] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN kind='visit' THEN 1 ELSE 0 END) AS visits,
         SUM(CASE WHEN kind='download' THEN 1 ELSE 0 END) AS downloads
       FROM events WHERE is_bot = 1`
    ).first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total FROM events WHERE is_bot = 1 AND ts >= ?`
    ).bind(last24h).first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total FROM events WHERE is_bot = 1 AND ts >= ?`
    ).bind(last7d).first(),
    env.DB.prepare(
      `SELECT COALESCE(ua_class, 'unknown') AS ua_class, COUNT(*) AS n
       FROM events
       WHERE is_bot = 1
       GROUP BY ua_class
       ORDER BY n DESC`
    ).all(),
    env.DB.prepare(
      `SELECT country, country_name, COUNT(*) AS n
       FROM events
       WHERE is_bot = 1 AND country IS NOT NULL
       GROUP BY country, country_name
       ORDER BY n DESC
       LIMIT 8`
    ).all(),
    env.DB.prepare(
      `SELECT id, ts, kind, paper_slug, page_path, country_name, ua_class
       FROM events
       WHERE is_bot = 1
       ORDER BY ts DESC
       LIMIT 25`
    ).all(),
  ]);

  return json({
    ok: true,
    overall,
    last_24h: today24h.total,
    last_7d: week7d.total,
    by_ua_class: classBreakdown.results || [],
    top_countries: countries.results || [],
    recent: recent.results || [],
  });
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
