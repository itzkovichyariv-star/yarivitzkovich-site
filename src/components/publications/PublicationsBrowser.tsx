import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Clock,
  FileDown,
  LayoutGrid,
  Network,
  Pause,
  Play,
  Quote,
  X,
} from 'lucide-react';
import {
  formatAuthors,
  formatStatus,
  formatType,
  generateBibtex,
  type Publication,
  type PublicationType,
} from '../../lib/publications';
import {
  generateAPA,
  generateMLA,
  generateChicago,
  splitMarkdownItalics,
  stripMarkdownItalics,
} from '../../lib/citations';

interface TopicOption {
  id: string;
  label: string;
}

interface Props {
  publications: Publication[];
  topics: TopicOption[];
  availableTypes?: string[];
  initialFilters?: InitialFilters;
}

interface InitialFilters {
  type?: string;
  topics?: string[];
  from?: number;
  view?: ViewMode;
  slug?: string;
}

type ViewMode = 'grid' | 'timeline' | 'topics';

const TYPE_OPTIONS: Array<{ k: 'all' | PublicationType; label: string }> = [
  { k: 'all', label: 'All' },
  { k: 'article', label: 'Article' },
  { k: 'chapter', label: 'Chapter' },
  { k: 'book', label: 'Book' },
  { k: 'editorial', label: 'Editorial' },
  { k: 'preprint', label: 'Preprint' },
];

const VIEW_OPTIONS: Array<{ k: ViewMode; icon: typeof LayoutGrid; label: string }> = [
  { k: 'grid', icon: LayoutGrid, label: 'Grid' },
  { k: 'timeline', icon: Clock, label: 'Timeline' },
  { k: 'topics', icon: Network, label: 'Topics' },
];

