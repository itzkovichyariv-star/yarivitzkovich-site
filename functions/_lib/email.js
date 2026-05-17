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
 * Owner-notification email — fire-and-forget wrapper around sendEmail.
 *
 * Sends a short admin notice to env.OWNER_EMAIL whenever something
 * notable happens (new subscriber, unsubscribe, campaign sent, QC
 * findings). Silently no-ops if OWNER_EMAIL or RESEND_API_KEY isn't
 * configured, so a missing setup never breaks the primary flow.
 *
 * Errors are swallowed (logged to console for the Pages dashboard) so
 * a transient Resend hiccup never prevents the caller's main work
 * from completing.
 */
export async function notifyOwner({ env, subject, html, text }) {
  if (!env.OWNER_EMAIL) return { ok: false, error: 'no_owner_email' };
  try {
    const res = await sendEmail({
      env,
      to: env.OWNER_EMAIL,
      subject: `[yarivitzkovich.org] ${subject}`,
      html,
      text,
    });
    if (!res.ok) console.error('notifyOwner failed:', res);
    return res;
  } catch (err) {
    console.error('notifyOwner threw:', err);
    return { ok: false, error: 'exception', detail: String(err) };
  }
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
