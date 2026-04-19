import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { TOPIC_IDS } from './data/topics';
import { METHODS } from './data/methods';

const authorSchema = z.object({
  name: z.string(),
  isMe: z.boolean().optional(),
  orcid: z.string().optional(),
  affiliation: z.string().optional(),
});

const publications = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/publications' }),
  schema: z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    titleHe: z.string().optional(),
    authors: z.array(authorSchema),
    year: z.number(),
    type: z.enum(['article', 'chapter', 'editorial', 'conference', 'preprint', 'thesis']),
    status: z.enum(['published', 'under-review', 'in-press', 'working-paper', 'pending-review', 'draft']),
    venue: z.string().nullable().optional(),
    venueShort: z.string().nullable().optional(),
    volume: z.string().nullable().optional(),
    issue: z.string().nullable().optional(),
    pages: z.string().nullable().optional(),
    doi: z.string().nullable().optional(),
    url: z.string().url().nullable().optional(),
    topics: z.array(z.enum(TOPIC_IDS as [string, ...string[]])),
    methods: z.array(z.enum(METHODS as unknown as [string, ...string[]])),
    featured: z.boolean().default(false),
    tldr: z.string().optional(),
    bulletSummary: z.array(z.string()).optional(),
    executiveSummary: z.string().optional(),
    abstract: z.string().optional(),
    pdf: z
      .object({
        available: z.boolean(),
        path: z.string().optional(),
        type: z.enum(['preprint', 'accepted-manuscript', 'published', 'none']).optional(),
        note: z.string().optional(),
      })
      .optional(),
    podcast: z
      .object({
        available: z.boolean(),
        path: z.string().optional(),
        duration: z.string().optional(),
        description: z.string().optional(),
      })
      .optional(),
    bibtex: z.string().optional(),
    citations: z
      .object({
        openAlex: z.number().nullable().optional(),
        googleScholar: z.number().nullable().optional(),
        lastFetched: z.coerce.date().nullable().optional(),
      })
      .optional(),
    image: z.string().optional(),
  }),
});

const courses = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/courses' }),
  schema: z.object({
    code: z.string(),
    title: z.string(),
    titleHe: z.string().optional(),
    level: z.enum(['undergraduate', 'graduate', 'executive']),
    program: z.string().optional(),
    institution: z.string(),
    years: z.array(z.string()),
    current: z.boolean().default(false),
    description: z.string().optional(),
    syllabusPdf: z.string().optional(),
  }),
});

const conferences = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/conferences' }),
  schema: z.object({
    title: z.string(),
    event: z.string(),
    location: z.string().optional(),
    date: z.coerce.date(),
    type: z.enum(['upcoming', 'past']),
    role: z.enum(['presenter', 'discussant', 'chair', 'keynote', 'invited']),
    slidesPdf: z.string().nullable().optional(),
  }),
});

export const collections = { publications, courses, conferences };
