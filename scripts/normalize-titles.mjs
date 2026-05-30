#!/usr/bin/env node
/**
 * normalize-titles.mjs — one-off: normalize publication titles to APA 7
 * sentence case (capitalize first word, first word after a colon/dash, and
 * proper nouns/acronyms only). Only the listed files change; everything else
 * is left exactly as-is. Proper nouns preserved: ADHD, AI, EVLN, AET, AOM, EI,
 * Israel.  Run once, then delete (kept under scripts/ for the record / re-run).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'src/content/publications');

// slug.mdx -> new sentence-case title. ONLY files that need a change appear here.
const MAP = {
  // --- full Title Case -> sentence case ---
  'academic-incivility': 'Academic incivility',
  'adhd-employability-psychological-resources': 'Employability efficacy in ADHD young adults: Supportive psychological resources',
  'an-introduction-to-the-dark-side-of-organizations': 'An introduction to the dark side of organizations',
  'beyond-investment-thesis-sustainability': 'Beyond the investment thesis: When educational spending fails to predict student sustainability behaviors',
  'bullying-harassment-higher-ed-scoping': 'Workplace bullying and harassment in higher education institutions: A scoping review',
  'challenges-academic-incivility': 'The challenges of academic incivility: Social-emotional competencies and redesign of learning environments as remedies',
  'emotional-intelligence-as-a-remedy-for-academic-incivility': 'Emotional intelligence as a remedy for academic incivility',
  'incivility-trickle-down-compensatory': "When incivility doesn't trickle down: A multilevel examination of compensatory processes in teams",
  'interpersonal-mistreatment-definitions-of-offensive-behavior': 'Interpersonal mistreatment—Definitions of offensive behaviors',
  'kilkalat-yehasim': 'Uneconomic relations: The dark side of interpersonal interactions in organizations',
  'learning-environments-as-precursors-of-academic-incivility': 'Learning environments as precursors of academic incivility',
  'personal-precursors-of-academic-incivility': 'Personal precursors of academic incivility',
  'preschool-teachers-revenge': "Delving into preschool teachers' revenge – A mediated-moderated model that explores the deeper nuances of hot and cold revenge among preschool teachers",
  'tackling-academic-incivility-by-shifting-the-focus-to-studen': 'Tackling academic incivility by shifting the focus to student-centered pedagogical approaches',
  'ultimate-bystander-ai-incivility': 'The ultimate bystander: A theoretical framework for trust-based AI intervention in workplace incivility',
  'will-they-strike-back-incivility-bullying': 'Will they strike back? Shedding light on the tit-for-tat mechanism in incivility and bullying research from a latent class perspective',
  // --- already sentence case, only fix first word after a colon (subtitle) ---
  'adult-bullying-voluntary-organizations': 'Adult to adult bullying in voluntary organizations: A scoping review',
  'bystanders-health-risk-behaviors': "Health and risk behaviors of bystanders: An integrative theoretical model of bystanders' reactions to mistreatment",
  'cultivating-safer-climate': 'Cultivating a safer climate: Mistreatment intervention using the four pillars of education',
  'dark-side-teachers-behavior-framework': "The dark side of teachers' behavior and its impact on students' reactions: A comprehensive framework to assess college students' reactions to faculty incivility",
  'drivers-of-intrapreneurship-aet': 'Drivers of intrapreneurship: An affective events theory viewpoint',
  'incivility-empathy-ethical-climate-hospital': 'Incivility, empathy, and ethical work climate among hospital staff in Israel: A study within the framework of moral disengagement theory',
  'incivility-hierarchical-status-manager-damage': 'Incivility: The moderating effect of hierarchical status: Does a manager inflict more damage?',
  'perpetrated-incivility-aom-2021': 'Perpetrated incivility: Individual vs contextual antecedents — a reflective viewpoint',
  'social-identity-public-hospital': 'Social identity in a public hospital: Sources, outcomes, and possible resolutions',
  'tit-for-tat-horizontal-solidarity': 'Tit for tat: Horizontal solidarity as a buffer for micro-level corruption in the framework of the social exchange theory',
  'victim-perspective-incivility-negative-affectivity': 'The victim perspective of incivility: The role of negative affectivity, hierarchical status, and their interaction in explaining victimization',
};

let changed = 0, skipped = 0;
for (const [slug, newTitle] of Object.entries(MAP)) {
  const file = path.join(DIR, `${slug}.mdx`);
  let src;
  try { src = readFileSync(file, 'utf8'); }
  catch { console.error(`✗ MISSING ${slug}.mdx`); continue; }
  const m = src.match(/^title:.*$/m);
  if (!m) { console.error(`✗ no title: line in ${slug}.mdx`); continue; }
  const oldLine = m[0];
  const oldTitle = oldLine.replace(/^title:\s*/, '').replace(/^["']|["']$/g, '');
  if (oldTitle === newTitle) { skipped++; continue; }
  // Always emit a double-quoted value (safe with colons; titles have no " chars).
  const newLine = `title: ${JSON.stringify(newTitle)}`;
  writeFileSync(file, src.replace(oldLine, newLine), 'utf8');
  console.log(`✓ ${slug}`);
  console.log(`    old: ${oldTitle}`);
  console.log(`    new: ${newTitle}`);
  changed++;
}
console.log(`\n${changed} changed, ${skipped} already-correct (no-op).`);
