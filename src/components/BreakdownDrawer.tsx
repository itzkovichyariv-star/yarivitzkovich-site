import { useEffect, useMemo, useRef, useState } from 'react';
import { ARC_COLORS } from '../lib/globePalette';

interface DetailEvent {
  id: number;
  ts: number;
  kind: 'visit' | 'download';
  visitor_class: 'first_time' | 'returning' | 'downloader';
  paper_slug: string | null;
  paper_title: string | null;
  page_path: string | null;
  country: string | null;
  country_name: string | null;
  continent: string | null;
  continent_name: string | null;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  ua_class: string | null;
  is_bot: number;
}

interface Counts {
  firstTime: number;
  returning: number;
  downloads: number;
  bots: number;
}

interface PaperOption {
  slug: string;
  title: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Publications list used to resolve paper titles when an event row was
      written before P1 paper-title lookup, or to render a citation under
      first-time visits triggered by a PDF deep-link. */
  papers: PaperOption[];
  /** 'modal' (default) renders the dimmed full-screen overlay with a
      close button — the in-place owner inspector on /live. 'inline'
      renders just the panel content so it can be embedded as page
      content under /manage/events. */
  mode?: 'modal' | 'inline';
}

type RangeKey = '24h' | '7d' | '30d' | '90d' | '1y' | 'all';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: '24h', label: 'Day' },
  { key: '7d', label: 'Week' },
  { key: '30d', label: 'Month' },
  { key: '90d', label: 'Quarter' },
  { key: '1y', label: 'Year' },
  { key: 'all', label: 'All time' },
];

// Visits-aggregate color (matches the GlobeHUD "visits" pill).
const VISITS_COLOR = '#9DB3BE';

// Time-series bucketing. Given an event list and a range, returns 4
// parallel arrays bucketed into N intervals from start to now. Bucket
// granularity scales with the range: hourly for 24h, daily for 7d/30d,
// weekly for 90d, monthly for 1y/all. This keeps each chart to ~10-30
// data points regardless of the time window — small enough to render
// as a clean SVG sparkline, dense enough to show real movement.
function bucketEvents(
  events: DetailEvent[],
  range: RangeKey,
): {
  buckets: number;
  bucketLabel: string;
  series: { visits: number[]; firstTime: number[]; returning: number[]; downloads: number[] };
} {
  const endSec = Math.floor(Date.now() / 1000);

  let buckets = 7;
  let sizeSec = 86400;
  let label = 'day';

  if (range === '24h') { buckets = 24; sizeSec = 3600; label = 'hour'; }
  else if (range === '7d') { buckets = 7; sizeSec = 86400; label = 'day'; }
  else if (range === '30d') { buckets = 30; sizeSec = 86400; label = 'day'; }
  else if (range === '90d') { buckets = 13; sizeSec = 7 * 86400; label = 'week'; }
  else if (range === '1y') { buckets = 12; sizeSec = Math.floor(365 * 86400 / 12); label = 'month'; }
  else if (range === 'all') {
    // Fit to data span — 12 buckets between earliest event and now.
    const minTs = events.reduce((m, e) => Math.min(m, e.ts), endSec);
    const span = Math.max(86400, endSec - minTs);
    buckets = 12;
    sizeSec = Math.ceil(span / buckets);
    label = sizeSec >= 30 * 86400 ? 'month' : sizeSec >= 7 * 86400 ? 'week' : 'day';
  }

  const startSec = endSec - buckets * sizeSec;
  const visits = Array<number>(buckets).fill(0);
  const firstTime = Array<number>(buckets).fill(0);
  const returning = Array<number>(buckets).fill(0);
  const downloads = Array<number>(buckets).fill(0);

  for (const e of events) {
    if (e.is_bot) continue;
    if (e.ts < startSec) continue;
    let idx = Math.floor((e.ts - startSec) / sizeSec);
    if (idx < 0) continue;
    if (idx >= buckets) idx = buckets - 1;
    if (e.kind === 'download') {
      downloads[idx]++;
    } else {
      visits[idx]++;
      if (e.visitor_class === 'returning') returning[idx]++;
      else firstTime[idx]++;
    }
  }

  return { buckets, bucketLabel: label, series: { visits, firstTime, returning, downloads } };
}

// Same colors as the legend in LiveGlobe — keeps the drawer visually
// tied to the arcs on the globe. (Single source of truth in globePalette.)
const CLASS_COLORS = ARC_COLORS;

