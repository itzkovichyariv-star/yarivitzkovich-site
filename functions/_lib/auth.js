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
const COOKIE_MAX_AGE_SEC = 365 * 86400; // 1 year — Safari clears
                                        // shorter-lived cookies more
                                        // aggressively, so we go long.

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
    'SameSite=Strict',
  ];
  return parts.join('; ');
}

export function clearOwnerCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;
}

/** Convenience: returns true if the request carries a valid owner token. */
export async function isOwner(request, env) {
  if (!env.OWNER_SECRET) return false;
  const token = getCookie(request);
  if (!token) return false;
  const payload = await verifyToken(env.OWNER_SECRET, token);
  return !!payload && payload.scope === 'owner';
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
export const AUTH_COOKIE_MAX_AGE_SEC = COOKIE_MAX_AGE_SEC;
