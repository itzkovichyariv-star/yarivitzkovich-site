// Daily-rotating salted hash for visitor identification.
// We never store raw IPs. The hash is scoped per (kind, paper_slug) and
// rotates each UTC day, so the same visitor refreshing on day N+1 produces
// a different hash than day N.

/**
 * Compute SHA-256 hex digest of `input`.
 */
async function sha256Hex(input) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(hash);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * Get the visitor's IP from the Cloudflare-tagged request.
 * Falls back to a fixed string for local dev.
 */
function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local-dev';
}

/**
 * Today's UTC date as YYYY-MM-DD.
 */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Hash an IP into a privacy-safe identifier scoped to (kind, paper_slug, day).
 */
export async function hashVisitor({ request, kind, paper_slug = '' }) {
  const ip = clientIp(request);
  const day = todayUtc();
  return await sha256Hex(`${ip}|${day}|${kind}|${paper_slug}`);
}

/**
 * Hash an IP into a stable per-person identifier for the day. Unlike
 * hashVisitor, the kind and paper_slug are not part of the salt, so the
 * same person visiting the homepage and then downloading a PDF produces
 * the same person_hash for both events. Used for cross-kind person counts
 * (e.g. "first-time visitors, with downloads counting as visits too").
 */
export async function hashPerson({ request }) {
  const ip = clientIp(request);
  const day = todayUtc();
  return await sha256Hex(`person|${ip}|${day}`);
}

/**
 * Check whether this exact (ip_hash, kind, paper_slug) has already been
 * recorded in the last 24 hours. Returns true if a duplicate exists.
 */
export async function isDuplicate(db, { ip_hash, kind, paper_slug = null, withinSeconds = 86400 }) {
  const sinceTs = Math.floor(Date.now() / 1000) - withinSeconds;
  const row = await db
    .prepare(
      `SELECT id FROM events
       WHERE ip_hash = ?
         AND kind = ?
         AND ((paper_slug IS NULL AND ? IS NULL) OR paper_slug = ?)
         AND ts >= ?
       LIMIT 1`
    )
    .bind(ip_hash, kind, paper_slug, paper_slug, sinceTs)
    .first();
  return !!row;
}
