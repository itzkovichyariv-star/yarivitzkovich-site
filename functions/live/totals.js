// GET /live/totals
// Aggregate stats for the HUD panels: since-launch totals,
// today's counts, top countries/continents in the last 24h,
// and the most-recent event. One round-trip per visitor.

export const onRequestGet = async ({ env }) => {
  if (!env.DB) {
    return jsonError(500, 'no_db_binding');
  }

  const now = Math.floor(Date.now() / 1000);
  const startOfTodayUtc = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);
  const last24h = now - 86400;

  // Run independent queries in parallel — D1 supports concurrent prepare/run.
  const [
    sinceLaunchRow,
    sinceLaunchByClassRow,
    countriesContinentsRow,
    todayRow,
    topCountriesResult,
    topContinentsResult,
    mostRecentRow,
    launchTsRow,
  ] = await Promise.all([
    // Total events ever (excluding bots)
    env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE is_bot = 0`).first(),

    // Class breakdown since launch — event-level, mutually exclusive.
    // Each event falls into exactly one bucket so firstTime+returning+
    // downloads = total non-bot events. The fairness fix for direct PDF
    // downloaders happens at WRITE time in /pdfs/[paper].js, which now
    // synthesizes a first_time visit alongside the download when the
    // person had no prior visit event today.
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN kind = 'download' THEN 1 ELSE 0 END) AS downloads,
         SUM(CASE WHEN kind = 'visit' AND visitor_class = 'first_time' THEN 1 ELSE 0 END) AS firstTime,
         SUM(CASE WHEN kind = 'visit' AND visitor_class = 'returning' THEN 1 ELSE 0 END) AS returningN
       FROM events
       WHERE is_bot = 0`
    ).first(),

    // Distinct countries + continents seen since launch
    env.DB.prepare(
      `SELECT
         COUNT(DISTINCT country) AS countries,
         COUNT(DISTINCT continent) AS continents
       FROM events
       WHERE is_bot = 0 AND country IS NOT NULL`
    ).first(),

    // Today's visits and downloads
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN kind = 'visit'    THEN 1 ELSE 0 END) AS visits,
         SUM(CASE WHEN kind = 'download' THEN 1 ELSE 0 END) AS downloads
       FROM events
       WHERE is_bot = 0 AND ts >= ?`
    ).bind(startOfTodayUtc).first(),

    // Top countries in last 24h
    env.DB.prepare(
      `SELECT country, country_name, COUNT(*) AS n
       FROM events
       WHERE is_bot = 0 AND ts >= ? AND country IS NOT NULL
       GROUP BY country, country_name
       ORDER BY n DESC
       LIMIT 8`
    ).bind(last24h).all(),

    // Top continents in last 24h
    env.DB.prepare(
      `SELECT continent, continent_name, COUNT(*) AS n
       FROM events
       WHERE is_bot = 0 AND ts >= ? AND continent IS NOT NULL
       GROUP BY continent, continent_name
       ORDER BY n DESC
       LIMIT 7`
    ).bind(last24h).all(),

    // Most-recent non-bot event
    env.DB.prepare(
      `SELECT ts, kind, visitor_class, paper_slug, paper_title,
              country, country_name, continent_name, city
       FROM events
       WHERE is_bot = 0
       ORDER BY ts DESC
       LIMIT 1`
    ).first(),

    // Launch timestamp seeded by migration
    env.DB.prepare(`SELECT value FROM site_meta WHERE key = 'launch_ts'`).first(),
  ]);

  const body = {
    sinceLaunch: {
      total: sinceLaunchRow?.n || 0,
      countries: countriesContinentsRow?.countries || 0,
      continents: countriesContinentsRow?.continents || 0,
      firstTime: sinceLaunchByClassRow?.firstTime || 0,
      returning: sinceLaunchByClassRow?.returningN || 0,
      downloads: sinceLaunchByClassRow?.downloads || 0,
    },
    today: {
      visits: todayRow?.visits || 0,
      downloads: todayRow?.downloads || 0,
    },
    topCountries: topCountriesResult?.results || [],
    topContinents: topContinentsResult?.results || [],
    mostRecent: mostRecentRow || null,
    launchTs: launchTsRow ? Number(launchTsRow.value) : null,
    serverNow: now,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=10, s-maxage=10',
    },
  });
};

function jsonError(status, code) {
  return new Response(JSON.stringify({ ok: false, error: code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
