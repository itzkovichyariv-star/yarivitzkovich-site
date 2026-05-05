// Bot detection via User-Agent regex + Cloudflare's bot management score.
// Bots are still logged (for honesty), but flagged and suppressed from the
// live globe so the visualization stays clean.

// Curated regex for common crawlers / monitoring agents.
const BOT_UA_RE = /(bot|crawler|spider|crawling|facebookexternalhit|wget|curl|python-requests|httpie|java\/|go-http|axios\/|node-fetch|headlesschrome|preview)/i;

// RSS/feed readers — separate class so we can show them differently if desired.
const RSS_UA_RE = /(rss|feed|atom|inoreader|feedly|newsboat|netnewswire)/i;

/**
 * Classify a User-Agent string.
 * Returns one of: 'bot' | 'rss' | 'browser' | 'other'
 */
export function classifyUa(ua) {
  if (!ua) return 'other';
  if (RSS_UA_RE.test(ua)) return 'rss';
  if (BOT_UA_RE.test(ua)) return 'bot';
  if (/mozilla|webkit|chrome|safari|firefox|edg|opr/i.test(ua)) return 'browser';
  return 'other';
}

/**
 * Decide whether this request is a bot.
 * Combines UA classification with Cloudflare's bot management score
 * (1 = definitely bot, 99 = definitely human; only available on paid plans
 * but the score field still appears with a default on free plans).
 */
export function isBot(request) {
  const ua = request.headers.get('user-agent') || '';
  const ua_class = classifyUa(ua);
  if (ua_class === 'bot') return { is_bot: true, ua_class };
  if (ua_class === 'rss') return { is_bot: true, ua_class }; // exclude feed readers from globe

  const cf = request.cf || {};
  const score = cf.botManagement?.score;
  if (typeof score === 'number' && score < 30) {
    return { is_bot: true, ua_class };
  }

  return { is_bot: false, ua_class };
}
