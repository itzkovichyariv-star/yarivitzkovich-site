export type PublicationType =
  | 'article'
  | 'chapter'
  | 'editorial'
  | 'conference'
  | 'preprint'
  | 'thesis';

export type PublicationStatus =
  | 'published'
  | 'under-review'
  | 'in-press'
  | 'working-paper'
  | 'pending-review'
  | 'draft';

export interface PublicationAuthor {
  name: string;
  isMe?: boolean;
  orcid?: string;
  affiliation?: string;
}

export interface Publication {
  id: string;
  slug: string;
  title: string;
  authors: PublicationAuthor[];
  year: number;
  type: PublicationType;
  status: PublicationStatus;
  venue?: string | null;
  venueShort?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  doi?: string | null;
  url?: string | null;
  topics: string[];
  methods: string[];
  featured: boolean;
  tldr?: string;
  abstract?: string;
  pdf?: { available: boolean; path?: string; type?: string; note?: string };
  podcast?: {
    available: boolean;
    path?: string;
    duration?: string;
    description?: string;
  };
  bibtex?: string;
}

export function formatStatus(status: PublicationStatus): string | null {
  switch (status) {
    case 'under-review':
      return 'Under review';
    case 'in-press':
      return 'In press';
    case 'working-paper':
      return 'Working paper';
    case 'pending-review':
      return 'Pending review';
    case 'draft':
      return 'Draft';
    default:
      return null;
  }
}

export function formatType(type: PublicationType): string {
  switch (type) {
    case 'article':
      return 'Article';
    case 'chapter':
      return 'Chapter';
    case 'editorial':
      return 'Editorial';
    case 'conference':
      return 'Conference';
    case 'preprint':
      return 'Preprint';
    case 'thesis':
      return 'Thesis';
  }
}

export function formatAuthors(authors: PublicationAuthor[]): string {
  if (authors.length === 1) return authors[0].name;
  if (authors.length === 2) return `${authors[0].name} & ${authors[1].name}`;
  return `${authors
    .slice(0, -1)
    .map((a) => a.name)
    .join(', ')}, & ${authors[authors.length - 1].name}`;
}

export function generateBibtex(pub: Publication): string {
  if (pub.bibtex) return pub.bibtex;
  const firstAuthorLast = pub.authors[0]?.name?.split(',')[0]?.trim().toLowerCase() || 'author';
  const key = `${firstAuthorLast}${pub.year}`;
  const authorsLine = pub.authors.map((a) => a.name).join(' and ');
  if (pub.type === 'chapter') {
    return `@incollection{${key},\n  title     = {${pub.title}},\n  author    = {${authorsLine}},\n  booktitle = {${pub.venue ?? ''}},\n  year      = {${pub.year}}\n}`;
  }
  return `@article{${key},\n  title   = {${pub.title}},\n  author  = {${authorsLine}},\n  journal = {${pub.venue ?? ''}},\n  year    = {${pub.year}}${pub.status === 'under-review' ? ',\n  note    = {Under review}' : ''}\n}`;
}
