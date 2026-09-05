// HMAC-signed token helpers for owner-only access on Pages Functions.
//
// The flow:
//   - User visits /api/auth-owner?owner=<secret>; if it matches env.OWNER_SECRET
//     we sign a token with HMAC-SHA256 and return it as a Secure HttpOnly cookie.
//   - Protected endpoints (/live/details, /api/me) read the cookie, verify the
//     signature, and let the request through only when the token is valid and
//     not expired.
//   - The secret never leaves the Pages Function — clients only ever see the
//     resulting opaque token.

const COOKIE_NAME = 'yi_owner_token';
// 400 days is the maximum cookie lifetime browsers will honour (Chrome,
// Edge, Firefox, Safari all clamp at this). Combined with the auto-renew
// in /api/me — which issues a fresh 400-day cookie on every page load —
// this is effectively "never expires" for any owner who visits at least
// once a year. There is no browser-level way to set a truly infinite
// cookie; this is the longest the platform allows.
const COOKIE_MAX_AGE_SEC = 400 * 86400;

async function importHmacKey(secret) {
  const enc = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    'raw',
    enc,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function b64u(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64u(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const norm = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Sign an arbitrary JSON payload with HMAC-SHA256. Returns "<payload>.<sig>". */
export async function signToken(secret, payload) {
  const key = await importHmacKey(secret);
  const dataBytes = new TextEncoder().encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes);
  return `${b64u(dataBytes)}.${b64u(sig)}`;
}

/** Returns the original payload if the signature is valid AND not expired. */
export async function verifyToken(secret, token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [dataPart, sigPart] = token.split('.');
  if (!dataPart || !sigPart) return null;
  let dataBytes, sigBytes;
  try {
    dataBytes = unb64u(dataPart);
    sigBytes = unb64u(sigPart);
  } catch {
    return null;
  }
  const key = await importHmacKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, dataBytes);
  if (!ok) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(dataBytes));
  } catch {
    return null;
  }
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

export function getCookie(request, name = COOKIE_NAME) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setOwnerCookieHeader(token) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE_SEC}`,
    'Secure',
    'HttpOnly',
    'SameSite=Lax',
  ];
  return parts.join('; ');
}

export function clearOwnerCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}

/**
 * The /64 an IPv6 address sits on, normalised for comparison — or null when the
 * value is not IPv6.
 *
 * WHY THIS EXISTS
 * ---------------
 * macOS and iOS rotate the second half of an IPv6 address every few days, on
 * purpose: it is a privacy feature that stops a device being tracked across the
 * web by its address. The consequence here is that an exact-match allowlist
 * un-recognises the owner every time it rotates, and OWNER_IPS had grown to
 * roughly eighty entries — each one a network claimed again after the last
 * address expired. That is a race the list cannot win.
 *
 * The half that does NOT rotate is the network prefix: the first four hextets,
 * the /64. Matching on that means the home wifi keeps working through every
 * rotation and through every new phone or laptop that joins it, which is what
 * "recognise me on my own network" was always meant to mean.
 *
 * IPv4 is deliberately left alone — exact match only. There is no equivalent
 * "my network" half to an IPv4 address here: the addresses in the list are a
 * campus and a couple of mobile carriers, and widening those to a /24 would
 * hand owner access to a stranger sharing an ISP.
 */
function ipv6Prefix64(value) {
  const raw = String(value).trim().toLowerCase().split('/')[0];
  if (!raw.includes(':')) return null;

  const [head, tail = ''] = raw.split('::');
  const parts = head ? head.split(':').filter(Boolean) : [];
  const tailParts = tail ? tail.split(':').filter(Boolean) : [];

  if (raw.includes('::')) {
    const fill = 8 - parts.length - tailParts.length;
    if (fill < 0) return null;
    for (let i = 0; i < fill; i++) parts.push('0');
  }

  const full = parts.concat(tailParts);
  if (full.length < 4) return null;

  // Compare by value, so 00e6 and e6 are the same hextet.
  return full.slice(0, 4).map((h) => {
    const n = parseInt(h, 16);
    return Number.isNaN(n) ? 'x' : String(n);
  }).join(':');
}

/** Returns true if the request comes from an IP in the OWNER_IPS allowlist.
 *  OWNER_IPS is a comma-separated list set in wrangler.toml [vars]. The
 *  Cloudflare edge populates `cf-connecting-ip` with the visitor's real IP
 *  (no spoofing risk since this header is set by Cloudflare itself).
 *
 *  An IPv6 entry matches any address on the same /64 — see ipv6Prefix64 above.
 *  An entry may therefore be written as a bare address or as a prefix
 *  (`2a00:a041:e654:1c00::/64`); both mean the same network.
 */
function isOwnerByIP(request, env) {
  if (!env.OWNER_IPS) return false;
  const ip = String(request.headers.get('cf-connecting-ip') || '').trim().toLowerCase();
  if (!ip) return false;

  const ipPrefix = ipv6Prefix64(ip);

  for (const raw of String(env.OWNER_IPS).split(',')) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    if (entry === ip) return true;
    if (ipPrefix) {
      const entryPrefix = ipv6Prefix64(entry);
      if (entryPrefix && entryPrefix === ipPrefix) return true;
    }
  }
  return false;
}

/** True if the request carries a valid owner cookie OR comes from an
 *  allowlisted IP. The IP path is zero-effort — visiting from home/office
 *  needs no auth — while the cookie covers travel and new devices.
 */
export async function isOwner(request, env) {
  if (isOwnerByIP(request, env)) return true;
  if (!env.OWNER_SECRET) return false;
  const token = getCookie(request);
  if (!token) return false;
  const payload = await verifyToken(env.OWNER_SECRET, token);
  return !!payload && payload.scope === 'owner';
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
export const AUTH_COOKIE_MAX_AGE_SEC = COOKIE_MAX_AGE_SEC;