export default function BreakdownDrawer({ open, onClose, papers, mode = 'modal' }: Props) {
  // Inline mode: the component always behaves as if it's open — there's
  // no close action, since the page itself is the container.
  const isInline = mode === 'inline';
  const isOpen = isInline ? true : open;
  const [range, setRange] = useState<RangeKey>('7d');
  const [events, setEvents] = useState<DetailEvent[]>([]);
  const [counts, setCounts] = useState<Counts>({ firstTime: 0, returning: 0, downloads: 0, bots: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [rangeB, setRangeB] = useState<RangeKey>('30d');
  const [eventsB, setEventsB] = useState<DetailEvent[]>([]);
  const [loadingB, setLoadingB] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch events when the drawer opens or the range changes — and re-poll
  // every 30 seconds while open so the breakdown reflects live activity
  // without requiring the owner to close + reopen the drawer.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = (showSpinner: boolean) => {
      if (showSpinner) {
        setLoading(true);
        setError(null);
      }
      fetch(`/live/details?range=${range}`, { credentials: 'same-origin' })
        .then((r) => {
          if (r.status === 401) throw new Error('unauthorized');
          if (!r.ok) throw new Error(`http_${r.status}`);
          return r.json();
        })
        .then((data) => {
          if (cancelled) return;
          setEvents(data.events || []);
          setCounts(data.counts || { firstTime: 0, returning: 0, downloads: 0, bots: 0 });
          setError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          if (showSpinner) setError(String(e?.message || 'failed'));
        })
        .finally(() => {
          if (!cancelled && showSpinner) setLoading(false);
        });
    };

    load(true);
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      load(false);
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isOpen, range]);

  // Fetch comparison-panel events whenever compare mode is on or rangeB changes.
  useEffect(() => {
    if (!isOpen || !compareMode) return;
    let cancelled = false;

    const loadB = (showSpinner: boolean) => {
      if (showSpinner) setLoadingB(true);
      fetch(`/live/details?range=${rangeB}`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setEventsB(data.events || []);
        })
        .catch(() => {})
        .finally(() => { if (!cancelled && showSpinner) setLoadingB(false); });
    };

    loadB(true);
    const id = window.setInterval(() => {
      if (!document.hidden) loadB(false);
    }, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [isOpen, compareMode, rangeB]);

  // ESC dismissal — only relevant in modal mode.
  useEffect(() => {
    if (!isOpen || isInline) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, isInline, onClose]);

  // Group + filter events by class — bots filtered out of the visible columns
  const groups = useMemo(() => {
    const fresh: DetailEvent[] = [];
    const ret: DetailEvent[] = [];
    const dl: DetailEvent[] = [];
    for (const e of events) {
      if (e.is_bot) continue;
      if (e.kind === 'download') dl.push(e);
      else if (e.visitor_class === 'returning') ret.push(e);
      else fresh.push(e);
    }
    return { fresh, ret, dl };
  }, [events]);

  // While the drawer is open, attach a body class. The CSS in
  // live.astro uses that class to hide the globe's HTML labels and
  // canvas — they bleed through the drawer's translucent overlay
  // because globe.gl mounts them in a stacking context that isn't
  // covered by a plain z-index on this component.
  useEffect(() => {
    if (!isOpen || isInline) return;
    document.body.classList.add('breakdown-open');
    return () => document.body.classList.remove('breakdown-open');
  }, [isOpen, isInline]);

  if (!isOpen) return null;

  // Inline mode: render the panel as plain page content (no overlay,
  // no fixed positioning, no close button) so it can be embedded under
  // /manage/events. Modal mode keeps its dimmed-backdrop behaviour.
  const InlineWrapper = ({ children }: { children: React.ReactNode }) => (
    <div ref={panelRef} className="w-full" style={{ color: 'var(--text)' }}>
      {children}
    </div>
  );
  const ModalWrapper = ({ children }: { children: React.ReactNode }) => (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        background: 'color-mix(in srgb, var(--surface) 78%, transparent)',
        animation: 'breakdownFadeIn 220ms ease-out',
      }}
      role="dialog"
      aria-label="Activity details"
    >
      <div
        ref={panelRef}
        className="mx-auto my-6 w-full max-w-6xl px-6 md:px-10 py-8 overflow-y-auto rounded-lg md:rounded-xl"
        style={{
          background:
            'linear-gradient(140deg, var(--surface), color-mix(in srgb, var(--surface) 92%, var(--text) 4%))',
          border: '1px solid color-mix(in srgb, var(--text) 14%, transparent)',
          color: 'var(--text)',
          maxHeight: 'calc(100dvh - 3rem)',
          boxShadow:
            '0 18px 48px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
          animation: 'breakdownPanelIn 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  const Wrapper = isInline ? InlineWrapper : (
    ({ children }: { children: React.ReactNode }) => <ModalWrapper>{children}</ModalWrapper>
  );

  // The panel's inner content. Shared between modal and inline modes.
  const panelInner = (
    <>
        {/* Header: time-range tabs + close button */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap font-mono text-xs uppercase tracking-widest">
            {!compareMode && (
              <>
                <span className="opacity-35" style={{ cursor: 'default', userSelect: 'none' }}>Range ·</span>
                {RANGE_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRange(key)}
                    className="hover:opacity-100 transition-opacity"
                    style={{
                      opacity: range === key ? 1 : 0.55,
                      borderBottom: range === key ? '1px solid currentColor' : '1px solid transparent',
                      paddingBottom: '2px',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
            {loading && <span className="opacity-50">Loading…</span>}
            {error === 'unauthorized' && <span className="opacity-70">Sign in as owner first.</span>}
            {error && error !== 'unauthorized' && <span className="opacity-70">Couldn't load.</span>}
            <button
              type="button"
              onClick={() => setCompareMode((v) => {
                if (v) setEventsB([]);
                return !v;
              })}
              className="hover:opacity-100 transition-opacity"
              style={{
                opacity: compareMode ? 1 : 0.45,
                borderBottom: compareMode ? '1px solid currentColor' : '1px solid transparent',
                paddingBottom: '2px',
                marginLeft: compareMode ? undefined : '0.5rem',
              }}
            >
              Compare
            </button>
          </div>

          {!isInline && (
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-xs uppercase tracking-widest opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Close drawer"
            >
              ✕ Close
            </button>
          )}
        </div>

        {/* Growth-over-time sparklines — single view or side-by-side compare */}
        {compareMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-2">
            <ComparePanel label="A" events={events} range={range} onRangeChange={setRange} loading={loading} />
            <ComparePanel label="B" events={eventsB} range={rangeB} onRangeChange={setRangeB} loading={loadingB} />
          </div>
        ) : (
          <GrowthCharts events={events} range={range} />
        )}

        {/* Three columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Column
            title="First-time visits"
            count={counts.firstTime}
            color={CLASS_COLORS.first_time}
            events={groups.fresh}
            papers={papers}
          />
          <Column
            title="Returning visits"
            count={counts.returning}
            color={CLASS_COLORS.returning}
            events={groups.ret}
            papers={papers}
          />
          <Column
            title="Downloads"
            count={counts.downloads}
            color={CLASS_COLORS.download}
            events={groups.dl}
            papers={papers}
          />
        </div>

        {counts.bots > 0 && (
          <div className="mt-6 font-mono text-[10px] uppercase tracking-widest opacity-50">
            {counts.bots} bot {counts.bots === 1 ? 'event' : 'events'} excluded
          </div>
        )}
    </>
  );

  return <Wrapper>{panelInner}</Wrapper>;
}

function Column({
  title,
  count,
  color,
  events,
  papers,
}: {
  title: string;
  count: number;
  color: string;
  events: DetailEvent[];
  papers: PaperOption[];
}) {
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3">
        <span
          className="inline-block"
          style={{ width: '12px', height: '12px', borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }}
        />
        <h3 className="font-mono text-xs uppercase tracking-widest" style={{ color }}>
          {title}
        </h3>
        <span className="font-mono text-xs opacity-60" style={{ fontVariantNumeric: 'tabular-nums' }}>
          ({count})
        </span>
      </div>
      <div
        className="border-t border-current border-opacity-10 pt-2"
        style={{ borderColor: 'color-mix(in srgb, var(--text) 12%, transparent)' }}
      >
        {events.length === 0 && (
          <p className="font-mono text-xs opacity-40 py-3">No events in range.</p>
        )}
        {events.map((e) => (
          <EventRow key={e.id} event={e} papers={papers} />
        ))}
      </div>
    </div>
  );
}

function EventRow({ event, papers }: { event: DetailEvent; papers: PaperOption[] }) {
  const place = [event.city, event.country_name].filter(Boolean).join(', ');
  const continent = event.continent_name;
  const isDownload = event.kind === 'download';

  // Paper citation only renders under DOWNLOAD rows — a visit is just
  // an entry to the site (the paper context belongs to its download).
  // Resolve via the publications list so early download events whose
  // paper_title was null still render their title here.
  const downloadTitle = isDownload
    ? event.paper_title ||
      (event.paper_slug ? papers.find((p) => p.slug === event.paper_slug)?.title : null)
    : null;

  // For visits, show page_path so we know what they hit — but hide the
  // /pdfs/<slug>.pdf paths that come from synthesized first-time visits,
  // since those are an internal artifact (the matching download row in
  // the next column already carries the paper info).
  const showPagePath =
    !isDownload && event.page_path && !event.page_path.startsWith('/pdfs/');

  return (
    <div className="py-3 border-b border-current border-opacity-5" style={{ borderColor: 'color-mix(in srgb, var(--text) 8%, transparent)' }}>
      <div className="font-display text-sm leading-tight">{place || 'Unknown'}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest opacity-55 mt-1">
        {continent && <>{continent} · </>}
        {timeAgo(event.ts)}
      </div>
      {isDownload && downloadTitle && event.paper_slug && (
        <a
          href={`/publications/${event.paper_slug}`}
          className="block mt-1 font-display text-xs italic underline opacity-80 hover:opacity-100"
        >
          {truncate(downloadTitle, 80)}
        </a>
      )}
      {showPagePath && event.page_path && (
        <div className="mt-1 font-mono text-[11px] opacity-65">{event.page_path}</div>
      )}
    </div>
  );
}

function timeAgo(unix: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unix));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  // After 24 hours, "5 d ago" / "2 mo ago" / "1 y ago" carry less
  // information than the actual date. Switch to a calendar date —
  // omit the year when the event is in the current year.
  const date = new Date(unix * 1000);
  const now = new Date();
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function ComparePanel({
  label,
  events,
  range,
  onRangeChange,
  loading,
}: {
  label: string;
  events: DetailEvent[];
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  loading?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap font-mono text-[10px] uppercase tracking-widest mb-3">
        <span className="opacity-35" style={{ userSelect: 'none' }}>{label} ·</span>
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onRangeChange(opt.key)}
            className="hover:opacity-100 transition-opacity"
            style={{
              opacity: range === opt.key ? 1 : 0.45,
              borderBottom: range === opt.key ? '1px solid currentColor' : '1px solid transparent',
              paddingBottom: '2px',
            }}
          >
            {opt.label}
          </button>
        ))}
        {loading && <span className="opacity-40">Loading…</span>}
      </div>
      <GrowthCharts events={events} range={range} compact />
    </div>
  );
}

// Growth-over-time sparkline cards. Sits above the 3-column event lists
// and shows the four primary metrics — visits (firstTime + returning),
// first-time, returning, and downloads — bucketed across the selected
// range. Pure client-side: re-buckets the event list we already fetched
// for the row breakdowns, so no extra API call.
function GrowthCharts({ events, range, compact }: { events: DetailEvent[]; range: RangeKey; compact?: boolean }) {
  const { bucketLabel, series } = useMemo(() => bucketEvents(events, range), [events, range]);

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const cards = [
    { label: 'Visits',     total: sum(series.visits),    data: series.visits,    color: VISITS_COLOR },
    { label: 'First-time', total: sum(series.firstTime), data: series.firstTime, color: CLASS_COLORS.first_time },
    { label: 'Returning',  total: sum(series.returning), data: series.returning, color: CLASS_COLORS.returning },
    { label: 'Downloads',  total: sum(series.downloads), data: series.downloads, color: CLASS_COLORS.download },
  ];

  return (
    <div className={compact ? '' : 'mb-8'}>
      <div className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-3">
        Growth · per {bucketLabel}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
        {cards.map((c) => (
          <div key={c.label}>
            <div className="flex items-baseline gap-2 mb-1">
              <span
                aria-hidden="true"
                className="inline-block"
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: c.color,
                  boxShadow: `0 0 4px ${c.color}`,
                  alignSelf: 'center',
                }}
              />
              <span className="font-mono text-[11px] uppercase tracking-widest opacity-70">{c.label}</span>
            </div>
            <div
              className="font-display"
              style={{ fontSize: '2rem', fontWeight: 350, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
            >
              {c.total.toLocaleString()}
            </div>
            <div className="mt-2">
              <Sparkline data={c.data} color={c.color} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Minimal SVG sparkline. No library, no axes — just a single path showing
// the bucketed metric over time, with the final point highlighted so the
// "now" position reads at-a-glance. ScalesY by max within the data so
// each metric uses its own dynamic range (a 0-3 returning chart and a
// 0-30 first-time chart both fill the same visual envelope).
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const width = 160;
  const height = 38;
  if (data.length === 0) return null;
  const max = Math.max(1, ...data);
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const pts = data.map((v, i) => {
    const x = data.length > 1 ? i * stepX : width / 2;
    const y = height - (v / max) * (height - 4) - 2;
    return [x, y] as const;
  });
  const path = `M ${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ')}`;
  const areaPath = `${path} L ${pts[pts.length - 1][0].toFixed(1)},${height} L ${pts[0][0].toFixed(1)},${height} Z`;
  const [lastX, lastY] = pts[pts.length - 1];
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ overflow: 'visible', display: 'block' }}
      aria-hidden="true"
    >
      <path d={areaPath} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
}
