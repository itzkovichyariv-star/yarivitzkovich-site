// Event recording — orchestrates the geo + dedup + bot helpers and writes
// a single row to the D1 events table. Called by both the visit-tracking
// endpoint and the PDF-tracking endpoint.

import { extractGeo } from './geo.js';
import { hashVisitor, hashPerson, isDuplicate } from './dedup.js';
import { isBot } from './bot.js';

/**
 * Record one event. Returns:
 *   { recorded: true, event } on success
 *   { recorded: false, reason } if dedup'd or filtered
 */
export async function recordEvent({
  db,
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
