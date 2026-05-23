// Static JSON endpoint generated at build time.
// Used by the daily-citations cron (GitHub Actions) to get the full paper
// list to POST to /api/citations. All fields are already public on the
// publications page, so this is not a privacy concern.

import { getCollection } from 'astro:content';

export async function GET() {
  const pubs = await getCollection('publications');
  const papers = pubs
    .filter((p) => ['published', 'in-press'].includes(p.data.status))
    .map((p) => ({
      slug: p.data.slug,
      doi: p.data.doi ?? null,
      title: p.data.title,
      year: p.data.year,
      venue: p.data.venue ?? null,
    }));

  return new Response(JSON.stringify({ papers }), {
    headers: { 'content-type': 'application/json' },
  });
}
