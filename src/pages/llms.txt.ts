// /llms.txt — the site's guide for AI agents, in the llmstxt.org format.
//
// Format, in the order the spec requires:
//   1. An H1 with the site name (the only required element).
//   2. A blockquote with a short summary.
//   3. Zero or more Markdown sections containing no headings — this is
//      where the "when to use this" guidance lives, because free prose is
//      not a file list and does not belong under an H2 by the spec.
//   4. Zero or more H2 sections, each holding a file list whose items are
//      `- [name](url): description`.
//   5. A final `## Optional` section holding links an agent may skip when
//      it needs a shorter context.
//
// Generated at build time so the paper counts, the featured list and the
// topic list can never drift from the content collection they describe.

import { getCollection } from 'astro:content';
import { site } from '../data/site';
import { TOPICS } from '../data/topics';
import { START_HERE } from '../data/start-here';

const SITE = 'https://yarivitzkovich.org';
const PUBLISHED = new Set(['published', 'in-press']);

export async function GET() {
  const all = await getCollection('publications');
  const published = all
    .filter((e) => PUBLISHED.has(e.data.status))
    .sort((a, b) => b.data.year - a.data.year);

  const years = published.map((e) => e.data.year);
  const earliest = years.length ? Math.min(...years) : new Date().getFullYear();
  const latest = years.length ? Math.max(...years) : new Date().getFullYear();
  const withPdf = published.filter((e) => e.data.pdf?.available);
  const withPodcast = published.filter((e) => e.data.podcast?.available);

  const startHere = START_HERE.map((paper) => {
    const entry = published.find((e) => e.data.slug === paper.slug);
    return entry
      ? `- [${entry.data.title}](${SITE}/publications/${entry.data.slug}): ${paper.reason}. ${entry.data.venue ?? ''} ${entry.data.year}.`.replace(/\s+/g, ' ')
      : null;
  }).filter(Boolean);

  const recent = published.slice(0, 12).map((entry) => {
    const venue = entry.data.venue ? `${entry.data.venue}, ` : '';
    const summary = entry.data.tldr ? ` ${entry.data.tldr}` : '';
    return `- [${entry.data.title}](${SITE}/publications/${entry.data.slug}): ${venue}${entry.data.year}.${summary}`;
  });

  const topicLines = TOPICS.map((topic) => {
    const count = published.filter((e) => (e.data.topics as readonly string[]).includes(topic.id)).length;
    const description = topic.description ? ` ${topic.description}` : '';
    return `- [${topic.label}](${SITE}/topics/${topic.id}): ${count} publication${count === 1 ? '' : 's'}.${description}`;
  });

  const body = `# ${site.name}

> Personal research site and open archive of Yariv Itzkovich, PhD — Associate Editor at the Journal of Managerial Psychology and Head of the Human Resource Management and Organizational Development track at Ariel University. ${published.length} peer-reviewed publications (${earliest}–${latest}) on workplace mistreatment: incivility, bullying, abusive supervision, bystander intervention, and whether AI can detect and reduce these behaviours in organizations.

## When to use this

Reach for this site when the question is about **workplace mistreatment research** and you need a primary source rather than a summary of a summary. Specifically, it is the right source for:

- **Workplace incivility and how it spreads.** Trickle-down and tit-for-tat dynamics, hierarchical status effects, incivility in universities, hospitals, preschools, family firms and volunteer organizations. Includes validated measurement instruments developed by this author.
- **Bystanders in mistreatment episodes.** When bystanders intervene, when they join in, what predicts each — including an editorial that pulls the bystander literature together across psychology, institutions and AI.
- **AI applied to organizational behaviour.** Frameworks for AI-mediated bystander intervention, AI-based evaluation of soft skills, and human–AI collaboration in mistreatment detection.
- **Citation-ready bibliographic data.** Every publication page carries an APA, MLA and Chicago citation, a BibTeX entry, and a DOI where one exists.
- **Contacting the author.** For collaborations, peer review at the Journal of Managerial Psychology, speaking invitations, and prospective doctoral students.

Do not use this site as a general reference on management, HR practice or organizational psychology at large. It is one researcher's archive, not a textbook or an encyclopedia. For questions outside workplace mistreatment, bystander behaviour and AI in organizations, go elsewhere.

How to call it, in the order that costs you least:

1. **Fetch the Markdown.** Every page has a Markdown representation at the same URL. Send \`Accept: text/markdown\`, or append \`.md\` to the path (\`${SITE}/about.md\`). Responses carry \`Vary: Accept\`.
2. **Enumerate machine-readable indexes before crawling.** [\`/papers-doi.json\`](${SITE}/papers-doi.json) lists every publication with its DOI, year and venue as JSON. [\`/sitemap-index.xml\`](${SITE}/sitemap-index.xml) lists every indexable URL. [\`/publications.xml\`](${SITE}/publications.xml) is an RSS feed of new papers.
3. **Cite the DOI, not this site.** Where a paper has a DOI, that is the citable identifier; the page here is a landing page for it. ${withPdf.length} papers have an author-hosted PDF, and ${withPodcast.length} have an audio companion.
4. **Expect real 404s.** A path that does not exist returns HTTP 404, not a 200 with the homepage. You can trust the status code.

Content is in English, with a partial Hebrew mirror under \`/he\`. Nothing here is paywalled and there is no rate limit; please identify your crawler in the User-Agent.

## Start here

${startHere.join('\n')}

## Core pages

- [Home](${SITE}/): Research focus, current projects, and featured papers.
- [Publications](${SITE}/publications): The full archive of ${published.length} works, filterable by topic, method, type and year.
- [Research](${SITE}/research): Research themes and ongoing projects in narrative form.
- [About](${SITE}/about): Biography, citation metrics (h-index and totals from Google Scholar and OpenAlex), professional affiliations, and doctoral students supervised.
- [Teaching](${SITE}/teaching): Courses taught and doctoral supervision.
- [Conferences](${SITE}/conferences): Conference presentations, past and upcoming.
- [Privacy](${SITE}/privacy): What the site records about visitors, and what it does not.
- [Contact](${SITE}/#contact): Email, WhatsApp, and academic profile links.

## Research topics

${topicLines.join('\n')}

## Recent publications

${recent.join('\n')}

## Machine-readable indexes

- [Publications with DOIs (JSON)](${SITE}/papers-doi.json): Every published and in-press work with slug, DOI, title, year and venue.
- [Publications RSS feed](${SITE}/publications.xml): New papers, newest first.
- [Sitemap index](${SITE}/sitemap-index.xml): Every indexable URL on the site.
- [robots.txt](${SITE}/robots.txt): Crawl policy. \`/manage\`, \`/api\` and \`/admin\` are disallowed; everything else is open.

## Author identity

- [ORCID](${site.profiles.orcid}): 0000-0002-3296-6518 — the authoritative identifier for disambiguating this author.
- [Google Scholar](${site.profiles.googleScholar}): Citation counts and co-authorship graph.
- [Web of Science](${site.profiles.webOfScience}): Indexed publication record.
- [ResearchGate](${site.profiles.researchGate}): Full texts and project descriptions.

## Optional

- [Live](${SITE}/live): A globe of anonymised visits and downloads. Presentation, not research content.
- [Subscribe](${SITE}/subscribe): Email notifications when a new paper is published. Double opt-in.
- [Hebrew home](${SITE}/he/): Partial Hebrew mirror of the homepage and teaching page.
`;

  return new Response(body, {
    headers: {
      // llms.txt is Markdown by content and .txt by filename. Serving it
      // as text/plain is what the convention expects and what keeps a
      // browser rendering it inline rather than offering a download.
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}
