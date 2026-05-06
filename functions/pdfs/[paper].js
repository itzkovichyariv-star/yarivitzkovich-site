// GET /pdfs/<slug>.pdf
// Intercepts PDF downloads, records a 'download' event to D1
// (fire-and-forget — does NOT block the response), then delegates to
// the static asset pipeline so the user gets the actual PDF file.
//
// Direct-PDF visitors (e.g. someone who follows a deep link to the PDF
// without ever loading an HTML page) never trigger the visit-tracking
// script in BaseLayout.astro, so without help they would only show up
// as downloads — never as visits. To keep the globe and HUD honest, we
// synthesize a first-time visit event alongside the download when this
// person (per-day person_hash) has not been seen visiting today.

import { recordEvent } from '../_lib/events.js';
import { hashPerson } from '../_lib/dedup.js';

export const onRequestGet = async (ctx) => {
  const { request, env, params, next, waitUntil } = ctx;

  // params.paper looks like "will-they-strike-back.pdf"
  const filename = String(params.paper || '');
  const slug = filename.replace(/\.pdf$/i, '');

  if (slug && env.DB) {
    // Fire-and-forget: the user gets the PDF immediately; logging happens
    // alongside without holding up the response.
    waitUntil(
      (async () => {
        try {
          // Has this person already been recorded visiting today (any page)?
          // Scope: person_hash is per-day, so checking any kind='visit'
          // event with this person_hash is equivalent to "today".
          const personHash = await hashPerson({ request });
          const priorVisit = await env.DB
            .prepare(
              `SELECT 1 FROM events
               WHERE person_hash = ? AND kind = 'visit'
               LIMIT 1`
            )
            .bind(personHash)
            .first();

          if (!priorVisit) {
            // Synthesize a first-time visit so the globe shows a green arc
            // and the HUD's first-time count reflects this person.
            await recordEvent({
              db: env.DB,
              request,
              kind: 'visit',
              visitor_class: 'first_time',
              paper_slug: slug,
              paper_title: null,
              page_path: `/pdfs/${filename}`,
            });
          }

          // Always record the download itself.
          await recordEvent({
            db: env.DB,
            request,
            kind: 'download',
            visitor_class: 'downloader',
            paper_slug: slug,
            paper_title: null, // P1 will look up the title from the publications collection
            page_path: `/pdfs/${filename}`,
          });
        } catch (err) {
          console.error('track-download failed', err);
        }
      })()
    );
  }

  // Delegate to the static asset pipeline (serves the actual PDF file).
  return next();
};
