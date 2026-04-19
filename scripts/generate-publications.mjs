// Generates MDX files for every publication listed in Yariv's CV (April 2026).
// Run: node scripts/generate-publications.mjs
// Safe to re-run: overwrites files, so manual edits to topics/methods/featured
// will be preserved only if present in this data file.

import { writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync, statSync, readFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'src/content/publications');

// Hard-keeps (already curated with covers / abstracts). Script will NOT overwrite.
const KEEP = new Set(['challenges-academic-incivility', 'kilkalat-yehasim']);

// All publications — manually curated from CV sections F1–F8.
// Each entry carries: slug, year, type, status, authors, title, venue, doi, topics, methods, featured.
// topics/methods are best-guess from title keywords — user should refine.
const PUBS = [
  // ========== F1. Articles in Refereed Journals – Published ==========
  {
    slug: 'bullying-harassment-higher-ed-scoping',
    year: 2024,
    type: 'article',
    status: 'published',
    authors: ['Hodgins, M.', 'Kane, R.', 'Itzkovich, Y.', 'Fahie, D.'],
    title: 'Workplace Bullying and Harassment in Higher Education Institutions: A Scoping Review',
    venue: 'International Journal of Environmental Research and Public Health',
    volume: '21', issue: '9', pages: '1173',
    doi: '10.3390/ijerph21091173',
    topics: ['bullying', 'hierarchies'], methods: ['Review'],
    pdfCandidates: ['ijerph-21-01173-v2.pdf'],
  },
  {
    slug: 'objectivity-by-design-ai-soft-skills',
    year: 2024,
    type: 'article',
    status: 'published',
    authors: ['Gafni, R.', 'Aviv, I.', 'Kantsepolsky, B.', 'Sherman, S.', 'Rika, H.', 'Itzkovich, Y.', 'Barger, A.'],
    title: "Objectivity by design: The impact of AI-driven approach on employees' soft skills evaluation",
    venue: 'Information and Software Technology',
    volume: '170', pages: '107430',
    doi: '10.1016/j.infsof.2024.107430',
    topics: ['ai'], methods: ['Quantitative'],
    pdfCandidates: ['1-s2.0-S0950584924000351-main.pdf'],
  },
  {
    slug: 'social-workers-witness-mistreatment',
    year: 2023,
    type: 'article',
    status: 'published',
    authors: ['Lev-Wiesel, R.', 'Barhon, E.', 'Itzkovich, Y.', 'Eliraz, C.', 'Shimony, D.', 'Goldenberg, H.', 'Dori-Egozy, N.', 'Orly, T.'],
    title: 'Experiences of social workers who witness mistreatment as captured in drawing and narrative',
    venue: 'Journal of Social Work',
    volume: '23', issue: '4', pages: '779–792',
    doi: '10.1177/14680173231164350',
    topics: ['bystander', 'wellbeing'], methods: ['Qualitative'],
    pdfCandidates: ['lev-wiesel-et-al-2023-experiences-of-social-workers-who-witness-mistreatment-as-captured-in-drawing-and-narrative.pdf'],
  },
  {
    slug: 'students-wellbeing-faculty-incivility',
    year: 2022,
    type: 'article',
    status: 'published',
    authors: ['Alt, D.', 'Itzkovich, Y.', 'Naamati-Schnieder, L.'],
    title: "Students' emotional well-being and perceived faculty incivility and just behavior",
    venue: 'Frontiers in Psychology',
    volume: '13', pages: '849489',
    doi: '10.3389/fpsyg.2022.84948',
    topics: ['incivility', 'wellbeing'], methods: ['Quantitative'],
    pdfCandidates: ['fpsyg-13-849489.pdf'],
  },
  {
    slug: 'social-identity-public-hospital',
    year: 2023,
    type: 'article',
    status: 'published',
    authors: ['Shnapper-Cohen, M.', 'Dolev, N.', 'Itzkovich, Y.'],
    title: 'Social Identity in a public hospital: sources, outcomes, and possible resolutions',
    venue: 'Current Psychology',
    volume: '42', issue: '16', pages: '13975-13986',
    doi: '10.1007/s12144-022-02729-4',
    topics: ['wellbeing'], methods: ['Quantitative'],
    pdfCandidates: ['12144_2022_Article_2729.pdf', '12144_2022_Article_2729-2.pdf'],
  },
  {
    slug: 'gender-focused-prism-teachers-mistreatment',
    year: 2021,
    type: 'article',
    status: 'published',
    authors: ['Dolev, N.', 'Itzkovich, Y.', 'Katzman, B.'],
    title: "A gender-focused prism on the long-term impact of teachers' emotional mistreatment on resilience: Do men and women differ in their quest for social-emotional resources in a masculine society?",
    venue: 'Sustainability',
    volume: '13', issue: '17', pages: '9832',
    doi: '10.3390/su13179832',
    topics: ['wellbeing', 'abusive-supervision'], methods: ['Quantitative'],
    pdfCandidates: ['sustainability-13-09832-v3.pdf'],
  },
  {
    slug: 'constructing-students-psychological-contract-violation',
    year: 2021,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.'],
    title: "Constructing and validating students' psychological contract violation scale",
    venue: 'Frontiers in Psychology',
    volume: '12', pages: '2757',
    doi: '10.3389/fpsyg.2021.685468',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: ['fpsyg-12-685468.pdf'],
  },
  {
    slug: 'bystanders-health-risk-behaviors',
    year: 2021,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Barhon, E.', 'Lev-Weisel, R.'],
    title: "Health and risk behaviors of bystanders: an integrative theoretical model of bystanders' reactions to mistreatment",
    venue: 'International Journal of Environmental Research and Public Health',
    volume: '18', issue: '11', pages: '5552',
    doi: '10.3390/ijerph18115552',
    topics: ['bystander', 'wellbeing'], methods: ['Conceptual'],
    pdfCandidates: ['ijerph-18-05552.pdf'],
  },
  {
    slug: 'cultivating-safer-climate',
    year: 2021,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Dolev, N.'],
    title: 'Cultivating a safer climate: mistreatment intervention using the four pillars of education',
    venue: 'Societies',
    volume: '11', issue: '2', pages: '1-14',
    doi: '10.3390/soc11020048',
    topics: ['incivility'], methods: ['Conceptual'],
    pdfCandidates: ['societies-11-00048.pdf', 'Cultivating_a_Safer_Organizational_Clima.pdf'],
  },
  {
    slug: 'drivers-of-intrapreneurship-aet',
    year: 2021,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Heilbrunn, S.', 'Dolev, N.'],
    title: 'Drivers of intrapreneurship: an affective events theory viewpoint',
    venue: 'Personnel Review',
    doi: '10.1108/PR-09-2019-0483',
    topics: ['wellbeing'], methods: ['Quantitative'],
    pdfCandidates: ['pr-09-2019-0483.pdf'],
  },
  {
    slug: 'call-for-transformation-evln-incivility',
    year: 2021,
    type: 'article',
    status: 'published',
    authors: ['Dolev, N.', 'Itzkovich, Y.', 'Fisher-Shalem, O.'],
    title: 'A call for transformation – EVLN in response to workplace incivility',
    venue: 'Work',
    volume: '69', issue: '4', pages: '764-789',
    doi: '10.3233/WOR-213548',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: ['dolev-et-al-2021-a-call-for-transformation-exit-voice-loyalty-and-neglect-%28evln%29-in-response-to-workplace-incivility.pdf'],
  },
  {
    slug: 'full-range-indeed-dark-side-leadership',
    year: 2020,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Heilbrunn, S.', 'Aleksic, A.'],
    title: 'Full range indeed? The forgotten dark side of leadership',
    venue: 'Journal of Management Development',
    volume: '39', issue: '7', pages: '851-868',
    doi: '10.1108/JMD-09-2019-0401',
    topics: ['abusive-supervision'], methods: ['Conceptual'],
    pdfCandidates: ['jmd-09-2019-0401.pdf', 'jmd-09-2019-0401-2.pdf'],
  },
  {
    slug: 'incivility-quality-work-life-nurses',
    year: 2020,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Dolev, N.', 'Shnapper-Cohen, M.'],
    title: 'Does incivility impact the quality of work-life and ethical climate of nurses?',
    venue: 'International Journal of Workplace Health Management',
    volume: '13', issue: '3', pages: '301-319',
    doi: '10.1108/IJWHM-01-2019-0003',
    topics: ['incivility', 'wellbeing'], methods: ['Quantitative'],
    pdfCandidates: ['ijwhm-01-2019-0003.pdf'],
  },
  {
    slug: 'rudeness-preschool-teachers',
    year: 2019,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Dolev, N.'],
    title: "Rudeness is not only a kids' problem: Incivility against preschool teachers and its impacts",
    venue: 'Current Psychology',
    volume: '40', pages: '2002-2016',
    doi: '10.1007/s12144-018-0117-z',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: ['s12144-018-0117-z.pdf'],
  },
  {
    slug: 'constructivist-learning-faculty-incivility',
    year: 2019,
    type: 'article',
    status: 'published',
    authors: ['Alt, D.', 'Itzkovich, Y.'],
    title: 'The connection between perceived constructivist learning environments and faculty uncivil authoritarian behaviors',
    venue: 'Higher Education',
    volume: '77', issue: '3', pages: '437-454',
    doi: '10.1007/s10734-018-0281-y',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: ['s10734-018-0281-y.pdf'],
  },
  {
    slug: 'entrepreneurship-institutional-contexts-transition',
    year: 2017,
    type: 'article',
    status: 'published',
    authors: ['Heilbrunn, S.', 'Itzkovich, Y.', 'Weinberg, C.'],
    title: 'Perceived feasibility and desirability of entrepreneurship in institutional contexts in transition',
    venue: 'Entrepreneurship Research Journal',
    volume: '7', issue: '4', pages: '2016-2046',
    doi: '10.1515/erj-2016-0046',
    topics: ['wellbeing'], methods: ['Quantitative'],
    pdfCandidates: ['10.1515_erj-2016-0046.pdf'],
  },
  {
    slug: 'cross-validation-faculty-incivility',
    year: 2017,
    type: 'article',
    status: 'published',
    authors: ['Alt, D.', 'Itzkovich, Y.'],
    title: 'Cross-validation of the reactions to faculty incivility measurement through a multidimensional scaling approach',
    venue: 'Journal of Academic Ethics',
    volume: '15', issue: '3', pages: '215-228',
    doi: '10.1007/s10805-017-9288-8',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: ['s10805-017-9288-8.pdf'],
  },
  {
    slug: 'incivility-inhibit-intrapreneurship',
    year: 2017,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Klein, G.'],
    title: 'Can incivility inhibit intrapreneurship?',
    venue: 'Journal of Entrepreneurship',
    volume: '26', issue: '1', pages: '27-50',
    doi: '10.1177/0971355716677386',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: [],
  },
  {
    slug: 'ei-faculty-incivility-gender',
    year: 2017,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Dolev, N.'],
    title: 'The relationships between emotional intelligence and perceptions of faculty incivility in higher education – Do men and women differ?',
    venue: 'Current Psychology',
    doi: '10.1007/s12144-016-9479-2',
    topics: ['incivility', 'wellbeing'], methods: ['Quantitative'],
    pdfCandidates: ['s12144-016-9479-2.pdf'],
  },
  {
    slug: 'coworkers-solidarity-deviant-behavior',
    year: 2016,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Heilbrunn, S.'],
    title: "The role of co-workers' solidarity as an antecedent of incivility and deviant behavior in organizations",
    venue: 'Deviant Behavior',
    volume: '37', issue: '8', pages: '861-876',
    doi: '10.1080/01639625.2016.1152865',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: ['ItzkovitchHeilbrunn2016-Deviance.pdf'],
  },
  {
    slug: 'employee-status-incivility-job-insecurity',
    year: 2016,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.'],
    title: "The impact of employees' status on incivility, deviant behavior, and job insecurity",
    venue: 'EuroMed Journal of Business',
    volume: '11', issue: '2', pages: '304-318',
    doi: '10.1108/EMJB-09-2015-0045',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: ['emjb-09-2015-0045.pdf'],
  },
  {
    slug: 'adjustment-to-college-faculty-incivility',
    year: 2016,
    type: 'article',
    status: 'published',
    authors: ['Alt, D.', 'Itzkovich, Y.'],
    title: 'Adjustment to college and perceptions of faculty incivility',
    venue: 'Current Psychology',
    volume: '35', issue: '4', pages: '657-666',
    doi: '10.1007/s12144-015-9334-x',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: ['s12144-015-9334-x.pdf'],
  },
  {
    slug: 'development-measurement-students-reactions-incivility',
    year: 2016,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Alt, D.'],
    title: "Development and validation of a measurement to assess college students' reactions to faculty incivility",
    venue: 'Ethics & Behavior',
    volume: '26', issue: '8', pages: '621-637',
    doi: '10.1080/10508422.2015.1108196',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: ['Development and Validation of a Measurement to Assess College Students  Reactions to Faculty Incivility.pdf'],
  },
  {
    slug: 'students-justice-faculty-incivility',
    year: 2015,
    type: 'article',
    status: 'published',
    authors: ['Alt, D.', 'Itzkovich, Y.'],
    title: "Assessing the connection between students' justice experience and perceptions of faculty incivility in higher education",
    venue: 'Journal of Academic Ethics',
    volume: '13', pages: '121-134',
    doi: '10.1007/s10805-015-9232-8',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: ['s10805-015-9232-8.pdf'],
  },

  // ========== F2. Accepted for Publication ==========
  {
    slug: 'bystanders-workplace-bullying-editorial',
    year: 2024,
    type: 'editorial',
    status: 'in-press',
    authors: ['Itzkovich, Y.', 'Hodgins, M.', 'McNamara, P. M.'],
    title: "Bystanders' roles in workplace bullying: Impacts and interventions",
    venue: 'Frontiers in Psychology',
    topics: ['bystander', 'bullying', 'editorial'], methods: ['Essay'],
    pdfCandidates: ['fpsyg-17-1763120.pdf'],
  },
  {
    slug: 'will-they-strike-back-incivility-bullying',
    year: 2026,
    type: 'article',
    status: 'in-press',
    authors: ['Notelaers, G.', 'Itzkovich, Y.', 'De Witte, H.', 'Vander Elst, T.', 'Baillieand, E.'],
    title: 'Will they Strike Back? Shedding Light on the Tit-for-Tat Mechanism in Incivility and Bullying Research from a Latent Class Perspective',
    venue: 'Journal of Aggression, Maltreatment & Trauma',
    topics: ['incivility', 'bullying'], methods: ['Quantitative'],
    pdfCandidates: ['Will They Strike Back .pdf'],
  },
  {
    slug: 'adult-bullying-voluntary-organizations',
    year: 2025,
    type: 'article',
    status: 'published',
    authors: ['Hodgins, M.', 'Itzkovich, Y.', 'Rayner, C.', 'Pursell, L.', 'MacCurtain, S.'],
    title: 'Adult to Adult Bullying in Voluntary Organizations: a scoping review',
    venue: 'Nonprofit Management & Leadership',
    volume: '35', issue: '4', pages: '813-835',
    doi: '10.1002/nml.21646',
    topics: ['bullying'], methods: ['Review'],
    pdfCandidates: ['Nonprofit Mgmnt   Ldrshp - 2025 - Hodgins - A Scoping Review of Bullying and Harassment in Nonprofit and Voluntary.pdf'],
  },
  {
    slug: 'preschool-teachers-revenge',
    year: 2024,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.'],
    title: "Delving into Preschool Teachers' Revenge – A Mediated-Moderated Model that Explores the Deeper Nuances of Hot and Cold Revenge among Preschool Teachers",
    venue: 'Current Psychology',
    volume: '43', pages: '33323–33337',
    doi: '10.1007/s12144-024-06792-x',
    topics: ['incivility', 'wellbeing'], methods: ['Quantitative'],
    pdfCandidates: ['s12144-024-06792-x-2.pdf'],
  },

  // ========== F2.1 Submitted ==========
  {
    slug: 'ultimate-bystander-ai-incivility',
    year: 2026,
    type: 'article',
    status: 'under-review',
    authors: ['Itzkovich, Y.', 'Aviv, Y.', 'Barzilai, O.'],
    title: 'The Ultimate Bystander: A Theoretical Framework for Trust-Based AI Intervention in Workplace Incivility',
    venue: 'Human-Computer Interaction',
    topics: ['ai', 'bystander', 'incivility'], methods: ['Conceptual'],
    featured: true,
    tldr: 'If humans freeze in the face of workplace incivility, can a listening, intervening AI lower the threshold for help? A trust-based framework and research agenda.',
    pdfCandidates: [],
  },
  {
    slug: 'incivility-trickle-down-compensatory',
    year: 2026,
    type: 'article',
    status: 'under-review',
    authors: ['Asraf, L.', 'Katz, H.', 'Itzkovich, Y.'],
    title: "When Incivility Doesn't Trickle Down: A Multilevel Examination of Compensatory Processes in Teams",
    venue: 'Journal of Managerial Psychology',
    topics: ['incivility', 'hierarchies'], methods: ['Multilevel', 'Quantitative'],
    pdfCandidates: [],
  },
  {
    slug: 'adhd-employability-psychological-resources',
    year: 2026,
    type: 'article',
    status: 'under-review',
    authors: ['Dolev, N.', 'Livne, Y.', 'Itzkovich, Y.'],
    title: 'Employability Efficacy in ADHD Young Adults: Supportive Psychological Resources',
    venue: 'Disability and Rehabilitation',
    topics: ['adhd', 'wellbeing'], methods: ['Quantitative'],
    pdfCandidates: [],
  },
  {
    slug: 'beyond-investment-thesis-sustainability',
    year: 2026,
    type: 'article',
    status: 'under-review',
    authors: ['Cao-Xuan, T.', 'Lemanski, M.', 'Itzkovich, Y.'],
    title: 'Beyond the Investment Thesis: When Educational Spending Fails to Predict Student Sustainability Behaviors',
    venue: 'Journal of Cleaner Production',
    topics: ['wellbeing'], methods: ['Quantitative'],
    pdfCandidates: ['Implementing_sustainability_in_wineries.pdf'],
  },

  // ========== F4. Book Chapters ==========
  {
    slug: 'social-emotional-ethos-teachers',
    year: 2021,
    type: 'chapter',
    status: 'published',
    authors: ['Dolev, N.', 'Itzkovich, Y.'],
    title: 'Development of social-emotional skills as part of the ethos of teachers',
    venue: 'The International Handbook of Teacher Ethos: Strengthening Teachers, Supporting Learners',
    publisher: 'Springer',
    pages: '261-278',
    topics: ['wellbeing'], methods: ['Conceptual'],
    pdfCandidates: [],
  },
  {
    slug: 'ai-era-soft-skills-hard-skills',
    year: 2020,
    type: 'chapter',
    status: 'published',
    authors: ['Dolev, N.', 'Itzkovich, Y.'],
    title: 'In the AI era, soft skills are the new hard skills',
    venue: 'Management and Business Education in the Time of Artificial Intelligence',
    publisher: 'Age Publishing',
    pages: '55-73',
    topics: ['ai'], methods: ['Conceptual'],
    pdfCandidates: [],
  },
  {
    slug: 'tit-for-tat-horizontal-solidarity',
    year: 2019,
    type: 'chapter',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Dolev, N.'],
    title: 'Tit for tat: horizontal solidarity as a buffer for micro-level corruption in the framework of the social exchange theory',
    venue: 'Anti-corruption in Research, in Practice, and in the Classroom',
    publisher: 'Age Publishing',
    pages: '181-206',
    topics: ['incivility'], methods: ['Conceptual'],
    pdfCandidates: [],
  },
  {
    slug: 'dark-side-teachers-behavior-framework',
    year: 2018,
    type: 'chapter',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Alt, D.'],
    title: "The dark side of teachers' behavior and its impact on students' reactions: a comprehensive framework to assess college students' reactions to faculty incivility",
    venue: "Professionals' Ethos and Education for Responsibility",
    publisher: 'Sense',
    pages: '127-136',
    topics: ['incivility'], methods: ['Conceptual'],
    pdfCandidates: [],
  },
  {
    slug: 'incivility-empathy-ethical-climate-hospital',
    year: 2017,
    type: 'chapter',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Dolev, N.'],
    title: 'Incivility, empathy, and ethical work climate among hospital staff in Israel: a study within the framework of moral disengagement theory',
    venue: 'Contemporary Perspectives in Corporate Social Performance and Policy — the Middle Eastern Perspective',
    publisher: 'Age Publishing',
    pages: '223-248',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: [],
  },

  // ========== F5. Articles in Conference Proceedings ==========
  {
    slug: 'perpetrated-incivility-aom-2021',
    year: 2021,
    type: 'conference',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Aleksic, A.'],
    title: 'Perpetrated incivility: individual vs contextual antecedents - a reflective viewpoint',
    venue: 'Academy of Management Proceedings',
    volume: '2021', issue: '1',
    publisher: 'Academy of Management',
    topics: ['incivility'], methods: ['Conceptual'],
    pdfCandidates: [],
  },
  {
    slug: 'aet-incivility-aom-2019',
    year: 2019,
    type: 'conference',
    status: 'published',
    authors: ['Itzkovich, Y.', 'Heilbrunn, S.', 'Dolev, N.'],
    title: 'An affective events theory viewpoint of the relationship between incivility and potential outcomes',
    venue: 'Academy of Management Proceedings',
    volume: '2019', issue: '1', pages: '14571',
    publisher: 'Academy of Management',
    topics: ['incivility'], methods: ['Conceptual'],
    pdfCandidates: [],
  },
  {
    slug: 'incivility-horizontal-solidarity-euromed-2015',
    year: 2015,
    type: 'conference',
    status: 'published',
    authors: ['Heilbrunn, S.', 'Itzkovich, Y.'],
    title: 'Impact of workplace incivility on horizontal solidarity and perceptions of job-insecurity',
    venue: '8th Annual Conference of the EuroMed Academy of Business Proceedings',
    topics: ['incivility'], methods: ['Quantitative'],
    pdfCandidates: [],
  },

  // ========== F8. Other Refereed Publications ==========
  {
    slug: 'why-leaders-behave-uncivilly',
    year: 2021,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.'],
    title: 'Why do leaders behave uncivilly: A new perspective on workplace mistreatment and power',
    venue: 'Wirtschaftspsychologie',
    volume: '3', pages: '32-39',
    topics: ['incivility', 'abusive-supervision'], methods: ['Conceptual'],
    pdfCandidates: [],
  },
  {
    slug: 'victim-perspective-incivility-negative-affectivity',
    year: 2016,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.'],
    title: 'The victim perspective of incivility: the role of negative affectivity, hierarchical status, and their interaction in explaining victimization',
    venue: 'International Journal of Work Organization and Emotion',
    volume: '7', issue: '2', pages: '126-142',
    doi: '10.1504/IJWOE.2016.078086',
    topics: ['incivility', 'hierarchies'], methods: ['Quantitative'],
    pdfCandidates: [],
  },
  {
    slug: 'incivility-hierarchical-status-manager-damage',
    year: 2014,
    type: 'article',
    status: 'published',
    authors: ['Itzkovich, Y.'],
    title: 'Incivility: the moderating effect of hierarchical status: does a manager inflict more damage?',
    venue: 'Journal of Management Research',
    volume: '6', issue: '3', pages: '87-98',
    doi: '10.5296/jmr.v6i3.5691',
    topics: ['incivility', 'hierarchies'], methods: ['Quantitative'],
    pdfCandidates: ['5691-21077-1-PB.pdf'],
  },
];

