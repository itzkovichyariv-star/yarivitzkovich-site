// POST /api/track-visit
// Receives a visit event from the client-side tracking snippet
// and records it to D1 with geo enrichment.
//
// Body shape:
//   {
//     "visitor_class": "first_time" | "returning",
//     "page_path": "/publications/will-they-strike-back",
//     "paper_slug": "will-they-strike-back",   // optional, only if on a paper page
//     "paper_title": "Will they strike back…"  // optional
//   }
//
// Response:
//   { "ok": true, "recorded": <bool>, "reason": "duplicate" | "no_db_binding" | undefined }

import { recordEvent } from '../_lib/events.js';

const ALLOWED_CLASSES = new Set(['first_time', 'returning']);

export const onRequestPost = async ({ request, env }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const visitor_class = body?.visitor_class;
  if (!ALLOWED_CLASSES.has(visitor_class)) {
    return jsonError(400, 'invalid_visitor_class');
  }

  const page_path = typeof body.page_path === 'string' ? body.page_path.slice(0, 256) : null;
  const paper_slug = typeof body.paper_slug === 'string' ? body.paper_slug.slice(0, 200) : null;
  const paper_title = typeof body.paper_title === 'string' ? body.paper_title.slice(0, 400) : null;

  const result = await recordEvent({
    db: env.DB,
    request,
    kind: 'visit',
    visitor_class,
    paper_slug,
    paper_title,
    page_path,
  });

  return new Response(JSON.stringify({ ok: true, ...result, event: undefined }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

// Reject anything other than POST cleanly.
export const onRequest = async ({ request }) => {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { allow: 'POST' },
  });
};

function jsonError(status, code) {
  return new Response(JSON.stringify({ ok: false, error: code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
