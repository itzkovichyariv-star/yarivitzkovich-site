// Long-form content for each topic landing page at /topics/[id].
// Kept separate from data/topics.ts so the lightweight taxonomy stays
// editable without dragging prose around with it.
//
// Each entry is intended to read as a short editorial introduction to
// the topic: what it is, the synonyms researchers Google, and what
// Yariv's body of work contributes. SEO-meaningful keyword density
// comes from the synonyms list — these are the alternate phrasings a
// reader might type into Google Scholar.
//
// To add a topic, add an entry whose key matches the topic id in
// data/topics.ts. Topics without an entry here fall back to a minimal
// auto-generated description on /topics/[id].

import type { TopicId } from './topics';

export interface TopicPage {
  /** Short prose intro (1-2 paragraphs, 100-250 words). Plain text;
      *italics* allowed via Markdown-style markers. */
  intro: string;
  /** Synonyms and related search terms — used in meta keywords +
      surfaced in a small "Also known as" panel for readers. */
  synonyms: string[];
  /** Key research questions or themes Yariv's work addresses on this
      topic. Bulleted on the page. */
  questions?: string[];
  /** Topic ids that pair naturally with this one — surfaced as
      "Related topics" cross-links. Builds the internal link graph that
      helps Google understand the topical structure of the site. */
  relatedTopics?: TopicId[];
}