// =============== generation helpers ===============

function normalizeAuthors(authorStrings) {
  return authorStrings.map((name) => ({
    name,
    ...(name.toLowerCase().startsWith('itzkovich') ? { isMe: true } : {}),
  }));
}

function generateBibtex(p) {
  const firstAuthor = p.authors[0].toLowerCase().split(',')[0].replace(/\s/g, '');
  const key = `${firstAuthor}${p.year}`;
  const authorsLine = p.authors.join(' and ');
  if (p.type === 'chapter') {
    return `@incollection{${key},\n  title     = {${p.title}},\n  author    = {${authorsLine}},\n  booktitle = {${p.venue ?? ''}},\n  ${p.publisher ? `publisher = {${p.publisher}},\n  ` : ''}year      = {${p.year}}${p.pages ? `,\n  pages     = {${p.pages}}` : ''}\n}`;
  }
  if (p.type === 'conference') {
    return `@inproceedings{${key},\n  title     = {${p.title}},\n  author    = {${authorsLine}},\n  booktitle = {${p.venue ?? ''}},\n  year      = {${p.year}}\n}`;
  }
  const noteLine = p.status === 'under-review' ? ',\n  note    = {Under review}' : p.status === 'in-press' ? ',\n  note    = {In press}' : '';
  return `@article{${key},\n  title   = {${p.title}},\n  author  = {${authorsLine}},\n  journal = {${p.venue ?? ''}},\n  year    = {${p.year}}${p.volume ? `,\n  volume  = {${p.volume}}` : ''}${p.issue ? `,\n  number  = {${p.issue}}` : ''}${p.pages ? `,\n  pages   = {${p.pages}}` : ''}${p.doi ? `,\n  doi     = {${p.doi}}` : ''}${noteLine}\n}`;
}