export default function PublicationsBrowser({
  publications,
  topics,
  availableTypes,
  initialFilters = {},
}: Props) {
  const typeFilterOptions = useMemo(() => {
    if (!availableTypes) return TYPE_OPTIONS;
    const allowed = new Set(availableTypes);
    return TYPE_OPTIONS.filter((o) => o.k === 'all' || allowed.has(o.k));
  }, [availableTypes]);
  const years = useMemo(() => publications.map((p) => p.year), [publications]);
  const yearBounds = useMemo(
    () => ({
      min: years.length ? Math.min(...years) : 2015,
      max: years.length ? Math.max(...years) : new Date().getFullYear(),
    }),
    [years],
  );

  const [view, setView] = useState<ViewMode>(initialFilters.view ?? 'grid');
  const [activeType, setActiveType] = useState<'all' | PublicationType>(
    (initialFilters.type as 'all' | PublicationType) ?? 'all',
  );
  const [activeTopics, setActiveTopics] = useState<string[]>(initialFilters.topics ?? []);
  const [yearMin, setYearMin] = useState<number>(initialFilters.from ?? yearBounds.min);
  const [selected, setSelected] = useState<Publication | null>(() => {
    if (!initialFilters.slug) return null;
    return publications.find((p) => p.slug === initialFilters.slug) ?? null;
  });
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (activeType !== 'all') params.set('type', activeType);
    if (activeTopics.length) params.set('topics', activeTopics.join(','));
    if (yearMin !== yearBounds.min) params.set('from', String(yearMin));
    if (view !== 'grid') params.set('view', view);
    const qs = params.toString();
    const newUrl = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [activeType, activeTopics, yearMin, view, yearBounds.min]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.play().catch(() => setPlaying(false));
    else audioRef.current.pause();
  }, [playing]);

  useEffect(() => {
    setPlaying(false);
    setCopied(false);
  }, [selected?.id]);

  const toggleTopic = useCallback((topic: string) => {
    setActiveTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  }, []);

  const filtered = useMemo(() => {
    return publications
      .filter((p) => {
        if (activeType !== 'all' && p.type !== activeType) return false;
        if (p.year < yearMin) return false;
        if (activeTopics.length && !p.topics.some((t) => activeTopics.includes(t))) return false;
        return true;
      })
      .sort((a, b) => b.year - a.year);
  }, [publications, activeType, activeTopics, yearMin]);

  const groupedByTopic = useMemo(() => {
    const map = new Map<string, Publication[]>();
    filtered.forEach((p) => {
      p.topics.forEach((t) => {
        if (!map.has(t)) map.set(t, []);
        const bucket = map.get(t)!;
        if (!bucket.find((x) => x.id === p.id)) bucket.push(p);
      });
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const topicLabel = useCallback(
    (id: string) => topics.find((t) => t.id === id)?.label ?? id,
    [topics],
  );

  const copyCitation = (text: string) => {
    navigator.clipboard?.writeText(stripMarkdownItalics(text));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      {/* Filter bar */}
      <section
        className="sticky top-[68px] z-30 border-y py-4"
        style={{
          backgroundColor: 'var(--nav-bg)',
          backdropFilter: 'blur(8px)',
          borderColor: 'var(--divider)',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="flex flex-wrap items-center gap-6">
            {/* View toggle */}
            <div
              className="flex items-center gap-1 border rounded-full p-1"
              style={{ borderColor: 'var(--divider)' }}
            >
              {VIEW_OPTIONS.map(({ k, icon: Icon, label }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setView(k)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider transition-all"
                  style={
                    view === k
                      ? { backgroundColor: 'var(--text)', color: 'var(--surface)' }
                      : { color: 'var(--text)' }
                  }
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>

            {/* Type filter */}
            <div className="flex items-center gap-1 flex-wrap">
              {typeFilterOptions.map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setActiveType(t.k)}
                  className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-full transition-all"
                  style={
                    activeType === t.k
                      ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' }
                      : { color: 'var(--text)', opacity: 0.55 }
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Year range */}
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="uppercase tracking-wider text-soft">From</span>
              <input
                type="range"
                min={yearBounds.min}
                max={yearBounds.max}
                value={yearMin}
                onChange={(e) => setYearMin(Number(e.target.value))}
                className="w-28 accent-[var(--color-accent)]"
              />
              <span className="w-10 tabular-nums">{yearMin}</span>
            </div>

            <div className="ml-auto font-mono text-xs uppercase tracking-widest text-soft">
              {filtered.length} / {publications.length}
            </div>
          </div>

          {/* Topic pills */}
          <div className="flex flex-wrap gap-2 mt-4">
            {topics.map((t) => {
              const active = activeTopics.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTopic(t.id)}
                  className="px-3 py-1 rounded-full text-[11px] border transition-all"
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--text)',
                          color: 'var(--surface)',
                          borderColor: 'var(--text)',
                        }
                      : {
                          color: 'var(--text)',
                          borderColor: 'var(--divider)',
                          opacity: 0.7,
                        }
                  }
                >
                  {t.label}
                </button>
              );
            })}
            {activeTopics.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTopics([])}
                className="text-[11px] font-mono uppercase tracking-wider opacity-50 hover:opacity-100 ml-2"
              >
                Clear ×
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 py-12 min-h-[60vh]">
        {view === 'grid' && <GridView pubs={filtered} onSelect={setSelected} topicLabel={topicLabel} />}
        {view === 'timeline' && <TimelineView pubs={filtered} onSelect={setSelected} />}
        {view === 'topics' && (
          <TopicsView groups={groupedByTopic} topicLabel={topicLabel} onSelect={setSelected} />
        )}

        {filtered.length === 0 && (
          <div className="text-center py-24 text-soft">
            <p className="font-display text-2xl">No papers match those filters.</p>
            <p className="text-sm mt-2">Try clearing topics or widening the year range.</p>
          </div>
        )}
      </section>

      {/* Drawer */}
      {selected && (
        <Drawer
          pub={selected}
          paperNumber={String(
            publications.findIndex((p) => p.id === selected.id) + 1,
          ).padStart(3, '0')}
          related={publications.filter(
            (p) => p.id !== selected.id && p.topics.some((t) => selected.topics.includes(t)),
          ).slice(0, 3)}
          topicLabel={topicLabel}
          onClose={() => setSelected(null)}
          onSelect={setSelected}
          copied={copied}
          onCopy={copyCitation}
          playing={playing}
          onTogglePlay={() => setPlaying((p) => !p)}
          audioRef={audioRef}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Publication['status'] }) {
  const label = formatStatus(status);
  if (!label) return null;
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
      style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' }}
    >
      {label}
    </span>
  );
}

function TopicChip({ label }: { label: string }) {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border"
      style={{ borderColor: 'var(--divider)' }}
    >
      {label}
    </span>
  );
}

function GridView({
  pubs,
  onSelect,
  topicLabel,
}: {
  pubs: Publication[];
  onSelect: (p: Publication) => void;
  topicLabel: (id: string) => string;
}) {
  return (
    <div>
      {pubs.map((p, i) => (
        <article
          key={p.id}
          onClick={() => onSelect(p)}
          className="pub-row grid grid-cols-12 gap-6 py-8 cursor-pointer fade-up"
          style={{
            animationDelay: `${Math.min(i * 40, 400)}ms`,
            borderTop: i === 0 ? 'none' : '1px solid var(--divider)',
          }}
        >
          <div className="col-span-2 md:col-span-1 font-mono text-sm text-muted pt-1">{p.year}</div>
          <div className="col-span-10 md:col-span-8">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-widest text-soft">
                {formatType(p.type)}
              </span>
              <StatusBadge status={p.status} />
              {p.podcast?.available && (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted">
                  <Play size={10} /> Podcast
                </span>
              )}
            </div>
            <h3 className="pub-title font-display text-xl md:text-2xl leading-snug mb-2" style={{ fontWeight: 400 }}>
              {p.title}
            </h3>
            <p className="text-sm text-muted italic mb-3">
              {p.venue ? `${p.venue} — ` : ''}{formatAuthors(p.authors)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {p.topics.map((t) => (
                <TopicChip key={t} label={topicLabel(t)} />
              ))}
            </div>
          </div>
          <div className="col-span-12 md:col-span-3 md:text-right flex md:flex-col md:items-end">
            <ArrowUpRight size={22} className="pub-arrow" />
          </div>
        </article>
      ))}
    </div>
  );
}

const TIMELINE_INITIAL_LIMIT = 10;

function TimelineView({
  pubs,
  onSelect,
}: {
  pubs: Publication[];
  onSelect: (p: Publication) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? pubs : pubs.slice(0, TIMELINE_INITIAL_LIMIT);
  const hiddenCount = pubs.length - visible.length;

  useEffect(() => {
    if (pubs.length <= TIMELINE_INITIAL_LIMIT && expanded) setExpanded(false);
  }, [pubs.length, expanded]);

  return (
    <div className="relative pl-8 md:pl-32">
      <div
        className="absolute top-0 bottom-0 left-2 md:left-24 w-px"
        style={{ backgroundColor: 'var(--divider)' }}
      />
      {visible.map((p, i) => (
        <div
          key={p.id}
          onClick={() => onSelect(p)}
          className="relative pb-12 cursor-pointer group fade-up"
          style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
        >
          <div
            className="absolute w-3 h-3 rounded-full transition-transform group-hover:scale-[1.4]"
            style={{
              left: 'calc(-1.65rem - 5px)',
              top: '8px',
              backgroundColor: 'var(--color-accent)',
            }}
          />
          <div
            className="hidden md:block absolute font-mono text-sm font-medium"
            style={{ left: '-7rem', top: '4px' }}
          >
            {p.year}
          </div>
          <div className="md:hidden font-mono text-xs text-muted mb-1">{p.year}</div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-widest text-soft">
              {formatType(p.type)}
            </span>
            <StatusBadge status={p.status} />
          </div>
          <h3 className="font-display text-xl md:text-2xl mb-1" style={{ fontWeight: 400 }}>
            {p.title}
          </h3>
          <p className="text-sm italic text-muted">{p.venue}</p>
        </div>
      ))}

      {hiddenCount > 0 && (
        <div className="relative pt-2">
          <div
            className="absolute w-3 h-3 rounded-full"
            style={{
              left: 'calc(-1.65rem - 5px)',
              top: '10px',
              backgroundColor: 'var(--divider)',
            }}
          />
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm border hover:opacity-80 transition-opacity"
            style={{ borderColor: 'var(--text)' }}
          >
            See {hiddenCount} older {hiddenCount === 1 ? 'paper' : 'papers'} →
          </button>
        </div>
      )}

      {expanded && pubs.length > TIMELINE_INITIAL_LIMIT && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="font-mono text-xs uppercase tracking-wider text-soft hover:opacity-100 transition-opacity"
          >
            Show fewer ↑
          </button>
        </div>
      )}
    </div>
  );
}

function TopicsView({
  groups,
  topicLabel,
  onSelect,
}: {
  groups: [string, Publication[]][];
  topicLabel: (id: string) => string;
  onSelect: (p: Publication) => void;
}) {
  return (
    <div className="grid gap-10">
      {groups.map(([topic, pubs], idx) => (
        <div key={topic} className="fade-up" style={{ animationDelay: `${idx * 60}ms` }}>
          <div
            className="flex items-baseline gap-4 mb-4 pb-2 border-b"
            style={{ borderColor: 'var(--divider)' }}
          >
            <h2 className="font-display text-3xl" style={{ fontWeight: 400 }}>
              {topicLabel(topic)}
            </h2>
            <span className="font-mono text-xs uppercase tracking-widest text-soft">
              {pubs.length} {pubs.length === 1 ? 'paper' : 'papers'}
            </span>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {pubs.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                className="text-left p-5 border rounded-lg hover:opacity-90 transition-opacity"
                style={{ borderColor: 'var(--divider)' }}
              >
                <div className="font-mono text-xs text-muted mb-2">
                  {p.year} · {formatType(p.type)}
                </div>
                <h3 className="font-display text-lg leading-snug mb-1" style={{ fontWeight: 400 }}>
                  {p.title}
                </h3>
                <p className="text-xs italic text-muted">{p.venue}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type CitationFormat = 'apa' | 'mla' | 'chicago' | 'bibtex';

function Drawer({
  pub,
  paperNumber,
  related,
  topicLabel,
  onClose,
  onSelect,
  copied,
  onCopy,
  playing,
  onTogglePlay,
  audioRef,
}: {
  pub: Publication;
  paperNumber: string;
  related: Publication[];
  topicLabel: (id: string) => string;
  onClose: () => void;
  onSelect: (p: Publication) => void;
  copied: boolean;
  onCopy: (text: string) => void;
  playing: boolean;
  onTogglePlay: () => void;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
}) {
  const [format, setFormat] = useState<CitationFormat>('apa');
  const citations: Record<CitationFormat, string> = {
    apa: generateAPA(pub),
    mla: generateMLA(pub),
    chicago: generateChicago(pub),
    bibtex: generateBibtex(pub),
  };
  const activeCitation = citations[format];

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
        aria-hidden="true"
      />
      <aside
        className="fixed top-0 right-0 bottom-0 z-50 w-full md:w-[640px] overflow-y-auto drawer-enter"
        style={{
          backgroundColor: 'var(--surface)',
          color: 'var(--text)',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.15)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <div
          className="sticky top-0 flex items-center justify-between px-6 md:px-10 py-5 border-b"
          style={{
            backgroundColor: 'var(--nav-bg)',
            backdropFilter: 'blur(8px)',
            borderColor: 'var(--divider)',
          }}
        >
          <div className="font-mono text-xs uppercase tracking-widest text-muted">
            Paper № {paperNumber}
          </div>
          <div className="flex items-center gap-4">
            <a
              href={`/publications/${pub.slug}`}
              className="font-mono text-xs uppercase tracking-widest hover:opacity-60 inline-flex items-center gap-1"
            >
              Open full page <ArrowUpRight size={12} />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="hover:opacity-60 transition-opacity"
              aria-label="Close drawer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="px-6 md:px-10 py-10">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="font-mono text-xs uppercase tracking-widest text-muted">
              {pub.year} · {formatType(pub.type)}
            </span>
            <StatusBadge status={pub.status} />
          </div>

          {(pub.type === 'book' || pub.type === 'edited-book') && pub.image ? (
            <div className="grid grid-cols-[120px_1fr] gap-5 items-start mb-6">
              <img
                src={pub.image}
                alt={`${pub.title} cover`}
                className="w-[120px] rounded-sm"
                style={{ boxShadow: '0 8px 24px rgba(26,22,18,0.18)' }}
                loading="lazy"
              />
              <div>
                <h2
                  id="drawer-title"
                  className="font-display text-2xl md:text-3xl leading-tight mb-3"
                  style={{ fontWeight: 400 }}
                >
                  {pub.title}
                </h2>
                <p className="text-sm italic text-muted mb-1">{formatAuthors(pub.authors)}</p>
                {pub.publisher && <p className="text-sm text-muted">{pub.publisher}</p>}
                {pub.isbn && <p className="font-mono text-[11px] text-soft mt-1">ISBN {pub.isbn}</p>}
              </div>
            </div>
          ) : (
            <>
              <h2
                id="drawer-title"
                className="font-display text-3xl md:text-4xl leading-tight mb-4"
                style={{ fontWeight: 400 }}
              >
                {pub.title}
              </h2>
              <p className="text-sm italic text-muted mb-2">{formatAuthors(pub.authors)}</p>
              {pub.venue && <p className="text-sm text-muted mb-6">{pub.venue}</p>}
            </>
          )}

          <div className="flex flex-wrap gap-1.5 mb-10">
            {pub.topics.map((t) => (
              <TopicChip key={t} label={topicLabel(t)} />
            ))}
            {pub.methods.map((m) => (
              <span
                key={m}
                className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(26,22,18,0.08)' }}
              >
                {m}
              </span>
            ))}
          </div>

          {pub.tldr && (
            <div
              className="mb-8 pl-5 border-l-2"
              style={{ borderColor: 'var(--color-accent)' }}
            >
              <div className="font-mono text-xs uppercase tracking-widest text-muted mb-2">TL;DR</div>
              <p className="font-display text-lg leading-snug" style={{ fontWeight: 400 }}>
                {pub.tldr}
              </p>
            </div>
          )}

          {pub.podcast?.available && pub.podcast.path && (
            <div
              className="mb-8 p-5 rounded-lg"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' }}
            >
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={onTogglePlay}
                  className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-accent)' }}
                  aria-label={playing ? 'Pause audio' : 'Play audio'}
                >
                  {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                </button>
                <div className="flex-1">
                  <div className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-1">
                    Audio companion
                  </div>
                  <div className="font-display text-lg" style={{ fontWeight: 400 }}>
                    {pub.podcast.description ?? 'Audio companion'}
                  </div>
                  <div className="text-xs opacity-60 mt-1">
                    {pub.podcast.duration ?? ''} {playing ? '· Playing' : ''}
                  </div>
                </div>
              </div>
              <audio ref={audioRef} src={pub.podcast.path} preload="none" />
            </div>
          )}

          {pub.abstract && (
            <div className="mb-8">
              <div className="font-mono text-xs uppercase tracking-widest text-muted mb-3">Abstract</div>
              <p className="leading-relaxed" style={{ opacity: 0.85 }}>
                {pub.abstract}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 mb-8">
            {pub.pdf?.available && pub.pdf.path && (
              <a
                href={pub.pdf.path}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm"
                style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-bg)' }}
                download
              >
                <FileDown size={14} /> Download PDF
              </a>
            )}
            {pub.doi && (
              <a
                href={`https://doi.org/${pub.doi}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm border hover:opacity-80 transition-opacity"
                style={{ borderColor: 'var(--divider)' }}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ArrowUpRight size={14} /> DOI
              </a>
            )}
            {pub.url && (
              <a
                href={pub.url}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm border hover:opacity-80 transition-opacity"
                style={{ borderColor: 'var(--divider)' }}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ArrowUpRight size={14} /> View publisher
              </a>
            )}
          </div>

          <CitationPanel
            format={format}
            onChangeFormat={setFormat}
            activeCitation={activeCitation}
            copied={copied}
            onCopy={() => onCopy(activeCitation)}
          />

          {related.length > 0 && (
            <div className="mt-8">
              <div className="font-mono text-xs uppercase tracking-widest text-muted mb-3">
                Related work
              </div>
              <div>
                {related.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelect(p)}
                    className="block w-full text-left py-3 border-t hover:opacity-60 transition-opacity"
                    style={{ borderColor: 'var(--divider)' }}
                  >
                    <div className="font-mono text-xs text-soft">{p.year}</div>
                    <div className="font-display text-base" style={{ fontWeight: 400 }}>
                      {p.title}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

const CITATION_FORMAT_LABELS: Record<CitationFormat, string> = {
  apa: 'APA 7',
  mla: 'MLA 9',
  chicago: 'Chicago',
  bibtex: 'BibTeX',
};
const CITATION_FORMAT_ORDER: CitationFormat[] = ['apa', 'mla', 'chicago', 'bibtex'];

function CitationPanel({
  format,
  onChangeFormat,
  activeCitation,
  copied,
  onCopy,
}: {
  format: CitationFormat;
  onChangeFormat: (f: CitationFormat) => void;
  activeCitation: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-1">
          {CITATION_FORMAT_ORDER.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onChangeFormat(f)}
              className="px-3 py-1 text-[11px] font-mono uppercase tracking-wider rounded-full transition-all"
              style={
                format === f
                  ? { backgroundColor: 'var(--text)', color: 'var(--surface)' }
                  : { color: 'var(--text-muted)', opacity: 0.6 }
              }
            >
              {CITATION_FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border transition-colors"
          style={{ borderColor: 'var(--divider)' }}
        >
          {copied ? <Check size={12} /> : <Quote size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {format === 'bibtex' ? (
        <pre
          className="font-mono text-xs p-4 rounded-lg overflow-x-auto leading-relaxed"
          style={{ backgroundColor: 'rgba(26,22,18,0.06)' }}
        >
          {activeCitation}
        </pre>
      ) : (
        <p
          className="text-sm leading-relaxed p-4 rounded-lg"
          style={{ backgroundColor: 'rgba(26,22,18,0.06)' }}
        >
          {splitMarkdownItalics(activeCitation).map((part, i) =>
            part.italic ? (
              <em key={i}>{part.text}</em>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </p>
      )}
    </div>
  );
}
