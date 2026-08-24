// Root middleware — Markdown content negotiation (acceptmarkdown.com).
//
// One URL, two representations. A browser asking for `text/html` gets the
// page it always got; an AI agent asking for `text/markdown` gets the
// Markdown twin that scripts/gen-markdown-twins.mjs derived from that
// exact page at build time. Both variants carry `Vary: Accept` so a CDN
// can't hand the HTML it cached for a browser to an agent that asked for
// Markdown (or the reverse) — that cache-poisoning case is the whole
// reason the header is mandatory rather than nice-to-have.
//
// Design constraints, since this runs in front of every request:
//   • Do nothing measurable on the hot path. Non-page requests (assets,
//     PDFs, API routes) short-circuit on a single extension check before
//     any header parsing happens.
//   • Never change what a browser receives. Browsers send
//     `text/html,...;q=0.9,*/*;q=0.8`, which ranks HTML above Markdown,
//     so they fall through untouched apart from the Vary header.
//   • Fail open. Any error in the negotiation path returns the original
//     response rather than an error page.
//
// On 406: RFC 9110 §15.5.7 permits a server to send a non-acceptable
// representation instead of 406, and we take that option deliberately. A
// client that asks for, say, `application/json` on a content page gets
// the HTML rather than a hard failure — refusing service to unknown
// clients would be a behavior regression with no upside here.

const SITE_MARKDOWN_TYPES = ['text/markdown', 'text/x-markdown'];
const HTML_TYPE = 'text/html';

// Paths the negotiation layer must not touch, directory index included.
// Pages Functions routes and the owner console produce their own content
// types; the rest is static media with no Markdown representation.
const OPAQUE_PREFIXES = ['/api/', '/pdfs/', '/manage/', '/_astro/', '/pagefind/', '/auth', '/callback'];

// /live is the one path that is both: a page (src/pages/live.astro) AND
// a namespace of Pages Functions (/live/events, /live/totals,
// /live/breakdown, /live/details). Listing "/live/" among the opaque
// prefixes above would take the page down with the functions — and it
// did, silently, for the trailing-slash form the sitemap actually
// publishes. The page is negotiable; anything below it is not.
const LIVE_FUNCTION_ROUTE = /^\/live\/.+/;

/**
 * Parse an Accept header into media ranges with their q-values.
 * Malformed parameters are ignored rather than thrown on — an agent with
 * a slightly wrong header should still get a usable response.
 */
function parseAccept(header) {
  const ranges = [];
  for (const part of String(header || '').split(',')) {
    const [rawType, ...params] = part.trim().split(';');
    const type = rawType.trim().toLowerCase();
    if (!type.includes('/')) continue;
    let q = 1;
    for (const param of params) {
      const [k, v] = param.split('=');
      if (k && k.trim().toLowerCase() === 'q') {
        const parsed = Number.parseFloat(v);
        if (Number.isFinite(parsed)) q = Math.min(Math.max(parsed, 0), 1);
      }
    }
    const [t, s] = type.split('/');
    ranges.push({ type: t, subtype: s, q });
  }
  return ranges;
}

/**
 * The q-value this Accept header assigns to `mediaType`, resolved the way
 * RFC 9110 §12.5.1 requires: the most specific matching range wins, so a
 * header listing text/html explicitly alongside a wildcard at q=0.8
 * scores text/html at 1 and text/markdown at 0.8.
 */
function qualityOf(ranges, mediaType) {
  const [type, subtype] = mediaType.split('/');
  let best = null;
  for (const r of ranges) {
    let specificity;
    if (r.type === type && r.subtype === subtype) specificity = 3;
    else if (r.type === type && r.subtype === '*') specificity = 2;
    else if (r.type === '*' && r.subtype === '*') specificity = 1;
    else continue;
    if (!best || specificity > best.specificity) best = { specificity, q: r.q };
  }
  return best ? best.q : 0;
}

/**
 * True when the client ranks Markdown strictly above HTML.
 *
 * Strictly above, not "at least", on purpose: a bare wildcard Accept
 * (curl, most HTTP libraries, link checkers) scores both at 1, and those
 * clients have always received HTML here. Ties keep the existing behavior.
 */
function prefersMarkdown(header) {
  if (!header) return false;
  const ranges = parseAccept(header);
  if (ranges.length === 0) return false;
  const markdown = Math.max(...SITE_MARKDOWN_TYPES.map((t) => qualityOf(ranges, t)));
  const html = qualityOf(ranges, HTML_TYPE);
  return markdown > 0 && markdown > html;
}

/**
 * Page paths are extensionless ("/about", "/publications/x") or end in a
 * slash. Anything with a file extension is an asset and is left alone —
 * except .md itself, which is served as a first-class representation.
 */
