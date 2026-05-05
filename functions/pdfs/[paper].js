// GET /pdfs/<slug>.pdf
// Intercepts PDF downloads, records a 'download' event to D1
// (fire-and-forget — does NOT block the response), then delegates to
// the static asset pipeline so the user gets the actual PDF file.

import { recordEvent } from '../_lib/events.js';

export const onRequestGet = async (ctx) => {
  const { request, env, params, next, waitUntil } = ctx;

  // params.paper looks like "will-they-strike-back.pdf"
  const filename = String(params.paper || '');
  const slug = filename.replace(/\.pdf$/i, '');

  if (slug && env.DB) {
    // Fire-and-forget: the user gets the PDF immediately; logging happens
    // alongside without holding up the response.
    waitUntil(
      recordEvent({
        db: env.DB,
        request,
        kind: 'download',
        visitor_class: 'downloader',
        paper_slug: slug,
        paper_title: null, // P1 will look up the title from the publications collection
        page_path: `/pdfs/${filename}`,
      }).catch((err) => console.error('track-download failed', err))
    );
  }

  // Delegate to the static asset pipeline (serves the actual PDF file).
  return next();
};
