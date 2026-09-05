// GET /e/<slug> — a landing page, rendered from its `landing_events` row.
//
// Rendered per request rather than built: the whole reason events live in D1
// is that a corrected start time should be live the moment it is saved, with
// no commit, build or deploy in between.
//
// A draft is reachable by anyone holding the URL — that is what makes it
// previewable before it is announced, and an invitation signed by two people
// gets read by both before it goes out. It carries noindex (set by the
// renderer) so it cannot be found before its time, and the renderer puts an
// unmissable banner on it so a draft is never mistaken for the live page.

import { renderEventPage } from '../_lib/event-page.js';

export const onRequestGet = async ({ params, request, env }) => {
  if (!env.DB) return html('<h1>שגיאה זמנית</h1>', 500);

  const slug = String(params.slug || '').trim();
  if (!slug) return notFound();

  // Before the migration has been run the table does not exist yet. A visitor
  // must never be shown that: to anyone out here a page that is not there is a
  // 404, and the operational detail belongs on the manage screens, which say
  // exactly which command to run.
  let event;
  try {
    event = await env.DB
      .prepare(`SELECT * FROM landing_events WHERE slug = ?`)
      .bind(slug)
      .first();
  } catch (err) {
    if (/no such table/i.test(String(err?.message || err))) return notFound();
    throw err;
  }

  if (!event) return notFound();

  const origin = new URL(request.url).origin;
  return html(renderEventPage(event, { origin }), 200, {
    // Short enough that an edit shows up almost at once, long enough that a
    // burst of arrivals from one mail-out does not hit D1 for every reader.
    'cache-control': 'public, max-age=60',
  });
};

function html(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...extra },
  });
}

function notFound() {
  return html(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>הדף לא נמצא</title><style>body{background:#122033;color:#C1C3C6;font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}a{color:#4FBFC7}</style>
</head><body><div><h1 style="font-weight:800">הדף לא נמצא</h1>
<p style="color:#9CA0A5">ייתכן שהקישור שגוי או שהאירוע הוסר.</p>
<p><a href="/">לאתר</a></p></div></body></html>`,
    404
  );
}