function toYaml(value, indent = '') {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const looksNumeric = /^-?\d+(\.\d+)?$/.test(value);
    const needsQuote = looksNumeric || /[:#{}[\],&*!|>'"%@`\n]/.test(value) || value.includes('  ') || /^[\s-]/.test(value) || /^(true|false|yes|no|null)$/i.test(value);
    if (needsQuote) return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((v) => typeof v === 'string' && !/[:,"]/.test(v))) {
      return `[${value.map((v) => toYaml(v)).join(', ')}]`;
    }
    return '\n' + value.map((v) => `${indent}  - ${typeof v === 'object' ? objToYamlBlock(v, indent + '    ').trimStart() : toYaml(v)}`).join('\n');
  }
  if (typeof value === 'object') {
    return '\n' + objToYamlBlock(value, indent + '  ');
  }
  return String(value);
}

function objToYamlBlock(obj, indent) {
  return Object.entries(obj)
    .map(([k, v]) => `${indent}${k}: ${toYaml(v, indent)}`)
    .join('\n');
}

function buildFrontMatter(p) {
  const id = `${p.authors[0].toLowerCase().split(',')[0].replace(/\s/g, '-')}${p.year}-${p.slug.split('-')[0]}`;
  const authors = normalizeAuthors(p.authors);
  const pdf = p.pdfPath ? { available: true, path: p.pdfPath, type: 'published' } : { available: false };

  const frontMatter = {
    id,
    slug: p.slug,
    title: p.title,
    authors,
    year: p.year,
    type: p.type,
    status: p.status,
    venue: p.venue ?? null,
  };
  if (p.volume) frontMatter.volume = String(p.volume);
  if (p.issue) frontMatter.issue = String(p.issue);
  if (p.pages) frontMatter.pages = String(p.pages);
  if (p.doi) frontMatter.doi = p.doi;
  if (p.publisher) frontMatter.publisher = p.publisher;
  frontMatter.topics = p.topics ?? [];
  frontMatter.methods = p.methods ?? [];
  frontMatter.featured = Boolean(p.featured);
  if (p.tldr) frontMatter.tldr = p.tldr;
  if (p.abstract) frontMatter.abstract = p.abstract;
  frontMatter.pdf = pdf;
  frontMatter.bibtex = generateBibtex(p);

  return frontMatter;
}

function renderFrontMatter(fm) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined) continue;
    if (key === 'authors') {
      lines.push('authors:');
      for (const a of value) {
        lines.push(`  - name: ${toYaml(a.name)}`);
        if (a.isMe) lines.push('    isMe: true');
        if (a.orcid) lines.push(`    orcid: ${toYaml(a.orcid)}`);
        if (a.affiliation) lines.push(`    affiliation: ${toYaml(a.affiliation)}`);
      }
    } else if (key === 'topics' || key === 'methods') {
      lines.push(`${key}: ${toYaml(value)}`);
    } else if (key === 'pdf') {
      lines.push('pdf:');
      for (const [pk, pv] of Object.entries(value)) {
        lines.push(`  ${pk}: ${toYaml(pv)}`);
      }
    } else if (key === 'bibtex' || key === 'abstract' || (key === 'tldr' && value.length > 140)) {
      lines.push(`${key}: |`);
      for (const line of String(value).split('\n')) {
        lines.push(`  ${line}`);
      }
    } else {
      lines.push(`${key}: ${toYaml(value)}`);
    }
  }
  lines.push('---');
  return lines.join('\n') + '\n';
}

