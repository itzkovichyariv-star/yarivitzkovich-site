// Curated "Start here" papers shown on the home page in an inline
// paragraph beneath the hero, intended to orient first-time visitors
// arriving from Google Scholar or social. Each entry pairs a paper
// slug (must match a file in src/content/publications/) with a short
// in-prose label that fits naturally inside a sentence.
//
// To change the curation, edit this list. The home page picks them up
// at build time and links each entry to its detail page.

export interface StartHerePaper {
  slug: string;
  /** Short, natural-prose label used inline in a sentence. */
  label: string;
  /** One-line reason this paper is a good entry point. */
  reason: string;
}

export const START_HERE: StartHerePaper[] = [
  {
    slug: 'will-they-strike-back-incivility-bullying',
    label: 'tit-for-tat in incivility and bullying',
    reason: 'the latest-class view of who actually strikes back, and what that says about construct validity',
  },
  {
    slug: 'bystanders-workplace-bullying-editorial',
    label: 'bystanders’ roles in workplace bullying',
    reason: 'the editorial pulling the bystander thread together across psychology, institutions, and AI',
  },
  {
    slug: 'objectivity-by-design-ai-soft-skills',
    label: 'AI-driven evaluation of soft skills',
    reason: 'where where AI meets organizational practice',
  },
];
