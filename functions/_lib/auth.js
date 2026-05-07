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

/** Returns true if the request comes from an IP in the OWNER_IPS allowlist.
 *  OWNER_IPS is a comma-separated list set in wrangler.toml [vars]. The
 *  Cloudflare edge populates `cf-connecting-ip` with the visitor's real IP
 *  (no spoofing risk since this header is set by Cloudflare itself).
 */
function isOwnerByIP(request, env) {
  if (!env.OWNER_IPS) return false;
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip) return false;
  for (const entry of String(env.OWNER_IPS).split(',')) {
    if (entry.trim() === ip) return true;
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
