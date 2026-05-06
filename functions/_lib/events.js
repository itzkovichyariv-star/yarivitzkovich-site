// Event recording — orchestrates the geo + dedup + bot helpers and writes
// a single row to the D1 events table. Called by both the visit-tracking
// endpoint and the PDF-tracking endpoint.

import { extractGeo } from './geo.js';
import { hashVisitor, hashPerson, isDuplicate } from './dedup.js';
import { isBot } from './bot.js';

/**
 * Parse the OWNER_CITIES env var into a lowercase Set for O(1) lookup.
 * Empty / unset → empty Set, matches nothing.
 */
function parseOwnerCities(raw) {
  if (!raw) return new Set();
  return new Set(
    String(raw)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Record one event. Returns:
 *   { recorded: true, event } on success
 *   { recorded: false, reason } if dedup'd or filtered
 *
 * Pass `env` so we can read OWNER_CITIES and silently drop events
 * geo-tagged to the owner's habitual cities — works without the owner
 * signing in, on any device or browser.
 */
export async function recordEvent({
  db,
  env = {},
  request,
  kind,                  // 'visit' | 'download'
  visitor_class,         // 'first_time' | 'returning' | 'downloader'
  paper_slug = null,
  paper_title = null,
  page_path = null,
}) {
  if (!db) {
    return { recorded: false, reason: 'no_db_binding' };
  }

  const { is_bot, ua_class } = isBot(request);
  const geo = extractGeo(request);

  // Owner-city silent drop: catches the owner's own visits/downloads
  // when they're on a device that doesn't have the owner cookie set.
  // Trade-off: any genuine reader from one of these cities is also
  // skipped, accepted by the owner because their academic readership
  // is overwhelmingly outside Israel.
  const ownerCities = parseOwnerCities(env.OWNER_CITIES);
  if (geo.city && ownerCities.has(geo.city.toLowerCase())) {
    return { recorded: false, reason: 'owner_city' };
  }
  const [ip_hash, person_hash] = await Promise.all([
    hashVisitor({ request, kind, paper_slug: paper_slug || '' }),
    hashPerson({ request }),
  ]);

  // Dedup: same hash + kind + paper within 24h → skip.
  // Bots are also logged but with the dedup window applied.
  const dup = await isDuplicate(db, { ip_hash, kind, paper_slug });
  if (dup) {
    return { recorded: false, reason: 'duplicate' };
  }

  const ts = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO events (
        ts, kind, visitor_class, paper_slug, paper_title, page_path,
        country, country_name, continent, continent_name, city, region,
        lat, lng, ip_hash, person_hash, ua_class, is_bot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      ts,
      kind,
      visitor_class,
      paper_slug,
      paper_title,
      page_path,
      geo.country,
      geo.country_name,
      geo.continent,
      geo.continent_name,
      geo.city,
      geo.region,
      geo.lat,
      geo.lng,
      ip_hash,
      person_hash,
      ua_class,
      is_bot ? 1 : 0
    )
    .run();

  return {
    recorded: true,
    event: {
      ts, kind, visitor_class, paper_slug, paper_title, page_path,
      ...geo, ua_class, is_bot,
    },
  };
}
