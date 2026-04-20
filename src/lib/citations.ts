import type { Publication, PublicationAuthor } from './publications';

// --- Author formatting helpers ---

function splitName(name: string): { last: string; initials: string } {
  if (name.includes(',')) {
    const [last, rest] = name.split(',').map((s) => s.trim());
    return { last, initials: rest };
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { last: parts[0], initials: '' };
  const last = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => `${p[0]?.toUpperCase() ?? ''}.`)
    .join(' ');
  return { last, initials };
}

function formatAuthorAPA(author: PublicationAuthor): string {
  const { last, initials } = splitName(author.name);
  return initials ? `${last}, ${initials}` : last;
}

function formatAuthorMLA(author: PublicationAuthor, first: boolean): string {
  const parts = author.name.split(',').map((s) => s.trim());
  if (parts.length >= 2 && first) return `${parts[0]}, ${parts.slice(1).join(', ')}`;
  if (parts.length >= 2) return `${parts.slice(1).join(' ')} ${parts[0]}`.trim();
  return author.name;
}

function formatAuthorChicago(author: PublicationAuthor, first: boolean): string {
  return formatAuthorMLA(author, first);
}

// --- APA 7 ---

export function formatAuthorsAPA(authors: PublicationAuthor[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return formatAuthorAPA(authors[0]);
  if (authors.length === 2) return `${formatAuthorAPA(authors[0])}, & ${formatAuthorAPA(authors[1])}`;
  if (authors.length <= 20) {
    const all = authors.map(formatAuthorAPA);
    const last = all.pop();
    return `${all.join(', ')}, & ${last}`;
  }
  const first19 = authors.slice(0, 19).map(formatAuthorAPA).join(', ');
  const lastAuthor = formatAuthorAPA(authors[authors.length - 1]);
  return `${first19}, ... ${lastAuthor}`;
}

function apaVolumeIssuePages(p: Publication): string {
  let out = '';
  if (p.volume) out += `, ${p.volume}`;
  if (p.issue) out += `(${p.issue})`;
  if (p.pages) out += `, ${p.pages}`;
  return out;
}

function apaDoiOrUrl(p: Publication): string {
  if (p.doi) return ` https://doi.org/${p.doi}`;
  if (p.url) return ` ${p.url}`;
  return '';
}

export function generateAPA(p: Publication): string {
  const authors = formatAuthorsAPA(p.authors);
  const yearPart =
    p.status === 'under-review'
      ? '(under review)'
      : p.status === 'in-press'
        ? '(in press)'
        : `(${p.year})`;
  const title = p.title.replace(/\.$/, '');
  const venue = p.venue ?? '';

  switch (p.type) {
    case 'article':
    case 'editorial':
    case 'preprint':
      return `${authors} ${yearPart}. ${title}. *${venue}*${apaVolumeIssuePages(p)}.${apaDoiOrUrl(p)}`.trim();
    case 'chapter':
      return `${authors} ${yearPart}. ${title}. In *${venue}*${p.pages ? ` (pp. ${p.pages})` : ''}.${p.publisher ? ` ${p.publisher}.` : ''}${apaDoiOrUrl(p)}`.trim();
    case 'book':
    case 'edited-book':
      return `${authors} ${yearPart}. *${title}*.${p.publisher ? ` ${p.publisher}.` : ''}${apaDoiOrUrl(p)}`.trim();
    case 'conference':
      return `${authors} ${yearPart}. ${title}. *${venue}*${apaVolumeIssuePages(p)}.${apaDoiOrUrl(p)}`.trim();
    case 'thesis':
      return `${authors} ${yearPart}. *${title}* [${p.venue ?? 'Doctoral dissertation'}].${apaDoiOrUrl(p)}`.trim();
    default:
      return `${authors} ${yearPart}. ${title}. ${venue}.${apaDoiOrUrl(p)}`.trim();
  }
}

// --- MLA 9 ---

export function formatAuthorsMLA(authors: PublicationAuthor[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return `${formatAuthorMLA(authors[0], true)}.`;
  if (authors.length === 2)
    return `${formatAuthorMLA(authors[0], true)}, and ${formatAuthorMLA(authors[1], false)}.`;
  return `${formatAuthorMLA(authors[0], true)}, et al.`;
}

export function generateMLA(p: Publication): string {
  const authors = formatAuthorsMLA(p.authors);
  const title = p.title.replace(/\.$/, '');
  const venue = p.venue ?? '';
  const year = p.status === 'under-review' ? 'Under review' : p.status === 'in-press' ? 'In press' : p.year;

  switch (p.type) {
    case 'article':
    case 'editorial':
    case 'preprint': {
      let core = `${authors} "${title}." *${venue}*`;
      if (p.volume) core += `, vol. ${p.volume}`;
      if (p.issue) core += `, no. ${p.issue}`;
      core += `, ${year}`;
      if (p.pages) core += `, pp. ${p.pages}`;
      core += '.';
      if (p.doi) core += ` https://doi.org/${p.doi}.`;
      return core;
    }
    case 'chapter':
      return `${authors} "${title}." *${venue}*, ${p.publisher ? `${p.publisher}, ` : ''}${year}${p.pages ? `, pp. ${p.pages}` : ''}.${p.doi ? ` https://doi.org/${p.doi}.` : ''}`;
    case 'book':
    case 'edited-book':
      return `${authors} *${title}*. ${p.publisher ?? venue ?? ''}, ${year}.${p.isbn ? ` ISBN ${p.isbn}.` : ''}`;
    case 'conference':
      return `${authors} "${title}." *${venue}*, ${year}${p.pages ? `, pp. ${p.pages}` : ''}.`;
    default:
      return `${authors} "${title}." *${venue}*, ${year}.`;
  }
}

// --- Chicago (author-date) ---

export function formatAuthorsChicago(authors: PublicationAuthor[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return formatAuthorChicago(authors[0], true);
  if (authors.length <= 3) {
    const all = authors.map((a, i) => formatAuthorChicago(a, i === 0));
    const last = all.pop();
    return `${all.join(', ')}, and ${last}`;
  }
  return `${formatAuthorChicago(authors[0], true)} et al.`;
}

export function generateChicago(p: Publication): string {
  const authors = formatAuthorsChicago(p.authors);
  const title = p.title.replace(/\.$/, '');
  const venue = p.venue ?? '';
  const year = p.status === 'under-review' ? 'Under review' : p.status === 'in-press' ? 'In press' : p.year;

  switch (p.type) {
    case 'article':
    case 'editorial':
    case 'preprint': {
      let out = `${authors}. ${year}. "${title}." *${venue}*`;
      if (p.volume) out += ` ${p.volume}`;
      if (p.issue) out += ` (${p.issue})`;
      if (p.pages) out += `: ${p.pages}`;
      out += '.';
      if (p.doi) out += ` https://doi.org/${p.doi}.`;
      return out;
    }
    case 'chapter':
      return `${authors}. ${year}. "${title}." In *${venue}*${p.pages ? `, ${p.pages}` : ''}.${p.publisher ? ` ${p.publisher}.` : ''}${p.doi ? ` https://doi.org/${p.doi}.` : ''}`;
    case 'book':
    case 'edited-book':
      return `${authors}. ${year}. *${title}*.${p.publisher ? ` ${p.publisher}.` : ''}`;
    case 'conference':
      return `${authors}. ${year}. "${title}." *${venue}*${p.pages ? ` ${p.pages}` : ''}.`;
    default:
      return `${authors}. ${year}. "${title}." *${venue}*.`;
  }
}

// --- Helpers for rendering with italics ---
// Citation strings use *text* for italics. UI components can split on * to render
// alternating plain/italic spans; copying to clipboard should strip the asterisks.

export function stripMarkdownItalics(s: string): string {
  return s.replace(/\*([^*]+)\*/g, '$1');
}

export function splitMarkdownItalics(s: string): Array<{ text: string; italic: boolean }> {
  const parts: Array<{ text: string; italic: boolean }> = [];
  const regex = /\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(s))) {
    if (m.index > last) parts.push({ text: s.slice(last, m.index), italic: false });
    parts.push({ text: m[1], italic: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ text: s.slice(last), italic: false });
  return parts;
}
