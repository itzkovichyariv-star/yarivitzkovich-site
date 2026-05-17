// RSS feed for the Publications archive.
//
// Served as /publications.xml. Subscribed via RSS readers (Feedly,
// Inoreader, NetNewsWire, Zotero RSS plugin), this is the zero-
// dependency way for readers to be notified when a new paper goes
// up. No third-party email service required, no signup form for
// the visitor — they paste the URL into their reader and they're
// done.
//
// Only "published" and "in-press" entries are included. Drafts and
// works-in-progress live on /research and are not pushed here.

import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

const PUBLISHED = new Set(['published', 'in-press']);

export async function GET(context: APIContext) {
  const entries = await getCollection('publications');

  const items = entries
    .filter((e) => PUBLISHED.has(e.data.status))
    .sort((a, b) => b.data.year - a.data.year)
    .map((e) => {
      // Use Jan 1 of the publication year as pubDate when we don't
      // have a precise date. RSS readers sort by pubDate, so this
      // keeps newest-first ordering.
      const pubDate = new Date(`${e.data.year}-01-01T00:00:00Z`);

      const authorNames = (e.data.authors || []).map((a) => a.name).join(', ');
      const venue = e.data.venue ? ` · ${e.data.venue}` : '';
      const status = e.data.status === 'in-press' ? ' (in press)' : '';

      // Concise description for the feed — TL;DR if available, else
      // a truncated abstract, else just the venue line.
      const description =
        e.data.tldr ||
        (e.data.abstract ? e.data.abstract.slice(0, 280) + (e.data.abstract.length > 280 ? '…' : '') : '') ||
        `${authorNames}${venue}${status}`;

      return {
        title: `${e.data.title}${status}`,
        link: new URL(`/publications/${e.data.slug}/`, context.site).href,
        pubDate,
        description,
        author: authorNames,
        categories: e.data.topics,
      };
    });

  return rss({
    title: 'Yariv Itzkovich — Publications',
    description:
      'New papers from Yariv Itzkovich — research on workplace mistreatment, incivility, bullying, bystander intervention, and AI-based mitigation.',
    site: context.site!,
    items,
    customData: '<language>en-us</language>',
  });
}