function isNegotiablePath(pathname) {
  if (OPAQUE_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  if (LIVE_FUNCTION_ROUTE.test(pathname)) return false;
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (lastSegment === '') return true;
  return !lastSegment.includes('.');
}

/** Where gen-markdown-twins.mjs put the Markdown for this route. */
function twinPathFor(pathname) {
  if (pathname === '/') return '/index.md';
  const trimmed = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return `${trimmed}.md`;
}

/**
 * Add Accept to Vary without dropping whatever was already there.
 *
 * Only HTML responses are rewritten. A redirect, a range response or an
 * asset served through this path is returned byte-for-byte as the
 * pipeline produced it — reconstructing those buys nothing and is the
 * kind of thing that quietly breaks a download six months from now.
 */
function withVaryAccept(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('text/html')) return response;

  const headers = new Headers(response.headers);
  const existing = headers.get('vary');
  const tokens = existing
    ? existing.split(',').map((t) => t.trim()).filter(Boolean)
    : [];
  if (!tokens.some((t) => t.toLowerCase() === 'accept')) tokens.unshift('Accept');
  if (!tokens.some((t) => t.toLowerCase() === 'accept-encoding')) tokens.push('Accept-Encoding');
  headers.set('vary', tokens.join(', '));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Build the Markdown variant.
 *
 * `source` is the asset-pipeline response the body came from. Its headers
 * are carried over so the Markdown variant is governed by the same
 * caching and security policy as every other response on the site —
 * building a Response from scratch silently drops nosniff, the referrer
 * policy and cache-control, which is how a "just set the content type"
 * change quietly becomes a security regression. Content-Type, Vary and
 * the length headers are the only ones this owns.
 */
function markdownResponse(body, status, source = null) {
  const headers = new Headers(source ? source.headers : undefined);
  // RFC 7763 registers text/markdown; the charset is required for an
  // agent to decode the em dashes and Hebrew this site actually uses.
  headers.set('content-type', 'text/markdown; charset=utf-8');
  headers.set('vary', 'Accept, Accept-Encoding');
  // The body is re-emitted here, so any length or encoding the source
  // declared no longer describes it.
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(body, { status, headers });
}

/**
 * Fetch a build-time asset by path. `next()` re-enters the Pages asset
 * pipeline for a different URL; env.ASSETS is the newer binding for the
 * same job. Try the binding first and fall back, so this keeps working
 * whichever the runtime provides.
 */
async function fetchAsset(context, pathname) {
  const url = new URL(context.request.url);
  url.pathname = pathname;
  url.search = '';
  try {
    if (context.env?.ASSETS?.fetch) return await context.env.ASSETS.fetch(new Request(url.toString()));
    return await context.next(url.toString());
  } catch {
    return null;
  }
}

/** The 404 body an agent gets when it asked for Markdown. */
async function markdownNotFound(context) {
  const twin = await fetchAsset(context, '/404.md');
  if (twin && twin.status === 200) {
    return markdownResponse(await twin.text(), 404, twin);
  }
  // Fallback if the twin is somehow missing — still a real 404, still
  // pointing at the indexes an agent needs to recover.
  const body = [
    '# 404 — Not found',
    '',
    'There is no resource at this address on yarivitzkovich.org.',
    '',
    '- Site guide for agents: https://yarivitzkovich.org/llms.txt',
    '- Sitemap: https://yarivitzkovich.org/sitemap-index.xml',
    '- Publications archive: https://yarivitzkovich.org/publications',
    '- RSS feed of new papers: https://yarivitzkovich.org/publications.xml',
    '',
    'Every page here is available as Markdown: send `Accept: text/markdown`, or append `.md` to the path.',
    '',
  ].join('\n');
  return markdownResponse(body, 404);
}

export const onRequest = async (context) => {
  const { request } = context;

  // Only safe methods have negotiable representations.
  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next();

  const pathname = new URL(request.url).pathname;

  // A direct request for the twin itself: no negotiation to do (and this
  // is what stops the twin lookup below from recursing), but the response
  // still needs the right content type and Vary.
  if (pathname.endsWith('.md')) {
    const response = await context.next();
    if (response.status !== 200) return response;
    return markdownResponse(response.body, 200, response);
  }

  if (!isNegotiablePath(pathname)) return context.next();

  const wantsMarkdown = prefersMarkdown(request.headers.get('accept'));
  const response = await context.next();

  if (!wantsMarkdown) {
    // HTML variant. It still declares Vary: Accept, because a cache that
    // stored this response must not replay it for a Markdown request.
    return withVaryAccept(response);
  }

  try {
    if (response.status === 404) return await markdownNotFound(context);

    // 200, or the trailing-slash canonicalization ("/about" → "/about/")
    // that a directory-format build emits. Both forms map to the same
    // twin, so answering the redirect directly saves the agent a round
    // trip. A redirect with no twin at the requested path — /contact → /,
    // /admin → /manage/content — finds nothing and falls through to the
    // redirect itself, which is what those rules are there to do.
    const isRedirect = response.status >= 300 && response.status < 400;
    if (response.status !== 200 && !isRedirect) return withVaryAccept(response);

    const twin = await fetchAsset(context, twinPathFor(pathname));
    if (twin && twin.status === 200) {
      return markdownResponse(await twin.text(), 200, twin);
    }
  } catch {
    // Fail open — an agent gets HTML, which is worse than Markdown but
    // far better than a 500.
  }

  return withVaryAccept(response);
};