export const TOPIC_PAGES: Partial<Record<TopicId, TopicPage>> = {
  incivility: {
    intro:
      "Workplace incivility — *the low-intensity, deviant behaviour with ambiguous intent to harm a target* (Andersson & Pearson, 1999) — is the entry point of my research programme. " +
      "It's the rude email, the dismissive interruption, the public correction, the colleague who keeps undermining without ever quite crossing a line you can name. " +
      "Across two decades I've studied incivility from multiple angles: who perpetrates it and why, how victims react, what bystanders do, how it cascades from supervisors to subordinates, and how it relates to its more severe cousin — workplace bullying.",
    synonyms: [
      'workplace incivility',
      'rude behavior at work',
      'low-intensity mistreatment',
      'uncivil workplace behaviour',
      'faculty incivility',
      'patient incivility',
      'interpersonal mistreatment',
      'subtle aggression at work',
    ],
    questions: [
      'How does incivility transmit through hierarchies (supervisor → subordinate)?',
      'When do targets of incivility strike back vs. withdraw vs. exit?',
      'How do bystanders move from inaction to upstander intervention?',
      'What distinguishes incivility from bullying empirically — or are they ends of a continuum?',
      'How can AI-based systems detect uncivil exchanges in real time?',
    ],
    relatedTopics: ['bullying', 'bystander', 'abusive-supervision', 'ai'],
  },

  bullying: {
    intro:
      "Workplace bullying is repeated, persistent mistreatment that erodes a target's dignity, mental health, and capacity to do their work. " +
      "Most of my bullying research lives at two of its hardest questions: the empirical relationship between bullying and incivility (are they the same construct measured at different intensities, or genuinely different phenomena?), and the *tit-for-tat* dynamic — when victims become perpetrators and vice versa. " +
      "Recent work uses latent class analysis to show that the bullying–incivility border is fuzzier than the literature has historically claimed.",
    synonyms: [
      'workplace bullying',
      'mobbing',
      'harassment at work',
      'persistent negative acts',
      'workplace harassment',
      'bullying in higher education',
      'nonprofit organization bullying',
      'organizational bullying',
    ],
    questions: [
      'How does bullying relate to incivility — separate construct or continuum?',
      'Under what conditions do victims retaliate, becoming perpetrators?',
      'Why is bullying so prevalent in higher education and the nonprofit sector?',
      'What role do bystanders play in escalation vs. de-escalation?',
    ],
    relatedTopics: ['incivility', 'bystander', 'mistreatment', 'wellbeing'],
  },

  bystander: {
    intro:
      "Bystanders — the third parties who witness workplace mistreatment without being its direct target or perpetrator — are arguably the most important actors in the system. " +
      "Their reactions determine whether an incident escalates, gets normalised, or gets named and stopped. " +
      "My bystander research investigates the psychological resources, institutional conditions, and contextual cues that move a bystander from inaction to upstander intervention. " +
      "Increasingly this work asks whether AI-augmented detection and prompts can help institutions design better bystander conditions in real time.",
    synonyms: [
      'bystander intervention',
      'upstander behavior',
      'workplace witnesses',
      'bystander effect at work',
      'third-party reactions to mistreatment',
      'observer behavior in organizations',
      'silent witnesses workplace',
    ],
    questions: [
      'What moves a bystander from silence to action?',
      'How do empathy, ethical climate, and institutional design shape bystander response?',
      'Are bystanders themselves affected (health, behaviour) by witnessing mistreatment?',
      'Can AI systems prompt bystanders effectively without paternalism?',
    ],
    relatedTopics: ['incivility', 'bullying', 'mistreatment', 'ai'],
  },

  ai: {
    intro:
      "How can artificial intelligence be designed to detect, mitigate, or prevent workplace mistreatment — without itself becoming a surveillance tool that erodes the dignity it's meant to protect? " +
      "My AI research sits at the intersection of organizational behaviour and human–AI collaboration. " +
      "Concrete questions include: can natural language processing flag uncivil exchanges in time to intervene? Can soft-skill evaluation be made fairer by AI rather than less fair? What role does human discretion play alongside algorithmic prompts?",
    synonyms: [
      'AI in workplace',
      'AI for mistreatment detection',
      'human-AI collaboration',
      'natural language processing for incivility',
      'AI-driven bystander intervention',
      'AI ethics in organizations',
      'AI soft skill evaluation',
      'algorithmic management',
    ],
    questions: [
      'Can NLP reliably detect workplace incivility in text and voice?',
      'How should an AI-augmented bystander system be designed to support rather than replace human judgement?',
      'Where is AI most useful vs. potentially harmful in evaluating soft skills?',
      'What governance protects targets while still enabling the system?',
    ],
    relatedTopics: ['incivility', 'bystander', 'abusive-supervision'],
  },

  'abusive-supervision': {
    intro:
      "Abusive supervision — sustained verbal and non-verbal hostility from a supervisor toward subordinates — is the *dark side of leadership* most directly within an organisation's control. " +
      "Unlike incivility from peers, abusive supervision flows down a hierarchy, which means its effects compound through formal authority. " +
      "My work in this area has covered the trickle-down of abuse through supervisory chains, the compensatory and revenge behaviours of subordinates exposed to it, and the gendered ways its long-term effects show up in targets' careers.",
    synonyms: [
      'abusive supervision',
      'destructive leadership',
      'toxic leadership',
      'dark side of leadership',
      'authoritarian supervisor behavior',
      'supervisor mistreatment',
      'workplace authority abuse',
    ],
    questions: [
      'How does abuse from a supervisor cascade through subsequent hierarchical layers?',
      'What compensatory behaviours emerge in subordinates of abusive supervisors?',
      'How do gender, status, and tenure shape vulnerability and response?',
      'What stops or sustains abusive supervision at the organisational level?',
    ],
    relatedTopics: ['incivility', 'hierarchies', 'wellbeing'],
  },

  wellbeing: {
    intro:
      "When workplace mistreatment lasts, it doesn't stay at work — it follows targets home, into their sleep, their relationships, and their long-run mental and physical health. " +
      "My wellbeing research investigates the longitudinal trajectories of incivility, bullying, and abusive supervision targets, with attention to how socio-emotional resources buffer some outcomes while leaving others unprotected. " +
      "Recent work asks what institutions can do, structurally, to mitigate harm even when individual incidents persist.",
    synonyms: [
      'workplace wellbeing',
      'mistreatment and mental health',
      'occupational stress',
      'burnout from incivility',
      'long-term effects of bullying',
      'employee wellbeing and aggression',
      'social-emotional resources at work',
    ],
    relatedTopics: ['incivility', 'bullying', 'abusive-supervision'],
  },

  hierarchies: {
    intro:
      "Hierarchies shape every mistreatment dynamic at work: who can target whom with impunity, who is silenced, whose complaint travels and whose dies. " +
      "My research on hierarchies — particularly in higher education, hospitals, and nonprofits — asks how status differences between perpetrator and target change the damage done, and how institutional design either amplifies or absorbs hierarchical mistreatment.",
    synonyms: [
      'workplace hierarchy and mistreatment',
      'status and incivility',
      'power asymmetry at work',
      'organizational power dynamics',
      'hierarchical structures and aggression',
    ],
    relatedTopics: ['abusive-supervision', 'incivility', 'bullying'],
  },

  lmx: {
    intro:
      "Leader–member exchange (LMX) describes the quality of the dyadic relationship between a supervisor and an individual subordinate. " +
      "My LMX research explores how the quality of these relationships interacts with incivility and abusive supervision — does a strong LMX buffer the impact of supervisor abuse, or does it amplify the betrayal? Is incivility more devastating when it comes from a leader who was previously a high-LMX partner?",
    synonyms: [
      'leader-member exchange',
      'LMX theory',
      'supervisor-subordinate relationship',
      'leadership relationship quality',
      'LMX and incivility',
    ],
    relatedTopics: ['abusive-supervision', 'incivility', 'hierarchies'],
  },

  editorial: {
    intro:
      "Pieces written in my capacity as Associate Editor of the *Journal of Managerial Psychology* or as guest editor for thematic Research Topics. " +
      "These are integrative, agenda-setting pieces — synthesizing where a sub-field stands, where it should go next, and what role AI and institutional design might play in the future of workplace-mistreatment research.",
    synonyms: [
      'workplace bullying editorial',
      'Journal of Managerial Psychology editorial',
      'organizational behavior research agenda',
      'mistreatment research synthesis',
    ],
    relatedTopics: ['incivility', 'bullying', 'bystander'],
  },
};