// =============== PDF matching ===============

const PDF_SOURCE_DIR = '/Users/yarivitzkovich/Library/CloudStorage/OneDrive-ariel.ac.il/Yariv/site-publications';
const PDF_OUT_DIR = join(ROOT, 'public/pdfs');
mkdirSync(PDF_OUT_DIR, { recursive: true });

function copyPdfIfNeeded(p) {
  if (!p.pdfCandidates || p.pdfCandidates.length === 0) return null;
  for (const candidate of p.pdfCandidates) {
    const srcPath = join(PDF_SOURCE_DIR, candidate);
    if (!existsSync(srcPath)) continue;
    const destName = `${p.slug}.pdf`;
    const destPath = join(PDF_OUT_DIR, destName);
    copyFileSync(srcPath, destPath);
    return `/pdfs/${destName}`;
  }
  return null;
}

// =============== main ===============

let wrote = 0, copiedPdf = 0, kept = 0;

// Clean up old sample files (except books we want to keep)
const existing = readdirSync(OUT_DIR).filter((f) => f.endsWith('.mdx'));
for (const f of existing) {
  const slug = f.replace('.mdx', '');
  if (!KEEP.has(slug) && !PUBS.find((p) => p.slug === slug)) {
    unlinkSync(join(OUT_DIR, f));
    console.log(`  deleted old: ${f}`);
  } else if (KEEP.has(slug)) {
    kept++;
  }
}

for (const p of PUBS) {
  if (KEEP.has(p.slug)) continue; // don't overwrite manually curated entries
  const pdfPath = copyPdfIfNeeded(p);
  if (pdfPath) {
    p.pdfPath = pdfPath;
    copiedPdf++;
  }
  const fm = buildFrontMatter(p);
  const content = renderFrontMatter(fm);
  writeFileSync(join(OUT_DIR, `${p.slug}.mdx`), content);
  wrote++;
}

console.log(`\nDone. Wrote ${wrote} MDX files, copied ${copiedPdf} PDFs, kept ${kept} curated entries.`);
