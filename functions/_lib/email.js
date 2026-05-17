// Resend wrapper for transactional email.
//
// Resend is chosen because:
//   - free tier covers 3,000 emails/month — plenty for an academic
//     subscriber list and ten or so papers a year
//   - simple HTTPS POST, no SDK needed in the Worker runtime
//   - the deliverability is good once the domain is verified via DNS
//
// Required env vars (set in Cloudflare Pages → Settings → Variables):
//   RESEND_API_KEY    — re_xxx... from https://resend.com/api-keys
//   RESEND_FROM       — e.g. "Yariv Itzkovich <hello@yarivitzkovich.org>"
//                       (the FROM address must be on a Resend-verified domain)
//
// If either is missing, sendEmail() returns { ok: false, error: 'config' }
// so callers can degrade gracefully instead of crashing.

const RESEND_API = 'https://api.resend.com/emails';

export async function sendEmail({ env, to, subject, html, text, replyTo }) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    return { ok: false, error: 'config' };
  }

  const body = {
    from: env.RESEND_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(text ? { text } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  let res;
  try {
    res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: 'network', detail: String(err) };
  }

  if (!res.ok) {
    let detail = `http_${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) detail = j.message;
    } catch {}
    return { ok: false, error: 'resend_error', detail, status: res.status };
  }

  const data = await res.json().catch(() => ({}));
  return { ok: true, id: data?.id };
}

/**
 * Generate a 64-char hex token using Web Crypto.
 */
export async function makeToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * Minimal HTML escape for user-controlled values that we render into
 * email bodies (the email itself, the paper title, etc.).
 */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
